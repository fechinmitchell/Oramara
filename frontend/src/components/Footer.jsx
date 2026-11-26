// oramara/frontend/src/components/Footer.jsx
import { BRAND, TECH } from '../config/brand.js';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div>
          <div className="logo">{BRAND.name}</div>
          <p className="muted footer-irish">{BRAND.irish}</p>
          <p className="muted">Pure seaweed from the wild Atlantic coast. Made in {BRAND.region}.</p>
        </div>
        <div className="footer-links">
          <a href="/pitches">{TECH.name}</a>
          <a href="/research">Research</a>
          <a href={`mailto:${BRAND.email}`}>{BRAND.email}</a>
          {BRAND.phone && <a href={`tel:${BRAND.phone}`}>{BRAND.phone}</a>}
          <a href="/admin">Team login</a>
        </div>
      </div>
      <div className="container fine-print">
        © {new Date().getFullYear()} {BRAND.name}. {BRAND.product} is a natural seaweed biostimulant, not a fertiliser or a pesticide.
      </div>
    </footer>
  );
}