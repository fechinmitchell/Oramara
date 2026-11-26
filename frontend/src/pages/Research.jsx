// oramara/frontend/src/pages/Research.jsx
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import Wave from '../components/Wave.jsx';
import { BRAND } from '../config/brand.js';
import { EVIDENCE_SUMMARY, STUDIES } from '../config/research.js';
import './pitches.css';

const WHITE = '#ffffff';
const MIST = '#eef4f3';
const CELTIC = '#0d3429';
const ATLANTIC = '#0b2f33';

export default function Research() {
  return (
    <>
      <Header />

      <section className="pitch-hero research-hero">
        <div className="container narrow">
          <p className="eyebrow eyebrow-light">Taighde<small>Research</small></p>
          <h1>What the science says about seaweed.</h1>
          <p className="lead lead-light">
            Seaweed has been studied on turf for decades. Here is what independent research has found, the good and the
            not so good, in plain English.
          </p>
        </div>
      </section>
      <Wave from={CELTIC} to={WHITE} />

      <section className="section">
        <div className="container">
          <div className="honest card">
            <strong>Please note:</strong> these studies looked at seaweed extracts in general, mostly Ascophyllum nodosum,
            the same family of seaweed we use. None of them tested {BRAND.name}. Our own trials start in spring 2027 and
            we will publish the results here, whatever they show.
          </div>

          <div className="evidence">
            <div className="card">
              <h3>Where the evidence is strongest</h3>
              <ul className="ticks">
                {EVIDENCE_SUMMARY.strong.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
            <div className="card">
              <h3>Where it is weaker</h3>
              <ul className="dashes">
                {EVIDENCE_SUMMARY.weaker.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <Wave from={WHITE} to={MIST} />
      <section className="section alt">
        <div className="container">
          <p className="eyebrow">Staidéir<small>Studies</small></p>
          <h2>The studies</h2>
          <div className="study-list">
            {STUDIES.map((s) => (
              <article key={s.title} className="card study">
                <span className="study-tag">{s.tag}</span>
                <h3>{s.title}</h3>
                <p className="study-meta">{s.who}. {s.where}</p>
                <p><strong>What they found:</strong> {s.found}</p>
                <p className="muted"><strong>What it means:</strong> {s.meaning}</p>
                <a href={s.url} target="_blank" rel="noreferrer">Read the original</a>
              </article>
            ))}
          </div>
        </div>
      </section>
      <Wave from={MIST} to={WHITE} flip />

      <section className="section">
        <div className="container narrow center">
          <p className="eyebrow">Ár dTrialacha<small>Our trials</small></p>
          <h2>Testing {BRAND.name} on real Irish pitches</h2>
          <p className="section-lead center-block">
            From spring 2027 we are running side by side trials on club pitches: one half sprayed, one half left alone,
            with health reports before and after. Want your club to take part?
          </p>
          <a href="/pitches#request" className="btn">Put my club forward</a>
        </div>
      </section>
      <Wave from={WHITE} to={ATLANTIC} />

      <Footer />
    </>
  );
}