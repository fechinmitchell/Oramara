// oramara/backend/src/services/turfAnalysis.js
// Turf vigour map from an ordinary colour (RGB) aerial photo or satellite screenshot.
// Uses the Excess Green index: (2G - R - B) / (R + G + B).
// This measures how green the photo looks, not plant health directly.
// Compare like with like: same image source, similar light and season.

import sharp from 'sharp';

const MAX_WIDTH = 1600;
// Greenness calibration. Phone and drone photos are brighter than satellite tiles,
// so satellite imagery uses its own scale (passed in from the map analysis).
const EXG_LOW = 0.15; // treated as bare or very stressed turf
const EXG_HIGH = 0.5; // treated as fully healthy turf
export const SATELLITE_SCALE = { exgLow: 0.06, exgHigh: 0.32 };
const HEALTHY = 0.7;
const MODERATE = 0.45;
const OVERLAY_ALPHA = 0.58;
const ZONE_THRESHOLD = 0.12;
const RELATIVE_DROP = 0.15; // this much below the pitch's own typical greenness counts as a weak patch

const STOPS = [
  [0.0, [190, 35, 35]],
  [0.35, [214, 58, 48]],
  [0.5, [214, 170, 50]],
  [0.7, [60, 170, 80]],
  [1.0, [28, 135, 68]]
];

const ROWS = ['Top end', 'Middle', 'Bottom end'];
const COLS = ['left side', 'centre', 'right side'];
const ROWS_ACROSS = ['Left end', 'Middle', 'Right end'];
const COLS_ACROSS = ['top side', 'centre', 'bottom side'];

// Options:
//   exgLow, exgHigh: greenness calibration (see SATELLITE_SCALE)
//   insetPx: shrink the measured area by this many pixels, so sideline paths, fences and hedges are left out
//   minPixels: smallest measured area allowed (goalmouths are small, so they pass a lower number)
//   edgeBandPx: width of the outer strip (in image pixels) where stands, dugouts, paths and car parks
//     usually sit. Hard surfaces found there are left out, and weak turf there is flagged as edge wear.
//   excludePx: areas marked by hand to leave out (dugouts, a stand, a path), as image pixel polygons
export async function analysePitch(
  buffer,
  polygonInput,
  naturalWidth,
  { exgLow = EXG_LOW, exgHigh = EXG_HIGH, insetPx = 0, minPixels = 500, edgeBandPx = 0, excludePx = [] } = {}
) {
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const W = info.width;
  const H = info.height;
  const scale = naturalWidth ? W / naturalWidth : 1;
  const poly = normalisePolygon(polygonInput).map(([x, y]) => [x * scale, y * scale]);
  if (poly.length < 3) throw userError('Mark at least 3 corners of the pitch');

  // The area we actually measure: the box pulled in from the edges
  const inner = insetPx > 0 ? insetPolygon(poly, insetPx * scale) : poly;
  const mask = polygonMask(inner, W, H);
  // The outer strip next to the boundary, and the playing area inside it
  const coreMask = edgeBandPx > 0 ? polygonMask(insetPolygon(poly, (insetPx + edgeBandPx) * scale), W, H) : null;
  const inEdge = (i) => coreMask && mask[i] && !coreMask[i];
  // Areas marked by hand to leave out
  const excluded = new Uint8Array(W * H);
  const excludePolys = (excludePx || [])
    .map((pg) => normalisePolygon(pg).map(([x, y]) => [x * scale, y * scale]))
    .filter((pg) => pg.length >= 3);
  for (const pg of excludePolys) {
    const m = polygonMask(pg, W, H);
    for (let i = 0; i < W * H; i++) if (m[i]) excluded[i] = 1;
  }

  // Typical brightness of the grass, so a stand's shadow can be told apart from dark turf
  const lumaHist = new Uint32Array(256);
  for (let i = 0, p = 0; i < W * H; i++, p += 3) {
    if (!mask[i]) continue;
    lumaHist[Math.min(255, Math.round(0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]))]++;
  }
  const typicalLuma = percentile(lumaHist, 0.5) || 100;

  // 1. Greenness per pixel, scaled to 0 to 255. White line markings and deep shadow are not grass,
  //    so they are left out of the numbers and filled with the pitch's typical value before smoothing.
  //    skip codes: 1 line paint or shadow, 2 hard surface at the edge (stand, dugout, path, car park), 3 marked by hand
  const green = Buffer.alloc(W * H);
  const skip = new Uint8Array(W * H);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < W * H; i++, p += 3) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const hi = Math.max(r, g, b);
    const lo = Math.min(r, g, b);
    const exg = (2 * g - r - b) / (r + g + b + 1);
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    if (excluded[i]) skip[i] = 3;
    else if ((lo > 165 && hi - lo < 45) || r + g + b < 120) skip[i] = 1; // line paint, or deep shadow
    else if (luma < typicalLuma * 0.55 && b >= r) skip[i] = 1; // shade from a stand, wall or trees: dark and bluish
    else if (inEdge(i)) {
      // Hard surfaces along the edge are not turf: grey (concrete, gravel, tarmac, dugout roofs),
      // blue or red (roofs, seats, tracks). Brown bare soil is kept, because that is worn turf.
      const grey = hi - lo < 22 && exg < 0.05;
      const blue = b > g + 5;
      const red = r - g > 45 && g - b < 25;
      if (grey || blue || red) skip[i] = 2;
    }
    green[i] = Math.round(clamp((exg - exgLow) / (exgHigh - exgLow)) * 255);
    if (mask[i] && !skip[i]) hist[green[i]]++;
  }
  const typical = percentile(hist, 0.5);
  for (let i = 0; i < W * H; i++) if (skip[i]) green[i] = typical;

  // 2. Smooth out mowing stripes and pixel noise
  const smooth = await sharp(green, { raw: { width: W, height: H, channels: 1 } })
    .blur(Math.max(1, W / 220))
    .extractChannel(0)
    .raw()
    .toBuffer();

  // Typical greenness of this pitch after smoothing, so zones can be judged against the pitch itself
  const smoothHist = new Uint32Array(256);
  for (let i = 0; i < W * H; i++) if (mask[i] && !skip[i]) smoothHist[smooth[i]]++;
  const median = percentile(smoothHist, 0.5) / 255;
  const weakBelow = Math.max(MODERATE, median - RELATIVE_DROP);

  // 3. Stats, colour overlay and zone grid
  const out = Buffer.from(data);
  const overlay = Buffer.alloc(W * H * 4); // transparent outside the pitch, for the map
  const toPitch = pitchFrame(poly);
  const cells = Array.from({ length: 9 }, () => ({ total: 0, stressed: 0, edgeStressed: 0, sx: 0, sy: 0 }));

  let total = 0, sum = 0, healthy = 0, moderate = 0, stressed = 0, skipped = 0, removed = 0;
  let edgeTotal = 0, edgeSum = 0, coreTotal = 0, coreSum = 0;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!mask[i]) continue;
      if (skip[i]) {
        if (skip[i] === 1) skipped++;
        else removed++;
        continue;
      }
      const a = smooth[i] / 255;
      total++;
      sum += a;
      const edge = inEdge(i);
      if (edge) {
        edgeTotal++;
        edgeSum += a;
      } else {
        coreTotal++;
        coreSum += a;
      }

      const [u, v] = toPitch(x, y);
      const row = Math.min(2, Math.max(0, Math.floor(v * 3)));
      const col = Math.min(2, Math.max(0, Math.floor(u * 3)));
      const cell = cells[row * 3 + col];
      cell.total++;

      if (a >= HEALTHY) healthy++;
      else if (a >= MODERATE) moderate++;
      else stressed++;

      // Zones: turf that is thin, or clearly weaker than the rest of this pitch
      if (a < weakBelow) {
        cell.stressed++;
        if (edge) cell.edgeStressed++;
        cell.sx += x;
        cell.sy += y;
      }

      const c = colour(a);
      const p = i * 3;
      out[p] = Math.round(data[p] * (1 - OVERLAY_ALPHA) + c[0] * OVERLAY_ALPHA);
      out[p + 1] = Math.round(data[p + 1] * (1 - OVERLAY_ALPHA) + c[1] * OVERLAY_ALPHA);
      out[p + 2] = Math.round(data[p + 2] * (1 - OVERLAY_ALPHA) + c[2] * OVERLAY_ALPHA);
      const o = i * 4;
      overlay[o] = c[0];
      overlay[o + 1] = c[1];
      overlay[o + 2] = c[2];
      overlay[o + 3] = 200;
    }
  }

  if (total < minPixels) throw userError('The marked area is too small. Mark the four corners of the pitch.');

  // 4. Problem zones: pitch thirds (ends, middle, sides) where at least 12% of the turf looks stressed
  const letters = 'ABCD';
  const zones = cells
    .map((c, idx) => ({ ...c, idx, share: c.total ? c.stressed / c.total : 0 }))
    .filter((c) => c.total > total / 30 && c.share >= ZONE_THRESHOLD)
    .sort((a, b) => b.share - a.share)
    .slice(0, 4)
    .map((c, n) => {
      const row = Math.floor(c.idx / 3);
      const col = c.idx % 3;
      return {
        letter: letters[n],
        row,
        col,
        label: row === 1 && col === 1
          ? 'Middle of the pitch'
          : `${(toPitch.horizontal ? ROWS_ACROSS : ROWS)[row]}, ${(toPitch.horizontal ? COLS_ACROSS : COLS)[col]}`,
        stressedPct: round1(c.share * 100),
        // most of the weak turf here is in the outer strip, next to a stand, dugout, path or fence
        edge: Boolean(coreMask) && c.edgeStressed / c.stressed >= 0.6,
        x: Math.round(c.sx / c.stressed),
        y: Math.round(c.sy / c.stressed)
      };
    });

  // 5. Draw outline and zone markers
  const r = Math.max(12, Math.round(W / 45));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <polygon points="${poly.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#ffffff" stroke-width="${Math.max(2, W / 400)}"/>
    ${excludePolys
      .map((pg) => `<polygon points="${pg.map((p) => p.join(',')).join(' ')}" fill="rgba(200,60,50,0.18)" stroke="#e05a4f" stroke-width="${Math.max(2, W / 500)}" stroke-dasharray="${W / 120} ${W / 200}"/>`)
      .join('\n')}
    ${zones
      .map(
        (z) => `<circle cx="${z.x}" cy="${z.y}" r="${r}" fill="#ffffff" stroke="#10181a" stroke-width="${r / 6}"/>
      <text x="${z.x}" y="${z.y + r * 0.38}" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${r * 1.05}" text-anchor="middle" fill="#10181a">${z.letter}</text>`
      )
      .join('\n')}
  </svg>`;

  const heatmap = await sharp(out, { raw: { width: W, height: H, channels: 3 } })
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toBuffer();

  const overlayPng = await sharp(overlay, { raw: { width: W, height: H, channels: 4 } })
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toBuffer();

  const original = await sharp(data, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();

  return {
    width: W,
    height: H,
    polygon: poly.map(([x, y]) => [Math.round(x), Math.round(y)]),
    score: Math.round((sum / total) * 100),
    healthyPct: round1((healthy / total) * 100),
    moderatePct: round1((moderate / total) * 100),
    stressedPct: round1((stressed / total) * 100),
    skippedPct: round1((skipped / Math.max(1, total + skipped)) * 100), // line paint and shadow left out
    removedPct: round1((removed / Math.max(1, total + skipped + removed)) * 100), // hard edges and marked areas left out
    // The outer strip on its own and the playing area inside it, so edge wear is not mistaken for a poor pitch
    edgeScore: edgeTotal ? Math.round((edgeSum / edgeTotal) * 100) : null,
    playScore: coreTotal ? Math.round((coreSum / coreTotal) * 100) : null,
    typicalGreen: Math.round(median * 100),
    zones,
    heatmap,
    overlay: overlayPng,
    original
  };
}

function normalisePolygon(input) {
  const arr = typeof input === 'string' ? JSON.parse(input) : input;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((p) => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p.x), Number(p.y)]))
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
}

function polygonMask(poly, W, H) {
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const yc = y + 0.5;
    const xs = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[j];
      if (y1 > yc !== y2 > yc) xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5));
      const to = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = from; x <= to; x++) mask[y * W + x] = 1;
    }
  }
  return mask;
}

function colour(a) {
  for (let i = 1; i < STOPS.length; i++) {
    const [p1, c1] = STOPS[i];
    if (a <= p1) {
      const [p0, c0] = STOPS[i - 1];
      const t = (a - p0) / (p1 - p0);
      return [0, 1, 2].map((k) => c0[k] + (c1[k] - c0[k]) * t);
    }
  }
  return STOPS[STOPS.length - 1][1];
}

// Maps an image pixel to pitch coordinates: v runs end to end along the long axis (0 to 1),
// u runs side to side (0 to 1). Works for any marked shape; best with the 4 corners in order.
function pitchFrame(poly) {
  let a, b, c, d;
  if (poly.length === 4) {
    const [p0, p1, p2, p3] = poly;
    const edge01 = dist(p0, p1) + dist(p3, p2);
    const edge12 = dist(p1, p2) + dist(p0, p3);
    // Ends are the two shorter edges
    if (edge01 <= edge12) {
      a = mid(p0, p1); b = mid(p3, p2); c = mid(p0, p3); d = mid(p1, p2);
    } else {
      a = mid(p1, p2); b = mid(p0, p3); c = mid(p0, p1); d = mid(p3, p2);
    }
  } else {
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    const [x0, y0, x1, y1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const tall = y1 - y0 >= x1 - x0;
    const cy = (y0 + y1) / 2, cx = (x0 + x1) / 2;
    if (tall) { a = [cx, y0]; b = [cx, y1]; c = [x0, cy]; d = [x1, cy]; }
    else { a = [x0, cy]; b = [x1, cy]; c = [cx, y0]; d = [cx, y1]; }
  }
  // Name the ends and sides as they look in the picture: top and bottom ends for an upright pitch,
  // left and right ends for one lying across the image
  const horizontal = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]);
  if (horizontal ? b[0] < a[0] : b[1] < a[1]) [a, b] = [b, a];
  if (horizontal ? d[1] < c[1] : d[0] < c[0]) [c, d] = [d, c];
  const long = [b[0] - a[0], b[1] - a[1]];
  const wide = [d[0] - c[0], d[1] - c[1]];
  const longLen2 = long[0] ** 2 + long[1] ** 2 || 1;
  const wideLen2 = wide[0] ** 2 + wide[1] ** 2 || 1;
  const frame = (x, y) => [
    ((x - c[0]) * wide[0] + (y - c[1]) * wide[1]) / wideLen2,
    ((x - a[0]) * long[0] + (y - a[1]) * long[1]) / longLen2
  ];
  frame.horizontal = horizontal;
  return frame;
}

function dist(p, q) {
  return Math.hypot(p[0] - q[0], p[1] - q[1]);
}

function mid(p, q) {
  return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
}

function clamp(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function userError(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

// Value at a given share through a 256 bin histogram
function percentile(hist, q) {
  let n = 0;
  for (const c of hist) n += c;
  if (!n) return 128;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += hist[v];
    if (seen >= n * q) return v;
  }
  return 255;
}

// Pull every edge of a convex outline inwards by d pixels. Falls back to the original if it collapses.
function insetPolygon(poly, d) {
  const n = poly.length;
  if (n < 3 || d <= 0) return poly;
  let area = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) area += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  const sign = area > 0 ? 1 : -1;

  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n];
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const len = Math.hypot(dx, dy) || 1;
    // inward normal depends on winding order
    const nx = (-dy / len) * sign, ny = (dx / len) * sign;
    return { p: [p[0] + nx * d, p[1] + ny * d], dir: [dx, dy] };
  });

  const out = [];
  for (let i = 0; i < n; i++) {
    const a = lines[(i - 1 + n) % n];
    const b = lines[i];
    const cross = a.dir[0] * b.dir[1] - a.dir[1] * b.dir[0];
    if (Math.abs(cross) < 1e-9) return poly;
    const t = ((b.p[0] - a.p[0]) * b.dir[1] - (b.p[1] - a.p[1]) * b.dir[0]) / cross;
    out.push([a.p[0] + a.dir[0] * t, a.p[1] + a.dir[1] * t]);
  }

  let newArea = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) newArea += out[j][0] * out[i][1] - out[i][0] * out[j][1];
  return Math.sign(newArea) === Math.sign(area) && Math.abs(newArea) > Math.abs(area) * 0.3 ? out : poly;
}