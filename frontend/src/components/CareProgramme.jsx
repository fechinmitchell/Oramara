// oramara/frontend/src/components/CareProgramme.jsx
// The month by month care programme: the season at a glance, then one card per month.
// Every card is the same size and shows the jobs, amounts and cost. "More detail" opens the month
// in a panel with how, why and the products, with buttons to step through the months.
// Printing always shows every month in full.
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { monthLabel } from './NdviChart.jsx';

// In the customer portal the club ticks jobs off as they are done. The report passes the ticks
// and a save function through this context; elsewhere the boxes are plain, for printing.
export const ChecklistContext = createContext(null);
export const taskKey = (m, x) => `${m.month}|${x.what}`;

// In the customer portal a club on a free window sees the rest of the year locked, with the full year offered.
// { months, lockedMonths: ['2027-04', ...], reviewLocked, price, perMonth, perWeek, requested, onUpgrade }
export const UpsellContext = createContext(null);

const monthName = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-IE', { month: 'long', timeZone: 'UTC' });
const monthYear = (ym) => ym.slice(0, 4);

export function UpgradeButton({ label = 'Get the full year', small = false }) {
  const up = useContext(UpsellContext);
  if (!up) return null;
  if (up.requested) return <span className="up-requested small">✓ Requested. We will be in touch within one working day.</span>;
  return (
    <button type="button" className={`btn btn-gold ${small ? 'btn-small' : ''}`} onClick={up.onUpgrade} disabled={up.busy}>
      {up.busy ? 'Sending...' : label}
    </button>
  );
}

// The offer, shown after the free months
export function UpsellCard() {
  const up = useContext(UpsellContext);
  if (!up) return null;
  return (
    <div className="up-card">
      <div className="up-card-main">
        <span className="up-eyebrow">Unlock the full year</span>
        <h4>See all 12 months for your pitch</h4>
        <ul>
          <li>12 months of satellite history and the full year review</li>
          <li>The complete care programme, month by month, with tick boxes all year</li>
          <li>Every product, amount and cost for the whole season</li>
          <li>New reports as the season goes on</li>
        </ul>
      </div>
      <div className="up-card-price">
        <span className="up-price">€{up.price}<small> a year</small></span>
        <span className="up-per">That is about <strong>€{up.perMonth} a month</strong>, or €{up.perWeek} a week</span>
        <UpgradeButton />
        <span className="small muted">Free with an Oramara Turf Biostimulant season subscription.</span>
      </div>
    </div>
  );
}

function TickBox({ m, x }) {
  const list = useContext(ChecklistContext);
  if (!list) return <span className="tr-box" aria-hidden="true" />;
  const key = taskKey(m, x);
  const done = Boolean(list.ticks[key]?.done);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Done: ${x.what}. Click to undo` : `Mark as done: ${x.what}`}
      className={`tr-box tick ${done ? 'done' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        list.onTick(key, !done);
      }}
    >
      {done ? '✓' : ''}
    </button>
  );
}

// How each kind of task looks in the programme
export const TASKS = {
  biostimulant: { label: 'Biostimulant', icon: '🌊', tone: 'gold' },
  overseed: { label: 'Overseed', icon: '🌱', tone: 'green' },
  aerate: { label: 'Aerate', icon: '⋮', tone: 'sea' },
  feed: { label: 'Feed', icon: '◆', tone: 'green' },
  lime: { label: 'Lime', icon: '◇', tone: 'grey' },
  scarify: { label: 'Scarify', icon: '≋', tone: 'sea' },
  topdress: { label: 'Topdress', icon: '▤', tone: 'sea' },
  repair: { label: 'Repair', icon: '✚', tone: 'red' },
  rest: { label: 'Rest', icon: '◌', tone: 'grey' },
  soil_test: { label: 'Soil test', icon: '⚗', tone: 'grey' },
  monitor: { label: 'Check', icon: '◉', tone: 'grey' }
};

// The three levels of care the club can pick from
const LEVELS = [
  { id: 'essential', name: 'Essential', tag: 'Playable on a tight budget' },
  { id: 'standard', name: 'Club standard', tag: 'A strong surface all season' },
  { id: 'elite', name: 'Elite', tag: 'Championship surface' }
];

const GLANCE_ORDER = ['biostimulant', 'feed', 'aerate', 'scarify', 'overseed', 'topdress', 'repair', 'soil_test', 'rest'];

const euro = (v) => `€${Math.round(Number(v) || 0).toLocaleString('en-IE')}`;
const thisMonth = () => new Date().toISOString().slice(0, 7);
const isMonth = (m) => /^\d{4}-\d{2}$/.test(m);
const monthParts = (m) => (isMonth(m.month) ? monthLabel(m.month, true).split(' ') : [m.month, '']);

export default function CareProgramme({ programme: fallback = [], levels = null, costs, level: levelProp, onLevel }) {
  const [openIdx, setOpenIdx] = useState(-1); // the month shown in the detail panel
  const checklist = useContext(ChecklistContext);
  const upsell = useContext(UpsellContext);
  const isDone = (m, x) => Boolean(checklist?.ticks[taskKey(m, x)]?.done);
  // The level can be shared with the rest of the report (costs, club totals); otherwise it is kept here
  const [ownLevel, setOwnLevel] = useState('standard');
  const level = levelProp || ownLevel;
  const setLevel = onLevel || setOwnLevel;
  const programme = (levels && levels[level]) || fallback;
  const productById = new Map((costs?.lines || []).map((l) => [l.id, l]));
  const taskCost = (x) => {
    if (x.cost) return x.cost;
    const per = costs?.unitCosts?.[x.product];
    return per && x.qty ? Math.round(per * x.qty) : null;
  };
  const monthCost = (m) => m.actions.reduce((s, x) => s + (taskCost(x) || 0), 0);
  const total = programme.reduce((sum, m) => sum + monthCost(m), 0);
  const glanceRows = GLANCE_ORDER.filter((type) => programme.some((m) => m.actions.some((x) => x.type === type)));
  const now = thisMonth();

  if (!programme.length) return null;

  // Totals for each level, for the switch
  const levelStats = levels
    ? LEVELS.filter((l) => levels[l.id]?.length).map((l) => {
        const prog = levels[l.id];
        const spend = prog.reduce((sum, m) => sum + monthCost(m), 0);
        const apps = prog.reduce((n, m) => n + m.actions.filter((x) => x.type === 'biostimulant').length, 0);
        const jobs = prog.reduce((n, m) => n + m.actions.length, 0);
        return { ...l, spend, apps, jobs };
      })
    : [];
  const levelIdx = Math.max(0, levelStats.findIndex((l) => l.id === level));
  const standardSpend = levelStats.find((l) => l.id === 'standard')?.spend || 0;

  // Arrow keys move the switch, like a slider
  const onLevelKey = (e) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = levelStats[Math.min(levelStats.length - 1, Math.max(0, levelIdx + step))];
    setLevel(next.id);
    e.currentTarget.parentElement.querySelectorAll('button')[levelStats.indexOf(next)]?.focus();
  };

  return (
    <div className="cp">
      {levelStats.length > 1 && (
        <div className="cp-levels">
          <div className="cp-levels-head">
            <span className="cp-levels-title">Level of care</span>
            <span className="small muted no-print">Season cost of products and contractor work</span>
            <span className="print-only small">Plan shown: {levelStats[levelIdx].name}</span>
          </div>
          <div className="cp-level-track no-print" role="radiogroup" aria-label="Level of care" style={{ '--count': levelStats.length, '--idx': levelIdx }}>
            <span className="cp-level-thumb" aria-hidden="true" />
            {levelStats.map((l) => {
              return (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  aria-checked={l.id === level}
                  tabIndex={l.id === level ? 0 : -1}
                  className={`cp-level ${l.id === level ? 'active' : ''} ${l.id}`}
                  onClick={() => setLevel(l.id)}
                  onKeyDown={onLevelKey}
                >
                  <span className="cp-level-row">
                    <span className="cp-level-name">
                      {l.name}
                      {l.id === 'standard' && <em title="Recommended">Recommended</em>}
                    </span>
                    <strong className="cp-level-price">{euro(l.spend)}</strong>
                  </span>
                  <span className="cp-level-row cp-level-sub">
                    <span>{l.tag}</span>
                    <span className="cp-level-meta">
                      {l.apps} sprays
                      {l.id !== 'standard' && standardSpend > 0 && (
                        <b className={l.spend - standardSpend > 0 ? 'up' : 'down'}>
                          {l.spend - standardSpend > 0 ? '+' : '−'}{euro(Math.abs(l.spend - standardSpend))}
                        </b>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Season at a glance: which job falls in which month. Click a month to open it. */}
      <div className="tr-glance">
        <table>
          <thead>
            <tr>
              <th />
              {programme.map((m, i) => (
                <th key={m.month} className={`${m.busy ? 'busy' : ''} ${m.renovation ? 'reno' : ''} ${m.month === now ? 'now' : ''}`}>
                  <button type="button" className="cp-glance-month" onClick={() => setOpenIdx(i)} title="Open this month">
                    {monthParts(m)[0].slice(0, 3)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {glanceRows.map((type) => (
              <tr key={type}>
                <th><span className={`tr-task ${TASKS[type].tone}`}><i>{TASKS[type].icon}</i>{TASKS[type].label}</span></th>
                {programme.map((m, i) => {
                  const n = m.actions.filter((x) => x.type === type).length;
                  return (
                    <td key={m.month} className={`${m.busy ? 'busy' : ''} ${m.renovation ? 'reno' : ''}`} onClick={() => setOpenIdx(i)}>
                      {n > 0 && <span className={`tr-dot ${TASKS[type].tone}`}>{n > 1 ? n : ''}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="tr-glance-key small muted">
          <span><i className="busy" />Busy playing months</span>
          <span><i className="reno" />Renovation month</span>
          <span className="no-print">Click a month to open it</span>
        </div>
      </div>

      <p className="cp-bar small muted no-print">
        {programme.length} months · {euro(total)} in products and contractor work
      </p>

      {/* One card per month, all the same size */}
      <div className="cp-grid">
        {programme.map((m, i) => {
          const [name, year] = monthParts(m);
          const cost = monthCost(m);
          return (
            <article
              key={m.month}
              className={`cp-card ${m.busy ? 'busy' : ''} ${m.renovation ? 'reno' : ''} ${m.month === now ? 'now' : ''}`}
            >
              <header className="cp-head">
                <div className="cp-month">
                  <strong>{name}</strong>
                  {year && <span>{year}</span>}
                </div>
                <div className="cp-cost">{cost > 0 ? euro(cost) : <span className="muted">No spend</span>}</div>
              </header>
              <div className="cp-focus">
                {m.focus}
                {checklist && m.actions.length > 0 && (
                  <span className={`tr-chip ${m.actions.every((x) => isDone(m, x)) ? 'green' : ''}`}>
                    {m.actions.filter((x) => isDone(m, x)).length} of {m.actions.length} done
                  </span>
                )}
                {m.month === now && <span className="tr-chip green">This month</span>}
                {m.renovation && <span className="tr-chip gold">Renovation</span>}
                {m.busy && <span className="tr-chip">Busy</span>}
              </div>

              <ul className="cp-tasks">
                {m.actions.map((x, j) => {
                  const t = TASKS[x.type] || TASKS.monitor;
                  return (
                    <li key={j} className={isDone(m, x) ? 'done' : ''}>
                      <TickBox m={m} x={x} />
                      <span className={`cp-icon ${t.tone}`} title={t.label}>{t.icon}</span>
                      <span className="cp-what">{x.what}</span>
                      {x.amount && <span className="cp-amount">{x.amount}</span>}
                    </li>
                  );
                })}
              </ul>

              {m.note && (
                <p className="cp-note">
                  {/* the inner span is clamped, so the box padding never shows half a line */}
                  <span className="cp-note-text"><strong>For this pitch:</strong> {m.note}</span>
                </p>
              )}

              <button type="button" className="cp-more no-print" onClick={() => setOpenIdx(i)}>
                More detail <span aria-hidden="true">→</span>
              </button>

              {/* Printed only: the full month, since the panel does not print */}
              <div className="cp-print-detail print-only">
                <MonthDetail m={m} productById={productById} taskCost={taskCost} />
              </div>
            </article>
          );
        })}

      </div>

      {/* The months after the free window, locked, in one slim row */}
      {upsell?.lockedMonths?.length > 0 && (
        <div className="cp-locked-row">
          <div className="cp-locked-head">
            <span className="cp-lock" aria-hidden="true">🔒</span>
            <span>
              <strong>{upsell.lockedMonths.length} more months</strong> of care in the full year
            </span>
            <UpgradeButton label="Unlock" small />
          </div>
          <div className="cp-locked-tiles">
            {upsell.lockedMonths.map((ym) => (
              <span key={ym} className="cp-locked-tile" title={`${monthName(ym)} ${monthYear(ym)} is in the full year`}>
                <strong>{monthName(ym).slice(0, 3)}</strong>
                <small>{monthYear(ym)}</small>
                <i aria-hidden="true" /><i aria-hidden="true" />
              </span>
            ))}
          </div>
        </div>
      )}

      {upsell?.lockedMonths?.length > 0 && <UpsellCard />}

      <div className="cp-total">
        <span>
          <strong>{upsell?.lockedMonths?.length ? `Total for these ${programme.length} months` : 'Programme total'}</strong> <span className="muted small">products and contractor work, before labour by the club</span>
        </span>
        <strong>{euro(total)}</strong>
      </div>

      {openIdx >= 0 && (
        <MonthPanel
          programme={programme}
          index={openIdx}
          onIndex={setOpenIdx}
          onClose={() => setOpenIdx(-1)}
          monthCost={monthCost}
          productById={productById}
          taskCost={taskCost}
          now={now}
        />
      )}
    </div>
  );
}

// How to do each job, with amounts, products and costs
function MonthDetail({ m, productById, taskCost }) {
  return (
    <>
      {(m.mowing || m.conditions) && (
        <div className="cp-meta small">
          {m.mowing && <span>✂ Mow: {m.mowing}</span>}
          {m.conditions && <span>☁ {m.conditions}</span>}
        </div>
      )}
      <div className="cp-jobs">
        {m.actions.map((x, i) => {
          const t = TASKS[x.type] || TASKS.monitor;
          const p = x.product ? productById.get(x.product) : null;
          const cost = taskCost(x);
          return (
            <div key={i} className="cp-job">
              <div className="cp-job-head">
                <span className={`tr-task ${t.tone}`}><i>{t.icon}</i>{t.label}</span>
                {cost ? <span className="cp-job-cost">{euro(cost)}</span> : null}
              </div>
              <strong className="tr-what">{x.what}</strong>
              {x.how && <p className="tr-how small">{x.how}</p>}
              {(x.amount || p) && (
                <p className="small cp-product">
                  {x.amount && <span>{x.amount}</span>}
                  {p && (
                    <span className={p.ours ? 'tr-ours' : 'muted'}>
                      {p.link ? <a href={p.link} target="_blank" rel="noreferrer">{p.name}</a> : p.name}
                    </span>
                  )}
                </p>
              )}
              {x.why && <p className="muted small">Why: {x.why}</p>}
            </div>
          );
        })}
      </div>
    </>
  );
}

// The month opened in a panel over the page. Esc or the backdrop closes it, the arrow keys or the
// month strip at the top move between months.
function MonthPanel({ programme, index, onIndex, onClose, monthCost, productById, taskCost, now }) {
  const m = programme[index];
  const [name, year] = monthParts(m);
  const cost = monthCost(m);
  const closeRef = useRef(null);
  const bodyRef = useRef(null);
  const prev = index > 0 ? index - 1 : -1;
  const next = index < programme.length - 1 ? index + 1 : -1;
  const tone = m.renovation ? 'reno' : m.busy ? 'busy' : 'quiet';
  const costed = m.actions.map((x) => ({ x, cost: taskCost(x) })).filter((c) => c.cost);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && prev >= 0) onIndex(prev);
      if (e.key === 'ArrowRight' && next >= 0) onIndex(next);
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // the page behind stays still
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [prev, next, onClose, onIndex]);

  // New month: back to the top, focus on close so Esc and Tab work straight away
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    closeRef.current?.focus({ preventScroll: true });
  }, [index]);

  return createPortal(
    <div className="cp-backdrop no-print" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`cp-panel ${tone}`} role="dialog" aria-modal="true" aria-label={`${name} ${year} care plan`}>
        <header className="cp-panel-head">
          <div className="cp-panel-top">
            <nav className="cp-strip" aria-label="Months">
              {programme.map((pm, i) => (
                <button
                  key={pm.month}
                  type="button"
                  className={`cp-strip-dot ${i === index ? 'active' : ''} ${pm.renovation ? 'reno' : pm.busy ? 'busy' : ''} ${pm.month === now ? 'now' : ''}`}
                  onClick={() => onIndex(i)}
                  aria-current={i === index ? 'true' : undefined}
                  title={monthParts(pm).join(' ')}
                >
                  {monthParts(pm)[0].slice(0, 1)}
                </button>
              ))}
            </nav>
            <button ref={closeRef} type="button" className="cp-close" onClick={onClose} aria-label="Close">×</button>
          </div>

          <div className="cp-panel-title">
            <div>
              <h3 className="cp-panel-month">
                {name} <span>{year}</span>
              </h3>
              <div className="cp-focus">
                {m.focus}
                {m.month === now && <span className="tr-chip green">This month</span>}
                {m.renovation && <span className="tr-chip gold">Renovation</span>}
                {m.busy && <span className="tr-chip">Busy</span>}
              </div>
            </div>
            <div className="cp-panel-cost">
              <strong>{cost > 0 ? euro(cost) : 'No spend'}</strong>
              <small>{m.actions.length} job{m.actions.length === 1 ? '' : 's'} this month</small>
            </div>
          </div>

          {(m.mowing || m.conditions) && (
            <div className="cp-facts">
              {m.mowing && <span><i aria-hidden="true">✂</i><b>Mowing</b>{m.mowing}</span>}
              {m.conditions && <span><i aria-hidden="true">☁</i><b>Conditions</b>{m.conditions}</span>}
            </div>
          )}
        </header>

        <div className="cp-panel-body" ref={bodyRef}>
          {m.note && (
            <div className="cp-callout">
              <span className="cp-callout-icon" aria-hidden="true">📍</span>
              <div>
                <b>For this pitch</b>
                <p>{m.note}</p>
              </div>
            </div>
          )}

          <ol className="cp-steps">
            {m.actions.map((x, i) => {
              const t = TASKS[x.type] || TASKS.monitor;
              const p = x.product ? productById.get(x.product) : null;
              const c = taskCost(x);
              return (
                <li key={i} className="cp-step">
                  <span className={`cp-step-icon ${t.tone}`} aria-hidden="true">{t.icon}</span>
                  <div className="cp-step-body">
                    <div className="cp-step-top">
                      <span className="cp-step-type">
                        <TickBox m={m} x={x} /> {t.label}
                      </span>
                      {c ? <span className="cp-step-cost">{euro(c)}</span> : null}
                    </div>
                    <h4>{x.what}</h4>
                    {x.how && <p className="cp-step-how">{x.how}</p>}
                    {(x.amount || p) && (
                      <div className="cp-step-meta">
                        {x.amount && <span className="cp-pill">{x.amount}</span>}
                        {p && (p.link ? (
                          <a className={`cp-pill link ${p.ours ? 'ours' : ''}`} href={p.link} target="_blank" rel="noreferrer">
                            {p.name} <span aria-hidden="true">↗</span>
                          </a>
                        ) : (
                          <span className={`cp-pill ${p.ours ? 'ours' : ''}`}>{p.name}</span>
                        ))}
                      </div>
                    )}
                    {x.why && <p className="cp-step-why"><b>Why</b> {x.why}</p>}
                  </div>
                </li>
              );
            })}
          </ol>

          {costed.length > 0 && (
            <div className="cp-breakdown">
              <b>Spend this month</b>
              {costed.map(({ x, cost: c }, i) => (
                <div key={i}><span>{x.what}</span><span>{euro(c)}</span></div>
              ))}
              <div className="cp-breakdown-total"><span>Total</span><span>{euro(cost)}</span></div>
            </div>
          )}
        </div>

        <footer className="cp-panel-foot">
          <button type="button" className="cp-nav" disabled={prev < 0} onClick={() => onIndex(prev)}>
            <span aria-hidden="true">←</span>
            <span><small>Previous</small>{prev >= 0 ? monthParts(programme[prev])[0] : ''}</span>
          </button>
          <span className="cp-keys small muted">Use ← → to move between months · Esc to close</span>
          <button type="button" className="cp-nav right" disabled={next < 0} onClick={() => onIndex(next)}>
            <span><small>Next</small>{next >= 0 ? monthParts(programme[next])[0] : ''}</span>
            <span aria-hidden="true">→</span>
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}