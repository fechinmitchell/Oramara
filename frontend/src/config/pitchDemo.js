// oramara/frontend/src/config/pitchDemo.js
// Example analysis shown on the Pitches page. This is illustrative demo data, not a real club.

export const PITCH_DEMOS = [
    {
      id: 'gaa',
      name: 'GAA',
      title: 'GAA pitch',
      score: 68,
      healthy: 58,
      moderate: 27,
      stressed: 15,
      zones: [
        { letter: 'A', x: 62, y: 200, r: 58, label: 'Left goalmouth', likely: 'Heavy wear from goalkeeper and shooting drills', action: 'Divot and overseed after every match, then spray to support recovery' },
        { letter: 'B', x: 538, y: 200, r: 55, label: 'Right goalmouth', likely: 'Same wear pattern at the other end', action: 'Move training drills around the end line and repair worn turf' },
        { letter: 'C', x: 300, y: 200, r: 70, label: 'Centre channel', likely: 'Midfield traffic and compaction', action: 'Aerate when dry and rotate training areas off the centre' },
        { letter: 'D', x: 520, y: 345, r: 45, label: 'Bottom right corner', likely: 'Could be wet ground or shade', action: 'Walk it after heavy rain and check drains on that side' }
      ]
    },
    {
      id: 'soccer',
      name: 'Soccer',
      title: 'soccer pitch',
      score: 71,
      healthy: 62,
      moderate: 25,
      stressed: 13,
      zones: [
        { letter: 'A', x: 60, y: 200, r: 55, label: 'Left penalty area', likely: 'Goalmouth wear in front of the posts', action: 'Repair with sod or seed, then spray to help it knit' },
        { letter: 'B', x: 540, y: 200, r: 55, label: 'Right penalty area', likely: 'Goalmouth wear in front of the posts', action: 'Repair with sod or seed, then spray to help it knit' },
        { letter: 'C', x: 300, y: 200, r: 60, label: 'Centre circle', likely: 'Kick offs and midfield traffic', action: 'Aerate and overseed in spring and autumn' }
      ]
    },
    {
      id: 'rugby',
      name: 'Rugby',
      title: 'rugby pitch',
      score: 66,
      healthy: 55,
      moderate: 29,
      stressed: 16,
      zones: [
        { letter: 'A', x: 300, y: 200, r: 75, label: 'Middle of the pitch', likely: 'Scrums and rucks concentrate wear here', action: 'Aerate when dry and overseed thin areas' },
        { letter: 'B', x: 230, y: 40, r: 50, label: 'Top touchline', likely: 'Lineout wear along the touchline', action: 'Vary lineout positions in training and repair turf' },
        { letter: 'C', x: 520, y: 260, r: 50, label: 'Right 22', likely: 'Heavy use in training drills', action: 'Spray before and after busy weeks to support recovery' }
      ]
    },
    {
      id: 'golf',
      name: 'Golf',
      title: 'golf green',
      score: 79,
      healthy: 70,
      moderate: 21,
      stressed: 9,
      zones: [
        { letter: 'A', x: 230, y: 250, r: 50, label: 'Front entry', likely: 'Foot traffic walking on and off the green', action: 'Move traffic routes with ropes and spray to support recovery' },
        { letter: 'B', x: 395, y: 135, r: 45, label: 'Back edge', likely: 'Could be shade from trees or a dry slope', action: 'Check moisture and light on that side of the green' }
      ]
    }
  ];
  
  export const HOW_IT_WORKS = [
    { title: 'We find your pitch', text: 'From satellite imagery, or a drone flight for a closer look. No need to be there.' },
    { title: 'We map its health', text: 'Every part of the surface is scored from strong to stressed and shown as a colour map.' },
    { title: 'You get a plan', text: 'Problem areas are marked with likely causes and simple actions for your grounds team.' },
    { title: 'We track progress', text: 'Follow up reports show how the pitch is recovering through the season.' }
  ];
  
  export const REPORT_CONTENTS = [
    'Health score out of 100',
    'Colour map of the whole surface',
    'Problem zones with likely causes',
    'Simple actions for each zone',
    'Month by month season plan',
    'Recommended seaweed dose for your pitch'
  ];