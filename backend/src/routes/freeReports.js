// oramara/backend/src/routes/freeReports.js
// Admin side of the free reports from the website: the daily spend cap, today's spend, and every request with its status.
import { Router } from 'express';
import { query } from '../db.js';
import { wrap, badRequest } from './wrap.js';
import { getSettings, saveSettings, today, kick } from '../services/freeReport.js';

const router = Router();

router.get(
  '/',
  wrap(async (req, res) => {
    const [settings, now, list] = await Promise.all([
      getSettings(),
      today(),
      query(
        `SELECT f.id, f.club_name, f.county, f.contact_name, f.email, f.status, f.error, f.link_url, f.lead_id, f.analysis_id,
           f.created_at, f.finished_at,
           (SELECT COALESCE(SUM(cost_usd), 0)::float FROM api_usage u WHERE u.analysis_id = f.analysis_id AND f.analysis_id IS NOT NULL) AS cost_usd
         FROM free_reports f ORDER BY f.created_at DESC LIMIT 100`
      )
    ]);
    const waiting = list.rows.filter((r) => ['pending', 'queued', 'running'].includes(r.status)).length;
    res.json({ settings, today: { ...now, waiting }, requests: list.rows });
  })
);

router.put(
  '/settings',
  wrap(async (req, res) => {
    res.json({ settings: await saveSettings(req.body || {}) });
  })
);

// Try one again: back in the queue (still within the daily cap)
router.post(
  '/:id/retry',
  wrap(async (req, res) => {
    const { rows } = await query(
      `UPDATE free_reports SET status = 'pending', error = NULL, attempts = 0 WHERE id = $1 AND status IN ('needs_review', 'failed', 'queued') RETURNING id`,
      [req.params.id]
    );
    if (!rows.length) throw badRequest('Only a request that is waiting or needs a look can be tried again');
    kick();
    res.json({ ok: true });
  })
);

export default router;
