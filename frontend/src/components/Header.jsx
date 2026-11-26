// oramara/frontend/src/components/Header.jsx
import { useLocation } from 'react-router-dom';
import { BRAND, TECH } from '../config/brand.js';

const LINKS = [
  { href: '/#formats', label: 'Products' },
  { href: '/pitches', label: TECH.name },
  { href: '/research', label: 'Research' },
  { href: '/#dose', label: 'Dose guide' },
  { href: '/#pricing', label: 'Pricing' }
];

export default function Header() {
  const { pathname } = useLocation();

  return (
    <header className="site-header">
      <div className="container header-inner">
        <a href="/" className="logo">{BRAND.name}</a>
        <nav className="site-nav">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className={pathname === l.href ? 'active' : undefined}>
              {l.label}
            </a>
          ))}
          <a href="/admin" className="nav-login">Log in</a>
          <a href="/#contact" className="btn btn-gold btn-small">Free sample</a>
        </nav>
      </div>
    </header>
  );
}