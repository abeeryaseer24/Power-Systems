import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import TopBar from './components/TopBar';

const Landing = lazy(() => import('./pages/Landing'));
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
const WhatIf = lazy(() => import('./pages/WhatIf'));
const BlackStart = lazy(() => import('./pages/BlackStart'));
const ReactorStartup = lazy(() => import('./pages/ReactorStartup'));
const Predictor = lazy(() => import('./pages/Predictor'));
const Instrumentation = lazy(() => import('./pages/Instrumentation'));

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  const chrome = !pathname.startsWith('/control') && !/^\/(atlas|blackouts|documentary)\/./.test(pathname) && !pathname.startsWith('/what-if') && !pathname.startsWith('/black-start');
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
          <Route path="/black-start" element={<BlackStart />} />
          <Route path="/black-start/:id" element={<BlackStart />} />
          <Route path="/what-if" element={<WhatIf />} />
          <Route path="/what-if/:id" element={<WhatIf />} />
          <Route path="/documentary" element={<Documentary />} />
          <Route path="/documentary/:id" element={<Documentary />} />
          <Route path="/academy" element={<Academy />} />
          <Route path="/academy/:id" element={<Academy />} />
          <Route path="/nuclear" element={<Nuclear />} />
          <Route path="/nuclear/instrumentation" element={<Instrumentation />} />
          <Route path="/reactor-startup" element={<ReactorStartup />} />
          <Route path="/predictor" element={<Predictor />} />
          <Route path="/nuclear/:id" element={<Nuclear />} />
          <Route path="*" element={<Landing />} />
        </Routes>
      </Suspense>
    </>
  );
}
