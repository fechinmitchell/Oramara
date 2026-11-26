// oramara/frontend/src/components/TurfReport.jsx
// The written turf report: findings, the last 12 months, and a month by month care programme.
// Used under the map on the analysis screen and in the printable report.
import { createContext, useContext, useEffect, useState } from 'react';
import CareProgramme, { TASKS, ChecklistContext, UpsellContext, UpgradeButton } from './CareProgramme.jsx';
import NdviChart, { monthLabel } from './NdviChart.jsx';
import { SquaredImage } from './SquaredImage.jsx';
import MonthExplorer from './MonthExplorer.jsx';
import { profileSummary } from './ClubDetails.jsx';

// Claude's short notes and any extra task, laid on top of the built in plan
function applyTweaks(base = [], tweaks = []) {
  const byMonth = new Map(tweaks.map((t) => [t.month, t]));
  return base.map((m) => {
    const t = byMonth.get(m.month);
    if (!t) return m;
    return { ...m, note: t.note, actions: [...m.actions, ...(t.add || [])] };
  });
}

// Keep the busy and renovation markers from the built in plan when Claude rewrites the months
function mergeFlags(aiProgramme, base = []) {
  const flags = new Map(base.map((m) => [m.month, m]));
  return aiProgramme.map((m) => ({
    ...m,
    busy: m.busy ?? flags.get(m.month)?.busy,
    renovation: m.renovation ?? flags.get(m.month)?.renovation,
    mowing: m.mowing || flags.get(m.month)?.mowing,
    conditions: m.conditions || flags.get(m.month)?.conditions
  }));
}

export { TASKS };

export const PERIODS = [1, 3, 6, 12];
export const periodLabel = (p) => (p === 12 ? 'Full year' : p === 1 ? '1 month' : `${p} months`);

// How many of the weakest months to explain, by report length (matches the backend)
const WORST_COUNT = { 1: 0, 3: 1, 6: 3, 12: 3 };

// Simple fallback when Claude has not written about a weak month
function seasonHint(month) {
  const m = Number(month.slice(5, 7));
  if (m === 12 || m <= 2) return 'Little grass growth in winter, plus wet ground and play. Keep off waterlogged areas and repair wear before spring.';
  if (m <= 5) return 'Slow start to the growing season. An early biostimulant application and a light feed once growth starts help the pitch catch up.';
  if (m <= 8) return 'Often a dry spell or heavy use. Apply the biostimulant before and after dry weather and rest worn areas where you can.';
  return 'End of season wear. Renovate, overseed and apply the biostimulant to help new grass establish before winter.';
}

const VERDICT_TONE = { strong: 'green', good: 'green', fair: 'gold', weak: 'red' };

// Each report section can be folded away on screen; printing always shows everything
const FoldContext = createContext({ closed: new Set(), toggle: () => {} });
// The level of care picked on the slider, shared by every pitch, the costs and the club totals
const LevelContext = createContext({ level: 'standard', setLevel: () => {} });

// ---------- Costs for the level of care picked ----------
// Club standard uses the full product list (with optional extras). Essential and Elite add up the jobs
// in their own programme, product by product, so the table always matches the plan on screen.
function levelCosts(programme, costs) {
  const meta = new Map((costs?.lines || []).map((l) => [l.id, l]));
  const byProduct = new Map();
  for (const m of programme || []) {
    for (const x of m.actions) {
      if (!x.product) continue;
      const row = byProduct.get(x.product) || { id: x.product, qty: 0, total: 0, priced: true, uses: [], count: 0 };
      row.qty += Number(x.qty) || 0;
      row.count += 1;
      if (x.cost == null) row.priced = false;
      row.total += x.cost || 0;
      const what = x.what.split(',')[0].replace(/ before any dry spell$/, ''); // one line per kind of job
      if (!row.uses.includes(what)) row.uses.push(what);
      byProduct.set(x.product, row);
    }
  }
  const area = costs?.areaM2 || 0;
  const rows = [...byProduct.values()].sort((x, y) => (x.id === 'oramara_pouch' ? -1 : y.id === 'oramara_pouch' ? 1 : 0));
  const lines = rows.map((r) => {
    const info = meta.get(r.id) || {};
    let shownQty = `${Math.round(r.qty)} x ${info.unit || 'unit'}`;
    let use = r.uses.slice(0, 3).join('; ') + (r.uses.length > 3 ? '; and more' : '');
    if (r.id === 'oramara_pouch') {
      shownQty = `${r.qty} pouches (${Math.ceil(r.qty / 10)} boxes of 10)`;
      use = `${r.count} applications from March to October, ${Math.round(r.qty / r.count)} pouches each`;
    }
    if (r.id === 'aeration_contractor' && area) {
      const passes = Math.round(r.qty / area);
      shownQty = `${passes} pass${passes === 1 ? '' : 'es'} of ${area.toLocaleString('en-IE')} m²`;
    }
    return {
      ...info,
      id: r.id,
      task: info.category || info.name,
      use,
      shownQty,
      total: r.priced || r.total ? Math.round(r.total) : null,
      optional: false
    };
  });
  const sum = (list) => list.reduce((t, l) => t + (l.total || 0), 0);
  return { lines, totals: { oramara: sum(lines.filter((l) => l.ours)), programme: sum(lines) } };
}

const LEVEL_NAMES = { essential: 'Essential', standard: 'Club standard', elite: 'Elite' };

function Section({ id, title, className = '', children }) {
  const { closed, toggle } = useContext(FoldContext);
  const isClosed = closed.has(id);
  return (
    <section className={`tr-section tr-fold ${className} ${isClosed ? 'is-closed' : ''}`} data-section={id}>
      <h3>
        <button type="button" className="tr-fold-head" aria-expanded={!isClosed} onClick={() => toggle(id)}>
          <span>{title}</span>
          <span className="tr-fold-icon no-print" aria-hidden="true">{isClosed ? '+' : '−'}</span>
        </button>
      </h3>
      <div className="tr-fold-body">{children}</div>
    </section>
  );
}

export default function TurfReport(props) {
  const [closed, setClosed] = useState(() => new Set());
  const [active, setActive] = useState('main');
  const [level, setLevel] = useState('standard');
  const toggle = (id) =>
    setClosed((c) => {
      const next = new Set(c);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const goalParts = (props.data.parts || []).filter((g) => g.kind !== 'pitch');
  const extraParts = (props.data.parts || []).filter((g) => g.kind === 'pitch');
  const a = props.data.analysis;
  const ai = a.ai_report && !a.ai_report.error ? a.ai_report : null;
  const allIds = [
    'month-by-month', 'what-the-photo-shows', 'look-back', 'weakest-months', 'goalmouths', 'priorities-for-the-next-two-months',
    'oramara-turf-biostimulant-plan', 'programme', 'products-and-costs-for-this-pitch', 'questions-for-the-meeting',
    ...extraParts.flatMap((x) => ['see', 'do', 'product', 'programme', 'costs'].map((k) => `x${x.id}-${k}`))
  ];

  // Every pitch in this report, for the switcher at the top
  const pitches = [
    { id: 'main', label: a.label || 'Main pitch', score: a.score, area: a.imagery?.areaM2, thin: a.stressed_pct },
    ...extraParts.map((x) => ({ id: `x${x.id}`, label: x.label, score: x.score, area: x.area_m2, thin: x.stressed_pct }))
  ];
  const lowest = pitches.length > 1 ? pitches.reduce((w, p) => (p.score < w.score ? p : w)) : null;
  const worstId = lowest && Math.max(...pitches.map((p) => p.score)) - lowest.score >= 3 ? lowest.id : null;
  const current = pitches.some((p) => p.id === active) ? active : 'main';

  const pick = (id) => {
    setActive(id);
    document.getElementById('tr-pitch-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <UpsellContext.Provider value={props.upsell || null}>
    <ChecklistContext.Provider value={props.checklist || null}>
    <FoldContext.Provider value={{ closed, toggle }}>
     <LevelContext.Provider value={{ level, setLevel }}>
      <div className="turf-report">
        {extraParts.length > 0 && <ClubSummary data={props.data} extras={extraParts} onPick={pick} />}

        {extraParts.length > 0 && (
          <div className="tr-pitch-tabs no-print" id="tr-pitch-tabs" role="tablist" aria-label="Pitches in this report">
            {pitches.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={current === p.id}
                className={`tr-pitch-tab ${current === p.id ? 'active' : ''}`}
                onClick={() => setActive(p.id)}
              >
                <span className={`tr-pitch-score ${p.score >= 80 ? 'green' : p.score >= 65 ? 'gold' : 'red'}`}>{p.score}</span>
                <span className="tr-pitch-name">
                  <strong>{p.label}</strong>
                  <small>
                    {p.area ? `${(p.area / 10000).toFixed(2)} ha · ` : ''}
                    {p.thin}% thin
                  </small>
                </span>
                {worstId === p.id && <span className="tr-chip red">Needs work first</span>}
              </button>
            ))}
          </div>
        )}

        <div className="tr-fold-bar no-print">
          <button type="button" className="link-btn" onClick={() => setClosed(new Set())}>Open all sections</button>
          <button type="button" className="link-btn" onClick={() => setClosed(new Set(allIds))}>Close all sections</button>
        </div>

        <div className={`tr-pane ${current === 'main' ? 'active' : ''}`} role="tabpanel">
          {extraParts.length > 0 && <h2 className="tr-pane-title print-only">{a.label || 'Main pitch'}</h2>}
          <PitchReport {...props} data={{ ...props.data, parts: goalParts }} />
        </div>
        {extraParts.map((x, i) => (
          <div key={x.id} className={`tr-pane ${current === `x${x.id}` ? 'active' : ''}`} role="tabpanel">
            <h2 className="tr-pane-title print-only">{x.label}</h2>
            <ExtraPitch
              part={x}
              note={ai?.other_pitches?.[i]}
              showImages={props.showImages}
              pitchType={a.pitch_type}
              clubSet={Boolean(props.data.lead?.pitch_profile)}
            />
          </div>
        ))}
      </div>
     </LevelContext.Provider>
    </FoldContext.Provider>
    </ChecklistContext.Provider>
    </UpsellContext.Provider>
  );
}

// Every pitch at the club side by side, with the season costs added up. A row opens that pitch.
function ClubSummary({ data, extras, onPick }) {
  const { level } = useContext(LevelContext);
  const a = data.analysis;
  // Season cost and pouches for the level picked, from each pitch's own programme
  const levelFigures = (plan) => {
    const prog = plan?.programmes?.[level] || plan?.programme || [];
    let spend = 0;
    let oramara = 0;
    let pouches = 0;
    for (const m of prog) {
      for (const x of m.actions) {
        spend += x.cost || 0;
        if (x.product === 'oramara_pouch') {
          oramara += x.cost || 0;
          pouches += Number(x.qty) || 0;
        }
      }
    }
    return { spend, oramara, pouches };
  };
  const rows = [
    { key: 'main', label: a.label || 'Main pitch', score: a.score, strong: a.healthy_pct, thin: a.stressed_pct, area: a.imagery?.areaM2, plan: data.plan },
    ...extras.map((x) => ({ key: `x${x.id}`, label: x.label, score: x.score, strong: x.healthy_pct, thin: x.stressed_pct, area: x.area_m2, plan: x.plan }))
  ];
  rows.forEach((r) => Object.assign(r, { fig: levelFigures(r.plan) }));
  const sum = (k) => rows.reduce((t, r) => t + r.fig[k], 0);
  return (
    <section className="tr-section tr-club">
      <h2 className="tr-headline">All pitches in this report</h2>
      <div className="tr-kpis">
        <Kpi value={rows.length} label="Pitches" />
        <Kpi value={`${sum('pouches')}`} label="Pouches a season" sub="all pitches" tone="gold" />
        <Kpi value={euro(sum('oramara'))} label="Oramara Turf Biostimulant" sub="for the season" tone="gold" />
        <Kpi value={euro(sum('spend'))} label="Care programme" sub={`whole club, ${LEVEL_NAMES[level]}`} />
      </div>
      <table className="tr-table">
        <thead>
          <tr><th>Pitch</th><th>Score</th><th>Strong</th><th>Thin</th><th>Area</th><th>Pouches</th><th>Care programme</th></tr>
        </thead>
        <tbody>
          {[...rows].sort((x, y) => x.score - y.score).map((r) => (
            <tr key={r.key} className="tr-club-row" onClick={() => onPick?.(r.key)} title="Open this pitch">
              <td><button type="button" className="link-btn">{r.label}</button></td>
              <td><strong>{r.score}</strong></td>
              <td>{r.strong}%</td>
              <td>{r.thin}%</td>
              <td>{r.area ? `${(r.area / 10000).toFixed(2)} ha` : ''}</td>
              <td>{r.fig.pouches}</td>
              <td>{euro(r.fig.spend)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">
        Costs for the {LEVEL_NAMES[level]} level of care; change it on the slider in any care programme. Sorted with the pitch needing most work
        first. Click a pitch to open its report.
      </p>
    </section>
  );
}

// Report for a training, juvenile or other pitch measured in the same run: the same layout as the main pitch
function ExtraPitch({ part: x, note, showImages, pitchType, clubSet }) {
  const plan = x.plan;
  const zones = (x.zones || []).map((z) => ({ ...z, advice: plan?.zoneNotes?.find((n) => n.letter === z.letter) }));
  const actions = note?.actions?.length ? note.actions : plan?.priorities || [];
  const product = plan?.product;
  return (
    <div className="tr-pitch">
      <section className="tr-section tr-summary">
        <div className="tr-kpis">
          <Kpi value={x.score} label="Turf score" sub="from the sharp photo" />
          <Kpi value={`${x.healthy_pct}%`} label="Strong" tone="green" />
          <Kpi value={`${x.moderate_pct}%`} label="Moderate" tone="gold" />
          <Kpi value={`${x.stressed_pct}%`} label="Thin" tone="red" />
          <Kpi value={`${(x.area_m2 / 10000).toFixed(2)} ha`} label="Measured" />
        </div>
        <h2 className="tr-headline">{note?.verdict || plan?.headline}</h2>
        {note?.notes && <p>{note.notes}</p>}
      </section>

      {showImages && x.images.heatmap && (
        <section className="tr-section tr-images">
          {x.images.original && (
            <figure>
              <SquaredImage src={x.images.original} outline={x.geo_polygon} alt={`Aerial photo of the ${x.label.toLowerCase()}`} />
              <figcaption>Aerial photo</figcaption>
            </figure>
          )}
          <figure>
            <SquaredImage src={x.images.heatmap} outline={x.geo_polygon} alt={`Greenness map of the ${x.label.toLowerCase()}`} />
            <figcaption>Greenness map: green strong, amber moderate, red thin.</figcaption>
          </figure>
        </section>
      )}

      {zones.length > 0 && (
        <Section id={`x${x.id}-see`} title="Weak areas">
          <div className="tr-zones">
            {zones.map((z) => (
              <div key={z.letter} className="tr-zone">
                <div className="zone-letter">{z.letter}</div>
                <div>
                  <strong>{z.label}</strong> {z.edge && <span className="tr-chip">Edge strip</span>}{' '}
                  <span className="muted small">{z.stressedPct}% of this area is weaker than the rest</span>
                  {z.advice?.likely && <p>{z.advice.likely}</p>}
                  {z.advice?.actions?.length > 0 && <ul className="tr-list small">{z.advice.actions.map((t, i) => <li key={i}>{t}</li>)}</ul>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {actions.length > 0 && (
        <Section id={`x${x.id}-do`} title="Priorities for this pitch">
          <ol className="tr-list">{actions.map((t, i) => <li key={i}>{t}</li>)}</ol>
        </Section>
      )}

      {product && (
        <Section id={`x${x.id}-product`} className="tr-seaweed" title="Oramara Turf Biostimulant plan">
          <p>
            Every 3 to 4 weeks from March to October. Each application is {product.pouchesPerSpray} Dose Pouch
            {product.pouchesPerSpray > 1 ? 'es' : ''} in {product.waterLitres} L of water over the whole pitch.
          </p>
          <div className="tr-kpis">
            <Kpi value={product.pouchesPerSpray} label="Pouches per application" sub={`${product.waterLitres} L of water`} tone="gold" />
            <Kpi value={product.spraysPerSeason} label="Applications a season" sub="March to October" />
            <Kpi value={product.pouchesPerSeason} label="Pouches a season" tone="gold" />
          </div>
        </Section>
      )}

      {plan?.programme?.length > 0 && (
        <Section id={`x${x.id}-programme`} title="Care programme for this pitch">
          <p className="small tr-club">
            <strong>Planned around:</strong> {profileSummary(pitchType, plan.profile)}
            {!clubSet && <span className="muted"> (typical values; add the club's own details to fine tune it)</span>}
          </p>
          <LevelCareProgramme programme={plan.programme} levels={plan.programmes} costs={plan.costs} />
        </Section>
      )}

      {plan?.costs && <ProductsCosts costs={plan.costs} levels={plan.programmes} id={`x${x.id}-costs`} />}
    </div>
  );
}

function PitchReport({ data, months = [], period = 12, showImages = false, showQuestions = true, loadMonth, onTrack }) {
  const { analysis: a, plan, images } = data;
  const ai = a.ai_report && !a.ai_report.error ? a.ai_report : null;
  const windowMonths = months.slice(-period); // the months this report reviews
  const chartMonths = months.slice(-Math.max(period, 6)); // a little context either side for short periods
  const clearMonths = windowMonths.filter((m) => m.clear);
  const last12 = clearMonths;
  const lookBack = period === 1 ? 'Last month' : period === 12 ? 'The last 12 months' : `The last ${period} months`;
  const lookAhead = period === 1 ? 'Next month' : period === 12 ? '12 month care programme' : `${period} month care programme`;

  // Measured zones with Claude's notes, or the built in advice if Claude has not written any
  const zones = a.zones.map((z) => {
    const note = ai?.zones?.find((n) => n.letter === z.letter);
    const fallback = plan.zoneNotes.find((n) => n.letter === z.letter);
    return {
      ...z,
      see: note?.what_we_see || fallback?.likely,
      causes: note?.likely_causes || '',
      actions: note?.actions?.length ? note.actions : fallback?.actions || []
    };
  });

  const priorities = ai?.priorities?.length ? ai.priorities : plan.priorities;
  const worst = [...clearMonths].sort((x, y) => x.ndvi - y.ndvi).slice(0, WORST_COUNT[period] ?? 0);
  const worstNotes = new Map((ai?.worst_months || []).map((w) => [w.month, w]));
  // Claude's tailored programme, or the built in one for this sport and club
  const programme =
    (ai?.programme_tweaks?.length
      ? applyTweaks(plan.programme, ai.programme_tweaks)
      : ai?.programme?.length
        ? mergeFlags(ai.programme, plan.programme)
        : plan.programme) || [];
  // Essential, standard and elite versions of the plan, each with Claude's notes for this pitch
  const levels = plan.programmes
    ? Object.fromEntries(
        Object.entries(plan.programmes).map(([k, v]) => [k, ai?.programme_tweaks?.length ? applyTweaks(v, ai.programme_tweaks) : v])
      )
    : null;
  const costs = plan.costs || null;
  const clubSet = Boolean(data.lead?.pitch_profile);
  const notesByMonth = new Map((ai?.monthly_notes || []).map((n) => [n.month, n.note]));

  return (
    <div className="tr-pitch">
      {/* 1. Summary */}
      <section className="tr-section tr-summary">
        <div className="tr-kpis">
          <Kpi value={a.score} label="Turf score" sub="from the sharp photo" />
          <Kpi value={`${a.healthy_pct}%`} label="Strong" tone="green" />
          <Kpi value={`${a.moderate_pct}%`} label="Moderate" tone="gold" />
          <Kpi value={`${a.stressed_pct}%`} label="Thin" tone="red" />
          {a.imagery?.playScore != null && (
            <Kpi value={a.imagery.playScore} label="Playing area" sub={`outer ${a.imagery.edgeBandM || 8} m strip: ${a.imagery.edgeScore}`} />
          )}
          {last12.length > 0 && (
            <Kpi value={last12[last12.length - 1].ndvi.toFixed(2)} label="Latest vigour" sub={monthLabel(last12[last12.length - 1].month, true)} />
          )}
        </div>
        <h2 className="tr-headline">{ai?.headline || plan.headline}</h2>
        {ai?.summary && <p>{ai.summary}</p>}
        <p className="muted small">
          {a.imagery?.photoDate
            ? `Aerial photo taken ${new Date(a.imagery.photoDate).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })}.`
            : 'Aerial photo date unknown.'}
          {a.imagery?.insetM ? ` Measured ${a.imagery.insetM} m inside the pitch edge, with line paint and shadow left out.` : ''}
          {a.imagery?.removedPct ? ` ${a.imagery.removedPct}% left out as hard surfaces along the edge${a.imagery.exclude?.length ? ' and areas marked to leave out' : ''}.` : ''}
        </p>
      </section>

      {showImages && images && (
        <section className="tr-section tr-images">
          <figure>
            <SquaredImage src={images.original} outline={a.geo_polygon} alt="Aerial photo of the pitch" />
            <figcaption>Aerial photo</figcaption>
          </figure>
          <figure>
            <SquaredImage src={images.heatmap} outline={a.geo_polygon} alt="Greenness map of the pitch" />
            <figcaption>Greenness map: green strong, amber moderate, red thin. Letters mark areas to check.</figcaption>
          </figure>
        </section>
      )}

      {/* The pitch month by month, from the satellite */}
      {loadMonth && images?.original && a.imagery?.bounds && windowMonths.length > 0 && (
        <Section id="month-by-month" title="Your pitch month by month" className="no-print">
          <p className="muted small">Pick how far back to look, then step through each month. Colours show plant vigour from the satellite that month.</p>
          <MonthExplorer
            months={windowMonths}
            notes={notesByMonth}
            photo={images.original}
            photoBounds={a.imagery.bounds}
            outline={a.geo_polygon}
            loadMonth={loadMonth}
            onView={(month) => onTrack?.('month_view', { month })}
            hint={seasonHint}
          />
        </Section>
      )}

      {/* Goalmouths, each measured from its own closer photo */}
      {data.parts?.length > 0 && <Goalmouths parts={data.parts} />}

      {/* 2. What we see */}
      {(ai?.observations?.length > 0 || zones.length > 0) && (
        <Section id="what-the-photo-shows" title="What the photo shows">
          {ai?.observations?.length > 0 && <ul className="tr-list">{ai.observations.map((o, i) => <li key={i}>{o}</li>)}</ul>}
          {zones.length > 0 && (
            <div className="tr-zones">
              {zones.map((z) => (
                <div key={z.letter} className="tr-zone">
                  <div className="zone-letter">{z.letter}</div>
                  <div>
                    <strong>{z.label}</strong> {z.edge && <span className="tr-chip" title="Mostly in the outer strip next to the boundary, where stands, dugouts, paths and shade sit">Edge strip</span>}{' '}
                    <span className="muted small">{z.stressedPct}% of this area is weaker than the rest</span>
                    {z.see && <p>{z.see}</p>}
                    {z.causes && <p className="muted small">Worth checking: {z.causes}</p>}
                    {z.actions.length > 0 && <ul className="tr-list small">{z.actions.map((x, i) => <li key={i}>{x}</li>)}</ul>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* 3. The last 12 months */}
      {clearMonths.length > 0 && (
        <Section id="look-back" title={lookBack}>
          {period > 1 && (
            <div className="tr-chart">
              <NdviChart months={chartMonths} width={760} height={190} selected={a.imagery?.focusMonth || undefined} />
            </div>
          )}
          {ai?.year_review?.overview && <p>{ai.year_review.overview}</p>}

          {ai?.year_review?.seasons?.length > 0 && (
            <div className="tr-seasons">
              {ai.year_review.seasons.map((s) => (
                <div key={s.season} className="tr-season">
                  <div className="tr-season-head">
                    <strong>{s.season}</strong>
                    <span className={`tr-chip ${VERDICT_TONE[s.verdict.toLowerCase()] || 'grey'}`}>{s.verdict}</span>
                  </div>
                  <span className="muted small">{s.months}</span>
                  <p className="small">{s.what_happened}</p>
                </div>
              ))}
            </div>
          )}

          {ai?.year_review?.year_on_year && <p className="small"><strong>Compared with the year before:</strong> {ai.year_review.year_on_year}</p>}

          <table className="tr-months">
            <thead>
              <tr>
                <th>Month</th>
                <th>Vigour</th>
                <th>Strong</th>
                <th>Thin</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {windowMonths.map((m) => (
                <tr key={m.month} className={!m.clear ? 'cloudy' : ''}>
                  <td>{monthLabel(m.month, true)}</td>
                  <td>{m.clear ? <VigourDot value={m.ndvi} /> : <span className="muted">cloud</span>}</td>
                  <td>{m.clear && m.strongPct !== null ? `${m.strongPct}%` : ''}</td>
                  <td>{m.clear && m.thinPct !== null ? `${m.thinPct}%` : ''}</td>
                  <td className="small">
                    {notesByMonth.get(m.month) || ''}
                    {ai?.year_review?.best_month === m.month && <span className="tr-chip green">Best</span>}
                    {ai?.year_review?.weakest_month === m.month && <span className="tr-chip red">Weakest</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Vigour is NDVI from the EU's free Sentinel 2 satellites, best cloud free view each month. Dense healthy turf is 0.75 or more.</p>
          <LockedHistory />
        </Section>
      )}

      {/* 3b. The weakest months and how to fix them */}
      {worst.length > 0 && (
        <Section id="weakest-months" className="tr-worst-section" title={worst.length === 1 ? 'The weakest month' : `The ${worst.length} weakest months`}>
          <p className="muted small">Lowest plant vigour in this period, what likely caused it, and how to fix it.</p>
          <div className="tr-worst">
            {worst.map((m, i) => {
              const w = worstNotes.get(m.month);
              return (
                <div key={m.month} className="tr-worst-card">
                  <div className="tr-worst-head">
                    <span className="tr-rank">{i + 1}</span>
                    <div>
                      <strong>{monthLabel(m.month, true)}</strong>
                      <div className="small">
                        <VigourDot value={m.ndvi} /> vigour
                        {m.strongPct !== null && <span className="muted"> · {m.strongPct}% strong · {m.thinPct}% thin</span>}
                      </div>
                    </div>
                  </div>
                  <p className="small"><strong>What happened:</strong> {w?.what_happened || seasonHint(m.month)}</p>
                  {w?.fixes?.length > 0 && (
                    <>
                      <p className="small tr-label">How to fix it</p>
                      <ul className="tr-list small">{w.fixes.map((f, k) => <li key={k}>{f}</li>)}</ul>
                    </>
                  )}
                  {w?.next_time && <p className="small tr-next"><strong>Next year:</strong> {w.next_time}</p>}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* 4. Next two months */}
      <Section id="priorities-for-the-next-two-months" title="Priorities for the next two months">
        <ol className="tr-list">{priorities.map((p, i) => <li key={i}>{p}</li>)}</ol>
      </Section>

      {/* 5. Biostimulant */}
      <Section id="oramara-turf-biostimulant-plan" className="tr-seaweed" title="Oramara Turf Biostimulant plan">
        <p className="muted small">A natural Irish seaweed biostimulant. It is not a fertiliser: it helps the grass use the nutrients already in the soil, root deeper and recover from wear and stress.</p>
        {ai?.seaweed_plan && <p>{ai.seaweed_plan}</p>}
        <div className="tr-kpis">
          <Kpi value={plan.product.pouchesPerSpray} label="Pouches per application" sub={`${plan.product.waterLitres} L of water`} />
          <Kpi value={plan.product.spraysPerSeason} label="Applications a season" sub="March to October" />
          <Kpi value={plan.product.pouchesPerSeason} label="Pouches a season" />
        </div>
      </Section>

      {/* 6. Care programme */}
      <Section id="programme" title={lookAhead}>
        <p className="small tr-club">
          <strong>Planned around:</strong> {profileSummary(a.pitch_type, plan.profile)}
          {!clubSet && <span className="muted"> (typical values; add the club's own details to fine tune it)</span>}
        </p>
        <LevelCareProgramme programme={programme} levels={levels} costs={costs} />
      </Section>

      {/* 7. Products and costs */}
      {costs && (
        <ProductsCosts costs={costs} levels={levels} id="products-and-costs-for-this-pitch" />
      )}

      {ai?.image_notes && (
        <section className="tr-section">
          <p className="muted small">{ai.image_notes}</p>
        </section>
      )}

      {showQuestions && ai?.questions_for_club?.length > 0 && (
        <Section id="questions-for-the-meeting" className="tr-questions no-print" title="Questions for the meeting">
          <ul className="tr-list">{ai.questions_for_club.map((q, i) => <li key={i}>{q}</li>)}</ul>
          <p className="muted small">Not printed.</p>
        </Section>
      )}
    </div>
  );
}

function Goalmouths({ parts }) {
  const scores = parts.map((g) => g.score);
  // Only flag one end when it is clearly worse than the other
  const worst = parts.length > 1 && Math.max(...scores) - Math.min(...scores) >= 3 ? parts.reduce((w, g) => (g.score < w.score ? g : w), parts[0]) : null;
  const total = parts.reduce((t, g) => t + g.repair.cost, 0);
  return (
    <Section id="goalmouths" className="tr-goals" title="Goalmouths">
      <p className="small muted">Each end measured on its own from a closer aerial photo, so wear in front of the posts shows up clearly.</p>
      <div className="tr-goal-grid">
        {parts.map((g) => (
          <div key={g.id} className="tr-goal-card">
            <div className="tr-goal-head">
              <span className="tr-goal-score">{g.score}</span>
              <span>
                <strong>{g.label}</strong>
                {worst && worst.id === g.id && <span className="tr-chip red">Repair first</span>}
                <small className="muted">{Math.round(g.area_m2)} m² · {g.healthy_pct}% strong · {g.stressed_pct}% thin</small>
              </span>
            </div>
            {g.images.heatmap && <img src={g.images.heatmap} alt={`Greenness map of the ${g.label.toLowerCase()} goalmouth`} />}
            <table className="tr-table small">
              <tbody>
                <tr><td>Grass seed (20 kg)</td><td>{g.repair.seedBags} bag{g.repair.seedBags > 1 ? 's' : ''}</td></tr>
                <tr><td>Pre seed feed (25 kg)</td><td>{g.repair.feedBags} bag{g.repair.feedBags > 1 ? 's' : ''}</td></tr>
                <tr><td>Sand top dressing (1 t)</td><td>{g.repair.sandBags} bag{g.repair.sandBags > 1 ? 's' : ''}</td></tr>
                <tr className="tr-total"><td>Repair cost</td><td>{euro(g.repair.cost)}</td></tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>
      {parts.length > 1 && <p className="small">Both goalmouths repaired: about {euro(total)} in materials.</p>}
    </Section>
  );
}

function LevelCareProgramme(props) {
  const { level, setLevel } = useContext(LevelContext);
  return <CareProgramme {...props} level={level} onLevel={setLevel} />;
}

// In the portal on a free window: the rest of the year's history is in the full year
function LockedHistory() {
  const up = useContext(UpsellContext);
  if (!up?.reviewLocked) return null;
  return (
    <div className="up-strip">
      <span className="cp-lock" aria-hidden="true">🔒</span>
      <span>
        <strong>{up.reviewLocked} more month{up.reviewLocked === 1 ? '' : 's'} of history</strong> and the full year review are in the 12 month analysis.
      </span>
      <UpgradeButton label="Unlock" small />
    </div>
  );
}

function ProductsCosts({ costs: baseCosts, levels, id }) {
  const { level } = useContext(LevelContext);
  // Every level is costed from its own care programme, so this table always matches the month cards.
  // The full pitch overseed stays as an optional extra below Elite (Elite already includes it).
  const byLevel = levels?.[level] ? levelCosts(levels[level], baseCosts) : null;
  const extras = level === 'elite' ? [] : (baseCosts.lines || []).filter((l) => l.optional && l.id !== 'aeration_contractor');
  const extrasTotal = extras.reduce((t, l) => t + (l.total || 0), 0);
  const costs = byLevel ? { ...baseCosts, lines: [...byLevel.lines, ...extras] } : baseCosts;
  return (
        <Section id={id} className="tr-costs" title="Products and costs for this pitch">
          <p className="small">
            What a season of care needs for about {(costs.areaM2 / 10000).toFixed(2)} ha, with about {costs.wearAreaM2.toLocaleString('en-IE')} m² of
            goalmouths and wear areas to repair.
          </p>
          {byLevel ? (
            <div className="tr-kpis">
              <Kpi value={euro(byLevel.totals.oramara)} label="Oramara Turf Biostimulant" sub="for the season" tone="gold" />
              <Kpi value={euro(byLevel.totals.programme)} label={`${LEVEL_NAMES[level]} programme`} sub="products and contractor work" />
              {extrasTotal > 0 && <Kpi value={euro(extrasTotal)} label="Optional extras" sub="full pitch overseed" />}
            </div>
          ) : (
            <div className="tr-kpis">
              <Kpi value={euro(costs.totals.oramara)} label="Oramara Turf Biostimulant" sub="for the season" tone="gold" />
              <Kpi value={euro(costs.totals.essential)} label="Core programme" sub="including the biostimulant" />
              <Kpi value={euro(costs.totals.optional)} label="Optional extras" sub="full overseed, aeration" />
            </div>
          )}
          <p className="small muted tr-level-note">
            Showing the <strong>{LEVEL_NAMES[level]}</strong> level of care. Change it on the slider in the care programme.
          </p>
          <table className="tr-cost-table">
            <thead>
              <tr>
                <th>Job and product</th>
                <th>Use on this pitch</th>
                <th className="num">Amount</th>
                <th className="num">Cost</th>
              </tr>
            </thead>
            <tbody>
              {costs.lines.map((l, i) => (
                <tr key={i} className={`${l.ours ? 'ours' : ''} ${l.optional ? 'optional' : ''}`}>
                  <td>
                    <strong className="tr-job">{l.task || l.name}</strong>
                    {l.optional && <span className="tr-chip">Optional</span>}
                    {l.task && (
                      <div className="small">
                        {l.link ? <a href={l.link} target="_blank" rel="noreferrer">{l.name}</a> : l.name}
                      </div>
                    )}
                    <div className="muted small">{l.why}</div>
                  </td>
                  <td className="small">{l.use}{l.rate && <div className="muted">Rate: {l.rate}</div>}</td>
                  <td className="num small">{l.shownQty || (l.unit === 'm²' ? `${Math.round(l.qty).toLocaleString('en-IE')} m²` : `${l.qty} x ${l.unit}`)}</td>
                  <td className="num">{l.total === null ? 'Quote' : euro(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">
            Prices in euro including VAT, checked {costs.pricesChecked}, rounded. Some were converted from UK suppliers. Delivery and contractor
            labour vary, so get local quotes for big jobs. Other suppliers are listed for convenience; Oramara is not paid by them.
          </p>
        </Section>
  );
}

function euro(v) {
  return `€${Math.round(Number(v) || 0).toLocaleString('en-IE')}`;
}

function Kpi({ value, label, sub, tone }) {
  return (
    <div className={`tr-kpi ${tone || ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
      {sub && <small>{sub}</small>}
    </div>
  );
}

function VigourDot({ value }) {
  const tone = value >= 0.75 ? 'green' : value >= 0.6 ? 'gold' : 'red';
  return (
    <span className="tr-vigour">
      <i className={tone} />
      {value.toFixed(2)}
    </span>
  );
}