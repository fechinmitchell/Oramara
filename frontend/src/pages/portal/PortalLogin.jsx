// oramara/frontend/src/pages/portal/PortalLogin.jsx
// Club login for the FieldFalcon customer portal
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { portalApi, portalAuth } from './portalApi.js';
import { BRAND, TECH } from '../../config/brand.js';
import './portal.css';

export default function PortalLogin() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token } = await portalApi('/login', { method: 'POST', body: { email, password } });
      portalAuth.set(token);
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
        <h1>Log in to your club</h1>
        <p className="muted small">See your pitch reports and tick off your care programme as you go.</p>
        <label>
          Email
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Logging in...' : 'Log in'}</button>
        <p className="small muted">
          No login yet, or forgot your password? Email <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a> and we will send you a link.
        </p>
      </form>
    </div>
  );
}