// oramara/frontend/src/components/MonthExplorer.jsx
// The pitch month by month: pick 1, 3, 6 or 12 months, then step through each month with its
// Sentinel 2 vigour map laid over the aerial photo, squared up, with the numbers and notes for that month.
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { monthLabel } from './NdviChart.jsx';
import { UpsellContext, UpgradeButton } from './CareProgramme.jsx';
import { SquaredImage } from './SquaredImage.jsx';

const RANGES = [1, 3, 6, 12];

const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

// Lay the month map over the photo, using the corners of each image
function compose(photoSrc, photoBounds, monthSrc, monthBounds, outline) {
  return new Promise((resolve, reject) => {
    const photo = new Image();
    const month = new Image();
    let loaded = 0;
    const done = () => {
      if (++loaded < 2) return;
      const W = photo.naturalWidth;
      const H = photo.naturalHeight;
      const [[ps, pw], [pn, pe]] = photoBounds;
      const X = (lon) => ((lon - pw) / (pe - pw)) * W;
      const Y = (lat) => ((mercY(pn) - mercY(lat)) / (mercY(pn) - mercY(ps))) * H;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(photo, 0, 0);
      // Soften the photo a little so the colours read clearly
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(0, 0, W, H);
      if (monthSrc) {
        const [[ms, mw], [mn, me]] = monthBounds;
        ctx.globalAlpha = 0.88;
        ctx.drawImage(month, X(mw), Y(mn), X(me) - X(mw), Y(ms) - Y(mn));
        ctx.globalAlpha = 1;
      }
      if (outline?.length > 2) {
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = Math.max(2, W / 400);
        ctx.beginPath();
        outline.forEach(([lat, lon], i) => (i ? ctx.lineTo(X(lon), Y(lat)) : ctx.moveTo(X(lon), Y(lat))));
        ctx.closePath();
        ctx.stroke();
      }
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    photo.onload = done;
    month.onload = done;
    photo.onerror = reject;
    month.onerror = () => done();
    photo.src = photoSrc;
    if (monthSrc) month.src = monthSrc;
    else done();
  });
}

function verdict(ndvi) {
  if (ndvi === null || ndvi === undefined) return { word: 'No clear view', tone: 'grey' };
  if (ndvi >= 0.75) return { word: 'Strong', tone: 'green' };
  if (ndvi >= 0.6) return { word: 'Moderate', tone: 'gold' };
  return { word: 'Weak', tone: 'red' };
}

export default function MonthExplorer({ months = [], notes, photo, photoBounds, outline, loadMonth, onView, hint }) {
  const upsell = useContext(UpsellContext);
  const available = months.length;
  const freeRange = upsell?.months || 12;
  const [range, setRange] = useState(() => RANGES.filter((r) => r <= Math.max(1, available)).pop() || 1);
  const shown = months.slice(-range);
  const [pick, setPick] = useState(() => {
    const clear = months.filter((m) => m.clear);
    return (clear[clear.length - 1] || months[months.length - 1])?.month || null;
  });
  const [views, setViews] = useState({}); // month -> composed image, or 'none' when there is no map
  const [busy, setBusy] = useState(false);
  const seen = useRef(new Set());
  const lockedRange = range > freeRange;

  // Keep the picked month inside the range on show
  useEffect(() => {
    if (!shown.some((m) => m.month === pick) && shown.length) {
      const clear = shown.filter((m) => m.clear);
      setPick((clear[clear.length - 1] || shown[shown.length - 1]).month);
    }
  }, [range]);

  useEffect(() => {
    if (!pick || !photo || !photoBounds || views[pick]) return;
    const m = months.find((x) => x.month === pick);
    let cancelled = false;
    setBusy(true);
    (async () => {
      let data = null;
      if (m?.clear && loadMonth) {
        try {
          data = await loadMonth(pick);
        } catch {
          data = null;
        }
      }
      try {
        const url = await compose(photo, photoBounds, data?.image, data?.bounds, outline);
        if (!cancelled) setViews((v) => ({ ...v, [pick]: { url, map: Boolean(data) } }));
      } catch {
        if (!cancelled) setViews((v) => ({ ...v, [pick]: { url: photo, map: false } }));
      }
      if (!cancelled) setBusy(false);
    })();
    if (!seen.current.has(pick)) {
      seen.current.add(pick);
      onView?.(pick);
    }
    return () => {
      cancelled = true;
    };
  }, [pick]);

  const idx = shown.findIndex((m) => m.month === pick);
  const m = shown[idx];
  const go = (d) => {
    const next = shown[idx + d];
    if (next) setPick(next.month);
  };
  const prevClear = useMemo(() => {
    const all = months.slice(0, months.findIndex((x) => x.month === pick));
    return [...all].reverse().find((x) => x.clear) || null;
  }, [pick, months]);
  const change = m?.clear && prevClear ? m.ndvi - prevClear.ndvi : null;
  const v = verdict(m?.clear ? m.ndvi : null);
  const view = pick ? views[pick] : null;

  if (!available) return null;

  return (
    <div
      className="mx"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') go(-1);
        if (e.key === 'ArrowRight') go(1);
      }}
    >
      <div className="mx-ranges" role="tablist" aria-label="How far back">
        {RANGES.map((r) => {
          const locked = upsell && r > freeRange;
          const missing = !upsell && r > available && r !== RANGES.find((x) => x >= available);
          if (missing) return null;
          return (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={range === r}
              className={`mx-range ${range === r ? 'on' : ''} ${locked ? 'locked' : ''}`}
              onClick={() => setRange(r)}
            >
              {locked && <span aria-hidden="true">🔒 </span>}
              {r === 1 ? '1 month' : r === 12 ? '12 months' : `${r} months`}
            </button>
          );
        })}
      </div>

      {lockedRange ? (
        <div className="mx-locked">
          <span className="cp-lock" aria-hidden="true">🔒</span>
          <div>
            <strong>See all {range} months of your pitch</strong>
            <p className="small muted">
              Your free view covers {freeRange === 1 ? 'the last month' : `the last ${freeRange} months`}. The full year shows every month,
              with the vigour map and notes for each, for €{upsell.price} a year (about €{upsell.perMonth} a month).
            </p>
          </div>
          <UpgradeButton label="Unlock 12 months" small />
        </div>
      ) : (
        <>
          <div className="mx-strip" role="tablist" aria-label="Months">
            {shown.map((x) => {
              const t = verdict(x.clear ? x.ndvi : null).tone;
              return (
                <button
                  key={x.month}
                  type="button"
                  role="tab"
                  aria-selected={x.month === pick}
                  className={`mx-month ${x.month === pick ? 'on' : ''} ${x.clear ? '' : 'cloudy'}`}
                  onClick={() => setPick(x.month)}
                >
                  <strong>{monthLabel(x.month).split(' ')[0]}</strong>
                  <small>{x.month.slice(0, 4)}</small>
                  <span className={`mx-dot ${t}`} aria-hidden="true" />
                  <small>{x.clear ? x.ndvi.toFixed(2) : 'Cloud'}</small>
                </button>
              );
            })}
          </div>

          {m && (
            <div className="mx-view">
              <div className="mx-image">
                <button type="button" className="mx-nav prev" onClick={() => go(-1)} disabled={idx <= 0} aria-label="Month before">‹</button>
                {view ? (
                  <SquaredImage src={view.url} outline={outline} alt={`The pitch in ${monthLabel(m.month, true)}`} />
                ) : (
                  <div className="mx-loading">{busy ? 'Loading the map...' : ''}</div>
                )}
                <button type="button" className="mx-nav next" onClick={() => go(1)} disabled={idx >= shown.length - 1} aria-label="Month after">›</button>
              </div>
              <div className="mx-info">
                <span className="mx-eyebrow">Month {idx + 1} of {shown.length}</span>
                <h4>{monthLabel(m.month, true)}</h4>
                <div className="mx-verdict">
                  <span className={`tr-chip ${v.tone}`}>{v.word}</span>
                  {m.clear && <span className="mx-ndvi">Vigour {m.ndvi.toFixed(2)}</span>}
                  {change !== null && Math.abs(change) >= 0.005 && (
                    <span className={`mx-change ${change > 0 ? 'up' : 'down'}`}>
                      {change > 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)} on {monthLabel(prevClear.month).split(' ')[0]}
                    </span>
                  )}
                </div>
                {m.clear && m.strongPct !== null ? (
                  <>
                    <div className="mx-bar" aria-hidden="true">
                      <i className="green" style={{ width: `${m.strongPct}%` }} />
                      <i className="gold" style={{ width: `${m.moderatePct}%` }} />
                      <i className="red" style={{ width: `${m.thinPct}%` }} />
                    </div>
                    <p className="small mx-split">
                      <span><b className="green" />{m.strongPct}% strong</span>
                      <span><b className="gold" />{m.moderatePct}% moderate</span>
                      <span><b className="red" />{m.thinPct}% thin</span>
                    </p>
                  </>
                ) : (
                  <p className="small muted">Too much cloud this month for a clear view from the satellite.</p>
                )}
                <p className="small">{notes?.get(m.month) || hint?.(m.month)}</p>
                {view && !view.map && m.clear && <p className="small muted">The coloured map is not available for this month; the numbers are.</p>}
                <p className="mx-legend small muted">
                  <span className="mx-scale" aria-hidden="true" /> weak to strong · Sentinel 2, 10 m detail · use ‹ › or the arrow keys
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}