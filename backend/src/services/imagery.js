// oramara/backend/src/services/imagery.js
// Builds one aerial image of a marked area by stitching satellite map tiles,
// and converts the marked corners (lat, lon) into pixel positions on that image.

import sharp from 'sharp';
import { trackUsage } from '../usage.js';

const TILE = 256;
const MAX_ZOOM = 19;
const MIN_ZOOM = 15;
const TARGET_PX = 1400; // longest side of the stitched image
const MARGIN = 0.18; // extra ground shown around the marked area
const MAX_TILES = 64;

const DEFAULT_TILE_URL = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export const IMAGERY_SOURCE = 'Esri World Imagery (Esri, Maxar, Earthstar Geographics)';

function tileUrl(z, x, y) {
  const base = process.env.IMAGERY_TILE_URL || DEFAULT_TILE_URL;
  const url = base.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  const key = process.env.IMAGERY_API_KEY;
  return key ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(key)}` : url;
}

// Web Mercator: lat, lon to world pixels at a zoom level
function project(lat, lon, z) {
  const size = TILE * 2 ** z;
  const sin = Math.sin((lat * Math.PI) / 180);
  return [((lon + 180) / 360) * size, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size];
}

// World pixels back to lat, lon
function unproject(x, y, z) {
  const size = TILE * 2 ** z;
  const lon = (x / size) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / size;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return [lat, lon];
}

export function metresAcross(geoPolygon) {
  const lats = geoPolygon.map((p) => p[0]);
  const lons = geoPolygon.map((p) => p[1]);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const h = (Math.max(...lats) - Math.min(...lats)) * 111320;
  const w = (Math.max(...lons) - Math.min(...lons)) * 111320 * Math.cos((midLat * Math.PI) / 180);
  return { width: w, height: h };
}

export function areaM2(geoPolygon) {
  const midLat = geoPolygon.reduce((s, p) => s + p[0], 0) / geoPolygon.length;
  const k = Math.cos((midLat * Math.PI) / 180);
  const pts = geoPolygon.map(([lat, lon]) => [lon * 111320 * k, lat * 111320]);
  let sum = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) sum += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return Math.abs(sum / 2);
}

function pickZoom(geoPolygon, maxZoom = MAX_ZOOM) {
  for (let z = maxZoom; z >= MIN_ZOOM; z--) {
    const px = geoPolygon.map(([lat, lon]) => project(lat, lon, z));
    const w = Math.max(...px.map((p) => p[0])) - Math.min(...px.map((p) => p[0]));
    const h = Math.max(...px.map((p) => p[1])) - Math.min(...px.map((p) => p[1]));
    if (Math.max(w, h) * (1 + 2 * MARGIN) <= TARGET_PX) return z;
  }
  return MIN_ZOOM;
}

async function fetchTile(z, x, y) {
  const res = await fetch(tileUrl(z, x, y), {
    headers: { 'User-Agent': `OramaraTurfReports/0.1 (contact: ${process.env.OSM_CONTACT_EMAIL || 'not set'})` },
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error(`tile ${z}/${x}/${y} returned ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Tiles with no real imagery come back as one flat colour
async function isBlank(buffer) {
  const { channels } = await sharp(buffer).stats();
  return channels.slice(0, 3).every((c) => c.stdev < 4);
}

// pitch: the area that is measured. grounds: optional wider area shown for context.
async function stitch(pitch, grounds, z) {
  const toPx = (poly) => poly.map(([lat, lon]) => project(lat, lon, z));
  const px = toPx([...pitch, ...grounds]);
  const xs = px.map((p) => p[0]);
  const ys = px.map((p) => p[1]);
  const pad = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * MARGIN + 20;
  const left = Math.floor(Math.min(...xs) - pad);
  const top = Math.floor(Math.min(...ys) - pad);
  const right = Math.ceil(Math.max(...xs) + pad);
  const bottom = Math.ceil(Math.max(...ys) + pad);

  const tx0 = Math.floor(left / TILE), tx1 = Math.floor(right / TILE);
  const ty0 = Math.floor(top / TILE), ty1 = Math.floor(bottom / TILE);
  const count = (tx1 - tx0 + 1) * (ty1 - ty0 + 1);
  if (count > MAX_TILES) throw userError('That area is too big. Mark a single pitch or green.');

  const jobs = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      jobs.push(fetchTile(z, tx, ty).then((buf) => ({ buf, left: (tx - tx0) * TILE, top: (ty - ty0) * TILE })));
    }
  }
  const tiles = await Promise.all(jobs);
  trackUsage({ provider: 'esri', operation: 'tiles', units: tiles.length, unitName: 'map tiles' });
  const blanks = (await Promise.all(tiles.map((t) => isBlank(t.buf)))).filter(Boolean).length;

  const canvas = await sharp({
    create: { width: (tx1 - tx0 + 1) * TILE, height: (ty1 - ty0 + 1) * TILE, channels: 3, background: '#808080' }
  })
    .composite(tiles.map((t) => ({ input: t.buf, left: t.left, top: t.top })))
    .png()
    .toBuffer();

  const cropLeft = left - tx0 * TILE;
  const cropTop = top - ty0 * TILE;
  const width = right - left;
  const height = bottom - top;

  const image = await sharp(canvas)
    .extract({ left: cropLeft, top: cropTop, width, height })
    .jpeg({ quality: 90 })
    .toBuffer();

  return {
    image,
    width,
    height,
    zoom: z,
    blankShare: blanks / tiles.length,
    origin: { left, top }, // world pixel of the image's top left corner, for pixel to lat, lon
    // [[south, west], [north, east]] so the map can lay the result over the right spot
    bounds: [unproject(left, bottom, z), unproject(right, top, z)],
    polygon: toPx(pitch).map(([x, y]) => [x - left, y - top]),
    groundsPolygon: toPx(grounds).map(([x, y]) => [x - left, y - top])
  };
}

// Returns the stitched image plus the polygon in image pixels
// maxZoom: goalmouths ask for 20, the closest Esri has in some places (it falls back if there is no photo that close)
export async function captureArea(geoPolygon, groundsPolygon = [], { maxZoom = MAX_ZOOM } = {}) {
  const everything = [...geoPolygon, ...groundsPolygon];
  const { width, height } = metresAcross(everything);
  if (Math.max(width, height) > 1500) throw userError('That area is too big. Mark a single pitch or green.');
  if (Math.max(width, height) < 10) throw userError('That area is too small. Mark the corners of the pitch.');

  let z = pickZoom(everything, maxZoom);
  let lastError;
  // Some rural areas have no top zoom imagery, so step down until we get a real picture
  for (let tries = 0; tries < 3 && z >= MIN_ZOOM; tries++, z--) {
    try {
      const shot = await stitch(geoPolygon, groundsPolygon, z);
      if (shot.blankShare < 0.25) {
        return { ...shot, metresPerPixel: metresPerPixel(geoPolygon, z), source: IMAGERY_SOURCE };
      }
      lastError = new Error('Imagery not available at this zoom');
    } catch (err) {
      if (err.expose) throw err;
      lastError = err;
    }
  }
  console.error('Imagery capture failed:', lastError?.message);
  throw userError('Could not get satellite imagery for this spot. Try again in a minute.', 502);
}

function metresPerPixel(geoPolygon, z) {
  const lat = geoPolygon[0][0];
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
}

function userError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}

// Image pixel on a captured shot back to [lat, lon]
// Lat, lon to a pixel in a captured image (for areas marked to leave out)
export function latLonToPixel(shot, lat, lon) {
  const [x, y] = project(lat, lon, shot.zoom);
  return [x - shot.origin.left, y - shot.origin.top];
}

export function pixelToLatLon(shot, x, y) {
  return unproject(shot.origin.left + x, shot.origin.top + y, shot.zoom);
}

// When was the photo taken at this spot? Esri publishes this per area in the World Imagery citations layer.
// Best effort: returns null if the service does not answer.
export async function photoDate(lat, lon) {
  const base = (process.env.IMAGERY_TILE_URL || DEFAULT_TILE_URL).split('/tile/')[0];
  const params = new URLSearchParams({
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'SRC_DATE,SRC_DATE2,SRC_RES,NICE_DESC,NICE_NAME',
    returnGeometry: 'false',
    f: 'json'
  });
  if (process.env.IMAGERY_API_KEY) params.set('token', process.env.IMAGERY_API_KEY);
  try {
    const res = await fetch(`${base}/4/query?${params}`, { signal: AbortSignal.timeout(10000) });
    trackUsage({ provider: 'esri', operation: 'photo_date', units: 1, unitName: 'requests' });
    const data = await res.json();
    const items = (data.features || [])
      .map((f) => f.attributes || {})
      .map((a) => ({ date: toDate(a.SRC_DATE2, a.SRC_DATE), res: Number(a.SRC_RES) || 99, source: a.NICE_NAME || a.NICE_DESC || null }))
      .filter((a) => a.date);
    if (!items.length) return null;
    items.sort((a, b) => a.res - b.res); // sharpest layer is what we analysed
    return { date: items[0].date, resolutionM: items[0].res, source: items[0].source };
  } catch (err) {
    console.error('Photo date lookup failed:', err.message);
    return null;
  }
}

function toDate(epochMs, yyyymmdd) {
  if (Number.isFinite(epochMs) && epochMs > 0) return new Date(epochMs).toISOString().slice(0, 10);
  const s = String(yyyymmdd || '');
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
}