// oramara/backend/src/portalAuth.js
// Logins for clubs using the customer portal. Kept apart from the admin login:
// a club token carries role "client" and its own lead_id, so it only ever sees that club.
// A report link from an email opens the portal as a guest (no password); the guest can make an account inside.
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { query } from './db.js';

export const newInviteToken = () => randomBytes(24).toString('hex');

// Days of trial left (0 when it has run out), and whether the portal is locked
export function accessState(access) {
  if (!access) return { status: 'none', locked: true, daysLeft: 0, trialEndsAt: null };
  const now = Date.now();
  const ends = access.trial_ends_at ? new Date(access.trial_ends_at).getTime() : null;
  const daysLeft = ends ? Math.max(0, Math.ceil((ends - now) / 864e5)) : null;
  let locked = false;
  if (access.status === 'paused' || access.status === 'ended') locked = true;
  if (access.status === 'trial' && ends && ends < now) locked = true;
  return {
    status: access.status,
    plan: access.plan || null,
    trialEndsAt: access.trial_ends_at,
    daysLeft,
    locked,
    upgradeRequestedAt: access.upgrade_requested_at || null,
    upgradePlan: access.upgrade_plan || null
  };
}

export async function loadAccess(leadId) {
  const { rows } = await query('SELECT * FROM portal_access WHERE lead_id = $1', [leadId]);
  return rows[0] || null;
}

export function requirePortal(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in' });
  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    if (user.role !== 'client' || !user.lead_id) return res.status(401).json({ error: 'Please log in' });
    req.client = user;
    req.client.guest = Boolean(user.guest);
    next();
  } catch {
    res.status(401).json({ error: 'Your session has ended, please log in again' });
  }
}

// Ticking jobs and other changes need an account; guests from a link can look but are asked to sign up
export function requireAccount(req, res, next) {
  if (req.client?.guest) return res.status(403).json({ error: 'Create your free account to save this', code: 'account_needed' });
  next();
}

function signGuest(link) {
  return jwt.sign(
    { role: 'client', guest: true, lead_id: link.lead_id, link_id: link.id, email: link.email, name: link.name },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// Note what a club does in the portal, for the admin activity page. Never fails the request.
export async function logEvent({ leadId, analysisId = null, linkId = null, userId = null, session = null, kind, detail = null }) {
  try {
    await query(
      `INSERT INTO portal_events (lead_id, analysis_id, link_id, user_id, session, kind, detail) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [leadId, analysisId, linkId, userId, session, kind, detail ? JSON.stringify(detail) : null]
    );
  } catch (err) {
    console.error('Portal event not saved:', err.message);
  }
}

// Opening the report link from the email: no password. Starts the free trial on the first open.
export async function openLink(req, res) {
  const { rows } = await query(
    `SELECT k.*, l.name AS club FROM portal_links k JOIN leads l ON l.id = k.lead_id WHERE k.token = $1`,
    [req.params.token]
  );
  const link = rows[0];
  if (!link || link.revoked_at) {
    return res.status(404).json({ error: 'This link is no longer active. Ask Oramara for a new one.' });
  }
  const first = !link.first_opened_at;
  await query(
    `UPDATE portal_links SET opens = opens + 1, last_opened_at = NOW(), first_opened_at = COALESCE(first_opened_at, NOW())
     WHERE id = $1`,
    [link.id]
  );
  // The trial clock starts when the club first looks, not when the email was written
  if (first) {
    await query(
      `UPDATE portal_access SET trial_ends_at = NOW() + ($2 || ' days')::interval, updated_at = NOW()
       WHERE lead_id = $1 AND status = 'trial' AND trial_ends_at IS NULL`,
      [link.lead_id, String(link.trial_days || 30)]
    );
  }
  await logEvent({ leadId: link.lead_id, analysisId: link.analysis_id, linkId: link.id, session: req.body?.session || null, kind: 'link_open', detail: { first } });
  const account = link.email
    ? (await query('SELECT password_hash IS NOT NULL AS active FROM portal_users WHERE email = $1', [link.email])).rows[0]
    : null;
  res.json({
    token: signGuest(link),
    analysisId: link.analysis_id,
    club: link.club,
    email: link.email,
    hasAccount: Boolean(account?.active)
  });
}

// A guest from a link sets a password and becomes a club user
export async function createAccount(req, res) {
  if (!req.client?.guest) return res.status(400).json({ error: 'You already have an account' });
  const { password, name } = req.body || {};
  const email = String(req.body?.email || req.client.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter your email address' });
  if (!password || String(password).length < 8) return res.status(400).json({ error: 'Use a password of at least 8 characters' });
  const existing = (await query('SELECT * FROM portal_users WHERE email = $1', [email])).rows[0];
  if (existing && existing.lead_id !== req.client.lead_id) return res.status(400).json({ error: 'This email is used by another club' });
  if (existing?.password_hash) return res.status(409).json({ error: 'You already have an account. Please log in.', code: 'has_account' });
  const hash = await bcrypt.hash(String(password), 10);
  const cleanName = String(name || req.client.name || '').trim().slice(0, 80) || null;
  const { rows } = existing
    ? await query(
        `UPDATE portal_users SET password_hash = $1, name = COALESCE($2, name), invite_token = NULL, invite_expires = NULL,
           last_login = NOW() WHERE id = $3 RETURNING *`,
        [hash, cleanName, existing.id]
      )
    : await query(
        `INSERT INTO portal_users (lead_id, email, name, password_hash, last_login) VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
        [req.client.lead_id, email, cleanName, hash]
      );
  await logEvent({ leadId: req.client.lead_id, linkId: req.client.link_id || null, userId: rows[0].id, kind: 'account_created' });
  res.json({ token: signClient(rows[0]), user: { name: rows[0].name, email: rows[0].email } });
}

function signClient(user) {
  return jwt.sign({ role: 'client', id: user.id, lead_id: user.lead_id, email: user.email, name: user.name }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
}

export async function portalLogin(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const { rows } = await query('SELECT * FROM portal_users WHERE email = $1', [String(email).trim().toLowerCase()]);
  const user = rows[0];
  const ok = user?.password_hash && (await bcrypt.compare(String(password), user.password_hash));
  if (!ok) return res.status(401).json({ error: 'Wrong email or password' });
  await query('UPDATE portal_users SET last_login = NOW() WHERE id = $1', [user.id]);
  await logEvent({ leadId: user.lead_id, userId: user.id, kind: 'login' });
  res.json({ token: signClient(user), user: { name: user.name, email: user.email } });
}

// The link in the invite: shows who it is for before they set a password
export async function inviteInfo(req, res) {
  const { rows } = await query(
    `SELECT u.email, u.name, u.invite_expires, u.password_hash IS NOT NULL AS reset, l.name AS club FROM portal_users u JOIN leads l ON l.id = u.lead_id
     WHERE u.invite_token = $1`,
    [req.params.token]
  );
  const u = rows[0];
  if (!u || new Date(u.invite_expires) < new Date()) {
    return res.status(404).json({ error: 'This invite link has expired. Ask Oramara for a new one.' });
  }
  res.json({ email: u.email, name: u.name, club: u.club, reset: u.reset });
}

export async function acceptInvite(req, res) {
  const { token, password, name } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Invite link missing' });
  if (!password || String(password).length < 8) return res.status(400).json({ error: 'Use a password of at least 8 characters' });
  const { rows } = await query('SELECT * FROM portal_users WHERE invite_token = $1', [token]);
  const user = rows[0];
  if (!user || new Date(user.invite_expires) < new Date()) {
    return res.status(404).json({ error: 'This invite link has expired. Ask Oramara for a new one.' });
  }
  const hash = await bcrypt.hash(String(password), 10);
  const { rows: updated } = await query(
    `UPDATE portal_users SET password_hash = $1, name = COALESCE(NULLIF($2, ''), name), invite_token = NULL,
       invite_expires = NULL, last_login = NOW() WHERE id = $3 RETURNING *`,
    [hash, String(name || '').slice(0, 80), user.id]
  );
  res.json({ token: signClient(updated[0]), user: { name: updated[0].name, email: updated[0].email } });
}