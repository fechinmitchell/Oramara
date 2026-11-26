// oramara/frontend/src/pages/admin/ClubAccount.jsx
// One club's contacts, customer portal access and activity in one place.
// Contacts come only from details the club published itself, with the source kept (GDPR).
// Portal: free months per report, report links, logins, password resets, deleting the account, and what the club looked at.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { LEAD_TYPES, labelFor } from '../../config/options.js';
import { TECH } from '../../config/brand.js';
import './analysis.css';
import './club.css';

const STATUS_LABEL = { trial: 'Free trial', active: 'Paying', paused: 'Paused', ended: 'Ended', none: 'No access' };
const FREE_STATUS = {
  pending: 'Waiting to be made',
  running: 'Being made now',
  ready: 'Report made and shared',
  queued: 'Held by the daily cap',
  needs_review: 'Needs a look: pitch not found',
  failed: 'Failed'
};
const fmtWhen = (d) =>
  d ? new Date(d).toLocaleString('en-IE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const host = (u) => {
  try {
    return new URL(u).host.replace(/^www\./, '');
  } catch {
    return u;
  }
};

export default function ClubAccount() {
  const { leadId } = useParams();
  const [lead, setLead] = useState(null);
  const [error, setError] = useState('');
  const [invitePrefill, setInvitePrefill] = useState(null);
  const [stamp, setStamp] = useState(0);

  useEffect(() => {
    api(`/leads/${leadId}`).then(setLead).catch((err) => setError(err.message));
  }, [leadId]);

  return (
    <div className="club-page">
      <div className="page-head club-head">
        <div>
          <Link to="/admin/analysis" className="link-btn small">← {TECH.name}</Link>
          <h1>{lead?.name || 'Club'}</h1>
          {lead && (
            <p className="muted small">
              {labelFor(LEAD_TYPES, lead.type)}
              {lead.county ? ` · ${lead.county}` : ''}
              {lead.website && (
                <>
                  {' · '}
                  <a href={lead.website} target="_blank" rel="noreferrer">{host(lead.website)}</a>
                </>
              )}
            </p>
          )}
        </div>
        <Link className="btn btn-small" to={`/admin/analysis/${leadId}`}>Open turf analysis</Link>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="club-grid">
        <Contacts leadId={leadId} onInvite={setInvitePrefill} />
        <Portal leadId={leadId} prefill={invitePrefill} onChange={() => setStamp(Date.now())} />
      </div>
      <Activity leadId={leadId} stamp={stamp} />
    </div>
  );
}

// ---------- Contacts ----------
function Contacts({ leadId, onInvite }) {
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ role: '', name: '', email: '', phone: '', kind: 'organisation' });

  useEffect(() => {
    api(`/contacts/lead/${leadId}`).then(setList).catch((err) => setError(err.message));
  }, [leadId]);

  async function find() {
    setBusy('find');
    setError('');
    setMsg('');
    try {
      const res = await api(`/contacts/lead/${leadId}/find`, { method: 'POST' });
      setList(res.contacts);
      setMsg(`${res.added ? `${res.added} new detail${res.added === 1 ? '' : 's'} found` : 'Nothing new found'}. ${res.notes || ''}`);
    } catch (err) {
      setError(err.message);
    }
    setBusy('');
  }

  async function update(id, body) {
    setError('');
    try {
      setList(await api(`/contacts/${id}`, { method: 'PATCH', body }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    if (!confirm('Delete this contact completely?')) return;
    setList(await api(`/contacts/${id}`, { method: 'DELETE' }));
  }

  async function add(e) {
    e.preventDefault();
    setError('');
    try {
      setList(await api(`/contacts/lead/${leadId}`, { method: 'POST', body: form }));
      setForm({ role: '', name: '', email: '', phone: '', kind: 'organisation' });
      setAdding(false);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="club-card">
      <div className="club-card-head">
        <h2>Contacts</h2>
        <button className="btn btn-small" onClick={find} disabled={!!busy}>
          {busy === 'find' ? 'Searching the web...' : 'Find public contact details'}
        </button>
      </div>

      <details className="gdpr-note">
        <summary>How contacts are kept GDPR compliant</summary>
        <ul>
          <li>Only details the club or business published itself are collected, with the page they came from and the date.</li>
          <li><strong>Organisation</strong> addresses (club, office or role addresses) can be used for business contact relevant to the role.</li>
          <li><strong>Personal</strong> addresses (a named person's own email) are not used for outreach without their consent.</li>
          <li>Every email must say who you are and let them opt out. Anyone who opts out goes on the do not contact list, which every invite checks.</li>
          <li>Delete a contact on request. Check the rules with a solicitor before any bulk outreach.</li>
        </ul>
      </details>

      {msg && <p className="small club-msg">{msg}</p>}
      {error && <p className="error">{error}</p>}
      {busy === 'find' && <p className="small muted">Searching the club's website and listings. This takes about 30 seconds and costs about 5 cents.</p>}

      {list.length === 0 && !busy && <p className="muted small">No contact details yet. Find them from the web, or add one you were given.</p>}

      <ul className="contact-list">
        {list.map((c) => {
          const blocked = c.status === 'do_not_contact' || c.suppressed;
          return (
            <li key={c.id} className={`contact ${c.kind} ${blocked ? 'blocked' : ''}`}>
              <div className="contact-main">
                <div className="contact-top">
                  <strong>{c.role || 'Contact'}</strong>
                  {c.name && <span className="muted">{c.name}</span>}
                  <span className={`tr-chip ${c.kind === 'personal' ? 'red' : 'green'}`} title={c.kind === 'personal' ? 'A named person\'s own address: needs their consent before outreach' : 'Club, office or role address'}>
                    {c.kind === 'personal' ? 'Personal: needs consent' : 'Organisation'}
                  </span>
                  {c.status === 'verified' && <span className="tr-chip">Checked</span>}
                  {blocked && <span className="tr-chip red">Do not contact</span>}
                </div>
                <div className="contact-ways">
                  {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
                  {c.phone && <a href={`tel:${c.phone.replace(/\s/g, '')}`}>{c.phone}</a>}
                  {c.contact_form && <a href={c.contact_form} target="_blank" rel="noreferrer">Contact form</a>}
                </div>
                <div className="small muted">
                  {c.source_url && /^https?:/.test(c.source_url) ? (
                    <>Found on <a href={c.source_url} target="_blank" rel="noreferrer">{host(c.source_url)}</a></>
                  ) : (
                    <>{c.source_url || 'Added by hand'}</>
                  )}{' '}
                  · {fmtDate(c.found_at)}
                  {c.notes && <> · {c.notes}</>}
                </div>
              </div>
              <div className="contact-actions">
                {c.email && !blocked && c.kind !== 'personal' && (
                  <button className="btn btn-small" onClick={() => onInvite({ email: c.email, name: c.name || '' })}>Invite to portal</button>
                )}
                {c.status === 'found' && !blocked && (
                  <button className="link-btn small" onClick={() => update(c.id, { status: 'verified' })}>Mark checked</button>
                )}
                {c.kind === 'organisation' ? (
                  <button className="link-btn small" onClick={() => update(c.id, { kind: 'personal' })}>It is personal</button>
                ) : (
                  <button className="link-btn small" onClick={() => update(c.id, { kind: 'organisation' })}>It is the club's</button>
                )}
                {!blocked && (
                  <button className="link-btn small" onClick={() => update(c.id, { status: 'do_not_contact' })}>Do not contact</button>
                )}
                <button className="link-btn small danger" onClick={() => remove(c.id)}>Delete</button>
              </div>
            </li>
          );
        })}
      </ul>

      {adding ? (
        <form className="contact-add" onSubmit={add}>
          <input placeholder="Role, for example Club secretary" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="organisation">Organisation or role address</option>
            <option value="personal">Personal address (they gave consent)</option>
          </select>
          <div className="row-buttons">
            <button className="btn btn-small">Add contact</button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="link-btn small" onClick={() => setAdding(true)}>+ Add a contact you were given</button>
      )}
    </section>
  );
}

// ---------- Customer portal ----------
function Portal({ leadId, prefill, onChange }) {
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ email: '', name: '', trialDays: 30 });
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [ready, setReady] = useState(null); // a link and email ready to send: new report link or password reset

  const load = () => api(`/portal-admin/lead/${leadId}`).then(setInfo).catch((err) => setError(err.message));
  useEffect(() => {
    load();
  }, [leadId]);

  useEffect(() => {
    if (prefill) {
      setForm((f) => ({ ...f, ...prefill }));
      document.getElementById('portal-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [prefill]);

  async function invite(e) {
    e.preventDefault();
    setBusy('invite');
    setError('');
    setSent(null);
    try {
      const res = await api(`/portal-admin/lead/${leadId}/invite`, { method: 'POST', body: form });
      setSent(res);
      setForm({ email: '', name: '', trialDays: form.trialDays });
      await load();
    } catch (err) {
      setError(err.message);
    }
    setBusy('');
  }

  async function changeAccess(body) {
    setBusy('access');
    setError('');
    try {
      await api(`/portal-admin/lead/${leadId}/access`, { method: 'PATCH', body });
      await load();
    } catch (err) {
      setError(err.message);
    }
    setBusy('');
  }

  async function removeUser(id) {
    if (!confirm('Remove this login? They will no longer be able to open the portal.')) return;
    await api(`/portal-admin/users/${id}`, { method: 'DELETE' });
    load();
  }

  // Run an admin action, then reload the card; returns the result or null
  async function act(key, fn) {
    setBusy(key);
    setError('');
    try {
      const res = await fn();
      await load();
      onChange?.();
      setBusy('');
      return res;
    } catch (err) {
      setError(err.message);
      setBusy('');
      return null;
    }
  }

  const setMonths = (reportId, months) =>
    act(`m${reportId}`, () => api(`/portal-admin/reports/${reportId}`, { method: 'PATCH', body: { months } }));

  async function newLink(report) {
    const last = info?.links?.find((k) => !k.revoked_at) || info?.links?.[0];
    const email = prompt('Send the new link to which email?', last?.email || '');
    if (!email) return;
    const res = await act('link', () =>
      api(`/portal-admin/lead/${leadId}/links`, { method: 'POST', body: { analysisId: report.id, email, name: last?.name || '' } })
    );
    if (res) setReady({ title: `New report link for ${email}`, email, ...res });
  }

  const revokeLink = (id) => {
    if (!confirm('Turn this link off? Anyone who opens it will be asked to get a new one.')) return;
    act(`k${id}`, () => api(`/portal-admin/links/${id}`, { method: 'DELETE' }));
  };

  async function resetUser(u) {
    const res = await act(`r${u.id}`, () => api(`/portal-admin/users/${u.id}/reset`, { method: 'POST' }));
    if (res) setReady({ title: `Password reset link for ${u.email}. It works once, for 7 days.`, email: u.email, ...res });
  }

  async function deleteAccount() {
    if (!confirm(`Delete the portal account for this club? Logins, report links, ticks and activity are deleted and reports leave the portal. The analyses themselves stay.`)) return;
    await act('delete', () => api(`/portal-admin/lead/${leadId}/account`, { method: 'DELETE' }));
    setReady(null);
    setSent(null);
  }

  function copy(text, what) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(''), 1800);
    });
  }

  const state = info?.state;
  return (
    <section className="club-card" id="portal-card">
      <div className="club-card-head">
        <h2>Customer portal</h2>
        {state && <span className={`portal-status ${state.locked ? 'locked' : state.status}`}>{STATUS_LABEL[state.status] || state.status}</span>}
      </div>

      {state && state.status !== 'none' && (
        <div className="portal-facts">
          {state.status === 'trial' && (
            <span>
              Trial {state.locked ? 'ended' : 'ends'} <strong>{fmtDate(state.trialEndsAt)}</strong>
              {!state.locked && state.daysLeft !== null && <> ({state.daysLeft} days left)</>}
            </span>
          )}
          <span>
            <strong>{info.reports}</strong> report{info.reports === 1 ? '' : 's'} in the portal
          </span>
        </div>
      )}
      {state?.upgradeRequestedAt && state.status !== 'active' && (
        <p className="small club-warn">
          <strong>Asked for the full year on {fmtDate(state.upgradeRequestedAt)}.</strong> Get in touch to set it up, then press Mark as paying.
        </p>
      )}
      {info && info.reports === 0 && (
        <p className="small club-warn">
          No reports are in the portal yet. Open the turf analysis and press <strong>Save to portal</strong> on a report first.
        </p>
      )}

      {state && state.status !== 'none' && (
        <div className="row-buttons portal-actions">
          <button className="btn btn-ghost btn-small" disabled={!!busy} onClick={() => changeAccess({ extendDays: 14 })}>Extend 14 days</button>
          <button className="btn btn-ghost btn-small" disabled={!!busy} onClick={() => changeAccess({ extendDays: 30 })}>Extend 30 days</button>
          {state.status !== 'active' && (
            <button className="btn btn-small" disabled={!!busy} onClick={() => changeAccess({ status: 'active', plan: 'Full year' })} title="Paying clubs see all 12 months on every report">
              Mark as paying (all 12 months)
            </button>
          )}
          {state.status === 'active' && <button className="btn btn-ghost btn-small" disabled={!!busy} onClick={() => changeAccess({ status: 'trial', plan: null, extendDays: 14 })}>Back to free trial</button>}
          {state.status !== 'paused' && state.status !== 'ended' && <button className="btn btn-ghost btn-small" disabled={!!busy} onClick={() => changeAccess({ status: 'paused' })}>Pause</button>}
          {(state.status === 'paused' || state.status === 'ended') && <button className="btn btn-ghost btn-small" disabled={!!busy} onClick={() => changeAccess({ status: 'trial', extendDays: 14 })}>Reopen for 14 days</button>}
          {state.status !== 'ended' && <button className="btn btn-ghost btn-small" disabled={!!busy} onClick={() => changeAccess({ status: 'ended' })}>End access</button>}
        </div>
      )}

      {info?.freeRequests?.length > 0 && (
        <>
          <h3 className="club-sub">Free report from the website</h3>
          <ul className="portal-reports">
            {info.freeRequests.map((f) => (
              <li key={f.id}>
                <span>
                  <strong>{FREE_STATUS[f.status] || f.status}</strong>{' '}
                  <span className="muted small">
                    {f.contact_name} · {f.email} · asked {fmtDate(f.created_at)}
                  </span>
                  {f.error && f.status !== 'ready' && <div className="muted small">{f.error}</div>}
                </span>
                <span className="small free-req-actions">
                  {f.status === 'needs_review' && <Link to={`/admin/analysis/${leadId}`}>Analyse by hand</Link>}
                  {['needs_review', 'failed', 'queued'].includes(f.status) && (
                    <button className="link-btn small" disabled={busy === `f${f.id}`} onClick={() => act(`f${f.id}`, () => api(`/free-reports/${f.id}/retry`, { method: 'POST' }))}>
                      Try again
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="small muted">Once the report is made it appears below, where you can change how many months the club gets.</p>
        </>
      )}

      {info?.reportList?.length > 0 && (
        <>
          <h3 className="club-sub">Reports and free months</h3>
          <ul className="portal-reports">
            {info.reportList.map((r) => (
              <li key={r.id}>
                <span>
                  <strong>{r.label || 'Main pitch'}</strong> <span className="muted small">score {r.score} · {fmtDate(r.created_at)}</span>
                </span>
                <span className="seg" role="group" aria-label="Free months">
                  {[1, 3, 6, 12].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={r.portal_months === m ? 'on' : ''}
                      disabled={busy === `m${r.id}`}
                      onClick={() => r.portal_months !== m && setMonths(r.id, m)}
                    >
                      {m === 12 ? '12' : m}
                    </button>
                  ))}
                  <small className="muted">months free</small>
                </span>
                <button className="link-btn small" onClick={() => newLink(r)} disabled={busy === 'link'}>New link</button>
              </li>
            ))}
          </ul>
          {state?.status === 'active' && <p className="small muted">Paying: the club sees all 12 months whatever is set here.</p>}
        </>
      )}

      {info?.links?.length > 0 && (
        <>
          <h3 className="club-sub">Report links sent</h3>
          <ul className="portal-users">
            {info.links.map((k) => (
              <li key={k.id} className={k.revoked_at ? 'is-off' : ''}>
                <span>
                  <strong>{k.email || 'No email'}</strong>
                  <small className="muted">
                    {k.label || 'Report'} · made {fmtDate(k.created_at)} ·{' '}
                    {k.revoked_at
                      ? `turned off ${fmtDate(k.revoked_at)}`
                      : k.opens
                        ? `opened ${k.opens} time${k.opens === 1 ? '' : 's'}, last ${fmtWhen(k.last_opened_at)}`
                        : 'not opened yet'}
                  </small>
                </span>
                {!k.revoked_at && (
                  <span className="row-buttons">
                    <button className="link-btn small" onClick={() => copy(k.url, `k${k.id}`)}>{copied === `k${k.id}` ? 'Copied' : 'Copy link'}</button>
                    <button className="link-btn small danger" onClick={() => revokeLink(k.id)}>Turn off</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {ready && (
        <div className="invite-ready">
          <p className="small"><strong>{ready.title}</strong> Send it from your own email.</p>
          <div className="invite-link">
            <code>{ready.url}</code>
            <button className="btn btn-ghost btn-small" type="button" onClick={() => copy(ready.url, 'rlink')}>{copied === 'rlink' ? 'Copied' : 'Copy link'}</button>
          </div>
          <div className="row-buttons">
            <a className="btn btn-small" href={`mailto:${ready.email}?subject=${encodeURIComponent(ready.subject)}&body=${encodeURIComponent(ready.body)}`}>Open in my email</a>
            <button className="btn btn-ghost btn-small" type="button" onClick={() => copy(`${ready.subject}\n\n${ready.body}`, 'remail')}>{copied === 'remail' ? 'Copied' : 'Copy email text'}</button>
            <button className="link-btn small" type="button" onClick={() => setReady(null)}>Done</button>
          </div>
        </div>
      )}

      <h3 className="club-sub">Invite someone from the club</h3>
      <form className="portal-invite" onSubmit={invite}>
        <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        {(!state || state.status === 'none') && (
          <label className="small">
            Free trial
            <select value={form.trialDays} onChange={(e) => setForm({ ...form, trialDays: Number(e.target.value) })}>
              {[14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </label>
        )}
        <button className="btn btn-small" disabled={busy === 'invite'}>{busy === 'invite' ? 'Creating...' : 'Create invite'}</button>
      </form>
      {error && <p className="error">{error}</p>}

      {sent && (
        <div className="invite-ready">
          <p className="small">
            <strong>Invite ready for {sent.user.email}.</strong> There is no email service yet, so send it from your own email. The link works for 14 days.
          </p>
          <div className="invite-link">
            <code>{sent.inviteUrl}</code>
            <button className="btn btn-ghost btn-small" type="button" onClick={() => copy(sent.inviteUrl, 'link')}>{copied === 'link' ? 'Copied' : 'Copy link'}</button>
          </div>
          <div className="row-buttons">
            <a className="btn btn-small" href={`mailto:${sent.user.email}?subject=${encodeURIComponent(sent.subject)}&body=${encodeURIComponent(sent.body)}`}>
              Open email with the invite
            </a>
            <button className="btn btn-ghost btn-small" type="button" onClick={() => copy(`${sent.subject}\n\n${sent.body}`, 'email')}>
              {copied === 'email' ? 'Copied' : 'Copy email text'}
            </button>
          </div>
        </div>
      )}

      {info?.users?.length > 0 && (
        <>
          <h3 className="club-sub">People with a login</h3>
          <ul className="portal-users">
            {info.users.map((u) => (
              <li key={u.id}>
                <span>
                  <strong>{u.name || u.email}</strong>
                  {u.name && <small className="muted"> {u.email}</small>}
                  <small className="muted">
                    {u.active ? (u.last_login ? `Last in ${fmtDate(u.last_login)}` : 'Password set') : 'Invite not used yet'}
                  </small>
                </span>
                <span className="row-buttons">
                  <button className="link-btn small" disabled={busy === `r${u.id}`} onClick={() => resetUser(u)}>Password reset link</button>
                  {u.inviteUrl && (
                    <button className="link-btn small" onClick={() => copy(u.inviteUrl, `u${u.id}`)}>{copied === `u${u.id}` ? 'Copied' : 'Copy invite link'}</button>
                  )}
                  <button className="link-btn small danger" onClick={() => removeUser(u.id)}>Remove</button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="small muted">
        Report links open straight from the email with no password; clubs can make a free account inside. They see only the reports saved to their portal.
      </p>
      {state && state.status !== 'none' && (
        <div className="danger-zone">
          <span className="small">
            <strong>Delete portal account.</strong> Removes logins, links, ticks and activity (GDPR request). The analyses stay.
          </span>
          <button className="btn btn-ghost btn-small danger" disabled={busy === 'delete'} onClick={deleteAccount}>Delete account</button>
        </div>
      )}
    </section>
  );
}

// ---------- What the club has looked at ----------
const KIND_LABEL = {
  link_open: 'Opened the report link',
  report_view: 'Viewed a report',
  section_view: 'Read a section',
  month_view: 'Looked at a month',
  link_click: 'Clicked a link',
  upgrade_click: 'Pressed Unlock',
  upgrade_request: 'Asked for the full year',
  print: 'Printed or saved a PDF',
  login: 'Logged in',
  account_created: 'Created an account',
  signup_open: 'Opened the account form'
};
const SECTION_LABEL = {
  'month-by-month': 'Pitch month by month',
  'what-the-photo-shows': 'What the photo shows',
  'look-back': 'Look back',
  'weakest-months': 'Weakest months',
  goalmouths: 'Goalmouths',
  'priorities-for-the-next-two-months': 'Priorities',
  'oramara-turf-biostimulant-plan': 'Biostimulant plan',
  programme: 'Care programme',
  'products-and-costs-for-this-pitch': 'Products and costs'
};
const minutes = (s) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.round(s / 60)} min`);

function Activity({ leadId, stamp }) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    api(`/portal-admin/lead/${leadId}`).then(setInfo).catch(() => setInfo(null));
  }, [leadId, stamp]);
  if (!info || (!info.state || info.state.status === 'none')) return null;
  const st = info.stats;
  const maxSection = Math.max(1, ...info.sections.map((x) => x.n));
  const kpis = [
    { v: st.link_opens, l: 'Link opens' },
    { v: st.visits, l: 'Visits' },
    { v: st.seconds ? minutes(st.seconds) : '0 min', l: 'Time reading' },
    { v: st.report_views, l: 'Report views' },
    { v: st.month_views, l: 'Months looked at' },
    { v: st.clicks, l: 'Links clicked' },
    { v: st.upgrade_clicks, l: 'Unlock presses' },
    { v: st.prints, l: 'Prints' }
  ];
  const warm = st.upgrade_clicks > 0 || st.seconds >= 300 || st.visits >= 3;

  return (
    <section className="club-card activity">
      <div className="club-card-head">
        <h2>Activity</h2>
        <span className="small muted">
          {st.first_open ? `First opened ${fmtWhen(st.first_open)} · last seen ${fmtWhen(st.last_seen)}` : 'Not opened yet'}
          {warm && <span className="tr-chip gold" style={{ marginLeft: '0.5rem' }}>Warm: worth a call</span>}
        </span>
      </div>
      <div className="act-kpis">
        {kpis.map((k) => (
          <div key={k.l}>
            <strong>{k.v}</strong>
            <span>{k.l}</span>
          </div>
        ))}
      </div>
      <p className="small muted">
        There is no email service yet, so email opens cannot be counted; a link open means they clicked through from the email.
      </p>

      <div className="act-grid">
        <div>
          <h3 className="club-sub">Sections read</h3>
          {info.sections.length ? (
            <ul className="act-bars">
              {info.sections.map((x) => (
                <li key={x.section}>
                  <span>{SECTION_LABEL[x.section] || x.section.replace(/^x\d+-/, 'Extra pitch: ').replace(/-/g, ' ')}</span>
                  <i style={{ width: `${(x.n / maxSection) * 100}%` }} />
                  <b>{x.n}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">Nothing read yet.</p>
          )}

          <h3 className="club-sub">Months looked at</h3>
          {info.months.length ? (
            <div className="act-chips">
              {info.months.map((m) => (
                <span key={m.month} className="tr-chip">
                  {new Date(`${m.month}-01`).toLocaleDateString('en-IE', { month: 'short', year: 'numeric' })} × {m.n}
                </span>
              ))}
            </div>
          ) : (
            <p className="small muted">None yet.</p>
          )}

          <h3 className="club-sub">Links clicked in the report</h3>
          {info.clicks.length ? (
            <ul className="act-list small">
              {info.clicks.map((c, i) => (
                <li key={i}>
                  <a href={c.href} target="_blank" rel="noreferrer">{c.label || c.href}</a> <span className="muted">× {c.n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">None yet.</p>
          )}
        </div>

        <div>
          <h3 className="club-sub">Timeline</h3>
          {info.events.length ? (
            <ol className="act-timeline">
              {info.events.map((e) => (
                <li key={e.id} className={e.kind}>
                  <time>{fmtWhen(e.created_at)}</time>
                  <span>
                    {KIND_LABEL[e.kind] || e.kind}
                    {e.kind === 'section_view' && e.detail?.section && `: ${SECTION_LABEL[e.detail.section] || e.detail.section}`}
                    {e.kind === 'month_view' && e.detail?.month && `: ${new Date(`${e.detail.month}-01`).toLocaleDateString('en-IE', { month: 'long', year: 'numeric' })}`}
                    {e.kind === 'link_click' && e.detail?.label && `: ${e.detail.label}`}
                    {(e.user_email || e.link_email) && <small className="muted"> · {e.user_email || e.link_email}</small>}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="small muted">Nothing yet. This fills in as soon as they open the link.</p>
          )}
        </div>
      </div>
    </section>
    
  );
}