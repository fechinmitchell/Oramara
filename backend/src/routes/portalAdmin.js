// oramara/backend/src/routes/portalAdmin.js
// Admin side of the customer portal: share reports by link, set the free months and trial, pause or end access,
// reset passwords, delete accounts and see what each club has looked at.
// There is no email service yet, so links come back with a ready written email to send yourself.
import { Router } from 'express';
import { query } from '../db.js';
import { wrap, badRequest } from './wrap.js';
import { newInviteToken, accessState } from '../portalAuth.js';

const router = Router();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_DAYS = 14;
const RESET_DAYS = 7;
const portalUrl = (req) => (process.env.PORTAL_URL || req.headers.origin || 'http://localhost:5173').replace(/\/$/, '');
const linkUrl = (req, token) => `${portalUrl(req)}/r/${token}`;

// Activity per club, worked out from the events log
const STATS_SQL = `
  SELECT e.lead_id,
    COUNT(*) FILTER (WHERE e.kind = 'link_open')::int AS link_opens,
    COUNT(*) FILTER (WHERE e.kind = 'report_view')::int AS report_views,
    COUNT(*) FILTER (WHERE e.kind = 'month_view')::int AS month_views,
    COUNT(*) FILTER (WHERE e.kind = 'link_click')::int AS clicks,
    COUNT(*) FILTER (WHERE e.kind = 'upgrade_click')::int AS upgrade_clicks,
    COUNT(*) FILTER (WHERE e.kind = 'print')::int AS prints,
    COUNT(*) FILTER (WHERE e.kind = 'login')::int AS logins,
    COUNT(DISTINCT e.detail->>'section') FILTER (WHERE e.kind = 'section_view')::int AS sections_seen,
    COUNT(DISTINCT e.session) FILTER (WHERE e.kind IN ('report_view', 'link_open'))::int AS visits,
    (COUNT(*) FILTER (WHERE e.kind = 'heartbeat') * 30)::int AS seconds,
    MAX(e.created_at) FILTER (WHERE e.kind <> 'heartbeat') AS last_seen,
    MIN(e.created_at) FILTER (WHERE e.kind = 'link_open') AS first_open
  FROM portal_events e`;
const emptyStats = { link_opens: 0, report_views: 0, month_views: 0, clicks: 0, upgrade_clicks: 0, prints: 0, logins: 0, sections_seen: 0, visits: 0, seconds: 0, last_seen: null, first_open: null };

// Every club with portal access, for the overview page
router.get(
  '/',
  wrap(async (req, res) => {
    const { rows } = await query(
      `SELECT pa.*, l.name AS club, l.county, l.type,
         (SELECT COUNT(*)::int FROM portal_users u WHERE u.lead_id = pa.lead_id) AS users,
         (SELECT MAX(u.last_login) FROM portal_users u WHERE u.lead_id = pa.lead_id) AS last_login,
         (SELECT COUNT(*)::int FROM analyses a WHERE a.lead_id = pa.lead_id AND a.in_portal) AS reports,
         (SELECT COUNT(*)::int FROM portal_ticks t JOIN analyses a ON a.id = t.analysis_id
            WHERE a.lead_id = pa.lead_id AND t.done) AS ticks
       FROM portal_access pa JOIN leads l ON l.id = pa.lead_id
       ORDER BY pa.trial_ends_at NULLS LAST`
    );
    const stats = new Map((await query(`${STATS_SQL} GROUP BY e.lead_id`)).rows.map((r) => [r.lead_id, r]));
    const reports = (
      await query(
        `SELECT a.lead_id, json_agg(json_build_object('id', a.id, 'label', a.label, 'score', a.score, 'months', a.portal_months) ORDER BY a.created_at DESC) AS list
         FROM analyses a WHERE a.in_portal GROUP BY a.lead_id`
      )
    ).rows;
    const byLead = new Map(reports.map((r) => [r.lead_id, r.list]));
    const contacts = new Map(
      (
        await query(
          `SELECT DISTINCT ON (lead_id) lead_id, email, name FROM portal_links WHERE revoked_at IS NULL ORDER BY lead_id, created_at DESC`
        )
      ).rows.map((r) => [r.lead_id, r])
    );
    res.json(
      rows.map((r) => ({
        ...r,
        state: accessState(r),
        stats: stats.get(r.lead_id) || emptyStats,
        portalReports: byLead.get(r.lead_id) || [],
        contact: contacts.get(r.lead_id) || null
      }))
    );
  })
);

// One club: its access, its portal users and how many reports it can see
router.get(
  '/lead/:leadId',
  wrap(async (req, res) => {
    const leadId = Number(req.params.leadId);
    const access = (await query('SELECT * FROM portal_access WHERE lead_id = $1', [leadId])).rows[0] || null;
    const users = (
      await query(
        `SELECT id, email, name, last_login, created_at, password_hash IS NOT NULL AS active,
           invite_token, invite_expires FROM portal_users WHERE lead_id = $1 ORDER BY created_at`,
        [leadId]
      )
    ).rows.map((u) => ({
      ...u,
      inviteUrl: u.invite_token && new Date(u.invite_expires) > new Date() ? `${portalUrl(req)}/portal/accept/${u.invite_token}` : null,
      invite_token: undefined
    }));
    const reportList = (
      await query(
        `SELECT id, label, score, portal_months, portal_at, created_at FROM analyses WHERE lead_id = $1 AND in_portal ORDER BY created_at DESC`,
        [leadId]
      )
    ).rows;
    const links = (
      await query(
        `SELECT k.id, k.token, k.email, k.name, k.analysis_id, k.created_at, k.revoked_at, k.first_opened_at, k.last_opened_at, k.opens,
           k.trial_days, a.label FROM portal_links k LEFT JOIN analyses a ON a.id = k.analysis_id
         WHERE k.lead_id = $1 ORDER BY k.created_at DESC`,
        [leadId]
      )
    ).rows.map((k) => ({ ...k, url: linkUrl(req, k.token), token: undefined }));
    const stats = (await query(`${STATS_SQL} WHERE e.lead_id = $1 GROUP BY e.lead_id`, [leadId])).rows[0] || emptyStats;
    const sections = (
      await query(
        `SELECT detail->>'section' AS section, COUNT(*)::int AS n, MAX(created_at) AS last FROM portal_events
         WHERE lead_id = $1 AND kind = 'section_view' GROUP BY 1 ORDER BY n DESC`,
        [leadId]
      )
    ).rows;
    const clicks = (
      await query(
        `SELECT COALESCE(detail->>'label', detail->>'href') AS label, detail->>'href' AS href, COUNT(*)::int AS n FROM portal_events
         WHERE lead_id = $1 AND kind = 'link_click' GROUP BY 1, 2 ORDER BY n DESC LIMIT 20`,
        [leadId]
      )
    ).rows;
    const months = (
      await query(
        `SELECT detail->>'month' AS month, COUNT(*)::int AS n FROM portal_events
         WHERE lead_id = $1 AND kind = 'month_view' GROUP BY 1 ORDER BY 1`,
        [leadId]
      )
    ).rows;
    const events = (
      await query(
        `SELECT e.id, e.kind, e.detail, e.created_at, e.analysis_id, u.email AS user_email, k.email AS link_email
         FROM portal_events e LEFT JOIN portal_users u ON u.id = e.user_id LEFT JOIN portal_links k ON k.id = e.link_id
         WHERE e.lead_id = $1 AND e.kind <> 'heartbeat' ORDER BY e.created_at DESC LIMIT 150`,
        [leadId]
      )
    ).rows;
    res.json({
      access,
      state: accessState(access),
      users,
      reports: reportList.length,
      reportList,
      links,
      stats,
      sections,
      clicks,
      months,
      events
    });
  })
);

// GDPR: never to an address that opted out, and never to a personal address without the person's agreement
async function checkAddress(email) {
  const suppressed = (await query('SELECT reason FROM suppression WHERE email = $1', [email])).rows[0];
  if (suppressed) throw badRequest('This address asked not to be contacted, so it cannot be invited');
  const personal = (await query(`SELECT 1 FROM contacts WHERE email = $1 AND kind = 'personal' AND status <> 'verified'`, [email])).rows[0];
  if (personal) throw badRequest('This is a personal address. Only invite it once the person has agreed, then mark it checked in Contacts.');
}

// A report link: opens straight from the email, no password. The trial starts on the first open.
async function createLink(req, leadId, analysisId, { email, name, trialDays }) {
  email = String(email || '').trim().toLowerCase();
  name = String(name || '').trim().slice(0, 80) || null;
  trialDays = Math.min(365, Math.max(1, Number(trialDays) || 30));
  if (!EMAIL.test(email)) throw badRequest('That email address does not look right');
  const lead = (await query('SELECT id, name FROM leads WHERE id = $1', [leadId])).rows[0];
  if (!lead) throw badRequest('Club not found');
  await checkAddress(email);
  await query(`INSERT INTO portal_access (lead_id, status) VALUES ($1, 'trial') ON CONFLICT (lead_id) DO NOTHING`, [leadId]);
  const token = newInviteToken();
  const link = (
    await query(
      `INSERT INTO portal_links (token, lead_id, analysis_id, email, name, trial_days) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [token, leadId, analysisId, email, name, trialDays]
    )
  ).rows[0];
  const state = accessState((await query('SELECT * FROM portal_access WHERE lead_id = $1', [leadId])).rows[0]);
  return { lead, link, url: linkUrl(req, token), state, trialDays };
}

// Create or refresh a login for someone at the club. Starts a free trial if the club has no access yet.
async function createInvite(req, leadId, { email, name, trialDays }) {
  email = String(email || '').trim().toLowerCase();
  name = String(name || '').trim().slice(0, 80) || null;
  trialDays = Math.min(365, Math.max(1, Number(trialDays) || 30));
  if (!EMAIL.test(email)) throw badRequest('That email address does not look right');

  const lead = (await query('SELECT id, name FROM leads WHERE id = $1', [leadId])).rows[0];
  if (!lead) throw badRequest('Club not found');
  await checkAddress(email);

  const existing = (await query('SELECT id, lead_id FROM portal_users WHERE email = $1', [email])).rows[0];
  if (existing && existing.lead_id !== leadId) throw badRequest('This email already has a portal login for another club');

  await query(
    `INSERT INTO portal_access (lead_id, status, trial_ends_at) VALUES ($1, 'trial', NOW() + ($2 || ' days')::interval)
     ON CONFLICT (lead_id) DO NOTHING`,
    [leadId, String(trialDays)]
  );

  const token = newInviteToken();
  const user = existing
    ? (
        await query(
          `UPDATE portal_users SET invite_token = $1, invite_expires = NOW() + interval '${INVITE_DAYS} days',
             name = COALESCE($2, name) WHERE id = $3 RETURNING id, email, name, password_hash IS NOT NULL AS active`,
          [token, name, existing.id]
        )
      ).rows[0]
    : (
        await query(
          `INSERT INTO portal_users (lead_id, email, name, invite_token, invite_expires)
           VALUES ($1, $2, $3, $4, NOW() + interval '${INVITE_DAYS} days') RETURNING id, email, name, false AS active`,
          [leadId, email, name, token]
        )
      ).rows[0];

  const access = (await query('SELECT * FROM portal_access WHERE lead_id = $1', [leadId])).rows[0];
  const state = accessState(access);
  // Someone who already has a password just needs the portal address
  const inviteUrl = user.active ? `${portalUrl(req)}/portal/login` : `${portalUrl(req)}/portal/accept/${token}`;
  const ends = state.trialEndsAt ? new Date(state.trialEndsAt).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  return { lead, user, inviteUrl, state, ends };
}

const SIGN_OFF = ['Kind regards,', '', 'Oramara (Ór na Mara)', 'Connemara, Ireland', 'hello@oramara.ie'];
const OPT_OUT = 'If you would prefer not to receive further correspondence from Oramara, please reply to this email and we will remove your details.';
const windowWords = (m) => (m === 1 ? 'the last month' : `the last ${m} months`);

// Invite someone from the club
router.post(
  '/lead/:leadId/invite',
  wrap(async (req, res) => {
    const inv = await createInvite(req, Number(req.params.leadId), req.body || {});
    const subject = `Your FieldFalcon pitch report for ${inv.lead.name}`;
    const body = [
      `Dear ${inv.user.name || 'Sir or Madam'},`,
      '',
      `I have set up access for ${inv.lead.name} to FieldFalcon by Oramara, where you can view the satellite analysis of your pitch, the month by month care programme and the products and costs involved.`,
      '',
      inv.user.active ? 'You can log in at the address below with your existing password.' : `Please use the link below to set your password. The link is valid for ${INVITE_DAYS} days.`,
      inv.inviteUrl,
      '',
      inv.ends ? `Access is free of charge until ${inv.ends}.` : 'Access is free of charge during the trial period.',
      '',
      OPT_OUT,
      '',
      ...SIGN_OFF
    ].join('\n');
    res.json({ user: inv.user, inviteUrl: inv.inviteUrl, subject, body, state: inv.state });
  })
);

// Save a report to the club's portal, choose how many months they see free, and make the link and email in one step
router.post(
  '/lead/:leadId/share',
  wrap(async (req, res) => {
    const leadId = Number(req.params.leadId);
    const analysisId = Number(req.body?.analysisId);
    const months = [1, 3, 6, 12].includes(Number(req.body?.months)) ? Number(req.body.months) : 3;
    const a = (await query('SELECT id, lead_id, label, score, stressed_pct FROM analyses WHERE id = $1', [analysisId])).rows[0];
    if (!a || a.lead_id !== leadId) throw badRequest('Report not found for this club');

    const share = await createLink(req, leadId, analysisId, req.body || {});
    await query('UPDATE analyses SET saved = true, in_portal = true, portal_at = NOW(), portal_months = $1 WHERE id = $2', [months, analysisId]);
    const email = shareEmail({ lead: share.lead, link: share.link, url: share.url, analysis: a, months, state: share.state, trialDays: share.trialDays });
    res.json({ user: { email: share.link.email, name: share.link.name }, inviteUrl: share.url, ...email, state: share.state, months });
  })
);

function shareEmail({ lead, link, url, analysis: a, months, state, trialDays }) {
  const price = Number(process.env.FULL_YEAR_PRICE) || 199;
  const perMonth = (price / 12).toFixed(2);
  const what = (a.label || 'main pitch').toLowerCase();
  const ends = state.trialEndsAt ? new Date(state.trialEndsAt).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  const subject = `Free satellite analysis of the ${what} at ${lead.name}`;
  const body = [
    `Dear ${link.name || 'Sir or Madam'},`,
    '',
    `We have completed a satellite analysis of the ${what} at ${lead.name} using FieldFalcon, our pitch analysis service. The ${what} scores ${a.score} out of 100, and the report shows where the turf is strongest, where it is thinning and what is likely behind it.`,
    '',
    `Your free access includes ${windowWords(months)} of analysis, with the pitch shown month by month, and a care programme for the ${months === 1 ? 'month' : `${months} months`} ahead, with the products and costs involved.`,
    '',
    'You can open the report directly with the link below. No login is needed; you can create a free account inside if you would like to tick off jobs and come back to it.',
    url,
    '',
    months < 12 ? `The full 12 month analysis and care programme is available for €${price} a year, which is about €${perMonth} a month.` : null,
    ends ? `Access is free of charge until ${ends}.` : `Access is free of charge for ${trialDays} days from when you first open the report.`,
    '',
    'I would welcome the opportunity to meet and talk through the findings with you or your grounds committee, at a time that suits you.',
    '',
    OPT_OUT,
    '',
    ...SIGN_OFF
  ]
    .filter((l) => l !== null)
    .join('\n');
  return { subject, body };
}

// A fresh link for a report (for example after revoking one), with its email
router.post(
  '/lead/:leadId/links',
  wrap(async (req, res) => {
    const leadId = Number(req.params.leadId);
    const analysisId = Number(req.body?.analysisId);
    const a = (await query('SELECT id, lead_id, label, score, portal_months FROM analyses WHERE id = $1 AND in_portal', [analysisId])).rows[0];
    if (!a || a.lead_id !== leadId) throw badRequest('Pick a report that is in the portal');
    const share = await createLink(req, leadId, analysisId, req.body || {});
    const email = shareEmail({ lead: share.lead, link: share.link, url: share.url, analysis: a, months: a.portal_months, state: share.state, trialDays: share.trialDays });
    res.json({ url: share.url, ...email });
  })
);

// Turn a link off: anyone who opens it is told to ask for a new one
router.delete(
  '/links/:id',
  wrap(async (req, res) => {
    await query('UPDATE portal_links SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL', [req.params.id]);
    res.json({ ok: true });
  })
);

// Free months for one report: 1, 3, 6 or 12
router.patch(
  '/reports/:id',
  wrap(async (req, res) => {
    const months = Number(req.body?.months);
    if (![1, 3, 6, 12].includes(months)) throw badRequest('Choose 1, 3, 6 or 12 months');
    const { rows } = await query('UPDATE analyses SET portal_months = $1 WHERE id = $2 AND in_portal RETURNING id, portal_months', [months, req.params.id]);
    if (!rows.length) throw badRequest('Report not in the portal');
    res.json(rows[0]);
  })
);

// Password reset: a link to set a new password, with a ready written email
router.post(
  '/users/:id/reset',
  wrap(async (req, res) => {
    const user = (await query('SELECT u.*, l.name AS club FROM portal_users u JOIN leads l ON l.id = u.lead_id WHERE u.id = $1', [req.params.id])).rows[0];
    if (!user) throw badRequest('User not found');
    const token = newInviteToken();
    await query(`UPDATE portal_users SET invite_token = $1, invite_expires = NOW() + interval '${RESET_DAYS} days' WHERE id = $2`, [token, user.id]);
    const url = `${portalUrl(req)}/portal/accept/${token}`;
    const subject = `Set a new password for ${user.club} on FieldFalcon`;
    const body = [
      `Dear ${user.name || 'Sir or Madam'},`,
      '',
      `Please use the link below to set a new password for the ${user.club} portal on FieldFalcon by Oramara. The link is valid for ${RESET_DAYS} days and can be used once.`,
      url,
      '',
      'If you did not ask for this, you can ignore this email and your password will stay the same.',
      '',
      ...SIGN_OFF
    ].join('\n');
    res.json({ url, subject, body, email: user.email });
  })
);

// Delete the club's portal account: logins, links, access, ticks and activity. Reports leave the portal; the analyses stay.
router.delete(
  '/lead/:leadId/account',
  wrap(async (req, res) => {
    const leadId = Number(req.params.leadId);
    await query('DELETE FROM portal_ticks WHERE analysis_id IN (SELECT id FROM analyses WHERE lead_id = $1)', [leadId]);
    await query('DELETE FROM portal_events WHERE lead_id = $1', [leadId]);
    await query('DELETE FROM portal_links WHERE lead_id = $1', [leadId]);
    await query('DELETE FROM portal_users WHERE lead_id = $1', [leadId]);
    await query('DELETE FROM portal_access WHERE lead_id = $1', [leadId]);
    await query('UPDATE analyses SET in_portal = false, portal_at = NULL WHERE lead_id = $1', [leadId]);
    res.json({ ok: true });
  })
);

// Change access: extend the trial, mark as paying, pause or end
router.patch(
  '/lead/:leadId/access',
  wrap(async (req, res) => {
    const leadId = Number(req.params.leadId);
    const current = (await query('SELECT * FROM portal_access WHERE lead_id = $1', [leadId])).rows[0];
    if (!current) throw badRequest('This club has no portal access yet. Invite someone first.');
    const status = req.body?.status;
    if (status && !['trial', 'active', 'paused', 'ended'].includes(status)) throw badRequest('Unknown status');
    const extend = Number(req.body?.extendDays) || 0;
    const plan = req.body?.plan === undefined ? current.plan : String(req.body.plan || '').slice(0, 60) || null;

    let trialEnds = current.trial_ends_at ? new Date(current.trial_ends_at) : new Date();
    if (extend) {
      // Extending a trial that already ran out starts from today
      const from = trialEnds < new Date() ? new Date() : trialEnds;
      trialEnds = new Date(from.getTime() + extend * 864e5);
    }
    const { rows } = await query(
      `UPDATE portal_access SET status = $1, trial_ends_at = $2, plan = $3, updated_at = NOW() WHERE lead_id = $4 RETURNING *`,
      [extend && !status ? 'trial' : status || current.status, trialEnds, plan, leadId]
    );
    res.json({ access: rows[0], state: accessState(rows[0]) });
  })
);

// Remove a person's login
router.delete(
  '/users/:id',
  wrap(async (req, res) => {
    await query('DELETE FROM portal_users WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  })
);

export default router;