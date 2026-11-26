-- oramara/backend/src/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Logins made before a password change stop working once it changes
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'other',
  county TEXT,
  address TEXT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  source TEXT NOT NULL DEFAULT 'manual',
  osm_id TEXT UNIQUE,
  notes TEXT,
  next_action TEXT,
  next_action_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leads_status_idx ON leads (status);
CREATE INDEX IF NOT EXISTS leads_county_idx ON leads (county);

CREATE TABLE IF NOT EXISTS analyses (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  pitch_type TEXT NOT NULL DEFAULT 'gaa',
  label TEXT,
  image_source TEXT,
  polygon JSONB NOT NULL,
  original_jpg BYTEA NOT NULL,
  heatmap_png BYTEA NOT NULL,
  score INTEGER NOT NULL,
  healthy_pct NUMERIC NOT NULL,
  moderate_pct NUMERIC NOT NULL,
  stressed_pct NUMERIC NOT NULL,
  zones JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS analyses_lead_idx ON analyses (lead_id);

-- Step 5: map based analysis and Claude written reports
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS geo_polygon JSONB;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS imagery JSONB;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS ai_report JSONB;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS ai_model TEXT;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS overlay_png BYTEA;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS saved BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS analyses_saved_idx ON analyses (saved, created_at DESC);

-- Step 5b: monthly Sentinel 2 plant vigour per analysed pitch
CREATE TABLE IF NOT EXISTS satellite_months (
  analysis_id INTEGER NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  ndvi NUMERIC,
  coverage NUMERIC NOT NULL DEFAULT 0,
  image_png BYTEA,
  bounds JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (analysis_id, month)
);
ALTER TABLE satellite_months ADD COLUMN IF NOT EXISTS strong_pct NUMERIC;
ALTER TABLE satellite_months ADD COLUMN IF NOT EXISTS moderate_pct NUMERIC;
ALTER TABLE satellite_months ADD COLUMN IF NOT EXISTS thin_pct NUMERIC;

-- Step 6: every outside API call, with cost and who it was for
CREATE TABLE IF NOT EXISTS api_usage (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider TEXT NOT NULL,
  operation TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  units NUMERIC NOT NULL DEFAULT 0,
  unit_name TEXT,
  cost_usd NUMERIC NOT NULL DEFAULT 0,
  user_id INTEGER,
  session_id TEXT,
  lead_id INTEGER,
  analysis_id INTEGER
);
CREATE INDEX IF NOT EXISTS api_usage_created_idx ON api_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS api_usage_session_idx ON api_usage (session_id);
CREATE INDEX IF NOT EXISTS api_usage_lead_idx ON api_usage (lead_id);

-- Step 7: club details that shape the care programme (busy months, renovation month, drainage, greens)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pitch_profile JSONB;

-- Step 8: goalmouths (and later other parts of a pitch) analysed on their own at closer zoom
CREATE TABLE IF NOT EXISTS analysis_parts (
  id SERIAL PRIMARY KEY,
  analysis_id INTEGER NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'goalmouth',
  label TEXT,
  geo_polygon JSONB,
  bounds JSONB,
  area_m2 INTEGER,
  zoom INTEGER,
  score INTEGER,
  healthy_pct NUMERIC,
  moderate_pct NUMERIC,
  stressed_pct NUMERIC,
  original_jpg BYTEA,
  heatmap_png BYTEA,
  overlay_png BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS analysis_parts_analysis_idx ON analysis_parts (analysis_id);
-- Extra pitches (training, juvenile...) analysed in the same run keep their weak zones and type
ALTER TABLE analysis_parts ADD COLUMN IF NOT EXISTS zones JSONB;
ALTER TABLE analysis_parts ADD COLUMN IF NOT EXISTS area_kind TEXT;
ALTER TABLE analysis_parts ADD COLUMN IF NOT EXISTS metres_per_pixel NUMERIC;

-- Reports saved to the club's customer portal (the portal itself comes later)
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS in_portal BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS portal_at TIMESTAMPTZ;

-- ---------- Customer portal ----------
-- People at a club who can log in to see their own reports
CREATE TABLE IF NOT EXISTS portal_users (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  password_hash TEXT,
  invite_token TEXT UNIQUE,
  invite_expires TIMESTAMPTZ,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS portal_users_lead_idx ON portal_users (lead_id);

-- What a club can see: a free trial, a paid plan, paused or ended
CREATE TABLE IF NOT EXISTS portal_access (
  lead_id INTEGER PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'trial',
  trial_ends_at TIMESTAMPTZ,
  plan TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Jobs the club has ticked off in the care programme, with their own notes
CREATE TABLE IF NOT EXISTS portal_ticks (
  id SERIAL PRIMARY KEY,
  analysis_id INTEGER NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  task_key TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  updated_by INTEGER REFERENCES portal_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (analysis_id, task_key)
);

-- ---------- Contacts (GDPR) ----------
-- Public contact details a club or business has published itself, with where and when they were found.
-- kind: organisation (club or role address) or personal (a named person's own address: not used without consent)
-- status: found, verified, do_not_contact
CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  role TEXT,
  name TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  contact_form TEXT,
  source_url TEXT,
  source_title TEXT,
  kind TEXT NOT NULL DEFAULT 'organisation',
  status TEXT NOT NULL DEFAULT 'found',
  notes TEXT,
  found_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS contacts_lead_idx ON contacts (lead_id);

-- Addresses that asked not to be contacted. Every invite and email checks this first.
CREATE TABLE IF NOT EXISTS suppression (
  email TEXT PRIMARY KEY,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- How many months a club sees in its portal for free (1, 3, 6 or 12), and upgrade requests
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS portal_months INTEGER NOT NULL DEFAULT 12;
ALTER TABLE portal_access ADD COLUMN IF NOT EXISTS upgrade_requested_at TIMESTAMPTZ;
ALTER TABLE portal_access ADD COLUMN IF NOT EXISTS upgrade_plan TEXT;

-- Report links: open the report straight from the email, no password needed. The club can make an account inside.
CREATE TABLE IF NOT EXISTS portal_links (
  id SERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  analysis_id INTEGER REFERENCES analyses(id) ON DELETE SET NULL,
  email TEXT,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  first_opened_at TIMESTAMPTZ,
  last_opened_at TIMESTAMPTZ,
  opens INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS portal_links_lead_idx ON portal_links (lead_id);

-- What clubs do in the portal: link opens, reports and months viewed, sections read, links clicked, upgrade clicks
CREATE TABLE IF NOT EXISTS portal_events (
  id BIGSERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  analysis_id INTEGER,
  link_id INTEGER,
  user_id INTEGER,
  session TEXT,
  kind TEXT NOT NULL,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS portal_events_lead_idx ON portal_events (lead_id, created_at DESC);
ALTER TABLE portal_links ADD COLUMN IF NOT EXISTS trial_days INTEGER NOT NULL DEFAULT 30;
-- ---------- Free reports from the website ----------
-- Settings the team changes in the admin, such as the daily spend cap for free reports
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One free report per email address. email_key is the address tidied up (lower case, no +tags,
-- no dots for Gmail) so the same inbox cannot ask twice. status: pending, running, ready, queued, needs_review, failed
CREATE TABLE IF NOT EXISTS free_reports (
  id SERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  email_key TEXT NOT NULL UNIQUE,
  contact_name TEXT,
  club_name TEXT NOT NULL,
  club_key TEXT NOT NULL,
  county TEXT,
  pitch_type TEXT NOT NULL DEFAULT 'gaa',
  ip TEXT,
  base_url TEXT,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  analysis_id INTEGER REFERENCES analyses(id) ON DELETE SET NULL,
  link_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS free_reports_club_idx ON free_reports (club_key);
CREATE INDEX IF NOT EXISTS free_reports_status_idx ON free_reports (status, created_at);

-- Clubs that asked for a free report show in the Customer portal even before their report is made
INSERT INTO portal_access (lead_id, status)
  SELECT DISTINCT lead_id, 'trial' FROM free_reports WHERE lead_id IS NOT NULL
  ON CONFLICT (lead_id) DO NOTHING;
