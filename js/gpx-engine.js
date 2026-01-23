import { getMap,isMapPanning } 
from "./map-module.js";

import { drawElevationChart } 
from "./chart-module.js";

import {setPlaying, setHoverIndex, getHoverIndex, setHoverMapMarker, setSmoothedData, getPlaying, HoverSource} 
from "./controller-module.js";

import {setCamps, setCampIndices,getCampIndices, setDayBounds, getDayBounds, getDayForIndex,} 
from "./itinerary-module.js";

import {camps,trailhead} 
from "../routes/hampta-pass/camps.js";

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

//playback 
const PlaybackState = {
  IDLE: 'idle',
  PLAYING: 'playing',
  PAUSED: 'paused',
  CAMP_PAUSE: 'camp_pause',
  FINISHED: 'finished'
};
let playbackState = PlaybackState.IDLE;
export function ensurePausedForUserHover() {
    if (getPlaying()) return;
    if (playbackState !== PlaybackState.PAUSED) {
      playbackState = PlaybackState.PAUSED;
      btnPlay.dataset.state = playbackState;
    }
  }
let playbackIndex = 0;
function getPlaybackIndex() {
    return playbackIndex;
}  
let playStartTime = null;
let elapsedAccum = 0;
let playDuration = 12000; // 12 seconds for full GPX
let lastSyncedIndex = -1;
let lastPausedCampIndex = null;
let campPauseEngaged = false;
export function clearCampPause(){
    campPauseEngaged = false;  
    lastPausedCampIndex = null; 
}
function isCampPauseEngaged(){
    return campPauseEngaged;
}
let fractionalIndex = 0;
function syncPlaybackToHover() {
    const i = getHoverIndex();
    if (typeof i !== "number" || i < 0) return;

    playbackIndex = i;
    fractionalIndex = i;
    lastSyncedIndex = i;
    const N = smoothedData.length;
    elapsedAccum = (fractionalIndex / (N - 1)) * playDuration;
}
let btnReset =document.getElementById('btn-reset');
btnReset.addEventListener("click", () => {
    if(getHoverIndex() === 0 ) return;
    maybeRecenterToRoute();
    resetPlayback();
});
let btnPlay = document.getElementById('btn-play');
btnPlay.addEventListener("click", () => {
    if (playbackState === PlaybackState.FINISHED) return;
    maybeRecenterToRoute();
    switch (playbackState) {
        case PlaybackState.IDLE:
            startPlayback();
            btnPlay.dataset.state = playbackState;
            break;

        case PlaybackState.PLAYING:
            pausePlayback();
            btnPlay.dataset.state = playbackState;
            break;
        case PlaybackState.PAUSED:
            startPlayback();
            btnPlay.dataset.state = playbackState;
        case PlaybackState.CAMP_PAUSE:
        resumePlayback();
        btnPlay.dataset.state = playbackState;

        break;
    }
});
function disableMapInteraction(el) {
    if (!window.L) return;
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
  }
  
  disableMapInteraction(btnPlay);
  disableMapInteraction(btnReset);
  


function startPlayback() {
    if (getPlaying()) return;
    playbackState = PlaybackState.PLAYING;    
    syncPlaybackToHover();      // handoff 

    campPauseEngaged = false;
    setPlaying(true);
    
    const chart = window.elevationChart;
    if (chart) chart.canvas.classList.add("chart-disabled");
    chart.options.plugins.tooltip.enabled = false;
    chart.update('none');
    playStartTime = performance.now();
    hoverMapMarker.setStyle({ opacity: 1, fillOpacity: 1 });

    requestAnimationFrame(playbackLoop);
}

function resumePlayback() {
    if (getPlaying()) return;
    playbackState = PlaybackState.PLAYING;

    campPauseEngaged = false;
    const N = smoothedData.length;
    elapsedAccum = (playbackIndex / (N - 1))* playDuration;
    const chart = window.elevationChart;
    if (chart) chart.canvas.classList.add("chart-disabled");
    chart.options.plugins.tooltip.enabled = false;
    chart.update('none');
    setPlaying(true);
    playStartTime = performance.now();

    requestAnimationFrame(playbackLoop);
    console.log("playstartTime:",playStartTime,)
}



function pausePlayback() {
    playbackState = PlaybackState.PAUSED;
    if (!getPlaying()) return;
    elapsedAccum += performance.now() - playStartTime;
    setPlaying(false); 
    // enable chart tooltip
    const chart = window.elevationChart;
    if (chart) {
        chart.canvas.classList.remove("chart-disabled");
        chart.options.plugins.tooltip.enabled = true;
        chart.tooltip?.setActiveElements(
            [{ datasetIndex: 0, index: getHoverIndex() }],
            { x: 0, y: 0 }
        );
        chart.update();
    }

    
    setHoverIndex(getPlaybackIndex(), HoverSource.PROGRAM);
}

function resetPlayback() {
    playbackState = PlaybackState.IDLE;
    btnPlay.dataset.state = playbackState; 
    setPlaying(false);
    const chart = window.elevationChart;
    if (chart) {
        chart.canvas.classList.remove("chart-disabled");
    }
    setHoverIndex(0, HoverSource.PROGRAM);
    chart.tooltip?.setActiveElements(
            [{ datasetIndex: 0, index: getHoverIndex() }],
            { x: 0, y: 0 }
        );
    chart.update('none');
    clearCampPause();
    elapsedAccum = 0;
    playStartTime = 0;
    lastSyncedIndex = -1;
}
let counter = 0;
function playbackLoop(now) {
    if (!getPlaying()) {
        console.log("counter = ", counter);
        return;
    }
    const elapsed = (getPlaying() ? performance.now() - playStartTime : 0) + elapsedAccum;
    const N = smoothedData.length;
    const buffer = playDuration / (N - 1); // time per point
    // clamp so we don't go out of bounds
    fractionalIndex = elapsed / buffer;
    const i0 = Math.floor(fractionalIndex);
    playbackIndex = i0;

    const i1 = Math.min(i0 + 1, N - 1);

    const p0 = smoothedData[i0];
    const p1 = smoothedData[i1];

    if (!p0 || !p1) {
        console.warn("Playback index invalid:", i0, i1, "N:", N);
        console.log("counter = ", counter);
        setPlaying(false);
        return;
    }

    // how far between p0 and p1 are we?
    const alpha = fractionalIndex - i0;  // 0 to <1

    // --- LINEAR INTERPOLATION ---
    const lat = p0.lat + (p1.lat - p0.lat) * alpha;
    const lon = p0.lon + (p1.lon - p0.lon) * alpha;
    // move marker smoothly
    counter++;
    hoverMapMarker.setLatLng([lat, lon]);
    // RANGE-BASED CAMP DETECTION (no skips)
    // console.log(
    //     "loop:",
    //     "frac", fractionalIndex.toFixed(2),
    //     "i0", i0,
    //     "playback", playbackIndex,
    //     "lastSynced", lastSyncedIndex
    // );

    const hitCamp = getCampIndices().find(ci =>
        Math.abs(ci - getPlaybackIndex()) <= 60 && ci !== lastPausedCampIndex
    );


    if (hitCamp !== undefined) {
        lastPausedCampIndex = hitCamp;
        pauseForCamp(hitCamp);
        return;
    }

    lastSyncedIndex = i0;
    if(playbackIndex !== lastPausedCampIndex){
        setHoverIndex(getPlaybackIndex(),HoverSource.PROGRAM);
    }
    // continue or end
    if (elapsed < playDuration) {
        requestAnimationFrame(playbackLoop);
    } else {
        clearCampPause();
        setPlaying(false);
        playbackState = PlaybackState.FINISHED;
        btnPlay.dataset.state = playbackState;
        console.log("ye this second thing happened");
    }
}

const campIcon = L.icon({
    iconUrl: '../resources/images/camp-icon.png',
    iconSize: [60, 60],
    iconAnchor: [30, 30],
    popupAnchor: [0, 0]
});

const campMarkers = new Map();
export function getCampMarkers(){
    return campMarkers;
}
function applyCamps(smoothedData) {
    const totalKm = camps[camps.length - 1].distKm;
    const N = smoothedData.length;

    let campIndices = camps.map(camp => {
        const proportion = camp.distKm / totalKm;
        const index = Math.round(proportion * (N - 1));
        camp.index = index;
        camp.lat = smoothedData[index].lat;
        camp.lon = smoothedData[index].lon;
        camp.ele = smoothedData[index].ele;
        return index;
    });

    // Day bounds = [start, camp1, camp2, camp3, end]
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
  

function pauseForCamp(campIndex) {
    campMarkers.get(campIndex)?.openTooltip();

    playbackState = PlaybackState.CAMP_PAUSE;
    btnPlay.dataset.state = playbackState;
    maybeRecenterToRoute();    
    campPauseEngaged = true;
    setPlaying(false);
    lastSyncedIndex = campIndex;
    console.log("campIndex:", campIndex, "playbackIndex:", getPlaybackIndex(), "hoverIndex:", getHoverIndex())
    
    // snap marker info
    const camp = smoothedData[campIndex];
    if (camp) {
        hoverMapMarker.setLatLng([camp.lat, camp.lon]);
    }
    const isLastCamp = campIndex === getCampIndices().at(-1);

    if (isLastCamp) {
        playbackState = PlaybackState.FINISHED;
        btnPlay.dataset.state = playbackState;
    }
    setHoverIndex(campIndex, HoverSource.CAMP);
    playbackIndex = campIndex;

    const chart = window.elevationChart;
    if (chart){
        chart.canvas.classList.remove("chart-disabled");
        chart.options.plugins.tooltip.enabled = true;
        chart.tooltip?.setActiveElements(
            [{ datasetIndex: 0, index: campIndex }],
            { x: 0, y: 0 }
        );
        chart.update('none');
    }
}



getMap().createPane("endMarkerPane");
getMap().getPane("endMarkerPane").style.zIndex = 650;
getMap().createPane('hoverMarkerPane');
getMap().getPane('hoverMarkerPane').style.zIndex = 700;   
getMap().createPane('hitboxLinePane');
getMap().getPane('hitboxLinePane').style.zIndex = 600;

const startIconLarge = L.icon({
    iconUrl: "https://unpkg.com/leaflet-gpx@1.7.0/pin-icon-start.png",
    shadowUrl: "https://unpkg.com/leaflet-gpx@1.7.0/pin-shadow.png",
    iconSize: [32, 52],     // larger start icon
    iconAnchor: [16, 52],
    shadowSize: [40, 40],
    pane: "markerPane"
});

const endIconNormal = L.icon({
    iconUrl: "https://unpkg.com/leaflet-gpx@1.7.0/pin-icon-end.png",
    shadowUrl: "https://unpkg.com/leaflet-gpx@1.7.0/pin-shadow.png",
    iconSize: [24, 40],     // normal size
    iconAnchor: [12, 40],
    shadowSize: [32, 32],
    pane: "endMarkerPane"
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
function maybeRecenterToRoute() {
    if (!routeBounds) return;

    if (!isHoverMarkerInView()) {
        getMap().fitBounds(routeBounds, {
            padding: [40, 40]
        });
    }
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


function processPointsAndAttach(points, layer) {
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
    
    console.log('Route processed — points:', points.length);
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
        ensurePausedForUserHover();
        if(isMapPanning()) return;
        const now = performance.now();
        if (now - lastHoverTime < HOVER_INTERVAL) return; 
        lastHoverTime = now;
        lastPausedCampIndex = null;
        if (!smoothedData.length || isMapPanning()) return;
        let nearestIndex = findNearestRoutePoint(evt.latlng);
        setHoverIndex(nearestIndex, HoverSource.MAP);
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
    setHoverIndex(0, HoverSource.PROGRAM);
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
            ele: ele.toFixed(0),
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
    const bounds = getDayBounds();   // e.g. [0, 532, 1140, 1802]
    routeSegments = [];
    for (let d = 0; d < bounds.length - 1; d++) {
        const i0 = bounds[d];
        const i1 = bounds[d+1];
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
    const start = L.marker(latlngs[0], { icon: startIconLarge }).addTo(map);
    const end   = L.marker(latlngs[latlngs.length - 1], { icon: endIconNormal }).addTo(map);

    // draw hitbox line 
    hitboxLine = L.polyline(latlngs, HitboxStyle).addTo(map);
    // fit bounds to route
    routeBounds = L.latLngBounds(latlngs);
    map.fitBounds(latlngs);



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
     if (!window.L || !L.GPX) {
        console.error('Leaflet or leaflet-gpx plugin is not loaded.');
        return;
    }

    const gpx = new L.GPX(gpxPath, {
        async: true,
        polyline_options: { color: "#ff7700ff", weight: 4, opacity: 1},
        marker_options: {
            startIcon: '',
            startIconUrl: '',
            endIconUrl: '',
            endIcon: '',
            shadowUrl: ''
        }

    })
    .on('loaded', async function (e) {

        function findPolyline(layer) {
            if (layer instanceof L.Polyline) {
                return layer;
            }

            if (layer.getLayers) {
                const children = layer.getLayers();
                for (const child of children) {
                    const found = findPolyline(child);
                    if (found) return found;
                }
            }

            if (layer._layers) {
                for (let key in layer._layers) {
                    const found = findPolyline(layer._layers[key]);
                    if (found) return found;
                }
            }

            return null;
        }
        const rawPolyline = findPolyline(e.target);

        if (!rawPolyline) {
            console.error("No polyline found anywhere inside GPX layer.");
            console.log(e.target);
            return;
        }
        else {
            getMap().removeLayer(rawPolyline);
        }


        const xmlOrString = e.target._gpx;
        const xmlDoc = (typeof xmlOrString === 'string') ? new DOMParser().parseFromString(xmlOrString, 'text/xml') : xmlOrString;

        let trkpts = findTrkpts(xmlDoc);
        if (!trkpts || trkpts.length === 0) {
            console.warn('No trkpt found from plugin XML. Falling back to fetch:', gpxPath);
            fetch(gpxPath).then(r => {
                if (!r.ok) throw new Error('GPX fetch failed: ' + r.status);
                return r.text();
            }).then(text => {
                const parsed = new DOMParser().parseFromString(text, 'text/xml');
                trkpts = findTrkpts(parsed);
                processPointsAndAttach(trkpts, e.target);
                console.log("smoothedData length: ", smoothedData.length);
                console.log("hovermapMarker: ", hoverMapMarker);   
            }).catch(err => console.error('GPX fetch fallback failed:', err));
            return;
        }
    



    }).addTo(getMap());
    

}