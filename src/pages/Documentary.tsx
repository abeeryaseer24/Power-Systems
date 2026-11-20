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

/**
 * The episode as a sequence of beats, one thing on screen at a time:
 * intro card, then for each scene a cut to black, the timestamp typing, the title, the narration
 * sentence by sentence, the "what failed" diagram if the scene changes it, a held moment and a fade out;
 * then an end card.
 */
type Beat = 'cut' | 'clock' | 'title' | 'body' | 'diagram' | 'hold' | 'out';
const sentences = (t?: string) => (t ? t.split(/(?<=[.!?])\s+/).filter(Boolean) : []);

function usePlayer(ep: Ep, started: boolean) {
  const [phase, setPhase] = useState<'intro' | 'scenes' | 'end'>('intro');
  const [i, setI] = useState(0);
  const [beat, setBeat] = useState<Beat>('cut');
  const [typed, setTyped] = useState('');
  const [lines, setLines] = useState(0);
  const [paused, setPaused] = useState(false);
  const [run, setRun] = useState(0);
  const scene = ep.scenes[i];
  const parts = sentences(scene.body);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  useEffect(() => () => sfx.quiet(), []);

  // a pausable timer: resolves after ms of unpaused time
  const wait = (ms: number, alive: () => boolean) => new Promise<void>((res) => {
    let left = ms;
    let last = performance.now();
    const tick = () => {
      if (!alive()) return;
      const now = performance.now();
      if (!pausedRef.current) left -= now - last;
      last = now;
      if (left <= 0) res();
      else setTimeout(tick, 40);
    };
    setTimeout(tick, 40);
  });

  useEffect(() => {
    if (!started || phase !== 'intro') return;
    let alive = true;
    sfx.setDrone(0.2);
    wait(3400, () => alive).then(() => alive && setPhase('scenes'));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, phase]);

  useEffect(() => {
    if (!started || phase !== 'scenes') return;
    let alive = true;
    const ok = () => alive;
    const impact = scene.mood === 'impact';
    (async () => {
      setBeat('cut');
      setTyped('');
      setLines(0);
      const level = { calm: 0.25, tension: 0.55, impact: 0.9, dark: 0.4, after: 0.15 }[scene.mood ?? 'calm'];
      // a held silence before each impact
      sfx.setDrone(impact ? 0.06 : level);
      await wait(impact ? 1200 : 650, ok);
      if (!alive) return;
      if (impact) sfx.boom();
      if (scene.mood === 'dark' && ep.scenes[i - 1]?.mood !== 'dark') sfx.powerDown();
      sfx.setDrone(level);
      setBeat('clock');
      for (let k = 1; k <= scene.clock.length; k++) {
        await wait(85, ok);
        if (!alive) return;
        setTyped(scene.clock.slice(0, k));
        if (scene.clock[k - 1] !== ' ') sfx.tick();
      }
      await wait(650, ok);
      if (!alive) return;
      setBeat('title');
      await wait(1500, ok);
      if (!alive) return;
      setBeat('body');
      for (let k = 1; k <= parts.length; k++) {
        setLines(k);
        // reading time: about 3.4 words a second, never under 1.8 s a sentence
        await wait(Math.max(1800, (parts[k - 1].split(' ').length / 3.4) * 1000), ok);
        if (!alive) return;
      }
      if (scene.fx?.length) {
        setBeat('diagram');
        await wait(3400, ok);
        if (!alive) return;
      }
      setBeat('hold');
      await wait(Math.max(1000, scene.hold * 1000 - 6000), ok);
      if (!alive) return;
      setBeat('out');
      await wait(800, ok);
      if (!alive) return;
      if (i >= ep.scenes.length - 1) {
        markDone(`doc:${ep.id}`);
        setPhase('end');
      } else setI(i + 1);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, started, phase, run]);

  const go = (k: number) => {
    setPhase('scenes');
    setI(Math.max(0, Math.min(ep.scenes.length - 1, k)));
    setRun((r) => r + 1);
  };
  return { phase, i, go, beat, typed, lines, parts, scene, paused, setPaused };
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
  const { phase, i, go, beat, typed, lines, parts, scene, paused, setPaused } = player;
  const [chrome, setChrome] = useState(true);
  const [diagramOpen, setDiagramOpen] = useState(false);
  const hideTimer = useRef(0);
  // controls show on movement or touch, then fade away
  const wake = () => {
    setChrome(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setChrome(false), 3500);
  };
  useEffect(() => {
    if (!started) return;
    wake();
    const key = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault();
        setPaused(!paused);
        wake();
      }
      if (e.key === 'ArrowRight') go(i + 1);
      if (e.key === 'ArrowLeft') go(i - 1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, paused, i]);
  const order: Beat[] = ['cut', 'clock', 'title', 'body', 'diagram', 'hold', 'out'];
  const at = (b: Beat) => order.indexOf(beat) >= order.indexOf(b);
  const showDiagram = phase === 'scenes' && beat !== 'out' && (diagramOpen || (!!scene.fx?.length && beat === 'diagram'));
  const next = EPISODES[EPISODES.findIndex((e) => e.id === ep.id) + 1];
  const black = started && (phase !== 'scenes' || beat === 'cut' || beat === 'out');
  return (
    <main id="main" className={`doc ${ep.plant ? 'doc-nuclear' : ''} mood-${started && phase === 'scenes' ? scene.mood ?? 'calm' : 'calm'} ${chrome ? 'chrome' : ''} ${paused ? 'paused' : ''} ${started ? 'playing' : ''}`}
      onPointerMove={started ? wake : undefined} onPointerDown={started ? wake : undefined}>
      {children}
      <div className="doc-grade" aria-hidden="true" />
      <div className={`doc-scrim ${!started ? 'title' : ''}`} aria-hidden="true" />
      {started && phase === 'scenes' && scene.mood === 'impact' && beat !== 'cut' && <div className="doc-hit" key={`hit-${i}`} aria-hidden="true" />}
      <div className={`doc-black ${black ? 'on' : ''}`} aria-hidden="true" />
      <div className="doc-grain" aria-hidden="true" />
      <i className="doc-bar top" aria-hidden="true" />
      <i className="doc-bar bottom" aria-hidden="true" />
      {!started && (
        <div className="doc-title-card">
          <span className="doc-ep">Episode {ep.number}</span>
          <h1>{ep.title}</h1>
          <p>{ep.tagline}</p>
          <button className="btn primary" onClick={() => { sfx.unlock(); onStart(); }} disabled={!ready}>{ready ? 'Play' : readyLabel}</button>
          <span className="doc-note">Best with sound. Reconstructed from the investigation reports on a simulated grid.</span>
        </div>
      )}
      {started && phase === 'intro' && (
        <div className="doc-intro" aria-live="polite">
          <span>A Blackstart documentary</span>
          <strong>{ep.title}</strong>
        </div>
      )}
      {started && phase === 'scenes' && (
        <>
          {showDiagram && <Anatomy ep={ep} upto={i} />}
          <section className={`doc-scene ${beat === 'out' ? 'leaving' : ''} ${showDiagram && !diagramOpen ? 'behind' : ''}`} key={i} aria-live="polite">
            {at('clock') && <span className="doc-clock">{typed}<b className="caret" aria-hidden="true" /></span>}
            {at('title') && <h2>{scene.title}</h2>}
            {at('body') && parts.length > 0 && (
              <p>{parts.slice(0, lines).map((t, k) => <span key={k} className="doc-line">{t} </span>)}</p>
            )}
          </section>
        </>
      )}
      {started && phase === 'end' && (
        <div className="doc-end">
          <span className="doc-ep">End of episode {ep.number}</span>
          <h2>{ep.title}</h2>
          <div className="doc-end-cta">
            {next && <Link className="btn primary" to={`/documentary/${next.id}`}>Next: {next.title}</Link>}
            <button className="btn ghost" onClick={() => go(0)}>Watch again</button>
            {more}
            <Link className="btn ghost" to="/documentary">All episodes</Link>
          </div>
        </div>
      )}
      {started && (
        <nav className="doc-controls" aria-label="Episode controls">
          <button onClick={() => go(i - 1)} disabled={phase !== 'scenes' || i === 0} aria-label="Previous scene">‹</button>
          <button onClick={() => setPaused(!paused)}>{paused ? 'Resume' : 'Pause'}</button>
          <button onClick={() => go(i + 1)} disabled={phase === 'scenes' && i === ep.scenes.length - 1} aria-label="Next scene">›</button>
          <span className="doc-progress" aria-hidden="true">{ep.scenes.map((_, k) => <i key={k} className={k < i || phase === 'end' ? 'done' : k === i && phase === 'scenes' ? 'now' : ''} />)}</span>
          <button className={`doc-what ${diagramOpen ? 'on' : ''}`} onClick={() => setDiagramOpen(!diagramOpen)}>What failed</button>
          <SoundToggle className="doc-sound" />
          <Link to="/documentary">All episodes</Link>
        </nav>
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

  // the camera: a new shot for every scene, cut during the black beat, framed by mood
  useEffect(() => {
    const sc = r.scene;
    if (!sc) return;
    if (!started || player.phase === 'intro') {
      sc.shot({ dist: 0.95, push: 0.003, drift: 0.012, bloom: 0.55, exposure: 0.8 });
      return;
    }
    if (player.phase !== 'scenes') return;
    const plan = {
      calm: { dist: 0.85, push: 0.007, drift: 0.014, bloom: 0.55, exposure: 0.85, tilt: 1.0 },
      tension: { dist: 0.6, push: 0.016, drift: 0.024, bloom: 0.65, exposure: 0.8, tilt: 0.8 },
      impact: { dist: 0.42, push: 0.026, drift: 0.035, bloom: 1.05, exposure: 1.0, tilt: 0.65 },
      dark: { dist: 0.95, push: 0.003, drift: 0.008, bloom: 1.1, exposure: 1.15, tilt: 1.15 },
      after: { dist: 0.75, push: 0.005, drift: 0.006, bloom: 0.55, exposure: 0.85, tilt: 1.05 },
    }[scene.mood ?? 'calm'];
    sc.shot({ ...plan, cut: true });
    if (scene.mood === 'impact') {
      const t = window.setTimeout(() => sc.kick(0.9), 1250);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, started, player.phase, r.scene]);

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
