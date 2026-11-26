// oramara/backend/src/services/claudeReport.js
// Asks Claude to look at the aerial photo and the measured greenness map and write
// the plain language parts of the meeting report. The numbers come from our own
// pixel analysis; Claude explains them and adds what it can see in the photo.

import sharp from 'sharp';
import { PITCH_TYPES, POUCH_GRAMS, SPRAYS_PER_SEASON } from './constants.js';
import { trackUsage, claudeCostUsd } from '../usage.js';
import { costPlan, pouchesFor } from './catalogue.js';
import { buildProgramme, profileFor, programmeForPrompt } from './programme.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-5-5';
const MAX_SIDE = 1400;

export const claudeEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);
export const claudeModel = () => process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

const SYSTEM = `You are an experienced Irish turf and sports pitch agronomist writing a report for a sports club or golf course.
The report is given to the club in person by Oramara, a small Irish company that makes Oramara Turf Biostimulant, a natural seaweed based plant biostimulant. Always call it Oramara Turf Biostimulant or the biostimulant, never seaweed spray.

Rules:
1. Base everything on the two images and the numbers given. Never invent measurements.
2. A colour aerial photo shows greenness, not plant health. Say what is worth checking on the ground, never give a diagnosis.
3. Never mention diseases, pests, fungicides or pesticides, and never say the biostimulant treats, cures or prevents anything, and never call it a fertiliser or say it feeds the grass. It helps the grass use nutrients, cope with stress and recover, as part of normal pitch care.
4. Satellite photos can be one to three years old and are affected by shadows, line marking, mowing stripes and season. Mention this briefly where it matters.
5. Write in plain Irish English for a club volunteer or groundsman. Short sentences. Friendly and professional.
6. Do not use hyphens or dashes in your writing.
7. Reply with JSON only, no other text.

Irish turf calendar to plan with (adjust to what the data shows):
Growth starts when soil passes about 6 to 8 degrees, usually March, and slows from late October. Little growth December to February.
Overseeding works best when soil is warm and moist: late April to May, and best of all late August to mid September. Not in midsummer drought or winter.
Hollow or solid tine aeration when the ground is moist but not waterlogged: spring and autumn, and after the season ends. Keep machines off saturated pitches.
End of season renovation for winter sports pitches: scarify, overseed, topdress, then feed. For GAA and rugby this is often May to July between seasons; for soccer it depends on the league.
Feed lightly in spring and autumn based on a soil test; lime only if the soil test shows low pH; avoid heavy feeding in summer drought and in winter.
Oramara Turf Biostimulant: start when growth starts in March, every 3 to 4 weeks through October. Add a spray about 2 weeks after overseeding to help new grass establish, and before and after stress such as dry spells, heat, heavy match weeks and renovation. It supports growth and recovery; it is not a fertiliser replacement.
Repair goalmouths and high wear areas after matches; rotate training areas off weak zones.
Golf greens are different: mown at 3.5 to 5 mm, light biostimulant applications every 2 to 3 weeks in season, light sand top dressing monthly from April to September, hollow coring in spring and autumn with heavy top dressing after, overseeding with fescue and bent after autumn coring, little and often feeding, and keeping play off frozen greens.
For GAA pitches, protect the goalmouths and the 13 m area, and time the renovation around the club's championship fixtures.`;

function monthlyText(monthly = [], focusMonth) {
  const clear = monthly.filter((m) => m.clear);
  if (!clear.length) return '';
  const lines = clear.map((m) => `${m.month}: ${m.ndvi.toFixed(2)} (strong ${m.strongPct ?? '?'}%, thin ${m.thinPct ?? '?'}%)`);
  const focus = focusMonth && monthly.find((m) => m.month === focusMonth);
  return `
Monthly plant vigour (NDVI) of the same pitch from free Sentinel 2 satellites, 10 m pixels, best cloud free view each month.
Dense healthy turf is 0.75 or more, moderate 0.6 to 0.75, thin under 0.6. Cloudy months are left out.
${lines.join('\n')}
${focus ? (focus.clear ? `The user picked ${focusMonth} to focus on. Comment on that month in particular.` : `The user picked ${focusMonth}, but it was too cloudy to measure. Say so briefly.`) : ''}
`;
}

function nextMonths(n) {
  const d = new Date();
  return Array.from({ length: n }, (_, i) => {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1 + i, 1));
    return m.toISOString().slice(0, 7);
  });
}

export const PERIODS = [1, 3, 6, 12];

// How many of the weakest months to explain, by report length
export const WORST_COUNT = { 1: 0, 3: 1, 6: 3, 12: 3 };

// The weakest clear months inside the window, lowest vigour first
export function worstMonths(monthly = [], period = 12) {
  const n = WORST_COUNT[period] ?? 0;
  return monthly
    .slice(-period)
    .filter((m) => m.clear && Number.isFinite(m.ndvi))
    .sort((a, b) => a.ndvi - b.ndvi)
    .slice(0, n);
}

const EDGE_STRIP_M = 8; // same outer strip as the analysis

function userPrompt({ leadName, pitchType, profile, goalmouths = [], otherPitches = [], metrics, zones, metresPerPixel, areaM2, monthName, hasGrounds, monthly, focusMonth, photoTaken, period = 12 }) {
  const pitch = PITCH_TYPES[pitchType] || PITCH_TYPES.gaa;
  const plan = nextMonths(period);
  const windowMonths = (monthly || []).slice(-period).map((m) => m.month);
  const hasMonthly = (monthly || []).slice(-period).some((m) => m.clear);
  const span = period === 1 ? 'last month' : `last ${period} months`;
  const ahead = period === 1 ? 'next month' : `next ${period} months`;
  const worst = worstMonths(monthly, period);
  const club = profileFor(pitchType, profile);
  const costs = costPlan({ pitchType, areaM2, weakPct: metrics.stressedPct, profile: club });
  const startPlan = programmeForPrompt(buildProgramme({ pitchType, profile: club, costs, months: plan, zones }));
  const monthName2 = (n) => ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][n];
  const clubText = pitchType === 'golf'
    ? `Greens: ${club.greens}, ${club.greensType === 'sand' ? 'sand based' : 'push up soil'} greens. Hollow coring in ${(club.coringMonths || []).map(monthName2).join(' and ')}. Looked after by: ${club.maintainedBy}.`
    : `Busy playing months: ${(club.busyMonths || []).map(monthName2).join(', ')}. Renovation month: ${monthName2(club.renovationMonth)}. Teams using the pitch: ${club.teams}. Drainage: ${club.drainage}. Looked after by: ${club.maintainedBy}.`;
  const productList = costs.lines
    .map((l) => `${l.id}: ${l.name}. Rate: ${l.rate}. For this pitch: ${l.qty} x ${l.unit} (${l.use}).`)
    .join('\n');
  return `Club or venue: ${leadName || 'Unknown'}
Surface: ${pitch.label}
Marked area: about ${Math.round(areaM2).toLocaleString('en-IE')} square metres
Image detail: about ${metresPerPixel.toFixed(2)} metres per pixel
Report written: ${monthName}. This is NOT the date of the photo.
${photoTaken ? `The aerial photo was taken on ${photoTaken}. Allow for that season, and say how old the photo is.` : 'The photo date is unknown and could be any season of the last few years, so do not blame the result on the current month.'}

Image 1 is the aerial photo. The playing surface we measured is outlined in white.${hasGrounds ? ' A dashed gold line marks the wider grounds, shown only for context such as trees, buildings, stands and car parks. Do not judge the turf outside the white outline.' : ''}
Image 2 is our greenness map of the same area: green is strong growth, amber is moderate, red is thin or stressed turf. Letters mark the problem zones.

Measured results:
Turf score: ${metrics.score} out of 100
Healthy: ${metrics.healthyPct}%, moderate: ${metrics.moderatePct}%, stressed: ${metrics.stressedPct}%
We measured 3 m inside the marked edge and left out white line paint and deep shadow.
Zones are areas that are thin, or clearly weaker than the rest of this pitch.
${metrics.playScore != null ? `Playing area (more than ${EDGE_STRIP_M + 3} m in from the marked edge): score ${metrics.playScore}. Outer ${EDGE_STRIP_M} m strip: score ${metrics.edgeScore}.` : ''}
${metrics.removedPct ? `${metrics.removedPct}% of the marked area was left out as hard surfaces along the edge (stands, dugouts, paths, car parks)${metrics.excludedAreas ? ` or as ${metrics.excludedAreas} area(s) the club marked to leave out` : ''}.` : ''}
Zones: ${zones.length ? zones.map((z) => `${z.letter} = ${z.label}${z.edge ? ' (mostly in the outer strip)' : ''}, ${z.stressedPct}% of that area is weak`).join('; ') : 'none above the threshold'}
Weak turf only in the outer strip, next to a stand, dugout, path, wall or trees, is usually shade, run off, spectators, subs and maintenance traffic rather than a poor playing surface. Say so where it applies, look at the photo to name what is beside it, and do not let it drive the overall verdict.
${goalmouths.length ? `Goalmouths, each measured on its own from a closer photo: ${goalmouths.map((g) => `${g.label}: score ${g.score}, ${g.strongPct}% strong, ${g.thinPct}% thin, about ${g.areaM2} m²`).join('; ')}. Say which end needs repair first and why, and use these in the zones, priorities and programme notes.` : ''}
${otherPitches.length ? `Other pitches at this club, measured the same way from the same aerial photo (no images of these are attached): ${otherPitches.map((o) => `${o.label}: score ${o.score}, ${o.strongPct}% strong, ${o.thinPct}% thin, about ${o.areaM2} m², weak zones: ${o.zones.length ? o.zones.map((z) => `${z.letter} ${z.label} ${z.stressedPct}% weak`).join(', ') : 'none'}`).join('; ')}. Fill other_pitches with one entry for each, in the same order, and say in the priorities which pitch needs work first across the club.` : ''}

${monthlyText(monthly, focusMonth)}
Products to plan with (use these ids in the programme). Wear area for repairs is about ${costs.wearAreaM2} m² and the measured pitch is ${costs.areaM2} m².
${productList}

Product facts you may use: one Dose Pouch is ${POUCH_GRAMS} g, mixed in 100 L of water and covers about 2,000 square metres. This pitch needs ${costs.pouchesPerSpray} pouches per application, about ${SPRAYS_PER_SEASON} applications a season from March to October, every 3 to 4 weeks while grass is growing.

Return this JSON:
{
  "headline": "one sentence overall verdict",
  "summary": "two or three sentences explaining the score in plain words",
  "observations": ["three to five things you can actually see in the photo, such as worn goalmouths, bare patches, wet looking areas, shade from trees or stands, line marking"],
  "zones": [{"letter": "A", "what_we_see": "", "likely_causes": "possible reasons worth checking", "actions": ["two or three practical steps"]}],
  "priorities": ["three to five actions in order of importance for the ${period === 1 ? 'next four weeks' : 'next two months'}, including where Oramara Turf Biostimulant fits"],
  "questions_for_club": ["three questions to ask at the meeting, such as drainage, how many teams use the pitch, current feeding"],
  "image_notes": "one or two sentences on limits of this image",
  "monthly_trend": "two or three sentences on the monthly satellite pattern: the season, the best and worst months, the year on year change, and the picked month if there is one. Empty string if there is no monthly data.",
  "year_review": ${hasMonthly ? `{
    "overview": "three or four sentences reviewing the ${span} of satellite data (${windowMonths.join(', ')}): the trend through that time, what changed and why it may have changed${period >= 6 ? ', and how the pitch went through the seasons' : ''}",
    "seasons": ${period >= 6 ? '[{"season": "for example Spring 2026", "months": "Mar to May", "verdict": "Strong | Good | Fair | Weak", "what_happened": "one or two sentences"}] covering only the seasons inside the window' : '[]'},
    "best_month": "YYYY-MM within the window",
    "weakest_month": "YYYY-MM within the window",
    "year_on_year": "one sentence comparing the ${span} with the same months a year earlier, if that data is given"
  }` : 'null'},
  "monthly_notes": ${hasMonthly ? `[{"month": "YYYY-MM", "note": "one short sentence on that month, for each clear month of the ${span}"}]` : '[]'},
  "worst_months": ${worst.length ? `[{"month": "YYYY-MM", "what_happened": "two sentences on why this month was weak, using the season, the months either side and anything visible in the photo", "fixes": ["two or three practical steps to recover from it or stop it happening again, with timing"], "next_time": "one sentence on what to do in the weeks before this month next year, including where Oramara Turf Biostimulant fits"}] for exactly these months: ${worst.map((m) => `${m.month} (vigour ${m.ndvi.toFixed(2)})`).join(', ')}` : '[]'},
  "seaweed_plan": "three or four sentences on the Oramara Turf Biostimulant programme for this pitch: when to start and stop applying it, how often, how many pouches, and the extra applications around overseeding and stress periods",
  "other_pitches": ${otherPitches.length ? `[{"label": "the pitch name as given", "verdict": "one sentence", "notes": "two or three sentences on its condition and how it compares with the main pitch", "actions": ["three practical steps for this pitch over the ${ahead}, including Oramara Turf Biostimulant and any overseeding"]}]` : '[]'},
  "programme_tweaks": [{"month": "YYYY-MM", "note": "one sentence that tailors this month of the starting plan to this pitch, for example which zone to focus on or what the data showed last year", "add": [{"type": "biostimulant | overseed | aerate | feed | lime | scarify | topdress | repair | rest | soil_test | monitor", "what": "", "how": "one or two sentences", "amount": "", "product": "a product id or empty", "qty": 0, "why": ""}]}]
}
Include one zones entry for each lettered zone, in the same order. If there are no zones, return an empty list.
This report covers the ${span} looking back and the ${ahead} looking forward. Keep the review to that window.
Club details: ${clubText}
${profile ? 'These details come from the club, so plan around them.' : 'The club has not given its details yet, so these are typical values. Mention in the seaweed_plan or priorities that the plan can be fine tuned once the club shares its fixture calendar.'}

Starting plan built from Irish turf practice and these details. It is shown to the club as it is. Do not rewrite it: give one programme_tweaks entry per month with a short note that tailors it to this pitch, and add at most one extra task in a month only when this pitch clearly needs it. Write in plain practical words for ${pitchType === 'golf' ? 'a greenkeeper' : club.maintainedBy === 'volunteers' ? 'club volunteers' : 'a groundsman'}):
${startPlan}

Give programme_tweaks for these months in order: ${plan.join(', ')}. Tie the notes to what the data shows: weak zones, the summer dip, a slow start out of winter, the busy fixture months.`;
}

function recordClaude(operation, data) {
  const u = data?.usage || {};
  const input = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  const output = u.output_tokens || 0;
  if (!input && !output) return;
  trackUsage({
    provider: 'anthropic',
    operation,
    model: data.model || claudeModel(),
    inputTokens: input,
    outputTokens: output,
    costUsd: claudeCostUsd(claudeModel(), input, output)
  });
}

// Claude fills in the report through a tool, so the reply is always well formed JSON
const REPORT_TOOL = {
  name: 'write_turf_report',
  description: 'Save the turf report for this pitch. Use the exact fields described in the instructions.',
  input_schema: {
    type: 'object',
    properties: {
      headline: { type: 'string' },
      summary: { type: 'string' },
      observations: { type: 'array', items: { type: 'string' } },
      zones: { type: 'array', items: { type: 'object' } },
      priorities: { type: 'array', items: { type: 'string' } },
      questions_for_club: { type: 'array', items: { type: 'string' } },
      image_notes: { type: 'string' },
      monthly_trend: { type: 'string' },
      year_review: { type: ['object', 'null'] },
      monthly_notes: { type: 'array', items: { type: 'object' } },
      worst_months: { type: 'array', items: { type: 'object' } },
      seaweed_plan: { type: 'string' },
      programme_tweaks: { type: 'array', items: { type: 'object' } },
      other_pitches: { type: 'array', items: { type: 'object' } }
    },
    required: ['headline', 'summary', 'priorities', 'programme_tweaks']
  }
};

export async function writeReport({ original, heatmap, imagePolygon, groundsPolygon = [], operation = 'report', ...details }) {
  if (!claudeEnabled()) return null;

  const outlined = await outline(original, imagePolygon, groundsPolygon);
  details.hasGrounds = groundsPolygon.length >= 3;
  const map = await sharp(heatmap).resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  const monthName = new Date().toLocaleString('en-IE', { month: 'long', year: 'numeric' });

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: claudeModel(),
      max_tokens: 16000,
      system: SYSTEM.replace('7. Reply with JSON only, no other text.', '7. Save the report with the write_turf_report tool. Its fields are the JSON described in the message.'),
      tools: [REPORT_TOOL],
      // This model does not allow forcing a tool, so we ask for it and fall back to reading JSON text
      tool_choice: { type: 'auto' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: outlined.toString('base64') } },
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: map.toString('base64') } },
            { type: 'text', text: userPrompt({ ...details, monthName }) }
          ]
        }
      ]
    }),
    signal: AbortSignal.timeout(240000)
  });

  const data = await res.json().catch(() => ({}));
  recordClaude(operation, data);
  if (!res.ok) {
    console.error('Claude API error:', res.status, data?.error?.message || data);
    return { error: `Claude could not write the report (${res.status}). The measured results are still saved.` };
  }

  if (data.stop_reason === 'max_tokens') console.error('Claude reply was cut off at the token limit');
  const tool = (data.content || []).find((b) => b.type === 'tool_use' && b.input && typeof b.input === 'object');
  if (tool) return normalise(tool.input);

  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  if (!text.trim()) console.error('Claude report gave no text. Blocks:', (data.content || []).map((b) => b.type).join(', '), 'stop:', data.stop_reason);
  try {
    return parseJson(text);
  } catch (err) {
    console.error('Claude reply was not JSON:', err.message, '\nStart:', text.slice(0, 300), '\nEnd:', text.slice(-300));
    return { error: 'Claude replied in an unexpected format. Try running the report again.' };
  }
}

async function outline(jpg, polygon, grounds = []) {
  const meta = await sharp(jpg).metadata();
  const stroke = Math.max(2, Math.round(meta.width / 350));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}">
    ${grounds.length ? `<polygon points="${grounds.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#d9b25a" stroke-width="${stroke}" stroke-dasharray="${stroke * 4} ${stroke * 3}"/>` : ''}
    <polygon points="${polygon.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#ffffff" stroke-width="${stroke}"/>
  </svg>`;
  return sharp(jpg)
    .composite([{ input: Buffer.from(svg) }])
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

function parseJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON');
  const raw = text.slice(start, end + 1);
  let out;
  try {
    out = JSON.parse(raw);
  } catch {
    // Common slip: trailing commas
    out = JSON.parse(raw.replace(/,\s*([}\]])/g, '$1'));
  }
  return normalise(out);
}

// Clean up Claude's report into the shape the app expects, whatever it left out
function normalise(out) {
  return {
    headline: String(out.headline || ''),
    summary: String(out.summary || ''),
    observations: list(out.observations),
    zones: Array.isArray(out.zones)
      ? out.zones.map((z) => ({
          letter: String(z.letter || ''),
          what_we_see: String(z.what_we_see || ''),
          likely_causes: String(z.likely_causes || ''),
          actions: list(z.actions)
        }))
      : [],
    priorities: list(out.priorities),
    questions_for_club: list(out.questions_for_club),
    image_notes: String(out.image_notes || ''),
    monthly_trend: String(out.monthly_trend || ''),
    year_review: out.year_review && typeof out.year_review === 'object'
      ? {
          overview: String(out.year_review.overview || ''),
          seasons: Array.isArray(out.year_review.seasons)
            ? out.year_review.seasons.map((x) => ({
                season: String(x.season || ''),
                months: String(x.months || ''),
                verdict: String(x.verdict || ''),
                what_happened: String(x.what_happened || '')
              }))
            : [],
          best_month: String(out.year_review.best_month || ''),
          weakest_month: String(out.year_review.weakest_month || ''),
          year_on_year: String(out.year_review.year_on_year || '')
        }
      : null,
    monthly_notes: Array.isArray(out.monthly_notes)
      ? out.monthly_notes.map((x) => ({ month: String(x.month || ''), note: String(x.note || '') })).filter((x) => x.note)
      : [],
    seaweed_plan: String(out.seaweed_plan || ''),
    worst_months: Array.isArray(out.worst_months)
      ? out.worst_months.map((w) => ({
          month: String(w.month || ''),
          what_happened: String(w.what_happened || ''),
          fixes: list(w.fixes),
          next_time: String(w.next_time || '')
        }))
      : [],
    programme_tweaks: Array.isArray(out.programme_tweaks)
      ? out.programme_tweaks.map((t) => ({
          month: String(t.month || ''),
          note: String(t.note || ''),
          add: Array.isArray(t.add)
            ? t.add.slice(0, 1).map((x) => ({
                type: String(x.type || 'monitor').trim(),
                what: String(x.what || ''),
                how: String(x.how || ''),
                amount: String(x.amount || ''),
                product: String(x.product || '').trim(),
                qty: Number(x.qty) || 0,
                why: String(x.why || '')
              })).filter((x) => x.what)
            : []
        }))
      : [],
    programme: Array.isArray(out.programme)
      ? out.programme.map((m) => ({
          month: String(m.month || ''),
          focus: String(m.focus || ''),
          mowing: String(m.mowing || ''),
          conditions: String(m.conditions || ''),
          actions: Array.isArray(m.actions)
            ? m.actions.map((x) => ({
                qty: Number(x.qty) || 0,
                type: String(x.type || 'monitor').trim(),
                what: String(x.what || ''),
                how: String(x.how || ''),
                amount: String(x.amount || ''),
                product: String(x.product || '').trim(),
                why: String(x.why || '')
              }))
            : []
        }))
      : []
  };
}

function list(v) {
  return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
}

// ---------- Finding the pitch in a photo ----------

const LOCATE_LABEL = {
  gaa: 'GAA pitch (the biggest marked grass pitch, about 130 to 145 m long and 80 to 90 m wide, with H shaped goals at each end)',
  soccer: 'soccer pitch (a marked grass pitch, about 100 m long and 65 m wide)',
  rugby: 'rugby pitch (a marked grass pitch, about 100 m long plus in goal areas and 70 m wide)',
  golf: 'golf green (the smooth, evenly mown green nearest the image centre)'
};

// Asks Claude for the corners of the main pitch in an aerial photo.
// Returns { pitch: [[x, y] x4], grounds: [[x, y] x4] | null, confidence } in image pixels, or null.
export async function locatePitch(jpg, type, metresPerPixel) {
  if (!claudeEnabled()) return null;
  const img = await sharp(jpg).resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  const meta = await sharp(img).metadata();
  const original = await sharp(jpg).metadata();
  const back = original.width / meta.width; // scale Claude's pixels back to the original image

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: claudeModel(),
      max_tokens: 4000, // room for the model to think before it answers
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img.toString('base64') } },
            {
              type: 'text',
              text: `This aerial photo is ${meta.width} by ${meta.height} pixels, about ${(metresPerPixel * back).toFixed(2)} metres per pixel. North is up.
Find the main ${LOCATE_LABEL[type] || LOCATE_LABEL.gaa} closest to the centre of the image.
Give the pixel positions of its four corners, going round the edge in order, on the edge of the playing grass (not the fence or the path).
Also give a box around the whole sports grounds it sits in (fences, stands, car park), if you can tell.
Reply with JSON only:
{"found": true, "pitch": [[x, y], [x, y], [x, y], [x, y]], "grounds": [[x, y], [x, y], [x, y], [x, y]] or null, "confidence": "high" | "medium" | "low"}
If there is no pitch, reply {"found": false}.`
            }
          ]
        }
      ]
    }),
    signal: AbortSignal.timeout(60000)
  });

  const data = await res.json().catch(() => ({}));
  recordClaude('locate_pitch', data);
  if (!res.ok) {
    console.error('Claude pitch finder error:', res.status, data?.error?.message || data);
    return null;
  }
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  if (!text.trim()) {
    console.error('Claude pitch finder gave no text. Blocks:', (data.content || []).map((b) => b.type).join(', '), 'stop:', data.stop_reason);
    return null;
  }
  try {
    const start = text.indexOf('{');
    const out = JSON.parse(text.slice(start, text.lastIndexOf('}') + 1));
    const quad = (q) =>
      Array.isArray(q) && q.length === 4 && q.every((p) => Array.isArray(p) && p.every(Number.isFinite))
        ? q.map(([x, y]) => [x * back, y * back])
        : null;
    const pitch = out.found ? quad(out.pitch) : null;
    if (!pitch) return null;
    return { pitch, grounds: quad(out.grounds), confidence: String(out.confidence || 'medium') };
  } catch {
    console.error('Claude pitch finder reply was not JSON:', text.slice(0, 300));
    return null;
  }
}