// oramara/frontend/src/pages/Pitches.jsx
import { useState } from 'react';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import Wave from '../components/Wave.jsx';
import PitchMap from '../components/PitchMap.jsx';
import EnquiryForm from '../components/EnquiryForm.jsx';
import { BRAND, PRICING, TECH } from '../config/brand.js';
import { FORMATS, USES, doseFor } from '../config/products.js';
import { HOW_IT_WORKS, PITCH_DEMOS, REPORT_CONTENTS } from '../config/pitchDemo.js';
import './pitches.css';

const WHITE = '#ffffff';
const MIST = '#eef4f3';
const CELTIC = '#0d3429';
const ATLANTIC = '#0b2f33';

const pouch = FORMATS.find((f) => f.id === 'pouch');

export default function Pitches() {
  const [sportId, setSportId] = useState('gaa');
  const demo = PITCH_DEMOS.find((d) => d.id === sportId);
  const use = USES.find((u) => u.id === sportId);
  const dose = doseFor({ areaHa: use.areaHa, format: pouch });

  return (
    <>
      <Header />

      <section className="pitch-hero">
        <div className="container">
          <p className="eyebrow eyebrow-light">{TECH.name}<small>{TECH.byline}</small></p>
          <h1>See your pitch from above.</h1>
          <p className="lead lead-light">
            A health map of your whole surface, the problem areas marked, and a simple plan for your grounds team.
            Your first report is free.
          </p>

          <div className="sport-tabs" role="tablist">
            {PITCH_DEMOS.map((d) => (
              <button
                key={d.id}
                role="tab"
                aria-selected={d.id === sportId}
                className={`sport-tab ${d.id === sportId ? 'active' : ''}`}
                onClick={() => setSportId(d.id)}
              >
                {d.name}
              </button>
            ))}
          </div>

          <div className="demo-grid">
            <div className="demo-map">
              <PitchMap sport={demo.id} zones={demo.zones} />
              <p className="demo-note">Example report for a {demo.title}. Illustrative data.</p>
            </div>

            <aside className="card demo-panel">
              <p className="demo-label">Health score</p>
              <p className="demo-score">{demo.score}<span>/ 100</span></p>
              <div className="bar">
                <span style={{ width: `${demo.healthy}%` }} />
                <span style={{ width: `${demo.moderate}%` }} />
                <span style={{ width: `${demo.stressed}%` }} />
              </div>
              <div className="legend">
                <span><i style={{ background: 'var(--green)' }} />Healthy {demo.healthy}%</span>
                <span><i style={{ background: '#d6aa32' }} />Moderate {demo.moderate}%</span>
                <span><i style={{ background: 'var(--red)' }} />Stressed {demo.stressed}%</span>
              </div>
              <hr />
              <p className="demo-label">Recommended dose</p>
              <p className="demo-dose">
                <strong>{dose.units}</strong> Dose Pouches per spray
              </p>
              <p className="muted small">In about {dose.waterLitres.toLocaleString()} L of water, monthly March to October.</p>
            </aside>
          </div>
        </div>
      </section>
      <Wave from={CELTIC} to={WHITE} />

      <section className="section">
        <div className="container">
          <p className="eyebrow">Fadhbanna<small>Problem zones</small></p>
          <h2>What the report tells you</h2>
          <div className="zone-list">
            {demo.zones.map((z) => (
              <div key={z.letter} className="card zone">
                <span className="zone-letter">{z.letter}</span>
                <div>
                  <h3>{z.label}</h3>
                  <p className="muted">{z.likely}</p>
                  <p className="zone-action"><strong>Action:</strong> {z.action}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="fine-print">
            Reports show where to look and what usually helps. They are a guide for your grounds team, not a diagnosis.
          </p>
        </div>
      </section>

      <Wave from={WHITE} to={MIST} />
      <section className="section alt">
        <div className="container">
          <p className="eyebrow">Conas a Oibríonn Sé<small>How it works</small></p>
          <h2>From satellite to season plan</h2>
          <div className="grid-4">
            {HOW_IT_WORKS.map((s, i) => (
              <div key={s.title} className="card step-card">
                <span className="step-num">{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
          <div className="card report-contents">
            <h3>Every report includes</h3>
            <ul>
              {REPORT_CONTENTS.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <Wave from={MIST} to={WHITE} flip />

      <section className="section">
        <div className="container">
          <p className="eyebrow">Roghanna<small>Options</small></p>
          <h2>Three ways to get started</h2>
          <div className="grid-3">
            <div className="card option featured">
              <span className="badge">Free</span>
              <h3>Free first report</h3>
              <p className="option-price">€0</p>
              <p className="muted">One full health report for your pitch, no strings attached.</p>
              <a href="#request" className="btn">Request my free report</a>
            </div>
            <div className="card option">
              <h3>{BRAND.product}</h3>
              <p className="option-price">{dose.units} pouches</p>
              <p className="muted">Per application for a {demo.title}. Buy as you go or on a season subscription.</p>
              <a href="/#formats" className="btn btn-ghost">See the formats</a>
            </div>
            <div className="card option">
              <h3>Analysis subscription</h3>
              <p className="option-price">€{PRICING.reportsTwiceYearly}<span> / year</span></p>
              <p className="muted">
                Spring and autumn reports. Or monthly reports from March to October for €{PRICING.reportsMonthly} a season.
                Monthly reports are included free with an {BRAND.product} subscription.
              </p>
              <a href="#request" className="btn btn-ghost">Ask about reports</a>
            </div>
          </div>
        </div>
      </section>

      <Wave from={WHITE} to={MIST} />
      <section id="request" className="section alt">
        <div className="container narrow">
          <p className="eyebrow">Teagmháil<small>Request</small></p>
          <h2>Request your free {TECH.name} report</h2>
          <p className="section-lead">Tell us where your pitch is. We will send your report and a simple plan within a week.</p>
          <EnquiryForm key={sportId} defaultType={sportId} defaultInterest={`Free ${TECH.name} report`} />
        </div>
      </section>
      <Wave from={MIST} to={ATLANTIC} flip />

      <Footer />
    </>
  );
}