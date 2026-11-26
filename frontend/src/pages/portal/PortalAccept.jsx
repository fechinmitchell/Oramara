// oramara/frontend/src/pages/portal/PortalAccept.jsx
// The link in an invite or a password reset: the club contact sets a password and goes straight in
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { portalApi, portalAuth } from './portalApi.js';
import { BRAND, TECH } from '../../config/brand.js';
import './portal.css';

export default function PortalAccept() {
  const { token } = useParams();
  const nav = useNavigate();
  const [invite, setInvite] = useState(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    portalApi(`/invite/${token}`)
      .then((i) => {
        setInvite(i);
        setName(i.name || '');
      })
      .catch((err) => setError(err.message));
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await portalApi('/accept', { method: 'POST', body: { token, password, name } });
      portalAuth.set(res.token);
      nav('/portal');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pt-auth">
      <form className="pt-auth-card" onSubmit={submit}>
        <div className="pt-brand">
          <span className="pt-brand-name">{TECH.name}</span>
          <span className="pt-brand-by">{TECH.byline}</span>
        </div>
        {!invite && !error && <p className="muted">Checking your invite...</p>}
        {!invite && error && (
          <>
            <h1>Invite not found</h1>
            <p className="error">{error}</p>
            <p className="small muted">
              Email <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a> for a new link.
            </p>
          </>
        )}
        {invite && (
          <>
            <h1>{invite.reset ? 'Set a new password' : `Welcome, ${invite.club}`}</h1>
            <p className="muted small">
              {invite.reset ? 'Choose a new password for ' : 'Set a password for '}
              <strong>{invite.email}</strong>
              {invite.reset ? ` at ${invite.club}.` : ' to see your pitch reports.'}
            </p>
            <label>
              Your name
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
            <label>
              Choose a password
              <input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
              <span className="small muted">At least 8 characters.</span>
            </label>
            {error && <p className="error">{error}</p>}
            <button className="btn" disabled={busy}>{busy ? 'Setting up...' : invite.reset ? 'Save password and open' : 'Set password and open'}</button>
            <p className="small muted">
              We keep your login details and pitch notes only to run your portal. Email{' '}
              <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a> at any time to have them removed.
            </p>
          </>
        )}
      </form>
    </div>
  );
}