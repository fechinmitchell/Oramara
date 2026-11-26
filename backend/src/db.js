// oramara/backend/src/db.js
import pg from 'pg';

const { Pool, types } = pg;

// Return DATE columns as plain 'YYYY-MM-DD' strings so dates never shift with time zones
types.setTypeParser(1082, (value) => value);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
});

export function query(text, params) {
  return pool.query(text, params);
}