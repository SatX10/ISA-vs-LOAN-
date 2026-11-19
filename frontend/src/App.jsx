import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Sidebar from './layout/Sidebar.jsx';
import Topbar from './layout/Topbar.jsx';
import MobileNav from './layout/MobileNav.jsx';
import Sensitivity from './pages/Sensitivity.jsx';
import Export from './pages/Export.jsx';
import Saved from './pages/Saved.jsx';
import BreakEven from './pages/BreakEven.jsx';
import ContractChecker from './pages/ContractChecker.jsx';
import Methodology from './pages/Methodology.jsx';

const Calculator = lazy(() => import('./pages/Calculator.jsx'));
const Scenarios = lazy(() => import('./pages/Scenarios.jsx'));

export default function App() {
  return (
    <div className="app-shell">
      <Sidebar />
      <Topbar />
      <main className="main-content">
        <Suspense fallback={<div className="loading-spinner" role="status">Loading…</div>}>
          <Routes>
            <Route path="/" element={<Calculator />} />
            <Route path="/scenarios" element={<Scenarios />} />
            <Route path="/sensitivity" element={<Sensitivity />} />
            <Route path="/break-even" element={<BreakEven />} />
            <Route path="/contract-checker" element={<ContractChecker />} />
            <Route path="/methodology" element={<Methodology />} />
            <Route path="/export" element={<Export />} />
            <Route path="/saved" element={<Saved />} />
          </Routes>
        </Suspense>
      </main>
      <MobileNav />
    </div>
  );
}
