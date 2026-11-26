// oramara/frontend/src/config/apiBase.js
// Where the FieldFalcon backend lives. Set VITE_API_URL in Vercel to the Render address.
// Tidies common slips (no https, a trailing slash, a trailing /api) so the calls still land.
const LIVE_API = 'https://oramara.onrender.com';
const LOCAL_API = 'http://localhost:4000';

function tidy(raw) {
  let url = String(raw || '').trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, '').replace(/\/api$/i, '');
}

export const API_URL = tidy(import.meta.env.VITE_API_URL) || (import.meta.env.PROD ? LIVE_API : LOCAL_API);

// The free Render plan sleeps when idle. Calling this early wakes it while someone types.
export function wakeServer() {
  try {
    fetch(`${API_URL}/api/health`).catch(() => {});
  } catch {}
}
