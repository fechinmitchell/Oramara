// oramara/backend/src/migrate.js
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8');

try {
  await pool.query(sql);
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