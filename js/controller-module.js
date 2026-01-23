import { highlightDaySegment, clearCampPause } 
from "./gpx-engine.js";
import { getCampContext, getDayContext, getDayForIndex } 
from "./itinerary-module.js";

export const HoverSource = {
  CHART: 'chart',
  MAP: 'map',
  CAMP: 'camp',
  PROGRAM: 'program'
};


let playing = false;
export function setPlaying(_playing){
    playing = _playing;
}
export function getPlaying(){
    return playing;
}

let hoverMapMarker = null;
let smoothedData = [];
let hoverIndex = -1;
let hoverSource = null;

export function setHoverIndex(index, source = HoverSource.PROGRAM) {
    if (index === hoverIndex && source === hoverSource) return;

    hoverIndex = index;
    hoverSource = source;

    if (
        source === HoverSource.MAP ||
        source === HoverSource.CHART
    ) {
        clearCampPause();
    }

    syncVisuals(source);
}

export function getHoverIndex(){
    return hoverIndex;
}

export function setSmoothedData(_smoothedData){
    smoothedData = _smoothedData;
}
export function setHoverMapMarker(_hoverMapMarker){
    hoverMapMarker = _hoverMapMarker;
}

export function syncHoverMapMarker(i) {
    const pt = smoothedData[i];
    if (!pt || !hoverMapMarker) return;
    hoverMapMarker.setLatLng([pt.lat, pt.lon]);
}

export function syncChartHighlight() {
    // if (getPlaying()) return; // skip during playback
    const chart = window.elevationChart;
    if (!chart) return;
    const i = hoverIndex;
    chart.tooltip?.setActiveElements([{ datasetIndex: 0, index: i }]);
    chart.update('none');
}



//day and camp

let lastCampContext = null;
let lastDay = null;
function campContextEqual(ctx1, ctx2) {
    if (!ctx1 && !ctx2) return true;
    if (!ctx1 || !ctx2) return false;
    if (ctx1.type !== ctx2.type) return false;
    if (ctx1.type === "at") {
        return ctx1.camp.index === ctx2.camp.index;
    }
    // between context
    return ctx1.from === ctx2.from && ctx1.to === ctx2.to;
}

const dayPanel = document.getElementById('day-panel');
const campPanel = document.getElementById('camp-panel');

function syncCampPanel(campCtx) {
    const panel = document.querySelector("#camp-panel");
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
    const panel = document.querySelector("#day-panel");
    if (!panel) return;

    // NORMAL on-route case
    if (campCtx.type === "between") {
        const dispDay = dayCtx.dayIndex + 1;
        if (dispDay !== lastDay) {
            panel.textContent = `Day ${dispDay}`;
            lastDay = dispDay;
        }
        return;
    }

    // AT CAMP: show day transition (Day X → Day X+1)
    if (campCtx.type === "at") {
        const d = dayCtx.dayIndex;
        panel.textContent = `Day ${d} → Day ${d + 1}`;
        lastDay = d + 2;
    }
}
export function syncPanels(i) {
    if (typeof i !== "number") {
        i = hoverIndex;
    }
    const campCtx = getCampContext(i);
    const dayCtx  = getDayContext(i);
    syncCampPanel(campCtx);
    syncDayPanel(dayCtx, campCtx);
}

//batching sync
export function syncVisuals(source) {
    const i = getHoverIndex();
    if (typeof i !== "number" || i < 0) return;

    const campCtx = getCampContext(i);

    if (campCtx.type === "at") {
        // At camp → neutral state
        highlightDaySegment(null);
    } else {
        const day = getDayForIndex(i);
        highlightDaySegment(day);
    }



    if (source !== HoverSource.CHART) {
        syncChartHighlight();
        syncPanels();
        
    }

    if (source !== HoverSource.CAMP) {
        
        syncPanels(i);
        syncHoverMapMarker(i);
    }
    }
