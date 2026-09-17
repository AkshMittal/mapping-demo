"""Download Copernicus GLO-30 DEM for the route bbox (+buffer) and reproject to UTM.

Bbox = the source GPX's extent in UTM, padded by BUFFER_KM metres-wise on every
side (same approach as the reference notebook), then converted to lat/lon.
Output: data/<route>/dem_utm.tif
"""
import planetary_computer
import pystac_client
import rioxarray
from pyproj import Transformer
from rioxarray.merge import merge_arrays

from common import BUFFER_KM, DATA_DIR, DEM_UTM, SOURCE_GPX, UTM_CRS, read_gpx_points


def route_bbox(buffer_km=BUFFER_KM):
    pts = read_gpx_points(SOURCE_GPX)
    to_utm = Transformer.from_crs("EPSG:4326", UTM_CRS, always_xy=True)
    xs, ys = to_utm.transform([p[1] for p in pts], [p[0] for p in pts])
    b = buffer_km * 1000
    to_ll = Transformer.from_crs(UTM_CRS, "EPSG:4326", always_xy=True)
    lon_min, lat_min = to_ll.transform(min(xs) - b, min(ys) - b)
    lon_max, lat_max = to_ll.transform(max(xs) + b, max(ys) + b)
    return lon_min, lat_min, lon_max, lat_max


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    lon_min, lat_min, lon_max, lat_max = route_bbox()
    print(f"bbox lon {lon_min:.4f}..{lon_max:.4f}  lat {lat_min:.4f}..{lat_max:.4f}")

    catalog = pystac_client.Client.open(
        "https://planetarycomputer.microsoft.com/api/stac/v1",
        modifier=planetary_computer.sign_inplace,
    )
    search = catalog.search(
        collections=["cop-dem-glo-30"],
        bbox=[lon_min, lat_min, lon_max, lat_max],
    )
    items = list(search.items())
    print(f"found {len(items)} tiles")

    tiles = [rioxarray.open_rasterio(item.assets["data"].href).squeeze() for item in items]
    dem = merge_arrays(tiles) if len(tiles) > 1 else tiles[0]
    dem = dem.rio.clip_box(minx=lon_min, miny=lat_min, maxx=lon_max, maxy=lat_max)

    dem_utm = dem.rio.reproject(UTM_CRS, resampling=1)  # 1 = bilinear
    dem_utm.rio.to_raster(DEM_UTM)
    print(f"wrote {DEM_UTM}  shape={dem_utm.shape}  res={dem_utm.rio.resolution()}")


if __name__ == "__main__":
    main()
