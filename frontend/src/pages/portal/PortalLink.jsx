// oramara/frontend/src/pages/portal/PortalLink.jsx
// The report link from the email: opens the report straight away, no password needed
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { portalApi, portalAuth, session } from './portalApi.js';
import { BRAND, TECH } from '../../config/brand.js';
import './portal.css';

export default function PortalLink() {
  const { token } = useParams();
  const nav = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    portalApi(`/link/${token}`, { method: 'POST', body: { session } })
      .then((r) => {
        // A club member already logged in on this device keeps their own login
        if (!portalAuth.token || isGuest(portalAuth.token)) portalAuth.set(r.token);
        try {
          sessionStorage.setItem('ff_has_account', r.hasAccount ? '1' : '');
        } catch {}
        nav(r.analysisId ? `/portal/report/${r.analysisId}` : '/portal', { replace: true });
      })
      .catch((err) => setError(err.message));
  }, [token]);

  return (
    <div className="pt-auth">
      <div className="pt-auth-card">
        <div className="pt-brand">
          <span className="pt-brand-name">{TECH.name}</span>
          <span className="pt-brand-by">{TECH.byline}</span>
        </div>
        {!error && <p className="muted">Opening your pitch report...</p>}
        {error && (
          <>
            <h1>This link has expired</h1>
            <p className="error">{error}</p>
            <p className="small muted">
              Email <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a> for a new link, or <Link to="/portal/login">log in</Link> if you have an account.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function isGuest(token) {
  try {
    return Boolean(JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).guest);
  } catch {
    return true;
  }
}