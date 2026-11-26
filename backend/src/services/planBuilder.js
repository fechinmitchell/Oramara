// oramara/backend/src/services/planBuilder.js
// Turns analysis results into plain language advice for the meeting pack.
// Wording is "where to look", never a diagnosis, and never claims to treat disease or pests.

import { PITCH_TYPES, POUCH_GRAMS, SPRAYS_PER_SEASON } from './constants.js';
import { costPlan, pouchesFor } from './catalogue.js';
import { buildProgramme, buildProgrammes, profileFor } from './programme.js';

export function nextMonths(n) {
  const d = new Date();
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1 + i, 1)).toISOString().slice(0, 7));
}

export function buildPlan({ pitchType, score, stressedPct, zones, areaM2, profile, period = 12 }) {
  const base = PITCH_TYPES[pitchType] || PITCH_TYPES.gaa;
  const area = areaM2 || base.areaHa * 10000;
  const pitch = { ...base, pouches: pouchesFor(area) }; // pouches follow the measured area
  const fullProfile = profileFor(pitchType, profile);
  const costs = costPlan({ pitchType, areaM2: area, weakPct: stressedPct, profile: fullProfile });
  if (pitchType === 'golf') pitch.pouches = costs.pouchesPerSpray;

  return {
    pitch,
    headline: headline(score),
    zoneNotes: zones.map((z) => ({ ...z, ...zoneAdvice(z) })),
    priorities: priorities({ stressedPct, zones }),
    season: seasonPlan(pitch),
    product: {
      pouchesPerSpray: pitch.pouches,
      pouchGrams: POUCH_GRAMS,
      waterLitres: pitch.pouches * 100,
      spraysPerSeason: SPRAYS_PER_SEASON,
      pouchesPerSeason: pitch.pouches * SPRAYS_PER_SEASON
    },
    costs,
    profile: fullProfile,
    programme: buildProgramme({ pitchType, profile: fullProfile, costs, months: nextMonths(period), zones }),
    // Essential, standard and elite versions of the same months, for the level switch in the report
    programmes: buildProgrammes({ pitchType, profile: fullProfile, costs, months: nextMonths(period), zones })
  };
}

function headline(score) {
  if (score >= 80) return 'Strong surface overall. Focus on keeping wear areas recovering through the season.';
  if (score >= 65) return 'Good base with clear wear areas. Targeted work now will pay off by mid season.';
  if (score >= 50) return 'Noticeable stress across parts of the pitch. A recovery programme is recommended.';
  return 'Significant stress across the surface. Start a recovery programme as soon as grass is growing.';
}

function zoneAdvice(z) {
  const goalEnd = (z.row === 0 || z.row === 2) && z.col === 1;
  const centre = z.row === 1 && z.col === 1;
  const side = z.col !== 1;

  if (goalEnd) {
    return {
      likely: 'Goalmouth and end line wear from heavy traffic',
      actions: ['Divot and overseed after every match', 'Move goalkeeper and shooting drills around', 'Apply the biostimulant to support recovery after repairs']
    };
  }
  if (centre) {
    return {
      likely: 'Central channel wear and compaction from training and play',
      actions: ['Aerate when the ground is dry enough', 'Rotate training areas off the centre', 'Apply the biostimulant before and after busy weeks']
    };
  }
  if (side) {
    return {
      likely: 'Could be wet ground, shade or wear along a sideline',
      actions: ['Walk it after heavy rain and check for standing water', 'Check drains and outfalls on this side', 'Overseed thin patches in spring or autumn']
    };
  }
  return {
    likely: 'Patchy growth worth checking on the ground',
    actions: ['Check on foot for compaction or wet spots', 'Overseed thin areas', 'Apply the biostimulant to support recovery']
  };
}

function priorities({ stressedPct, zones }) {
  const list = [];
  if (stressedPct >= 20) list.push('Start a recovery programme now: apply Oramara Turf Biostimulant every 3 to 4 weeks while grass is growing.');
  else list.push('Keep a steady Oramara Turf Biostimulant programme every 3 to 4 weeks from March to October.');
  if (zones.some((z) => (z.row === 0 || z.row === 2) && z.col === 1)) list.push('Repair and overseed goalmouths before the next block of matches.');
  if (zones.some((z) => z.row === 1)) list.push('Aerate the central channel when ground conditions allow.');
  list.push('Get a soil test (pH and nutrients) once a year to guide lime and fertiliser.');
  list.push('Recheck the pitch snapshot in 4 to 6 weeks to track progress.');
  return list;
}

function seasonPlan(pitch) {
  const box = `${pitch.pouches} pouches`;
  return [
    { month: 'Feb', tasks: ['Soil test', 'Baseline pitch snapshot'] },
    { month: 'Mar', tasks: [`First biostimulant application (${box}) once grass is growing`, 'Lime if soil test shows low pH', 'Spring fertiliser'] },
    { month: 'Apr', tasks: [`Biostimulant (${box})`, 'Aerate if dry enough', 'Divot repairs after matches'] },
    { month: 'May', tasks: [`Biostimulant (${box})`, 'Goalmouth overseeding'] },
    { month: 'Jun', tasks: [`Biostimulant (${box})`, 'Watch for drought stress'] },
    { month: 'Jul', tasks: [`Biostimulant (${box})`, 'Rotate training areas'] },
    { month: 'Aug', tasks: [`Biostimulant (${box})`, 'Midseason snapshot'] },
    { month: 'Sep', tasks: [`Biostimulant (${box})`, 'End of season renovation: scarify, overseed, topdress'] },
    { month: 'Oct', tasks: [`Final biostimulant application (${box}) to help new seed establish`, 'Autumn fertiliser', 'End of season snapshot'] },
    { month: 'Nov to Jan', tasks: ['Stay off waterlogged ground', 'Divot repairs', 'Plan next season'] }
  ];
}