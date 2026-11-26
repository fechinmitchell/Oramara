// oramara/backend/src/routes/public.js
import { Router } from 'express';
import { query } from '../db.js';
import { wrap, badRequest } from './wrap.js';
import { LEAD_TYPES, PITCH_TYPES } from '../services/constants.js';
import { limitByIp } from '../rateLimit.js';
import { createRequest, findByToken, getSettings, isDisposable, publicView, FREE_MONTHS } from '../services/freeReport.js';

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

// Free 3 month report from the popup on the FieldFalcon page.
// Bots: a hidden field people never fill, and a form sent faster than a person could type it.
// People: a few tries per address per hour and per day, then one report per inbox and per club.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_FILL_MS = 3000;
router.post(
  '/free-report',
  limitByIp({ name: 'free-report-hour', max: 5, windowMs: 60 * 60 * 1000 }),
  limitByIp({ name: 'free-report-day', max: 10, windowMs: 24 * 60 * 60 * 1000 }),
  wrap(async (req, res) => {
    const b = req.body || {};
    const settings = await getSettings();

    // Looks like a bot: answer as if all went well and do nothing
    const openedFor = Date.now() - Number(b.openedAt || 0);
    if (b.company_website || !Number(b.openedAt) || openedFor < MIN_FILL_MS) {
      return res.json({ status: 'received', club: clean(b.clubName, 200), months: FREE_MONTHS });
    }

    const clubName = clean(b.clubName, 120);
    const contactName = clean(b.contactName, 120);
    const email = clean(b.email, 200)?.toLowerCase() || null;
    const county = clean(b.county, 60);
    if (!contactName) throw badRequest('Please add your name');
    if (!email || !EMAIL.test(email)) throw badRequest('Please add a working email address');
    if (isDisposable(email)) throw badRequest('Please use your own or your club email address');
    if (!clubName || clubName.length < 3) throw badRequest('Please add your club name');
    const pitchType = PITCH_TYPES[b.type] ? b.type : 'gaa';

    const result = await createRequest({
      email,
      contactName,
      clubName,
      county,
      pitchType,
      ip: req.ip,
      baseUrl: req.headers.origin || null
    });

    if (result.duplicate === 'email') {
      return res.status(409).json({
        error: 'This email address has already had its free report. Get in touch at hello@oramara.ie if you need it again.',
        code: 'email_used'
      });
    }
    if (result.duplicate === 'club') {
      return res.json({ status: 'club_done', club: result.request.club_name, months: FREE_MONTHS });
    }
    res.status(201).json(publicView(result.request, settings));
  })
);

// The popup checks back here until the report is ready
router.get(
  '/free-report/:token',
  limitByIp({ name: 'free-report-status', max: 400, windowMs: 60 * 60 * 1000 }),
  wrap(async (req, res) => {
    const r = await findByToken(req.params.token);
    if (!r) return res.status(404).json({ error: 'We could not find that request' });
    res.json(publicView(r, await getSettings()));
  })
);

function clean(value, max) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim().slice(0, max);
  return s || null;
}

export default router;