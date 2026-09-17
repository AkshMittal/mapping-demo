"""Turn the raw viewshed stack into the mask PNGs the page shows.

Each sample's mask is the plain union (OR) of the viewsheds from the samples
around it: HALF_WINDOW before, itself, HALF_WINDOW after. A single point is
prone to one-off obstructions; the union shows the view around that stretch.

PNG: not visible = opaque black, visible = transparent. The page dims the map
with pane opacity, so the PNG itself carries no alpha level.

Input:  data/<route>/vs_stack.npy, vs_meta.json   (from compute_viewsheds.py)
Output: public/viewshed/<route>/vs_XXXX.png + manifest.json
"""
import json
import sys

import numpy as np
from osgeo import gdal

from pyproj import Transformer

from common import OUT_DIR, VS_META, VS_STACK, read_gpx_points, smooth

gdal.UseExceptions()

HALF_WINDOW = 3   # samples either side (3 × 150 m ≈ ±450 m)
FEATHER = 2       # box-blur radius in cells (~35 m each), applied twice ≈ soft gaussian edge
HOLE_INSET = 2    # cells the outer dim polygon overlaps the PNG, hides the edge seam


def box_blur(a, r):
    """Separable box blur with edge padding."""
    k = 2 * r + 1
    for axis in (0, 1):
        pad = [(0, 0), (0, 0)]
        pad[axis] = (r + 1, r)
        c = np.cumsum(np.pad(a, pad, mode="edge"), axis=axis)
        a = (np.take(c, range(k, c.shape[axis]), axis=axis)
             - np.take(c, range(0, c.shape[axis] - k), axis=axis)) / k
    return a


def feather(visible):
    soft = visible.astype(np.float32)
    for _ in range(2):
        soft = box_blur(soft, FEATHER)
    return soft


def write_mask_png(lit, out_path):
    """lit: 0..1 float, 1 = fully visible (transparent)."""
    h, w = lit.shape
    mem = gdal.GetDriverByName("MEM").Create("", w, h, 4, gdal.GDT_Byte)
    for b in (1, 2, 3):
        mem.GetRasterBand(b).WriteArray(np.zeros((h, w), dtype=np.uint8))
    # 16 alpha levels: no visible banding at this blur, compresses far better than 256
    alpha = np.round((1 - lit) * 15) * 17
    mem.GetRasterBand(4).WriteArray(alpha.astype(np.uint8))
    gdal.GetDriverByName("PNG").CreateCopy(str(out_path), mem, options=["ZLEVEL=9"])


class Grid:
    """Row/col <-> lat/lon for the shared Web Mercator grid (linear in 3857)."""

    def __init__(self, bounds, shape):
        (s, w), (n, e) = bounds
        self.to_m = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
        self.to_ll = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)
        self.x0, self.y0 = self.to_m.transform(w, s)
        self.x1, self.y1 = self.to_m.transform(e, n)
        self.rows, self.cols = shape

    def cell_centres_m(self):
        """Web Mercator x (per col) and y (per row) of cell centres."""
        xs = self.x0 + (self.x1 - self.x0) * (np.arange(self.cols) + 0.5) / self.cols
        ys = self.y1 - (self.y1 - self.y0) * (np.arange(self.rows) + 0.5) / self.rows
        return xs, ys

    def latlng(self, row, col):
        x = self.x0 + (self.x1 - self.x0) * col / self.cols
        y = self.y1 - (self.y1 - self.y0) * row / self.rows
        lon, lat = self.to_ll.transform(x, y)
        return [lat, lon]

    def bounds(self, r0, c0, r1, c1):
        """[[south, west], [north, east]] of the cell range [r0, r1) × [c0, c1)."""
        s, w = self.latlng(r1, c0)
        n, e = self.latlng(r0, c1)
        return [[s, w], [n, e]]


def main():
    if not VS_STACK.exists():
        sys.exit(f"missing {VS_STACK} - run compute_viewsheds.py first")

    stack = np.load(VS_STACK)
    meta = json.loads(VS_META.read_text())
    count = len(stack)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("vs_*.png"):
        old.unlink()

    grid = Grid(meta["bounds"], stack.shape[1:])
    ever_lit = np.zeros(stack.shape[1:], dtype=bool)

    route = smooth(read_gpx_points())
    cell_x, cell_y = grid.cell_centres_m()

    samples = []
    for n in range(count):
        lo, hi = max(0, n - HALF_WINDOW), min(count, n + HALF_WINDOW + 1)
        union = stack[lo:hi].any(axis=0)
        ever_lit |= union
        name = f"vs_{n:04d}.png"
        write_mask_png(feather(union), OUT_DIR / name)

        # farthest lit cell from this sample's point (what the page shows)
        idx = meta["indices"][n]
        lat, lon = route[idx]
        ox, oy = grid.to_m.transform(lon, lat)
        rows, cols = np.nonzero(union)
        scale = np.cos(np.radians(lat))  # mercator metres -> ground metres
        far_km = 0.0
        if rows.size:
            far_km = float(np.hypot(cell_x[cols] - ox, cell_y[rows] - oy).max() * scale / 1000)

        samples.append({"index": idx, "file": name, "farKm": round(far_km, 1)})

    # one-time extent of everything that is ever lit, for the initial map view
    rows = np.flatnonzero(ever_lit.any(axis=1))
    cols = np.flatnonzero(ever_lit.any(axis=0))
    view_bounds = grid.bounds(rows[0], cols[0], rows[-1] + 1, cols[-1] + 1)

    r, c = grid.rows, grid.cols
    hole_bounds = grid.bounds(HOLE_INSET, HOLE_INSET, r - HOLE_INSET, c - HOLE_INSET)

    (OUT_DIR / "manifest.json").write_text(json.dumps({
        "bounds": meta["bounds"],
        "holeBounds": hole_bounds,
        "viewBounds": view_bounds,
        "spacingM": meta["spacingM"],
        "halfWindow": HALF_WINDOW,
        "samples": samples,
    }, indent=1))
    print(f"wrote {count} masks (±{HALF_WINDOW} union, feather {FEATHER}) to {OUT_DIR}")
    print(f"view bounds {view_bounds}")


if __name__ == "__main__":
    main()
