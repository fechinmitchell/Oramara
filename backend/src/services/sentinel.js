// oramara/backend/src/services/sentinel.js
// Free monthly satellite data from the EU Copernicus programme (Sentinel 2).
// We use NDVI, a plant vigour index from red and near infrared light:
// bare ground is near 0.1, thin grass about 0.4, dense healthy turf 0.75 or more.
// Each month we take the best cloud free view of every 10 m pixel.

import sharp from 'sharp';
import { trackUsage } from '../usage.js';

const TOKEN_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const API = 'https://sh.dataspace.copernicus.eu/api/v1';
const CRS84 = 'http://www.opengis.net/def/crs/OGC/1.3/CRS84';
const MONTHS_BACK = 24;

export const sentinelEnabled = () => Boolean(process.env.CDSE_CLIENT_ID && process.env.CDSE_CLIENT_SECRET);

// Scene classification values we skip: no data, saturated, cloud shadow, clouds, cirrus, snow
const SKIP_SCL = '[0, 1, 3, 8, 9, 10, 11]';

// Vigour bands, kept in line with the chart and the colour ramp
export const STRONG = 0.75;
export const MODERATE = 0.6;

const BEST_NDVI = `
  var best = -1;
  for (var i = 0; i < samples.length; i++) {
    var s = samples[i];
    if (s.dataMask !== 1 || ${SKIP_SCL}.indexOf(s.SCL) !== -1) continue;
    var sum = s.B08 + s.B04;
    if (sum === 0) continue;
    var v = (s.B08 - s.B04) / sum;
    if (v > best) best = v;
  }`;

const STATS_SCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "classes", bands: 3, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ],
    mosaicking: "ORBIT"
  };
}
function evaluatePixel(samples) {
  ${BEST_NDVI}
  // Share of the pitch that is strong, moderate or thin: the mean of each band is the share
  var strong = best >= ${STRONG} ? 1 : 0;
  var moderate = best >= ${MODERATE} && best < ${STRONG} ? 1 : 0;
  var thin = best > -1 && best < ${MODERATE} ? 1 : 0;
  return { ndvi: [best], classes: [strong, moderate, thin], dataMask: [best > -1 ? 1 : 0] };
}`;

// Colour ramp matches the turf map: red thin, amber moderate, green strong
const IMAGE_SCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: { bands: 4, sampleType: "UINT8" },
    mosaicking: "ORBIT"
  };
}
var STOPS = [[0.3, [190, 35, 35]], [0.5, [214, 58, 48]], [0.62, [214, 170, 50]], [0.75, [60, 170, 80]], [0.9, [28, 135, 68]]];
function colour(v) {
  if (v <= STOPS[0][0]) return STOPS[0][1];
  for (var i = 1; i < STOPS.length; i++) {
    if (v <= STOPS[i][0]) {
      var t = (v - STOPS[i - 1][0]) / (STOPS[i][0] - STOPS[i - 1][0]);
      var a = STOPS[i - 1][1], b = STOPS[i][1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
  }
  return STOPS[STOPS.length - 1][1];
}
function evaluatePixel(samples) {
  ${BEST_NDVI}
  if (best === -1) return [0, 0, 0, 0];
  var c = colour(best);
  return [c[0], c[1], c[2], 215];
}`;

let token = null;

async function getToken() {
  if (token && token.expires > Date.now() + 30000) return token.value;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.CDSE_CLIENT_ID,
      client_secret: process.env.CDSE_CLIENT_SECRET
    }),
    signal: AbortSignal.timeout(20000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Copernicus login failed:', res.status, data.error_description || data.error || data);
    throw userError('Could not log in to Copernicus. Check CDSE_CLIENT_ID and CDSE_CLIENT_SECRET in backend/.env.', 502);
  }
  token = { value: data.access_token, expires: Date.now() + (data.expires_in || 600) * 1000 };
  return token.value;
}

async function post(path, body, accept) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await getToken()}`, 'Content-Type': 'application/json', Accept: accept },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000)
  });
  // Free tier: processing units are counted against the monthly allowance, no money is spent
  const spent = Number(res.headers.get('x-processingunits-spent'));
  trackUsage({
    provider: 'copernicus',
    operation: path === '/statistics' ? 'monthly_stats' : 'month_image',
    units: Number.isFinite(spent) ? spent : 0,
    unitName: 'processing units'
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`Copernicus ${path} failed:`, res.status, text.slice(0, 500));
    throw userError(
      res.status === 429 || res.status === 403
        ? 'The free Copernicus allowance is used up for now. Try again later.'
        : 'Could not get the monthly satellite data. Try again in a minute.',
      502
    );
  }
  return res;
}

// geo polygon is [[lat, lon], ...]; Copernicus wants [lon, lat] and a closed ring
function geometry(geo) {
  const ring = geo.map(([lat, lon]) => [lon, lat]);
  ring.push(ring[0]);
  return { type: 'Polygon', coordinates: [ring] };
}

function startOfMonthsAgo(n) {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1));
}

// Average plant vigour inside the pitch for each month
export async function monthlyNdvi(geo) {
  const lat = geo.reduce((s, p) => s + p[0], 0) / geo.length;
  const res = await post(
    '/statistics',
    {
      input: {
        bounds: { geometry: geometry(geo), properties: { crs: CRS84 } },
        data: [{ type: 'sentinel-2-l2a', dataFilter: { maxCloudCoverage: 80 } }]
      },
      aggregation: {
        timeRange: { from: startOfMonthsAgo(MONTHS_BACK - 1).toISOString(), to: new Date().toISOString() },
        aggregationInterval: { of: 'P1M' },
        lastIntervalBehavior: 'SHORTEN',
        evalscript: STATS_SCRIPT,
        // about 5 m sampling so the pitch edges are followed closely
        resx: 5 / (111320 * Math.cos((lat * Math.PI) / 180)),
        resy: 5 / 111320
      }
    },
    'application/json'
  );

  const json = await res.json();
  return (json.data || [])
    .map((d) => {
      const stats = d.outputs?.ndvi?.bands?.B0?.stats;
      const month = d.interval.from.slice(0, 7);
      if (!stats || !stats.sampleCount) return { month, ndvi: null, coverage: 0 };
      const valid = stats.sampleCount - stats.noDataCount;
      const coverage = valid / stats.sampleCount;
      const share = (band) => {
        const v = d.outputs?.classes?.bands?.[band]?.stats?.mean;
        return valid && Number.isFinite(v) ? Math.round(v * 1000) / 10 : null;
      };
      return {
        month,
        ndvi: valid && Number.isFinite(stats.mean) ? round3(stats.mean) : null,
        coverage: round3(coverage),
        strongPct: share('B0'),
        moderatePct: share('B1'),
        thinPct: share('B2')
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month));
}

// Coloured vigour image for one month, covering the box around the pitch
export async function monthImage(geo, month) {
  const lats = geo.map((p) => p[0]);
  const lons = geo.map((p) => p[1]);
  const pad = 0.15;
  let south = Math.min(...lats), north = Math.max(...lats), west = Math.min(...lons), east = Math.max(...lons);
  const dLat = (north - south) * pad, dLon = (east - west) * pad;
  south -= dLat; north += dLat; west -= dLon; east += dLon;

  const midLat = (south + north) / 2;
  const heightM = (north - south) * 111320;
  const widthM = (east - west) * 111320 * Math.cos((midLat * Math.PI) / 180);
  // Native 10 m pixels. We smooth them afterwards, because blending the cloud class band would be wrong.
  const width = Math.max(8, Math.round(widthM / 10));
  const height = Math.max(8, Math.round(heightM / 10));

  const [y, m] = month.split('-').map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 1));

  const res = await post(
    '/process',
    {
      input: {
        bounds: { bbox: [west, south, east, north], properties: { crs: CRS84 } },
        data: [
          {
            type: 'sentinel-2-l2a',
            dataFilter: { timeRange: { from: from.toISOString(), to: to.toISOString() }, maxCloudCoverage: 80 }
          }
        ]
      },
      output: { width, height, responses: [{ identifier: 'default', format: { type: 'image/png' } }] },
      evalscript: IMAGE_SCRIPT
    },
    'image/png'
  );

  // Smooth the 10 m squares and cut the image to the pitch outline
  const UP = 10;
  const W = width * UP;
  const H = height * UP;
  const outline = geo.map(([lat, lon]) => [((lon - west) / (east - west)) * W, ((north - lat) / (north - south)) * H]);
  const mask = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><polygon points="${outline
    .map((p) => p.join(','))
    .join(' ')}" fill="#fff"/></svg>`;
  const png = await sharp(Buffer.from(await res.arrayBuffer()))
    .resize(W, H, { kernel: 'cubic' })
    .composite([{ input: Buffer.from(mask), blend: 'dest-in' }])
    .png()
    .toBuffer();

  return { png, bounds: [[south, west], [north, east]] };
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

function userError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}