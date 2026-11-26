// oramara/frontend/src/config/clifdenReport.js
// A real FieldFalcon analysis of the main pitch at Clifden GAA, Co. Galway, shown on the FieldFalcon page.
// Made with the same pipeline as the admin analysis (backend/src/services/imagery.js and turfAnalysis.js):
// Esri World Imagery photo at zoom 19, satellite greenness scale, 3 m inset and 8 m edge band.
// The pitch outline was marked by hand on the photo. Images live in public/images/fieldfalcon.
// The picture is turned a quarter turn so the pitch lies across the page: north is on the left.

export const CLIFDEN_REPORT = {
  club: 'Clifden GAA',
  place: 'Clifden, Co. Galway',
  pitch: 'Main grass pitch',
  photoDate: '14 May 2025',
  photoSource: 'Esri World Imagery',
  resolutionCm: 34,
  areaM2: 9478,
  score: 89,
  healthy: 96.9,
  moderate: 2.6,
  stressed: 0.5,
  photo: '/images/fieldfalcon/clifden-photo.webp',
  healthMap: '/images/fieldfalcon/clifden-health-map.webp',
  width: 884,
  height: 668,
  zones: [
    {
      letter: 'A',
      label: 'Car park end goalmouth',
      share: 19,
      likely: 'Thinner turf right in front of the posts, the usual pattern from shooting and goalkeeper drills.',
      action: 'Divot and overseed the goalmouth after matches, move drills off the line in training and spray to support recovery.'
    },
    {
      letter: 'B',
      label: 'Far end, top corner',
      share: 13,
      likely: 'A patch a little paler than the rest of the pitch. Could be a dry spot, shade from the hedge or wear from warm ups.',
      action: 'Walk it after a dry spell and after heavy rain to see which it is before deciding on a fix.'
    }
  ]
};
