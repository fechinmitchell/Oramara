// oramara/frontend/src/pages/admin/ShareModal.jsx
// "Save and contact club": pick who to send it to, choose how many months they see free,
// then the report is saved to their portal and a ready written email is made for you to send.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api.js';
import { PRICING, TECH } from '../../config/brand.js';
import './club.css';

const WINDOWS = [
  { months: 1, label: '1 month', note: 'A quick taste' },
  { months: 3, label: '3 months', note: 'Recommended' },
  { months: 6, label: '6 months', note: 'Half a season' },
  { months: 12, label: 'Full year', note: 'Everything free' }
];
const TRIALS = [14, 30, 60];

export default function ShareModal({ leadId, leadName, analysis, onClose, onShared }) {
  const [contacts, setContacts] = useState(null);
  const [pick, setPick] = useState(''); // a contact id, or 'other'
  const [other, setOther] = useState({ email: '', name: '' });
  const [months, setMonths] = useState(analysis.in_portal && analysis.portal_months ? analysis.portal_months : 3);
  const [trialDays, setTrialDays] = useState(30);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null);
  const [copied, setCopied] = useState('');

  const load = () =>
    api(`/contacts/lead/${leadId}`)
      .then((list) => {
        setContacts(list);
        const usable = list.filter(usableContact);
        setPick((p) => p || (usable[0] ? String(usable[0].id) : 'other'));
      })
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [leadId]);

  async function findContacts() {
    setBusy('find');
    setError('');
    try {
      await api(`/contacts/lead/${leadId}/find`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err.message);
    }
    setBusy('');
  }

  const chosen = pick === 'other' ? other : contacts?.find((c) => String(c.id) === pick);

  async function share() {
    setBusy('share');
    setError('');
    try {
      const res = await api(`/portal-admin/lead/${leadId}/share`, {
        method: 'POST',
        body: { analysisId: analysis.id, months, trialDays, email: chosen?.email, name: chosen?.name || '' }
      });
      setSent(res);
      onShared?.();
    } catch (err) {
      setError(err.message);
    }
    setBusy('');
  }

  function copy(text, what) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(''), 1800);
    });
  }

  const perMonth = (PRICING.fullYear / 12).toFixed(2);
  const usable = (contacts || []).filter(usableContact);
  const blocked = (contacts || []).filter((c) => c.email && !usableContact(c));

  return createPortal(
    <div className="sh-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sh-panel" role="dialog" aria-modal="true" aria-label="Save and contact club">
        <header className="sh-head">
          <div>
            <h2>{sent ? 'Ready to send' : 'Save and contact club'}</h2>
            <p className="muted small">
              {leadName} · {analysis.label || 'Main pitch'} · score {analysis.score}
            </p>
          </div>
          <button type="button" className="cp-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        {!sent ? (
          <div className="sh-body">
            {/* 1. Who */}
            <section className="sh-step">
              <h3><span className="sh-num">1</span> Who should get it?</h3>
              {contacts === null && <p className="muted small">Loading contacts...</p>}
              {contacts && usable.length === 0 && (
                <div className="sh-empty">
                  <p className="small">No club contact yet.</p>
                  <button type="button" className="btn btn-small" onClick={findContacts} disabled={!!busy}>
                    {busy === 'find' ? 'Searching the web...' : 'Find public contact details'}
                  </button>
                </div>
              )}
              <div className="sh-options">
                {usable.map((c) => (
                  <label key={c.id} className={`sh-option ${pick === String(c.id) ? 'on' : ''}`}>
                    <input type="radio" name="who" checked={pick === String(c.id)} onChange={() => setPick(String(c.id))} />
                    <span>
                      <strong>{c.role || 'Club contact'}{c.name ? `, ${c.name}` : ''}</strong>
                      <small>{c.email}</small>
                    </span>
                    {c.status === 'verified' ? <span className="tr-chip green">Checked</span> : <span className="tr-chip">Organisation</span>}
                  </label>
                ))}
                <label className={`sh-option ${pick === 'other' ? 'on' : ''}`}>
                  <input type="radio" name="who" checked={pick === 'other'} onChange={() => setPick('other')} />
                  <span>
                    <strong>Someone else</strong>
                    <small>An address you were given directly</small>
                  </span>
                </label>
                {pick === 'other' && (
                  <div className="sh-other">
                    <input type="email" placeholder="Email" value={other.email} onChange={(e) => setOther({ ...other, email: e.target.value })} autoFocus />
                    <input placeholder="Name (optional)" value={other.name} onChange={(e) => setOther({ ...other, name: e.target.value })} />
                  </div>
                )}
              </div>
              {blocked.length > 0 && (
                <p className="small muted">
                  {blocked.length} personal or do not contact address{blocked.length === 1 ? ' is' : 'es are'} hidden. Personal addresses need the person's agreement first.
                </p>
              )}
            </section>

            {/* 2. What they get */}
            <section className="sh-step">
              <h3><span className="sh-num">2</span> How much do they see free?</h3>
              <div className="sh-windows" role="radiogroup" aria-label="Free months">
                {WINDOWS.map((w) => (
                  <button
                    key={w.months}
                    type="button"
                    role="radio"
                    aria-checked={months === w.months}
                    className={`sh-window ${months === w.months ? 'on' : ''}`}
                    onClick={() => setMonths(w.months)}
                  >
                    <strong>{w.label}</strong>
                    <small>{w.note}</small>
                  </button>
                ))}
              </div>
              <p className="sh-explain small">
                {months === 12 ? (
                  <>They see the whole report: 12 months of history and the full care programme.</>
                ) : (
                  <>
                    They see the last {months === 1 ? 'month' : `${months} months`} of analysis and the next {months === 1 ? 'month' : `${months} months`} of
                    care, with tick boxes. The other {12 - months} months show as locked, with the full year offered at{' '}
                    <strong>€{PRICING.fullYear} a year (about €{perMonth} a month)</strong>.
                  </>
                )}
              </p>
              <label className="sh-trial small">
                Free access for
                <select value={trialDays} onChange={(e) => setTrialDays(Number(e.target.value))}>
                  {TRIALS.map((d) => <option key={d} value={d}>{d} days</option>)}
                </select>
                <span className="muted">(starts when they first open the link)</span>
              </label>
            </section>

            {error && <p className="error">{error}</p>}
          </div>
        ) : (
          <div className="sh-body">
            <div className="sh-done">
              <span className="portal-tick" aria-hidden="true">✓</span>
              <div>
                <strong>Saved to {leadName}'s portal, {sent.months === 12 ? 'full year' : `${sent.months} months free`}.</strong>
                <p className="small muted">
                  The link opens the report straight away, no password needed, and every open shows in Customer portal. There is no email
                  service yet, so send this from your own email.
                </p>
              </div>
            </div>
            <div className="sh-email">
              <div className="sh-email-row"><span>To</span><strong>{sent.user.email}</strong></div>
              <div className="sh-email-row"><span>Subject</span><strong>{sent.subject}</strong></div>
              <pre className="sh-email-body">{sent.body}</pre>
            </div>
          </div>
        )}

        <footer className="sh-foot">
          {!sent ? (
            <>
              <span className="small muted">Saves the report to the club's {TECH.name} portal and makes the email for you.</span>
              <button type="button" className="btn" onClick={share} disabled={!!busy || !chosen?.email}>
                {busy === 'share' ? 'Saving...' : 'Save and make the email'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => copy(sent.inviteUrl, 'link')}>
                {copied === 'link' ? 'Link copied' : 'Copy report link'}
              </button>
              <span className="row-buttons">
                <button type="button" className="btn btn-ghost btn-small" onClick={() => copy(`${sent.subject}\n\n${sent.body}`, 'email')}>
                  {copied === 'email' ? 'Copied' : 'Copy email'}
                </button>
                <a
                  className="btn btn-small"
                  href={`mailto:${sent.user.email}?subject=${encodeURIComponent(sent.subject)}&body=${encodeURIComponent(sent.body)}`}
                >
                  Open in my email
                </a>
              </span>
            </>
          )}
        </footer>
      </div>
    </div>,
    document.body
  );
}

// Club and role addresses only; personal addresses need consent, and opted out addresses are never used
function usableContact(c) {
  return c.email && !c.suppressed && c.status !== 'do_not_contact' && (c.kind !== 'personal' || c.status === 'verified');
}