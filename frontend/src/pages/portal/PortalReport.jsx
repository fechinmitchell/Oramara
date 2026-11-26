// oramara/frontend/src/pages/portal/PortalReport.jsx
// One report for the club, with a live checklist on the care programme, the pitch month by month,
// and a light activity log (sections read, months opened, links clicked, time on the page) for Oramara
import { useEffect, useRef, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { portalApi, session, track } from './portalApi.js';
import { PITCH_TYPES, labelFor } from '../../config/options.js';
import { PRICING } from '../../config/brand.js';
import { UpgradeButton, UpsellContext } from '../../components/CareProgramme.jsx';
import TurfReport from '../../components/TurfReport.jsx';
import '../admin/analysis.css';

export default function PortalReport() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [ticks, setTicks] = useState({});
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [requested, setRequested] = useState(false);
  const [upBusy, setUpBusy] = useState(false);
  const { guest, openSignup } = useOutletContext() || {};
  const wrapRef = useRef(null);
  const reportId = Number(id);

  useEffect(() => {
    portalApi(`/reports/${id}?session=${session}`)
      .then((d) => {
        setData(d);
        setTicks(Object.fromEntries((d.ticks || []).map((t) => [t.task_key, t])));
        setRequested(Boolean(d.upgradeRequested));
      })
      .catch((err) => setError(err.message));
  }, [id]);

  // What the club reads: each section once per visit, time on the page while it is in view, link clicks and printing
  useEffect(() => {
    if (!data || !wrapRef.current) return;
    const root = wrapRef.current;
    const seen = new Set();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const section = e.target.dataset.section;
          if (e.isIntersecting && !seen.has(section)) {
            seen.add(section);
            track('section_view', { section }, reportId);
          }
        }
      },
      { threshold: 0.35 }
    );
    root.querySelectorAll('[data-section]').forEach((el) => io.observe(el));
    const beat = setInterval(() => {
      if (document.visibilityState === 'visible') track('heartbeat', null, reportId);
    }, 30000);
    const onClick = (e) => {
      const a = e.target.closest('a[href]');
      if (a && root.contains(a)) track('link_click', { href: a.getAttribute('href'), label: a.textContent.trim().slice(0, 80) }, reportId);
    };
    const onPrint = () => track('print', null, reportId);
    root.addEventListener('click', onClick);
    window.addEventListener('beforeprint', onPrint);
    return () => {
      io.disconnect();
      clearInterval(beat);
      root.removeEventListener('click', onClick);
      window.removeEventListener('beforeprint', onPrint);
    };
  }, [data]);

  // Tick straight away on screen, then save; undo the tick if saving fails. Guests are asked to make an account first.
  async function onTick(key, done) {
    setSaveError('');
    if (guest) return openSignup?.('tick');
    const before = ticks[key];
    setTicks((t) => ({ ...t, [key]: { ...(t[key] || {}), task_key: key, done } }));
    try {
      const saved = await portalApi(`/reports/${id}/ticks`, { method: 'PUT', body: { key, done } });
      setTicks((t) => ({ ...t, [key]: saved }));
    } catch (err) {
      setTicks((t) => ({ ...t, [key]: before }));
      if (err.data?.code === 'account_needed') return openSignup?.('tick');
      setSaveError(`That did not save: ${err.message}`);
    }
  }

  // The club asks for the full year; Oramara follows up to set it up
  async function onUpgrade() {
    setUpBusy(true);
    track('upgrade_click', null, reportId);
    try {
      await portalApi('/upgrade', { method: 'POST', body: { plan: 'full_year' } });
      setRequested(true);
    } catch (err) {
      setSaveError(err.message);
    }
    setUpBusy(false);
  }

  if (error) {
    return (
      <div>
        <Link to="/portal" className="link-btn small">← All reports</Link>
        <p className="error">{error}</p>
      </div>
    );
  }
  if (!data) return <p className="muted">Loading your report...</p>;

  const a = data.analysis;
  const date = new Date(a.created_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
  const doneCount = Object.values(ticks).filter((t) => t?.done).length;
  const upsell = data.limit
    ? {
        ...data.limit,
        price: PRICING.fullYear,
        perMonth: (PRICING.fullYear / 12).toFixed(2),
        perWeek: (PRICING.fullYear / 52).toFixed(2),
        requested,
        busy: upBusy,
        onUpgrade
      }
    : null;

  return (
    <div className="pt-report" ref={wrapRef}>
      <div className="pt-report-bar no-print">
        <Link to="/portal" className="link-btn small">← All reports</Link>
        <span className="small muted">{doneCount ? `${doneCount} job${doneCount === 1 ? '' : 's'} ticked off` : 'Tick jobs off in the care programme as you do them'}</span>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => window.print()}>Print or save PDF</button>
      </div>
      {saveError && <p className="error no-print">{saveError}</p>}

      {upsell && (
        <UpsellContext.Provider value={upsell}>
          <div className="up-banner no-print">
            <div className="up-meter" aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => <i key={i} className={i < upsell.months ? 'on' : ''} />)}
            </div>
            <span>
              You are seeing <strong>{upsell.months} of 12 months</strong> free. The full year is €{upsell.price}, about €{upsell.perMonth} a month.
            </span>
            <UpgradeButton label="Unlock 12 months" small />
          </div>
        </UpsellContext.Provider>
      )}

      <header className="pt-report-title">
        <h1>{data.lead?.name}</h1>
        <p className="muted">
          {a.label ? `${a.label} · ` : ''}
          {labelFor(PITCH_TYPES, a.pitch_type)} · report of {date}
        </p>
      </header>

      <TurfReport
        data={data}
        months={data.months || []}
        period={a.imagery?.period || 12}
        showImages
        showQuestions={false}
        checklist={{ ticks, onTick }}
        upsell={upsell}
        loadMonth={(month) => portalApi(`/reports/${id}/months/${month}`)}
        onTrack={(kind, detail) => track(kind, detail, reportId)}
      />
    </div>
  );
}