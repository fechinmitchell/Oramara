// oramara/frontend/src/pages/admin/AdminLayout.jsx
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { auth } from '../../api.js';
import { TECH } from '../../config/brand.js';
import UsageBar from '../../components/UsageBar.jsx';

export default function AdminLayout() {
  const nav = useNavigate();

  function logout() {
    auth.clear();
    nav('/admin/login');
  }

  return (
    <div className="admin">
      <aside className="admin-side">
        {/* The admin is the FieldFalcon app; Oramara is the company behind it */}
        <a href="/admin" className="logo admin-logo">
          {TECH.name}
          <span className="admin-logo-by">{TECH.byline}</span>
        </a>
        <nav>
          <NavLink to="/admin" end>Leads</NavLink>
          <NavLink to="/admin/finder">Lead finder</NavLink>
          <NavLink to="/admin/analysis">Turf analysis</NavLink>
          <NavLink to="/admin/portal">Customer portal</NavLink>
          <NavLink to="/admin/usage">API usage</NavLink>
          <NavLink to="/admin/account">Account</NavLink>
        </nav>
        <a href="/" style={{ color: "#c3d4ce", fontSize: "0.9rem" }}>View website</a>
        <button className="btn btn-ghost btn-small" onClick={logout}>Log out</button>
      </aside>
      <main className="admin-main">
        <UsageBar />
        <Outlet />
      </main>
    </div>
  );
}