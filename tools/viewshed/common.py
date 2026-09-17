"""Shared helpers: route config/paths, GPX parsing, and the same smoothing the frontend uses.

The frontend (src/js/gpx-engine.js) smooths the GPX with a moving average but
keeps one output point per input point. Reproducing that here means a sample's
index is the same index the frontend playback uses.

Pick the route with the VIEWSHED_ROUTE env var (default below). Keep it in sync
with src/js/route-config.js.
"""
import math
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

ROUTES = {
    "hampta-pass": {
        "source": "hampta_pass.orig.gpx",  # as recorded
        "gpx": "hampta_pass.gpx",          # prepared (densified + DEM elevations), used by the app
        "buffer_km": 10,
        "utm": "EPSG:32643",
    },
    "patalsu": {
        "source": "patalsu.source.gpx",    # ascent only, trailhead -> summit
        "gpx": "patalsu.gpx",
        "buffer_km": 20,                   # as in the reference notebook; reaches Deo Tibba
        "utm": "EPSG:32643",
    },
}

ROUTE = os.environ.get("VIEWSHED_ROUTE", "patalsu")
CONFIG = ROUTES[ROUTE]

ROUTE_DIR = ROOT / "public" / "routes" / ROUTE
SOURCE_GPX = ROUTE_DIR / CONFIG["source"]
GPX_PATH = ROUTE_DIR / CONFIG["gpx"]
BUFFER_KM = CONFIG["buffer_km"]
UTM_CRS = CONFIG["utm"]

DATA_DIR = ROOT / "data" / ROUTE                      # DEM + intermediates (gitignored)
OUT_DIR = ROOT / "public" / "viewshed" / ROUTE        # PNG masks + manifest (gitignored)

DEM_UTM = DATA_DIR / "dem_utm.tif"
VS_STACK = DATA_DIR / "vs_stack.npy"   # raw per-sample viewsheds
VS_META = DATA_DIR / "vs_meta.json"


def read_gpx_points(path=GPX_PATH):
    """Return [(lat, lon, ele), ...] from <trkpt> elements, attribute order agnostic."""
    text = Path(path).read_text(encoding="utf-8")
    pts = []
    for m in re.finditer(r"<trkpt\b([^>]*)>(.*?)</trkpt>", text, re.S):
        attrs, body = m.group(1), m.group(2)
        lat = float(re.search(r'lat="([^"]+)"', attrs).group(1))
        lon = float(re.search(r'lon="([^"]+)"', attrs).group(1))
        ele_m = re.search(r"<ele>([^<]+)</ele>", body)
        pts.append((lat, lon, float(ele_m.group(1)) if ele_m else 0.0))
    return pts


def pick_window_size(n):
    # mirrors pickWindowSize() in gpx-engine.js
    if n < 500:
        return 5
    if n < 1500:
        return 7
    if n < 6000:
        return 12
    if n < 10000:
        return 14
    return 16


def smooth(points):
    """Moving average over lat/lon, mirrors smoothData() in gpx-engine.js."""
    n = len(points)
    half = pick_window_size(n) // 2
    out = []
    for i in range(n):
        lo, hi = max(0, i - half), min(n - 1, i + half)
        seg = points[lo:hi + 1]
        out.append((sum(p[0] for p in seg) / len(seg), sum(p[1] for p in seg) / len(seg)))
    return out


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))
