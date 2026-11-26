// oramara/backend/src/auth.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { query } from './db.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    // Club logins from the customer portal can never reach the admin
    if (req.user.role === 'client') return res.status(403).json({ error: 'Not allowed' });
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

export async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const { rows } = await query('SELECT * FROM users WHERE email = $1', [String(email).toLowerCase()]);
  const user = rows[0];
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) return res.status(401).json({ error: 'Wrong email or password' });

  // sid identifies this login, so API usage can be shown per session
  const token = jwt.sign({ id: user.id, email: user.email, name: user.name, sid: randomUUID() }, process.env.JWT_SECRET, {
    expiresIn: '14d'
  });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
}