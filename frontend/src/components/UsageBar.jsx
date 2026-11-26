// oramara/frontend/src/components/UsageBar.jsx
// Thin bar at the top of the admin showing what the outside APIs have cost so far.
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import '../pages/admin/usage.css';

export const money = (usd) => {
  const v = Number(usd) || 0;
  return v > 0 && v < 0.01 ? '<$0.01' : `$${v.toFixed(2)}`;
};

export default function UsageBar() {
  const [u, setU] = useState(null);
  const location = useLocation();

  useEffect(() => {
    let alive = true;
    const load = () => api('/usage/summary').then((d) => alive && setU(d)).catch(() => {});
    load();
    const t = setInterval(load, 15000); // keeps up while analyses run
    window.addEventListener('oramara:usage', load);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener('oramara:usage', load);
    };
  }, [location.pathname]);

  if (!u) return null;
  const used = Number(u.copernicus_month) || 0;
  const allowance = Number(u.copernicus_allowance) || 30000;
  const pu = Math.round(used);
  const puShare = Math.min(100, (used / allowance) * 100);

  return (
    <div className="usage-bar">
      <span className="usage-title">API costs</span>
      <span className="usage-item" title={u.has_session ? `${u.session_calls} calls since you logged in` : 'Log out and in again to start tracking by session'}>
        This session <strong>{u.has_session ? money(u.session) : 'n/a'}</strong>
      </span>
      <span className="usage-item">Today <strong>{money(u.today)}</strong></span>
      <span className="usage-item">This month <strong>{money(u.month)}</strong></span>
      <span className="usage-item">All time <strong>{money(u.total)}</strong></span>
      <span className="usage-item usage-free" title="Copernicus satellite data is free up to a monthly allowance">
        Satellite <strong>{pu.toLocaleString('en-IE')}</strong> / {allowance.toLocaleString('en-IE')} free units
        <i><b style={{ width: `${puShare}%` }} /></i>
      </span>
      <Link to="/admin/usage" className="usage-link">Details</Link>
    </div>
  );
}