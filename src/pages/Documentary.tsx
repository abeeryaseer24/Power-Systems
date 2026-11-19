import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { episodeById, EPISODES } from '../grid/documentaries';
import { eventById, stageEvent } from '../grid/events';
import { useRegion } from './atlas/useRegion';
import Anatomy from '../components/Anatomy';
import SoundToggle from '../components/SoundToggle';
import { sfx } from '../lib/sfx';
import '../documentary.css';

export default function Documentary() {
  const { id = '' } = useParams();
  const ep = episodeById(id);
  if (!ep) {
    return (
      <main id="main" className="page doc-index">
        <div className="page-head">
          <h1>Blackout: the documentaries</h1>
          <p>The minutes before each blackout, told as they happened, with the real grid going dark behind the story.</p>
        </div>
        <ol className="ep-list">
          {EPISODES.map((e) => (
            <li key={e.id}>
              <Link to={`/documentary/${e.id}`}><span className="ep-n">Episode {e.number}</span><span className="ep-t">{e.title}</span><span className="ep-tag">{e.tagline}</span></Link>
            </li>
          ))}
        </ol>
      </main>
    );
  }
  return <Episode key={ep.id} id={ep.id} />;
}

function Episode({ id }: { id: string }) {
  const ep = episodeById(id)!;
  const ev = eventById(id)!;
  const canvas = useRef<HTMLCanvasElement>(null);
  const r = useRegion(ev.region, canvas, (s) => stageEvent(s, ev, 'watch'));
  const [started, setStarted] = useState(false);
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState('');
  const scene = ep.scenes[i];

  useEffect(() => () => sfx.quiet(), []);

  // keep the map's simulator in step with the scene
  useEffect(() => {
    r.speed.current = 0;
    if (!started || !r.sim) return;
    const s = r.sim;
    const target = scene.simT;
    let raf = 0;
    const tick = () => {
      if (s.t < target) {
        // catch the map up to the scene within a small time budget per frame
        const t0 = performance.now();
        while (s.t < target && performance.now() - t0 < 14) s.advance(Math.min(0.5, target - s.t));
        raf = requestAnimationFrame(tick);
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, started, r.sim]);

  // typewriter timestamp
  useEffect(() => {
    if (!started) return;
    setTyped('');
    let k = 0;
    const iv = setInterval(() => {
      k++;
      setTyped(scene.clock.slice(0, k));
      if (scene.clock[k - 1] && scene.clock[k - 1] !== ' ') sfx.tick();
      if (k >= scene.clock.length) clearInterval(iv);
    }, 90);
    return () => clearInterval(iv);
  }, [i, started, scene.clock]);

  // advance scenes
  useEffect(() => {
    if (!started || i >= ep.scenes.length - 1) return;
    const t = setTimeout(() => setI(i + 1), scene.hold * 1000);
    return () => clearTimeout(t);
  }, [i, started, scene.hold, ep.scenes.length]);

  useEffect(() => {
    if (started) {
      const level = { calm: 0.25, tension: 0.55, impact: 0.9, dark: 0.4, after: 0.15 }[scene.mood ?? 'calm'];
      sfx.setDrone(level);
      if (scene.mood === 'impact') sfx.boom();
      if (scene.mood === 'dark' && ep.scenes[i - 1]?.mood !== 'dark') sfx.powerDown();
    }
    if (started && (scene.mood === 'impact' || scene.mood === 'dark')) r.scene?.kick(scene.mood === 'dark' ? 1 : 0.6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, started]);

  return (
    <main id="main" className={`doc mood-${started ? scene.mood ?? 'calm' : 'calm'}`}>
      <canvas ref={canvas} className="doc-canvas" aria-label="The grid during the event" />
      <div className="doc-grade" aria-hidden="true" />
      <div className="doc-grain" aria-hidden="true" />
      <i className="doc-bar top" aria-hidden="true" />
      <i className="doc-bar bottom" aria-hidden="true" />
      {!started ? (
        <div className="doc-title-card">
          <span className="doc-ep">Episode {ep.number}</span>
          <h1>{ep.title}</h1>
          <p>{ep.tagline}</p>
          <button className="btn primary" onClick={() => { sfx.unlock(); setStarted(true); }} disabled={!r.sim}>{r.sim ? 'Play' : r.loading}</button>
        </div>
      ) : (
        <>
        <Anatomy ep={ep} upto={i} />
        <section className="doc-scene" key={i} aria-live="polite">
          <span className="doc-clock">{typed}<b className="caret" aria-hidden="true" /></span>
          <h2>{scene.title}</h2>
          {scene.body && <p>{scene.body}</p>}
        </section>
        </>
      )}
      {started && (
        <nav className="doc-controls" aria-label="Episode controls">
          <button onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>Previous</button>
          <span>{i + 1} / {ep.scenes.length}</span>
          <button onClick={() => setI(Math.min(ep.scenes.length - 1, i + 1))} disabled={i === ep.scenes.length - 1}>Next</button>
          <SoundToggle className="doc-sound" />
          <Link to={`/academy/${ep.id}`}>Case file</Link>
          <Link to="/documentary">All episodes</Link>
        </nav>
      )}
    </main>
  );
}
