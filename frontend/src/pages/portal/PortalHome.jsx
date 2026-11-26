// oramara/frontend/src/pages/portal/PortalHome.jsx
// The club's home page: every report Oramara has shared, newest first
import { Link, useOutletContext } from 'react-router-dom';
import { TECH } from '../../config/brand.js';

const scoreTone = (s) => (s >= 80 ? 'green' : s >= 65 ? 'gold' : 'red');

export default function PortalHome() {
  const { me } = useOutletContext();
  const first = (me.user.name || '').split(' ')[0];
  return (
    <div className="pt-home">
      <section className="pt-hello">
        <h1>{first ? `Hello ${first}` : `Welcome to ${TECH.name}`}</h1>
        <p className="muted">
          Your pitch from above: the latest satellite analysis for {me.club.name}, the care programme month by month, and what each job
          costs. Tick jobs off as you go so the whole committee can see where things stand.
        </p>
      </section>

      {me.reports.length === 0 ? (
        <div className="pt-empty">
          <h2>Your first report is on the way</h2>
          <p className="muted">We will let you know as soon as it is ready.</p>
        </div>
      ) : (
        <section className="pt-reports">
          <h2>Your reports</h2>
          <div className="pt-report-grid">
            {me.reports.map((r, i) => (
              <Link key={r.id} to={`/portal/report/${r.id}`} className={`pt-report-card ${i === 0 ? 'latest' : ''}`}>
                <span className={`pt-score ${scoreTone(r.score)}`}>{r.score}</span>
                <span className="pt-report-body">
                  <span className="pt-report-top">
                    <strong>{r.label || 'Main pitch'}</strong>
                    {i === 0 && <span className="tr-chip green">Latest</span>}
                    {r.portal_months && r.portal_months < 12 && (
                      <span className="tr-chip gold">{r.portal_months} month{r.portal_months === 1 ? '' : 's'} free</span>
                    )}
                  </span>
                  <small className="muted">
                    {new Date(r.created_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })} · {r.healthy_pct}% strong ·{' '}
                    {r.stressed_pct}% thin
                  </small>
                  {r.extras?.length > 0 && (
                    <small className="muted">Also: {r.extras.map((x) => `${x.label} ${x.score}`).join(', ')}</small>
                  )}
                  <small className="pt-ticked">{r.ticked ? `${r.ticked} job${r.ticked === 1 ? '' : 's'} ticked off` : 'Open to see your care programme'}</small>
                </span>
                <span className="pt-open" aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}