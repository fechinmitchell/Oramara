// oramara/frontend/src/pages/admin/FreeReportsPanel.jsx
// Free reports from the website: turn them on or off, set the daily spend cap and see every request.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { money } from '../../components/UsageBar.jsx';

const STATUS = {
  pending: 'Waiting',
  running: 'Being made',
  ready: 'Ready',
  queued: 'Held by the daily cap',
  needs_review: 'Needs a look',
  failed: 'Failed'
};

export default function FreeReportsPanel() {
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = () =>
    api('/free-reports')
      .then((x) => {
        setD(x);
        setForm((f) => f || { ...x.settings });
      })
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  async function save(e) {
    e.preventDefault();
    setMsg('');
    setError('');
    try {
      const r = await api('/free-reports/settings', {
        method: 'PUT',
        body: { enabled: form.enabled, dailyCapUsd: Number(form.dailyCapUsd), maxPerDay: Number(form.maxPerDay) }
      });
      setForm({ ...r.settings });
      setMsg('Saved');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function retry(id) {
    try {
      await api(`/free-reports/${id}/retry`, { method: 'POST' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!d || !form) return error ? <p className="error">{error}</p> : null;
  const t = d.today;
  const capUsed = d.settings.dailyCapUsd > 0 ? Math.min(100, (t.spent / d.settings.dailyCapUsd) * 100) : 100;

  return (
    <section className="usage-card free-panel">
      <div className="free-panel-head">
        <div>
          <h3>Free reports from the website</h3>
          <p className="muted small">
            Each request makes a 3 month report on its own. One per email and per club. Requests over the cap wait and
            are made when the next day starts.
          </p>
        </div>
        <div className="free-panel-today">
          <span>Today</span>
          <strong>{money(t.spent)} <small>of {money(d.settings.dailyCapUsd)}</small></strong>
          <i><b style={{ width: `${capUsed}%` }} /></i>
          <small>
            {t.made} made of {d.settings.maxPerDay} · {t.waiting} waiting · about {money(t.estimate)} each
          </small>
        </div>
      </div>

      <form className="free-panel-form" onSubmit={save}>
        <label className="free-toggle">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          Make free reports automatically
        </label>
        <label>
          Daily spend cap (US$)
          <input type="number" min="0" max="100" step="0.5" value={form.dailyCapUsd} onChange={(e) => setForm({ ...form, dailyCapUsd: e.target.value })} />
        </label>
        <label>
          Most reports a day
          <input type="number" min="0" max="500" step="1" value={form.maxPerDay} onChange={(e) => setForm({ ...form, maxPerDay: e.target.value })} />
        </label>
        <button className="btn btn-small">Save</button>
        {msg && <span className="muted small">{msg}</span>}
        {error && <span className="error small">{error}</span>}
      </form>

      {d.requests.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Club</th>
                <th>Contact</th>
                <th>Status</th>
                <th className="num">Cost</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d.requests.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.lead_id ? <Link to={`/admin/club/${r.lead_id}`}>{r.club_name}</Link> : r.club_name}
                    <div className="muted small">{[r.county, new Date(r.created_at).toLocaleString('en-IE', { dateStyle: 'medium', timeStyle: 'short' })].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="small">
                    {r.contact_name}
                    <div className="muted">{r.email}</div>
                  </td>
                  <td className="small">
                    <span className={`free-status free-${r.status}`}>{STATUS[r.status] || r.status}</span>
                    {r.error && <div className="muted">{r.error}</div>}
                  </td>
                  <td className="num">{money(r.cost_usd)}</td>
                  <td className="small">
                    {r.link_url && <a href={r.link_url} target="_blank" rel="noreferrer">Open report</a>}
                    {r.status === 'needs_review' && r.lead_id && (
                      <>
                        {' '}<Link to={`/admin/analysis/${r.lead_id}`}>Analyse by hand</Link>
                      </>
                    )}
                    {['needs_review', 'failed', 'queued'].includes(r.status) && (
                      <button type="button" className="btn btn-ghost btn-small" onClick={() => retry(r.id)}>Try again</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted small">No requests yet.</p>
      )}
    </section>
  );
}
