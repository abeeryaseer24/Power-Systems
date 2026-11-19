import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import Landing from './pages/Landing';
import TopBar from './components/TopBar';

const Shifts = lazy(() => import('./pages/Shifts'));
const Control = lazy(() => import('./pages/Control'));
const Debrief = lazy(() => import('./pages/Debrief'));
const Learn = lazy(() => import('./pages/Learn'));
const About = lazy(() => import('./pages/About'));
const Atlas = lazy(() => import('./pages/Atlas'));
const RegionExplorer = lazy(() => import('./pages/RegionExplorer'));
const Blackouts = lazy(() => import('./pages/Blackouts'));
const Replay = lazy(() => import('./pages/Replay'));
const Nuclear = lazy(() => import('./pages/Nuclear'));
const Academy = lazy(() => import('./pages/Academy'));
const Documentary = lazy(() => import('./pages/Documentary'));
const Instrumentation = lazy(() => import('./pages/Instrumentation'));

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  const chrome = !pathname.startsWith('/control') && !/^\/(atlas|blackouts|documentary)\/./.test(pathname);
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      {chrome && <TopBar />}
      <Suspense fallback={<div className="loading" role="status">Energising…</div>}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/shifts" element={<Shifts />} />
          <Route path="/control/:id" element={<Control />} />
          <Route path="/debrief" element={<Debrief />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/learn/:topic" element={<Learn />} />
          <Route path="/about" element={<About />} />
          <Route path="/atlas" element={<Atlas />} />
          <Route path="/atlas/:id" element={<RegionExplorer />} />
          <Route path="/blackouts" element={<Blackouts />} />
          <Route path="/blackouts/:id" element={<Replay />} />
          <Route path="/documentary" element={<Documentary />} />
          <Route path="/documentary/:id" element={<Documentary />} />
          <Route path="/academy" element={<Academy />} />
          <Route path="/academy/:id" element={<Academy />} />
          <Route path="/nuclear" element={<Nuclear />} />
          <Route path="/nuclear/instrumentation" element={<Instrumentation />} />
          <Route path="/nuclear/:id" element={<Nuclear />} />
          <Route path="*" element={<Landing />} />
        </Routes>
      </Suspense>
    </>
  );
}
