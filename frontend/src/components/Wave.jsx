// oramara/frontend/src/components/Wave.jsx
// Soft Atlantic wave used to divide sections. "from" is the colour above, "to" the colour below.

export default function Wave({ from = '#ffffff', to = '#eef4f3', flip = false }) {
    return (
      <div className="wave" style={{ background: from }} aria-hidden="true">
        <svg viewBox="0 0 1440 90" preserveAspectRatio="none" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
          <path
            d="M0,52 C180,92 360,12 540,40 C720,68 900,96 1080,62 C1260,28 1350,30 1440,44 L1440,90 L0,90 Z"
            fill={to}
            opacity="0.55"
          />
          <path
            d="M0,64 C200,30 380,88 600,66 C820,44 980,20 1180,52 C1300,72 1380,70 1440,62 L1440,90 L0,90 Z"
            fill={to}
          />
        </svg>
      </div>
    );
  }