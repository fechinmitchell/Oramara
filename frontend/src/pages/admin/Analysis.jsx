// oramara/frontend/src/pages/admin/Analysis.jsx
// Two views: clubs to analyse, and the catalogue of saved analyses.
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { COUNTIES, LEAD_TYPES, PITCH_TYPES, labelFor } from '../../config/options.js';
import './analysis.css';
import { TECH } from '../../config/brand.js';

// ---------- Sorting ----------
// Click a column heading to sort by it; click again to reverse. Text sorts A to Z first,
// scores and dates sort highest and newest first. Empty values always go to the bottom.
const collator = new Intl.Collator('en-IE', { sensitivity: 'base', numeric: true });

function sortRows(rows, { key, dir }, getters) {
  const get = getters[key];
  if (!get) return rows;
  return [...rows].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    const xEmpty = x === null || x === undefined || x === '';
    const yEmpty = y === null || y === undefined || y === '';
    if (xEmpty || yEmpty) return xEmpty === yEmpty ? 0 : xEmpty ? 1 : -1;
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y));
    return dir === 'asc' ? c : -c;
  });
}

function SortTh({ label, col, sort, setSort, numeric = false, align }) {
  const active = sort.key === col;
  const next = () => setSort(active ? { key: col, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key: col, dir: numeric ? 'desc' : 'asc' });
  return (
    <th aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} style={align ? { textAlign: align } : undefined}>
      <button type="button" className={`sort-th ${active ? 'active' : ''}`} onClick={next}>
        {label}
        <span className="sort-arrow" aria-hidden="true">{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}

export default function Analysis() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'saved' ? 'saved' : 'clubs';

  const [leads, setLeads] = useState([]);
  const [saved, setSaved] = useState([]);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [county, setCounty] = useState('');
  const [error, setError] = useState('');
  const [clubSort, setClubSort] = useState({ key: 'name', dir: 'asc' });
  const [savedSort, setSavedSort] = useState({ key: 'date', dir: 'desc' });

  // Saved analyses (searched on the server when on that tab)
  useEffect(() => {
    const t = setTimeout(() => {
      const query = tab === 'saved' && q ? `?q=${encodeURIComponent(q)}` : '';
      api(`/analyses${query}`).then(setSaved).catch((err) => setError(err.message));
    }, 250);
    return () => clearTimeout(t);
  }, [tab, q]);

  // Clubs
  useEffect(() => {
    if (tab !== 'clubs') return;
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (type) p.set('type', type);
    if (county) p.set('county', county);
    const t = setTimeout(() => {
      api(`/leads?${p}`).then(setLeads).catch((err) => setError(err.message));
    }, 250);
    return () => clearTimeout(t);
  }, [tab, q, type, county]);

  // Latest saved analysis per club
  const latest = useMemo(() => {
    const map = new Map();
    for (const r of saved) if (r.lead_id && !map.has(r.lead_id)) map.set(r.lead_id, r);
    return map;
  }, [saved]);

  const filteredSaved = saved.filter(
    (r) => (!type || r.lead_type === type) && (!county || r.lead_county === county)
  );

  const sortedLeads = sortRows(leads, clubSort, {
    name: (l) => l.name,
    type: (l) => labelFor(LEAD_TYPES, l.type),
    county: (l) => l.county,
    latest: (l) => latest.get(l.id)?.score ?? null
  });
  const sortedSaved = sortRows(filteredSaved, savedSort, {
    score: (r) => r.score,
    club: (r) => r.lead_name,
    area: (r) => r.label || labelFor(PITCH_TYPES, r.pitch_type),
    county: (r) => r.lead_county,
    date: (r) => new Date(r.created_at).getTime()
  });

  return (
    <div>
      <div className="page-head">
        <h1>
          {TECH.name} <span className="page-byline">{TECH.byline}</span>
        </h1>
      </div>

      <div className="tabs">
        <button className={tab === 'clubs' ? 'active' : ''} onClick={() => setParams({})}>Clubs</button>
        <button className={tab === 'saved' ? 'active' : ''} onClick={() => setParams({ tab: 'saved' })}>
          Saved analyses {saved.length ? <span className="tab-count">{saved.length}</span> : null}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="filters">
        <input
          placeholder={tab === 'saved' ? 'Search saved analyses' : 'Search clubs and courses'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {LEAD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={county} onChange={(e) => setCounty(e.target.value)}>
          <option value="">All counties</option>
          {COUNTIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div className="table-wrap">
        {tab === 'clubs' ? (
          <table className="table">
            <thead>
              <tr>
                <SortTh label="Name" col="name" sort={clubSort} setSort={setClubSort} />
                <SortTh label="Type" col="type" sort={clubSort} setSort={setClubSort} />
                <SortTh label="County" col="county" sort={clubSort} setSort={setClubSort} />
                <SortTh label="Latest analysis" col="latest" sort={clubSort} setSort={setClubSort} numeric />
                <th />
              </tr>
            </thead>
            <tbody>
              {sortedLeads.map((l) => {
                const r = latest.get(l.id);
                return (
                  <tr key={l.id}>
                    <td>
                      {l.name}
                      {!l.lat && <span className="tag">No map pin</span>}
                    </td>
                    <td>{labelFor(LEAD_TYPES, l.type)}</td>
                    <td>{l.county}</td>
                    <td>
                      {r ? (
                        <Link to={`/admin/analysis/${l.id}?report=${r.id}`}>
                          Score {r.score} · {new Date(r.created_at).toLocaleDateString('en-IE')}
                        </Link>
                      ) : (
                        <span className="muted small">None yet</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Link className="btn btn-ghost btn-small" to={`/admin/club/${l.id}`} title="Contacts and customer portal">Contacts</Link>{' '}
                      <Link className="btn btn-small" to={`/admin/analysis/${l.id}`}>Analyse</Link>
                    </td>
                  </tr>
                );
              })}
              {!leads.length && (
                <tr>
                  <td colSpan={5} className="muted">No clubs match. Add some from the Lead finder.</td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <SortTh label="Score" col="score" sort={savedSort} setSort={setSavedSort} numeric />
                <SortTh label="Club" col="club" sort={savedSort} setSort={setSavedSort} />
                <SortTh label="Area" col="area" sort={savedSort} setSort={setSavedSort} />
                <SortTh label="County" col="county" sort={savedSort} setSort={setSavedSort} />
                <SortTh label="Date" col="date" sort={savedSort} setSort={setSavedSort} numeric />
                <th />
              </tr>
            </thead>
            <tbody>
              {sortedSaved.map((r) => (
                <tr key={r.id}>
                  <td><span className="saved-score">{r.score}</span></td>
                  <td>{r.lead_name || 'No club'}</td>
                  <td>{r.label || labelFor(PITCH_TYPES, r.pitch_type)}</td>
                  <td>{r.lead_county}</td>
                  <td>{new Date(r.created_at).toLocaleDateString('en-IE')}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Link className="btn btn-small" to={`/admin/analysis/${r.lead_id}?report=${r.id}`}>Open</Link>{' '}
                    <Link className="btn btn-ghost btn-small" to={`/admin/report/${r.id}`}>Report</Link>
                  </td>
                </tr>
              ))}
              {!filteredSaved.length && (
                <tr>
                  <td colSpan={6} className="muted">No saved analyses yet. Run one and click Save analysis.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}