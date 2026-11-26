// oramara/frontend/src/components/FreeReportModal.jsx
// The free 3 month FieldFalcon report popup. Name, email and club; we find the pitch and make the report,
// then show a button to open it. The request is remembered on this device so a closed popup can pick up again.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { COUNTIES } from '../config/options.js';
import { wakeServer } from '../config/apiBase.js';

const SAVED_KEY = 'oramara_free_report';
const POLL_MS = 5000;
const SLOW_MS = 3 * 60 * 1000;
const STEPS = [
  [0, 'Finding your pitch on the map'],
  [15000, 'Fetching the satellite photo'],
  [30000, 'Mapping the health of the turf'],
  [50000, 'Writing your 3 month care plan'],
  [80000, 'Putting your report together']
];

const load = () => {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) || 'null');
  } catch {
    return null;
  }
};
const save = (v) => {
  try {
    if (v) localStorage.setItem(SAVED_KEY, JSON.stringify(v));
    else localStorage.removeItem(SAVED_KEY);
  } catch {}
};

export const savedFreeReport = load;

export default function FreeReportModal({ open, onClose, type = 'gaa', resumeToken = null }) {
  const [form, setForm] = useState({ contactName: '', email: '', clubName: '', county: '', ff_extra: '' });
  const [stage, setStage] = useState('form'); // form, sending, working, ready, queued, review, club_done, received
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const openedAt = useRef(0);
  const started = useRef(0);
  const first = useRef(null);

  // Opening: pick up a request made earlier on this device, or start a fresh form
  useEffect(() => {
    if (!open) return;
    openedAt.current = Date.now();
    wakeServer(); // the free server sleeps when idle; wake it while they type
    setError('');
    const token = resumeToken || load()?.token;
    if (token) {
      setReport({ token, club: load()?.club || '' });
      setStage('working');
      started.current = Date.now();
    } else if (stage !== 'form') {
      setStage('form');
    }
    setTimeout(() => first.current?.focus(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resumeToken]);

  // Close with Escape
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // While the report is being made, check back every few seconds
  useEffect(() => {
    if (!open || stage !== 'working' || !report?.token) return undefined;
    let stop = false;
    const tick = async () => {
      try {
        const r = await api(`/public/free-report/${report.token}`);
        if (stop) return;
        setReport((x) => ({ ...x, ...r }));
        if (r.status === 'ready' && r.url) {
          setStage('ready');
          // Straight on to the report; the button stays in case the browser blocks the move
          setTimeout(() => window.location.assign(r.url), 900);
        } else if (r.status === 'queued') {
          setStage('queued');
        } else if (r.status === 'needs_review' || r.status === 'failed') {
          setStage('review');
        }
        setElapsed(Date.now() - started.current);
      } catch (err) {
        if (stop) return;
        if (/could not find/i.test(err.message)) {
          save(null);
          setStage('form');
        }
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [open, stage, report?.token]);

  if (!open) return null;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    setStage('sending');
    try {
      const r = await api('/public/free-report', {
        method: 'POST',
        body: { ...form, type, fillMs: Date.now() - openedAt.current }
      });
      if (r.status === 'club_done') {
        setReport(r);
        setStage('club_done');
        return;
      }
      if (!r.token) {
        setReport(r);
        setStage('received');
        return;
      }
      save({ token: r.token, club: r.club });
      setReport(r);
      started.current = Date.now();
      setElapsed(0);
      setStage('working');
    } catch (err) {
      setError(err.message);
      setStage('form');
    }
  }

  function startAgain() {
    save(null);
    setReport(null);
    setStage('form');
  }

  const club = report?.club || form.clubName || 'your club';
  const resumeUrl = report?.token ? `${window.location.origin}/pitches?report=${report.token}` : '';

  return (
    <div className="modal-bg free-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal card free-modal" role="dialog" aria-modal="true" aria-labelledby="free-modal-title">
        <button type="button" className="free-close" onClick={onClose} aria-label="Close">×</button>

        {(stage === 'form' || stage === 'sending') && (
          <form onSubmit={submit}>
            <p className="free-kicker">Free for your club</p>
            <h2 id="free-modal-title">Get your free 3 month pitch report</h2>
            <p className="muted">
              We find your pitch from satellite, map its health and give you a 3 month care plan. It takes about a
              minute and you can open it straight away.
            </p>
            <div className="free-fields">
              <label>
                Your name
                <input ref={first} required value={form.contactName} onChange={set('contactName')} autoComplete="name" />
              </label>
              <label>
                Email
                <input type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
              </label>
              <label>
                Club name
                <input required minLength={3} value={form.clubName} onChange={set('clubName')} placeholder="e.g. Clifden GAA" />
              </label>
              <label>
                County <span className="muted small">(helps us find your pitch)</span>
                <select value={form.county} onChange={set('county')}>
                  <option value="">Choose county</option>
                  {COUNTIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <input className="hp" name="ff_extra" tabIndex={-1} autoComplete="new-password" data-lpignore="true" data-1p-ignore value={form.ff_extra} onChange={set('ff_extra')} aria-hidden="true" />
            </div>
            {error && <p className="error">{error}</p>}
            <button className="btn btn-big free-submit" disabled={stage === 'sending'}>
              {stage === 'sending' ? 'Sending...' : 'Make my free report'}
            </button>
            <p className="fine-print">One free report per club and per email address. We only use your details about your report.</p>
          </form>
        )}

        {stage === 'working' && (
          <div className="free-state" aria-live="polite">
            <span className="free-spinner" aria-hidden="true" />
            <h2 id="free-modal-title">Making the report for {club}</h2>
            <p className="free-step">{[...STEPS].reverse().find(([at]) => elapsed >= at)[1]}...</p>
            <p className="muted">
              {elapsed > SLOW_MS
                ? 'This one is taking longer than usual. Keep this window open and it will open as soon as it is ready.'
                : 'This usually takes about a minute. Keep this window open and your report will open by itself.'}
            </p>
          </div>
        )}

        {stage === 'ready' && (
          <div className="free-state" aria-live="polite">
            <span className="free-tick" aria-hidden="true">✓</span>
            <h2 id="free-modal-title">Your report for {club} is ready</h2>
            <p className="muted">Opening it now. It includes the health map, the problem areas and a care plan for the next 3 months.</p>
            <a className="btn btn-gold btn-big" href={report.url}>Open my report</a>
            <p className="fine-print">Save this link to come back to it: <a href={report.url}>{report.url}</a></p>
            <button type="button" className="free-again" onClick={startAgain}>Asking for a different club? Start again</button>
          </div>
        )}

        {stage === 'queued' && (
          <div className="free-state" aria-live="polite">
            <h2 id="free-modal-title">Your report for {club} is in the queue</h2>
            <p className="muted">
              We are making a lot of reports today, so yours will be ready within a day or two. Come back to this page
              on this device, or keep the link below, and it will be waiting for you.
            </p>
            {resumeUrl && <p className="free-link"><a href={resumeUrl}>{resumeUrl}</a></p>}
            <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
            <button type="button" className="free-again" onClick={startAgain}>Asking for a different club? Start again</button>
          </div>
        )}

        {stage === 'review' && (
          <div className="free-state" aria-live="polite">
            <h2 id="free-modal-title">We need a closer look at {club}</h2>
            <p className="muted">
              We could not find your pitch on the map by ourselves. Our team will find it and email you the report
              within two working days.
            </p>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
          </div>
        )}

        {stage === 'club_done' && (
          <div className="free-state" aria-live="polite">
            <h2 id="free-modal-title">{club} already has a free report</h2>
            <p className="muted">
              Someone from your club asked for one recently. Ask them for the link, or email us at{' '}
              <a href="mailto:hello@oramara.ie">hello@oramara.ie</a> and we will send it to you.
            </p>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
          </div>
        )}

        {stage === 'received' && (
          <div className="free-state" aria-live="polite">
            <h2 id="free-modal-title">Thanks, we have it</h2>
            <p className="muted">We will be in touch about your report.</p>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
