"""One-time route prep: source GPX -> densified track with DEM elevations.

1. Densify: wherever two recorded points are more than STEP_M apart, insert
   evenly spaced points on the straight line between them. Sparse recordings
   (~50 m apart) otherwise give a coarse line, hover and playback.
2. Elevation: every point's <ele> is the DEM value there (bilinear). Recorded
   elevations are noisy/offset, which throws off ascent and slope.

Input:  public/routes/<route>/<source>.gpx  (kept untouched)
Output: public/routes/<route>/<route>.gpx   (what the app and viewsheds use)

Changing the output changes point indices, so re-run compute_viewsheds.py after.
"""
import math

import numpy as np
import rasterio
from pyproj import Transformer

from common import DEM_UTM, GPX_PATH, ROUTE, SOURCE_GPX, UTM_CRS, haversine_km, read_gpx_points

STEP_M = 10


def densify(points, step_m=STEP_M):
    out = [points[0][:2]]
    for (lat0, lon0, _), (lat1, lon1, _) in zip(points, points[1:]):
        d = haversine_km(lat0, lon0, lat1, lon1) * 1000
        n = max(1, math.ceil(d / step_m))
        for k in range(1, n + 1):
            t = k / n
            out.append((lat0 + (lat1 - lat0) * t, lon0 + (lon1 - lon0) * t))
    return out


def bilinear(dem, transform, xs, ys):
    cols, rows = ~transform * (np.asarray(xs), np.asarray(ys))
    cols -= 0.5  # pixel centres
    rows -= 0.5
    c0 = np.floor(cols).astype(int)
    r0 = np.floor(rows).astype(int)
    fc, fr = cols - c0, rows - r0
    return (dem[r0, c0] * (1 - fc) * (1 - fr) + dem[r0, c0 + 1] * fc * (1 - fr)
            + dem[r0 + 1, c0] * (1 - fc) * fr + dem[r0 + 1, c0 + 1] * fc * fr)


def main():
    src = read_gpx_points(SOURCE_GPX)
    pts = densify(src)

    to_utm = Transformer.from_crs("EPSG:4326", UTM_CRS, always_xy=True)
    xs, ys = to_utm.transform([p[1] for p in pts], [p[0] for p in pts])
    with rasterio.open(DEM_UTM) as d:
        ele = bilinear(d.read(1), d.transform, xs, ys)
    if np.isnan(ele).any():
        raise SystemExit("DEM has no data under some route points")

    trkpts = "".join(
        f'<trkpt lat="{lat:.6f}" lon="{lon:.6f}"><ele>{z:.1f}</ele></trkpt>'
        for (lat, lon), z in zip(pts, ele)
    )
    GPX_PATH.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<gpx version="1.1" creator="mapping-demo prepare_route.py" '
        'xmlns="http://www.topografix.com/GPX/1/1">'
        f'<trk><name>{ROUTE}</name><trkseg>{trkpts}</trkseg></trk></gpx>',
        encoding="utf-8",
    )

    recorded = np.array([p[2] for p in src])
    src_xs, src_ys = to_utm.transform([p[1] for p in src], [p[0] for p in src])
    with rasterio.open(DEM_UTM) as d:
        at_src = bilinear(d.read(1), d.transform, src_xs, src_ys)
    diff = at_src - recorded
    print(f"{len(src)} recorded points -> {len(pts)} points (step {STEP_M} m)")
    print(f"DEM - recorded at source points: mean {diff.mean():+.1f} m, max |diff| {np.abs(diff).max():.1f} m")
    print(f"elevation {ele.min():.0f}..{ele.max():.0f} m -> wrote {GPX_PATH}")


if __name__ == "__main__":
    main()
