// oramara/backend/src/services/contactFinder.js
// Finds the public contact details a club, golf course or farm business has published itself,
// using Claude with web search. GDPR rules built in:
//   only details the organisation published (website, GAA or club pages, business listings)
//   role and organisation addresses are fine to use; a named person's own address is flagged as personal
//   nothing is guessed or made up, and every detail keeps the page it came from
import { trackUsage, claudeCostUsd } from '../usage.js';
import { claudeModel, claudeEnabled } from './claudeReport.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const SEARCH_COST_USD = 0.01; // $10 per 1,000 searches
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Free mail providers: an address there with a person's name in it is treated as personal
const FREE_MAIL = /@(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|eircom|aol|msn)\./i;
const ROLE_WORDS = /^(info|hello|admin|office|secretary|sec|chair|chairperson|treasurer|pro|membership|bookings|reception|enquiries|contact|clubhouse|manager|greenkeeper|grounds|golf|club)/i;

export const contactFinderEnabled = claudeEnabled;

const TYPE_WORDS = {
  gaa: 'GAA club',
  golf: 'golf club or course',
  soccer: 'soccer club',
  rugby: 'rugby club',
  farm: 'farm business',
  council: 'county council parks department',
  school: 'school'
};

function prompt(lead) {
  return `Find the public contact details for this organisation in Ireland:
Name: ${lead.name}
Type: ${TYPE_WORDS[lead.type] || lead.type || 'sports club'}
County: ${lead.county || 'unknown'}
${lead.website ? `Website we have: ${lead.website}` : ''}

Search its own website, its GAA, golf union or league listing, and business directories.
Rules, because this is for business contact under GDPR:
1. Only report details the organisation itself has published. Never guess or build an email address from a pattern.
2. Prefer organisation and role addresses: info@, secretary@, the club secretary's role address on gaa.ie, the club office, the course manager.
3. If the only email is a named person's own address (for example a Gmail address with their name), you may report it but set "personal": true.
4. Include the main phone number, website and any contact form page.
5. Every item needs the exact page URL where you saw it.

Reply with JSON only, no other text:
{"website": "url or null", "contacts": [{"role": "Club secretary", "name": "person's name if published, else null", "email": "or null", "phone": "or null", "contact_form": "url or null", "source_url": "page where this was found", "personal": false}], "notes": "one sentence on what you found or could not find"}
If you find nothing, reply {"website": null, "contacts": [], "notes": "..."}.`;
}

function readJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Decide whether an address is the organisation's or a person's own
export function classify(email, name, flaggedPersonal) {
  if (!email) return 'organisation';
  const local = email.split('@')[0];
  if (flaggedPersonal) return 'personal';
  if (ROLE_WORDS.test(local)) return 'organisation';
  if (FREE_MAIL.test(email)) {
    // a free mail address is personal unless it is clearly the club's own (has club words in it)
    return /(gaa|club|golf|hurling|camogie|football|rfc|afc|fc|gc)/i.test(local) ? 'organisation' : 'personal';
  }
  // an address on the club's own domain made of a person's name
  const parts = (name || '').toLowerCase().split(/\s+/).filter((p) => p.length > 2);
  if (parts.some((p) => local.toLowerCase().includes(p))) return 'personal';
  return 'organisation';
}

const cleanUrl = (u) => {
  if (!u || typeof u !== 'string') return null;
  const t = u.trim();
  return /^https?:\/\//i.test(t) ? t.slice(0, 500) : null;
};

export async function findContacts(lead) {
  if (!claudeEnabled()) {
    const err = new Error('Add ANTHROPIC_API_KEY to backend/.env to find contact details');
    err.status = 400;
    err.expose = true;
    throw err;
  }
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: claudeModel(),
      max_tokens: 3000,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
          user_location: { type: 'approximate', country: 'IE', timezone: 'Europe/Dublin' }
        }
      ],
      messages: [{ role: 'user', content: prompt(lead) }]
    }),
    signal: AbortSignal.timeout(120000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Contact search failed (${res.status})`);
    err.status = 502;
    err.expose = true;
    throw err;
  }

  const input = data.usage?.input_tokens || 0;
  const output = data.usage?.output_tokens || 0;
  const searches = data.usage?.server_tool_use?.web_search_requests || 0;
  trackUsage({ provider: 'anthropic', operation: 'contact_finder', model: data.model || claudeModel(), inputTokens: input, outputTokens: output, costUsd: claudeCostUsd(claudeModel(), input, output) });
  if (searches) trackUsage({ provider: 'anthropic', operation: 'web_search', units: searches, unitName: 'searches', costUsd: searches * SEARCH_COST_USD });

  // Pages the search actually returned: a source must be one of these, or a page on the same site
  const seen = new Set();
  for (const block of data.content || []) {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content) if (r.url) seen.add(r.url);
    }
    for (const c of block.citations || []) if (c.url) seen.add(c.url);
  }
  const seenHosts = new Set([...seen].map((u) => { try { return new URL(u).host; } catch { return ''; } }));

  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const parsed = readJson(text) || { website: null, contacts: [], notes: 'The search did not return a readable answer.' };

  const contacts = (Array.isArray(parsed.contacts) ? parsed.contacts : [])
    .map((c) => {
      const email = typeof c.email === 'string' && EMAIL.test(c.email.trim()) ? c.email.trim().toLowerCase() : null;
      const phone = typeof c.phone === 'string' ? c.phone.trim().slice(0, 40) || null : null;
      const source = cleanUrl(c.source_url);
      let host = '';
      try { host = source ? new URL(source).host : ''; } catch {}
      return {
        role: typeof c.role === 'string' ? c.role.slice(0, 80) : null,
        name: typeof c.name === 'string' ? c.name.slice(0, 80) : null,
        email,
        phone,
        contact_form: cleanUrl(c.contact_form),
        source_url: source,
        // a source the search really visited is marked as checked
        source_checked: Boolean(source && (seen.has(source) || seenHosts.has(host))),
        kind: classify(email, c.name, c.personal === true)
      };
    })
    .filter((c) => (c.email || c.phone || c.contact_form) && c.source_url);

  return { website: cleanUrl(parsed.website), contacts, notes: typeof parsed.notes === 'string' ? parsed.notes.slice(0, 300) : '', searches };
}