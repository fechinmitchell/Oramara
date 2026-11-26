// oramara/backend/src/routes/contacts.js
// Contact details for each club, found from public sources, with GDPR controls:
// where each detail came from, personal addresses flagged, and a do not contact list.
import { Router } from 'express';
import { query } from '../db.js';
import { wrap, badRequest } from './wrap.js';
import { findContacts } from '../services/contactFinder.js';
import { setUsageContext } from '../usage.js';

const router = Router();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function listFor(leadId) {
  const { rows } = await query(
    `SELECT c.*, (s.email IS NOT NULL) AS suppressed FROM contacts c LEFT JOIN suppression s ON s.email = c.email
     WHERE c.lead_id = $1 ORDER BY (c.kind = 'personal'), c.found_at`,
    [leadId]
  );
  return rows;
}

router.get(
  '/lead/:leadId',
  wrap(async (req, res) => res.json(await listFor(Number(req.params.leadId))))
);

// Search the web for this club's published contact details and save what was found
router.post(
  '/lead/:leadId/find',
  wrap(async (req, res) => {
    const leadId = Number(req.params.leadId);
    const lead = (await query('SELECT id, name, type, county, website FROM leads WHERE id = $1', [leadId])).rows[0];
    if (!lead) throw badRequest('Club not found');
    setUsageContext({ leadId });

    const found = await findContacts(lead);
    const existing = await listFor(leadId);
    const key = (c) => `${c.email || ''}|${(c.phone || '').replace(/\D/g, '')}|${c.contact_form || ''}`;
    const have = new Set(existing.map(key));
    let added = 0;
    for (const c of found.contacts) {
      if (have.has(key(c))) continue;
      await query(
        `INSERT INTO contacts (lead_id, role, name, email, phone, contact_form, website, source_url, kind, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [leadId, c.role, c.name, c.email, c.phone, c.contact_form, found.website, c.source_url, c.kind, c.source_checked ? null : 'Source page not confirmed by the search: check it before use']
      );
      have.add(key(c));
      added++;
    }
    // Fill in the club's website if we did not have it
    if (found.website && !lead.website) await query('UPDATE leads SET website = $1 WHERE id = $2', [found.website, leadId]);

    res.json({ added, notes: found.notes, searches: found.searches, contacts: await listFor(leadId) });
  })
);

// Add a contact by hand (for example from a phone call or a business card)
router.post(
  '/lead/:leadId',
  wrap(async (req, res) => {
    const b = req.body || {};
    const email = b.email ? String(b.email).trim().toLowerCase() : null;
    if (email && !EMAIL.test(email)) throw badRequest('That email address does not look right');
    if (!email && !b.phone) throw badRequest('Add an email or a phone number');
    await query(
      `INSERT INTO contacts (lead_id, role, name, email, phone, source_url, kind, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'verified', $8)`,
      [
        Number(req.params.leadId),
        b.role || null,
        b.name || null,
        email,
        b.phone || null,
        b.source || 'Given directly',
        b.kind === 'personal' ? 'personal' : 'organisation',
        b.notes || null
      ]
    );
    res.json(await listFor(Number(req.params.leadId)));
  })
);

// Mark as checked, mark as do not contact, or change the role or note
router.patch(
  '/:id',
  wrap(async (req, res) => {
    const c = (await query('SELECT * FROM contacts WHERE id = $1', [req.params.id])).rows[0];
    if (!c) throw badRequest('Contact not found');
    const status = req.body?.status ?? c.status;
    if (!['found', 'verified', 'do_not_contact'].includes(status)) throw badRequest('Unknown status');
    const kind = req.body?.kind === 'personal' || req.body?.kind === 'organisation' ? req.body.kind : c.kind;
    await query('UPDATE contacts SET status = $1, kind = $2, role = $3, notes = $4 WHERE id = $5', [
      status,
      kind,
      req.body?.role ?? c.role,
      req.body?.notes ?? c.notes,
      c.id
    ]);
    // Do not contact also goes on the list every invite and email checks
    if (status === 'do_not_contact' && c.email) {
      await query(`INSERT INTO suppression (email, reason) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING`, [c.email, req.body?.reason || 'Asked not to be contacted']);
    }
    res.json(await listFor(c.lead_id));
  })
);

// Delete a contact completely (for example on a GDPR erasure request)
router.delete(
  '/:id',
  wrap(async (req, res) => {
    const c = (await query('DELETE FROM contacts WHERE id = $1 RETURNING lead_id', [req.params.id])).rows[0];
    res.json(c ? await listFor(c.lead_id) : []);
  })
);

// The do not contact list
router.get(
  '/suppression',
  wrap(async (req, res) => res.json((await query('SELECT * FROM suppression ORDER BY created_at DESC')).rows))
);

router.post(
  '/suppression',
  wrap(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!EMAIL.test(email)) throw badRequest('That email address does not look right');
    await query(`INSERT INTO suppression (email, reason) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING`, [email, req.body?.reason || null]);
    await query(`UPDATE contacts SET status = 'do_not_contact' WHERE email = $1`, [email]);
    res.json({ ok: true });
  })
);

export default router;