import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import TopBar from './components/TopBar';

const Landing = lazy(() => import('./pages/Landing'));
const Shifts = lazy(() => import('./pages/Shifts'));
const Control = lazy(() => import('./pages/Control'));
const Debrief = lazy(() => import('./pages/Debrief'));
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
const Course = lazy(() => import('./pages/Course'));
const DhakaTonight = lazy(() => import('./pages/DhakaTonight'));
const Instrumentation = lazy(() => import('./pages/Instrumentation'));
const Protection = lazy(() => import('./pages/Protection'));
const Market = lazy(() => import('./pages/Market'));
const Oscillations = lazy(() => import('./pages/Oscillations'));
const Live = lazy(() => import('./pages/Live'));

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  const chrome = !pathname.startsWith('/control') && !/^\/(atlas|blackouts|documentary)\/./.test(pathname) && !pathname.startsWith('/what-if') && !pathname.startsWith('/black-start') && !pathname.startsWith('/dhaka-tonight');
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
          <Route path="/learn" element={<Navigate to="/course" replace />} />
          <Route path="/learn/:topic" element={<LearnRedirect />} />
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
          <Route path="/dhaka-tonight" element={<DhakaTonight />} />
          <Route path="/protection" element={<Protection />} />
          <Route path="/market" element={<Market />} />
          <Route path="/oscillations" element={<Oscillations />} />
          <Route path="/live" element={<Live />} />
          <Route path="/course" element={<Course />} />
          <Route path="/course/:id" element={<Course />} />
          <Route path="/nuclear/:id" element={<Nuclear />} />
          <Route path="*" element={<Landing />} />
        </Routes>
      </Suspense>
    </>
  );
}

// the old lessons now live inside the course
const LESSON_TO_CHAPTER: Record<string, string> = { frequency: 'frequency', powerflow: 'power-flow', cascade: 'protection', merit: 'markets', blackstart: 'operating' };
function LearnRedirect() {
  const { topic = '' } = useParams();
  return <Navigate to={`/course/${LESSON_TO_CHAPTER[topic] ?? ''}`} replace />;
}
