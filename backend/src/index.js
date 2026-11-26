// oramara/backend/src/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { login, requireAuth } from './auth.js';
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

const app = express();

const origins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({ origin: origins }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.post('/api/auth/login', wrap(login));
app.use('/api/public', publicRoutes);
app.use('/api/leads', requireAuth, usageContext, leadRoutes);
app.use('/api/lead-finder', requireAuth, usageContext, leadFinderRoutes);
app.use('/api/analyses', requireAuth, usageContext, analysisRoutes);
app.use('/api/usage', requireAuth, usageRoutes);
app.use('/api/portal-admin', requireAuth, portalAdminRoutes);
app.use('/api/contacts', requireAuth, usageContext, contactRoutes);
// The customer portal for clubs: its own logins, never the admin's
app.use('/api/portal', portalRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'Something went wrong' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API listening on ${port}`));