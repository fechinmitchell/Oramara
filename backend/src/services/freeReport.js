// oramara/backend/src/services/freeReport.js
// Free 3 month FieldFalcon reports asked for on the website.
// A club gives its name, the contact's name and email. We find the pitch, run the same analysis as the admin map,
// save it to the club's portal with 3 months free and hand back a report link to show on screen.
//
// Guards against people using up the API credit:
//   one report per inbox (email_key), one report per club, limits per IP address (in the route),
//   a daily spend cap and a daily count cap set in the admin, and one report made at a time.
// Requests over the cap wait in the queue and are made when the next day's budget allows.

import crypto from 'node:crypto';
import { query } from '../db.js';
import { runWithUsage, trackUsage } from '../usage.js';
import { createMapAnalysis } from '../routes/analyses.js';
import { createLink } from '../routes/portalAdmin.js';
import { autoOutline, overpassCoolingOff } from './overpass.js';
import { captureArea, pixelToLatLon } from './imagery.js';
import { claudeEnabled, locatePitch } from './claudeReport.js';

export const FREE_MONTHS = 3;
const TRIAL_DAYS = 90;
const DEFAULT_SETTINGS = { enabled: true, dailyCapUsd: 1, maxPerDay: 20 };
// What one report usually costs before we have our own history to go on (Claude writing the report)
const FIRST_ESTIMATE_USD = Number(process.env.FREE_REPORT_ESTIMATE_USD) || 0.15;
const CLUB_REPEAT_DAYS = 180;

// Throwaway inbox services, so the one per email rule means something
const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', '10minutemail.com', 'tempmail.com',
  'temp-mail.org', 'yopmail.com', 'trashmail.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'mintemail.com',
  'throwawaymail.com', 'fakeinbox.com', 'mailnesia.com', 'tempmailo.com', 'emailondeck.com', 'moakt.com', 'tempr.email'
]);

// ---------- Settings ----------

export async function getSettings() {
  const row = (await query(`SELECT value FROM app_settings WHERE key = 'free_reports'`)).rows[0];
  return { ...DEFAULT_SETTINGS, ...(row?.value || {}) };
}

export async function saveSettings(input = {}) {
  const current = await getSettings();
  const next = {
    enabled: input.enabled === undefined ? current.enabled : Boolean(input.enabled),
    dailyCapUsd: input.dailyCapUsd === undefined ? current.dailyCapUsd : clampNumber(input.dailyCapUsd, 0, 100),
    maxPerDay: input.maxPerDay === undefined ? current.maxPerDay : Math.round(clampNumber(input.maxPerDay, 0, 500))
  };
  await query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('free_reports', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(next)]
  );
  kick();
  return next;
}

// Spend and count today (server day, UTC) for free reports only, and what the next one is likely to cost
export async function today() {
  const spend = (
    await query(
      `SELECT COALESCE(SUM(u.cost_usd), 0)::float AS spent
       FROM api_usage u
       WHERE u.created_at >= date_trunc('day', NOW())
         AND u.lead_id IN (SELECT lead_id FROM free_reports WHERE lead_id IS NOT NULL)`
    )
  ).rows[0].spent;
  const made = (
    await query(`SELECT COUNT(*)::int AS n FROM free_reports WHERE started_at >= date_trunc('day', NOW())`)
  ).rows[0].n;
  // Average cost of the last 10 finished reports, as a guess for the next one
  const recent = (
    await query(
      `SELECT AVG(c)::float AS avg FROM (
         SELECT (SELECT COALESCE(SUM(cost_usd), 0) FROM api_usage u WHERE u.analysis_id = f.analysis_id) AS c
         FROM free_reports f WHERE f.status = 'ready' AND f.analysis_id IS NOT NULL
         ORDER BY f.finished_at DESC LIMIT 10) t`
    )
  ).rows[0].avg;
  const estimate = claudeEnabled() ? Math.max(0.01, recent || FIRST_ESTIMATE_USD) : 0;
  return { spent: spend, made, estimate };
}

async function budgetAllows() {
  const s = await getSettings();
  if (!s.enabled) return false;
  const t = await today();
  if (t.made >= s.maxPerDay) return false;
  return t.spent + t.estimate <= s.dailyCapUsd;
}

// ---------- Checks on the request ----------

// The same inbox written differently counts once: case, +tags and Gmail dots
export function emailKey(email) {
  const e = String(email || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1) return e;
  let local = e.slice(0, at).split('+')[0];
  let domain = e.slice(at + 1);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

export const isDisposable = (email) => DISPOSABLE.has(String(email || '').split('@').pop().toLowerCase());

// Club names written differently count once: "Clifden GAA Club" and "clifden g.a.a." are the same club
export function clubKey(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/g\.?\s*a\.?\s*a\.?/g, 'gaa')
    .replace(/\b(club|cumann|cumman|clg|the|and|&)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ---------- Making a request ----------

export async function createRequest({ email, contactName, clubName, county, pitchType, ip, baseUrl }) {
  const key = emailKey(email);
  const club = clubKey(clubName);

  const byEmail = (await query('SELECT * FROM free_reports WHERE email_key = $1', [key])).rows[0];
  if (byEmail) return { duplicate: 'email', request: byEmail };

  const byClub = (
    await query(
      `SELECT * FROM free_reports WHERE club_key = $1 AND created_at > NOW() - ($2 || ' days')::interval
       ORDER BY created_at DESC LIMIT 1`,
      [club, String(CLUB_REPEAT_DAYS)]
    )
  ).rows[0];

  // Same club again under another email: note it on the club's lead, no second report
  if (byClub) {
    const note = `Asked for a free FieldFalcon report again (${contactName}, ${email}). The club already had one.`;
    if (byClub.lead_id) {
      await query(`UPDATE leads SET notes = CONCAT_WS(E'\\n', notes, $2::text), updated_at = NOW() WHERE id = $1`, [byClub.lead_id, note]);
    }
    return { duplicate: 'club', request: byClub };
  }
  const leadId = await upsertLead({ clubName, county, contactName, email, pitchType });

  const token = crypto.randomBytes(24).toString('base64url');
  const { rows } = await query(
    `INSERT INTO free_reports (token, email, email_key, contact_name, club_name, club_key, county, pitch_type, ip, base_url, lead_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [token, String(email).trim().toLowerCase(), key, contactName, clubName, club, county, pitchType, ip, baseUrl, leadId]
  );
  // The club shows in the admin Customer portal straight away, before the report is made.
  // The free trial clock starts when the club first opens its report.
  await query(`INSERT INTO portal_access (lead_id, status) VALUES ($1, 'trial') ON CONFLICT (lead_id) DO NOTHING`, [leadId]);
  kick();
  return { request: rows[0] };
}

// The club goes into the leads list either way, so the team can follow up even when no report is made
async function upsertLead({ clubName, county, contactName, email, pitchType }) {
  const note = `Asked for a free FieldFalcon report on the website (${contactName}, ${email})`;
  const existing = (await query('SELECT id, notes FROM leads WHERE lower(name) = lower($1) ORDER BY id LIMIT 1', [clubName])).rows[0];
  if (existing) {
    await query(
      `UPDATE leads SET contact_name = COALESCE(contact_name, $2), email = COALESCE(email, $3), county = COALESCE(county, $4),
         notes = CONCAT_WS(E'\n', notes, $5::text), updated_at = NOW() WHERE id = $1`,
      [existing.id, contactName, email, county, note]
    );
    return existing.id;
  }
  const { rows } = await query(
    `INSERT INTO leads (name, type, county, contact_name, email, status, source, notes)
     VALUES ($1, $2, $3, $4, $5, 'new', 'free_report', $6) RETURNING id`,
    [clubName, pitchType, county, contactName, email, note]
  );
  return rows[0].id;
}

// What the website sees: never the email or the inner workings
export function publicView(r, settings) {
  return {
    token: r.token,
    club: r.club_name,
    status: r.status,
    url: r.status === 'ready' ? r.link_url : null,
    months: FREE_MONTHS,
    paused: settings ? !settings.enabled : false
  };
}

export async function findByToken(token) {
  return (await query('SELECT * FROM free_reports WHERE token = $1', [String(token || '')])).rows[0] || null;
}

// ---------- The queue ----------

let busy = false;

// Look for work now. Safe to call often: only one report is made at a time.
export function kick() {
  if (busy) return;
  busy = true;
  drain()
    .catch((err) => console.error('Free report queue stopped:', err.message))
    .finally(() => {
      busy = false;
    });
}

async function drain() {
  for (;;) {
    const next = (
      await query(
        `SELECT * FROM free_reports WHERE status IN ('pending', 'queued') ORDER BY created_at LIMIT 1`
      )
    ).rows[0];
    if (!next) return;
    if (!(await budgetAllows())) {
      await query(`UPDATE free_reports SET status = 'queued' WHERE status = 'pending'`);
      return;
    }
    await makeReport(next);
  }
}

// On start: anything cut off by a restart goes back in the queue. Then check the queue every 15 minutes,
// so requests held back by the cap are made once a new day starts.
export function startQueue() {
  query(`UPDATE free_reports SET status = 'pending' WHERE status = 'running'`)
    .then(kick)
    .catch((err) => console.error('Free report queue could not start:', err.message));
  setInterval(kick, 15 * 60 * 1000).unref();
}

async function makeReport(r) {
  await query(`UPDATE free_reports SET status = 'running', started_at = NOW(), attempts = attempts + 1 WHERE id = $1`, [r.id]);
  try {
    await runWithUsage({ leadId: r.lead_id }, async () => {
      const spot = await findPitch(r);
      if (!spot) {
        await finish(r.id, 'needs_review', 'Could not find the pitch on the map');
        return;
      }
      const analysisId = await createMapAnalysis(
        {
          lead_id: r.lead_id,
          pitch_type: r.pitch_type,
          polygon: spot.pitch,
          grounds: spot.grounds || [],
          period: FREE_MONTHS,
          area_kind: 'main',
          label: 'Main pitch'
        },
        { saved: true }
      );
      await query('UPDATE analyses SET in_portal = true, portal_at = NOW(), portal_months = $1 WHERE id = $2', [FREE_MONTHS, analysisId]);
      const share = await createLink({ headers: { origin: r.base_url } }, r.lead_id, analysisId, {
        email: r.email,
        name: r.contact_name,
        trialDays: TRIAL_DAYS
      });
      await query(
        `UPDATE free_reports SET status = 'ready', analysis_id = $2, link_url = $3, error = NULL, finished_at = NOW() WHERE id = $1`,
        [r.id, analysisId, share.url]
      );
      await query(`UPDATE leads SET status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END, updated_at = NOW() WHERE id = $1`, [r.lead_id]);
    });
  } catch (err) {
    console.error(`Free report for ${r.club_name} failed:`, err.message);
    // A busy map or photo server is worth one more try later; anything else goes to the team
    const retry = r.attempts + 1 < 2 && (err.status === 502 || /fetch|timeout|busy/i.test(err.message));
    await finish(r.id, retry ? 'queued' : 'needs_review', String(err.message).slice(0, 300));
  }
}

async function finish(id, status, error) {
  await query(`UPDATE free_reports SET status = $2, error = $3, finished_at = NOW() WHERE id = $1`, [id, status, error]);
}

// ---------- Finding the pitch ----------

async function findPitch(r) {
  const lead = (await query('SELECT lat, lon FROM leads WHERE id = $1', [r.lead_id])).rows[0];
  let place = lead?.lat && lead?.lon ? { lat: Number(lead.lat), lon: Number(lead.lon) } : null;
  if (!place) place = await geocode(r.club_name, r.county, r.pitch_type);
  if (!place) return null;
  await query('UPDATE leads SET lat = COALESCE(lat, $2), lon = COALESCE(lon, $3) WHERE id = $1', [r.lead_id, place.lat, place.lon]);

  if (!overpassCoolingOff()) {
    try {
      const osm = await autoOutline(place.lat, place.lon, r.pitch_type);
      if (osm?.pitch) return { pitch: osm.pitch, grounds: osm.grounds };
    } catch (err) {
      console.error('Free report: OpenStreetMap outline skipped:', err.message);
    }
  }
  // No outline on the map: let Claude find the pitch in the photo, if it is set up
  if (claudeEnabled()) {
    const shot = await captureArea(squareAround(place.lat, place.lon, 380));
    const found = await locatePitch(shot.image, r.pitch_type, shot.metresPerPixel);
    if (found && found.confidence !== 'low') {
      const toGeo = (q) => q.map(([x, y]) => pixelToLatLon(shot, x, y));
      return { pitch: toGeo(found.pitch), grounds: found.grounds ? toGeo(found.grounds) : null };
    }
  }
  return null;
}

// Club name to a map position with OpenStreetMap's search, in Ireland only
async function geocode(clubName, county, pitchType) {
  const contact = process.env.OSM_CONTACT_EMAIL || 'not set';
  const site = process.env.PUBLIC_SITE_URL || 'https://oramara.ie';
  const names = [clubName];
  if (pitchType === 'gaa' && !/gaa|cumann|clg/i.test(clubName)) names.push(`${clubName} GAA`);
  const tries = names.flatMap((n) => (county ? [`${n}, ${county}`, n] : [n]));

  for (const q of tries) {
    const params = new URLSearchParams({ q, format: 'json', countrycodes: 'ie,gb', limit: '5', addressdetails: '0' });
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { 'User-Agent': `OramaraFieldFalcon/0.1 (+${site}; contact: ${contact})`, Referer: `${site}/` },
        signal: AbortSignal.timeout(15000)
      });
      trackUsage({ provider: 'openstreetmap', operation: 'geocode', units: 1, unitName: 'searches' });
      if (!res.ok) continue;
      const list = (await res.json()) || [];
      // Island of Ireland only, sports grounds first
      const inIreland = list.filter((p) => +p.lat > 51.3 && +p.lat < 55.5 && +p.lon > -10.8 && +p.lon < -5.3);
      const best =
        inIreland.find((p) => p.class === 'leisure') ||
        inIreland.find((p) => ['amenity', 'club', 'building'].includes(p.class)) ||
        null;
      if (best) return { lat: Number(best.lat), lon: Number(best.lon) };
    } catch (err) {
      console.error('Free report: map search failed:', err.message);
    }
    await new Promise((r) => setTimeout(r, 1100)); // the search service allows one request a second
  }
  return null;
}

function squareAround(lat, lon, metres) {
  const dLat = metres / 2 / 111320;
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  return [[lat + dLat, lon - dLon], [lat + dLat, lon + dLon], [lat - dLat, lon + dLon], [lat - dLat, lon - dLon]];
}

function clampNumber(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
