// oramara/backend/src/setup.js
// Runs when the server starts: checks the secrets, brings the database schema up to date
// and makes the first admin login from ADMIN_EMAIL and ADMIN_PASSWORD if it is not there yet.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { query } from './db.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

export const MIN_PASSWORD = 10;
export const BCRYPT_ROUNDS = 12;

const isHosted = () => process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);

// The JWT secret signs every login. Without a long random one, anyone could forge an admin login.
export function checkSecrets() {
  const secret = process.env.JWT_SECRET || '';
  const help = 'Make one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"';
  if (!secret) {
    console.error(`JWT_SECRET is not set. ${help}`);
    process.exit(1);
  }
  if (secret.length < 32) {
    if (isHosted()) {
      console.error(`JWT_SECRET is too short (it needs 32 characters or more). ${help}`);
      process.exit(1);
    }
    console.warn(`Warning: JWT_SECRET is short. Fine on your own computer but use a long one when hosted. ${help}`);
  }
}

export async function ensureSchema() {
  const sql = fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8');
  await query(sql);
}

// Makes the admin login named in ADMIN_EMAIL with ADMIN_PASSWORD, only if that email has no login yet.
// After that the password is changed inside the admin (Account page), so a later restart never undoes it.
// To get back in after a forgotten password, set ADMIN_RESET_PASSWORD=true for one restart, then remove it.
export async function seedAdmin() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || !password) {
    console.log('ADMIN_EMAIL or ADMIN_PASSWORD is not set, so no admin login was made on start.');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error(`ADMIN_EMAIL "${email}" is not a valid email address, so no admin login was made.`);
    return;
  }

  if (password.length < MIN_PASSWORD) {
    console.error(`ADMIN_PASSWORD needs at least ${MIN_PASSWORD} characters, so no admin login was made.`);
    return;
  }

  const { rows } = await query('SELECT id FROM users WHERE email = $1', [email]);
  const reset = process.env.ADMIN_RESET_PASSWORD === 'true';

  if (!rows[0]) {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await query('INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)', [email, hash, process.env.ADMIN_NAME || null]);
    console.log(`Admin login made for ${email}`);
  } else if (reset) {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await query('UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2', [hash, rows[0].id]);
    console.log(`Admin password for ${email} was reset from ADMIN_PASSWORD. Remove ADMIN_RESET_PASSWORD now.`);
  } else {
    console.log(`Admin login for ${email} already exists. Its password is changed on the Account page.`);
  }
}
