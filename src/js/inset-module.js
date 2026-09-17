import { createViewshedLayer, getViewBounds }
from "./viewshed-module.js";

// ─────────────────────────────────────────────
// INSET MAP
// Small fixed map in the corner of the main map: the full viewshed extent with
// the mask always on, the route and a position dot. No pan, no zoom; it fits
// the extent once (and again if its size changes). Follows the shared index
// through syncInset(index), like everything else.
// ─────────────────────────────────────────────
const container = document.getElementById('inset-map');

// keep clicks/wheel/drags from reaching the main map underneath
L.DomEvent.disableClickPropagation(container);
L.DomEvent.disableScrollPropagation(container);

const inset = L.map(container, {
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    touchZoom: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    zoomSnap: 0,          // fit the extent exactly, not to the nearest zoom level
    inertia: false
});

L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
    maxNativeZoom: 14
}).addTo(inset);

createViewshedLayer(inset, { paneName: 'insetViewshedPane', className: 'inset' });

let smoothedData = [];
let fitBounds = getViewBounds();

const dot = L.circleMarker([0, 0], {
    radius: 4,
    color: '#283f32',
    weight: 2,
    fillColor: '#f5ede1',
    fillOpacity: 1,
    interactive: false
});

function fit() {
    if (fitBounds) inset.fitBounds(fitBounds);
}

export function setInsetRoute(data) {
    smoothedData = data;
    const latlngs = data.map(p => [p.lat, p.lon]);
    L.polyline(latlngs, { color: '#ffffff', weight: 2, opacity: 0.9, interactive: false }).addTo(inset);
    dot.addTo(inset);

    const routeBounds = L.latLngBounds(latlngs);
    fitBounds = fitBounds ? fitBounds.extend(routeBounds) : routeBounds;
    fit();
}

export function syncInset(index) {
    const p = smoothedData[index];
    if (p) dot.setLatLng([p.lat, p.lon]);
}

inset.on('resize', fit);
fit();
