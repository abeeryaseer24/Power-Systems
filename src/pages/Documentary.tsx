import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { episodeById, EPISODES, type Episode as Ep } from '../grid/documentaries';
import { eventById, stageEvent } from '../grid/events';
import { buildReactor, plantById } from '../nuclear/plants';
import { useRegion } from './atlas/useRegion';
import Anatomy from '../components/Anatomy';
import CoreView from '../components/CoreView';
import SoundToggle from '../components/SoundToggle';
import { sfx } from '../lib/sfx';
import { markDone } from '../lib/career';
import '../documentary.css';

export default function Documentary() {
  const { id = '' } = useParams();
  const ep = episodeById(id);
  if (!ep) {
    const grid = EPISODES.filter((e) => !e.plant);
    const nuclear = EPISODES.filter((e) => e.plant);
    return (
      <main id="main" className="page doc-index">
        <div className="page-head">
          <h1>Blackout: the documentaries</h1>
          <p>The minutes before each blackout, told as they happened, with the real grid going dark behind the story.</p>
        </div>
        <ol className="ep-list">
          {grid.map((e) => <EpisodeLink key={e.id} e={e} />)}
        </ol>
        <div className="page-head doc-sub">
          <h2>When the power failed at a reactor</h2>
          <p>Nuclear plants make electricity, and they also depend on it. These episodes run on the reactor model: the core you see reacts to every event as it happens.</p>
        </div>
        <ol className="ep-list nuclear">
          {nuclear.map((e) => <EpisodeLink key={e.id} e={e} />)}
        </ol>
      </main>
    );
  }
  return ep.plant ? <NuclearEpisode key={ep.id} ep={ep} /> : <GridEpisode key={ep.id} ep={ep} />;
}

function EpisodeLink({ e }: { e: Ep }) {
  return (
    <li>
      <Link to={`/documentary/${e.id}`}><span className="ep-n">Episode {e.number}</span><span className="ep-t">{e.title}</span><span className="ep-tag">{e.tagline}</span></Link>
    </li>
  );
}

/** Scene clock, typewriter timestamp, auto-advance and sound moods shared by both kinds of episode. */
function usePlayer(ep: Ep, started: boolean) {
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState('');
  const scene = ep.scenes[i];

  useEffect(() => () => sfx.quiet(), []);

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

  useEffect(() => {
    if (started && i === ep.scenes.length - 1) markDone(`doc:${ep.id}`);
  }, [started, i, ep]);

  useEffect(() => {
    if (!started || i >= ep.scenes.length - 1) return;
    const t = setTimeout(() => setI(i + 1), scene.hold * 1000);
    return () => clearTimeout(t);
  }, [i, started, scene.hold, ep.scenes.length]);

  useEffect(() => {
    if (!started) return;
    const level = { calm: 0.25, tension: 0.55, impact: 0.9, dark: 0.4, after: 0.15 }[scene.mood ?? 'calm'];
    sfx.setDrone(level);
    if (scene.mood === 'impact') sfx.boom();
    if (scene.mood === 'dark' && ep.scenes[i - 1]?.mood !== 'dark') sfx.powerDown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, started]);

  return { i, setI, typed, scene };
}

function Shell({ ep, started, onStart, ready, readyLabel, player, more, children }: {
  ep: Ep;
  started: boolean;
  onStart: () => void;
  ready: boolean;
  readyLabel: string;
  player: ReturnType<typeof usePlayer>;
  more: ReactNode;
  children: ReactNode;
}) {
  const { i, setI, typed, scene } = player;
  return (
    <main id="main" className={`doc ${ep.plant ? 'doc-nuclear' : ''} mood-${started ? scene.mood ?? 'calm' : 'calm'}`}>
      {children}
      <div className="doc-grade" aria-hidden="true" />
      <div className="doc-grain" aria-hidden="true" />
      <i className="doc-bar top" aria-hidden="true" />
      <i className="doc-bar bottom" aria-hidden="true" />
      {!started ? (
        <div className="doc-title-card">
          <span className="doc-ep">Episode {ep.number}</span>
          <h1>{ep.title}</h1>
          <p>{ep.tagline}</p>
          <button className="btn primary" onClick={() => { sfx.unlock(); onStart(); }} disabled={!ready}>{ready ? 'Play' : readyLabel}</button>
        </div>
      ) : (
        <>
          <Anatomy ep={ep} upto={i} />
          <section className="doc-scene" key={i} aria-live="polite">
            <span className="doc-clock">{typed}<b className="caret" aria-hidden="true" /></span>
            <h2>{scene.title}</h2>
            {scene.body && <p>{scene.body}</p>}
          </section>
          <nav className="doc-controls" aria-label="Episode controls">
            <button onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>Previous</button>
            <span>{i + 1} / {ep.scenes.length}</span>
            <button onClick={() => setI(Math.min(ep.scenes.length - 1, i + 1))} disabled={i === ep.scenes.length - 1}>Next</button>
            <SoundToggle className="doc-sound" />
            {more}
            <Link to="/documentary">All episodes</Link>
          </nav>
        </>
      )}
    </main>
  );
}

function GridEpisode({ ep }: { ep: Ep }) {
  const ev = eventById(ep.id)!;
  const canvas = useRef<HTMLCanvasElement>(null);
  const r = useRegion(ev.region, canvas, (s) => stageEvent(s, ev, 'watch'));
  const [started, setStarted] = useState(false);
  const player = usePlayer(ep, started);
  const { i, scene } = player;

  // keep the map's simulator in step with the scene
  useEffect(() => {
    r.speed.current = 0;
    if (!started || !r.sim) return;
    const s = r.sim;
    const target = scene.simT;
    let raf = 0;
    const tick = () => {
      if (s.t < target - 1e-6) {
        const t0 = performance.now();
        while (s.t < target - 1e-6 && performance.now() - t0 < 14) s.advance(Math.min(0.5, target - s.t));
        raf = requestAnimationFrame(tick);
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, started, r.sim]);

  useEffect(() => {
    if (started && (scene.mood === 'impact' || scene.mood === 'dark')) r.scene?.kick(scene.mood === 'dark' ? 1 : 0.6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, started]);

  return (
    <Shell ep={ep} started={started} onStart={() => setStarted(true)} ready={!!r.sim} readyLabel={r.loading} player={player}
      more={<Link to={`/academy/${ep.id}`}>Case file</Link>}>
      <canvas ref={canvas} className="doc-canvas" aria-label="The grid during the event" />
    </Shell>
  );
}

function NuclearEpisode({ ep }: { ep: Ep }) {
  const plant = plantById(ep.plant!)!;
  const [reactor, setReactor] = useState(() => buildReactor(plant, 'watch'));
  const [started, setStarted] = useState(false);
  const player = usePlayer(ep, started);
  const { scene } = player;
  const target = useRef(0);
  const [clock, setClock] = useState(0);
  target.current = started ? scene.simT : 0;

  // advance the reactor toward the scene's time and redraw the core every frame
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    let wasDestroyed = reactor.s.destroyed;
    const frame = () => {
      const goal = target.current;
      if (goal < reactor.s.t - 1) {
        // going back a scene: the past cannot be un-run, so replay from the start
        setReactor(buildReactor(plant, 'watch'));
        return;
      }
      const start = performance.now();
      while (reactor.s.t < goal - 1e-6 && performance.now() - start < 12) {
        const left = goal - reactor.s.t;
        // short slices near prompt criticality keep the excursion visible across frames
        reactor.advance(Math.min(left, reactor.s.n > 0.5 || left < 20 ? 0.05 : left < 600 ? 5 : 60));
      }
      if (reactor.s.destroyed && !wasDestroyed) {
        wasDestroyed = true;
        sfx.boom();
      }
      setClock((performance.now() - t0) / 1000);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reactor, plant]);

  return (
    <Shell ep={ep} started={started} onStart={() => setStarted(true)} ready readyLabel="" player={player}
      more={<Link to={`/nuclear/${plant.id}`}>The plant</Link>}>
      <div className="doc-core">
        <CoreView r={reactor} t={clock} />
      </div>
    </Shell>
  );
}
