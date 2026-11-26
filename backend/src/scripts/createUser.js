// oramara/backend/src/scripts/createUser.js
// Usage: npm run create-user -- you@example.com yourpassword "Your Name"
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';

const [email, password, name] = process.argv.slice(2);

if (!email || !password) {
  console.error('Usage: npm run create-user -- email password "Name"');
  process.exit(1);
}

try {
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name`,
    [email.toLowerCase(), hash, name || null]
  );
  console.log(`User ${email} saved`);
} catch (err) {
  console.error('Could not save user:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}