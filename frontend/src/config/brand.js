// oramara/frontend/src/config/brand.js
// Change the brand here and it updates across the whole site, admin and reports.

export const BRAND = {
  name: 'Oramara',
  irish: 'Ór na Mara',
  meaning: 'gold of the sea',
  tagline: 'Irish seaweed, made simple',
  product: 'Oramara Turf Biostimulant', // the product's full name: never call it a spray or a fertiliser
  domain: 'oramara.ie',
  email: 'hello@oramara.ie',
  phone: '',
  region: 'Connemara, Ireland'
};

// The satellite pitch analysis and reports have their own name, made by Oramara.
// Oramara is the seaweed brand; FieldFalcon is the tech. Change the name here and it updates everywhere.
export const TECH = {
  name: 'FieldFalcon',
  byline: 'by Oramara',
  tagline: 'Your pitch from above'
};

// Subscription and report prices in euro. Placeholders until the first meetings confirm them.
// Format prices live in config/products.js
export const PRICING = {
  subscriptionFrom: 49,
  reportsTwiceYearly: 179,
  reportsMonthly: 199,
  fullYear: 199 // the full 12 months of FieldFalcon analysis and care, offered in the portal
};