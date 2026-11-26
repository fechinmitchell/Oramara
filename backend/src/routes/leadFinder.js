// oramara/backend/src/routes/leadFinder.js
import { Router } from 'express';
import { query } from '../db.js';
import { wrap, badRequest } from './wrap.js';
import { COUNTIES } from '../services/constants.js';
import { findVenues } from '../services/overpass.js';

const router = Router();

router.post(
  '/search',
  wrap(async (req, res) => {
    const { county, types } = req.body || {};
    if (!COUNTIES.includes(county)) throw badRequest('Pick a county');
    const wanted = (Array.isArray(types) ? types : []).filter((t) => ['gaa', 'soccer', 'rugby', 'golf'].includes(t));
    if (!wanted.length) throw badRequest('Pick at least one type');

    const venues = await findVenues({ county, types: wanted });

    const ids = venues.map((v) => v.osm_id);
    const { rows } = ids.length
      ? await query('SELECT osm_id FROM leads WHERE osm_id = ANY($1)', [ids])
      : { rows: [] };
    const existing = new Set(rows.map((r) => r.osm_id));

    res.json(venues.map((v) => ({ ...v, imported: existing.has(v.osm_id) })));
  })
);

router.post(
  '/import',
  wrap(async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 500) : [];
    let added = 0;
    for (const v of items) {
      if (!v.name || !v.osm_id) continue;
      const result = await query(
        `INSERT INTO leads (name, type, county, address, lat, lon, website, phone, email, source, osm_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'osm', $10)
         ON CONFLICT (osm_id) DO NOTHING`,
        [v.name, v.type || 'other', v.county, v.address, v.lat, v.lon, v.website, v.phone, v.email, v.osm_id]
      );
      added += result.rowCount;
    }
    res.json({ added });
  })
);

export default router;