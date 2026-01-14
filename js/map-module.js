export function getMap(){
    return map;
}

const map = L.map('map', {
    minZoom: 2.2,
    maxZoom: 18,
    worldCopyJump: false,
}).setView([20, 0], 2.2);

const worldBounds = [[-85, -180], [85, 180]];
map.setMaxBounds(worldBounds);

const tileURL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
L.GPX.prototype._fitBounds = function() {};

const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'; 

const base = L.tileLayer(tileURL, {
    attribution,
    maxZoom: 18,
    updateWhenIdle: false,
    updateWhenZooming: true,
    keepBuffer: 5})
    .addTo(map); 

const satellite = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', 
  {
    maxZoom: 19,
    attribution: 'Tiles © Esri'
  }
);

const topo = L.tileLayer(
  'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', 
  {
    maxZoom: 20,
    attribution: '© CyclOSM'
  }
);

const baseLayers = {
  "Base": base,
  "Satellite": satellite,
  "Topo": topo
};

L.control.layers(baseLayers).addTo(map);

