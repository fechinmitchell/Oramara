// oramara/frontend/src/api.js
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');
const TOKEN_KEY = 'oramara_admin_token';

export const auth = {
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

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers,
    body: form || (body !== undefined ? JSON.stringify(body) : undefined)
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && path !== '/auth/login') {
    auth.clear();
    if (!location.pathname.startsWith('/admin/login')) location.href = '/admin/login';
  }
  // Calls that may use paid APIs: tell the usage bar to refresh
  if (method !== 'GET' || /\/analyses\/(auto|\d+\/satellite)/.test(path)) {
    try {
      window.dispatchEvent(new Event('oramara:usage'));
    } catch {}
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}