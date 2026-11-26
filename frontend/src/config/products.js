// oramara/frontend/src/config/products.js
// Product formats, uses and dose rates. Everything on the site reads from here.
// Dose rates are placeholders (about 1 kg per hectare in about 500 L of water) until your own trials set them.

export const RATE = {
    kgPerHectare: 1,
    waterLitresPerHectare: 500
  };
  
  export const FORMATS = [
    {
      id: 'pouch',
      name: 'Dose Pouches',
      size: '200 g dissolvable pouch',
      dose: '1 pouch per 100 L of water',
      covers: 'about 2,000 m² per pouch',
      bestFor: 'Pitches, greens and any boom or tank sprayer',
      pack: 'Box of 10 pouches',
      price: 95,
      unitGrams: 200,
      unitLitres: 100
    },
    {
      id: 'tablet',
      name: 'Tablets',
      size: '20 g fizzing tablet',
      dose: '1 tablet per 10 L of water',
      covers: 'about 200 m² per tablet',
      bestFor: 'Knapsack sprayers, watering cans, goalmouths and gardens',
      pack: 'Tube of 20 tablets',
      price: 29,
      unitGrams: 20,
      unitLitres: 10
    },
    {
      id: 'bulk',
      name: 'Bulk Tub',
      size: '10 kg tub in 5 measured sections',
      dose: '1 section per 1,000 L tank',
      covers: 'about 2 hectares per section',
      bestFor: 'Contractors, councils, large estates and farms',
      pack: '10 kg tub',
      price: 399,
      unitGrams: 2000,
      unitLitres: 1000
    }
  ];
  
  export const USES = [
    { id: 'gaa', name: 'GAA', detail: 'Full size pitch plus surrounds', areaHa: 1.3 },
    { id: 'soccer', name: 'Soccer', detail: 'Full pitch and run offs', areaHa: 0.75 },
    { id: 'rugby', name: 'Rugby', detail: 'Field of play and in goal areas', areaHa: 1.0 },
    { id: 'golf', name: 'Golf', detail: 'All 18 greens', areaHa: 1.0 }
  ];
  
  export const COMING_SOON = ['Home lawns and gardens', 'Grassland and farms', 'Horticulture'];
  
  export function doseFor({ areaHa, format }) {
    const grams = areaHa * RATE.kgPerHectare * 1000;
    const units = Math.max(1, Math.ceil(grams / format.unitGrams));
    return {
      units,
      waterLitres: Math.round(units * format.unitLitres),
      kg: Math.round((units * format.unitGrams) / 100) / 10
    };
  }