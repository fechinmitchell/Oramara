// oramara/backend/src/usage.js
// Records every call we make to an outside API (Claude, Copernicus, Esri, OpenStreetMap)
// with who made it, for which club and analysis, and what it cost.
// The request context (user, login session, club, analysis) travels with each request,
// so the services can record usage without passing those details around.

import { AsyncLocalStorage } from 'node:async_hooks';
import { query } from './db.js';

const store = new AsyncLocalStorage();

// Claude prices in US dollars per million tokens. Check platform.claude.com/docs/en/about-claude/pricing
// and override in .env if they change (ANTHROPIC_PRICE_IN, ANTHROPIC_PRICE_OUT).
const CLAUDE_PRICES = {
  'claude-fable-5-2': { in: 10, out: 50 },
  'claude-opus-5-5': { in: 4, out: 20 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5 }
};

export function claudeCostUsd(model, inputTokens = 0, outputTokens = 0) {
  const envIn = Number(process.env.ANTHROPIC_PRICE_IN);
  const envOut = Number(process.env.ANTHROPIC_PRICE_OUT);
  const price = envIn && envOut ? { in: envIn, out: envOut } : CLAUDE_PRICES[model] || CLAUDE_PRICES['claude-sonnet-5-5'];
  return (inputTokens * price.in + outputTokens * price.out) / 1e6;
}

// Express middleware: run the rest of the request inside a usage context
export function usageContext(req, res, next) {
  store.run({ userId: req.user?.id || null, sessionId: req.user?.sid || null, leadId: null, analysisId: null, ids: [] }, next);
}

// Routes call this once they know which club or analysis the work is for
export function setUsageContext(values) {
  const ctx = store.getStore();
  if (ctx) Object.assign(ctx, values);
}

// provider: anthropic | copernicus | esri | openstreetmap
// operation: what it was for, e.g. report, rewrite, locate_pitch, monthly_stats, month_image, tiles, photo_date, overpass
export function trackUsage({ provider, operation, model = null, inputTokens = 0, outputTokens = 0, units = 0, unitName = null, costUsd = 0 }) {
  const ctx = store.getStore() || {};
  const insert = query(
    `INSERT INTO api_usage (provider, operation, model, input_tokens, output_tokens, units, unit_name, cost_usd,
       user_id, session_id, lead_id, analysis_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [
      provider, operation, model, inputTokens, outputTokens, units, unitName, costUsd,
      ctx.userId || null, ctx.sessionId || null, ctx.leadId || null, ctx.analysisId || null
    ]
  )
    .then((r) => r.rows[0]?.id)
    .catch((err) => console.error('Could not record API usage:', err.message));
  ctx.ids?.push(insert);
}

// After a new analysis is saved, link the calls made while creating it
export async function linkUsageToAnalysis(analysisId) {
  const ctx = store.getStore();
  if (!ctx?.ids?.length) return;
  const ids = (await Promise.all(ctx.ids)).filter(Boolean);
  ctx.analysisId = analysisId;
  if (ids.length) await query('UPDATE api_usage SET analysis_id = $1 WHERE id = ANY($2::bigint[])', [analysisId, ids]);
}