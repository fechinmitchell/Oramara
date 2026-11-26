// oramara/frontend/src/components/PitchMap.jsx
// Illustrated pitch with a health overlay. Works for gaa, soccer, rugby and golf.

const LINE = { stroke: '#ffffff', strokeOpacity: 0.85, strokeWidth: 2, fill: 'none' };

export default function PitchMap({ sport, zones }) {
  return (
    <svg className="pitch-map" viewBox="0 0 600 400" role="img" aria-label={`Example health map of a ${sport} surface`}>
      <defs>
        <radialGradient id="stressHot" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c4392f" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#d6aa32" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#d6aa32" stopOpacity="0" />
        </radialGradient>
        <clipPath id="fieldClip">
          <rect x="0" y="0" width="600" height="400" rx="14" />
        </clipPath>
      </defs>

      <g clipPath="url(#fieldClip)">
        <rect width="600" height="400" fill={sport === 'golf' ? '#3f8a4c' : '#2f8f4e'} />
        {sport !== 'golf' &&
          Array.from({ length: 12 }).map((_, i) => (
            <rect key={i} x={i * 50} y="0" width="25" height="400" fill="#ffffff" opacity="0.045" />
          ))}

        {sport === 'gaa' && <GaaLines />}
        {sport === 'soccer' && <SoccerLines />}
        {sport === 'rugby' && <RugbyLines />}
        {sport === 'golf' && <GolfGreen />}

        {zones.map((z) => (
          <ellipse key={z.letter} cx={z.x} cy={z.y} rx={z.r} ry={z.r * 0.8} fill="url(#stressHot)" />
        ))}
      </g>

      {zones.map((z) => (
        <g key={`m${z.letter}`}>
          <circle cx={z.x} cy={z.y} r="15" fill="#ffffff" stroke="#0d1f22" strokeWidth="2" />
          <text x={z.x} y={z.y + 5} textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="14" fill="#0d1f22">
            {z.letter}
          </text>
        </g>
      ))}
    </svg>
  );
}

function GaaLines() {
  // 145 m long pitch drawn 580 px wide: 4 px per metre
  const lines = [13, 20, 45, 100, 125, 132];
  return (
    <g {...LINE}>
      <rect x="10" y="20" width="580" height="360" />
      <line x1="300" y1="20" x2="300" y2="380" />
      {lines.map((m) => (
        <line key={m} x1={10 + m * 4} y1="20" x2={10 + m * 4} y2="380" strokeDasharray={m === 45 || m === 100 ? '0' : '6 6'} />
      ))}
      <rect x="10" y="170" width="18" height="60" />
      <rect x="10" y="150" width="52" height="100" />
      <rect x="572" y="170" width="18" height="60" />
      <rect x="538" y="150" width="52" height="100" />
      <path d="M4 186 V214 M16 186 V214 M4 200 H16" strokeWidth="3" />
      <path d="M584 186 V214 M596 186 V214 M584 200 H596" strokeWidth="3" />
      <circle cx="300" cy="200" r="3" fill="#fff" />
    </g>
  );
}

function SoccerLines() {
  return (
    <g {...LINE}>
      <rect x="10" y="20" width="580" height="360" />
      <line x1="300" y1="20" x2="300" y2="380" />
      <circle cx="300" cy="200" r="50" />
      <rect x="10" y="110" width="90" height="180" />
      <rect x="10" y="160" width="32" height="80" />
      <rect x="500" y="110" width="90" height="180" />
      <rect x="558" y="160" width="32" height="80" />
      <path d="M100 168 A 46 46 0 0 1 100 232" />
      <path d="M500 168 A 46 46 0 0 0 500 232" />
      <rect x="2" y="182" width="8" height="36" strokeWidth="3" />
      <rect x="590" y="182" width="8" height="36" strokeWidth="3" />
    </g>
  );
}

function RugbyLines() {
  return (
    <g {...LINE}>
      <rect x="10" y="20" width="580" height="360" />
      <line x1="60" y1="20" x2="60" y2="380" />
      <line x1="540" y1="20" x2="540" y2="380" />
      <line x1="170" y1="20" x2="170" y2="380" />
      <line x1="430" y1="20" x2="430" y2="380" />
      <line x1="300" y1="20" x2="300" y2="380" />
      <line x1="250" y1="20" x2="250" y2="380" strokeDasharray="6 6" />
      <line x1="350" y1="20" x2="350" y2="380" strokeDasharray="6 6" />
      <path d="M60 186 V214 M54 186 V200 H66 V186" strokeWidth="3" />
      <path d="M540 186 V214 M534 186 V200 H546 V186" strokeWidth="3" />
    </g>
  );
}

function GolfGreen() {
  return (
    <g>
      <rect width="600" height="400" fill="#3f8a4c" />
      <path d="M150 210 C 140 120, 260 70, 360 85 C 470 100, 500 190, 450 260 C 400 330, 250 340, 190 300 C 160 280, 152 250, 150 210 Z" fill="#2c7a43" />
      <path d="M165 210 C 158 132, 262 88, 358 100 C 455 114, 482 192, 438 252 C 392 315, 258 322, 202 288 C 176 272, 167 246, 165 210 Z" fill="#33924f" />
      <path d="M165 210 C 158 132, 262 88, 358 100 C 455 114, 482 192, 438 252 C 392 315, 258 322, 202 288 C 176 272, 167 246, 165 210 Z" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="2" />
      <line x1="330" y1="200" x2="330" y2="130" stroke="#f6efe0" strokeWidth="3" />
      <path d="M330 130 L 362 142 L 330 154 Z" fill="#c9a24a" />
      <ellipse cx="330" cy="201" rx="6" ry="3" fill="#0d1f22" opacity="0.6" />
      <ellipse cx="520" cy="320" rx="60" ry="30" fill="#e4d6a8" opacity="0.9" />
    </g>
  );
}