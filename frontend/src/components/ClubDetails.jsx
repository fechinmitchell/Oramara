// oramara/frontend/src/components/ClubDetails.jsx
// The club's own details that shape the care programme: when the pitch is busy, when it can be renovated,
// drainage and who looks after it. For golf: greens and coring months. Saved on the lead.
import { useEffect, useState } from 'react';
import { api } from '../api.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DEFAULTS = {
  gaa: { busyMonths: [3, 4, 5, 6, 7, 8, 9, 10], renovationMonth: 9, teams: 6, drainage: 'average', maintainedBy: 'volunteers' },
  soccer: { busyMonths: [8, 9, 10, 11, 12, 1, 2, 3, 4], renovationMonth: 5, teams: 4, drainage: 'average', maintainedBy: 'volunteers' },
  rugby: { busyMonths: [9, 10, 11, 12, 1, 2, 3, 4], renovationMonth: 5, teams: 4, drainage: 'average', maintainedBy: 'volunteers' },
  golf: { greens: 18, greensType: 'push_up', coringMonths: [3, 9], maintainedBy: 'greenkeeper' }
};

export function profileSummary(pitchType, saved) {
  const p = { ...(DEFAULTS[pitchType] || DEFAULTS.gaa), ...(saved || {}) };
  const months = (list) => (list || []).slice().sort((a, b) => a - b).map((m) => MONTHS[m - 1]).join(', ');
  if (pitchType === 'golf') {
    return `${p.greens} greens, ${p.greensType === 'sand' ? 'sand based' : 'push up soil'}, coring in ${months(p.coringMonths)}, looked after by a ${p.maintainedBy}`;
  }
  return `Busy ${months(p.busyMonths)} · renovation in ${MONTHS[(p.renovationMonth || 9) - 1]} · ${p.teams} teams · ${p.drainage} drainage · looked after by ${p.maintainedBy}`;
}

export default function ClubDetails({ lead, pitchType, onSaved, compact = false }) {
  const golf = pitchType === 'golf';
  const [p, setP] = useState(() => ({ ...(DEFAULTS[pitchType] || DEFAULTS.gaa), ...(lead.pitch_profile || {}) }));
  const [state, setState] = useState({ busy: false, msg: '', error: '' });

  useEffect(() => {
    setP({ ...(DEFAULTS[pitchType] || DEFAULTS.gaa), ...(lead.pitch_profile || {}) });
  }, [pitchType, lead.id]);

  const set = (key, value) => setP((x) => ({ ...x, [key]: value }));
  const toggleMonth = (key, m) =>
    set(key, (p[key] || []).includes(m) ? p[key].filter((x) => x !== m) : [...(p[key] || []), m]);

  async function save() {
    setState({ busy: true, msg: '', error: '' });
    try {
      await api(`/leads/${lead.id}`, { method: 'PATCH', body: { pitch_profile: p } });
      setState({ busy: false, msg: 'Saved. The care programme now uses these details.', error: '' });
      onSaved?.(p);
    } catch (err) {
      setState({ busy: false, msg: '', error: err.message });
    }
  }

  const chips = (key) => (
    <div className="month-chips">
      {MONTHS.map((name, i) => (
        <button
          type="button"
          key={name}
          className={(p[key] || []).includes(i + 1) ? 'on' : ''}
          onClick={() => toggleMonth(key, i + 1)}
        >
          {name}
        </button>
      ))}
    </div>
  );

  return (
    <div className={`club-details ${compact ? 'compact' : ''}`}>
      {golf ? (
        <>
          <label className="small">
            Number of greens
            <input type="number" min="1" max="54" value={p.greens} onChange={(e) => set('greens', Number(e.target.value) || 18)} />
          </label>
          <label className="small">
            Greens built from
            <select value={p.greensType} onChange={(e) => set('greensType', e.target.value)}>
              <option value="push_up">Push up soil</option>
              <option value="sand">Sand based (USGA style)</option>
            </select>
          </label>
          <div className="small">
            Hollow coring months
            {chips('coringMonths')}
          </div>
        </>
      ) : (
        <>
          <div className="small">
            Busy playing months
            {chips('busyMonths')}
          </div>
          <label className="small">
            Month the pitch can close for renovation
            <select value={p.renovationMonth} onChange={(e) => set('renovationMonth', Number(e.target.value))}>
              {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
            </select>
          </label>
          <div className="club-row">
            <label className="small">
              Teams using it
              <input type="number" min="1" max="60" value={p.teams} onChange={(e) => set('teams', Number(e.target.value) || 1)} />
            </label>
            <label className="small">
              Drainage
              <select value={p.drainage} onChange={(e) => set('drainage', e.target.value)}>
                <option value="good">Good</option>
                <option value="average">Average</option>
                <option value="poor">Poor, water lies</option>
              </select>
            </label>
          </div>
        </>
      )}
      <label className="small">
        Looked after by
        <select value={p.maintainedBy} onChange={(e) => set('maintainedBy', e.target.value)}>
          <option value="volunteers">Club volunteers</option>
          <option value="groundsman">A groundsman</option>
          <option value="greenkeeper">Greenkeeping staff</option>
          <option value="contractor">A contractor</option>
        </select>
      </label>
      <button className="btn btn-small" onClick={save} disabled={state.busy}>{state.busy ? 'Saving...' : 'Save club details'}</button>
      {state.msg && <p className="muted small">{state.msg}</p>}
      {state.error && <p className="error small">{state.error}</p>}
    </div>
  );
}