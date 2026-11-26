// oramara/frontend/src/pages/admin/LeadFinder.jsx
import { useState } from 'react';
import { api } from '../../api.js';
import { COUNTIES, LEAD_TYPES, labelFor } from '../../config/options.js';

const SEARCHABLE = ['gaa', 'golf', 'soccer', 'rugby'];
const CHECKBOX = { minWidth: 0, width: 16, height: 16, padding: 0 };

export default function LeadFinder() {
  const [county, setCounty] = useState('Galway');
  const [types, setTypes] = useState(['gaa', 'golf']);
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [state, setState] = useState({ busy: false, msg: '', error: '' });

  function toggleType(t) {
    setTypes((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));
  }

  function toggle(id) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function search(e) {
    e.preventDefault();
    setState({ busy: true, msg: '', error: '' });
    try {
      const rows = await api('/lead-finder/search', { method: 'POST', body: { county, types } });
      setResults(rows);
      setSelected(new Set(rows.filter((r) => !r.imported).map((r) => r.osm_id)));
      setState({ busy: false, msg: `${rows.length} found in ${county}`, error: '' });
    } catch (err) {
      setState({ busy: false, msg: '', error: err.message });
    }
  }

  async function importSelected() {
    const items = results.filter((r) => selected.has(r.osm_id) && !r.imported);
    if (!items.length) return;
    setState({ ...state, busy: true });
    try {
      const { added } = await api('/lead-finder/import', { method: 'POST', body: { items } });
      setResults((rs) => rs.map((r) => (selected.has(r.osm_id) ? { ...r, imported: true } : r)));
      setSelected(new Set());
      setState({ busy: false, msg: `${added} ${added === 1 ? 'lead' : 'leads'} added`, error: '' });
    } catch (err) {
      setState({ busy: false, msg: '', error: err.message });
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>Lead finder</h1>
      </div>
      <p className="muted">
        Finds named clubs, pitches and golf courses from OpenStreetMap. Coverage varies by county, so add missing clubs by hand.
      </p>

      <form className="filters" onSubmit={search}>
        <select value={county} onChange={(e) => setCounty(e.target.value)}>
          {COUNTIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        {SEARCHABLE.map((t) => (
          <label key={t} className="check">
            <input type="checkbox" style={CHECKBOX} checked={types.includes(t)} onChange={() => toggleType(t)} />
            {labelFor(LEAD_TYPES, t)}
          </label>
        ))}
        <button className="btn" disabled={state.busy || !types.length}>{state.busy ? 'Searching...' : 'Search'}</button>
      </form>

      {state.error && <p className="error">{state.error}</p>}
      {state.msg && <p className="muted">{state.msg}</p>}

      {!!results.length && (
        <>
          <div className="page-head">
            <span className="muted">{selected.size} selected</span>
            <button className="btn" onClick={importSelected} disabled={!selected.size || state.busy}>Add selected to leads</button>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th />
                  <th>Name</th>
                  <th>Type</th>
                  <th>Details</th>
                  <th>Map</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.osm_id} className={r.imported ? 'dim' : ''}>
                    <td>
                      {r.imported ? <span className="tag">Added</span> : (
                        <input type="checkbox" checked={selected.has(r.osm_id)} onChange={() => toggle(r.osm_id)} />
                      )}
                    </td>
                    <td>{r.name}</td>
                    <td>{labelFor(LEAD_TYPES, r.type)}</td>
                    <td className="small">
                      {r.address && <div>{r.address}</div>}
                      {r.phone && <div>{r.phone}</div>}
                      {r.website && <a href={r.website} target="_blank" rel="noreferrer">Website</a>}
                    </td>
                    <td>
                      {r.lat && (
                        <a href={`https://www.google.com/maps/@${r.lat},${r.lon},300m/data=!3m1!1e3`} target="_blank" rel="noreferrer">
                          Aerial view
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="fine-print">Map data © OpenStreetMap contributors, ODbL.</p>
    </div>
  );
}