import { getMap } 
from "./map-module.js";

import { drawElevationChart } 
from "./chart-module.js";

let map = getMap();
let routeData = [];     

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
    let totalDistanceKm = 0;
    const distanceData = [0];
    const elevationData = [];

    const firstEle = (points[0].getElementsByTagName('ele')[0] || points[0].getElementsByTagNameNS('*','ele')[0]);
    elevationData.push(firstEle ? parseFloat(firstEle.textContent) : null);

    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const lat1 = parseFloat(prev.getAttribute('lat'));
        const lon1 = parseFloat(prev.getAttribute('lon'));
        const lat2 = parseFloat(curr.getAttribute('lat'));
        const lon2 = parseFloat(curr.getAttribute('lon'));
        const d = haversine(lat1, lon1, lat2, lon2); 
        totalDistanceKm += d;

        const eleTag = curr.getElementsByTagName('ele')[0] || curr.getElementsByTagNameNS('*','ele')[0];
        const ele = eleTag ? parseFloat(eleTag.textContent) : 0;
        
        routeData.push({
            lat2,
            lon2,
            ele,
            dist: totalDistanceKm
        });
        
        distanceData.push(totalDistanceKm);
        elevationData.push(ele);
    }
 
    layer.distanceData = distanceData;
    layer.elevationData = elevationData;
    layer.totalDistanceKm = totalDistanceKm;

    console.log('Route processed — points:', points.length, 'total km:', totalDistanceKm.toFixed(3));
    let window = pickWindowSize(routeData.length);
    const smoothedData = smoothData(routeData, window);
    try {
        drawSmoothedPolyline(map, smoothedData);
    } catch (err) {
        console.error('Failed to draw smoothed polyline:', err);
    }
    try {
        drawElevationChart(distanceData, elevationData, smoothedData);
    } catch (err) {
        console.error('Failed to draw elevation graph:', err);
    }
    try {
        computeMetrics(smoothedData);
    } catch (err) {
        console.error('Failed to compute metrics:', err);
    }

}

function computeMetrics(smoothData) {
    if (!smoothData || smoothData.length === 0) return null; 

    let totalAscent = 0;
    for (let i = 1; i < smoothData.length; i++) {
        const diff = smoothData[i].ele - smoothData[i - 1].ele;
        if (diff > 0.5) totalAscent += diff; 
    }

    let maxEle = routeData[0].ele;
    let minEle = routeData[0].ele;

    for (let i = 1; i < routeData.length; i++) {
        const prev = routeData[i - 1];
        const curr = routeData[i];

        if (curr.ele > maxEle) maxEle = curr.ele;
        if (curr.ele < minEle) minEle = curr.ele;
    }

    document.getElementById('metric-distance').textContent = Number((routeData[routeData.length - 1].dist).toFixed(1));
    document.getElementById('metric-ascent').textContent = Math.round(totalAscent);
    document.getElementById('metric-maxele').textContent = Math.round(maxEle);
    document.getElementById('metric-minele').textContent = Math.round(minEle);

}

function smoothData(routeData, window=5) {
  const half = Math.floor(window/2);
  const smoothedData = [];

  for (let i = 0; i < routeData.length; i++) {
    let lat = 0, lon = 0, ele = 0, count = 0;

    for (let j = i - half; j <= i + half; j++) {
      if (j >= 0 && j < routeData.length) {
        lat += routeData[j].lat2;
        lon += routeData[j].lon2;
        ele += routeData[j].ele;
        count++;
      }
    }

    smoothedData.push({
      lat: lat / count,
      lon: lon / count,
      ele: ele / count,
      dist: routeData[i].dist,   
      // ill add the timestamp later when relevant  
    });
  }

  return smoothedData;
}

function drawSmoothedPolyline(map, smoothData, options = {}) {
    if (!smoothData || smoothData.length === 0) return null;

    // default style
    const style = Object.assign({
        color: "#ff7700",
        weight: 4,
        opacity: 1,
        smoothFactor: 1.0
    }, options);

    // convert to [lat, lon] pairs
    const latlngs = smoothData.map(p => [p.lat, p.lon]);

    // draw polyline
    const line = L.polyline(latlngs, style).addTo(map);
    const start = L.marker(latlngs[0], { icon: startIconLarge }).addTo(map);
    const end   = L.marker(latlngs[latlngs.length - 1], { icon: endIconNormal }).addTo(map);

    // fit bounds to route
    map.fitBounds(latlngs);

    return line; // return for manipulation if needed
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
            startIcon: startIconLarge,
            endIcon: endIconNormal,
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
            map.removeLayer(rawPolyline);
        }


        const bounds = e.target.getBounds();
        const targetZoom = map.getBoundsZoom(bounds);
        const targetCenter = bounds.getCenter();
        map.setView(targetCenter, targetZoom);
          

        const xmlOrString = e.target._gpx;
        const xmlDoc = (typeof xmlOrString === 'string') ? new DOMParser().parseFromString(xmlOrString, 'text/xml') : xmlOrString;
        
        let lastHoverTime = 0;
        const HOVER_INTERVAL = 16; 


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
            }).catch(err => console.error('GPX fetch fallback failed:', err));
            return;
        }

        processPointsAndAttach(trkpts, e.target);




    }).addTo(map);
}