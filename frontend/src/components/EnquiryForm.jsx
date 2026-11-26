// oramara/frontend/src/components/EnquiryForm.jsx
import { useState } from 'react';
import { api } from '../api.js';
import { COUNTIES, LEAD_TYPES } from '../config/options.js';
import { TECH } from '../config/brand.js';

const INTERESTS = ['Free sample', `Free ${TECH.name} report`, `Sample and ${TECH.name} report`, 'Pricing and orders'];

const blank = (type = 'gaa', interest = INTERESTS[2]) => ({
  clubName: '', type, county: '', contactName: '', email: '', phone: '',
  interest, message: '', company_website: ''
});

export default function EnquiryForm({ defaultType, defaultInterest }) {
  const [form, setForm] = useState(() => blank(defaultType, defaultInterest));
  const [state, setState] = useState({ sending: false, done: false, error: '' });

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setState({ sending: true, done: false, error: '' });
    try {
      const { interest, message, ...rest } = form;
      await api('/public/enquiries', {
        method: 'POST',
        body: { ...rest, message: [interest, message].filter(Boolean).join('. ') }
      });
      setState({ sending: false, done: true, error: '' });
      setForm(blank(defaultType, defaultInterest));
    } catch (err) {
      setState({ sending: false, done: false, error: err.message });
    }
  }

  if (state.done) {
    return (
      <div className="card success">
        <h3>Thanks, we've got it.</h3>
        <p>We'll be in touch within a few days.</p>
      </div>
    );
  }

  return (
    <form className="card form-grid" onSubmit={submit}>
      <label>
        Club, course or business
        <input required value={form.clubName} onChange={set('clubName')} placeholder="e.g. Naomh Feichin GAA" />
      </label>
      <label>
        Where will you use it?
        <select value={form.type} onChange={set('type')}>
          {LEAD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>
      <label>
        What would you like?
        <select value={form.interest} onChange={set('interest')}>
          {INTERESTS.map((i) => (
            <option key={i}>{i}</option>
          ))}
        </select>
      </label>
      <label>
        County
        <select value={form.county} onChange={set('county')}>
          <option value="">Choose county</option>
          {COUNTIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        Your name
        <input value={form.contactName} onChange={set('contactName')} />
      </label>
      <label>
        Phone
        <input value={form.phone} onChange={set('phone')} />
      </label>
      <label className="span-2">
        Email
        <input type="email" value={form.email} onChange={set('email')} />
      </label>
      <label className="span-2">
        Anything else? (optional)
        <textarea rows={3} value={form.message} onChange={set('message')} placeholder="Size of the area, sprayer you use, problem spots" />
      </label>
      <input className="hp" tabIndex={-1} autoComplete="off" value={form.company_website} onChange={set('company_website')} aria-hidden="true" />
      {state.error && <p className="error span-2">{state.error}</p>}
      <button className="btn span-2" disabled={state.sending}>
        {state.sending ? 'Sending...' : 'Send'}
      </button>
    </form>
  );
}