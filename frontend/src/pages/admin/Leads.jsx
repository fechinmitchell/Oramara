// oramara/frontend/src/pages/admin/Leads.jsx
import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { COUNTIES, LEAD_STATUSES, LEAD_TYPES, labelFor } from '../../config/options.js';

const BLANK = { name: '', type: 'gaa', county: '', contact_name: '', email: '', phone: '', website: '', address: '', notes: '', next_action: '', next_action_date: '' };

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState({});
  const [filters, setFilters] = useState({ status: '', type: '', county: '', q: '' });
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
      const [rows, s] = await Promise.all([api(`/leads?${params}`), api('/leads/stats')]);
      setLeads(rows);
      setStats(s);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, [filters.status, filters.type, filters.county]);

  async function quickStatus(lead, status) {
    const updated = await api(`/leads/${lead.id}`, { method: 'PATCH', body: { status } });
    setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, ...updated } : l)));
    api('/leads/stats').then(setStats);
  }

  async function save(e) {
    e.preventDefault();
    const { id, analysis_count, created_at, updated_at, source, osm_id, ...body } = editing;
    if (body.next_action_date) body.next_action_date = String(body.next_action_date).slice(0, 10);
    try {
      if (id) await api(`/leads/${id}`, { method: 'PATCH', body });
      else await api('/leads', { method: 'POST', body });
      setEditing(null);
      load();
    } catch (err) {
      alertLike(setError, err.message);
    }
  }

  async function remove() {
    if (!editing?.id) return;
    await api(`/leads/${editing.id}`, { method: 'DELETE' });
    setEditing(null);
    load();
  }

  const set = (key) => (e) => setEditing({ ...editing, [key]: e.target.value });

  return (
    <div>
      <div className="page-head">
        <h1>Leads</h1>
        <button className="btn" onClick={() => setEditing({ ...BLANK })}>Add lead</button>
      </div>

      <div className="stat-row">
        {LEAD_STATUSES.map((s) => (
          <button
            key={s.value}
            className={`stat ${filters.status === s.value ? 'active' : ''}`}
            onClick={() => setFilters({ ...filters, status: filters.status === s.value ? '' : s.value })}
          >
            <strong>{stats[s.value] ?? 0}</strong>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <input placeholder="Search name or contact" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
          <option value="">All types</option>
          {LEAD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={filters.county} onChange={(e) => setFilters({ ...filters, county: e.target.value })}>
          <option value="">All counties</option>
          {COUNTIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <button className="btn btn-ghost">Search</button>
      </form>

      {error && <p className="error">{error}</p>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>County</th>
              <th>Contact</th>
              <th>Next action</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id}>
                <td>
                  <button className="link" onClick={() => setEditing({ ...BLANK, ...nullsToEmpty(l) })}>{l.name}</button>
                  {l.source === 'inbound' && <span className="tag">Website</span>}
                </td>
                <td>{labelFor(LEAD_TYPES, l.type)}</td>
                <td>{l.county}</td>
                <td className="small">
                  {l.contact_name && <div>{l.contact_name}</div>}
                  {l.phone && <div>{l.phone}</div>}
                  {l.email && <div>{l.email}</div>}
                  {!l.contact_name && !l.phone && !l.email && l.website && (
                    <a href={l.website} target="_blank" rel="noreferrer">Website</a>
                  )}
                </td>
                <td className="small">
                  {l.next_action}
                  {l.next_action_date && <div className="muted">{String(l.next_action_date).slice(0, 10)}</div>}
                </td>
                <td>
                  <select value={l.status} onChange={(e) => quickStatus(l, e.target.value)}>
                    {LEAD_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </td>
                <td className="nowrap">
                  <button className="btn btn-small btn-ghost" onClick={() => setEditing({ ...BLANK, ...nullsToEmpty(l) })}>
                    Open
                  </button>
                </td>
              </tr>
            ))}
            {!leads.length && (
              <tr>
                <td colSpan={7} className="muted center">No leads yet. Use the lead finder or add one.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="modal-bg" onClick={() => setEditing(null)}>
          <form className="card modal form-grid" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <h2 className="span-2">{editing.id ? 'Edit lead' : 'New lead'}</h2>
            <label className="span-2">Name<input required value={editing.name} onChange={set('name')} /></label>
            <label>Type
              <select value={editing.type} onChange={set('type')}>
                {LEAD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label>County
              <select value={editing.county} onChange={set('county')}>
                <option value="">Choose</option>
                {COUNTIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>Contact name<input value={editing.contact_name} onChange={set('contact_name')} /></label>
            <label>Phone<input value={editing.phone} onChange={set('phone')} /></label>
            <label>Email<input type="email" value={editing.email} onChange={set('email')} /></label>
            <label>Website<input value={editing.website} onChange={set('website')} /></label>
            <label className="span-2">Address<input value={editing.address} onChange={set('address')} /></label>
            <label>Next action<input value={editing.next_action} onChange={set('next_action')} placeholder="e.g. Call chairperson" /></label>
            <label>Date<input type="date" value={String(editing.next_action_date || '').slice(0, 10)} onChange={set('next_action_date')} /></label>
            <label className="span-2">Notes<textarea rows={4} value={editing.notes} onChange={set('notes')} /></label>
            <div className="span-2 modal-actions">
              {editing.id && <button type="button" className="btn btn-danger btn-small" onClick={remove}>Delete</button>}
              <span className="spacer" />
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function nullsToEmpty(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v === null ? '' : v]));
}

function alertLike(setError, message) {
  setError(message);
  setTimeout(() => setError(''), 5000);
}