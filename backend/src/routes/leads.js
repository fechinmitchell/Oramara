// oramara/backend/src/routes/leads.js
import { Router } from 'express';
import { query } from '../db.js';
import { wrap, badRequest } from './wrap.js';
import { LEAD_TYPES, LEAD_STATUSES } from '../services/constants.js';

const router = Router();

const EDITABLE = [
  'name', 'type', 'county', 'address', 'contact_name', 'email', 'phone', 'website',
  'status', 'notes', 'next_action', 'next_action_date', 'lat', 'lon', 'pitch_profile'
];

router.get(
  '/stats',
  wrap(async (req, res) => {
    const { rows } = await query('SELECT status, COUNT(*)::int AS count FROM leads GROUP BY status');
    const stats = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0]));
    rows.forEach((r) => (stats[r.status] = r.count));
    res.json(stats);
  })
);

router.get(
  '/',
  wrap(async (req, res) => {
    const { status, type, county, q } = req.query;
    const where = [];
    const params = [];
    if (status) where.push(`l.status = $${params.push(status)}`);
    if (type) where.push(`l.type = $${params.push(type)}`);
    if (county) where.push(`l.county = $${params.push(county)}`);
    if (q) where.push(`(l.name ILIKE $${params.push(`%${q}%`)} OR l.contact_name ILIKE $${params.length})`);

    const { rows } = await query(
      `SELECT l.*, (SELECT COUNT(*)::int FROM analyses a WHERE a.lead_id = l.id) AS analysis_count
       FROM leads l
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY l.next_action_date NULLS LAST, l.updated_at DESC
       LIMIT 1000`,
      params
    );
    res.json(rows);
  })
);

router.get(
  '/:id',
  wrap(async (req, res) => {
    const { rows } = await query('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Lead not found' });
    res.json(rows[0]);
  })
);

router.post(
  '/',
  wrap(async (req, res) => {
    const data = pick(req.body);
    if (!data.name) throw badRequest('Name is required');
    data.source = 'manual';
    const keys = Object.keys(data);
    const { rows } = await query(
      `INSERT INTO leads (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      keys.map((k) => data[k])
    );
    res.status(201).json(rows[0]);
  })
);

router.patch(
  '/:id',
  wrap(async (req, res) => {
    const data = pick(req.body);
    const keys = Object.keys(data);
    if (!keys.length) throw badRequest('Nothing to update');
    const sets = keys.map((k, i) => `${k} = $${i + 1}`);
    const { rows } = await query(
      `UPDATE leads SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
      [...keys.map((k) => data[k]), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Lead not found' });
    res.json(rows[0]);
  })
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    await query('DELETE FROM leads WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  })
);

function pick(body = {}) {
  const out = {};
  for (const key of EDITABLE) {
    if (body[key] === undefined) continue;
    let v = body[key];
    if (v === '') v = null;
    if (key === 'type' && v && !LEAD_TYPES.includes(v)) throw badRequest('Unknown lead type');
    if (key === 'status' && v && !LEAD_STATUSES.includes(v)) throw badRequest('Unknown status');
    if (key === 'pitch_profile') v = v && typeof v === 'object' ? JSON.stringify(v) : null;
    out[key] = v;
  }
  return out;
}

export default router;