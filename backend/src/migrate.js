// oramara/backend/src/migrate.js
// Brings the database schema up to date. The server also does this on every start.
import 'dotenv/config';
import { pool } from './db.js';
import { ensureSchema } from './setup.js';

try {
  await ensureSchema();
  console.log('Database schema is up to date');
} catch (err) {
  // Connection errors can have an empty message, so show the code too
  const detail = err.message || err.code || err.errors?.map((e) => e.code || e.message).join(', ') || String(err);
  console.error('Migration failed:', detail);
  if (/ECONNREFUSED/.test(detail)) console.error('The database is not running. Start it with: docker start oramara-db');
  process.exitCode = 1;
} finally {
  await pool.end();
}
