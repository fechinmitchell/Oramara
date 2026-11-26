// oramara/backend/src/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { changePassword, login, loginLimiter, me, requireAuth } from './auth.js';
import { checkSecrets, ensureSchema, seedAdmin } from './setup.js';
import { limitByIp } from './rateLimit.js';
import publicRoutes from './routes/public.js';
import leadRoutes from './routes/leads.js';
import leadFinderRoutes from './routes/leadFinder.js';
import analysisRoutes from './routes/analyses.js';
import usageRoutes from './routes/usage.js';
import portalRoutes from './routes/portal.js';
import portalAdminRoutes from './routes/portalAdmin.js';
import contactRoutes from './routes/contacts.js';
import freeReportRoutes from './routes/freeReports.js';
import { startQueue } from './services/freeReport.js';
import { usageContext } from './usage.js';
import { wrap } from './routes/wrap.js';

checkSecrets();

const app = express();

// Render puts the app behind one proxy, so the real visitor address comes from it
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Sites allowed to call the API. A trailing slash or capital letters in CORS_ORIGINS
// would otherwise block the browser, so every entry is tidied the same way the browser sends it.
const tidyOrigin = (o) => String(o || '').trim().replace(/\/+$/, '').toLowerCase();
const origins = new Set(
  [process.env.CORS_ORIGINS || 'http://localhost:5173', 'https://oramara.vercel.app', process.env.PORTAL_URL]
    .join(',')
    .split(',')
    .map(tidyOrigin)
    .filter(Boolean)
);
// Vercel preview builds of this project, for checking a change before it goes live
const previewOrigin = /^https:\/\/oramara(-[a-z0-9-]+)?-fechinmitchells-projects\.vercel\.app$/;

app.use(
  cors({
    origin(origin, done) {
      // No origin means a direct call (health checks, curl), not a browser page
      if (!origin || origins.has(tidyOrigin(origin)) || previewOrigin.test(tidyOrigin(origin))) return done(null, true);
      console.warn(`Blocked a call from ${origin}. Add it to CORS_ORIGINS if it should be allowed.`);
      done(null, false);
    }
  })
);
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': 'max-age=31536000'
  });
  next();
});
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Team login: rate limited, then a way to check the login and change the password
app.post('/api/auth/login', loginLimiter.check, wrap(login));
app.get('/api/auth/me', requireAuth, wrap(me));
app.post('/api/auth/password', requireAuth, limitByIp({ name: 'admin-password', max: 10, windowMs: 15 * 60 * 1000 }), wrap(changePassword));

app.use('/api/public', publicRoutes);
app.use('/api/leads', requireAuth, usageContext, leadRoutes);
app.use('/api/lead-finder', requireAuth, usageContext, leadFinderRoutes);
app.use('/api/analyses', requireAuth, usageContext, analysisRoutes);
app.use('/api/usage', requireAuth, usageRoutes);
app.use('/api/portal-admin', requireAuth, portalAdminRoutes);
app.use('/api/contacts', requireAuth, usageContext, contactRoutes);
app.use('/api/free-reports', requireAuth, usageContext, freeReportRoutes);
// The customer portal for clubs: its own logins, never the admin's
const portalLimit = limitByIp({ name: 'portal-login', max: 20, windowMs: 15 * 60 * 1000 });
app.use('/api/portal/login', portalLimit);
app.use('/api/portal/accept', portalLimit);
app.use('/api/portal', portalRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'Something went wrong' });
});

try {
  await ensureSchema();
  await seedAdmin();
} catch (err) {
  console.error('Database setup failed:', err.message || err.code || String(err));
  process.exit(1);
}

// Free reports asked for on the website are made one at a time in the background
startQueue();

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API listening on ${port}. Allowed sites: ${[...origins].join(', ')}`));
