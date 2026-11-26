// oramara/backend/src/routes/public.js
import { Router } from 'express';
import { query } from '../db.js';
import { wrap, badRequest } from './wrap.js';
import { LEAD_TYPES } from '../services/constants.js';

const router = Router();

// Free pitch report requests from the website
router.post(
  '/enquiries',
  wrap(async (req, res) => {
    const b = req.body || {};

    // Hidden honeypot field: bots fill it, people don't
    if (b.company_website) return res.json({ ok: true });

    const clubName = clean(b.clubName, 200);
    const contactName = clean(b.contactName, 200);
    const email = clean(b.email, 200);
    const phone = clean(b.phone, 50);
    if (!clubName) throw badRequest('Please add your club or course name');
    if (!email && !phone) throw badRequest('Please add an email or phone number');

    const type = LEAD_TYPES.includes(b.type) ? b.type : 'other';
    const notes = [`Website enquiry`, clean(b.message, 2000)].filter(Boolean).join(': ');

    await query(
      `INSERT INTO leads (name, type, county, contact_name, email, phone, status, source, notes)
       VALUES ($1, $2, $3, $4, $5, $6, 'new', 'inbound', $7)`,
      [clubName, type, clean(b.county, 100), contactName, email, phone, notes]
    );

    res.json({ ok: true });
  })
);

function clean(value, max) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim().slice(0, max);
  return s || null;
}

export default router;