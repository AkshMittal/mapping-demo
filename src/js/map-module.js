export function getMap(){
    return map;
}
let isPanning = false;

export function isMapPanning() {
  return isPanning;
}

const map = L.map('map', {
    minZoom: 2.2,
    maxZoom: 15,
    wheelPxPerZoomLevel: 100,
    worldCopyJump: false,
}).setView([20, 0], 2.2);
map.on('movestart', () => {
  isPanning = true;

  const canvas = document.getElementById('elevationChart');
  if (canvas) {
    canvas.classList.add('chart-disabled');
  }
});

map.on('moveend', () => {
  isPanning = false;

  const canvas = document.getElementById('elevationChart');
  if (canvas) {
    canvas.classList.remove('chart-disabled');
  }
});


const worldBounds = [[-85, -180], [85, 180]];
map.setMaxBounds(worldBounds);

const tileURL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'; 

const base = L.tileLayer(tileURL, {
    attribution,
    maxZoom: 15,
    maxNativeZoom: 14,
    updateWhenIdle: false,
    updateWhenZooming: true,
    keepBuffer: 5})
    .addTo(map); 

const satellite = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', 
  {
    maxZoom: 15,
    maxNativeZoom: 14,
    updateWhenIdle: false,
    updateWhenZooming: true,
    keepBuffer: 5,
    attribution: 'Tiles © Esri'
  }
);

const topo = L.tileLayer(
  'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', 
  {
    maxZoom: 15,
    maxNativeZoom: 14,
    updateWhenIdle: false,
    updateWhenZooming: true,
    keepBuffer: 5,
    attribution: '© CyclOSM'
  }
);

const baseLayers = {
  "Base": base,
  "Satellite": satellite,
  "Topo": topo
};

L.control.layers(baseLayers).addTo(map);

