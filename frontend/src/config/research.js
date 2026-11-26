// oramara/frontend/src/config/research.js
// Independent studies on seaweed extracts in turf and plants. None of these tested Oramara.
// Keep summaries in your own words and link to the original.

export const STUDIES = [
    {
      title: 'Kelp helps root mass in turf',
      who: 'Butler, Frank and Hunter',
      where: 'University College Dublin golf green, 2005. Published in Golf Course Management, 2007',
      tag: 'Irish field trial',
      found:
        'A seaweed extract sprayed every two weeks lowered leaf proline, a marker of plant stress, and raised nitrate in the rootzone. Root mass and soil organic matter rose only where fertiliser was cut back by a third.',
      meaning: 'Promising signs for stress tolerance and for getting more from less fertiliser, though the authors call for more research.',
      url: 'https://archive.lib.msu.edu/tic/golfd/article/2007sep74.pdf'
    },
    {
      title: 'Seaweed and humic extracts linked to cytokinins and drought resistance',
      who: 'Zhang and Ervin, Virginia Tech',
      where: 'Crop Science, 2004. Creeping bentgrass under drought in a greenhouse',
      tag: 'Drought',
      found:
        'Seaweed extract and humic acid were found to contain cytokinins (natural plant growth hormones), and treated grass had higher cytokinin levels, which the authors link to better drought resistance.',
      meaning: 'Gives a plausible reason why seaweed can help grass cope with dry spells.',
      url: 'https://doi.org/10.2135/cropsci2004.1737'
    },
    {
      title: 'Seaweed extract and summer heat stress on putting greens',
      who: 'Ervin, summarising Zhang and Ervin (Crop Science, 2008)',
      where: 'Creeping bentgrass held under 35°C heat stress for 42 days',
      tag: 'Heat',
      found:
        'Spraying seaweed extract every 14 days kept leaf cytokinin levels close to unstressed grass and 42% higher than stressed grass that was not treated, along with better root viability.',
      meaning: 'Supports using seaweed ahead of and during stressful weather.',
      url: 'https://www.golfdom.com/?p=10334'
    },
    {
      title: 'Seaweed extracts and turf under drought and salt',
      who: 'Elansary and colleagues',
      where: 'Frontiers in Plant Science, 2017. Seashore paspalum in containers',
      tag: 'Drought and salt',
      found:
        'Ascophyllum nodosum extract improved turf quality, photosynthetic efficiency, root length and root dry weight when watering was stretched out and under salt stress.',
      meaning: 'Relevant to coastal and exposed sites where salt spray and dry winds stress turf.',
      url: 'https://www.frontiersin.org/journals/plant-science/articles/10.3389/fpls.2017.00830/full'
    },
    {
      title: 'How seaweed is processed changes what it does',
      who: 'Owen, Williams and Hiltz',
      where: 'Rasen Turf Gazon, 2020. Perennial ryegrass rooting',
      tag: 'Processing',
      found:
        'Four extraction methods applied to the same seaweed produced chemically different extracts, and only one of them increased ryegrass root length and root volume over untreated grass.',
      meaning: 'The process matters as much as the seaweed. This is why we test and log every batch.',
      url: 'https://multisite-assets.icl-growingsolutions.com/wp-content/uploads/2026/09/07072705/OWEN-et-al._Rasen_3-2020-1.pdf'
    },
    {
      title: 'Seaweed extract on mature home lawns',
      who: 'HortScience, 2017',
      where: 'Three years of field trials on Kentucky bluegrass and tall fescue lawns in Connecticut',
      tag: 'Mixed result',
      found:
        'With no extreme heat or drought during the trial, seaweed extracts made no measurable difference to lawn greenness on mature, longer cut grass.',
      meaning: 'Seaweed earns its keep under stress and heavy use, not on healthy grass that is already doing well.',
      url: 'https://journals.ashs.org/view/journals/hortsci/52/11/article-p1615.xml'
    },
    {
      title: 'Seaweed extracts as biostimulants in horticulture (review)',
      who: 'Battacharyya and colleagues',
      where: 'Scientia Horticulturae, 2015',
      tag: 'Review',
      found:
        'Brown seaweed extracts are widely used for plant growth and tolerance to salt, temperature extremes, nutrient shortage and drought. They contain complex sugars, fatty acids, vitamins, plant hormones and minerals.',
      meaning: 'A good overview of why seaweed works and where it is used beyond turf.',
      url: 'https://doi.org/10.1016/j.scienta.2015.09.012'
    }
  ];
  
  export const EVIDENCE_SUMMARY = {
    strong: [
      'Better tolerance to drought, heat and salt stress in many trials',
      'Natural plant hormones that support roots and recovery',
      'Root growth benefits, especially where fertiliser is reduced'
    ],
    weaker: [
      'Little visible difference on healthy grass with no stress',
      'Results depend heavily on how the seaweed is processed',
      'Many trials are in greenhouses rather than on real pitches'
    ]
  };