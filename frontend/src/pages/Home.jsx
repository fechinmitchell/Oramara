// oramara/frontend/src/pages/Home.jsx
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import EnquiryForm from '../components/EnquiryForm.jsx';
import DoseCalculator from '../components/DoseCalculator.jsx';
import BeforeAfter from '../components/BeforeAfter.jsx';
import Wave from '../components/Wave.jsx';
import { BRAND, PRICING, TECH } from '../config/brand.js';
import { COMING_SOON, FORMATS, USES, doseFor } from '../config/products.js';
import './home.css';

const WHITE = '#ffffff';
const MIST = '#eef4f3';
const ATLANTIC = '#0b2f33';
const CELTIC = '#0d3429';

const EASY = [
  { icon: 'drop', title: 'Fill', text: 'Half fill your sprayer, knapsack or watering can with water.' },
  { icon: 'down', title: 'Drop in', text: 'Add the right number of pouches, tablets or sections. They dissolve on their own.' },
  { icon: 'check', title: 'Spray', text: 'Top up, mix and spray. No scales, no scoops, no guessing.' }
];

const FACTS = [
  { icon: 'leaf', title: '100% Irish seaweed', text: 'Harvested on the wild Atlantic coast. Nothing added.' },
  { icon: 'scale', title: 'Pre measured doses', text: 'Every pouch, tablet and section matches a set amount of water.' },
  { icon: 'drop', title: 'Dissolves in water', text: 'Works in any sprayer, knapsack or watering can.' }
];

const FAQ = [
  { q: 'What is in it?', a: 'Oramara Turf Biostimulant is seaweed from the Atlantic coast of Ireland, gently processed and dried into a soluble powder. Nothing else.' },
  { q: 'Is it a fertiliser?', a: 'No. Oramara Turf Biostimulant is a natural seaweed biostimulant. Use it alongside your normal feeding programme, not instead of it.' },
  { q: 'Which format should I pick?', a: 'Pouches for tank sprayers, tablets for knapsacks, watering cans and small areas, and the bulk tub for big tanks and large sites.' },
  { q: 'How often should I use it?', a: 'Monthly while grass is growing, usually March to October, plus before big events and after heavy use.' },
  { q: 'Is it safe around people and pets?', a: 'It is a natural seaweed product. Follow the label and keep people off until the spray has dried.' },
  { q: 'Does it treat disease or pests?', a: 'No. It is a biostimulant that supports growth, colour and recovery. It is not a pesticide.' }
];

const pouch = FORMATS.find((f) => f.id === 'pouch');

function Eyebrow({ irish, english }) {
  return (
    <p className="eyebrow">
      {irish}
      <small>{english}</small>
    </p>
  );
}

export default function Home() {
  return (
    <>
      <Header />

      <section className="showcase">
        <div className="container">
          <BeforeAfter
            before="/images/PNG/before-photo.png"
            after="/images/PNG/after-photo.png"
            caption="Our own lawn, summer 2026. Drag the slider to compare before and after."
          />
          <div className="ornament" aria-hidden="true"><span>{BRAND.irish}</span></div>
        </div>
      </section>
      <Wave from={CELTIC} to={WHITE} />

      <section className="intro">
        <div className="container intro-inner">
          <div>
            <Eyebrow irish="Feamainn Éireannach" english="Irish seaweed" />
            <h1>Irish seaweed. Drop it in. Spray. Done.</h1>
            <p className="lead">
              {BRAND.product} is pure Atlantic seaweed in pre measured pouches, tablets and bulk tubs. Every dose is already
              worked out for you, so there is nothing to weigh and nothing to get wrong.
            </p>
            <div className="intro-actions">
              <a href="#formats" className="btn">See the formats</a>
              <a href="#contact" className="btn btn-ghost">Get a free sample</a>
            </div>
          </div>
          <ul className="facts">
            {FACTS.map((f) => (
              <li key={f.title}>
                <Icon name={f.icon} />
                <div>
                  <strong>{f.title}</strong>
                  <span>{f.text}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <Eyebrow irish="Éasca" english="Easy" />
          <h2>As easy as it gets</h2>
          <div className="grid-3">
            {EASY.map((s, i) => (
              <div key={s.title} className="card easy">
                <Icon name={s.icon} />
                <h3>{i + 1}. {s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Wave from={WHITE} to={MIST} />
      <section id="formats" className="section alt">
        <div className="container">
          <Eyebrow irish="Foirmeacha" english="Formats" />
          <h2>Three formats. One simple rule.</h2>
          <p className="section-lead">Match the format to your water tank and the dose is already right.</p>
          <div className="grid-3">
            {FORMATS.map((f) => (
              <div key={f.id} className="card format">
                <FormatArt id={f.id} />
                <h3>{f.name}</h3>
                <p className="format-dose">{f.dose}</p>
                <ul className="spec">
                  <li><span>Size</span>{f.size}</li>
                  <li><span>Covers</span>{f.covers}</li>
                  <li><span>Best for</span>{f.bestFor}</li>
                  <li><span>Pack</span>{f.pack}</li>
                </ul>
                <p className="format-price">€{f.price}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <Wave from={MIST} to={WHITE} flip />

      <section id="dose" className="section">
        <div className="container narrow">
          <Eyebrow irish="Dáileog" english="Dose" />
          <h2>How much do I need?</h2>
          <p className="section-lead">Pick what you are spraying and the format you use.</p>
          <DoseCalculator />
        </div>
      </section>

      <Wave from={WHITE} to={MIST} />
      <section id="uses" className="section alt">
        <div className="container">
          <Eyebrow irish="Úsáidí" english="Uses" />
          <h2>Made for sports turf</h2>
          <p className="section-lead">Every surface already has its dose worked out. One full spray of each, using Dose Pouches:</p>
          <div className="grid-4">
            {USES.map((u) => {
              const d = doseFor({ areaHa: u.areaHa, format: pouch });
              return (
                <div key={u.id} className="card use">
                  <h3>{u.name}</h3>
                  <p className="muted">{u.detail}</p>
                  <p className="use-dose"><strong>{d.units}</strong> pouches</p>
                  <p className="muted small">in about {d.waterLitres.toLocaleString()} L of water</p>
                </div>
              );
            })}
          </div>
          <div className="chips">
            <span className="muted">Coming next:</span>
            {COMING_SOON.map((c) => (
              <span key={c} className="chip">{c}</span>
            ))}
          </div>
        </div>
      </section>
      <Wave from={MIST} to={ATLANTIC} flip />

      <section id="story" className="atlantic">
        <Seaweed className="frond frond-left" />
        <Seaweed className="frond frond-right" />
        <div className="container narrow atlantic-inner">
          <p className="atlantic-irish">{BRAND.irish}</p>
          <p className="atlantic-sub">Gold of the sea</p>
          <h2>An old Irish idea, made simple.</h2>
          <p>
            For centuries farmers along the west coast carried seaweed up from the shore in wicker creels to make poor
            ground rich. On the Aran Islands whole fields were built from layers of seaweed and sand on bare rock.
          </p>
          <p>
            {BRAND.product} takes that same Atlantic seaweed and turns it into a dose you can drop straight into water.
            No hauling, no measuring, just the good of the sea where you need it.
          </p>
        </div>
      </section>
      <Wave from={ATLANTIC} to={WHITE} />

      <section className="section">
        <div className="container report-promo">
          <div>
            <Eyebrow irish="Tuairisc" english="Report" />
            <h2>See the difference from above</h2>
            <p>
              Every customer can get a turf health report: a map of your grass from above showing where it is strong and
              where it is under stress, with a simple plan for each area. A follow up report shows the improvement.
            </p>
            <p className="muted">Your first report is free.</p>
            <a href="#contact" className="btn btn-ghost">Request a free report</a>
          </div>
          <ReportIllustration />
        </div>
      </section>

      <Wave from={WHITE} to={MIST} />
      <section id="pricing" className="section alt">
        <div className="container">
          <Eyebrow irish="Praghsanna" english="Pricing" />
          <h2>Buy it your way</h2>
          <div className="grid-3">
            <div className="card price">
              <h3>As you go</h3>
              <p className="amount">€{Math.min(...FORMATS.map((f) => f.price))}</p>
              <p className="muted">from, per pack</p>
              <ul>
                <li>Pouches, tablets or bulk tubs</li>
                <li>Dose guide in every pack</li>
                <li>No commitment</li>
              </ul>
            </div>
            <div className="card price featured">
              <span className="badge">Best value</span>
              <h3>Season subscription</h3>
              <p className="amount">€{PRICING.subscriptionFrom}</p>
              <p className="muted">from, per month, March to October</p>
              <ul>
                <li>The right amount delivered each month</li>
                <li>Monthly {TECH.name} reports included</li>
                <li>Pause or cancel any time</li>
              </ul>
            </div>
            <div className="card price">
              <h3>{TECH.name} reports</h3>
              <p className="amount">€{PRICING.reportsTwiceYearly}</p>
              <p className="muted">per year</p>
              <ul>
                <li>Spring and autumn reports</li>
                <li>Problem areas and actions</li>
                <li>First report free</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
      <Wave from={MIST} to={WHITE} flip />

      <section className="section">
        <div className="container narrow">
          <Eyebrow irish="Ceisteanna" english="Questions" />
          <h2>Questions</h2>
          {FAQ.map((f) => (
            <details key={f.q} className="faq">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <Wave from={WHITE} to={MIST} />
      <section id="contact" className="section alt">
        <div className="container narrow">
          <Eyebrow irish="Teagmháil" english="Contact" />
          <h2>Get a free sample or {TECH.name} report</h2>
          <p className="section-lead">Tell us a little about where you would use it and we will be in touch within a few days.</p>
          <EnquiryForm />
        </div>
      </section>
      <Wave from={MIST} to={ATLANTIC} flip />

      <Footer />
    </>
  );
}

function Icon({ name }) {
  const paths = {
    drop: <path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z" />,
    down: <path d="M12 4v13M6 11l6 6 6-6M5 20h14" />,
    check: <path d="M4 12l5 5L20 6" />,
    leaf: <path d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15M5 19l7-7" />,
    scale: <path d="M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z" />
  };
  return (
    <span className="icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {paths[name]}
      </svg>
    </span>
  );
}

function Seaweed({ className }) {
  return (
    <svg className={className} viewBox="0 0 120 400" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M60 400 C 50 330, 72 290, 58 230 C 46 180, 70 140, 60 80 C 55 50, 62 25, 66 5" />
        <path d="M58 330 C 40 318, 28 300, 22 280" />
        <path d="M60 300 C 80 292, 94 276, 100 255" />
        <path d="M57 250 C 38 240, 26 222, 20 200" />
        <path d="M60 210 C 80 202, 92 186, 98 165" />
        <path d="M60 160 C 42 150, 32 134, 28 115" />
        <path d="M61 120 C 78 112, 88 98, 92 80" />
        <path d="M62 70 C 48 62, 42 50, 40 36" />
      </g>
    </svg>
  );
}

function FormatArt({ id }) {
  if (id === 'tablet') {
    return (
      <svg className="format-art" viewBox="0 0 200 110" aria-hidden="true">
        <rect width="200" height="110" rx="10" fill="#e3eeec" />
        {[50, 100, 150].map((x, i) => (
          <g key={x}>
            <ellipse cx={x} cy={62 + (i % 2) * 6} rx="26" ry="20" fill={i === 1 ? '#b98f3c' : '#cfa24b'} />
            <ellipse cx={x} cy={58 + (i % 2) * 6} rx="18" ry="12" fill="none" stroke="#fffdf6" strokeOpacity="0.55" />
          </g>
        ))}
      </svg>
    );
  }
  if (id === 'bulk') {
    return (
      <svg className="format-art" viewBox="0 0 200 110" aria-hidden="true">
        <rect width="200" height="110" rx="10" fill="#e3eeec" />
        <rect x="55" y="18" width="90" height="80" rx="10" fill="#12403f" />
        <rect x="50" y="12" width="100" height="14" rx="5" fill="#b8862b" />
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1="62" x2="138" y1={42 + i * 14} y2={42 + i * 14} stroke="#e6c477" strokeOpacity="0.6" strokeDasharray="4 4" />
        ))}
      </svg>
    );
  }
  return (
    <svg className="format-art" viewBox="0 0 200 110" aria-hidden="true">
      <rect width="200" height="110" rx="10" fill="#e3eeec" />
      {[45, 85, 125].map((x, i) => (
        <g key={x} transform={`translate(${x} ${18 + i * 4}) rotate(${(i - 1) * 8})`}>
          <rect width="40" height="58" rx="7" fill="#cfa24b" />
          <rect x="5" y="5" width="30" height="8" rx="3" fill="#fffdf6" opacity="0.55" />
        </g>
      ))}
    </svg>
  );
}

function ReportIllustration() {
  return (
    <svg className="report-art" viewBox="0 0 320 220" role="img" aria-label="Example turf health map">
      <defs>
        <radialGradient id="hot" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#d63a30" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#d6aa32" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#d6aa32" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="320" height="220" rx="14" fill="#2f8f4e" />
      <rect x="0" y="0" width="320" height="220" rx="14" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="3" />
      <line x1="160" y1="0" x2="160" y2="220" stroke="#fff" strokeOpacity="0.5" strokeWidth="2" />
      <ellipse cx="38" cy="110" rx="40" ry="34" fill="url(#hot)" />
      <ellipse cx="282" cy="110" rx="40" ry="34" fill="url(#hot)" />
      <ellipse cx="170" cy="70" rx="40" ry="26" fill="url(#hot)" opacity="0.6" />
      <g transform="translate(200 150)">
        <rect width="104" height="54" rx="10" fill="#fffdf6" />
        <text x="12" y="21" fontFamily="Inter, sans-serif" fontSize="11" fill="#586a6b">Health score</text>
        <text x="12" y="45" fontFamily="Inter, sans-serif" fontSize="22" fontWeight="600" fill="#0d1f22">72</text>
        <text x="44" y="46" fontFamily="Inter, sans-serif" fontSize="11" fill="#586a6b">/ 100</text>
      </g>
    </svg>
  );
}