// oramara/backend/src/auth.js
// Team login for the FieldFalcon admin. Passwords are stored only as bcrypt hashes,
// logins are signed with JWT_SECRET, failed tries are rate limited and a password change
// signs out every other device.
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { query } from './db.js';
import { createLimiter } from './rateLimit.js';
import { BCRYPT_ROUNDS, MIN_PASSWORD } from './setup.js';

// 5 wrong passwords for one email or one address locks it for 15 minutes
export const loginLimiter = createLimiter({ name: 'admin-login', max: 5, windowMs: 15 * 60 * 1000 });

// Compared against when the email is unknown, so a wrong email takes as long as a wrong password
const DUMMY_HASH = bcrypt.hashSync('not a real password', BCRYPT_ROUNDS);

const sign = (user) =>
  jwt.sign({ id: user.id, email: user.email, name: user.name, sid: randomUUID() }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '14d'
  });

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name });

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not logged in' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }
  // Club logins from the customer portal can never reach the admin
  if (payload.role === 'client' || !payload.id) return res.status(403).json({ error: 'Not allowed' });

  try {
    const { rows } = await query('SELECT id, email, name, password_changed_at FROM users WHERE id = $1', [payload.id]);
    const user = rows[0];
    // The login was removed, or the password changed after this token was made
    const changed = user ? Math.floor(new Date(user.password_changed_at).getTime() / 1000) : 0;
    if (!user || (payload.iat || 0) < changed) {
      return res.status(401).json({ error: 'Session expired, please log in again' });
    }
    req.user = { ...payload, email: user.email, name: user.name };
    next();
  } catch (err) {
    next(err);
  }
}

export async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const { rows } = await query('SELECT * FROM users WHERE email = $1', [String(email).trim().toLowerCase()]);
  const user = rows[0];
  const ok = await bcrypt.compare(String(password), user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    loginLimiter.fail(req);
    return res.status(401).json({ error: 'Wrong email or password' });
  }

  loginLimiter.clear(req);
  await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
  res.json({ token: sign(user), user: publicUser(user) });
}

export async function me(req, res) {
  res.json({ user: { id: req.user.id, email: req.user.email, name: req.user.name } });
}

// Change the password from the Account page. Needs the current one, and signs out other devices.
export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Enter your current and new password' });
  if (String(newPassword).length < MIN_PASSWORD) {
    return res.status(400).json({ error: `Use a new password of at least ${MIN_PASSWORD} characters` });
  }
  if (String(newPassword).length > 200) return res.status(400).json({ error: 'That password is too long' });

  const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(String(currentPassword), user.password_hash))) {
    return res.status(400).json({ error: 'Your current password is not right' });
  }
  if (await bcrypt.compare(String(newPassword), user.password_hash)) {
    return res.status(400).json({ error: 'Pick a new password that is different from the current one' });
  }

  const hash = await bcrypt.hash(String(newPassword), BCRYPT_ROUNDS);
  // Rounded down to the second so the new login made below still counts as after the change
  const { rows: updated } = await query(
    `UPDATE users SET password_hash = $1, password_changed_at = date_trunc('second', NOW()) WHERE id = $2 RETURNING *`,
    [hash, user.id]
  );
  res.json({ token: sign(updated[0]), user: publicUser(updated[0]) });
}
