// oramara/frontend/src/App.jsx
import { Navigate, Route, Routes } from 'react-router-dom';
import { auth } from './api.js';
import Home from './pages/Home.jsx';
import Pitches from './pages/Pitches.jsx';
import Research from './pages/Research.jsx';
import Login from './pages/admin/Login.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import Leads from './pages/admin/Leads.jsx';
import LeadFinder from './pages/admin/LeadFinder.jsx';
import Analysis from './pages/admin/Analysis.jsx';
import AnalyseLead from './pages/admin/AnalyseLead.jsx';
import Report from './pages/admin/Report.jsx';
import Usage from './pages/admin/Usage.jsx';
import ClubAccount from './pages/admin/ClubAccount.jsx';
import PortalOverview from './pages/admin/PortalOverview.jsx';
import Account from './pages/admin/Account.jsx';
import PortalLogin from './pages/portal/PortalLogin.jsx';
import PortalAccept from './pages/portal/PortalAccept.jsx';
import PortalLayout from './pages/portal/PortalLayout.jsx';
import PortalHome from './pages/portal/PortalHome.jsx';
import PortalReport from './pages/portal/PortalReport.jsx';
import PortalLink from './pages/portal/PortalLink.jsx';

function Protected({ children }) {
  return auth.token ? children : <Navigate to="/admin/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/pitches" element={<Pitches />} />
      <Route path="/research" element={<Research />} />
      <Route path="/admin/login" element={<Login />} />
      <Route
        path="/admin"
        element={
          <Protected>
            <AdminLayout />
          </Protected>
        }
      >
        <Route index element={<Leads />} />
        <Route path="finder" element={<LeadFinder />} />
        <Route path="analysis" element={<Analysis />} />
        <Route path="analysis/:leadId" element={<AnalyseLead />} />
        <Route path="usage" element={<Usage />} />
        <Route path="club/:leadId" element={<ClubAccount />} />
        <Route path="portal" element={<PortalOverview />} />
        <Route path="account" element={<Account />} />
      </Route>
      <Route
        path="/admin/report/:id"
        element={
          <Protected>
            <Report />
          </Protected>
        }
      />
      {/* FieldFalcon customer portal for clubs: its own login, apart from the admin */}
      <Route path="/r/:token" element={<PortalLink />} />
      <Route path="/portal/login" element={<PortalLogin />} />
      <Route path="/portal/accept/:token" element={<PortalAccept />} />
      <Route path="/portal" element={<PortalLayout />}>
        <Route index element={<PortalHome />} />
        <Route path="report/:id" element={<PortalReport />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}