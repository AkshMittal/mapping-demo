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

    try {
        drawElevationChart(distanceData, elevationData, routeData);
    } catch (err) {
        console.error('Failed to draw elevation graph:', err);
    }
    let metrics = computeMetrics(routeData);
    document.getElementById('metric-distance').textContent = metrics.totalDistanceKm;
    document.getElementById('metric-ascent').textContent = metrics.totalAscent;
    document.getElementById('metric-maxele').textContent = metrics.maxEle;
    document.getElementById('metric-minele').textContent = metrics.minEle;

    console.log('Route metrics:', metrics);
}

function computeMetrics(routeData) {
    if (!routeData || routeData.length === 0) return null;

    const N = routeData.length;
    let window;

    if (N < 500) window = 5;
    else if (N < 1500) window = 7;
    else if (N < 6000) window = 12;
    else if (N < 10000) window = 14;
    else window = 16; 

    const smoothedEle = smoothElevation(routeData, window);


    let totalAscent = 0;
    for (let i = 1; i < smoothedEle.length; i++) {
        const diff = smoothedEle[i] - smoothedEle[i - 1];
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

    return {
        totalDistanceKm: Number((routeData[routeData.length - 1].dist).toFixed(1)),
        totalAscent: Math.round(totalAscent), 
        maxEle: Math.round(maxEle),           
        minEle: Math.round(minEle)            
    };

}

function smoothElevation(routeData, window=5) {
  const smoothed = [];
  for (let i = 0; i < routeData.length; i++) {
    let sum = 0, count = 0;
    for (let j = i - Math.floor(window/2); j <= i + Math.floor(window/2); j++) {
      if (j >= 0 && j < routeData.length) {
        sum += routeData[j].ele;
        count++;
      }
    }
    smoothed.push(sum / count);
  }
  return smoothed;
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
        const polyline = findPolyline(e.target);

        if (!polyline) {
            console.error("No polyline found anywhere inside GPX layer.");
            console.log(e.target);
            return;
        }


        const bounds = e.target.getBounds();
        const targetZoom = map.getBoundsZoom(bounds);
        const targetCenter = bounds.getCenter();
        map.setView(targetCenter, targetZoom);
          

        const xmlOrString = e.target._gpx;
        const xmlDoc = (typeof xmlOrString === 'string') ? new DOMParser().parseFromString(xmlOrString, 'text/xml') : xmlOrString;
    
        function findNearestRoutePoint(latlng){
            let minDist = Infinity;
            let nearestIndex = 0;
            for (let i = 0; i < routeData.length; i++) {
                const p = routeData[i];
                const d = map.distance(latlng, [p.lat2, p.lon2]); 
                if (d < minDist) {
                    minDist = d;
                    nearestIndex = i;
                }
            }

            return nearestIndex;
        }
        
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