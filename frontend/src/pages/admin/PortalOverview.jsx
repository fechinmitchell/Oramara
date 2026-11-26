// oramara/frontend/src/pages/admin/PortalOverview.jsx
// Every club a report was shared with: who opened it, how long they read, what they looked at,
// free months, trial or paying, and who asked for the full year. Click a row to manage the club.
// Also the do not contact list that every link and invite checks.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import './analysis.css';
import './club.css';
import './portal-overview.css';

const STATUS_LABEL = { trial: 'Free trial', active: 'Paying', paused: 'Paused', ended: 'Ended' };
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const ago = (d) => {
  if (!d) return '';
  const mins = Math.round((Date.now() - new Date(d)) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} days ago`;
};
const collator = new Intl.Collator('en-IE', { sensitivity: 'base', numeric: true });

// What each column sorts by
const SORTS = {
  club: (r) => r.club,
  months: (r) => Math.min(...(r.portalReports.map((x) => x.months) || [12]), 12),
  access: (r) => (r.state.status === 'active' ? 0 : r.state.locked ? 3 : r.state.status === 'trial' ? 1 : 2),
  opens: (r) => r.stats.link_opens,
  time: (r) => r.stats.seconds,
  sections: (r) => r.stats.sections_seen,
  monthsSeen: (r) => r.stats.month_views,
  clicks: (r) => r.stats.clicks,
  last: (r) => (r.stats.last_seen ? new Date(r.stats.last_seen).getTime() : 0),
  upgrade: (r) => (r.state.upgradeRequestedAt ? 1 : 0) * 10 + r.stats.upgrade_clicks
};

export default function PortalOverview() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [suppressed, setSuppressed] = useState([]);
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [sort, setSort] = useState({ key: 'last', dir: -1 });
  const [filter, setFilter] = useState('all');

  const load = () => {
    api('/portal-admin').then(setRows).catch((err) => setError(err.message));
    api('/contacts/suppression').then(setSuppressed).catch(() => {});
  };
  useEffect(load, []);

  async function suppress(e) {
    e.preventDefault();
    setError('');
    try {
      await api('/contacts/suppression', { method: 'POST', body: { email, reason } });
      setEmail('');
      setReason('');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const wantsUpgrade = rows.filter((r) => r.state.upgradeRequestedAt && r.state.status !== 'active');
  const endingSoon = rows.filter((r) => r.state.status === 'trial' && !r.state.locked && r.state.daysLeft !== null && r.state.daysLeft <= 7);
  const opened = rows.filter((r) => r.stats.link_opens > 0);
  const paying = rows.filter((r) => r.state.status === 'active');

  const FILTERS = [
    { id: 'all', label: 'All', test: () => true },
    { id: 'unopened', label: 'Not opened', test: (r) => !r.stats.link_opens },
    { id: 'warm', label: 'Warm', test: (r) => r.stats.upgrade_clicks > 0 || r.stats.seconds >= 300 || r.stats.visits >= 3 },
    { id: 'upgrade', label: 'Asked for full year', test: (r) => r.state.upgradeRequestedAt && r.state.status !== 'active' },
    { id: 'trial', label: 'On trial', test: (r) => r.state.status === 'trial' && !r.state.locked },
    { id: 'paying', label: 'Paying', test: (r) => r.state.status === 'active' }
  ];

  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter) || FILTERS[0];
    const get = SORTS[sort.key];
    return rows.filter(f.test).sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const c = typeof x === 'string' ? collator.compare(x, y) : x - y;
      return c * sort.dir || collator.compare(a.club, b.club);
    });
  }, [rows, sort, filter]);

  const Th = ({ id, children, title }) => (
    <th aria-sort={sort.key === id ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'} title={title}>
      <button
        type="button"
        className="sort-th"
        onClick={() => setSort((s) => ({ key: id, dir: s.key === id ? -s.dir : id === 'club' ? 1 : -1 }))}
      >
        {children}
        <span aria-hidden="true">{sort.key === id ? (sort.dir > 0 ? ' ▲' : ' ▼') : ' ↕'}</span>
      </button>
    </th>
  );

  return (
    <div>
      <div className="page-head">
        <h1>Customer portal</h1>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="act-kpis po-kpis">
        <div><strong>{rows.length}</strong><span>Clubs shared with</span></div>
        <div><strong>{opened.length}</strong><span>Opened their report</span></div>
        <div><strong>{wantsUpgrade.length}</strong><span>Asked for the full year</span></div>
        <div><strong>{paying.length}</strong><span>Paying</span></div>
        <div><strong>{Math.round(rows.reduce((t, r) => t + r.stats.seconds, 0) / 60)} min</strong><span>Total reading time</span></div>
      </div>

      {wantsUpgrade.length > 0 && (
        <p className="club-warn">
          <strong>{wantsUpgrade.length} club{wantsUpgrade.length === 1 ? '' : 's'} asked for the full year:</strong>{' '}
          {wantsUpgrade.map((r) => r.club).join(', ')}. Get in touch to set it up, then mark them as paying.
        </p>
      )}
      {endingSoon.length > 0 && (
        <p className="club-warn">
          <strong>{endingSoon.length} trial{endingSoon.length === 1 ? '' : 's'} ending this week:</strong>{' '}
          {endingSoon.map((r) => r.club).join(', ')}. A good time to call.
        </p>
      )}

      <div className="po-filters" role="tablist" aria-label="Show">
        {FILTERS.map((f) => {
          const n = rows.filter(f.test).length;
          return (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
              {f.label} <small>{n}</small>
            </button>
          );
        })}
      </div>

      <div className="table-wrap">
        <table className="table po-table">
          <thead>
            <tr>
              <Th id="club">Club</Th>
              <Th id="months" title="Free months on the latest report">Free</Th>
              <Th id="access">Access</Th>
              <Th id="opens" title="Times the report link was opened">Opens</Th>
              <Th id="time" title="Time with the report on screen">Time</Th>
              <Th id="sections" title="Different report sections read">Sections</Th>
              <Th id="monthsSeen" title="Months opened in the month by month view">Months</Th>
              <Th id="clicks" title="Links clicked inside the report">Clicks</Th>
              <Th id="last">Last seen</Th>
              <Th id="upgrade" title="Unlock presses and full year requests">Upgrade</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const latest = r.portalReports[0];
              return (
                <tr key={r.lead_id} className="po-row" onClick={() => nav(`/admin/club/${r.lead_id}`)}>
                  <td>
                    <Link to={`/admin/club/${r.lead_id}`} onClick={(e) => e.stopPropagation()}>
                      <strong>{r.club}</strong>
                    </Link>
                    <div className="muted small">
                      {r.contact?.email || r.county || ''}
                      {latest && ` · ${latest.label || 'Main pitch'} ${latest.score}`}
                    </div>
                  </td>
                  <td>
                    {latest ? (
                      <span className={`tr-chip ${r.state.status === 'active' || latest.months === 12 ? 'green' : ''}`}>
                        {r.state.status === 'active' ? '12' : latest.months} mo
                      </span>
                    ) : (
                      <span className="muted small">None</span>
                    )}
                  </td>
                  <td>
                    <span className={`portal-status ${r.state.locked ? 'locked' : r.state.status}`}>
                      {r.state.locked && r.state.status === 'trial' ? 'Trial ended' : STATUS_LABEL[r.state.status] || r.state.status}
                    </span>
                    {r.state.status === 'trial' && !r.state.locked && (
                      <div className="muted small">{r.state.daysLeft === null ? 'Starts on first open' : `${r.state.daysLeft} days left`}</div>
                    )}
                  </td>
                  <td>{r.stats.link_opens || <span className="muted">0</span>}</td>
                  <td>{r.stats.seconds ? `${Math.max(1, Math.round(r.stats.seconds / 60))} min` : <span className="muted">0</span>}</td>
                  <td>{r.stats.sections_seen || <span className="muted">0</span>}</td>
                  <td>{r.stats.month_views || <span className="muted">0</span>}</td>
                  <td>{r.stats.clicks || <span className="muted">0</span>}</td>
                  <td>{r.stats.last_seen ? <span title={fmtDate(r.stats.last_seen)}>{ago(r.stats.last_seen)}</span> : <span className="muted small">Not opened</span>}</td>
                  <td>
                    {r.state.upgradeRequestedAt && r.state.status !== 'active' ? (
                      <span className="tr-chip gold" title={`Asked ${fmtDate(r.state.upgradeRequestedAt)}`}>Asked</span>
                    ) : r.stats.upgrade_clicks ? (
                      <span className="small">{r.stats.upgrade_clicks} press{r.stats.upgrade_clicks === 1 ? '' : 'es'}</span>
                    ) : (
                      <span className="muted">0</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!shown.length && (
              <tr>
                <td colSpan={10} className="muted">
                  {rows.length
                    ? 'No clubs match this filter.'
                    : 'No reports shared yet. Open a report in Turf analysis and press Save and contact club.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <section className="club-card suppression">
        <h2>Do not contact list</h2>
        <p className="small muted">
          Anyone who asks not to be contacted goes here. Links, invites and future emails check this list first, and these addresses can never be used.
        </p>
        <form className="portal-invite" onSubmit={suppress}>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn btn-small">Add to list</button>
        </form>
        {suppressed.length > 0 && (
          <ul className="portal-users">
            {suppressed.map((s) => (
              <li key={s.email}>
                <span>
                  <strong>{s.email}</strong>
                  <small className="muted">{s.reason || 'No reason given'} · {fmtDate(s.created_at)}</small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}