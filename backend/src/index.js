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
import { usageContext } from './usage.js';
import { wrap } from './routes/wrap.js';

checkSecrets();

const app = express();

// Render puts the app behind one proxy, so the real visitor address comes from it
app.set('trust proxy', 1);
app.disable('x-powered-by');

const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({ origin: origins }));
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

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API listening on ${port}`));
