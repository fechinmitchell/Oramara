// oramara/frontend/src/pages/admin/Report.jsx
// Printable turf report for club meetings. Use Print, then Save as PDF for an emailable copy.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { BRAND, PRICING, TECH } from '../../config/brand.js';
import { PITCH_TYPES, labelFor } from '../../config/options.js';
import TurfReport from '../../components/TurfReport.jsx';
import './analysis.css';

export default function Report() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [sat, setSat] = useState(null);

  function load() {
    return api(`/analyses/${id}`).then(setData).catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    api(`/analyses/${id}/satellite`).then(setSat).catch(() => setSat(null));
  }, [id]);

  async function rewrite() {
    setBusy('rewrite');
    setError('');
    try {
      await api(`/analyses/${id}/rewrite`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err.message);
    }
    setBusy('');
  }

  async function remove() {
    if (!confirm('Delete this report?')) return;
    await api(`/analyses/${id}`, { method: 'DELETE' });
    nav(data?.lead ? `/admin/analysis/${data.lead.id}` : '/admin/analysis');
  }

  if (!data) return <div className="report-page"><p className="muted">{error || 'Loading report...'}</p></div>;

  const { analysis: a, lead, plan, images, previous } = data;
  const ai = a.ai_report && !a.ai_report.error ? a.ai_report : null;
  const date = new Date(a.created_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
  const surface = labelFor(PITCH_TYPES, a.pitch_type);

  return (
    <div className="report-page">
      <div className="report-toolbar no-print">
        <Link to={lead ? `/admin/analysis/${lead.id}?report=${a.id}` : '/admin/analysis'} className="btn btn-ghost btn-small">Back to map</Link>
        <div className="row-buttons">
          {data.claudeEnabled && (
            <button className="btn btn-ghost btn-small" onClick={rewrite} disabled={!!busy}>
              {busy === 'rewrite' ? 'Writing...' : ai ? 'Rewrite with Claude' : 'Write with Claude'}
            </button>
          )}
          <button className="btn btn-ghost btn-small" onClick={remove}>Delete</button>
          <button className="btn btn-gold btn-small" onClick={() => window.print()}>Print or save PDF</button>
        </div>
      </div>

      {error && <p className="error no-print">{error}</p>}
      {a.ai_report?.error && <p className="error no-print">{a.ai_report.error}</p>}
      {!data.claudeEnabled && (
        <p className="muted small no-print">Add ANTHROPIC_API_KEY to backend/.env for the written observations. Built in advice is shown for now.</p>
      )}

      <article className="report">
        <header className="report-head">
          <div>
            <div className="report-logo">{TECH.name}</div>
            <div className="report-irish">{TECH.byline} · {TECH.tagline}</div>
          </div>
          <div className="report-meta">
            <strong>Turf snapshot</strong>
            <span>{date}</span>
          </div>
        </header>

        <section className="report-title">
          <h1>{lead?.name || `${TECH.name} report`}</h1>
          <p>{a.label ? `${a.label} · ` : ''}{surface}{a.imagery?.areaM2 ? ` · about ${(a.imagery.areaM2 / 10000).toFixed(2)} ha` : ''}</p>
        </section>

        <TurfReport
          data={data}
          months={sat?.months || []}
          period={a.imagery?.period || 12}
          showImages
          showQuestions={false}
          loadMonth={(month) => api(`/analyses/${a.id}/satellite/${month}`)}
        />

        <section className="report-section report-offer">
          <div>
            <h3>Next steps with {BRAND.name}</h3>
            <ul>
              <li>Free sample of {BRAND.product} for your first application</li>
              <li>Season subscription from €{PRICING.subscriptionFrom} a month, delivered</li>
              <li>{TECH.name} reports twice a year €{PRICING.reportsTwiceYearly}, or monthly in season €{PRICING.reportsMonthly}. Free with a product subscription</li>
            </ul>
            <p className="small">{BRAND.email}{BRAND.phone ? ` · ${BRAND.phone}` : ''}</p>
          </div>
        </section>

        {!!previous.length && (
          <section className="report-section">
            <h3>Earlier snapshots</h3>
            <p className="small">
              {previous.map((p) => `${new Date(p.created_at).toLocaleDateString('en-IE')}: ${p.score}`).join(' · ')}
            </p>
          </section>
        )}

        <footer className="report-foot">
          <p>
            Image: {a.image_source || 'aerial photo'}
            {a.imagery?.photoDate ? `, taken ${new Date(a.imagery.photoDate).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.
            {a.imagery?.insetM ? ` Measured ${a.imagery.insetM} m inside the pitch edge; line paint and shadow left out.` : ''}{sat?.months?.length ? ' Monthly data: contains modified Copernicus Sentinel data.' : ''} Satellite photos may be one to three years old and are affected by season,
            shadows and line marking. {ai?.image_notes}
          </p>
          <p>
            This snapshot measures how green the turf looks from above. It shows where to look, not a diagnosis.
            {` ${BRAND.name} Turf Biostimulant is a natural seaweed based plant biostimulant. It is not a fertiliser or a pesticide.`}
          </p>
        </footer>
      </article>

      {!!ai?.questions_for_club?.length && (
        <aside className="card meeting-notes no-print">
          <h3>Questions for the meeting (not printed)</h3>
          <ul>{ai.questions_for_club.map((q, i) => <li key={i}>{q}</li>)}</ul>
        </aside>
      )}
    </div>
  );
}