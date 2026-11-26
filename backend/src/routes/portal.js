// oramara/backend/src/routes/portal.js
// The customer portal API. Everything here is for one club only: the club comes from the login,
// never from the request, and a club only sees reports Oramara has saved to its portal.
// Guests arrive from a report link with no password; they can read, and are asked to make an account to save ticks.
import { Router } from 'express';
import { query } from '../db.js';
import { wrap, badRequest } from './wrap.js';
import {
  requirePortal,
  requireAccount,
  portalLogin,
  inviteInfo,
  acceptInvite,
  openLink,
  createAccount,
  logEvent,
  loadAccess,
  accessState
} from '../portalAuth.js';
import { loadFull, shapeMonth } from './analyses.js';
import { nextMonths } from '../services/planBuilder.js';
import { sentinelEnabled, monthImage } from '../services/sentinel.js';

const router = Router();

router.post('/login', wrap(portalLogin));
router.get('/invite/:token', wrap(inviteInfo));
router.post('/accept', wrap(acceptInvite));
router.post('/link/:token', wrap(openLink));

router.use(requirePortal);

router.post('/account', wrap(createAccount));

// Who is looking, for the activity log
const who = (req) => ({ leadId: req.client.lead_id, linkId: req.client.link_id || null, userId: req.client.guest ? null : req.client.id });

// How many months a club sees: the free window set for the report, or all 12 for a paying club
async function windowFor(req, id) {
  const access = accessState(await loadAccess(req.client.lead_id));
  const { portal_months: m } = (await query('SELECT portal_months FROM analyses WHERE id = $1', [id])).rows[0];
  const fullAccess = access.status === 'active' && access.plan;
  return fullAccess ? 12 : [1, 3, 6, 12].includes(m) ? m : 12;
}

// The club, its access and its reports
router.get(
  '/me',
  wrap(async (req, res) => {
    const leadId = req.client.lead_id;
    const lead = (await query('SELECT id, name, county, type FROM leads WHERE id = $1', [leadId])).rows[0];
    if (!lead) return res.status(404).json({ error: 'Club not found' });
    const access = accessState(await loadAccess(leadId));
    const { rows } = await query(
      `SELECT a.id, a.label, a.pitch_type, a.score, a.healthy_pct, a.stressed_pct, a.created_at, a.portal_at, a.portal_months,
         (SELECT json_agg(json_build_object('label', p.label, 'score', p.score) ORDER BY p.id)
            FROM analysis_parts p WHERE p.analysis_id = a.id AND p.kind = 'pitch') AS extras,
         (SELECT COUNT(*)::int FROM portal_ticks t WHERE t.analysis_id = a.id AND t.done) AS ticked
       FROM analyses a
       WHERE a.lead_id = $1 AND a.in_portal = true
       ORDER BY a.created_at DESC`,
      [leadId]
    );
    const reports = rows.map((r) => ({
      ...r,
      healthy_pct: Number(r.healthy_pct),
      stressed_pct: Number(r.stressed_pct)
    }));
    // A locked portal still shows the latest score, so the club can see what it is missing
    res.json({
      club: lead,
      user: { name: req.client.name, email: req.client.email, guest: req.client.guest },
      access,
      reports: access.locked ? reports.slice(0, 1).map((r) => ({ id: r.id, label: r.label, score: r.score, created_at: r.created_at, locked: true })) : reports
    });
  })
);

async function ownReport(req) {
  const id = Number(req.params.id);
  const { rows } = await query('SELECT id FROM analyses WHERE id = $1 AND lead_id = $2 AND in_portal = true', [id, req.client.lead_id]);
  if (!rows.length) return null;
  return id;
}

// One full report, with the ticks and notes the club has made on its care programme
router.get(
  '/reports/:id',
  wrap(async (req, res) => {
    const access = accessState(await loadAccess(req.client.lead_id));
    if (access.locked) return res.status(402).json({ error: 'Your free trial has ended', access });
    const id = await ownReport(req);
    if (!id) return res.status(404).json({ error: 'Report not found' });

    // The free window: the club sees this many months back and ahead; the rest is offered as an upgrade
    const window = await windowFor(req, id);
    const data = await loadFull(id, { period: window });
    // Keep the club's view to what it needs: no internal notes, meeting questions or contact details
    const lead = data.lead;
    data.lead = lead ? { id: lead.id, name: lead.name, county: lead.county, type: lead.type, pitch_profile: lead.pitch_profile } : null;
    if (data.analysis.ai_report) {
      data.analysis.ai_report = { ...data.analysis.ai_report };
      delete data.analysis.ai_report.questions;
    }
    delete data.claudeEnabled;

    const allMonths = (
      await query(
        `SELECT month, ndvi, coverage, strong_pct, moderate_pct, thin_pct FROM satellite_months WHERE analysis_id = $1 ORDER BY month`,
        [id]
      )
    ).rows.map(shapeMonth);
    const months = allMonths.slice(-window);
    if (window < 12 && data.analysis.ai_report) {
      // Only the notes for the months they can see; the year review covers the whole year, so it waits for the upgrade
      const inWindow = new Set(months.map((m) => m.month));
      const ai = data.analysis.ai_report;
      ai.monthly_notes = (ai.monthly_notes || []).filter((n) => inWindow.has(n.month));
      ai.worst_months = (ai.worst_months || []).filter((n) => inWindow.has(n.month));
      ai.year_review = null;
    }
    data.analysis.imagery = { ...(data.analysis.imagery || {}), period: window };
    // What the upgrade adds, shown as locked months in the report
    const limit =
      window < 12
        ? {
            months: window,
            reviewLocked: Math.max(0, Math.min(12, allMonths.length) - months.length),
            lockedMonths: nextMonths(12).slice(window)
          }
        : null;
    const ticks = (await query('SELECT task_key, done, note, updated_at FROM portal_ticks WHERE analysis_id = $1', [id])).rows;
    await logEvent({ ...who(req), analysisId: id, session: req.query.session || null, kind: 'report_view', detail: { window } });
    res.json({ ...data, months, ticks, limit, upgradeRequested: Boolean((await loadAccess(req.client.lead_id))?.upgrade_requested_at) });
  })
);

// The pitch in one month: the coloured vigour map from Sentinel 2, only for months inside the free window
router.get(
  '/reports/:id/months/:month',
  wrap(async (req, res) => {
    const access = accessState(await loadAccess(req.client.lead_id));
    if (access.locked) return res.status(402).json({ error: 'Your free trial has ended', access });
    const id = await ownReport(req);
    if (!id) return res.status(404).json({ error: 'Report not found' });
    const month = String(req.params.month);
    if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest('Month should look like 2026-06');
    const window = await windowFor(req, id);
    const seen = (await query('SELECT month FROM satellite_months WHERE analysis_id = $1 ORDER BY month', [id])).rows.map((r) => r.month).slice(-window);
    if (!seen.includes(month)) return res.status(402).json({ error: 'This month is in the full year analysis', code: 'locked_month' });

    let row = (await query('SELECT image_png, bounds FROM satellite_months WHERE analysis_id = $1 AND month = $2', [id, month])).rows[0];
    if (!row?.image_png) {
      if (!sentinelEnabled()) return res.status(404).json({ error: 'No map for this month' });
      const a = (await query('SELECT geo_polygon FROM analyses WHERE id = $1', [id])).rows[0];
      if (!a?.geo_polygon?.length) return res.status(404).json({ error: 'No map for this month' });
      const shot = await monthImage(a.geo_polygon, month);
      await query('UPDATE satellite_months SET image_png = $1, bounds = $2 WHERE analysis_id = $3 AND month = $4', [
        shot.png,
        JSON.stringify(shot.bounds),
        id,
        month
      ]);
      row = { image_png: shot.png, bounds: shot.bounds };
    }
    res.json({ month, bounds: row.bounds, image: `data:image/png;base64,${row.image_png.toString('base64')}` });
  })
);

// Activity from the page: sections read, months opened, links clicked, time on the page
const EVENT_KINDS = new Set(['section_view', 'month_view', 'link_click', 'upgrade_click', 'print', 'heartbeat', 'signup_open']);
router.post(
  '/events',
  wrap(async (req, res) => {
    const kind = String(req.body?.kind || '');
    if (!EVENT_KINDS.has(kind)) throw badRequest('Unknown event');
    let analysisId = Number(req.body?.analysisId) || null;
    if (analysisId) {
      const own = await query('SELECT 1 FROM analyses WHERE id = $1 AND lead_id = $2', [analysisId, req.client.lead_id]);
      if (!own.rows.length) analysisId = null;
    }
    const raw = req.body?.detail && typeof req.body.detail === 'object' ? req.body.detail : null;
    // Small and flat: a few short values only
    const detail = raw
      ? Object.fromEntries(
          Object.entries(raw)
            .slice(0, 6)
            .map(([k, v]) => [String(k).slice(0, 30), typeof v === 'number' ? v : String(v).slice(0, 200)])
        )
      : null;
    await logEvent({ ...who(req), analysisId, session: String(req.body?.session || '').slice(0, 40) || null, kind, detail });
    res.json({ ok: true });
  })
);

// The club asks for the full 12 months (or another plan). Oramara follows up; card payments come later.
router.post(
  '/upgrade',
  wrap(async (req, res) => {
    const plan = ['full_year', 'monthly_reports', 'product'].includes(req.body?.plan) ? req.body.plan : 'full_year';
    await query(
      `INSERT INTO portal_access (lead_id, status, upgrade_requested_at, upgrade_plan) VALUES ($1, 'trial', NOW(), $2)
       ON CONFLICT (lead_id) DO UPDATE SET upgrade_requested_at = NOW(), upgrade_plan = $2, updated_at = NOW()`,
      [req.client.lead_id, plan]
    );
    await logEvent({ ...who(req), kind: 'upgrade_request', detail: { plan } });
    res.json({ ok: true });
  })
);

// Tick a job off, or add a note to it
router.put(
  '/reports/:id/ticks',
  requireAccount,
  wrap(async (req, res) => {
    const access = accessState(await loadAccess(req.client.lead_id));
    if (access.locked) return res.status(402).json({ error: 'Your free trial has ended', access });
    const id = await ownReport(req);
    if (!id) return res.status(404).json({ error: 'Report not found' });
    const key = String(req.body?.key || '').slice(0, 200);
    if (!key) throw badRequest('Which job?');
    const done = Boolean(req.body?.done);
    const note = req.body?.note === undefined ? null : String(req.body.note).slice(0, 1000);
    const { rows } = await query(
      `INSERT INTO portal_ticks (analysis_id, task_key, done, note, updated_by) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (analysis_id, task_key) DO UPDATE SET done = EXCLUDED.done,
         note = COALESCE(EXCLUDED.note, portal_ticks.note), updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING task_key, done, note, updated_at`,
      [id, key, done, note, req.client.id]
    );
    res.json(rows[0]);
  })
);

export default router;