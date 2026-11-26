// oramara/backend/src/services/overpass.js
import { trackUsage } from '../usage.js';
// Finds clubs, pitches and golf courses in a county using free OpenStreetMap data.
// Please keep searches modest: the public Overpass server is shared by everyone.

// Public Overpass servers. If one is busy or down, the next one is tried.
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];
const TIMEOUT_MS = 60000;

const OSM_COUNTY_NAMES = { Derry: 'County Londonderry' };

const SPORT_FILTERS = {
  gaa: 'gaelic|hurling|camogie',
  soccer: 'soccer',
  rugby: 'rugby'
};

export async function findVenues({ county, types }) {
  const areaName = OSM_COUNTY_NAMES[county] || `County ${county}`;
  const parts = [];

  for (const type of types) {
    if (type === 'golf') {
      parts.push('nwr["leisure"="golf_course"](area.a);');
      continue;
    }
    const sport = SPORT_FILTERS[type];
    if (!sport) continue;
    parts.push(`nwr["club"="sport"]["sport"~"${sport}"](area.a);`);
    parts.push(`nwr["leisure"~"pitch|sports_centre|stadium"]["sport"~"${sport}"]["name"](area.a);`);
  }

  if (!parts.length) return [];

  const ql = `[out:json][timeout:90];
area["name"="${areaName}"]["boundary"="administrative"]->.a;
(
${parts.join('\n')}
);
out center tags;`;

  const json = await queryOverpass(ql);
  const seen = new Set();
  const venues = [];

  for (const el of json.elements || []) {
    const t = el.tags || {};
    const name = t.name || t['name:en'] || t['name:ga'];
    if (!name) continue;

    const type = classify(t);
    if (!types.includes(type)) continue;

    const key = `${type}:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    venues.push({
      osm_id: `${el.type}/${el.id}`,
      name,
      type,
      county,
      lat: el.lat ?? el.center?.lat ?? null,
      lon: el.lon ?? el.center?.lon ?? null,
      website: t.website || t['contact:website'] || null,
      phone: t.phone || t['contact:phone'] || null,
      email: t.email || t['contact:email'] || null,
      address: [t['addr:street'], t['addr:city'] || t['addr:town'] || t['addr:village']].filter(Boolean).join(', ') || null
    });
  }

  return venues.sort((a, b) => a.name.localeCompare(b.name));
}

// Pitch and green outlines near a lead, so the analysis can skip hand drawing.
// Returns shapes as [[lat, lon], ...] with the nearest first.
export async function findGrounds(lat, lon) {
  const ql = `[out:json][timeout:40];
(
  way["leisure"="pitch"](around:450,${lat},${lon});
  way["golf"="green"](around:700,${lat},${lon});
);
out geom tags;`;

  // Short wait: if the servers are slow, drawing the corners by hand is quicker
  const json = await queryOverpass(ql, 25000, { race: true });
  const shapes = [];

  for (const el of json.elements || []) {
    const t = el.tags || {};
    const coords = (el.geometry || []).map((g) => [g.lat, g.lon]);
    if (coords.length > 3 && sameSpot(coords[0], coords[coords.length - 1])) coords.pop();
    if (coords.length < 3) continue;

    const isGreen = t.golf === 'green';
    if (!isGreen && SMALL_SPORTS.test(t.sport || '')) continue;

    const area = areaOf(coords);
    if (!isGreen && area < 2500) continue; // skips tennis courts, cages and small grids

    const centre = [avg(coords.map((c) => c[0])), avg(coords.map((c) => c[1]))];
    shapes.push({
      id: `way/${el.id}`,
      kind: isGreen ? 'green' : 'pitch',
      sport: t.sport || null,
      name: t.name || t.ref || (isGreen ? 'Golf green' : 'Pitch'),
      surface: t.surface || null,
      areaM2: Math.round(area),
      distanceM: Math.round(distance(centre, [lat, lon])),
      coords
    });
  }

  return shapes.sort((a, b) => a.distanceM - b.distanceM).slice(0, 30);
}

const SMALL_SPORTS = /tennis|basketball|netball|padel|volleyball|handball|skate|athletics|running|equestrian|shooting|boules|bowls/;

function sameSpot(a, b) {
  return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
}

function avg(list) {
  return list.reduce((s, v) => s + v, 0) / list.length;
}

function areaOf(coords) {
  const k = Math.cos((coords[0][0] * Math.PI) / 180);
  const pts = coords.map(([la, lo]) => [lo * 111320 * k, la * 111320]);
  let sum = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) sum += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return Math.abs(sum / 2);
}

function distance(a, b) {
  const k = Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 111320 * k);
}

// Overpass now refuses requests (406) that do not identify the app and a contact.
function overpassHeaders() {
  const contact = process.env.OSM_CONTACT_EMAIL;
  if (!contact) {
    const err = new Error('Set OSM_CONTACT_EMAIL in backend/.env so the map servers accept our searches.');
    err.status = 500;
    err.expose = true;
    throw err;
  }
  const site = process.env.PUBLIC_SITE_URL || 'https://oramara.ie';
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': `OramaraLeadFinder/0.1 (+${site}; contact: ${contact})`,
    Referer: `${site}/`,
    Accept: '*/*'
  };
}

// When every server failed recently, skip OpenStreetMap for a while so Auto goes straight to Claude
let allFailedAt = 0;
const COOL_OFF_MS = 10 * 60 * 1000;
export const overpassCoolingOff = () => Date.now() - allFailedAt < COOL_OFF_MS;

// race: ask all servers at once and take the first answer (used by Auto, where waiting matters)
async function queryOverpass(ql, timeoutMs = TIMEOUT_MS, { race = false } = {}) {
  trackUsage({ provider: 'openstreetmap', operation: 'overpass', units: 1, unitName: 'requests' });
  const headers = overpassHeaders();
  const failures = [];

  const ask = async (endpoint, signal) => {
    const res = await fetch(endpoint, { method: 'POST', headers, body: new URLSearchParams({ data: ql }), signal });
    if (!res.ok) throw new Error(`${new URL(endpoint).host} ${res.status}`);
    return res.json();
  };
  const reason = (endpoint, err) =>
    err.name === 'TimeoutError' || err.name === 'AbortError' ? `${new URL(endpoint).host} timed out` : err.message;

  if (race) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const json = await Promise.any(
        ENDPOINTS.map((e) =>
          ask(e, controller.signal).catch((err) => {
            failures.push(reason(e, err));
            throw err;
          })
        )
      );
      controller.abort(); // stop the slower servers
      allFailedAt = 0;
      return json;
    } catch {
      // all failed, handled below
    } finally {
      clearTimeout(timer);
    }
  } else {
    for (const endpoint of ENDPOINTS) {
      try {
        const json = await ask(endpoint, AbortSignal.timeout(timeoutMs));
        allFailedAt = 0;
        return json;
      } catch (err) {
        failures.push(reason(endpoint, err));
      }
    }
  }

  allFailedAt = Date.now();
  console.error('Overpass failed on every server:', failures.join(', '));
  const blocked = failures.some((f) => / 406$/.test(f));
  const err = new Error(blocked
    ? 'The map servers refused the search (406). Check OSM_CONTACT_EMAIL in backend/.env, then try again in a few minutes.'
    : 'The map servers are busy right now. Wait a minute and try again.');
  err.status = 502;
  err.expose = true;
  throw err;
}

function classify(tags) {
  if (tags.leisure === 'golf_course' || /golf/.test(tags.sport || '')) return 'golf';
  const sport = tags.sport || '';
  if (/gaelic|hurling|camogie/.test(sport)) return 'gaa';
  if (/rugby/.test(sport)) return 'rugby';
  if (/soccer/.test(sport)) return 'soccer';
  return 'other';
}

// ---------- Automatic outlines ----------

const SPORT_MATCH = {
  gaa: /gaelic|hurling|camogie/,
  soccer: /soccer|football/,
  rugby: /rugby/
};

// Finds the main pitch for a club (and the grounds around it) from OpenStreetMap.
// Returns { pitch: [[lat, lon] x4] | null, grounds: [[lat, lon] x4] | null, name }
export async function autoOutline(lat, lon, type) {
  const ql = `[out:json][timeout:25];
(
  way["leisure"="pitch"](around:450,${lat},${lon});
  way["golf"="green"](around:700,${lat},${lon});
  way["leisure"~"sports_centre|stadium|recreation_ground"](around:450,${lat},${lon});
  way["landuse"="recreation_ground"](around:450,${lat},${lon});
);
out geom tags;`;

  const json = await queryOverpass(ql, 25000, { race: true });
  const pitches = [];
  const grounds = [];

  for (const el of json.elements || []) {
    const t = el.tags || {};
    const coords = (el.geometry || []).map((g) => [g.lat, g.lon]);
    if (coords.length > 3 && sameSpot(coords[0], coords[coords.length - 1])) coords.pop();
    if (coords.length < 3) continue;
    const area = areaOf(coords);
    const centre = [avg(coords.map((c) => c[0])), avg(coords.map((c) => c[1]))];
    const item = { coords, area, centre, distance: distance(centre, [lat, lon]), tags: t };

    if (t.leisure === 'pitch' || t.golf === 'green') pitches.push(item);
    else if (area < 400000) grounds.push(item); // skip huge parks
  }

  // Pick the pitch: the right sport, then the biggest one close to the club pin (the main pitch)
  let pitch = null;
  if (type === 'golf') {
    pitch = pitches.filter((p) => p.tags.golf === 'green').sort((a, b) => a.distance - b.distance)[0] || null;
  } else {
    const sportOk = (p) => SPORT_MATCH[type]?.test(p.tags.sport || '');
    const bigEnough = (p) => p.area > 4000 && !SMALL_SPORTS.test(p.tags.sport || '');
    const near = pitches.filter((p) => p.distance < 350 && bigEnough(p));
    const ranked = (list) => list.sort((a, b) => b.area - a.area);
    pitch = ranked(near.filter(sportOk))[0] || ranked(near.filter((p) => !p.tags.sport))[0] || ranked(near)[0] || null;
  }

  // Grounds: the smallest sports ground outline that contains the pitch
  let site = null;
  if (pitch && type !== 'golf') {
    site = grounds
      .filter((g) => g.area > pitch.area * 1.05 && pointInPolygon(pitch.centre, g.coords))
      .sort((a, b) => a.area - b.area)[0] || null;
  }

  return {
    pitch: pitch ? minRectangle(pitch.coords) : null,
    grounds: site ? boundingBox(site.coords) : null,
    name: pitch?.tags.name || null
  };
}

function pointInPolygon([y, x], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function boundingBox(coords) {
  const lats = coords.map((c) => c[0]);
  const lons = coords.map((c) => c[1]);
  const [s, n, w, e] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  return [[n, w], [n, e], [s, e], [s, w]];
}

// Smallest rotated rectangle around an outline, so a pitch drawn with many points becomes 4 corners
export function minRectangle(coords) {
  if (coords.length === 4) return coords;
  const lat0 = coords[0][0];
  const k = Math.cos((lat0 * Math.PI) / 180);
  const pts = coords.map(([la, lo]) => [lo * 111320 * k, la * 111320]);
  let best = null;
  for (let deg = 0; deg < 90; deg += 0.5) {
    const a = (deg * Math.PI) / 180;
    const cos = Math.cos(a), sin = Math.sin(a);
    const rot = pts.map(([x, y]) => [x * cos + y * sin, -x * sin + y * cos]);
    const xs = rot.map((p) => p[0]);
    const ys = rot.map((p) => p[1]);
    const box = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const area = (box[1] - box[0]) * (box[3] - box[2]);
    if (!best || area < best.area) best = { area, box, cos, sin };
  }
  const { box, cos, sin } = best;
  const corners = [[box[0], box[3]], [box[1], box[3]], [box[1], box[2]], [box[0], box[2]]];
  return corners.map(([u, v]) => {
    const x = u * cos - v * sin;
    const y = u * sin + v * cos;
    return [y / 111320, x / (111320 * k)];
  });
}