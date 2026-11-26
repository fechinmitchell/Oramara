// oramara/backend/src/routes/usage.js
// API usage and cost: a quick summary for the top bar, and full breakdowns for the usage page.
import { Router } from 'express';
import { query } from '../db.js';
import { wrap } from './wrap.js';

const router = Router();

// Free monthly allowances, shown next to what we have used
const FREE_ALLOWANCE = {
  copernicus: { units: Number(process.env.CDSE_MONTHLY_PU) || 30000, unitName: 'processing units' }
};

const TOTALS = `COALESCE(SUM(cost_usd), 0)::float AS cost_usd, COUNT(*)::int AS calls,
  COALESCE(SUM(input_tokens), 0)::float AS input_tokens, COALESCE(SUM(output_tokens), 0)::float AS output_tokens`;

// Top bar: this login session, today, this month, all time
router.get(
  '/summary',
  wrap(async (req, res) => {
    const sid = req.user?.sid || '';
    const { rows } = await query(
      `SELECT
         COALESCE(SUM(cost_usd) FILTER (WHERE session_id = $1), 0)::float AS session,
         COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= date_trunc('day', NOW())), 0)::float AS today,
         COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= date_trunc('month', NOW())), 0)::float AS month,
         COALESCE(SUM(cost_usd), 0)::float AS total,
         COUNT(*) FILTER (WHERE session_id = $1)::int AS session_calls,
         COALESCE(SUM(units) FILTER (WHERE provider = 'copernicus' AND created_at >= date_trunc('month', NOW())), 0)::float AS copernicus_month
       FROM api_usage`,
      [sid]
    );
    res.json({ ...rows[0], copernicus_allowance: FREE_ALLOWANCE.copernicus.units, has_session: Boolean(sid) });
  })
);

// Usage page: everything broken down. ?days=7|30|90|0 (0 = all time), ?type=golf etc to filter clubs
router.get(
  '/details',
  wrap(async (req, res) => {
    const days = Number(req.query.days) || 0;
    const params = [];
    const where = ['TRUE'];
    if (days > 0) where.push(`u.created_at >= NOW() - ($${params.push(days)} || ' days')::interval`);
    if (req.query.type) where.push(`l.type = $${params.push(req.query.type)}`);
    const w = where.join(' AND ');
    const from = 'FROM api_usage u LEFT JOIN leads l ON l.id = u.lead_id';

    const [totals, providers, operations, models, clubs, users, analyses, daily, recent, sessions] = await Promise.all([
      query(`SELECT ${TOTALS} ${from} WHERE ${w}`, params),
      query(
        `SELECT u.provider, ${TOTALS}, COALESCE(SUM(u.units), 0)::float AS units, MAX(u.unit_name) AS unit_name
         ${from} WHERE ${w} GROUP BY u.provider ORDER BY cost_usd DESC, calls DESC`,
        params
      ),
      query(
        `SELECT u.provider, u.operation, ${TOTALS}, COALESCE(SUM(u.units), 0)::float AS units, MAX(u.unit_name) AS unit_name
         ${from} WHERE ${w} GROUP BY u.provider, u.operation ORDER BY cost_usd DESC, calls DESC`,
        params
      ),
      query(
        `SELECT u.model, ${TOTALS} ${from} WHERE ${w} AND u.model IS NOT NULL GROUP BY u.model ORDER BY cost_usd DESC`,
        params
      ),
      query(
        `SELECT u.lead_id, l.name, l.type, l.county, ${TOTALS},
           COUNT(DISTINCT u.analysis_id)::int AS analyses
         ${from} WHERE ${w} AND u.lead_id IS NOT NULL
         GROUP BY u.lead_id, l.name, l.type, l.county ORDER BY cost_usd DESC, calls DESC LIMIT 100`,
        params
      ),
      query(
        `SELECT u.user_id, us.name, us.email, ${TOTALS}, COUNT(DISTINCT u.session_id)::int AS sessions
         ${from} LEFT JOIN users us ON us.id = u.user_id WHERE ${w}
         GROUP BY u.user_id, us.name, us.email ORDER BY cost_usd DESC`,
        params
      ),
      query(
        `SELECT u.analysis_id, a.label, a.pitch_type, a.score, l.name AS lead_name, ${TOTALS}
         ${from} LEFT JOIN analyses a ON a.id = u.analysis_id WHERE ${w} AND u.analysis_id IS NOT NULL
         GROUP BY u.analysis_id, a.label, a.pitch_type, a.score, l.name ORDER BY cost_usd DESC LIMIT 20`,
        params
      ),
      query(
        `SELECT to_char(date_trunc('day', u.created_at), 'YYYY-MM-DD') AS day, ${TOTALS}
         ${from} WHERE ${w} GROUP BY 1 ORDER BY 1 DESC LIMIT 60`,
        params
      ),
      query(
        `SELECT u.id, u.created_at, u.provider, u.operation, u.model, u.input_tokens, u.output_tokens, u.units::float,
           u.unit_name, u.cost_usd::float, l.name AS lead_name, us.name AS user_name, u.analysis_id
         ${from} LEFT JOIN users us ON us.id = u.user_id WHERE ${w} ORDER BY u.created_at DESC LIMIT 50`,
        params
      ),
      query(
        `SELECT u.session_id, us.name AS user_name, MIN(u.created_at) AS started, MAX(u.created_at) AS last_call, ${TOTALS}
         ${from} LEFT JOIN users us ON us.id = u.user_id WHERE ${w} AND u.session_id IS NOT NULL
         GROUP BY u.session_id, us.name ORDER BY last_call DESC LIMIT 15`,
        params
      )
    ]);

    const copernicusMonth = await query(
      `SELECT COALESCE(SUM(units), 0)::float AS used FROM api_usage WHERE provider = 'copernicus' AND created_at >= date_trunc('month', NOW())`
    );

    res.json({
      days,
      totals: totals.rows[0],
      providers: providers.rows,
      operations: operations.rows,
      models: models.rows,
      clubs: clubs.rows,
      users: users.rows,
      analyses: analyses.rows,
      daily: daily.rows.reverse(),
      recent: recent.rows,
      sessions: sessions.rows,
      allowances: {
        copernicus: { ...FREE_ALLOWANCE.copernicus, usedThisMonth: copernicusMonth.rows[0].used }
      }
    });
  })
);

export default router;