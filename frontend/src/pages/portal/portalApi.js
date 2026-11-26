// oramara/frontend/src/pages/portal/portalApi.js
// Calls for the customer portal. Clubs have their own login, kept apart from the admin token.
import { API_URL } from '../../config/apiBase.js';
const TOKEN_KEY = 'fieldfalcon_portal_token';

export const portalAuth = {
  get token() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {}
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {}
  }
};

export async function portalApi(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (portalAuth.token) headers.Authorization = `Bearer ${portalAuth.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_URL}/api/portal${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !['/login', '/accept'].includes(path) && !path.startsWith('/link/')) {
    portalAuth.clear();
    if (!location.pathname.startsWith('/portal/login')) location.href = '/portal/login';
  }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// One id per browser tab visit, so the admin can count visits rather than page loads
export const session = (() => {
  try {
    let id = sessionStorage.getItem('ff_session');
    if (!id) {
      id = Math.random().toString(36).slice(2, 12);
      sessionStorage.setItem('ff_session', id);
    }
    return id;
  } catch {
    return 'none';
  }
})();

// Note what the club looks at; never gets in the way if it fails
export function track(kind, detail, analysisId) {
  if (!portalAuth.token) return;
  portalApi('/events', { method: 'POST', body: { kind, detail, analysisId, session } }).catch(() => {});
}