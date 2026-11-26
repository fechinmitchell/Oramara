// oramara/frontend/src/pages/admin/AnalyseLead.jsx
// Outline a pitch on the satellite map, run the analysis and see the result
// on the same screen. Save it to the catalogue, or open the printable report.
import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import L from '../../lib/leaflet.js';
import 'leaflet/dist/leaflet.css';
import { api } from '../../api.js';
import { PITCH_TYPES, labelFor } from '../../config/options.js';
import { monthLabel } from '../../components/NdviChart.jsx';
import TurfReport, { PERIODS, periodLabel } from '../../components/TurfReport.jsx';
import ClubDetails, { profileSummary } from '../../components/ClubDetails.jsx';

const phrase = (p) => (p === 12 ? 'the full year' : periodLabel(p));
import './analysis.css';
import ShareModal from './ShareModal.jsx';

const IRELAND = [53.4, -8.0];
const TILE_URL =
  import.meta.env.VITE_IMAGERY_TILE_URL ||
  'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const TILE_KEY = import.meta.env.VITE_IMAGERY_API_KEY;
const ATTRIBUTION = 'Imagery © Esri, Maxar, Earthstar Geographics · Outlines © OpenStreetMap contributors';

const GOLD = '#d9b25a';
const WHITE = '#ffffff';
const BLUE = '#8fd3ff'; // extra pitches: training, juvenile, other
const EXTRA_KINDS = { training: 'Training pitch', juvenile: 'Juvenile pitch', other: 'Other area' };
const RED = '#e05a4f'; // areas left out of the measurement: dugouts, a stand, a path
const CORNER_ICON = L.divIcon({ className: 'corner-handle', iconSize: [16, 16] });
const MOVE_ICON = L.divIcon({ className: 'move-handle', html: '✥', iconSize: [28, 28] });

// Rough area of a [[lat, lon]] outline in hectares
const hectares = (pts) => {
  if (pts.length < 3) return 0;
  const k = Math.cos((pts[0][0] * Math.PI) / 180);
  const xy = pts.map(([la, lo]) => [lo * 111320 * k, la * 111320]);
  let sum = 0;
  for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) sum += xy[j][0] * xy[i][1] - xy[i][0] * xy[j][1];
  return Math.abs(sum / 2) / 10000;
};

// The last 24 months, newest first, so the month picker works before any box is drawn
const LAST_MONTHS = Array.from({ length: 24 }, (_, i) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - i);
  return d.toISOString().slice(0, 7);
});

// A square of about 250 m around a point, used for monthly data before any box is drawn
const squareAround = ([lat, lon], metres = 250) => {
  const dLat = metres / 2 / 111320;
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  return [[lat + dLat, lon - dLon], [lat + dLat, lon + dLon], [lat - dLat, lon + dLon], [lat - dLat, lon - dLon]];
};

// Standard pitch sizes in metres [min length, max length, min width, max width]
const PITCH_SIZES = { gaa: [130, 145, 80, 90], soccer: [90, 120, 45, 90], rugby: [100, 144, 68, 70] };

// Straighten a rough 4 corner box into a true rectangle, nudged to real pitch sizes when it is close
function snapToPitch(pts, type) {
  if (pts.length !== 4) return pts;
  const lat0 = pts[0][0];
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = pts.map(([la, lo]) => [lo * 111320 * k, la * 111320]);
  const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const e01 = (len(xy[0], xy[1]) + len(xy[3], xy[2])) / 2;
  const e12 = (len(xy[1], xy[2]) + len(xy[0], xy[3])) / 2;
  // direction of the long sides, averaged over the two opposite edges
  const longPair = e01 >= e12 ? [[xy[0], xy[1]], [xy[3], xy[2]]] : [[xy[1], xy[2]], [xy[0], xy[3]]];
  const dir = longPair.reduce((acc, [a, b]) => {
    let dx = b[0] - a[0], dy = b[1] - a[1];
    if (acc[0] * dx + acc[1] * dy < 0) { dx = -dx; dy = -dy; }
    return [acc[0] + dx, acc[1] + dy];
  }, [0, 0]);
  const ang = Math.atan2(dir[1], dir[0]);
  let L = Math.max(e01, e12);
  let W = Math.min(e01, e12);
  const size = PITCH_SIZES[type];
  if (size) {
    const near = (v, lo, hi) => v > lo * 0.8 && v < hi * 1.2;
    if (near(L, size[0], size[1])) L = Math.min(size[1], Math.max(size[0], L));
    if (near(W, size[2], size[3])) W = Math.min(size[3], Math.max(size[2], W));
  }
  const c = xy.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]);
  const ux = [Math.cos(ang), Math.sin(ang)];
  const vy = [-Math.sin(ang), Math.cos(ang)];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
    const x = c[0] + (a * L) / 2 * ux[0] + (b * W) / 2 * vy[0];
    const y = c[1] + (a * L) / 2 * ux[1] + (b * W) / 2 * vy[1];
    return [y / 111320, x / (111320 * k)];
  });
}

// Goalmouth size by sport, metres [across, into the pitch]: GAA large rectangle, soccer penalty area,
// rugby the busy area in front of the posts
const GOAL_SIZE = { gaa: [19, 14], soccer: [40.3, 16.5], rugby: [30, 15] };
const COMPASS = ['North', 'North east', 'East', 'South east', 'South', 'South west', 'West', 'North west'];

// Boxes over both goalmouths, worked out from the pitch box's shape so they follow a turned pitch
function goalmouthBoxes(pts, type) {
  const size = GOAL_SIZE[type];
  if (!size || pts.length !== 4) return [];
  const lat0 = pts[0][0];
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = pts.map(([la, lo]) => [lo * 111320 * k, la * 111320]);
  const toGeo = ([x, y]) => [y / 111320, x / (111320 * k)];
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const centre = xy.reduce((c, p) => [c[0] + p[0] / 4, c[1] + p[1] / 4], [0, 0]);
  // the two short edges are the ends
  const e01 = len(xy[0], xy[1]) + len(xy[2], xy[3]);
  const e12 = len(xy[1], xy[2]) + len(xy[3], xy[0]);
  // Skip while the box is still tiny (the first moment of a drag) or not a real shape yet
  if (!(e01 > 20 && e12 > 20) || xy.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) return [];
  const ends = e01 < e12 ? [[xy[0], xy[1]], [xy[2], xy[3]]] : [[xy[1], xy[2]], [xy[3], xy[0]]];
  return ends.map(([a, b]) => {
    const m = mid(a, b);
    const across = [(b[0] - a[0]) / len(a, b), (b[1] - a[1]) / len(a, b)];
    let into = [centre[0] - m[0], centre[1] - m[1]];
    const n = Math.hypot(into[0], into[1]) || 1;
    into = [into[0] / n, into[1] / n];
    const [w, d] = size;
    const corner = (s, t) => [m[0] + across[0] * s + into[0] * t, m[1] + across[1] * s + into[1] * t];
    const poly = [corner(-w / 2, 0), corner(w / 2, 0), corner(w / 2, d), corner(-w / 2, d)].map(toGeo);
    // name the end by its compass direction from the middle of the pitch
    const bearing = (Math.atan2(m[0] - centre[0], m[1] - centre[1]) * 180) / Math.PI;
    const label = `${COMPASS[Math.round(((bearing + 360) % 360) / 45) % 8]} end`;
    return { label, polygon: poly };
  });
}

// Compass bearing (degrees clockwise from north) of an outline's long side
function longAxisBearing(pts) {
  const lat0 = pts[0][0];
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = pts.map(([la, lo]) => [lo * 111320 * k, la * 111320]);
  let best = null;
  for (let i = 0; i < xy.length; i++) {
    const a = xy[i];
    const b = xy[(i + 1) % xy.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!best || len > best.len) best = { len, dx: b[0] - a[0], dy: b[1] - a[1] };
  }
  return (Math.atan2(best.dx, best.dy) * 180) / Math.PI;
}

const centroid = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

export default function AnalyseLead() {
  const { leadId } = useParams();
  const [params, setParams] = useSearchParams();
  const reportId = params.get('report');

  const mapEl = useRef(null);
  const map = useRef(null);
  const groundsLayer = useRef(null);
  const drawLayer = useRef(null); // the pitch box (measured)
  const siteLayer = useRef(null); // the whole grounds box (context only)
  const resultLayer = useRef(null);
  const satLayer = useRef(null); // monthly Sentinel 2 vigour image
  const goalLayer = useRef(null); // goalmouth boxes and their close up results
  const drawing = useRef(false);
  const boxStart = useRef(null);
  const pointsRef = useRef([]);
  const siteRef = useRef([]);
  const extraPts = useRef({}); // live corners of each extra pitch, by key
  const extraMeta = useRef({}); // label of each extra pitch, for the map label
  const extraKind = useRef({}); // 'exclude' boxes are drawn red and left out of the measurement
  const extraLayer = useRef(null);
  const extraLayers = useRef({});

  const [lead, setLead] = useState(null);
  const [saved, setSaved] = useState([]);
  const [pitchType, setPitchType] = useState('gaa');
  const [label, setLabel] = useState('Main pitch');
  const [pitchKind, setPitchKind] = useState('main'); // main, training, juvenile, other
  const [withGoals, setWithGoals] = useState(true); // analyse both goalmouths too
  const [club, setClub] = useState(null); // overview of every pitch at this club
  const [points, setPitchPts] = useState([]);
  const [sitePts, setSitePts] = useState([]);
  const [extras, setExtras] = useState([]); // [{ key, kind, label, points }] training and other pitches in the same report
  const [isDrawing, setIsDrawing] = useState(false);
  const [grounds, setGrounds] = useState([]);
  const [place, setPlace] = useState('');
  const [result, setResult] = useState(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [satMonth, setSatMonth] = useState('');
  // Before analysing: months available for the drawn pitch box, and the one picked
  const [preview, setPreview] = useState({ loading: false, enabled: true, months: [], error: '' });
  const [setupMonth, setSetupMonth] = useState('');
  const [period, setPeriod] = useState(12); // how far the report looks back and plans ahead
  const [anchor, setAnchor] = useState(null); // club pin, or the map centre for clubs without one
  const autoTried = useRef(false);
  const autoRun = useRef(0); // each Auto search gets a number; a newer number cancels older searches
  // After analysing: the saved monthly series for this analysis
  const [resultSat, setResultSat] = useState({ loading: false, enabled: true, months: [], error: '' });
  const [state, setState] = useState({ busy: '', msg: '', error: '' });

  const loadSaved = () => {
    api(`/analyses/club/${leadId}`).then(setClub).catch(() => setClub(null));
    return api(`/analyses?lead_id=${leadId}`).then(setSaved).catch(() => {});
  };

  // Load the lead and its saved analyses
  useEffect(() => {
    api(`/leads/${leadId}`)
      .then((l) => {
        setLead(l);
        if (PITCH_TYPES.some((p) => p.value === l.type)) setPitchType(l.type);
        if (l.type === 'golf') setLabel('Green 1');
      })
      .catch((err) => setState((s) => ({ ...s, error: err.message })));
    loadSaved();
  }, [leadId]);

  // Create the map once the lead is loaded
  useEffect(() => {
    if (!lead || map.current) return;
    const hasPin = lead.lat && lead.lon;
    const m = L.map(mapEl.current, {
      zoomControl: true,
      maxZoom: 20,
      rotate: true, // the map can turn so the pitch sits upright
      bearing: 0,
      touchRotate: true,
      shiftKeyRotate: true,
      rotateControl: false
    }).setView(hasPin ? [lead.lat, lead.lon] : IRELAND, hasPin ? 17 : 7);
    L.tileLayer(TILE_KEY ? `${TILE_URL}?token=${TILE_KEY}` : TILE_URL, {
      maxZoom: 20,
      maxNativeZoom: 19,
      attribution: ATTRIBUTION
    }).addTo(m);
    if (hasPin) L.circleMarker([lead.lat, lead.lon], { radius: 6, color: GOLD, weight: 2, fillOpacity: 0.6 }).addTo(m);

    groundsLayer.current = L.layerGroup().addTo(m);
    resultLayer.current = L.layerGroup().addTo(m);
    goalLayer.current = L.layerGroup().addTo(m);
    satLayer.current = L.layerGroup().addTo(m);
    siteLayer.current = L.layerGroup().addTo(m);
    extraLayer.current = L.layerGroup().addTo(m);
    drawLayer.current = L.layerGroup().addTo(m);

    // Draw box: press, drag across the pitch, let go
    m.on('mousedown', (e) => {
      if (!drawing.current) return;
      boxStart.current = e.containerPoint; // screen position, so the box stays square to the screen when the map is turned
      m.dragging.disable();
    });
    m.on('mousemove', (e) => {
      const a = boxStart.current;
      if (!a) return;
      const b = e.containerPoint;
      const corners = [[a.x, a.y], [b.x, a.y], [b.x, b.y], [a.x, b.y]].map(([x, y]) => {
        const ll = m.containerPointToLatLng(L.point(x, y));
        return [ll.lat, ll.lng];
      });
      setOutline(corners, false, drawing.current);
    });
    const endBox = () => {
      if (!boxStart.current) return;
      boxStart.current = null;
      m.dragging.enable();
      const kind = drawing.current;
      drawing.current = false;
      setIsDrawing(false);
      const isExtra = String(kind).startsWith('extra:');
      const pts = kind === 'site' ? siteRef.current : isExtra ? extraPts.current[kind.slice(6)] || [] : pointsRef.current;
      if (pts.length < 4) return setOutline([], true, kind);
      setOutline(pts, true, kind);
      setState({
        busy: '',
        msg: kind === 'site'
          ? 'Grounds box drawn. Now draw the pitch box.'
          : isExtra
            ? `${extraMeta.current[kind.slice(6)] || 'Pitch'} drawn. Drag its corners to fit, then press Analyse.`
            : 'Drag the white corners onto the pitch corners, or the ✥ handle to move it.',
        error: ''
      });
    };
    m.on('mouseup', endBox);
    m.on('mouseout', endBox);

    map.current = m;
    if (hasPin) setAnchor([lead.lat, lead.lon]);
    return () => {
      // Stop any scroll zoom still waiting to run, so it can't fire on a removed map
      clearTimeout(m.scrollWheelZoom?._timer);
      m.scrollWheelZoom?.disable();
      m.stop();
      m.remove();
      map.current = null;
    };
    // Only a different club rebuilds the map. Saving club details or the pin must not wipe the boxes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id]);

  // First visit: draw the boxes for you
  useEffect(() => {
    if (!anchor || autoTried.current || reportId || result) return;
    autoTried.current = true;
    autoDetect(anchor);
  }, [anchor]);

  // Open a saved analysis from the catalogue (?report=id)
  useEffect(() => {
    if (!reportId || !lead || !map.current) return;
    if (result?.analysis.id === Number(reportId)) return;
    setState({ busy: 'load', msg: '', error: '' });
    api(`/analyses/${reportId}`)
      .then((data) => {
        showResult(data);
        setState({ busy: '', msg: '', error: '' });
      })
      .catch((err) => setState({ busy: '', msg: '', error: err.message }));
  }, [reportId, lead]);

  // Show or hide the coloured result on the map
  useEffect(() => {
    if (!resultLayer.current) return;
    resultLayer.current.eachLayer((layer) => layer.setOpacity?.(showOverlay && !satMonth ? 0.85 : 0));
    satLayer.current?.eachLayer((layer) => layer.setOpacity?.(showOverlay ? 0.9 : 0));
  }, [showOverlay, result, satMonth]);

  // Goalmouth boxes follow the pitch box while you set up
  const goalPreview = !result && withGoals && points.length === 4 ? goalmouthBoxes(points, pitchType) : [];
  useEffect(() => {
    if (!goalLayer.current || result) return;
    goalLayer.current.clearLayers();
    goalPreview.forEach((g) =>
      g.polygon.every(([la, lo]) => Number.isFinite(la) && Number.isFinite(lo)) &&
      L.polygon(g.polygon, { color: '#ffffff', weight: 1.5, dashArray: '4 4', fill: false, interactive: false })
        .bindTooltip(g.label, { direction: 'center', className: 'goal-tip', permanent: false })
        .addTo(goalLayer.current)
    );
  }, [JSON.stringify(goalPreview), result]);

  // Monthly series for an analysis that is open
  const resultId = result?.analysis.id;
  const resultHasMap = !!result?.analysis.geo_polygon?.length;
  useEffect(() => {
    if (!resultId || !resultHasMap) return setResultSat({ loading: false, enabled: true, months: [], error: '' });
    setResultSat((s) => ({ ...s, loading: true, error: '' }));
    api(`/analyses/${resultId}/satellite`)
      .then((d) => setResultSat({ loading: false, enabled: d.enabled, months: d.months, error: '' }))
      .catch((err) => setResultSat({ loading: false, enabled: true, months: [], error: err.message }));
  }, [resultId, resultHasMap]);

  // Monthly data covers the pitch box, else the grounds box, else a square around the club pin
  const areaKind = points.length >= 3 ? 'pitch' : sitePts.length >= 3 ? 'grounds' : anchor ? 'pin' : null;
  const areaPoly = areaKind === 'pitch' ? points : areaKind === 'grounds' ? sitePts : anchor ? squareAround(anchor) : [];

  // Load the monthly list for that area (waits until you stop dragging)
  useEffect(() => {
    if (result || isDrawing) return;
    if (areaPoly.length < 3) return setPreview((p) => ({ ...p, months: [], error: '' }));
    const t = setTimeout(() => {
      setPreview((p) => ({ ...p, loading: true, error: '' }));
      api('/analyses/satellite/preview', { method: 'POST', body: { polygon: areaPoly, lead_id: Number(leadId) } })
        .then((d) => setPreview({ loading: false, enabled: d.enabled, months: d.months, error: '' }))
        .catch((err) => setPreview({ loading: false, enabled: true, months: [], error: err.message }));
    }, 700);
    return () => clearTimeout(t);
  }, [JSON.stringify(areaPoly), isDrawing, result]);

  // Show the picked month on the map, and redraw it if the box moves
  useEffect(() => {
    if (result || !satLayer.current) return;
    satLayer.current.clearLayers();
    if (!setupMonth || areaPoly.length < 3 || isDrawing) return;
    let cancelled = false;
    api('/analyses/satellite/preview-image', { method: 'POST', body: { polygon: areaPoly, month: setupMonth, lead_id: Number(leadId) } })
      .then((d) => {
        if (cancelled) return;
        satLayer.current.clearLayers();
        L.imageOverlay(d.image, d.bounds, { opacity: 0.9, interactive: false }).addTo(satLayer.current);
      })
      .catch((err) => !cancelled && setState({ busy: '', msg: '', error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [setupMonth, JSON.stringify(areaPoly), isDrawing, result]);

  // Switch the map between the detailed photo analysis and a monthly Sentinel 2 image
  async function pickMonth(month, analysisId = result?.analysis.id) {
    satLayer.current.clearLayers();
    setSatMonth(month);
    if (!month) return;
    setState({ busy: 'month', msg: `Loading ${monthLabel(month, true)}...`, error: '' });
    try {
      const data = await api(`/analyses/${analysisId}/satellite/${month}`);
      satLayer.current.clearLayers();
      L.imageOverlay(data.image, data.bounds, { opacity: showOverlay ? 0.9 : 0, interactive: false }).addTo(satLayer.current);
      setShowOverlay(true);
      setState({ busy: '', msg: '', error: '' });
    } catch (err) {
      setSatMonth('');
      setState({ busy: '', msg: '', error: err.message });
    }
  }

  // ---------- Turning the map ----------
  const [bearing, setBearingState] = useState(0);

  function turnTo(deg) {
    if (!map.current?.setBearing) return;
    const b = ((Math.round(deg) % 360) + 360) % 360;
    map.current.setBearing(b);
    setBearingState(b);
  }

  // Turn the map so the pitch's long side runs up the screen: goals at the top and bottom
  function squareUp(pts) {
    const outline = pts && pts.length >= 3 ? pts : pointsRef.current.length >= 3 ? pointsRef.current : siteRef.current;
    if (!outline || outline.length < 3) {
      return setState({ busy: '', msg: 'Draw or find the pitch first, then square it up.', error: '' });
    }
    const axis = longAxisBearing(outline);
    let b = -axis;
    if (b <= -90) b += 180;
    if (b > 90) b -= 180;
    turnTo(b);
    map.current.fitBounds(L.polygon(outline).getBounds(), { padding: [40, 40] });
  }

  // Draws the outline. When editable, each corner can be dragged and the middle handle moves it all.
  // kind 'pitch' is the measured area, kind 'site' is the optional whole grounds box
  function setOutline(next, editable = true, kind = 'pitch') {
    const isSite = kind === 'site';
    const extraKey = String(kind).startsWith('extra:') ? kind.slice(6) : null;
    let ref = isSite ? siteRef : pointsRef;
    let setPoints = isSite ? setSitePts : setPitchPts;
    let layer = isSite ? siteLayer.current : drawLayer.current;
    if (extraKey) {
      // each extra pitch keeps its own corners and its own layer
      ref = {
        get current() { return extraPts.current[extraKey] || []; },
        set current(v) { extraPts.current[extraKey] = v; }
      };
      setPoints = (v) => setExtras((xs) => xs.map((x) => (x.key === extraKey ? { ...x, points: v } : x)));
      if (!extraLayers.current[extraKey]) extraLayers.current[extraKey] = L.layerGroup().addTo(extraLayer.current);
      layer = extraLayers.current[extraKey];
    }
    ref.current = next;
    setPoints(next);
    layer.clearLayers();
    if (next.length < 3) return;

    const style = isSite
      ? { color: GOLD, weight: 2, dashArray: '8 6', fill: false }
      : extraKey && extraKind.current[extraKey] === 'exclude'
        ? { color: RED, weight: 2, dashArray: '6 4', fillColor: RED, fillOpacity: 0.18 }
        : extraKey
        ? { color: BLUE, weight: 3, fillColor: BLUE, fillOpacity: 0.1 }
        : { color: WHITE, weight: 3, fillColor: GOLD, fillOpacity: 0.12 };
    const poly = L.polygon(next, style).addTo(layer);
    if (extraKey && extraMeta.current[extraKey]) {
      poly.bindTooltip(extraMeta.current[extraKey], { permanent: true, direction: 'center', className: 'goal-tip' });
    }
    if (!editable) return;

    let moveFrom = null;
    // The grounds handle sits on its top edge so it never covers the pitch handle
    const handleAt = (pts) => (isSite ? [Math.max(...pts.map((p) => p[0])), centroid(pts)[1]] : centroid(pts));
    const centre = L.marker(handleAt(next), { draggable: true, icon: MOVE_ICON, zIndexOffset: 1000 });

    const corners = next.map((p, i) =>
      L.marker(p, { draggable: true, icon: CORNER_ICON })
        .on('dragstart', () => cancelAuto())
        .on('drag', (e) => {
          const ll = e.target.getLatLng();
          ref.current = ref.current.map((q, j) => (j === i ? [ll.lat, ll.lng] : q));
          poly.setLatLngs(ref.current);
          centre.setLatLng(handleAt(ref.current));
        })
        .on('dragend', () => setPoints(ref.current))
        .addTo(layer)
    );

    centre
      .on('dragstart', (e) => {
        cancelAuto();
        moveFrom = { ll: e.target.getLatLng(), pts: ref.current };
      })
      .on('drag', (e) => {
        const ll = e.target.getLatLng();
        const dLat = ll.lat - moveFrom.ll.lat;
        const dLng = ll.lng - moveFrom.ll.lng;
        ref.current = moveFrom.pts.map(([a, b]) => [a + dLat, b + dLng]);
        poly.setLatLngs(ref.current);
        corners.forEach((c, i) => c.setLatLng(ref.current[i]));
      })
      .on('dragend', () => setPoints(ref.current))
      .addTo(layer);
  }

  function showResult(data) {
    satLayer.current.clearLayers();
    setSatMonth('');
    setResult(data);
    setShowOverlay(true);
    const a = data.analysis;
    setLabel(a.label || '');
    setPitchType(a.pitch_type);
    setPeriod(a.imagery?.period || 12);
    resultLayer.current.clearLayers();
    if (data.images.overlay && a.imagery?.bounds) {
      L.imageOverlay(data.images.overlay, a.imagery.bounds, { opacity: 0.85, interactive: false }).addTo(resultLayer.current);
    }
    // Goalmouths: sharper close up results drawn on top, with their outline and score
    goalLayer.current.clearLayers();
    clearExtras();
    // Extra pitches first, goalmouths on top
    const ordered = [...(data.parts || [])].sort((x, y) => (x.kind === 'pitch' ? 0 : 1) - (y.kind === 'pitch' ? 0 : 1));
    ordered.forEach((g) => {
      if (g.images.overlay && g.bounds) {
        L.imageOverlay(g.images.overlay, g.bounds, { opacity: g.kind === 'pitch' ? 0.85 : 0.9, interactive: false }).addTo(resultLayer.current);
      }
      if (g.geo_polygon?.length) {
        const style = g.kind === 'pitch'
          ? { color: BLUE, weight: 2.5, fill: false }
          : { color: '#ffffff', weight: 1.5, dashArray: '4 4', fill: false };
        L.polygon(g.geo_polygon, style)
          .bindTooltip(`${g.label}: ${g.score}`, { permanent: true, direction: 'center', className: 'goal-tip' })
          .addTo(goalLayer.current);
      }
    });
    (a.imagery?.exclude || []).forEach((pg) =>
      L.polygon(pg, { color: RED, weight: 2, dashArray: '6 4', fillColor: RED, fillOpacity: 0.15 })
        .bindTooltip('Left out', { direction: 'center', className: 'goal-tip' })
        .addTo(goalLayer.current)
    );
    setPitchKind(a.imagery?.areaKind || 'main');
    if (a.geo_polygon?.length) {
      drawing.current = false;
      setIsDrawing(false);
      setOutline(a.geo_polygon, false);
      setOutline(a.imagery?.grounds || [], false, 'site');
      squareUp(a.geo_polygon);
      // fit the main pitch, any extra pitches and the grounds
      const all = [a.geo_polygon, a.imagery?.grounds || [], ...(data.parts || []).filter((g) => g.kind === 'pitch').map((g) => g.geo_polygon)].flat();
      map.current.fitBounds(L.polygon(all).getBounds(), { padding: [60, 60] });
    }
    if (a.imagery?.focusMonth) pickMonth(a.imagery.focusMonth, a.id);
  }

  // ---------- Extra pitches (training, juvenile, other) ----------
  function clearExtras() {
    extraLayer.current?.clearLayers();
    extraLayers.current = {};
    extraPts.current = {};
    extraMeta.current = {};
    extraKind.current = {};
    setExtras([]);
  }

  function addExtra(kind = 'training') {
    if (result) return;
    const key = String(Date.now());
    const same = extras.filter((x) => x.kind === kind).length;
    const label = kind === 'exclude' ? `Leave out ${same + 1}` : `${EXTRA_KINDS[kind]}${same ? ` ${same + 1}` : ''}`;
    extraMeta.current[key] = label;
    extraKind.current[key] = kind;
    setExtras((xs) => [...xs, { key, kind, label, points: [] }]);
    startDrawing(`extra:${key}`);
  }

  function updateExtra(key, patch) {
    if (patch.label !== undefined) extraMeta.current[key] = patch.label;
    setExtras((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
    // redraw so the map label follows the new name
    const pts = extraPts.current[key] || [];
    if (patch.label !== undefined && pts.length >= 3) setOutline(pts, true, `extra:${key}`);
  }

  function removeExtra(key) {
    extraLayers.current[key]?.remove();
    delete extraLayers.current[key];
    delete extraPts.current[key];
    delete extraMeta.current[key];
    delete extraKind.current[key];
    if (drawing.current === `extra:${key}`) cancelDrawing();
    setExtras((xs) => xs.filter((x) => x.key !== key));
  }

  function newAnalysis() {
    clearExtras();
    goalLayer.current?.clearLayers();
    satLayer.current.clearLayers();
    setSatMonth('');
    setSetupMonth('');
    setResult(null);
    resultLayer.current.clearLayers();
    setOutline([]);
    setOutline([], true, 'site');
    setParams({});
    setState({ busy: '', msg: '', error: '' });
  }

  function startDrawing(kind = 'pitch') {
    cancelAuto();
    if (result) newAnalysis();
    drawing.current = kind;
    setIsDrawing(kind);
    setOutline([], true, kind);
    setState({
      busy: '',
      msg: kind === 'site'
        ? 'Press and drag around the whole grounds.'
        : String(kind).startsWith('extra:')
          ? `Press and drag across the ${(extraMeta.current[kind.slice(6)] || 'pitch').toLowerCase()}.`
          : 'Press and drag across the playing surface only.',
      error: ''
    });
  }

  function toggleTool(kind) {
    if (isDrawing === kind) return cancelDrawing();
    startDrawing(kind);
  }

  // Draw both boxes automatically: OpenStreetMap first, Claude looking at the photo as a fallback
  // Stops any Auto search that is still running, so it can never move a box you drew or adjusted
  function cancelAuto(message = 'Auto search stopped. Your box is kept.') {
    autoRun.current += 1;
    setState((st) => (st.busy === 'auto' ? { busy: '', msg: message, error: '' } : st));
  }

  async function autoDetect(at = anchor) {
    if (!at) return setState({ busy: '', msg: '', error: 'Save a map pin for this club first.' });
    if (result) newAnalysis();
    const run = ++autoRun.current;
    setState({ busy: 'auto', msg: 'Finding the pitch automatically. Draw it yourself any time to stop the search.', error: '' });
    try {
      const found = await api(`/analyses/auto?lat=${at[0]}&lon=${at[1]}&type=${pitchType}&lead_id=${leadId}`);
      if (run !== autoRun.current) return; // cancelled: you drew or changed a box while it was searching
      if (found.grounds) setOutline(found.grounds, true, 'site');
      if (found.pitch) {
        setOutline(found.pitch, true, 'pitch');
        squareUp(found.pitch);
        map.current.fitBounds(L.polygon(found.grounds || found.pitch).getBounds(), { padding: [50, 50] });
      }
      if (found.name && label === 'Main pitch') setLabel(found.name);
      setState({
        busy: '',
        msg: found.source === 'osm'
          ? 'Pitch found from the map outlines. Check the corners, then press Analyse.'
          : found.source === 'claude'
            ? `Claude found the pitch (${found.confidence} confidence). Check the corners and use Snap if needed.`
            : 'Could not find the pitch automatically. Use the Pitch tool to draw it.',
        error: ''
      });
    } catch (err) {
      if (run !== autoRun.current) return;
      setState({ busy: '', msg: '', error: `${err.message} Draw the boxes yourself with the tools.` });
    }
  }

  function snapPitch() {
    if (pointsRef.current.length !== 4) return;
    cancelAuto();
    setOutline(snapToPitch(pointsRef.current, pitchType), true, 'pitch');
    setState({ busy: '', msg: 'Box straightened to a rectangle. Drag the corners if it needs fine tuning.', error: '' });
  }

  function clearAll() {
    cancelAuto('');
    clearOutline('pitch');
    clearOutline('site');
    clearExtras();
    setSetupMonth('');
    groundsLayer.current.clearLayers();
    setGrounds([]);
    setState({ busy: '', msg: '', error: '' });
  }

  function cancelDrawing() {
    drawing.current = false;
    setIsDrawing(false);
    setState({ busy: '', msg: '', error: '' });
  }

  function clearOutline(kind = 'pitch') {
    drawing.current = false;
    setIsDrawing(false);
    setOutline([], true, kind);
  }

  async function findGrounds() {
    if (result) newAnalysis();
    const c = map.current.getCenter();
    setState({ busy: 'find', msg: 'Looking for pitch outlines. You can draw a box while you wait.', error: '' });
    try {
      const shapes = await api(`/analyses/grounds?lat=${c.lat}&lon=${c.lng}&lead_id=${leadId}`);
      setGrounds(shapes);
      groundsLayer.current.clearLayers();
      shapes.forEach((s) => {
        L.polygon(s.coords, { color: GOLD, weight: 2, dashArray: '6 6', fillOpacity: 0.08 })
          .bindTooltip(`${s.name} · ${(s.areaM2 / 10000).toFixed(2)} ha`)
          .on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            pickGround(s);
          })
          .addTo(groundsLayer.current);
      });
      setState((st) => ({
        busy: st.busy === 'find' ? '' : st.busy,
        msg: shapes.length
          ? `${shapes.length} outlines found. Click one to use it, or draw your own.`
          : 'No pitch outlines on OpenStreetMap here. Draw a box instead.',
        error: ''
      }));
    } catch (err) {
      setState((st) => ({ busy: st.busy === 'find' ? '' : st.busy, msg: '', error: `${err.message} Use Draw box instead.` }));
    }
  }

  function pickGround(s) {
    cancelAuto();
    drawing.current = false;
    setIsDrawing(false);
    setOutline(s.coords);
    if (s.kind === 'green') setPitchType('golf');
    if (s.name && !/^(Pitch|Golf green)$/.test(s.name)) setLabel(s.name);
    map.current.fitBounds(L.polygon(s.coords).getBounds(), { padding: [40, 40] });
  }

  async function findPlace(e) {
    e.preventDefault();
    if (!place.trim()) return;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ie,gb&q=${encodeURIComponent(place)}`
      );
      const [hit] = await res.json();
      if (!hit) return setState({ busy: '', msg: '', error: 'Place not found. Try the town name.' });
      map.current.setView([Number(hit.lat), Number(hit.lon)], 16);
      setState({ busy: '', msg: 'Zoom in on the grounds, then save the pin.', error: '' });
    } catch {
      setState({ busy: '', msg: '', error: 'Place search failed. Pan the map by hand.' });
    }
  }

  async function savePin() {
    const c = map.current.getCenter();
    await api(`/leads/${leadId}`, { method: 'PATCH', body: { lat: c.lat, lon: c.lng } });
    setLead((l) => ({ ...l, lat: c.lat, lon: c.lng }));
    setAnchor([c.lat, c.lng]);
    setState({ busy: '', msg: 'Map pin saved for this lead.', error: '' });
  }

  async function run() {
    if (points.length < 3) return;
    drawing.current = false;
    setIsDrawing(false);
    setOutline(pointsRef.current, false);
    setOutline(siteRef.current, false, 'site');
    const exclude = extras
      .filter((x) => x.kind === 'exclude')
      .map((x) => extraPts.current[x.key] || [])
      .filter((pg) => pg.length >= 3);
    const extraPitches = extras
      .filter((x) => x.kind !== 'exclude')
      .map((x) => ({ label: x.label || EXTRA_KINDS[x.kind], kind: x.kind, polygon: extraPts.current[x.key] || [] }))
      .filter((x) => x.polygon.length >= 3);
    setState({
      busy: 'run',
      msg: `Getting the satellite image, measuring ${extraPitches.length ? `${extraPitches.length + 1} pitches` : 'the turf'} and writing the report. About ${30 + extraPitches.length * 15} seconds.`,
      error: ''
    });
    try {
      const data = await api('/analyses/map', {
        method: 'POST',
        body: {
          lead_id: Number(leadId),
          pitch_type: pitchType,
          label,
          polygon: points,
          grounds: sitePts,
          month: setupMonth,
          period,
          area_kind: pitchKind,
          goalmouths: withGoals ? goalmouthBoxes(points, pitchType) : [],
          extra_pitches: extraPitches,
          exclude
        }
      });
      showResult(data);
      setState({ busy: '', msg: '', error: '' });
    } catch (err) {
      setState({ busy: '', msg: '', error: err.message });
    }
  }

  async function save() {
    setState({ busy: 'save', msg: '', error: '' });
    try {
      const data = await api(`/analyses/${result.analysis.id}`, { method: 'PATCH', body: { saved: true, label } });
      setResult(data);
      setParams({ report: String(data.analysis.id) });
      await loadSaved();
      setState({ busy: '', msg: 'Saved to your analyses.', error: '' });
    } catch (err) {
      setState({ busy: '', msg: '', error: err.message });
    }
  }

  // Save this report to the club's customer portal (saves it too), or take it out again
  // "Save and contact club": the modal saves the report to the portal and makes the email
  const [shareOpen, setShareOpen] = useState(false);
  async function afterShare() {
    try {
      const data = await api(`/analyses/${result.analysis.id}`);
      setResult(data);
      setParams({ report: String(data.analysis.id) });
      await loadSaved();
    } catch {}
  }

  async function setPortal(on) {
    setState({ busy: 'portal', msg: '', error: '' });
    try {
      const data = await api(`/analyses/${result.analysis.id}`, { method: 'PATCH', body: { in_portal: on, label } });
      setResult(data);
      setParams({ report: String(data.analysis.id) });
      await loadSaved();
      setState({
        busy: '',
        msg: on ? 'Saved to the customer portal. The club will see it once their portal is switched on.' : 'Taken out of the customer portal. It is still saved here.',
        error: ''
      });
    } catch (err) {
      setState({ busy: '', msg: '', error: err.message });
    }
  }

  async function discard() {
    const wasSaved = result.analysis.saved;
    if (wasSaved && !confirm('Delete this saved analysis?')) return;
    await api(`/analyses/${result.analysis.id}`, { method: 'DELETE' });
    if (wasSaved) await loadSaved();
    newAnalysis();
  }

  async function rewrite() {
    setState({ busy: 'rewrite', msg: `Claude is writing the report for ${phrase(period)}. About a minute...`, error: '' });
    try {
      const data = await api(`/analyses/${result.analysis.id}/rewrite`, { method: 'POST', body: { period } });
      setResult(data);
      setState({ busy: '', msg: '', error: '' });
    } catch (err) {
      setState({ busy: '', msg: '', error: err.message });
    }
  }

  if (!lead) return <p className="muted">{state.error || 'Loading...'}</p>;

  const strip = result
    ? { ...resultSat, selected: satMonth, onPick: (m) => pickMonth(m) }
    : { ...preview, selected: setupMonth, onPick: setSetupMonth };
  const stripHint = result
    ? resultHasMap ? '' : 'Monthly data is only available for map analyses.'
    : !areaKind ? 'Save a map pin for this club to load monthly satellite data.' : '';
  const stripArea = result
    ? 'Pitch box'
    : { pitch: 'Pitch box', grounds: 'Grounds box', pin: 'Around the club pin' }[areaKind] || '';
  const pitchHa = hectares(points);
  const monthInfo = strip.months.find((m) => m.month === strip.selected);
  // Month picker options: real vigour data once the box is drawn, otherwise just the dates
  const monthOptions = LAST_MONTHS.map((month) => {
    const m = strip.months.find((x) => x.month === month);
    return { month, label: m ? (m.clear ? `${monthLabel(month, true)} · ${m.ndvi.toFixed(2)}` : `${monthLabel(month, true)} · cloudy`) : monthLabel(month, true), cloudy: m && !m.clear };
  });

  return (
    <div className="analyse-page">
      <div className="analyse-top">
        <div className="analyse-title">
          <h1>{lead.name}</h1>
          {lead.county && <span className="muted small">Co. {lead.county}</span>}
        </div>

        <div className="top-controls">
          {!result && (
            <select value={pitchType} onChange={(e) => setPitchType(e.target.value)} aria-label="Surface">
              {PITCH_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          )}
          {!result && pitchType !== 'golf' && (
            <select
              value={pitchKind}
              aria-label="Which pitch"
              onChange={(e) => {
                const kind = e.target.value;
                setPitchKind(kind);
                const names = { main: 'Main pitch', training: 'Training pitch', juvenile: 'Juvenile pitch', other: '' };
                if (!label || Object.values(names).includes(label)) setLabel(names[kind]);
              }}
            >
              <option value="main">Main pitch</option>
              <option value="training">Training pitch</option>
              <option value="juvenile">Juvenile pitch</option>
              <option value="other">Other area</option>
            </select>
          )}
          {!result && GOAL_SIZE[pitchType] && (
            <label className="goal-toggle small" title="Measure both goalmouths on their own from a closer photo">
              <input type="checkbox" checked={withGoals} onChange={(e) => setWithGoals(e.target.checked)} />
              Goalmouths
            </label>
          )}
          <select
            value={strip.selected}
            onChange={(e) => strip.onPick(e.target.value)}
            aria-label="Month"
            className="month-select"
            disabled={result && !resultHasMap}
          >
            <option value="">Latest photo (sharp)</option>
            {monthOptions.map((o) => (
              <option key={o.month} value={o.month} disabled={o.cloudy}>{o.label}</option>
            ))}
          </select>
          <select value={period} onChange={(e) => setPeriod(Number(e.target.value))} aria-label="Report period" title="How far the report looks back and plans ahead">
            {PERIODS.map((p) => <option key={p} value={p}>{periodLabel(p)} analysis</option>)}
          </select>
          {!result && (
            <>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name, e.g. Main pitch" aria-label="Name" />
            <button className="btn btn-gold" onClick={run} disabled={points.length < 3 || state.busy === 'run'}>
              {state.busy === 'run' ? 'Analysing...' : 'Analyse'}
            </button>
            </>
          )}
        </div>

        <span className="row-buttons">
          <Link to={`/admin/club/${leadId}`} className="btn btn-ghost btn-small">Contacts and portal</Link>
          <Link to="/admin/analysis" className="btn btn-ghost btn-small">All clubs</Link>
        </span>
      </div>

      <MonthStrip {...strip} hint={stripHint} area={stripArea} />

      <div className="analyse-grid">
        <div className="map-col">
          {/* Leaflet owns the inner div, so the drawing class goes on the wrapper */}
          <div className={`map-wrap ${isDrawing ? 'drawing' : ''}`}>
            <div ref={mapEl} className="map" />

            {!result && (
              <div className="map-tools">
                <button
                  className="tool tool-auto"
                  onClick={() => (state.busy === 'auto' ? cancelAuto() : autoDetect())}
                  title={state.busy === 'auto' ? 'Stop the automatic search' : 'Draw both boxes automatically'}
                >
                  {state.busy === 'auto' ? 'Stop Auto' : 'Auto'}
                </button>
                <button className={`tool ${isDrawing === 'site' ? 'active' : ''} ${sitePts.length ? 'done' : ''}`} onClick={() => toggleTool('site')} title="Optional. Context for the report, not measured.">
                  <span className="tool-icon dashed" /> Grounds
                </button>
                <button className={`tool ${isDrawing === 'pitch' ? 'active' : ''} ${points.length ? 'done' : ''}`} onClick={() => toggleTool('pitch')} title="The grass that gets measured">
                  <span className="tool-icon solid" /> Pitch
                </button>
                {points.length === 4 && pitchType !== 'golf' && (
                  <button className="tool" onClick={snapPitch} title="Straighten the pitch box into a rectangle of real pitch size">Snap</button>
                )}
                {points.length > 0 && (
                  <button
                    className={`tool ${String(isDrawing).startsWith('extra:') && extraKind.current[String(isDrawing).slice(6)] === 'exclude' ? 'active' : ''}`}
                    onClick={() => addExtra('exclude')}
                    disabled={extras.filter((x) => x.kind === 'exclude').length >= 8}
                    title="Box a dugout, stand, path or car park inside the pitch box so it is left out"
                  >
                    <span className="tool-icon exclude" /> Leave out
                  </button>
                )}
                {pitchType !== 'golf' && (
                  <button className="tool" onClick={() => addExtra('training')} disabled={extras.filter((x) => x.kind !== 'exclude').length >= 4} title="Add a training, juvenile or other pitch to the same report">
                    <span className="tool-icon extra" /> + Pitch
                  </button>
                )}
                {(points.length > 0 || sitePts.length > 0 || extras.length > 0) && (
                  <button className="tool" onClick={clearAll}>Clear</button>
                )}
              </div>
            )}

            <div className="map-rotate">
              <button onClick={() => turnTo(bearing - 15)} title="Turn left 15°">⟲</button>
              <button onClick={() => squareUp()} title="Turn the map so the pitch is upright, goals top and bottom" className="map-rotate-main">Square up</button>
              <button onClick={() => turnTo(bearing + 15)} title="Turn right 15°">⟳</button>
              <button onClick={() => turnTo(0)} title="North up" className={bearing === 0 ? 'active' : ''}>
                <span className="north" style={{ transform: `rotate(${bearing}deg)` }}>N</span>
              </button>
            </div>

            {result && (
              <label className="map-toggle">
                <input type="checkbox" checked={showOverlay} onChange={(e) => setShowOverlay(e.target.checked)} />
                Show analysis
              </label>
            )}

            {(state.msg || state.error) && (
              <div className={`map-hint ${state.error ? 'is-error' : ''}`}>{state.error || state.msg}</div>
            )}
            {state.busy === 'run' && <div className="map-busy">Getting the image, measuring and writing the report. About a minute...</div>}
          </div>

          {result && (
            <div className="report-below" id="turf-report">
              {period !== (result.analysis.imagery?.period || 12) && (
                <div className="period-banner">
                  <span>This report covers {phrase(result.analysis.imagery?.period || 12)}. Switch it to {phrase(period)}?</span>
                  <button className="btn btn-gold btn-small" onClick={rewrite} disabled={!!state.busy}>
                    {state.busy === 'rewrite' ? 'Writing...' : `Rewrite for ${phrase(period)}`}
                  </button>
                </div>
              )}
              <details className="club-panel report-club no-print">
                <summary>
                  Club details used for the care programme
                  <span className="club-summary">{profileSummary(result.analysis.pitch_type, result.lead?.pitch_profile)}{!result.lead?.pitch_profile && ' (typical values)'}</span>
                </summary>
                <ClubDetails
                  lead={result.lead || lead}
                  pitchType={result.analysis.pitch_type}
                  onSaved={async (p) => {
                    setLead((l) => ({ ...l, pitch_profile: p }));
                    const fresh = await api(`/analyses/${result.analysis.id}`);
                    setResult(fresh);
                    setState({ busy: '', msg: 'Club details saved. The built in plan has updated; click Rewrite notes so Claude tailors it too.', error: '' });
                  }}
                />
              </details>
              <TurfReport
                data={result}
                months={resultSat.months}
                period={result.analysis.imagery?.period || 12}
                loadMonth={(month) => api(`/analyses/${result.analysis.id}/satellite/${month}`)}
              />
            </div>
          )}
        </div>

        {shareOpen && result && (
          <ShareModal
            leadId={leadId}
            leadName={lead?.name || 'the club'}
            analysis={result.analysis}
            onClose={() => setShareOpen(false)}
            onShared={afterShare}
          />
        )}
        <aside className="card analyse-panel">
          {result ? (
            <ResultPanel
              data={result}
              label={label}
              setLabel={setLabel}
              busy={state.busy}
              onSave={save}
              onPortal={setPortal}
              onContact={() => setShareOpen(true)}
              onDiscard={discard}
              onRewrite={rewrite}
              onNew={newAnalysis}
              months={resultSat.months}
              satMonth={satMonth}
              monthInfo={monthInfo}
              onPickMonth={(m) => pickMonth(m)}
            />
          ) : (
            <>
              {!lead.lat && (
                <form onSubmit={findPlace} className="stack">
                  <strong>No map pin for this club</strong>
                  <input placeholder="Town or club name" value={place} onChange={(e) => setPlace(e.target.value)} />
                  <div className="row-buttons">
                    <button className="btn btn-small">Find place</button>
                    <button type="button" className="btn btn-ghost btn-small" onClick={savePin}>Save pin here</button>
                  </div>
                </form>
              )}

              <ol className="checklist">
                <li className={sitePts.length ? 'done' : ''}>
                  <span><strong>Grounds box</strong> <span className="muted small">optional</span></span>
                  <span className="small muted">{sitePts.length ? 'Drawn. Adds context for Claude.' : 'Gold dashed. Not measured.'}</span>
                </li>
                <li className={points.length ? 'done' : 'next'}>
                  <span><strong>Pitch box</strong></span>
                  <span className="small muted">
                    {points.length ? `${pitchHa.toFixed(2)} ha${pitchHa > 2.5 ? ', looks big for one pitch' : ''}` : 'Use Auto or the Pitch tool on the map.'}
                  </span>
                </li>
                <li className={extras.some((x) => x.kind === 'exclude' && x.points.length) ? 'done' : ''}>
                  <span><strong>Leave out</strong> <span className="muted small">optional</span></span>
                  <span className="small muted">
                    Box dugouts, a stand, a path or a car park that falls inside the pitch box. Hard surfaces along the edge are left out automatically too.
                  </span>
                  {extras.filter((x) => x.kind === 'exclude').map((x) => (
                    <div key={x.key} className="extra-row exclude-row">
                      <div className="extra-actions small">
                        <strong>{x.label}</strong>
                        <span className={x.points.length ? 'ok' : 'muted'}>{x.points.length ? 'Drawn' : isDrawing === `extra:${x.key}` ? 'Drawing...' : 'Not drawn'}</span>
                        <button type="button" className="link-btn" onClick={() => startDrawing(`extra:${x.key}`)}>{x.points.length ? 'Redraw' : 'Draw'}</button>
                        <button type="button" className="link-btn" onClick={() => removeExtra(x.key)}>Remove</button>
                      </div>
                    </div>
                  ))}
                  {points.length > 0 && extras.filter((x) => x.kind === 'exclude').length < 8 && (
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => addExtra('exclude')}>+ Leave out an area</button>
                  )}
                </li>
                <li className={extras.some((x) => x.kind !== 'exclude' && x.points.length) ? 'done' : ''}>
                  <span><strong>More pitches</strong> <span className="muted small">optional</span></span>
                  <span className="small muted">Training, juvenile or other pitches, each with its own part of the report.</span>
                  {extras.filter((x) => x.kind !== 'exclude').map((x) => (
                    <div key={x.key} className="extra-row">
                      <input value={x.label} onChange={(e) => updateExtra(x.key, { label: e.target.value })} aria-label="Pitch name" />
                      <select
                        value={x.kind}
                        aria-label="Pitch type"
                        onChange={(e) => {
                          const kind = e.target.value;
                          const named = Object.values(EXTRA_KINDS).some((n) => x.label.startsWith(n));
                          updateExtra(x.key, named ? { kind, label: EXTRA_KINDS[kind] } : { kind });
                        }}
                      >
                        {Object.entries(EXTRA_KINDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <div className="extra-actions small">
                        <span className={x.points.length ? 'ok' : 'muted'}>{x.points.length ? 'Drawn' : isDrawing === `extra:${x.key}` ? 'Drawing...' : 'Not drawn'}</span>
                        <button type="button" className="link-btn" onClick={() => startDrawing(`extra:${x.key}`)}>{x.points.length ? 'Redraw' : 'Draw'}</button>
                        <button type="button" className="link-btn" onClick={() => removeExtra(x.key)}>Remove</button>
                      </div>
                    </div>
                  ))}
                  {pitchType !== 'golf' && extras.filter((x) => x.kind !== 'exclude').length < 4 && (
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => addExtra('training')}>+ Add a pitch</button>
                  )}
                </li>
                <li className={setupMonth ? 'done' : ''}>
                  <span><strong>Month</strong> <span className="muted small">optional</span></span>
                  <span className="small muted">
                    {setupMonth
                      ? `${monthLabel(setupMonth, true)}${monthInfo?.clear ? `: ${monthInfo.strongPct}% strong, ${monthInfo.thinPct}% thin` : ''}`
                      : 'Pick one at the top, before or after drawing.'}
                  </span>
                </li>
              </ol>

              <details className="club-panel">
                <summary>
                  Club details for the care programme
                  <span className="club-summary">{lead.pitch_profile ? profileSummary(pitchType, lead.pitch_profile) : 'Not set yet, typical values will be used'}</span>
                </summary>
                <ClubDetails lead={lead} pitchType={pitchType} onSaved={(p) => setLead((l) => ({ ...l, pitch_profile: p }))} />
              </details>

              <p className="muted small">Set the surface and name at the top, then press Analyse.</p>
            </>
          )}

          {club?.pitches?.length > 0 && (
            <div className="club-overview">
              <strong className="small">Club overview</strong>
              {club.pitches.map((p, i) => (
                <button key={p.key || p.id} className="club-pitch" onClick={() => setParams({ report: String(p.id) })}>
                  <span className="saved-score">{p.score}</span>
                  <span>
                    {p.label}
                    {i === 0 && club.pitches.length > 1 && <span className="tr-chip red">Needs most work</span>}
                    {p.inPortal && <span className="tr-chip green">Portal</span>}
                    <small>
                      {p.goalmouths.length ? p.goalmouths.map((g) => `${g.label.replace(' end', '')} ${g.score}`).join(' · ') : `${p.thinPct}% thin`}
                    </small>
                  </span>
                </button>
              ))}
              {club.pitches.length > 1 && (
                <p className="small muted">
                  All pitches for a season at Club standard: care programme about €{club.totals.essential.toLocaleString('en-IE')}, of which Oramara Turf Biostimulant €{club.totals.oramara.toLocaleString('en-IE')}.
                </p>
              )}
            </div>
          )}

          {!!saved.length && (
            <div className="saved-list">
              <strong className="small">Saved for this club</strong>
              {saved.map((s) => (
                <button
                  key={s.id}
                  className={`saved-item ${result?.analysis.id === s.id ? 'active' : ''}`}
                  onClick={() => setParams({ report: String(s.id) })}
                >
                  <span className="saved-score">{s.score}</span>
                  <span>
                    {s.label || labelFor(PITCH_TYPES, s.pitch_type)}
                    <small>
                      {new Date(s.created_at).toLocaleDateString('en-IE')}
                      {s.in_portal && <span className="tr-chip green">Portal</span>}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// Months as a strip of coloured tiles under the map. The first tile is the sharp photo.
function MonthStrip({ months, selected, onPick, loading, enabled, error, hint, area }) {
  const cls = (m) => (!m ? 'unknown' : !m.clear ? 'cloudy' : m.ndvi >= 0.75 ? 'strong' : m.ndvi >= 0.6 ? 'moderate' : 'thin');
  // Always show the last 24 months; colour them in once the data has loaded
  const all = [...LAST_MONTHS].reverse();
  const canPick = enabled && !hint;
  const note = !enabled
    ? 'Add the Copernicus keys to backend/.env for monthly satellite data.'
    : hint || (loading ? 'Loading monthly satellite data...' : error || '');

  return (
    <div className="month-strip">
      <button className={`month-tile photo ${!selected ? 'active' : ''}`} onClick={() => onPick('')} title="Sharp aerial photo, date unknown">
        <span className="month-name">Photo</span>
        <span className="month-bar" />
      </button>

      <div className="month-tiles">
        {all.map((month, i) => {
          const m = months.find((x) => x.month === month);
          const [y, mo] = month.split('-');
          return (
            <button
              key={month}
              className={`month-tile ${cls(m)} ${selected === month ? 'active' : ''}`}
              disabled={!canPick || (m && !m.clear)}
              onClick={() => onPick(month)}
              title={
                !m ? monthLabel(month, true)
                  : m.clear ? `${monthLabel(month, true)}: vigour ${m.ndvi.toFixed(2)}, ${m.strongPct}% strong`
                  : `${monthLabel(month, true)}: too cloudy`
              }
            >
              <span className="month-name">{monthLabel(month).split(' ')[0]}</span>
              {(mo === '01' || i === 0) && <span className="month-year">{y}</span>}
              <span className="month-bar" />
            </button>
          );
        })}
      </div>

      <div className="strip-legend">
        {note ? (
          <span className={`strip-area ${error && !hint ? 'is-error' : ''}`}>{note}</span>
        ) : (
          area && <span className="strip-area">Showing: {area}</span>
        )}
        <span><i className="strong" />Strong</span>
        <span><i className="moderate" />Moderate</span>
        <span><i className="thin" />Thin</span>
        <span><i className="cloudy" />Cloud</span>
      </div>
    </div>
  );
}

function ResultPanel({ data, label, setLabel, busy, onSave, onPortal, onContact, onDiscard, onRewrite, onNew, months, satMonth, monthInfo, onPickMonth }) {
  const { analysis: a, plan } = data;
  const ai = a.ai_report && !a.ai_report.error ? a.ai_report : null;
  const zones = a.zones.map((z) => ({ ...z, note: ai?.zones.find((n) => n.letter === z.letter) }));
  const showMonth = satMonth && monthInfo?.clear;

  return (
    <>
      <div className="result-head">
        <div className="score-big">{showMonth ? monthInfo.ndvi.toFixed(2) : a.score}</div>
        <div>
          <strong>{showMonth ? `Vigour, ${monthLabel(satMonth, true)}` : 'Turf score'}</strong>
          <div className="muted small">
            {showMonth ? 'Sentinel 2 satellite, 10 m' : a.imagery?.areaM2 ? `${(a.imagery.areaM2 / 10000).toFixed(2)} ha measured` : ''}
          </div>
        </div>
      </div>

      <div>
        <div className="bar">
          <span style={{ width: `${showMonth ? monthInfo.strongPct : a.healthy_pct}%` }} />
          <span style={{ width: `${showMonth ? monthInfo.moderatePct : a.moderate_pct}%` }} />
          <span style={{ width: `${showMonth ? monthInfo.thinPct : a.stressed_pct}%` }} />
        </div>
        <div className="legend legend-row small">
          <span><i style={{ background: 'var(--green)' }} />{showMonth ? monthInfo.strongPct : a.healthy_pct}% strong</span>
          <span><i style={{ background: '#d6aa32' }} />{showMonth ? monthInfo.moderatePct : a.moderate_pct}%</span>
          <span><i style={{ background: 'var(--red)' }} />{showMonth ? monthInfo.thinPct : a.stressed_pct}% thin</span>
        </div>
      </div>

      <p className="muted small method-line">
        {a.imagery?.photoDate ? `Photo taken ${new Date(a.imagery.photoDate).toLocaleDateString('en-IE', { month: 'long', year: 'numeric' })}` : 'Photo date unknown'}
        {a.imagery?.insetM ? ` · measured ${a.imagery.insetM} m inside the edge` : ''}
        {a.imagery?.skippedPct ? ` · ${a.imagery.skippedPct}% line paint and shadow left out` : ''}
      </p>

      {data.parts?.length > 0 && (
        <div className="goal-mini small">
          {data.parts.map((g) => (
            <span key={g.id} className={g.kind === 'pitch' ? 'is-pitch' : ''}><b>{g.score}</b> {g.label}</span>
          ))}
        </div>
      )}

      <p className="result-headline">{ai?.headline || plan.headline}</p>
      {ai?.summary && <p className="small">{ai.summary}</p>}
      {a.ai_report?.error && <p className="error small">{a.ai_report.error}</p>}

      <button className="btn btn-ghost btn-small report-jump" onClick={() => document.getElementById('turf-report')?.scrollIntoView({ behavior: 'smooth' })}>
        Read the full report below
      </button>

      <div className="name-row">
        <input value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Name" />
        {!a.saved ? (
          <button className="btn btn-gold btn-small" onClick={onSave} disabled={!!busy}>
            {busy === 'save' ? 'Saving...' : 'Save'}
          </button>
        ) : (
          <span className="tag saved-tag">Saved</span>
        )}
      </div>

      <div className={`portal-box ${a.in_portal ? 'is-on' : ''}`}>
        {a.in_portal ? (
          <>
            <span className="portal-state">
              <span className="portal-tick" aria-hidden="true">✓</span>
              <span>
                <strong>In the club's portal</strong>
                <small>
                  {a.portal_months && a.portal_months < 12 ? `${a.portal_months} month${a.portal_months === 1 ? '' : 's'} free, full year offered` : 'Full year shown'}
                  {a.portal_at ? ` · ${new Date(a.portal_at).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}` : ''}
                </small>
              </span>
            </span>
            <span className="portal-box-actions">
              <button type="button" className="btn btn-small" onClick={onContact} disabled={!!busy}>Contact club</button>
              <button type="button" className="link-btn small" onClick={() => onPortal(false)} disabled={!!busy}>Remove</button>
            </span>
          </>
        ) : (
          <>
            <span>
              <strong>Share with the club</strong>
              <small>Save it to their portal, choose the free months and get the email ready.</small>
            </span>
            <button type="button" className="btn btn-gold btn-small" onClick={onContact} disabled={!!busy}>
              Save and contact club
            </button>
          </>
        )}
      </div>

      <div className="row-buttons">
        <Link className="btn btn-small" to={`/admin/report/${a.id}`}>Printable report</Link>
        <button className="btn btn-ghost btn-small" onClick={onNew}>New</button>
        {data.claudeEnabled && (
          <button className="btn btn-ghost btn-small" onClick={onRewrite} disabled={!!busy}>
            {busy === 'rewrite' ? 'Writing...' : 'Rewrite notes'}
          </button>
        )}
        <button className="btn btn-ghost btn-small" onClick={onDiscard} disabled={!!busy}>{a.saved ? 'Delete' : 'Discard'}</button>
      </div>
    </>
  );
}