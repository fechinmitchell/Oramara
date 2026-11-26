// oramara/frontend/src/pages/admin/Account.jsx
// The signed in team member's own login: shows who is logged in and lets them change the password.
// Changing it logs out every other device that was using the old one.
import { useEffect, useState } from 'react';
import { api, auth } from '../../api.js';

const MIN_PASSWORD = 10;

export default function Account() {
  const [user, setUser] = useState(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch((err) => setError(err.message));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setDone(false);
    if (next.length < MIN_PASSWORD) return setError(`Use a new password of at least ${MIN_PASSWORD} characters`);
    if (next !== repeat) return setError('The two new passwords do not match');
    setBusy(true);
    try {
      const { token } = await api('/auth/password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      // The old login stops working, so keep this browser in with the new one
      auth.set(token);
      setCurrent('');
      setNext('');
      setRepeat('');
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>Account</h1>
      <p className="muted">{user ? <>Logged in as <strong>{user.email}</strong></> : 'Loading...'}</p>

      <form className="card login-card" onSubmit={submit} style={{ marginTop: '1.5rem' }}>
        <h2>Change password</h2>
        <label>
          Current password
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        </label>
        <label>
          New password
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={MIN_PASSWORD} required />
        </label>
        <label>
          New password again
          <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" minLength={MIN_PASSWORD} required />
        </label>
        <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
          At least {MIN_PASSWORD} characters. Any other device logged in with the old password will be logged out.
        </p>
        {error && <p className="error">{error}</p>}
        {done && <p style={{ color: 'var(--green)', fontWeight: 500 }}>Password changed.</p>}
        <button className="btn" disabled={busy}>{busy ? 'Saving...' : 'Change password'}</button>
      </form>
    </div>
  );
}
