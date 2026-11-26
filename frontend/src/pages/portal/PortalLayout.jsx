// oramara/frontend/src/pages/portal/PortalLayout.jsx
// Frame for every portal page: the FieldFalcon header, the club, the trial banner and the locked screen.
// Guests from a report link see everything in their free window and are offered a free account to save ticks.
import { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { portalApi, portalAuth, track } from './portalApi.js';
import { BRAND, PRICING, TECH } from '../../config/brand.js';
import '../admin/club.css';
import './portal.css';

export default function PortalLayout() {
  const nav = useNavigate();
  const [me, setMe] = useState(null);
  const [error, setError] = useState('');
  const [signup, setSignup] = useState(null); // why the account form is open, or null

  const loadMe = () => portalApi('/me').then(setMe).catch((err) => setError(err.message));
  useEffect(() => {
    if (portalAuth.token) loadMe();
  }, []);

  function openSignup(reason = 'header') {
    setSignup(reason);
    track('signup_open', { reason });
  }

  if (!portalAuth.token) return <Navigate to="/portal/login" replace />;

  function logout() {
    portalAuth.clear();
    nav('/portal/login');
  }

  const access = me?.access;
  const guest = Boolean(me?.user?.guest);
  let hasAccount = false;
  try {
    hasAccount = sessionStorage.getItem('ff_has_account') === '1';
  } catch {}
  const keepUrl = `mailto:${BRAND.email}?subject=${encodeURIComponent(`Keep ${TECH.name} access for ${me?.club?.name || 'our club'}`)}`;

  return (
    <div className="pt">
      <header className="pt-top">
        <div className="pt-top-inner">
          <Link to="/portal" className="pt-brand">
            <span className="pt-brand-name">{TECH.name}</span>
            <span className="pt-brand-by">{TECH.byline}</span>
          </Link>
          {me && (
            <div className="pt-user">
              <span className="pt-club">{me.club.name}</span>
              {guest ? (
                <>
                  {!hasAccount && (
                    <button type="button" className="btn btn-small btn-gold" onClick={() => openSignup('header')}>Create free account</button>
                  )}
                  <Link to="/portal/login" className="link-btn small">Log in</Link>
                </>
              ) : (
                <button type="button" className="link-btn small" onClick={logout}>Log out</button>
              )}
            </div>
          )}
        </div>
      </header>

      {access && !access.locked && access.status === 'trial' && access.daysLeft !== null && (
        <div className={`pt-banner ${access.daysLeft <= 7 ? 'urgent' : ''}`}>
          <span>
            <strong>Free trial:</strong> {access.daysLeft === 0 ? 'ends today' : `${access.daysLeft} day${access.daysLeft === 1 ? '' : 's'} left`}
          </span>
          <a className="btn btn-small btn-gold" href={keepUrl}>Keep access</a>
        </div>
      )}

      {guest && !access?.locked && (
        <div className="pt-guest no-print">
          <span>
            {hasAccount ? (
              <>You are viewing a shared report. <strong>Log in</strong> to tick off jobs and see your notes.</>
            ) : (
              <>You are viewing a shared report. <strong>Create a free account</strong> to tick off jobs, keep notes and come back any time.</>
            )}
          </span>
          {hasAccount ? (
            <Link to="/portal/login" className="btn btn-small">Log in</Link>
          ) : (
            <button type="button" className="btn btn-small" onClick={() => openSignup('banner')}>Create account</button>
          )}
        </div>
      )}

      <main className="pt-main">
        {error && <p className="error">{error}</p>}
        {!me && !error && <p className="muted">Loading...</p>}
        {me && access?.locked && <Locked me={me} keepUrl={keepUrl} />}
        {me && !access?.locked && <Outlet context={{ me, guest, openSignup }} />}
      </main>

      {signup && (
        <SignupModal
          me={me}
          reason={signup}
          onClose={() => setSignup(null)}
          onDone={(token) => {
            portalAuth.set(token);
            setSignup(null);
            loadMe();
          }}
        />
      )}

      <footer className="pt-foot small muted">
        {TECH.name} {TECH.byline} · <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a> · Your data is used only to run your portal, and is deleted on request.
      </footer>
    </div>
  );
}

// After the trial: the latest score stays visible, with the ways to keep access
function Locked({ me, keepUrl }) {
  const latest = me.reports[0];
  const title = { paused: 'Your portal is paused', ended: 'Your access has ended' }[me.access.status] || 'Your free trial has ended';
  return (
    <section className="pt-locked">
      <h1>{title}</h1>
      <p className="muted">
        Your reports, ticks and notes are kept safe for 12 months. Choose a plan to pick up where you left off.
      </p>
      {latest && (
        <div className="pt-locked-score">
          <span className="pt-score">{latest.score}</span>
          <span>
            <strong>{latest.label || 'Main pitch'}</strong>
            <small className="muted">Latest score, {new Date(latest.created_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'long' })}</small>
          </span>
        </div>
      )}
      <div className="pt-plans">
        <div className="pt-plan">
          <h3>{TECH.name} reports</h3>
          <p className="pt-price">€{PRICING.reportsTwiceYearly}<small> a year</small></p>
          <p className="small muted">Spring and autumn reports, the care programme and your notes. Or €{PRICING.reportsMonthly} a season for monthly reports.</p>
        </div>
        <div className="pt-plan featured">
          <span className="badge">Best value</span>
          <h3>{BRAND.product}</h3>
          <p className="pt-price">from €{PRICING.subscriptionFrom}<small> a month</small></p>
          <p className="small muted">The right amount delivered each month, March to October, with every {TECH.name} report included free.</p>
        </div>
      </div>
      <a className="btn" href={keepUrl}>Talk to us about keeping access</a>
    </section>
  );
}

// The free account: email, name and a password. Keeps ticks and notes, and gets them back on any device.
function SignupModal({ me, reason, onClose, onDone }) {
  const [email, setEmail] = useState(me?.user?.email || '');
  const [name, setName] = useState(me?.user?.name || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [hasAccount, setHasAccount] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await portalApi('/account', { method: 'POST', body: { email, name, password } });
      onDone(res.token);
    } catch (err) {
      setError(err.message);
      setHasAccount(err.data?.code === 'has_account');
    }
    setBusy(false);
  }

  return (
    <div className="sh-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sh-panel pt-signup" role="dialog" aria-modal="true" aria-label="Create your free account" onSubmit={submit}>
        <header className="sh-head">
          <div>
            <h2>Create your free account</h2>
            <p className="muted small">
              {reason === 'tick' ? 'Make an account to tick off jobs, so the whole committee sees what is done.' : `For ${me?.club?.name || 'your club'}, free during your trial.`}
            </p>
          </div>
          <button type="button" className="cp-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="sh-body">
          <ul className="pt-signup-list small">
            <li>Tick off jobs in the care programme as they are done</li>
            <li>Keep your notes and come back on any device</li>
            <li>New reports appear here as the season goes on</li>
          </ul>
          <label>
            Email
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Your name
            <input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Choose a password
            <input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
            <span className="small muted">At least 8 characters.</span>
          </label>
          {error && (
            <p className="error">
              {error} {hasAccount && <Link to="/portal/login">Log in</Link>}
            </p>
          )}
          <p className="small muted">
            We keep your login and pitch notes only to run your portal. Email <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a> to have them removed.
          </p>
        </div>
        <footer className="sh-foot">
          <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>Not now</button>
          <button className="btn" disabled={busy}>{busy ? 'Creating...' : 'Create account'}</button>
        </footer>
      </form>
    </div>
  );
}