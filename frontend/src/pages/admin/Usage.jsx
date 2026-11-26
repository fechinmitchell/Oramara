// oramara/frontend/src/pages/admin/Usage.jsx
// What the outside APIs cost: by provider, by task, by club or course, by user, by analysis and by day.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { LEAD_TYPES, PITCH_TYPES, labelFor } from '../../config/options.js';
import { money } from '../../components/UsageBar.jsx';
import './usage.css';

const PROVIDERS = {
  anthropic: { name: 'Anthropic (Claude)', note: 'Paid per token' },
  copernicus: { name: 'Copernicus (Sentinel 2)', note: 'Free monthly allowance' },
  esri: { name: 'Esri (satellite photos)', note: 'Free while testing' },
  openstreetmap: { name: 'OpenStreetMap', note: 'Free, keep it light' },
  openai: { name: 'OpenAI', note: 'Paid per token' }
};

const OPERATIONS = {
  report: 'Writing a report',
  rewrite: 'Rewriting a report',
  locate_pitch: 'Finding a pitch in a photo',
  monthly_stats: 'Monthly vigour data',
  month_image: 'Monthly vigour map',
  tiles: 'Satellite photo tiles',
  photo_date: 'Photo date lookup',
  overpass: 'Map outline search'
};

const RANGES = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 0, label: 'All time' }
];

const num = (v) => Number(v || 0).toLocaleString('en-IE');
const providerName = (p) => PROVIDERS[p]?.name || p;
const opName = (o) => OPERATIONS[o] || o;
const amount = (r) =>
  r.input_tokens || r.output_tokens
    ? `${num(r.input_tokens)} in · ${num(r.output_tokens)} out tokens`
    : r.units
      ? `${num(Math.round(r.units))} ${r.unit_name || 'units'}`
      : '';

export default function Usage() {
  const [days, setDays] = useState(30);
  const [type, setType] = useState('');
  const [d, setD] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const p = new URLSearchParams({ days: String(days) });
    if (type) p.set('type', type);
    setError('');
    api(`/usage/details?${p}`).then(setD).catch((err) => setError(err.message));
  }, [days, type]);

  const maxDay = Math.max(0.0001, ...(d?.daily || []).map((x) => x.cost_usd));
  const cop = d?.allowances?.copernicus;

  return (
    <div className="usage-page">
      <div className="page-head">
        <h1>API usage</h1>
        <div className="filters" style={{ margin: 0 }}>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {RANGES.map((r) => <option key={r.days} value={r.days}>{r.label}</option>)}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All clubs and courses</option>
            {LEAD_TYPES.filter((t) => ['gaa', 'soccer', 'rugby', 'golf'].includes(t.value)).map((t) => (
              <option key={t.value} value={t.value}>{t.label}s only</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {!d ? (
        <p className="muted">Loading...</p>
      ) : (
        <>
          <div className="usage-kpis">
            <Kpi label="Total cost" value={money(d.totals.cost_usd)} sub={RANGES.find((r) => r.days === days)?.label} />
            <Kpi label="API calls" value={num(d.totals.calls)} />
            <Kpi label="Claude tokens" value={num(d.totals.input_tokens + d.totals.output_tokens)} sub={`${num(d.totals.input_tokens)} in · ${num(d.totals.output_tokens)} out`} />
            {cop && (
              <Kpi
                label="Satellite allowance this month"
                value={`${num(Math.round(cop.usedThisMonth))} / ${num(cop.units)}`}
                sub={cop.unitName}
                bar={(cop.usedThisMonth / cop.units) * 100}
              />
            )}
          </div>

          <section className="usage-card">
            <h3>Cost per day</h3>
            {d.daily.length ? (
              <div className="usage-days">
                {d.daily.map((x) => (
                  <div key={x.day} className="usage-day" title={`${x.day}: ${money(x.cost_usd)}, ${x.calls} calls`}>
                    <span className="usage-day-bar" style={{ height: `${Math.max(2, (x.cost_usd / maxDay) * 100)}%` }} />
                    <small>{x.day.slice(8)}</small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small">No calls in this period.</p>
            )}
          </section>

          <div className="usage-grid">
            <section className="usage-card">
              <h3>By provider</h3>
              <table className="table">
                <tbody>
                  {d.providers.map((p) => (
                    <tr key={p.provider}>
                      <td>
                        <strong>{providerName(p.provider)}</strong>
                        <div className="muted small">{PROVIDERS[p.provider]?.note}</div>
                      </td>
                      <td className="small">{num(p.calls)} calls<div className="muted">{amount(p)}</div></td>
                      <td className="num">{money(p.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted small">OpenAI and any other provider will appear here automatically once the app uses it.</p>
            </section>

            <section className="usage-card">
              <h3>By task</h3>
              <table className="table">
                <tbody>
                  {d.operations.map((o) => (
                    <tr key={`${o.provider}${o.operation}`}>
                      <td>
                        {opName(o.operation)}
                        <div className="muted small">{providerName(o.provider)}</div>
                      </td>
                      <td className="small">{num(o.calls)} calls<div className="muted">{amount(o)}</div></td>
                      <td className="num">{money(o.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {d.models.length > 0 && (
                <p className="muted small">
                  Models: {d.models.map((m) => `${m.model} ${money(m.cost_usd)}`).join(' · ')}
                </p>
              )}
            </section>
          </div>

          <section className="usage-card">
            <h3>By club and course</h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Club or course</th>
                    <th>Type</th>
                    <th>County</th>
                    <th>Analyses</th>
                    <th>Calls</th>
                    <th>Claude tokens</th>
                    <th className="num">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {d.clubs.map((c) => (
                    <tr key={c.lead_id}>
                      <td><Link to={`/admin/analysis/${c.lead_id}`}>{c.name || `Deleted club ${c.lead_id}`}</Link></td>
                      <td>{labelFor(LEAD_TYPES, c.type)}</td>
                      <td>{c.county}</td>
                      <td>{c.analyses}</td>
                      <td>{num(c.calls)}</td>
                      <td>{num(c.input_tokens + c.output_tokens)}</td>
                      <td className="num">{money(c.cost_usd)}</td>
                    </tr>
                  ))}
                  {!d.clubs.length && <tr><td colSpan={7} className="muted">No club usage in this period.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <div className="usage-grid">
            <section className="usage-card">
              <h3>Most expensive analyses</h3>
              <table className="table">
                <tbody>
                  {d.analyses.map((a) => (
                    <tr key={a.analysis_id}>
                      <td>
                        <Link to={`/admin/report/${a.analysis_id}`}>{a.lead_name || 'No club'}</Link>
                        <div className="muted small">{a.label || labelFor(PITCH_TYPES, a.pitch_type)}{a.score !== null ? ` · score ${a.score}` : ''}</div>
                      </td>
                      <td className="small">{num(a.calls)} calls</td>
                      <td className="num">{money(a.cost_usd)}</td>
                    </tr>
                  ))}
                  {!d.analyses.length && <tr><td className="muted">None yet.</td></tr>}
                </tbody>
              </table>
            </section>

            <section className="usage-card">
              <h3>By user</h3>
              <table className="table">
                <tbody>
                  {d.users.map((u) => (
                    <tr key={u.user_id || 'none'}>
                      <td>
                        {u.name || u.email || 'Unknown'}
                        <div className="muted small">{u.sessions} sessions</div>
                      </td>
                      <td className="small">{num(u.calls)} calls</td>
                      <td className="num">{money(u.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3 style={{ marginTop: '1.2rem' }}>Recent sessions</h3>
              <table className="table">
                <tbody>
                  {d.sessions.map((s) => (
                    <tr key={s.session_id}>
                      <td>
                        {s.user_name || 'Unknown'}
                        <div className="muted small">
                          {new Date(s.started).toLocaleString('en-IE', { dateStyle: 'medium', timeStyle: 'short' })}
                        </div>
                      </td>
                      <td className="small">{num(s.calls)} calls</td>
                      <td className="num">{money(s.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <section className="usage-card">
            <h3>Latest calls</h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Provider</th>
                    <th>Task</th>
                    <th>Club</th>
                    <th>User</th>
                    <th>Amount</th>
                    <th className="num">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {d.recent.map((r) => (
                    <tr key={r.id}>
                      <td className="small">{new Date(r.created_at).toLocaleString('en-IE', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className="small">{providerName(r.provider)}</td>
                      <td className="small">{opName(r.operation)}</td>
                      <td className="small">{r.lead_name || ''}</td>
                      <td className="small">{r.user_name || ''}</td>
                      <td className="small muted">{amount(r)}</td>
                      <td className="num">{money(r.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="muted small">
            Claude costs are worked out from the tokens each call used and Anthropic's published prices, in US dollars.
            Your Anthropic console shows the exact bill.
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, bar }) {
  return (
    <div className="usage-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
      {bar !== undefined && <i><b style={{ width: `${Math.min(100, bar)}%` }} /></i>}
    </div>
  );
}