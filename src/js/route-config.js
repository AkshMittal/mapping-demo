// Which route the page shows. Keep in sync with VIEWSHED_ROUTE in
// tools/viewshed/common.py (the precompute writes public/viewshed/<route>/).
export const ROUTE = 'patalsu';

const GPX_FILES = {
    'hampta-pass': 'hampta_pass.gpx',
    'patalsu': 'patalsu.gpx'
};

export const ROUTE_DIR = `public/routes/${ROUTE}/`;
export const GPX_FILE = ROUTE_DIR + GPX_FILES[ROUTE];
export const CAMPS_FILE = ROUTE_DIR + 'camps.json';
export const VIEWSHED_DIR = `public/viewshed/${ROUTE}/`;
