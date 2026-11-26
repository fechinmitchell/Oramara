// oramara/backend/src/services/catalogue.js
// Products used in the care programme, with prices and links, and the cost plan for a pitch.
// Prices are in euro including VAT, checked November 2026. UK prices were converted at about 1.17.
// They move, so update them here and every report picks them up. Links are for reference, not partners.

export const PRICES_CHECKED = 'November 2026';

export const CATALOGUE = {
  oramara_pouch: {
    name: 'Oramara Turf Biostimulant, Dose Pouch',
    category: 'Biostimulant',
    short: 'Turf Biostimulant',
    unit: 'box of 10 pouches',
    price: 95,
    rate: '1 pouch (200 g) per 100 L of water, covers about 2,000 m²',
    why: 'A natural Irish seaweed biostimulant, not a fertiliser: it helps the grass use the nutrients already there, root deeper, cope with dry spells and recover faster from wear. Applied every 3 to 4 weeks from March to October.',
    link: 'https://oramara.ie/#formats',
    ours: true
  },
  seed_sports: {
    name: 'Sports pitch ryegrass seed, 20 kg (for example Premier Sports Pitch)',
    category: 'Grass seed',
    unit: '20 kg bag',
    price: 115,
    rate: '50 g/m² for worn areas, 35 g/m² to overseed a whole pitch',
    why: 'Hard wearing perennial ryegrass that germinates fast, the standard for repairing GAA, soccer and rugby pitches.',
    link: 'https://www.agrigem.co.uk/premier-sports-pitch-grass-seed-20kg'
  },
  seed_fescue_bent: {
    name: 'Fine turf seed for greens (fescue and bent), 20 kg',
    category: 'Grass seed',
    unit: '20 kg bag',
    price: 190,
    rate: '15 to 25 g/m² overseeding greens',
    why: 'Fine leaved grasses that suit close mown golf greens.',
    link: 'https://www.pitchcare.com/collections/grass-seed'
  },
  fert_preseed: {
    name: 'ICL Sportsmaster Renovate Pro, 25 kg (pre seed and renovation feed)',
    category: 'Fertiliser',
    unit: '25 kg bag',
    price: 59.95,
    rate: '20 to 35 g/m², one bag covers 714 to 1,250 m²',
    why: 'Higher phosphate feed that helps new seed root and establish after overseeding.',
    link: 'https://www.ganlys.ie/products/sportsmaster-renovate-pro-25kg-scre25'
  },
  fert_spring: {
    name: 'ICL Sportsmaster Spring & Summer 9-7-7, 25 kg',
    category: 'Fertiliser',
    unit: '25 kg bag',
    price: 48,
    rate: '35 g/m², one bag covers 714 m²',
    why: 'Balanced feed to get growth going in spring. Lasts about 6 weeks.',
    link: 'https://www.pitchcare.com/products/icl-sportsmaster-spring-summer-9-7-7-25-kg'
  },
  fert_autumn: {
    name: 'ICL Sportsmaster Autumn 4-12-12, 25 kg',
    category: 'Fertiliser',
    unit: '25 kg bag',
    price: 48,
    rate: '35 g/m², one bag covers 714 m²',
    why: 'Low nitrogen, higher potash feed to harden the grass before winter.',
    link: 'https://www.pitchcare.com/products/icl-sportsmaster-autumn-4-12-12-25-kg'
  },
  sand_topdress: {
    name: 'Lawn sand for top dressing, 1 tonne bag (plus about €40 delivery)',
    category: 'Top dressing',
    unit: '1 tonne bag',
    price: 75,
    rate: 'About 5 kg/m² over repaired goalmouths, more for a full renovation',
    why: 'Fills holes after hollow tining and covers new seed so it beds in and drains well. GAA clubs can also use the GAA sand supply deal.',
    link: 'https://howbertandmays.ie/products/lawn-sand-for-top-dressing-1-ton-bag'
  },
  aeration_contractor: {
    name: 'Deep tine aeration (Verti-drain) by a contractor',
    category: 'Service',
    unit: 'm²',
    price: 0.09,
    rate: 'About €0.09 per m² per pass, based on a published contractor rate. Get local quotes.',
    why: 'Relieves compaction so water drains and roots go deeper. Best in spring and autumn when the ground is moist, not waterlogged.',
    link: null
  },
  soil_test: {
    name: 'Soil test (pH, phosphate, potash, organic matter)',
    category: 'Service',
    unit: 'test',
    price: null,
    rate: 'One sample per pitch each year',
    why: 'Shows whether the pitch needs lime and which feed to use, so you do not waste money on the wrong fertiliser.',
    link: null
  }
};

// Typical high wear area: both goalmouths plus the centre, in m²
const WEAR_AREA = { gaa: 700, soccer: 500, rugby: 600, golf: 0 };
const SPRAYS = 8;

// Works out what this pitch needs over a season and roughly what it costs.
// essential: the core programme. optional: worth doing if the budget allows.
// One pouch per 2,000 m², so bigger pitches get more
export const pouchesFor = (areaM2) => Math.max(1, Math.ceil((Number(areaM2) || 13000) / 2000));

export function costPlan({ pitchType = 'gaa', areaM2, weakPct = 0, profile = {} }) {
  const golf = pitchType === 'golf';
  // Golf: cost all the greens. The measured area is usually one green; assume 500 m² if it looks bigger.
  const greenSize = Number(areaM2) > 0 && Number(areaM2) < 2000 ? Number(areaM2) : 500;
  const greens = Number(profile.greens) || 18;
  const area = golf ? greens * greenSize : Math.max(500, Number(areaM2) || 13000);
  const pouchesPerSpray = pouchesFor(area);
  // Wear area to repair: the usual goalmouths and centre, more if the photo shows a lot of thin turf,
  // but never more than double the usual (thin turf in an old photo is not all repair work)
  const base = WEAR_AREA[pitchType] || 600;
  const wear = golf ? Math.round(area * 0.1) : Math.min(base * 2, Math.max(base, Math.round((area * weakPct) / 100)));
  const ceil = (v) => Math.max(1, Math.ceil(v));

  const lines = [];
  const add = (id, qty, task, use, optional = false, shownQty = null) => {
    const p = CATALOGUE[id];
    lines.push({
      id,
      task,
      shownQty,
      name: p.name,
      category: p.category,
      use,
      qty,
      unit: p.unit,
      unitPrice: p.price,
      total: p.price === null ? null : Math.round(qty * p.price * 100) / 100,
      optional,
      ours: Boolean(p.ours),
      rate: p.rate,
      why: p.why,
      link: p.link
    });
  };

  const extra = golf ? 0 : ceil(wear / 2000);
  const applications = golf ? 16 : SPRAYS; // greens get light applications every 2 weeks
  const pouches = pouchesPerSpray * applications + extra;
  add(
    'oramara_pouch',
    ceil(pouches / 10),
    'Biostimulant programme',
    golf
      ? `${pouches} pouches: ${pouchesPerSpray} per application over ${greens} greens, ${applications} light applications from March to October`
      : `${pouches} pouches: ${pouchesPerSpray} per application, ${applications} applications from March to October, plus ${extra} for an extra application over repaired areas 2 weeks after seeding`
  );

  if (golf) {
    add('seed_fescue_bent', ceil((area * 0.02) / 20), 'Overseeding greens', 'Overseed greens in late August or September at about 20 g/m²');
  } else {
    add('seed_sports', ceil((wear * 0.05 * 2) / 20), 'Goalmouth and wear repairs', `About ${wear.toLocaleString('en-IE')} m² of worn areas, twice a year at 50 g/m²`);
    add('seed_sports', ceil((area * 0.035) / 20), 'Full pitch overseed', 'Whole pitch at 35 g/m² in the end of season renovation, if the budget allows', true);
  }

  if (!golf) add('fert_spring', ceil((area * 0.035) / 25), 'Spring feed', 'One spring feed at 35 g/m² once growth starts');
  if (!golf) add('fert_autumn', ceil((area * 0.035) / 25), 'Autumn feed', 'One autumn feed at 35 g/m² in September or October');
  if (!golf) add('fert_preseed', ceil((wear * 0.03) / 25), 'Feed for new seed', 'Pre seed feed at 30 g/m² on the repaired areas');

  if (golf) {
    add('sand_topdress', ceil((area * 8) / 1000), 'Greens top dressing', 'Light monthly dressings plus heavier dressing after coring, about 8 kg/m² a year. Bulk loads cost less than bags.');
  } else {
    add('sand_topdress', ceil((wear * 5) / 1000), 'Top dressing repairs', 'Top dress repaired areas at about 5 kg/m²');
  }
  if (!golf) add('aeration_contractor', area * 2, 'Deep aeration', 'Two deep tine passes a year, spring and autumn', true, `2 passes of ${Math.round(area).toLocaleString('en-IE')} m²`);
  add('soil_test', 1, 'Soil test', 'Once a year, ideally in February');

  const sum = (list) => Math.round(list.reduce((s, l) => s + (l.total || 0), 0));
  const essential = lines.filter((l) => !l.optional);
  const optional = lines.filter((l) => l.optional);

  return {
    lines,
    pouchesPerSpray,
    applications,
    greens: golf ? greens : null,
    // cost of one unit as used in programme tasks (Oramara per pouch, others per pack)
    unitCosts: Object.fromEntries(
      Object.entries(CATALOGUE).map(([id, p]) => [id, p.price === null ? null : id === 'oramara_pouch' ? p.price / 10 : p.price])
    ),
    wearAreaM2: wear,
    areaM2: Math.round(area),
    totals: {
      oramara: sum(lines.filter((l) => l.ours)),
      essential: sum(essential),
      optional: sum(optional),
      all: sum(lines)
    },
    pricesChecked: PRICES_CHECKED
  };
}

// Short product list for Claude, so programme tasks can name the right product and amount
export function catalogueForPrompt(plan) {
  return plan.lines
    .filter((l, i, arr) => arr.findIndex((x) => x.id === l.id) === i)
    .map((l) => `${l.id}: ${l.name}. Rate: ${l.rate}.`)
    .join('\n');
}