// oramara/frontend/src/components/NdviChart.jsx
// Monthly plant vigour (NDVI) line chart. Cloudy months show as gaps on the axis.

const MIN = 0.3;
const MAX = 0.95;
const BANDS = [
  { from: 0.75, to: MAX, colour: 'rgba(47, 143, 78, 0.10)', label: 'Strong' },
  { from: 0.6, to: 0.75, colour: 'rgba(214, 170, 50, 0.10)', label: 'Moderate' },
  { from: MIN, to: 0.6, colour: 'rgba(196, 57, 47, 0.08)', label: 'Thin' }
];

export function monthLabel(month, long = false) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IE', {
    month: long ? 'long' : 'short',
    year: long ? 'numeric' : '2-digit',
    timeZone: 'UTC'
  });
}

export default function NdviChart({ months, selected, onSelect, width = 320, height = 150 }) {
  if (!months?.length) return null;

  const pad = { left: 30, right: 8, top: 8, bottom: 22 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const x = (i) => pad.left + (months.length === 1 ? w / 2 : (i / (months.length - 1)) * w);
  const y = (v) => pad.top + (1 - (Math.min(MAX, Math.max(MIN, v)) - MIN) / (MAX - MIN)) * h;

  const points = months.map((m, i) => ({ ...m, i })).filter((m) => m.clear);
  const path = points.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.ndvi).toFixed(1)}`).join(' ');
  const labelEvery = Math.max(1, Math.ceil(months.length / 6));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="ndvi-chart" role="img" aria-label="Plant vigour by month">
      {BANDS.map((b) => (
        <rect key={b.label} x={pad.left} width={w} y={y(b.to)} height={y(b.from) - y(b.to)} fill={b.colour} />
      ))}
      {[0.4, 0.6, 0.8].map((v) => (
        <g key={v}>
          <line x1={pad.left} x2={pad.left + w} y1={y(v)} y2={y(v)} stroke="#dde6e4" strokeWidth="1" />
          <text x={pad.left - 5} y={y(v) + 3} textAnchor="end" className="ndvi-axis">{v.toFixed(1)}</text>
        </g>
      ))}

      {months.map((m, i) =>
        i % labelEvery === 0 ? (
          <text key={m.month} x={x(i)} y={height - 6} textAnchor="middle" className="ndvi-axis">{monthLabel(m.month)}</text>
        ) : null
      )}
      {months.map((m, i) =>
        !m.clear ? <circle key={`c${m.month}`} cx={x(i)} cy={pad.top + h} r="2" fill="#b9c4c2" /> : null
      )}

      <path d={path} fill="none" stroke="#12403f" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p) => (
        <circle
          key={p.month}
          cx={x(p.i)}
          cy={y(p.ndvi)}
          r={selected === p.month ? 5.5 : 3.5}
          fill={selected === p.month ? '#d9b25a' : '#12403f'}
          stroke="#fff"
          strokeWidth="1.5"
          style={{ cursor: onSelect ? 'pointer' : 'default' }}
          onClick={() => onSelect?.(p.month)}
        >
          <title>{`${monthLabel(p.month, true)}: ${p.ndvi.toFixed(2)}`}</title>
        </circle>
      ))}
    </svg>
  );
}