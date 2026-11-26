// oramara/backend/src/services/constants.js

export const LEAD_TYPES = ['gaa', 'soccer', 'rugby', 'golf', 'council', 'school', 'farm', 'other'];

export const LEAD_STATUSES = ['new', 'contacted', 'meeting', 'trial', 'customer', 'lost'];

export const COUNTIES = [
  'Antrim', 'Armagh', 'Carlow', 'Cavan', 'Clare', 'Cork', 'Derry', 'Donegal', 'Down', 'Dublin',
  'Fermanagh', 'Galway', 'Kerry', 'Kildare', 'Kilkenny', 'Laois', 'Leitrim', 'Limerick', 'Longford',
  'Louth', 'Mayo', 'Meath', 'Monaghan', 'Offaly', 'Roscommon', 'Sligo', 'Tipperary', 'Tyrone',
  'Waterford', 'Westmeath', 'Wexford', 'Wicklow'
];

// Placeholder dose until our own trials set the real rate: about 1 kg per hectare per spray.
// One Dose Pouch (200 g) treats about 2,000 m2 in 100 L of water.
export const POUCH_GRAMS = 200;
export const SPRAYS_PER_SEASON = 8;

export const PITCH_TYPES = {
  gaa: { label: 'GAA pitch', areaHa: 1.3, pouches: 7 },
  soccer: { label: 'Soccer pitch', areaHa: 0.75, pouches: 4 },
  rugby: { label: 'Rugby pitch', areaHa: 1.0, pouches: 5 },
  golf: { label: 'Golf greens', areaHa: 1.0, pouches: 5 }
};