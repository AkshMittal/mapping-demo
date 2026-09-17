import { getMap }
from "./map-module.js";
import { VIEWSHED_DIR }
from "./route-config.js";

// ─────────────────────────────────────────────
// VIEWSHED MASK
// A dim layer over the whole map with the area visible from the current point
// cut out. Masks are precomputed (tools/viewshed): one PNG per sample point,
// opaque black where NOT visible, transparent where visible. The pane opacity
// sets how dark the dim is. Outside the PNG bounds, a world polygon with a
// hole keeps the dim going.
//
// createViewshedLayer(map) attaches one to any map (main map + inset). All of
// them follow the shared index through syncViewshed(index) from controller-module.
// ─────────────────────────────────────────────
const BASE = VIEWSHED_DIR;

const manifest = await fetch(BASE + 'manifest.json')
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null);

// Crossfade: each new mask is added on top at opacity 0 and fades in; the masks
// under it are removed once it is fully in. Playback swaps faster than the fade,
// so several masks can be stacked briefly; that only keeps areas dim a little
// longer, it never flashes.
const FADE_MS = 250;   // keep in sync with .viewshed-img transition

const bounds = manifest ? L.latLngBounds(manifest.bounds) : null;
const layerInstances = [];
let sampleForIndex = [];   // route index → manifest sample {index, file, farKm}
let currentIndex = 0;

if (manifest) {
    // preload so swapping never flashes (shared by every map via browser cache)
    manifest.samples.forEach(sample => {
        new Image().src = BASE + sample.file;
    });
}

export function hasViewshed() {
    return !!manifest;
}

// precomputed extent of everything the viewshed ever lights up (null if no data)
export function getViewBounds() {
    return manifest ? L.latLngBounds(manifest.viewBounds) : null;
}

export function createViewshedLayer(map, { paneName = 'viewshedPane', className = '', enabled = true } = {}) {
    if (!manifest) return null;

    map.createPane(paneName);
    const pane = map.getPane(paneName);
    pane.classList.add('leaflet-viewshed-pane');
    if (className) pane.classList.add(className);
    pane.style.zIndex = 350; // above tiles (200), below route/markers (400+)

    // dim everything outside the precomputed area. The hole is inset a couple
    // of cells so the polygon overlaps the PNG's black border; two antialiased
    // edges meeting exactly would leave a faint light line.
    const world = [[-90, -360], [90, -360], [90, 360], [-90, 360]];
    const [[hs, hw], [hn, he]] = manifest.holeBounds;
    const hole = [[hs, hw], [hn, hw], [hn, he], [hs, he]];
    L.polygon([world, hole], {
        pane: paneName,
        // SVG is only drawn for the view + padding and redrawn after a pan ends;
        // the default 10% padding left undimmed blocks when panning further
        renderer: L.svg({ pane: paneName, padding: 1 }),
        stroke: false,
        fillColor: '#000',
        fillOpacity: 1,
        interactive: false
    }).addTo(map);

    const layers = [];   // mask overlays, oldest first
    let currentFile = null;

    const instance = {
        pane,
        enabled,
        setEnabled(on) {
            instance.enabled = on;
            pane.classList.toggle('off', !on);
            if (on) instance.sync(currentIndex);
        },
        sync(index) {
            if (!instance.enabled) return;
            const sample = sampleForIndex[index];
            if (!sample || sample.file === currentFile) return;
            currentFile = sample.file;

            const layer = L.imageOverlay(BASE + sample.file, bounds, {
                pane: paneName,
                interactive: false,
                opacity: 0,
                className: 'viewshed-img'
            }).addTo(map);
            layers.push(layer);

            layer.once('load', () => {
                layer.setOpacity(1);
                setTimeout(() => {
                    const i = layers.indexOf(layer);
                    if (i > 0) layers.splice(0, i).forEach(old => map.removeLayer(old));
                }, FADE_MS);
            });
        }
    };

    instance.setEnabled(enabled);
    layerInstances.push(instance);
    return instance;
}

// nearest sample by route index, built once the route length is known
export function buildViewshedLookup(routeLength) {
    if (!manifest) return;
    const samples = manifest.samples;
    sampleForIndex = new Array(routeLength);
    let s = 0;
    for (let i = 0; i < routeLength; i++) {
        while (s + 1 < samples.length &&
               Math.abs(samples[s + 1].index - i) <= Math.abs(samples[s].index - i)) {
            s++;
        }
        sampleForIndex[i] = samples[s];
    }
}

const farRow = document.getElementById('view-distance');
const farValue = document.getElementById('metric-far');
farRow.hidden = !manifest;

export function syncViewshed(index) {
    currentIndex = index;
    const sample = sampleForIndex[index];
    if (sample) farValue.textContent = sample.farKm.toFixed(1);
    layerInstances.forEach(l => l.sync(index));
}

// ─────────────────────────────────────────────
// MAIN MAP: optional, off by default (the inset always shows it)
// ─────────────────────────────────────────────
const mainMap = getMap();
const mainLayer = createViewshedLayer(mainMap, { enabled: false });
const btn = document.getElementById('btn-viewshed');

if (mainLayer) {
    btn.hidden = false;
    L.DomEvent.disableClickPropagation(btn);
    btn.addEventListener('click', () => {
        mainLayer.setEnabled(!mainLayer.enabled);
        btn.classList.toggle('active', mainLayer.enabled);
    });

    mainMap.on('baselayerchange', e => {
        mainLayer.pane.classList.toggle('on-satellite', e.name === 'Satellite');
    });
}
