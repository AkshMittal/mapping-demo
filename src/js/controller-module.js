import { highlightDaySegment, getCampMarkers }
from "./gpx-engine.js";
import { getCampContext, getDayContext, getDayForIndex, getCampIndices }
from "./itinerary-module.js";
import { syncViewshed, buildViewshedLookup }
from "./viewshed-module.js";
import { getMap }
from "./map-module.js";
import { syncInset }
from "./inset-module.js";
import { setChartProgress }
from "./chart-module.js";

// ─────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH
// index   → where we are on the route (integer into smoothedData)
// playing → whether playback is advancing the index
// everything else (marker, chart, panels, buttons) is derived from these two
// ─────────────────────────────────────────────
export const Source = {
  CHART: 'chart',
  MAP: 'map',
  PROGRAM: 'program'
};

let index = -1;
let playing = false;
let smoothedData = [];
let hoverMapMarker = null;

export function setSmoothedData(_smoothedData){
    smoothedData = _smoothedData;
    buildViewshedLookup(smoothedData.length);
}
export function setHoverMapMarker(_hoverMapMarker){
    hoverMapMarker = _hoverMapMarker;
}

export function getIndex(){
    return index;
}
export function getPlaying(){
    return playing;
}

export function setIndex(nextIndex, source = Source.PROGRAM) {
    if (typeof nextIndex !== "number" || nextIndex < 0 || nextIndex >= smoothedData.length) return;
    const snapped = snapToCamp(nextIndex, source);
    if (snapped !== nextIndex) source = Source.PROGRAM; // chart must follow to the camp too
    nextIndex = snapped;
    if (nextIndex === index) return;
    index = nextIndex;
    syncAll(source);
}

// Hover snap: a camp within CAMP_SNAP_PX on screen wins over the hovered point.
// Measured in the pixel space of whatever is being hovered, so it scales with
// map zoom / chart width by itself.
const CAMP_SNAP_PX = 12;

function pixelOf(i, source) {
    if (source === Source.MAP) {
        const p = smoothedData[i];
        return getMap().latLngToContainerPoint([p.lat, p.lon]);
    }
    const el = window.elevationChart?.getDatasetMeta(0).data[i];
    return el ? { x: el.x, y: 0 } : null; // chart: horizontal distance only
}

function snapToCamp(i, source) {
    if (source !== Source.MAP && source !== Source.CHART) return i;
    const at = pixelOf(i, source);
    if (!at) return i;

    let best = i;
    let bestDist = CAMP_SNAP_PX;
    for (const ci of getCampIndices()) {
        const c = pixelOf(ci, source);
        if (!c) continue;
        const d = Math.hypot(c.x - at.x, c.y - at.y);
        if (d <= bestDist) {
            best = ci;
            bestDist = d;
        }
    }
    return best;
}

export function setPlaying(_playing){
    if (_playing === playing) return;
    playing = _playing;

    const chart = window.elevationChart;
    if (chart) {
        chart.canvas.classList.toggle("chart-disabled", playing);
        chart.options.plugins.tooltip.enabled = !playing;
    }
    syncAll(Source.PROGRAM);
}

// derived, never stored
export const PlaybackState = {
  IDLE: 'idle',
  PLAYING: 'playing',
  PAUSED: 'paused',
  CAMP_PAUSE: 'camp_pause',
  FINISHED: 'finished'
};

export function getPlaybackState() {
    if (playing) return PlaybackState.PLAYING;
    if (index >= smoothedData.length - 1) return PlaybackState.FINISHED;
    if (index <= 0) return PlaybackState.IDLE;
    if (getCampIndices().includes(index)) return PlaybackState.CAMP_PAUSE;
    return PlaybackState.PAUSED;
}

// ─────────────────────────────────────────────
// SYNC (all derived UI)
// ─────────────────────────────────────────────
function syncAll(source) {
    if (index < 0) return;

    syncMarker();
    syncDaySegment();
    syncPanels();
    syncCampTooltips();
    syncViewshed(index);
    syncInset(index);
    syncChart(source);
    syncButtons();
}

function syncMarker() {
    const pt = smoothedData[index];
    if (pt && hoverMapMarker) {
        hoverMapMarker.setLatLng([pt.lat, pt.lon]);
    }
}

function syncDaySegment() {
    const campCtx = getCampContext(index);
    highlightDaySegment(campCtx.type === "at" ? null : getDayForIndex(index));
}

function syncCampTooltips() {
    const campMarkers = getCampMarkers();
    campMarkers.forEach(marker => marker.closeTooltip());
    if (campMarkers.has(index)) {
        campMarkers.get(index).openTooltip();
    }
}

function syncChart(source) {
    const chart = window.elevationChart;
    if (!chart) return;
    setChartProgress(index);
    // hovering the chart already places its own tooltip
    if (source !== Source.CHART) {
        const el = chart.getDatasetMeta(0).data[index];
        chart.tooltip?.setActiveElements(
            [{ datasetIndex: 0, index }],
            el ? { x: el.x, y: el.y } : { x: 0, y: 0 }
        );
    }
    chart.update('none');
}

const btnPlay = document.getElementById('btn-play');
const btnReset = document.getElementById('btn-reset');

function syncButtons() {
    btnPlay.dataset.state = getPlaybackState();
    btnReset.classList.toggle("disabled", index === 0 && !playing);
}

// ─────────────────────────────────────────────
// DAY / CAMP PANELS
// ─────────────────────────────────────────────
function syncCampPanel(campCtx) {
    const panel = document.getElementById("camp-panel");
    if (!panel) return;

    if (campCtx.type === "at") {
        panel.textContent = `At ${campCtx.camp.name}`;
    } else {
        const from = campCtx.fromCamp?.name ?? "";
        const to   = campCtx.toCamp?.name ?? "";
        panel.textContent = `${from} → ${to}`;
    }
}

function syncDayPanel(dayCtx, campCtx) {
    const panel = document.getElementById("day-panel");
    if (!panel) return;

    if (campCtx.type === "at") {
        // at camp: show day transition (Day X → Day X+1)
        const d = dayCtx.dayIndex;
        panel.textContent = `Day ${d} → Day ${d + 1}`;
    } else {
        panel.textContent = `Day ${dayCtx.dayIndex + 1}`;
    }
}

const coveredValue = document.getElementById('metric-covered');
const climbedValue = document.getElementById('metric-climbed');

function syncPanels() {
    const campCtx = getCampContext(index);
    const dayCtx  = getDayContext(index);
    syncCampPanel(campCtx);
    syncDayPanel(dayCtx, campCtx);

    // live figures up to the current position (precomputed per point)
    const p = smoothedData[index];
    coveredValue.textContent = p.dist.toFixed(1);
    climbedValue.textContent = Math.round(p.ascent);
}
