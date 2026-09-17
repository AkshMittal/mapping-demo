import { getMap,isMapPanning } 
from "./map-module.js";

import { drawElevationChart } 
from "./chart-module.js";

import { setPlaying, getPlaying, setIndex, getIndex, setHoverMapMarker, setSmoothedData, Source }
from "./controller-module.js";

import { setCampIndices, getCampIndices, setDayBounds, getDayBounds, getCamps }
from "./itinerary-module.js";

import { setInsetRoute }
from "./inset-module.js";

const camps = getCamps();


let routeData = [];
let routeBounds = null;
export function getRouteBounds() {
    return routeBounds;
}  
let smoothedData = [];
let routeSegments = [];
export function getRouteSegments() {
    return routeSegments;
}
let hitboxLine = null;
let lastHoverTime = 0;
const HOVER_INTERVAL = 16; 

// ─────────────────────────────────────────────
// PLAYBACK
// elapsed time → integer index. If a camp lies between the current index and
// the next one, land exactly on it and stop. Button state is derived from the
// index in controller-module, so nothing here tracks "state".
// ─────────────────────────────────────────────
const PLAY_DURATION = 24000; // ms for the full route
let rafId = null;
let startTime = 0;
let startIndex = 0;

function msPerPoint() {
    return PLAY_DURATION / (smoothedData.length - 1);
}

function play() {
    if (getPlaying()) return;
    if (getIndex() >= smoothedData.length - 1) return; // finished
    maybeRecenterToRoute();
    startIndex = getIndex();
    startTime = performance.now();
    setPlaying(true);
    rafId = requestAnimationFrame(tick);
}

function pause() {
    if (!getPlaying()) return;
    cancelAnimationFrame(rafId);
    setPlaying(false);
}

function reset() {
    pause();
    fitToRoute();
    setIndex(0);
}

function tick(now) {
    if (!getPlaying()) return;
    const last = smoothedData.length - 1;
    const current = getIndex();

    const elapsed = Math.max(0, now - startTime);
    let next = Math.min(startIndex + Math.floor(elapsed / msPerPoint()), last);
    next = Math.max(next, current);

    // first camp strictly ahead of current and reached by next
    const camp = getCampIndices().find(ci => ci > current && ci <= next);
    if (camp !== undefined) next = camp;

    setIndex(next);

    if (camp !== undefined || next >= last) {
        setPlaying(false);
        maybeRecenterToRoute();
        return;
    }
    rafId = requestAnimationFrame(tick);
}

const btnPlay = document.getElementById('btn-play');
const btnReset = document.getElementById('btn-reset');

btnPlay.addEventListener("click", () => {
    if (getPlaying()) pause();
    else play();
});

btnReset.addEventListener("click", () => {
    if (getIndex() === 0 && !getPlaying()) return;
    reset();
});

function disableMapInteraction(el) {
    if (!window.L) return;
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
}

disableMapInteraction(btnPlay);
disableMapInteraction(btnReset);

const campIcon = L.icon({
    iconUrl: 'public/resources/images/camp-icon.png',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, 0]
});

const campMarkers = new Map();

export function getCampMarkers(){
    return campMarkers;
}
// camp with lat/lon → nearest route point; otherwise place by distKm as a share
// of the last camp's distKm (older camps.json where the last camp is the end)
function campIndexFor(camp, smoothedData) {
    const N = smoothedData.length;
    if (typeof camp.lat === 'number' && typeof camp.lon === 'number') {
        const k = Math.cos(camp.lat * Math.PI / 180);
        let best = 0;
        let bestD = Infinity;
        smoothedData.forEach((p, i) => {
            const d = (p.lat - camp.lat) ** 2 + ((p.lon - camp.lon) * k) ** 2;
            if (d < bestD) {
                bestD = d;
                best = i;
            }
        });
        return best;
    }
    const totalKm = camps[camps.length - 1].distKm;
    return Math.round((camp.distKm / totalKm) * (N - 1));
}

function applyCamps(smoothedData) {
    let campIndices = camps.map(camp => {
        const index = campIndexFor(camp, smoothedData);
        camp.index = index;
        camp.lat = smoothedData[index].lat;
        camp.lon = smoothedData[index].lon;
        camp.ele = smoothedData[index].ele;
        return index;
    });

    // Day starts = [start, camp1, camp2, ...]; the last day runs to the route end
    let dayBounds = [0, ...campIndices];
    setDayBounds(dayBounds);
    setCampIndices(campIndices);
}



function renderCampMarkers(map) {
    camps.forEach(c => {
        const marker = L.marker([c.lat, c.lon], { icon: campIcon })
            .addTo(map);
    
        // store reference
        campMarkers.set(c.index, marker);
    
        // attach tooltip
        marker.bindTooltip(
            `<strong>${c.name}</strong><span>Day ${c.day}</span>`,
            {
            direction: "top",
            offset: [0, -8],
            className: "camp-tooltip"
            }
        );  
        marker.off("mouseover");
        marker.off("mouseout");
        marker.off("click");
        
    });
}
  




getMap().createPane("endMarkerPane");
getMap().getPane("endMarkerPane").style.zIndex = 650;
getMap().createPane('hoverMarkerPane');
getMap().getPane('hoverMarkerPane').style.zIndex = 700;   
getMap().createPane('hitboxLinePane');
getMap().getPane('hitboxLinePane').style.zIndex = 600;

// start / end dots in the page palette (styled by .route-pin in style.css)
const startIcon = L.divIcon({
    className: 'route-pin start',
    iconSize: [14, 14]
});

const endIcon = L.divIcon({
    className: 'route-pin end',
    iconSize: [14, 14]
});



let hoverMapMarker = L.circleMarker([0, 0], {
            radius: 6,
            color: "#283f32",    
            weight: 2,            
            fillColor: "#f5ede1", 
            fillOpacity: 1,
            pane: 'hoverMarkerPane'
        }).addTo(getMap());
hoverMapMarker.setStyle({opacity:0, fillOpacity:0});
setHoverMapMarker(hoverMapMarker);

function isHoverMarkerInView() {
    if (!hoverMapMarker) return true;
    return getMap().getBounds().contains(hoverMapMarker.getLatLng());
}
// the main map's load view: the route with some room around it
function fitToRoute() {
    if (routeBounds) getMap().fitBounds(routeBounds, { padding: [40, 40] });
}

function maybeRecenterToRoute() {
    if (!isHoverMarkerInView()) fitToRoute();
}




function toRadians(deg){
    return deg * (Math.PI / 180);
}
function haversine(lat1, lon1, lat2, lon2){
    const R = 6371;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a = Math.sin(dLat / 2) ** 2 +
                    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
                    Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // distance in km
    return distance;
}

function findTrkpts(doc) {
    if (!doc) return [];
    let nodes = doc.getElementsByTagName('trkpt');
    if (nodes && nodes.length) return nodes;
    nodes = doc.getElementsByTagNameNS('*', 'trkpt');
    if (nodes && nodes.length) return nodes;
    try {
        const xpath = ".//*[local-name() = 'trkpt']";
        const res = doc.evaluate(xpath, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        if (res && res.snapshotLength) {
            const arr = [];
            for (let i = 0; i < res.snapshotLength; i++) arr.push(res.snapshotItem(i));
            return arr;
        }
    } catch (err) {
        console.warn('XPath not available or failed:', err);
    }
    return [];
}

function pickWindowSize(N) {
    let windowsize;

    if (N < 500) windowsize = 5;
    else if (N < 1500) windowsize = 7;
    else if (N < 6000) windowsize = 12;
    else if (N < 10000) windowsize = 14;
    else windowsize = 16;

    return windowsize;
} 


function processPointsAndAttach(points) {
    if (!points || points.length === 0) {
        console.warn('No track points to process.');
        return;
    }
    const firstLat = parseFloat(points[0].getAttribute('lat'));
    const firstLon = parseFloat(points[0].getAttribute('lon'));
    const firstEleTag = points[0].getElementsByTagName('ele')[0] || points[0].getElementsByTagNameNS('*','ele')[0];
    const firstEle = firstEleTag ? parseFloat(firstEleTag.textContent) : 0;

    routeData.push({
        lat: firstLat,
        lon: firstLon,
        ele: firstEle,
        dist: 0
    });


    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const lat1 = parseFloat(prev.getAttribute('lat'));
        const lon1 = parseFloat(prev.getAttribute('lon'));
        const lat2 = parseFloat(curr.getAttribute('lat'));
        const lon2 = parseFloat(curr.getAttribute('lon'));
        const d = haversine(lat1, lon1, lat2, lon2); 

        const eleTag = curr.getElementsByTagName('ele')[0] || curr.getElementsByTagNameNS('*','ele')[0];
        const ele = eleTag ? parseFloat(eleTag.textContent) : 0;
        
        routeData.push({
            lat: lat2,
            lon: lon2,
            ele,
        });
        
    }
    
    // console.log('Route processed — points:', points.length);
    let window = pickWindowSize(routeData.length);
    smoothedData = smoothData(routeData, window);
    setSmoothedData(smoothedData);
    applyCamps(smoothedData);
    renderCampMarkers(getMap());

    try {
        drawSmoothedPolyline(getMap(), smoothedData);
    } catch (err) {
        console.error('Failed to draw smoothed polyline:', err);
    }
    
    hitboxLine.on('mousemove', function (evt) {
        if (getPlaying() || isMapPanning() || !smoothedData.length) return;
        const now = performance.now();
        if (now - lastHoverTime < HOVER_INTERVAL) return;
        lastHoverTime = now;
        setIndex(findNearestRoutePoint(evt.latlng), Source.MAP);
    });

    // touch screens have no hover: a tap on the route moves there instead
    hitboxLine.on('click', function (evt) {
        if (getPlaying() || !smoothedData.length) return;
        setIndex(findNearestRoutePoint(evt.latlng), Source.MAP);
    });

    try {
        drawElevationChart(smoothedData);
    } catch (err) {
        console.error('Failed to draw elevation graph:', err);
    }
    try {
        computeMetrics(smoothedData);
    } catch (err) {
        console.error('Failed to compute metrics:', err);
    }
    setIndex(0);
    hoverMapMarker.setStyle({opacity:1, fillOpacity:1});

}

function computeMetrics(smoothData) {
    if (!smoothData || smoothData.length === 0) return null; 

    let maxEle = smoothData[0].ele;
    let minEle = smoothData[0].ele;

    for (let i = 1; i < smoothData.length; i++) {
        const prev = smoothData[i - 1];
        const curr = smoothData[i];

        if (curr.ele > maxEle) maxEle = curr.ele;
        if (curr.ele < minEle) minEle = curr.ele;
    }

    document.getElementById('metric-distance').textContent = Number((smoothData[smoothData.length - 1].dist).toFixed(1));
    document.getElementById('metric-ascent').textContent = Math.round(smoothData[smoothData.length - 1].ascent);
    document.getElementById('metric-maxele').textContent = Math.round(maxEle);
    document.getElementById('metric-minele').textContent = Math.round(minEle);
    
}

function smoothData(routeData, window = 5) {
    const half = Math.floor(window/2);
    const result = [];
    let cumDist = 0;
    let cumAscent = 0;

    for (let i = 0; i < routeData.length; i++) {
        let lat = 0, lon = 0, ele = 0, count = 0;

        for (let j = i - half; j <= i + half; j++) {
            if (j >= 0 && j < routeData.length) {
                lat += routeData[j].lat;
                lon += routeData[j].lon;
                ele += routeData[j].ele;
                count++;
            }
        }
        lat /= count;
        lon /= count;
        ele /= count;


        // cumulative distance & ascent
        if (i > 0) {
            const d = haversine(result[i - 1].lat, result[i - 1].lon, lat, lon);
            cumDist += d;

            const elevDiff = ele - result[i - 1].ele;
            if (elevDiff > 0.5) {
                cumAscent += elevDiff;
            }
        }

        result.push({
            lat,
            lon,
            ele: Math.round(ele),
            dist: cumDist,
            ascent: cumAscent,
            slope: null,   // placeholder for forward slope
            grade: null
        });
    }

    // compute forward slopes (Option A)
    for (let i = 0; i < result.length - 1; i++) {
        const curr = result[i];
        const next = result[i + 1];
        const dDist = next.dist - curr.dist;
        const dEle  = next.ele  - curr.ele;

        if (dDist > 0) {
            const slope = dEle / (dDist * 1000);

            // quantize ONCE
            curr.slope = Number(slope.toFixed(3));       // e.g. 0.123
            curr.grade = Number((slope * 100).toFixed(1)); // e.g. 12.3
        } else {
            curr.slope = null;
            curr.grade = null;
        }

    }

    // last point gets no forward slope
    result[result.length - 1].slope = null;
    result[result.length - 1].grade = null;

    return result;
}

export function highlightDaySegment(dayIndex) {
    if (!routeSegments.length) return;

    // Neutral state (e.g. paused at camp)
    if (dayIndex === null) {
        routeSegments.forEach(seg => {
            seg.layer.setStyle({
                color: '#ffffff',
                opacity: 0.5,
                weight: 3
            });
        });
        return;
    }

    // Normal highlight behavior
    routeSegments.forEach((seg, idx) => {
        seg.layer.setStyle(
            idx === dayIndex
                ? { color: "rgb(255, 100, 23)", opacity: 1, weight: 4 }
                : { color: "#ffffff",opacity: 0.5, weight: 3 }
        );
    });
}


function drawSmoothedPolyline(map, smoothData, options = {}) {
    if (!smoothData || smoothData.length === 0) return null;

    const HitboxStyle = Object.assign({
        color: "#000000",
        weight: 30,
        opacity: 0,
        interactive: true,
        pane: 'hitboxLinePane'
    }, options);
    // convert to [lat, lon] pairs
    const latlngs = smoothData.map(p => [p.lat, p.lon]);

    // draw polyline
    const bounds = getDayBounds();   // day starts, e.g. [0, 532, 1140]
    routeSegments = [];
    for (let d = 0; d < bounds.length; d++) {
        const i0 = bounds[d];
        const i1 = bounds[d + 1] ?? latlngs.length - 1;
        if (i1 <= i0) continue; // last camp is the route end: no extra day
        const segLatLngs = latlngs.slice(i0, i1 + 1); // inclusive slice

        const segOutline = L.polyline(segLatLngs, {
            color: "#000000",
            weight: 6,              // thicker than main line
            opacity: 0.6,
            smoothFactor: 1,
            dashArray: '4,8',
            interactive: false
        }).addTo(map);

        // 2️⃣ MAIN DASHED LINE — goes on top
        const segLine = L.polyline(segLatLngs, {
            color: "#ffffff",
            weight: 3,
            opacity: 0.5,
            smoothFactor: 1,
            dashArray: '4,8',
            interactive: false
        }).addTo(map);

        routeSegments.push({
            layer: segLine,        // IMPORTANT: keep reference to top line only
            outline: segOutline,   // optional, for future styling
            i0,
            i1
        });

    }
    const start = L.marker(latlngs[0], { icon: startIcon, interactive: false }).addTo(map);
    const end   = L.marker(latlngs[latlngs.length - 1], { icon: endIcon, interactive: false, pane: "endMarkerPane" }).addTo(map);

    // draw hitbox line 
    hitboxLine = L.polyline(latlngs, HitboxStyle).addTo(map);
    // main map frames the route; the inset shows the full viewshed extent
    routeBounds = L.latLngBounds(latlngs);
    fitToRoute();
    setInsetRoute(smoothData);



}

function findNearestRoutePoint(latlng){
    let minDist = Infinity;
    let nearestIndex = 0;
    for (let i = 0; i < smoothedData.length; i++) {
        const p = smoothedData[i];
        const d = getMap().distance(latlng, [p.lat, p.lon]); 
        if (d < minDist) {
            minDist = d;
            nearestIndex = i;
        }
    }

    return nearestIndex;
}


export function loadGPX(gpxPath) {
    fetch(gpxPath)
        .then(r => {
            if (!r.ok) throw new Error('GPX fetch failed: ' + r.status);
            return r.text();
        })
        .then(text => {
            const doc = new DOMParser().parseFromString(text, 'text/xml');
            processPointsAndAttach(findTrkpts(doc));
        })
        .catch(err => console.error('GPX load failed:', err));
}
