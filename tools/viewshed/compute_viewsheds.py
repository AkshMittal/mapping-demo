"""Compute one plain "visible-from-here" viewshed per sample point along the route.

This is the slow step. It runs gdal_viewshed once per sample and stores the raw
results, so styling (render_masks.py) can be re-tuned without re-running it.

Pipeline per sample (same gdal_viewshed call as the reference notebook):
  UTM DEM --gdal_viewshed--> binary tif (UTM) --gdalwarp--> Web Mercator on a fixed grid

Every sample shares the same grid, so one bounds value covers all of them.

Output (data/<route>/, gitignored):
  vs_stack.npy   bool array [samples, rows, cols], True = visible
  vs_meta.json   {bounds, spacingM, indices}
"""
import json
import subprocess
import sys

import numpy as np
from osgeo import gdal
from pyproj import Transformer

from common import (DATA_DIR, DEM_UTM, UTM_CRS, VS_META, VS_STACK,
                    haversine_km, read_gpx_points, smooth)

gdal.UseExceptions()

SPACING_M = 150        # distance between samples along the route
OBSERVER_HEIGHT = 1.7  # metres above ground
CURVATURE = 0.85714    # standard atmospheric refraction
MERC_RES = 35          # metres per pixel in EPSG:3857 (~30 m ground at this latitude)

VS_TMP = DATA_DIR / "vs_tmp.tif"


def sample_indices(route, spacing_m=SPACING_M):
    """Indices into the smoothed route roughly every spacing_m, always incl. first and last."""
    picked = [0]
    since = 0.0
    for i in range(1, len(route)):
        since += haversine_km(*route[i - 1], *route[i]) * 1000
        if since >= spacing_m:
            picked.append(i)
            since = 0.0
    if picked[-1] != len(route) - 1:
        picked.append(len(route) - 1)
    return picked


def mercator_grid():
    """Fixed EPSG:3857 extent covering the DEM, snapped to MERC_RES."""
    info = gdal.Warp("", str(DEM_UTM), format="VRT", dstSRS="EPSG:3857")
    gt = info.GetGeoTransform()
    minx, maxy = gt[0], gt[3]
    maxx = minx + gt[1] * info.RasterXSize
    miny = maxy + gt[5] * info.RasterYSize
    snap = lambda v, f: f(v / MERC_RES) * MERC_RES
    return (snap(minx, np.floor), snap(miny, np.floor), snap(maxx, np.ceil), snap(maxy, np.ceil))


def warp_to_grid(src, extent, **kwargs):
    # keep the dataset referenced while reading, or GDAL frees it under the band
    ds = gdal.Warp(
        "", str(src), format="MEM",
        dstSRS="EPSG:3857",
        outputBounds=extent,
        xRes=MERC_RES, yRes=MERC_RES,
        resampleAlg="near",
        **kwargs,
    )
    return ds.GetRasterBand(1).ReadAsArray()


def run_viewshed(ox, oy):
    cmd = [
        "gdal_viewshed",
        "-ox", str(ox), "-oy", str(oy),
        "-oz", str(OBSERVER_HEIGHT),
        "-cc", str(CURVATURE),
        "-om", "NORMAL",
        str(DEM_UTM), str(VS_TMP),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr)


def main():
    if not DEM_UTM.exists():
        sys.exit(f"missing {DEM_UTM} - run fetch_dem.py first")

    route = smooth(read_gpx_points())
    indices = sample_indices(route)
    print(f"{len(route)} route points -> {len(indices)} samples @ {SPACING_M} m")

    to_utm = Transformer.from_crs("EPSG:4326", UTM_CRS, always_xy=True)
    extent = mercator_grid()
    to_ll = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)
    west, south = to_ll.transform(extent[0], extent[1])
    east, north = to_ll.transform(extent[2], extent[3])

    # The UTM DEM's reprojected corners are NaN, and gdal_viewshed reports
    # those cells as visible, so only trust cells where the DEM has data.
    valid = np.isfinite(warp_to_grid(DEM_UTM, extent))

    stack = np.zeros((len(indices), *valid.shape), dtype=bool)
    for n, idx in enumerate(indices):
        lat, lon = route[idx]
        run_viewshed(*to_utm.transform(lon, lat))
        stack[n] = (warp_to_grid(VS_TMP, extent, dstNodata=0) == 255) & valid
        if n % 10 == 0:
            print(f"  {n + 1}/{len(indices)}  index={idx}")

    VS_TMP.unlink(missing_ok=True)
    np.save(VS_STACK, stack)
    VS_META.write_text(json.dumps({
        "bounds": [[south, west], [north, east]],
        "spacingM": SPACING_M,
        "indices": indices,
    }))
    print(f"wrote {VS_STACK} {stack.shape}")


if __name__ == "__main__":
    main()
