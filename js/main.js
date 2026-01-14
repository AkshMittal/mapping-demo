import { getMap } 
from './map-module.js';

import { loadGPX } 
from './gpx-engine.js';     

let map = getMap();
let isPanning = false;

loadGPX('./hampta_pass.gpx');
