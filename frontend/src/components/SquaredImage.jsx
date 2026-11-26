// oramara/frontend/src/components/SquaredImage.jsx
// The aerial images are north up. Turn them the same way as "Square up" on the map, so the pitch's
// long side runs top to bottom, then trim the turned edges so the picture sits straight in its frame.
import { useEffect, useState } from 'react';

export function squareBearing(outline) {
  if (!outline || outline.length < 3) return 0;
  const k = Math.cos((outline[0][0] * Math.PI) / 180);
  const xy = outline.map(([la, lo]) => [lo * 111320 * k, la * 111320]);
  let best = null;
  for (let i = 0; i < xy.length; i++) {
    const a = xy[i];
    const b = xy[(i + 1) % xy.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!best || len > best.len) best = { len, dx: b[0] - a[0], dy: b[1] - a[1] };
  }
  let turn = -(Math.atan2(best.dx, best.dy) * 180) / Math.PI;
  if (turn <= -90) turn += 180;
  if (turn > 90) turn -= 180;
  return turn;
}

// Largest upright rectangle of a set shape (width / height = aspect) that fits inside a w x h picture
// turned by r radians, centred on the pitch. No blank corners, and every image comes out the same shape.
const ASPECT = 4 / 5;
function innerSize(w, h, r) {
  const s = Math.abs(Math.sin(r));
  const c = Math.abs(Math.cos(r));
  const halfH = Math.min(w / 2 / (ASPECT * c + s), h / 2 / (ASPECT * s + c));
  return [2 * halfH * ASPECT, 2 * halfH];
}

export function SquaredImage({ src, outline, alt }) {
  const [out, setOut] = useState(null);
  const turn = squareBearing(outline);
  useEffect(() => {
    setOut(null);
    if (!src || Math.abs(turn) < 2) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const r = (turn * Math.PI) / 180;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const [iw, ih] = innerSize(w, h, r);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(iw));
      canvas.height = Math.max(1, Math.floor(ih));
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(r);
      ctx.drawImage(img, -w / 2, -h / 2);
      setOut(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, turn]);
  // Hold back the north up picture while the straight one is made, so it never flashes tilted
  if (Math.abs(turn) >= 2 && !out) return <div className="sq-wait" role="img" aria-label={alt} />;
  return <img src={out || src} alt={alt} />;
}