import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import Landing from './pages/Landing';
import TopBar from './components/TopBar';

const Shifts = lazy(() => import('./pages/Shifts'));
const Control = lazy(() => import('./pages/Control'));
const Debrief = lazy(() => import('./pages/Debrief'));
const Learn = lazy(() => import('./pages/Learn'));
const About = lazy(() => import('./pages/About'));

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!pathname.startsWith('/control')) window.scrollTo(0, 0);
  }, [pathname]);
  const chrome = !pathname.startsWith('/control');
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
          <Route path="*" element={<Landing />} />
        </Routes>
      </Suspense>
    </>
  );
}
