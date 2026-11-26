// oramara/backend/src/scripts/createUser.js
// Adds a team login, or sets a new password for one that exists. Run on your own computer
// or in the Render shell. The password is stored only as a bcrypt hash.
// Usage: npm run create-user -- you@example.com "a long password" "Your Name"
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { BCRYPT_ROUNDS, MIN_PASSWORD } from '../setup.js';

const [email, password, name] = process.argv.slice(2);

if (!email || !password) {
  console.error('Usage: npm run create-user -- email password "Name"');
  process.exit(1);
}
if (password.length < MIN_PASSWORD) {
  console.error(`Use a password of at least ${MIN_PASSWORD} characters`);
  process.exit(1);
}

try {
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await pool.query(
    `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash,
       name = COALESCE(EXCLUDED.name, users.name), password_changed_at = NOW()`,
    [email.trim().toLowerCase(), hash, name || null]
  );
  console.log(`User ${email} saved`);
} catch (err) {
  console.error('Could not save user:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
