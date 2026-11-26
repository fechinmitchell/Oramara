// oramara/frontend/src/lib/leafletGlobal.js
// The rotation plugin looks for Leaflet on the global object, so put it there first.
import L from 'leaflet';

globalThis.L = L;

export default L;