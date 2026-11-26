// oramara/frontend/src/pages/Pitches.jsx
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import Wave from '../components/Wave.jsx';
import BeforeAfter from '../components/BeforeAfter.jsx';
import EnquiryForm from '../components/EnquiryForm.jsx';
import { BRAND, PRICING, TECH } from '../config/brand.js';
import { FORMATS, USES, doseFor } from '../config/products.js';
import { HOW_IT_WORKS, REPORT_CONTENTS } from '../config/pitchDemo.js';
import { CLIFDEN_REPORT } from '../config/clifdenReport.js';
import './pitches.css';

const WHITE = '#ffffff';
const MIST = '#eef4f3';
const CELTIC = '#0d3429';
const ATLANTIC = '#0b2f33';

const pouch = FORMATS.find((f) => f.id === 'pouch');

export default function Pitches() {
  const report = CLIFDEN_REPORT;
  const use = USES.find((u) => u.id === 'gaa');
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

          <p className="real-tag">
            Real report: {report.club}, {report.place}
          </p>

          <div className="demo-grid">
            <div className="demo-map pitch-ba" style={{ '--ba-ratio': `${report.width} / ${report.height}` }}>
              <BeforeAfter
                before={report.photo}
                after={report.healthMap}
                beforeLabel="Satellite photo"
                afterLabel="Health map"
              />
              <p className="demo-note">
                Drag to compare. {report.pitch} at {report.club}, from an {report.photoSource} photo taken on{' '}
                {report.photoDate} at about {report.resolutionCm} cm per pixel. North is on the left.
              </p>
            </div>

            <aside className="card demo-panel">
              <p className="demo-label">Health score</p>
              <p className="demo-score">{report.score}<span>/ 100</span></p>
              <div className="bar">
                <span style={{ width: `${report.healthy}%` }} />
                <span style={{ width: `${report.moderate}%` }} />
                <span style={{ width: `${report.stressed}%` }} />
              </div>
              <div className="legend">
                <span><i style={{ background: 'var(--green)' }} />Healthy {report.healthy}%</span>
                <span><i style={{ background: '#d6aa32' }} />Moderate {report.moderate}%</span>
                <span><i style={{ background: 'var(--red)' }} />Stressed {report.stressed}%</span>
              </div>
              <p className="muted small">
                {report.areaM2.toLocaleString()} m² of playing surface measured. A strong pitch overall, with
                two spots worth a look.
              </p>
              <hr />
              <p className="demo-label">Recommended dose</p>
              <p className="demo-dose">
                <strong>{dose.units}</strong> Dose Pouches per spray
              </p>
              <p className="muted small">
                For the pitch and its surrounds, in about {dose.waterLitres.toLocaleString()} L of water, monthly
                March to October.
              </p>
            </aside>
          </div>
        </div>
      </section>
      <Wave from={CELTIC} to={WHITE} />

      <section className="section">
        <div className="container">
          <p className="eyebrow">Fadhbanna<small>Problem zones</small></p>
          <h2>What the report found at {report.club}</h2>
          <div className="zone-list">
            {report.zones.map((z) => (
              <div key={z.letter} className="card zone">
                <span className="zone-letter">{z.letter}</span>
                <div>
                  <h3>{z.label}</h3>
                  <p className="zone-share">About {z.share}% of the turf in this part looks weaker than the rest of the pitch</p>
                  <p className="muted">{z.likely}</p>
                  <p className="zone-action"><strong>Action:</strong> {z.action}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="fine-print">
            The score measures how green and even the turf looks in the satellite photo, so it shows the pitch as it
            was on {report.photoDate}. The small mark in the middle of the pitch is a person or object in the photo,
            not a problem with the turf. Reports show where to look and what usually helps. They are a guide for your
            grounds team, not a diagnosis.
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
              <p className="muted">Per application for a GAA pitch. Buy as you go or on a season subscription.</p>
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
          <EnquiryForm defaultType="gaa" defaultInterest={`Free ${TECH.name} report`} />
        </div>
      </section>
      <Wave from={MIST} to={ATLANTIC} flip />

      <Footer />
    </>
  );
}