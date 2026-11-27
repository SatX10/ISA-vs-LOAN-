import { lazy, Suspense, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Navigate, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './layout/Sidebar.jsx';
import Topbar from './layout/Topbar.jsx';
import MobileNav from './layout/MobileNav.jsx';
import PlanningLayout from './layout/PlanningLayout.jsx';
import SiteFooter from './layout/SiteFooter.jsx';
import Export from './pages/Export.jsx';
import Saved from './pages/Saved.jsx';
import ContractChecker from './pages/ContractChecker.jsx';
import Methodology from './pages/Methodology.jsx';
import LoadingPanel from './components/LoadingPanel.jsx';
import Welcome from './pages/Welcome.jsx';

const Calculator = lazy(() => import('./pages/Calculator.jsx'));
const Scenarios = lazy(() => import('./pages/Scenarios.jsx'));
const Sensitivity = lazy(() => import('./pages/Sensitivity.jsx'));
const BreakEven = lazy(() => import('./pages/BreakEven.jsx'));
const Planner = lazy(() => import('./pages/Planner.jsx'));
const DreamPath = lazy(() => import('./pages/DreamPath.jsx'));
const LoanRules = lazy(() => import('./pages/LoanRules.jsx'));
const About = lazy(() => import('./pages/About.jsx'));
const DataSharing = lazy(() => import('./pages/DataSharing.jsx'));
const Workspace = lazy(() => import('./pages/Workspace.jsx'));
const AuthPage = lazy(() => import('./pages/Account.jsx').then(({ AuthPage }) => ({ default: AuthPage })));
const ProfilePage = lazy(() => import('./pages/Account.jsx').then(({ ProfilePage }) => ({ default: ProfilePage })));

function Dashboard({ leaving, mainRef }) {
  return (
    <div className="app-shell" inert={leaving ? '' : undefined}>
      <a className="btn btn-primary skip-link" href="#main-content">Skip to main content</a>
      <Sidebar />
      <Topbar />
      <main className="main-content" id="main-content" ref={mainRef} tabIndex={-1}>
        <Suspense fallback={<div className="card"><LoadingPanel label="Loading page" /></div>}>
          <Routes>
            <Route path="/calculator" element={<Calculator />} />
            <Route element={<PlanningLayout />}>
              <Route path="/planning" element={<DreamPath />} />
              <Route path="/dream-path" element={<DreamPath />} />
              <Route path="/planner" element={<Planner />} />
            </Route>
            <Route path="/loan-rules" element={<LoanRules />} />
            <Route path="/workspace" element={<Workspace />} />
            <Route path="/sign-in" element={<AuthPage key="sign-in" />} />
            <Route path="/sign-up" element={<AuthPage key="sign-up" creating />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/scenarios" element={<Scenarios />} />
            <Route path="/sensitivity" element={<Sensitivity />} />
            <Route path="/break-even" element={<BreakEven />} />
            <Route path="/contract-checker" element={<ContractChecker />} />
            <Route path="/methodology" element={<Methodology />} />
            <Route path="/export" element={<Export />} />
            <Route path="/saved" element={<Saved />} />
            <Route path="/about" element={<About />} />
            <Route path="/data-and-sharing" element={<DataSharing />} />
          </Routes>
        </Suspense>
      </main>
      <SiteFooter />
      <MobileNav />
    </div>
  );
}

export default function App() {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const main = useRef(null);
  const previousPath = useRef(pathname);
  const welcome = pathname === '/' && !search;
  const enter = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    navigate('/calculator');
  }, [leaving, navigate]);
  const finish = useCallback(() => setLeaving(false), []);
  useLayoutEffect(() => {
    if (leaving || previousPath.current === pathname) return;
    previousPath.current = pathname;
    if (hash) return;
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, [hash, leaving, pathname]);

  if (pathname === '/' && search) return <Navigate replace to={`/calculator${search}${hash}`} />;

  return (
    <>
      {(!welcome || leaving) && <Dashboard leaving={leaving} mainRef={main} />}
      {(welcome || leaving) && <Welcome leaving={leaving} onEnter={enter} onFinish={finish} />}
    </>
  );
}
