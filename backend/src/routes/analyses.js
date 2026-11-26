// oramara/backend/src/routes/analyses.js
import { Router } from 'express';
import multer from 'multer';
import { query } from '../db.js';
import { wrap, badRequest } from './wrap.js';
import { analysePitch, SATELLITE_SCALE } from '../services/turfAnalysis.js';
import { buildPlan } from '../services/planBuilder.js';
import { captureArea, areaM2, photoDate, pixelToLatLon, latLonToPixel } from '../services/imagery.js';
import { findGrounds, autoOutline, overpassCoolingOff } from '../services/overpass.js';
import { writeReport, locatePitch, claudeEnabled, claudeModel, PERIODS } from '../services/claudeReport.js';

const pickPeriod = (v, fallback = 12) => (PERIODS.includes(Number(v)) ? Number(v) : fallback);
import { PITCH_TYPES } from '../services/constants.js';
import { CATALOGUE, costPlan } from '../services/catalogue.js';
import { setUsageContext, linkUsageToAnalysis } from '../usage.js';
import { monthlyNdvi, monthImage, sentinelEnabled } from '../services/sentinel.js';

const CLEAR_ENOUGH = 0.5; // a month needs at least half the pitch cloud free to count

// Month list as the frontend wants it
export function shapeMonth(m) {
  const coverage = Number(m.coverage);
  const ndvi = m.ndvi === null || m.ndvi === undefined ? null : Number(m.ndvi);
  const clear = coverage >= CLEAR_ENOUGH && ndvi !== null;
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  return {
    month: m.month,
    ndvi: clear ? ndvi : null,
    coverage,
    clear,
    strongPct: clear ? num(m.strongPct ?? m.strong_pct) : null,
    moderatePct: clear ? num(m.moderatePct ?? m.moderate_pct) : null,
    thinPct: clear ? num(m.thinPct ?? m.thin_pct) : null
  };
}

async function storeMonths(analysisId, months) {
  for (const m of months) {
    await query(
      `INSERT INTO satellite_months (analysis_id, month, ndvi, coverage, strong_pct, moderate_pct, thin_pct)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (analysis_id, month) DO UPDATE SET
         ndvi = EXCLUDED.ndvi, coverage = EXCLUDED.coverage, strong_pct = EXCLUDED.strong_pct,
         moderate_pct = EXCLUDED.moderate_pct, thin_pct = EXCLUDED.thin_pct, fetched_at = NOW(),
         image_png = CASE WHEN satellite_months.coverage = EXCLUDED.coverage THEN satellite_months.image_png END`,
      [analysisId, m.month, m.ndvi, m.coverage, m.strongPct, m.moderatePct, m.thinPct]
    );
  }
}

// Short lived cache for previews, so dragging and reopening the dropdown does not use up the allowance
const previewCache = new Map();
function cached(key, fn) {
  const hit = previewCache.get(key);
  if (hit && Date.now() - hit.at < 3600e3) return hit.value;
  const value = fn().catch((err) => {
    previewCache.delete(key);
    throw err;
  });
  previewCache.set(key, { at: Date.now(), value });
  if (previewCache.size > 200) previewCache.delete(previewCache.keys().next().value);
  return value;
}
const EDGE_INSET_M = 3; // measured area stays this far inside the pitch box
// Outer strip where stands, dugouts, paths and car parks sit: hard surfaces there are left out,
// and weak turf there is reported as edge wear rather than a poor playing surface
const EDGE_BAND_M = 8;
const toPixels = (shot, polys) => polys.map((pg) => pg.map(([lat, lon]) => latLonToPixel(shot, lat, lon)));

function squareAround(lat, lon, metres) {
  const dLat = metres / 2 / 111320;
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  return [[lat + dLat, lon - dLon], [lat + dLat, lon + dLon], [lat - dLat, lon + dLon], [lat - dLat, lon - dLon]];
}

const polyKey = (geo) => geo.map(([a, b]) => `${a.toFixed(6)},${b.toFixed(6)}`).join(';');

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype))
});

const LIST_COLUMNS = `a.id, a.lead_id, a.pitch_type, a.label, a.image_source, a.score, a.healthy_pct, a.moderate_pct,
  a.stressed_pct, a.zones, a.saved, a.in_portal, a.portal_at, a.portal_months, a.created_at, (a.ai_report IS NOT NULL AND a.ai_report->>'error' IS NULL) AS has_ai`;

// Pitch and green outlines from OpenStreetMap near a point
router.get(
  '/grounds',
  wrap(async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw badRequest('Missing map position');
    if (req.query.lead_id) setUsageContext({ leadId: Number(req.query.lead_id) || null });
    res.json(await findGrounds(lat, lon));
  })
);

// Draws the boxes automatically: OpenStreetMap outlines first, then Claude looking at the photo
router.get(
  '/auto',
  wrap(async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const type = PITCH_TYPES[req.query.type] ? req.query.type : 'gaa';
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw badRequest('Missing map position');
    if (req.query.lead_id) setUsageContext({ leadId: Number(req.query.lead_id) || null });

    const result = await cached(`auto:${type}:${lat.toFixed(5)},${lon.toFixed(5)}`, async () => {
      let osm = null;
      if (overpassCoolingOff()) {
        console.log('OpenStreetMap was busy a few minutes ago, so Auto is asking Claude straight away');
      } else {
        try {
          osm = await autoOutline(lat, lon, type);
        } catch (err) {
          console.error('Automatic outline from OpenStreetMap skipped:', err.message);
        }
      }
      if (osm?.pitch) return { pitch: osm.pitch, grounds: osm.grounds, source: 'osm', name: osm.name, confidence: 'high' };

      if (claudeEnabled()) {
        const shot = await captureArea(squareAround(lat, lon, type === 'golf' ? 250 : 380));
        const found = await locatePitch(shot.image, type, shot.metresPerPixel);
        if (found) {
          const toGeo = (q) => q.map(([x, y]) => pixelToLatLon(shot, x, y));
          return {
            pitch: toGeo(found.pitch),
            grounds: osm?.grounds || (found.grounds ? toGeo(found.grounds) : null),
            source: 'claude',
            confidence: found.confidence
          };
        }
      }
      return { pitch: null, grounds: osm?.grounds || null, source: null };
    });
    res.json(result);
  })
);

// Season totals from the Club standard care programme, so the side panel, the club table and the
// report all show the same figures
function programmeTotals({ pitchType, score, stressedPct, zones, areaM2, profile }) {
  const plan = buildPlan({ pitchType, score, stressedPct, zones: zones || [], areaM2, profile, period: 12 });
  const prog = plan.programmes?.standard || plan.programme || [];
  let essential = 0;
  let oramara = 0;
  for (const m of prog) {
    for (const x of m.actions) {
      essential += x.cost || 0;
      if (x.product === 'oramara_pouch') oramara += x.cost || 0;
    }
  }
  return { essential: Math.round(essential), oramara: Math.round(oramara), optional: 0 };
}

// Club overview: the latest saved analysis for each pitch (main, training, juvenile...) and the season costs together
router.get(
  '/club/:leadId',
  wrap(async (req, res) => {
    const lead = (await query('SELECT id, name, type, pitch_profile FROM leads WHERE id = $1', [req.params.leadId])).rows[0];
    if (!lead) return res.status(404).json({ error: 'Club not found' });
    const { rows } = await query(
      `SELECT DISTINCT ON (COALESCE(NULLIF(lower(a.label), ''), a.pitch_type))
         a.id, a.label, a.pitch_type, a.score, a.healthy_pct, a.stressed_pct, a.zones, a.imagery, a.created_at, a.in_portal,
         (SELECT json_agg(json_build_object('label', p.label, 'score', p.score) ORDER BY p.id) FROM analysis_parts p WHERE p.analysis_id = a.id AND p.kind = 'goalmouth') AS goalmouths,
         (SELECT json_agg(json_build_object('label', p.label, 'score', p.score, 'area_kind', p.area_kind, 'area_m2', p.area_m2,
            'healthy_pct', p.healthy_pct, 'stressed_pct', p.stressed_pct, 'zones', p.zones) ORDER BY p.id) FROM analysis_parts p WHERE p.analysis_id = a.id AND p.kind = 'pitch') AS extras
       FROM analyses a
       WHERE a.lead_id = $1 AND a.saved = true
       ORDER BY COALESCE(NULLIF(lower(a.label), ''), a.pitch_type), a.created_at DESC`,
      [lead.id]
    );
    const pitches = rows
      .flatMap((r) => {
        const profile = lead.pitch_profile || {};
        // Extra pitches analysed in the same run show as their own rows, opening the same report
        const extras = (r.extras || []).map((x) => ({
          id: r.id,
          key: `${r.id}-${x.label}`,
          label: x.label,
          areaKind: x.area_kind || 'training',
          score: x.score,
          strongPct: Number(x.healthy_pct),
          thinPct: Number(x.stressed_pct),
          areaM2: x.area_m2,
          created_at: r.created_at,
          goalmouths: [],
          costs: programmeTotals({ pitchType: r.pitch_type, score: x.score, stressedPct: Number(x.stressed_pct), zones: x.zones, areaM2: x.area_m2, profile })
        }));
        return [{
          key: String(r.id),
          id: r.id,
          label: r.label || PITCH_TYPES[r.pitch_type]?.label,
          areaKind: r.imagery?.areaKind || 'main',
          score: r.score,
          strongPct: Number(r.healthy_pct),
          thinPct: Number(r.stressed_pct),
          areaM2: r.imagery?.areaM2 || null,
          created_at: r.created_at,
          goalmouths: r.goalmouths || [],
          inPortal: r.in_portal,
          costs: programmeTotals({ pitchType: r.pitch_type, score: r.score, stressedPct: Number(r.stressed_pct), zones: r.zones, areaM2: r.imagery?.areaM2, profile })
        }, ...extras];
      })
      .sort((x, y) => x.score - y.score); // the one needing most work first
    const sum = (k) => pitches.reduce((t, p) => t + (p.costs[k] || 0), 0);
    res.json({
      lead: { id: lead.id, name: lead.name },
      pitches,
      totals: { oramara: sum('oramara'), essential: sum('essential'), optional: sum('optional') },
      worst: pitches[0] || null
    });
  })
);

router.get(
  '/',
  wrap(async (req, res) => {
    const params = [];
    const where = ['a.saved = true'];
    if (req.query.lead_id) where.push(`a.lead_id = $${params.push(req.query.lead_id)}`);
    if (req.query.q) {
      const like = `%${req.query.q}%`;
      where.push(`(l.name ILIKE $${params.push(like)} OR a.label ILIKE $${params.length} OR l.county ILIKE $${params.length})`);
    }
    const { rows } = await query(
      `SELECT ${LIST_COLUMNS}, l.name AS lead_name, l.county AS lead_county, l.type AS lead_type
       FROM analyses a LEFT JOIN leads l ON l.id = a.lead_id
       WHERE ${where.join(' AND ')} ORDER BY a.created_at DESC LIMIT 300`,
      params
    );
    res.json(rows.map(toNumbers));
  })
);

// Main flow: marked corners on the map, we fetch the imagery, measure, then Claude writes it up
router.post(
  '/map',
  wrap(async (req, res) => {
    const { lead_id, pitch_type, label } = req.body;
    const focusMonth = /^\d{4}-\d{2}$/.test(req.body.month || '') ? req.body.month : null;
    const period = pickPeriod(req.body.period);
    const geo = cleanGeoPolygon(req.body.polygon);
    const grounds = cleanGeoPolygon(req.body.grounds);
    if (geo.length < 3) throw badRequest('Mark at least 3 corners of the pitch');
    const pitchType = PITCH_TYPES[pitch_type] ? pitch_type : 'gaa';

    const lead = lead_id ? (await query('SELECT id, name, pitch_profile FROM leads WHERE id = $1', [lead_id])).rows[0] : null;
    if (lead_id && !lead) throw badRequest('Lead not found');
    setUsageContext({ leadId: lead?.id || null });

    // Drafts that were never saved are cleared out after a day
    await query(`DELETE FROM analyses WHERE saved = false AND created_at < NOW() - INTERVAL '1 day'`);

    // Areas marked by hand to leave out: dugouts, a stand, a path cutting across
    const exclude = (Array.isArray(req.body.exclude) ? req.body.exclude.slice(0, 8) : [])
      .map(cleanGeoPolygon)
      .filter((pg) => pg.length >= 3);

    const shot = await captureArea(geo, grounds.length >= 3 ? grounds : []);
    const result = await analysePitch(shot.image, shot.polygon, shot.width, {
      ...SATELLITE_SCALE,
      insetPx: EDGE_INSET_M / shot.metresPerPixel,
      edgeBandPx: EDGE_BAND_M / shot.metresPerPixel,
      excludePx: toPixels(shot, exclude)
    });
    const centre = [geo.reduce((s, p) => s + p[0], 0) / geo.length, geo.reduce((s, p) => s + p[1], 0) / geo.length];
    const taken = await photoDate(centre[0], centre[1]);
    const metresPerPixel = shot.metresPerPixel * (shot.width / result.width);
    const scale = result.width / shot.width;
    const groundsPx = shot.groundsPolygon.map(([x, y]) => [Math.round(x * scale), Math.round(y * scale)]);
    const area = areaM2(geo);

    // Goalmouths: each end captured at the closest zoom available and measured on its own
    const parts = [];
    const goalInput = Array.isArray(req.body.goalmouths) ? req.body.goalmouths.slice(0, 2) : [];
    for (const g of goalInput) {
      const poly = cleanGeoPolygon(g.polygon);
      if (poly.length < 3) continue;
      try {
        // Zoom 20 is sharpest, but in many rural spots Esri only has a grey "no imagery" picture there,
        // which has nothing to measure. Step down a zoom level until the goalmouth can be measured.
        let gShot = null;
        let gRes = null;
        let lastErr = null;
        for (const zoom of [20, 19, 18]) {
          try {
            gShot = await captureArea(poly, [], { maxZoom: zoom });
            gRes = await analysePitch(gShot.image, gShot.polygon, gShot.width, {
              ...SATELLITE_SCALE,
              insetPx: 0.5 / gShot.metresPerPixel,
              minPixels: 60
            });
            // A grey placeholder photo is mostly left out as paint or shadow: treat it as no photo
            if (gRes.skippedPct > 60) throw new Error(`zoom ${gShot.zoom} photo has no usable grass`);
            break;
          } catch (err) {
            lastErr = err;
            gRes = null;
          }
        }
        if (!gRes) throw lastErr || new Error('No usable photo');
        parts.push({
          kind: 'goalmouth',
          label: String(g.label || 'Goalmouth').slice(0, 60),
          geo: poly,
          bounds: gShot.bounds,
          areaM2: Math.round(areaM2(poly)),
          zoom: gShot.zoom,
          result: gRes
        });
      } catch (err) {
        console.error(`Goalmouth capture skipped (${g.label}, ${Math.round(areaM2(poly))} m²):`, err.message);
      }
    }

    // Extra pitches (training, juvenile, other) drawn in the same run: each measured on its own
    const extraInput = Array.isArray(req.body.extra_pitches) ? req.body.extra_pitches.slice(0, 4) : [];
    for (const [i, x] of extraInput.entries()) {
      const poly = cleanGeoPolygon(x.polygon);
      if (poly.length < 3) continue;
      try {
        const xShot = await captureArea(poly, grounds.length >= 3 ? grounds : []);
        const xRes = await analysePitch(xShot.image, xShot.polygon, xShot.width, {
          ...SATELLITE_SCALE,
          insetPx: EDGE_INSET_M / xShot.metresPerPixel,
          edgeBandPx: EDGE_BAND_M / xShot.metresPerPixel,
          excludePx: toPixels(xShot, exclude)
        });
        parts.push({
          kind: 'pitch',
          areaKind: String(x.kind || 'training').slice(0, 20),
          label: String(x.label || `Pitch ${i + 2}`).slice(0, 60),
          geo: poly,
          bounds: xShot.bounds,
          areaM2: Math.round(areaM2(poly)),
          zoom: xShot.zoom,
          metresPerPixel: xShot.metresPerPixel * (xShot.width / xRes.width),
          result: xRes
        });
      } catch (err) {
        console.error('Extra pitch capture skipped:', err.message);
      }
    }
    const goalParts = parts.filter((g) => g.kind === 'goalmouth');
    const pitchParts = parts.filter((g) => g.kind === 'pitch');

    // Monthly satellite history for the same pitch, if Copernicus is set up. Never blocks the analysis.
    let months = null;
    if (sentinelEnabled()) {
      try {
        months = await cached(`m:${polyKey(geo)}`, () => monthlyNdvi(geo));
      } catch (err) {
        console.error('Monthly satellite data skipped:', err.message);
      }
    }
    const shaped = months ? months.map(shapeMonth) : [];

    const aiReport = await writeReport({
      goalmouths: goalParts.map((g) => ({ label: g.label, score: g.result.score, thinPct: g.result.stressedPct, strongPct: g.result.healthyPct, areaM2: g.areaM2 })),
      otherPitches: pitchParts.map((g) => ({ label: g.label, score: g.result.score, thinPct: g.result.stressedPct, strongPct: g.result.healthyPct, areaM2: g.areaM2, zones: g.result.zones })),
      monthly: shaped,
      focusMonth,
      photoTaken: taken?.date || null,
      period,
      original: result.original,
      heatmap: result.heatmap,
      imagePolygon: result.polygon,
      groundsPolygon: groundsPx,
      leadName: lead?.name,
      profile: lead?.pitch_profile || null,
      pitchType,
      metrics: { ...result, excludedAreas: exclude.length },
      zones: result.zones,
      metresPerPixel,
      areaM2: area
    });

    const imagery = {
      source: shot.source,
      zoom: shot.zoom,
      metresPerPixel,
      areaM2: Math.round(area),
      bounds: shot.bounds,
      grounds: grounds.length >= 3 ? grounds : null,
      groundsPx,
      focusMonth,
      period,
      areaKind: String(req.body.area_kind || 'main').slice(0, 20),
      photoDate: taken?.date || null,
      photoResolutionM: taken?.resolutionM || null,
      insetM: EDGE_INSET_M,
      skippedPct: result.skippedPct,
      removedPct: result.removedPct,
      edgeBandM: EDGE_BAND_M,
      edgeScore: result.edgeScore,
      playScore: result.playScore,
      exclude: exclude.length ? exclude : null,
      typicalGreen: result.typicalGreen
    };

    const { rows } = await query(
      `INSERT INTO analyses (lead_id, pitch_type, label, image_source, polygon, geo_polygon, imagery, original_jpg, heatmap_png,
         overlay_png, score, healthy_pct, moderate_pct, stressed_pct, zones, ai_report, ai_model)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING id`,
      [
        lead?.id || null,
        pitchType,
        label || null,
        shot.source,
        JSON.stringify(result.polygon),
        JSON.stringify(geo),
        JSON.stringify(imagery),
        result.original,
        result.heatmap,
        result.overlay,
        result.score,
        result.healthyPct,
        result.moderatePct,
        result.stressedPct,
        JSON.stringify(result.zones),
        aiReport ? JSON.stringify(aiReport) : null,
        aiReport ? claudeModel() : null
      ]
    );

    await linkUsageToAnalysis(rows[0].id);
    for (const g of parts) {
      await query(
        `INSERT INTO analysis_parts (analysis_id, kind, label, geo_polygon, bounds, area_m2, zoom, score, healthy_pct, moderate_pct,
           stressed_pct, original_jpg, heatmap_png, overlay_png, zones, area_kind, metres_per_pixel)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          rows[0].id, g.kind, g.label, JSON.stringify(g.geo), JSON.stringify(g.bounds), g.areaM2, g.zoom, g.result.score,
          g.result.healthyPct, g.result.moderatePct, g.result.stressedPct, g.result.original, g.result.heatmap, g.result.overlay,
          JSON.stringify(g.result.zones || []), g.areaKind || null, g.metresPerPixel || null
        ]
      );
    }
    if (months) await storeMonths(rows[0].id, months);
    res.status(201).json(await loadFull(rows[0].id));
  })
);

// Ask Claude to write the report again for a saved analysis
router.post(
  '/:id/rewrite',
  wrap(async (req, res) => {
    if (!claudeEnabled()) throw badRequest('Add ANTHROPIC_API_KEY to backend/.env first');
    const { rows } = await query(
      `SELECT a.*, l.name AS lead_name, l.pitch_profile FROM analyses a LEFT JOIN leads l ON l.id = a.lead_id WHERE a.id = $1`,
      [req.params.id]
    );
    const a = rows[0];
    if (!a) return res.status(404).json({ error: 'Analysis not found' });
    setUsageContext({ leadId: a.lead_id, analysisId: a.id });

    const stored = await query(
      `SELECT month, ndvi, coverage, strong_pct, moderate_pct, thin_pct FROM satellite_months WHERE analysis_id = $1 ORDER BY month`,
      [a.id]
    );
    const storedParts = (await query('SELECT kind, label, score, healthy_pct, stressed_pct, area_m2, zones FROM analysis_parts WHERE analysis_id = $1 ORDER BY id', [a.id])).rows;
    const aiReport = await writeReport({
      otherPitches: storedParts
        .filter((g) => g.kind === 'pitch')
        .map((g) => ({ label: g.label, score: g.score, thinPct: Number(g.stressed_pct), strongPct: Number(g.healthy_pct), areaM2: g.area_m2, zones: g.zones || [] })),
      goalmouths: storedParts.filter((g) => g.kind === 'goalmouth').map((g) => ({ label: g.label, score: g.score, thinPct: Number(g.stressed_pct), strongPct: Number(g.healthy_pct), areaM2: g.area_m2 })),
      operation: 'rewrite',
      monthly: stored.rows.map(shapeMonth),
      focusMonth: a.imagery?.focusMonth || null,
      photoTaken: a.imagery?.photoDate || null,
      period: pickPeriod(req.body?.period, pickPeriod(a.imagery?.period)),
      original: a.original_jpg,
      heatmap: a.heatmap_png,
      imagePolygon: a.polygon,
      groundsPolygon: a.imagery?.groundsPx || [],
      leadName: a.lead_name,
      profile: a.pitch_profile || null,
      pitchType: a.pitch_type,
      metrics: {
        score: a.score,
        healthyPct: Number(a.healthy_pct),
        moderatePct: Number(a.moderate_pct),
        stressedPct: Number(a.stressed_pct),
        edgeScore: a.imagery?.edgeScore ?? null,
        playScore: a.imagery?.playScore ?? null,
        removedPct: a.imagery?.removedPct || 0,
        excludedAreas: a.imagery?.exclude?.length || 0
      },
      zones: a.zones,
      metresPerPixel: a.imagery?.metresPerPixel || 0.3,
      areaM2: a.imagery?.areaM2 || 0
    });

    const period = pickPeriod(req.body?.period, pickPeriod(a.imagery?.period));
    await query(
      `UPDATE analyses SET ai_report = $1, ai_model = $2, imagery = COALESCE(imagery, '{}'::jsonb) || jsonb_build_object('period', $4::int)
       WHERE id = $3`,
      [JSON.stringify(aiReport), claudeModel(), a.id, period]
    );
    res.json(await loadFull(a.id));
  })
);

// Upload route kept for drone photos later
router.post(
  '/',
  upload.single('image'),
  wrap(async (req, res) => {
    if (!req.file) throw badRequest('Upload an aerial image of the pitch');
    const pitchType = PITCH_TYPES[req.body.pitch_type] ? req.body.pitch_type : 'gaa';
    const leadId = req.body.lead_id ? Number(req.body.lead_id) : null;

    const result = await analysePitch(req.file.buffer, req.body.polygon, Number(req.body.natural_width) || null);

    const { rows } = await query(
      `INSERT INTO analyses (lead_id, pitch_type, label, image_source, polygon, original_jpg, heatmap_png,
         score, healthy_pct, moderate_pct, stressed_pct, zones, saved)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)
       RETURNING id`,
      [
        leadId,
        pitchType,
        req.body.label || null,
        req.body.image_source || 'Uploaded photo',
        JSON.stringify(result.polygon),
        result.original,
        result.heatmap,
        result.score,
        result.healthyPct,
        result.moderatePct,
        result.stressedPct,
        JSON.stringify(result.zones)
      ]
    );

    res.status(201).json({ id: rows[0].id });
  })
);

// Full analysis for the map panel and the report page, images included as data URLs
router.get(
  '/:id',
  wrap(async (req, res) => {
    const full = await loadFull(req.params.id);
    if (!full) return res.status(404).json({ error: 'Analysis not found' });
    res.json(full);
  })
);

// Before analysing: monthly vigour for a box that is drawn but not saved yet
router.post(
  '/satellite/preview',
  wrap(async (req, res) => {
    if (!sentinelEnabled()) return res.json({ enabled: false, months: [] });
    const geo = cleanGeoPolygon(req.body.polygon);
    if (geo.length < 3) throw badRequest('Draw the pitch box first');
    if (req.body.lead_id) setUsageContext({ leadId: Number(req.body.lead_id) || null });
    const months = await cached(`m:${polyKey(geo)}`, () => monthlyNdvi(geo));
    res.json({ enabled: true, months: months.map(shapeMonth) });
  })
);

router.post(
  '/satellite/preview-image',
  wrap(async (req, res) => {
    if (!sentinelEnabled()) throw badRequest('Add the Copernicus keys to backend/.env first');
    const geo = cleanGeoPolygon(req.body.polygon);
    const month = String(req.body.month || '');
    if (geo.length < 3) throw badRequest('Draw the pitch box first');
    if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest('Month should look like 2026-06');
    if (req.body.lead_id) setUsageContext({ leadId: Number(req.body.lead_id) || null });
    const shot = await cached(`i:${month}:${polyKey(geo)}`, () => monthImage(geo, month));
    res.json({ month, bounds: shot.bounds, image: `data:image/png;base64,${shot.png.toString('base64')}` });
  })
);

// Monthly plant vigour from Sentinel 2. Cached; refreshed when older than a week or with ?refresh=1
router.get(
  '/:id/satellite',
  wrap(async (req, res) => {
    if (!sentinelEnabled()) return res.json({ enabled: false, months: [] });
    const { rows } = await query('SELECT geo_polygon, lead_id FROM analyses WHERE id = $1', [req.params.id]);
    setUsageContext({ leadId: rows[0]?.lead_id || null, analysisId: Number(req.params.id) });
    const geo = rows[0]?.geo_polygon;
    if (!geo?.length) return res.json({ enabled: true, months: [], note: 'Only map based analyses have monthly data.' });

    const cached = await query(
      `SELECT month, ndvi, coverage, image_png IS NOT NULL AS has_image, fetched_at FROM satellite_months
       WHERE analysis_id = $1 ORDER BY month`,
      [req.params.id]
    );
    const fresh = cached.rows.length && cached.rows.every((r) => Date.now() - new Date(r.fetched_at) < 7 * 864e5);

    if (!fresh || req.query.refresh) await storeMonths(req.params.id, await monthlyNdvi(geo));

    const { rows: list } = await query(
      `SELECT month, ndvi, coverage, strong_pct, moderate_pct, thin_pct FROM satellite_months
       WHERE analysis_id = $1 ORDER BY month`,
      [req.params.id]
    );
    res.json({ enabled: true, source: 'Copernicus Sentinel 2, ESA', months: list.map(shapeMonth) });
  })
);

// Coloured vigour map of the pitch for one month
router.get(
  '/:id/satellite/:month',
  wrap(async (req, res) => {
    if (!sentinelEnabled()) throw badRequest('Add the Copernicus keys to backend/.env first');
    if (!/^\d{4}-\d{2}$/.test(req.params.month)) throw badRequest('Month should look like 2026-06');

    const { rows } = await query(
      `SELECT image_png, bounds FROM satellite_months WHERE analysis_id = $1 AND month = $2`,
      [req.params.id, req.params.month]
    );
    let image = rows[0]?.image_png;
    let bounds = rows[0]?.bounds;

    if (!image) {
      const a = (await query('SELECT geo_polygon, lead_id FROM analyses WHERE id = $1', [req.params.id])).rows[0];
      setUsageContext({ leadId: a?.lead_id || null, analysisId: Number(req.params.id) });
      if (!a?.geo_polygon?.length) return res.status(404).json({ error: 'No map outline for this analysis' });
      const shot = await monthImage(a.geo_polygon, req.params.month);
      image = shot.png;
      bounds = shot.bounds;
      await query(
        `INSERT INTO satellite_months (analysis_id, month, image_png, bounds) VALUES ($1, $2, $3, $4)
         ON CONFLICT (analysis_id, month) DO UPDATE SET image_png = EXCLUDED.image_png, bounds = EXCLUDED.bounds`,
        [req.params.id, req.params.month, image, JSON.stringify(bounds)]
      );
    }

    res.json({ month: req.params.month, bounds, image: `data:image/png;base64,${image.toString('base64')}` });
  })
);

// Save to the catalogue, or rename
router.patch(
  '/:id',
  wrap(async (req, res) => {
    const sets = [];
    const params = [];
    if (req.body.saved !== undefined) sets.push(`saved = $${params.push(Boolean(req.body.saved))}`);
    if (req.body.label !== undefined) sets.push(`label = $${params.push(String(req.body.label).slice(0, 120) || null)}`);
    // Saving to the customer portal also saves the analysis
    if (req.body.portal_months !== undefined) {
      const m = [1, 3, 6, 12].includes(Number(req.body.portal_months)) ? Number(req.body.portal_months) : 12;
      sets.push(`portal_months = $${params.push(m)}`);
    }
    if (req.body.in_portal !== undefined) {
      const on = Boolean(req.body.in_portal);
      sets.push(`in_portal = $${params.push(on)}`, `portal_at = ${on ? 'NOW()' : 'NULL'}`);
      if (on && req.body.saved === undefined) sets.push('saved = true');
    }
    if (!sets.length) throw badRequest('Nothing to update');
    params.push(req.params.id);
    const { rowCount } = await query(`UPDATE analyses SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    if (!rowCount) return res.status(404).json({ error: 'Analysis not found' });
    res.json(await loadFull(req.params.id));
  })
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    await query('DELETE FROM analyses WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  })
);

// opts.period: show the report over a shorter window (the customer portal's free months)
export async function loadFull(id, opts = {}) {
  const { rows } = await query(`SELECT * FROM analyses WHERE id = $1`, [id]);
  const a = rows[0];
  if (!a) return null;

  const lead = a.lead_id ? (await query('SELECT * FROM leads WHERE id = $1', [a.lead_id])).rows[0] : null;
  const previous = a.lead_id
    ? (
        await query(
          `SELECT id, score, created_at FROM analyses WHERE lead_id = $1 AND id <> $2 AND saved = true ORDER BY created_at`,
          [a.lead_id, a.id]
        )
      ).rows
    : [];

  const partRows = (await query('SELECT * FROM analysis_parts WHERE analysis_id = $1 ORDER BY id', [id])).rows;
  const unit = (pid) => (CATALOGUE[pid]?.price ?? 0);
  const parts = partRows.map((p) => {
    // Repair amounts for this end: seed at 50 g/m², pre seed feed at 30 g/m², sand at 5 kg/m²
    const seedBags = Math.max(1, Math.ceil((p.area_m2 * 50) / 20000));
    const feedBags = Math.max(1, Math.ceil((p.area_m2 * 30) / 25000));
    const sandBags = Math.max(1, Math.ceil((p.area_m2 * 5) / 1000));
    // Extra pitches get their own plan: biostimulant amounts, costs, weak zone advice
    const extraPlan =
      p.kind === 'pitch'
        ? (() => {
            const pl = buildPlan({
              pitchType: a.pitch_type,
              score: p.score,
              stressedPct: Number(p.stressed_pct),
              zones: p.zones || [],
              areaM2: p.area_m2,
              profile: lead?.pitch_profile,
              period: opts.period || a.imagery?.period || 12
            });
            return {
              headline: pl.headline,
              zoneNotes: pl.zoneNotes,
              priorities: pl.priorities,
              product: pl.product,
              costs: pl.costs,
              profile: pl.profile,
              programme: pl.programme, // built in care programme sized for this pitch
              programmes: pl.programmes
            };
          })()
        : null;
    return {
      id: p.id,
      kind: p.kind,
      area_kind: p.area_kind,
      zones: p.zones || [],
      plan: extraPlan,
      label: p.label,
      geo_polygon: p.geo_polygon,
      bounds: p.bounds,
      area_m2: p.area_m2,
      zoom: p.zoom,
      score: p.score,
      healthy_pct: Number(p.healthy_pct),
      moderate_pct: Number(p.moderate_pct),
      stressed_pct: Number(p.stressed_pct),
      repair: p.kind !== 'goalmouth' ? null : {
        seedBags,
        feedBags,
        sandBags,
        cost: Math.round(seedBags * unit('seed_sports') + feedBags * unit('fert_preseed') + sandBags * unit('sand_topdress'))
      },
      images: {
        original: p.original_jpg ? `data:image/jpeg;base64,${p.original_jpg.toString('base64')}` : null,
        heatmap: p.heatmap_png ? `data:image/png;base64,${p.heatmap_png.toString('base64')}` : null,
        overlay: p.overlay_png ? `data:image/png;base64,${p.overlay_png.toString('base64')}` : null
      }
    };
  });

  const analysis = toNumbers(a);
  delete analysis.original_jpg;
  delete analysis.heatmap_png;
  delete analysis.overlay_png;

  return {
    analysis,
    parts,
    lead,
    previous,
    claudeEnabled: claudeEnabled(),
    plan: buildPlan({
      pitchType: a.pitch_type,
      score: a.score,
      stressedPct: Number(a.stressed_pct),
      zones: a.zones,
      areaM2: a.imagery?.areaM2,
      profile: lead?.pitch_profile,
      period: opts.period || a.imagery?.period || 12
    }),
    images: {
      original: `data:image/jpeg;base64,${a.original_jpg.toString('base64')}`,
      heatmap: `data:image/png;base64,${a.heatmap_png.toString('base64')}`,
      overlay: a.overlay_png ? `data:image/png;base64,${a.overlay_png.toString('base64')}` : null
    }
  };
}

function cleanGeoPolygon(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((p) => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p.lat), Number(p.lng ?? p.lon)]))
    .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 85 && Math.abs(lon) <= 180)
    .slice(0, 60);
}

function toNumbers(row) {
  return {
    ...row,
    healthy_pct: Number(row.healthy_pct),
    moderate_pct: Number(row.moderate_pct),
    stressed_pct: Number(row.stressed_pct)
  };
}

export default router;