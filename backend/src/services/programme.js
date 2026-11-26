// oramara/backend/src/services/programme.js
// Builds a detailed month by month care programme for a pitch or golf green, from Irish turf practice,
// the club's own details (busy months, renovation month, drainage) and what the analysis found.
// Claude is given this as a starting plan and tailors it; if Claude is not available, this is the plan.

import { CATALOGUE } from './catalogue.js';

export const PROFILE_DEFAULTS = {
  gaa: { busyMonths: [3, 4, 5, 6, 7, 8, 9, 10], renovationMonth: 9, teams: 6, drainage: 'average', maintainedBy: 'volunteers' },
  soccer: { busyMonths: [8, 9, 10, 11, 12, 1, 2, 3, 4], renovationMonth: 5, teams: 4, drainage: 'average', maintainedBy: 'volunteers' },
  rugby: { busyMonths: [9, 10, 11, 12, 1, 2, 3, 4], renovationMonth: 5, teams: 4, drainage: 'average', maintainedBy: 'volunteers' },
  golf: { greens: 18, greensType: 'push_up', coringMonths: [3, 9], maintainedBy: 'greenkeeper' }
};

export function profileFor(pitchType, saved) {
  return { ...(PROFILE_DEFAULTS[pitchType] || PROFILE_DEFAULTS.gaa), ...(saved || {}) };
}

const MONTH = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Unit price for costing a single task: Oramara is costed per pouch, the rest per pack
function unitCost(product) {
  const p = CATALOGUE[product];
  if (!p || p.price === null) return null;
  return product === 'oramara_pouch' ? p.price / 10 : p.price;
}

function task(type, what, how, product = '', qty = 0, amount = '') {
  const per = product ? unitCost(product) : null;
  return { type, what, how, product, qty, amount, cost: per === null || !qty ? null : Math.round(per * qty) };
}

// Three levels of care. The club picks one in the report; the same months, more or less work.
//   essential: keep it safe and playable on the smallest budget
//   standard: the recommended plan for a club pitch
//   elite: county or championship standard surface
export const LEVELS = ['essential', 'standard', 'elite'];

// months: ['2026-12', '2027-01', ...]
export function buildProgramme({ pitchType = 'gaa', profile, costs, months, zones = [], level = 'standard' }) {
  const pr = profileFor(pitchType, profile);
  const lvl = LEVELS.includes(level) ? level : 'standard';
  if (pitchType === 'golf') return golfProgramme({ pr, costs, months, level: lvl });
  return pitchProgramme({ pitchType, pr, costs, months, zones, level: lvl });
}

// All three levels at once, for the switch in the report
export function buildProgrammes(args) {
  return Object.fromEntries(LEVELS.map((level) => [level, buildProgramme({ ...args, level })]));
}

// ---------- GAA, soccer and rugby ----------
function pitchProgramme({ pitchType, pr, costs, months, zones, level }) {
  const essential = level === 'essential';
  const elite = level === 'elite';
  const area = costs.areaM2;
  const wear = costs.wearAreaM2;
  const pouches = costs.pouchesPerSpray;
  const busy = new Set(pr.busyMonths || []);
  const reno = Number(pr.renovationMonth) || 9;
  const poorDrainage = pr.drainage === 'poor';
  const goalWords = pitchType === 'gaa' ? 'goalmouths and the 13 m lines' : pitchType === 'rugby' ? 'scrum and lineout areas and the try lines' : 'goalmouths and the centre circle';
  const weakZones = zones.map((z) => `${z.letter} (${z.label.toLowerCase()})`).join(', ');

  const seedBags = (m2, rate) => Math.max(1, Math.ceil((m2 * rate) / 20000));
  const fertBags = (m2, rate) => Math.max(1, Math.ceil((m2 * rate) / 25000));
  const sandBags = (m2, kg) => Math.max(1, Math.ceil((m2 * kg) / 1000));

  const bio = (extra = '') =>
    task(
      'biostimulant',
      `Apply Oramara Turf Biostimulant${extra}`,
      `Dissolve ${pouches} pouches in ${pouches * 100} L of water and spray the whole pitch on a calm, dry day when rain is not due for 6 hours. Spray when the grass is dry so it stays on the leaf.`,
      'oramara_pouch',
      pouches,
      `${pouches} pouches in ${pouches * 100} L`
    );

  const plan = (m) => {
    const acts = [];
    let focus = '';
    let mowing = '';
    let conditions = '';
    const isBusy = busy.has(m);
    const isReno = m === reno;

    if (m === 12 || m === 1) {
      focus = 'Winter care';
      mowing = 'Only top it if it is growing, at 40 mm';
      conditions = 'Soil under 6°C, little growth';
      acts.push(task('rest', 'Keep play off waterlogged or frozen areas', 'Walk the pitch after heavy rain. If water sits on top or your boot sinks, move training to another area. Frozen grass breaks under studs.'));
      acts.push(task('repair', `Replace divots on the ${goalWords}`, 'After each match, press divots back by foot and fill holes with sand so the surface stays level for spring.'));
    }
    if (m === 2) {
      focus = 'Plan the season';
      mowing = 'Top at 40 mm if growing';
      conditions = 'Soil warming, ground often wet';
      acts.push(task('soil_test', 'Take a soil test', 'Take 15 to 20 cores 10 cm deep in a W pattern across the pitch, mix them and send one sample for pH, phosphate, potash and organic matter.', 'soil_test', 1, '1 sample'));
      acts.push(task('monitor', 'Order seed, feed and biostimulant for spring', 'Ordering now avoids the spring rush and lets you start as soon as growth begins.'));
    }
    if (m === 3) {
      focus = 'Wake up the grass';
      mowing = '35 to 40 mm, once a week';
      conditions = 'Start when soil passes about 7°C and the grass is growing';
      acts.push(bio(', first of the season'));
      if (elite) acts.push(task('soil_test', 'Check soil temperature and moisture weekly', 'A soil thermometer and a probe tell you when growth starts, so feed and seed go on at the right time.'));
      acts.push(task('feed', 'Spring feed', 'Spread at 35 g/m² in two directions at half rate each, so there are no stripes. Apply before light rain.', 'fert_spring', fertBags(area, 35), `${fertBags(area, 35)} bags at 35 g/m²`));
      if (!busy.has(3) || poorDrainage) acts.push(task('aerate', 'Slit or solid tine the whole pitch', 'Only when the ground is moist but firm. It lets air and water in after winter and helps roots grow.'));
    }
    if (m === 4) {
      focus = 'Build density';
      mowing = '30 to 35 mm, twice a week';
      conditions = 'Growth picking up, soil around 8 to 10°C';
      if (!essential) acts.push(bio());
      if (!essential) acts.push(task('aerate', elite ? 'Deep tine aeration' : 'Deep tine aeration if compacted', 'If a screwdriver is hard to push into the centre or goalmouths, book a deep tine (Verti-drain) pass while the ground is moist.', 'aeration_contractor', area, `1 pass over ${Math.round(area).toLocaleString('en-IE')} m²`));
      if (essential) acts.push(task('aerate', 'Hand fork the goalmouths if they are hard', 'Push a garden fork 10 cm into the worn areas every 15 cm and rock it back. Free, and it lets water and air in.'));
      if (reno !== 4 && !essential) acts.push(task('repair', `Repair the ${goalWords}`, 'Rake out loose and dead material, sow seed at 50 g/m², rake it in and lightly top dress. Keep play off for 3 to 4 weeks if you can.', 'seed_sports', seedBags(wear / 2, 50), `${seedBags(wear / 2, 50)} bags over about ${Math.round(wear / 2)} m²`));
    }
    if (m === 5) {
      focus = 'Strong growth';
      mowing = '30 mm, twice a week';
      conditions = 'Best growing month';
      acts.push(bio());
      if (elite) acts.push(task('repair', `Overseed the ${goalWords} between matches`, 'Sow seed at 35 g/m² into worn spots every 2 to 3 weeks through the season, so the grass keeps filling in while it grows fast.', 'seed_sports', seedBags(wear / 3, 35), `${seedBags(wear / 3, 35)} bags`));
    }
    if (m === 6) {
      focus = 'Before the dry weather';
      mowing = '30 to 35 mm, raise it in dry spells';
      conditions = 'Watch for drought stress';
      if (!essential) acts.push(bio(' before any dry spell'));
      if (elite) {
        acts.push(task('feed', 'Summer slow release feed', 'A slow release feed at 30 g/m² keeps colour and recovery through the busiest weeks without a flush of soft growth.', 'fert_spring', fertBags(area, 30), `${fertBags(area, 30)} bags at 30 g/m²`));
        acts.push(bio(', second application after the hottest week'));
      }
      acts.push(task('monitor', 'Watch for drought stress', 'Grass that stays flat after you walk on it or turns blue grey needs a rest from play. Raise the mower and keep clippings on in very dry weather.'));
    }
    if (m === 7) {
      focus = 'Protect the surface';
      mowing = '30 to 35 mm';
      conditions = 'Heat and dry spells';
      acts.push(bio());
      if (elite) acts.push(task('topdress', `Light top dressing on the ${goalWords}`, 'A thin layer of sand at about 2 kg/m² keeps the worn areas level and firm underfoot.', 'sand_topdress', sandBags(wear, 2), `${sandBags(wear, 2)} tonne bags`));
      acts.push(task('repair', 'Rotate training areas', 'Move drills, cones and goals around so the same spots are not worn every session.'));
    }
    if (m === 8) {
      focus = 'Get ready for renovation';
      mowing = '30 mm';
      conditions = 'Warm soil, good for seed from late August';
      if (!essential) acts.push(bio());
    }
    if (m === 9) {
      focus = 'Autumn recovery';
      mowing = '30 to 35 mm';
      conditions = 'Warm, moist soil: the best time for seed';
      acts.push(bio(', 2 weeks after any seeding'));
      if (reno !== 9) acts.push(task('overseed', `Overseed the ${goalWords}`, 'Sow at 50 g/m² into the worn areas and rake in. Late August to mid September is the best window of the year in Ireland.', 'seed_sports', seedBags(wear / 2, 50), `${seedBags(wear / 2, 50)} bags`));
    }
    if (m === 10) {
      focus = 'Harden for winter';
      mowing = '35 mm';
      conditions = 'Growth slowing, soil still warm';
      if (!essential) acts.push(bio(', last of the season'));
      if (elite) acts.push(task('aerate', 'Autumn deep tine aeration', 'A second deep tine pass before winter keeps water moving down through the wettest months.', 'aeration_contractor', area, `1 pass over ${Math.round(area).toLocaleString('en-IE')} m²`));
      if (!essential) acts.push(task('feed', 'Autumn feed', 'Low nitrogen, high potash feed at 35 g/m² to harden the grass for winter.', 'fert_autumn', fertBags(area, 35), `${fertBags(area, 35)} bags at 35 g/m²`));
    }
    if (m === 11) {
      focus = 'Into winter';
      mowing = 'Top at 40 mm if growing';
      conditions = 'Soil cooling, ground getting wet';
      acts.push(task('aerate', poorDrainage || elite ? 'Slit the pitch every 3 to 4 weeks' : 'Solid tine after the last matches', 'Only when the surface is not waterlogged. This keeps water moving down through winter.'));
      acts.push(task('repair', 'Replace divots after every match', 'Small daily care now saves big repair bills in spring.'));
    }

    // Renovation month: the big job of the year
    if (isReno) {
      focus = elite ? 'Full pitch renovation' : essential ? 'Repair the worn areas' : 'End of season renovation';
      const renoJobs = essential
        ? [
            task('scarify', `Rake out the ${goalWords}`, 'Rake hard with a spring tine rake to pull out dead grass and loosen the top so seed can get in. A club work night can do it.'),
            task('overseed', `Overseed the ${goalWords}`, 'Sow at 50 g/m² in two directions and rake it in. Keep play off the seeded areas for 3 to 4 weeks if you can.', 'seed_sports', seedBags(wear / 2, 50), `${seedBags(wear / 2, 50)} bags over about ${Math.round(wear / 2)} m²`),
            task('topdress', 'Cover the seed with sand', 'Spread sand at about 5 kg/m² over the seeded areas so the seed is covered and stays moist.', 'sand_topdress', sandBags(wear / 2, 5), `${sandBags(wear / 2, 5)} tonne bags`)
          ]
        : [
            task('scarify', elite ? 'Scarify and hollow tine the whole pitch' : 'Scarify and hollow tine', 'Scarify in two directions to remove dead grass, then hollow tine and clear the cores. A contractor usually does this in a day.', 'aeration_contractor', area, `${Math.round(area).toLocaleString('en-IE')} m²`),
            task('feed', elite ? 'Pre seed feed on the whole pitch' : 'Pre seed feed on the worn areas', 'Spread at 30 g/m² just before seeding so new roots have phosphate.', 'fert_preseed', fertBags(elite ? area : wear, 30), `${fertBags(elite ? area : wear, 30)} bags`),
            task('overseed', `Overseed the ${goalWords} and thin areas`, 'Sow at 50 g/m² in two directions, then drag mat or rake the seed into the holes.', 'seed_sports', seedBags(wear, 50), `${seedBags(wear, 50)} bags over about ${Math.round(wear)} m²`),
            ...(elite
              ? [task('overseed', 'Overseed the rest of the pitch', 'Sow at 35 g/m² over the whole pitch so the sward is dense and even from end to end.', 'seed_sports', seedBags(area, 35), `${seedBags(area, 35)} bags at 35 g/m²`)]
              : []),
            task('topdress', elite ? 'Top dress the whole pitch' : 'Top dress the repaired areas', elite ? 'Spread sand at about 3 kg/m² over the whole pitch and drag mat it in. It levels the surface and helps drainage.' : 'Spread sand at about 5 kg/m² over the seeded areas and work it in so the seed is covered.', 'sand_topdress', elite ? sandBags(area, 3) : sandBags(wear, 5), `${elite ? sandBags(area, 3) : sandBags(wear, 5)} tonne bags`)
          ];
      acts.unshift(...renoJobs);
      conditions = conditions || 'Keep play off for 3 to 4 weeks after seeding if you can';
    }

    // Busy months: protect the surface
    if (isBusy && !isReno && m >= 3 && m <= 10) {
      acts.push(task('repair', 'Divot and repair after each match', `Focus on the ${goalWords}${weakZones ? ` and zones ${weakZones} from the analysis` : ''}.`));
    }

    return { focus, mowing, conditions, busy: isBusy, renovation: isReno, actions: acts };
  };

  return months.map((ym) => ({ month: ym, ...plan(Number(ym.slice(5, 7))) }));
}

// ---------- Golf greens ----------
function golfProgramme({ pr, costs, months, level }) {
  const essential = level === 'essential';
  const elite = level === 'elite';
  const area = costs.areaM2; // all greens together
  const pouches = Math.max(1, Math.ceil(area / 2000));
  const coring = new Set(pr.coringMonths || [3, 9]);
  const sandBags = (kg) => Math.max(1, Math.ceil((area * kg) / 1000));
  const sandBased = pr.greensType === 'sand';

  const bio = (extra = '') =>
    task(
      'biostimulant',
      `Apply Oramara Turf Biostimulant${extra}`,
      `Use ${pouches} pouches across all greens in a light spray, every 2 to 3 weeks while the grass is growing. Spray early in the morning once the dew is off.`,
      'oramara_pouch',
      pouches,
      `${pouches} pouches over about ${Math.round(area).toLocaleString('en-IE')} m² of greens`
    );

  const plan = (m) => {
    const acts = [];
    let focus = '';
    let mowing = '';
    let conditions = '';
    if (m === 12 || m === 1 || m === 2) {
      focus = 'Winter greens';
      mowing = '5 to 6 mm, only when growing';
      conditions = 'Keep off when frozen or frosty';
      acts.push(task('rest', 'Use temporary greens on frosty mornings', 'Walking on frozen grass bruises the leaf and leaves dead footprints in spring.'));
      acts.push(task('aerate', 'Solid tine or sarel roll when firm', 'Keeps the surface draining through winter.'));
      if (m === 2) acts.push(task('soil_test', 'Soil test the greens', 'One mixed sample from several greens for pH and nutrients.', 'soil_test', 1, '1 sample'));
    }
    if (m >= 3 && m <= 10) {
      const summer = m >= 5 && m <= 8;
      focus = m === 3 ? 'Spring start' : summer ? 'Playing season' : 'Autumn recovery';
      mowing = summer ? '3.5 to 4 mm, daily in peak growth' : '4 to 5 mm';
      conditions = summer ? 'Watch moisture levels on hot days' : 'Growth steady';
      acts.push(bio(m === 3 ? ', first of the season' : ''));
      if (!essential) acts.push(bio(', second application this month'));
      acts.push(task('topdress', 'Light top dressing', 'Spread a light dusting of sand and brush it in so the surface stays smooth and firm.', 'sand_topdress', sandBags(1), `about 1 kg/m², ${sandBags(1)} tonne bags`));
    }
    if (coring.has(m)) {
      focus = 'Hollow coring';
      acts.unshift(task('aerate', 'Hollow core the greens', 'Core, clear the plugs, then top dress heavily and brush in to fill the holes. Close greens for a few days.', 'sand_topdress', sandBags(3), `about 3 kg/m², ${sandBags(3)} tonne bags`));
      if (m >= 8) acts.push(task('overseed', 'Overseed with fescue and bent', `Sow at about 20 g/m² straight after coring so seed drops into the holes.${sandBased ? ' Sand based greens dry out fast, so keep the seed moist.' : ''}`, 'seed_fescue_bent', Math.max(1, Math.ceil((area * 20) / 20000)), 'about 20 g/m²'));
    }
    if (m === 4 || m === 9) acts.push(task('feed', m === 4 ? 'Light spring feed' : 'Light autumn feed', 'Little and often on greens: a light granular or liquid feed at the label rate.'));
    if (elite && m >= 5 && m <= 9) acts.push(task('feed', 'Light liquid feed', 'A light liquid feed every 2 weeks keeps colour and recovery steady through the playing season.'));
    if (m === 6 || m === 7 || (elite && (m === 5 || m === 8))) acts.push(task('scarify', 'Verti cut lightly', 'A light verti cut every 2 to 3 weeks keeps the surface true and reduces thatch.'));
    return { focus, mowing, conditions, busy: m >= 4 && m <= 10, renovation: coring.has(m), actions: acts };
  };

  return months.map((ym) => ({ month: ym, ...plan(Number(ym.slice(5, 7))) }));
}

// Compact plan for Claude to tailor
export function programmeForPrompt(programme) {
  return programme
    .map((m) => `${m.month} (${MONTH[Number(m.month.slice(5, 7))]}): ${m.focus}. Mow ${m.mowing}. ${m.actions.map((a) => `[${a.type}] ${a.what}${a.product ? ` {${a.product} x ${a.qty}}` : ''}`).join('; ')}`)
    .join('\n');
}