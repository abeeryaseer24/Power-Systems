import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ELEVATIONS, SITES, siteById, type El } from '../plants3d/sites';
import type { Mode, PlantScene, SiteDef } from '../plants3d/PlantScene';
import { SCENARIOS, StressSim, type GridDef } from '../plants3d/stress';
import type { Lapse } from '../plants3d/build';
import '../plants.css';

export default function Plants() {
  const { id } = useParams();
  if (id) {
    const s = siteById(id);
    if (s) return <Viewer key={s.id} site={s} />;
  }
  return (
    <main id="main" className="page pv-index">
      <header className="pv-head">
        <p className="pv-kicker">Architecture of power</p>
        <h1>Walk the plants</h1>
        <p>Six real power stations, rebuilt in 3D from site plans, dimensions and photographs. Change the time of day, open the containments to see the reactors, and walk the site on foot.</p>
      </header>
      <ol className="pv-sheets">
        {SITES.map((s, i) => (
          <li key={s.id}>
            <Link to={`/plants/${s.id}`} className="pv-sheet">
              <span className="pv-no">{String(i + 1).padStart(2, '0')}</span>
              <Elevation els={ELEVATIONS[s.id]} />
              <span className="pv-name">{s.name}</span>
              <span className="pv-kind">{s.kind} · {s.place}</span>
              <span className="pv-blurb">{s.blurb}</span>
            </Link>
          </li>
        ))}
      </ol>
      <p className="pv-note">Every building, tower and reactor is made in code, from published dimensions and site layouts. Plans are true to scale and orientation. Small details are simplified. Close-up props (covered cars, barriers, drums, crates, cabinets, shrubs) are CC0 models from <a href="https://polyhaven.com">Poly Haven</a>.</p>
    </main>
  );
}

/** A line elevation at 1 px = 2 m with a ground line and a 100 m scale bar. */
function Elevation({ els }: { els: El[] }) {
  const W = 560, G = 150, k = 0.5;
  const paths: React.ReactNode[] = [];
  els.forEach((e, i) => {
    const X = W / 2 + e.x * k;
    if (e.t === 'tower') {
      const top = e.h * (e.built ?? 1);
      const pts: string[] = [];
      for (let j = 0; j <= 20; j++) {
        const y = (top * j) / 20, r = e.rt * 0.92 * Math.sqrt(1 + ((y - e.h * 0.78) / ((e.h * 0.78) / Math.sqrt((e.rb / (e.rt * 0.92)) ** 2 - 1))) ** 2);
        pts.push(`${X - r * k},${G - y * k}`);
      }
      const right = pts.map((p) => { const [a, b] = p.split(',').map(Number); return `${2 * X - a},${b}`; }).reverse();
      paths.push(<path key={i} d={`M${pts.join(' L')} L${right.join(' L')}`} className="el-tower" />);
    } else if (e.t === 'dome') {
      paths.push(<path key={i} d={`M${X - e.r * k},${G} V${G - e.h * k} A${e.r * k},${e.d * k} 0 0 1 ${X + e.r * k},${G - e.h * k} V${G}`} className="el-reactor" />);
    } else if (e.t === 'box') {
      paths.push(<rect key={i} x={X - (e.w * k) / 2} y={G - e.h * k} width={e.w * k} height={e.h * k} className="el-box" />);
    } else if (e.t === 'stack') {
      paths.push(<path key={i} d={`M${X - (e.w * k) / 2},${G} L${X - (e.w * k) / 3},${G - e.h * k} H${X + (e.w * k) / 3} L${X + (e.w * k) / 2},${G}`} className="el-box" />);
    } else if (e.t === 'arch') {
      paths.push(<path key={i} d={`M${X - (e.span * k) / 2},${G} A${(e.span * k) / 2},${e.h * k} 0 0 1 ${X + (e.span * k) / 2},${G}`} className="el-reactor" />);
    } else if (e.t === 'bulb') {
      paths.push(<path key={i} d={`M${X - e.r * k},${G} A${e.r * k},${e.h * k} 0 0 1 ${X + e.r * k},${G}`} className="el-box" />);
    } else if (e.t === 'dam') {
      const w = e.w * 0.38, h = e.h * k;
      paths.push(<path key={i} d={`M${X - w / 2 - 30},${G - h - 8} L${X - w / 2},${G - h} H${X + w / 2} L${X + w / 2 + 30},${G - h - 10}`} className="el-ground" />);
      paths.push(<rect key={i + 'd'} x={X - w / 2} y={G - h} width={w} height={h} className="el-box" />);
      for (let j = 0; j < 22; j++) paths.push(<line key={i + 'p' + j} x1={X - 60 + j * 5.5} x2={X - 60 + j * 5.5} y1={G - h} y2={G - h + 14} className="el-thin" />);
      paths.push(<path key={i + 'w'} d={`M${X - w / 2 - 40},${G - h + 6} H${X - w / 2}`} className="el-water" />);
    }
  });
  return (
    <svg viewBox={`0 0 ${W} 170`} className="pv-elev" aria-hidden="true">
      {paths}
      <line x1="0" x2={W} y1={G} y2={G} className="el-ground" />
      <g className="el-scale">
        <line x1="16" x2={16 + 100 * k} y1={162} y2={162} />
        <line x1="16" x2="16" y1="158" y2="166" />
        <line x1={16 + 100 * k} x2={16 + 100 * k} y1="158" y2="166" />
        <text x={22 + 100 * k} y="165">100 m</text>
      </g>
    </svg>
  );
}

const HOURS = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

function Viewer({ site }: { site: SiteDef }) {
  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);
  const main = useRef<HTMLElement>(null);
  const eng = useRef<PlantScene | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>('orbit');
  const [hour, setHour] = useState(10.5);
  const [era, setEra] = useState(site.eras?.[0]?.id ?? '');
  const [cut, setCut] = useState(false);
  const [stop, setStop] = useState(0);
  const [facts, setFacts] = useState(!matchMedia('(max-width: 760px)').matches);
  const [play, setPlay] = useState(false);
  const [stress, setStress] = useState(false);
  const [lapse, setLapse] = useState(false);
  const touch = typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches;

  useEffect(() => {
    let alive = true;
    let e: PlantScene | null = null;
    // let the loading card paint before the heavy build
    const t = setTimeout(async () => {
      const { PlantScene } = await import('../plants3d/PlantScene');
      if (!alive || !host.current || !overlay.current) return;
      e = new PlantScene(host.current, overlay.current, site);
      e.onStop = setStop;
      e.onMode = setMode;
      eng.current = e;
      if (import.meta.env.DEV) (window as unknown as { __pv: PlantScene }).__pv = e;
      setReady(true);
    }, 60);
    return () => { alive = false; clearTimeout(t); e?.dispose(); eng.current = null; };
  }, [site]);

  // panels stack above the control bar, whatever height it wraps to
  useEffect(() => {
    if (!bar.current || !main.current) return;
    const ro = new ResizeObserver(() => main.current?.style.setProperty('--bar-h', `${bar.current!.offsetHeight}px`));
    ro.observe(bar.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { eng.current?.setHour(hour); }, [hour, ready]);
  useEffect(() => { eng.current?.setEra(era); }, [era, ready]);
  useEffect(() => { eng.current?.setCutaway(cut); }, [cut, ready]);
  useEffect(() => {
    if (!play) return;
    const id = setInterval(() => setHour((h) => (h + 0.05) % 24), 50);
    return () => clearInterval(id);
  }, [play]);
  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && eng.current?.mode === 'walk') eng.current.setMode('orbit');
      if (mode === 'tour' && (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft')) eng.current?.tourGo(stop + (ev.key === 'ArrowRight' ? 1 : -1));
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [mode, stop]);

  const openLapse = () => {
    if (!lapse) { setStress(false); eng.current?.setStress(null); if (s.eras) setEra(s.eras[0].id); }
    setLapse(!lapse);
  };
  const openStress = () => {
    if (!stress && lapse) setLapse(false);
    if (!stress && s.grid?.era) setEra(s.grid.era);
    if (stress) eng.current?.setStress(null);
    setStress(!stress);
    setFacts(false);
  };
  const go = (m: Mode) => { eng.current?.setMode(m); setMode(m); };
  const s = site;
  const st = eng.current?.stops[stop];
  const night = hour < 5.5 || hour > 19;

  return (
    <main id="main" ref={main} className={`pv-viewer ${night ? 'is-night' : ''}`}>
      <div className="pv-canvas" ref={host} />
      <div className="pv-overlay" ref={overlay} aria-hidden="true" />
      {!ready && <div className="pv-loading" role="status"><span>Pouring concrete</span><small>{s.name}</small></div>}

      <header className="pv-title">
        <Link to="/plants" className="pv-back">All plants</Link>
        <h1>{s.name}</h1>
        <p>{s.kind} · {s.place}</p>
      </header>

      <aside className={`pv-facts ${facts ? 'open' : ''}`}>
        <button onClick={() => setFacts(!facts)} aria-expanded={facts}>Data sheet</button>
        {facts && (
          <dl>
            {s.facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            <div><dt>Latitude</dt><dd>{s.lat.toFixed(2)}°</dd></div>
          </dl>
        )}
      </aside>

      {lapse && s.lapse && <LapsePanel lapse={s.lapse} eng={eng} onClose={openLapse} />}
      {stress && s.grid && <StressPanel grid={s.grid} eng={eng} onClose={openStress} />}

      {mode === 'tour' && st && (
        <section className="pv-caption" aria-live="polite">
          <span className="pv-step">{String(stop + 1).padStart(2, '0')} / {String(eng.current!.stops.length).padStart(2, '0')}</span>
          <h2>{st.title}</h2>
          <p>{st.body}</p>
          <div className="pv-capnav">
            <button onClick={() => eng.current?.tourGo(stop - 1)} aria-label="Previous stop">‹</button>
            <button onClick={() => eng.current?.tourGo(stop + 1)} className="pv-next">Next stop ›</button>
          </div>
        </section>
      )}

      {mode === 'walk' && (
        <p className="pv-hint">{touch ? 'Drag the pad to walk, drag the view to look' : 'WASD to walk · Shift to run · drag to look · scroll to zoom · Esc to leave'}</p>
      )}
      {mode === 'walk' && touch && <Joystick onMove={(x, y) => eng.current?.setMove(x, y)} />}

      <nav className="pv-bar" ref={bar} aria-label="Viewer controls">
        <div className="pv-seg" role="group" aria-label="Mode">
          {(['orbit', 'tour', 'walk', 'axo'] as Mode[]).map((m) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => go(m)} aria-pressed={mode === m}>
              {m === 'orbit' ? 'Orbit' : m === 'tour' ? 'Tour the plant' : m === 'walk' ? 'Walk' : 'Axonometric'}
            </button>
          ))}
        </div>
        <label className="pv-time">
          <span className="pv-clock">{HOURS(hour)}</span>
          <input type="range" min={0} max={23.99} step={0.05} value={hour} onChange={(e) => setHour(Number(e.target.value))} aria-label="Time of day" />
          <button className={`pv-play ${play ? 'on' : ''}`} onClick={(e) => { e.preventDefault(); setPlay(!play); }} aria-label={play ? 'Stop the clock' : 'Run the clock'}>{play ? '❚❚' : '▶'}</button>
        </label>
        <div className="pv-seg pv-quick" role="group" aria-label="Day or night">
          <button onClick={() => setHour(10.5)} className={!night ? 'on' : ''}>Day</button>
          <button onClick={() => setHour(19.6)}>Dusk</button>
          <button onClick={() => setHour(23)} className={night ? 'on' : ''}>Night</button>
        </div>
        {s.eras && (
          <div className="pv-seg" role="group" aria-label="Period">
            {s.eras.map((e) => <button key={e.id} className={era === e.id ? 'on' : ''} onClick={() => setEra(e.id)}>{e.label}</button>)}
          </div>
        )}
        {s.lapse && <button className={`pv-cut pv-lapse-btn ${lapse ? 'on' : ''}`} onClick={openLapse} aria-pressed={lapse}>Time-lapse</button>}
        {s.grid && <button className={`pv-cut pv-stress-btn ${stress ? 'on' : ''}`} onClick={openStress} aria-pressed={stress}>Stress test</button>}
        {s.cutaway && (
          <button className={`pv-cut ${cut ? 'on' : ''}`} onClick={() => setCut(!cut)} aria-pressed={cut}>{cut ? 'Close cutaway' : s.cutaway}</button>
        )}
      </nav>
    </main>
  );
}

function StressPanel({ grid, eng, onClose }: { grid: GridDef; eng: React.RefObject<PlantScene | null>; onClose: () => void }) {
  const sim = useRef(new StressSim(grid));
  const [, tick] = useState(0);
  const [speed, setSpeed] = useState(1);
  useEffect(() => {
    let last = performance.now(), n = 0, raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000) * speed;
      last = now;
      for (let i = 0; i < 4; i++) sim.current.step(dt / 4);
      eng.current?.setStress(sim.current.s);
      if (++n % 4 === 0) tick((x) => x + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [speed, eng]);
  useEffect(() => () => eng.current?.setStress(null), [eng]);
  const st = sim.current.s;
  const f0 = grid.f0, dev = st.f - f0;
  const W = 300, H = 90, span = 1.6;
  const y = (f: number) => H / 2 - ((f - f0) / span) * (H / 2);
  const pts = st.trace.map((f, i) => `${(i / 359) * W},${Math.max(0, Math.min(H, y(f)))}`).join(' ');
  const band = Math.abs(dev) > 0.8 ? 'bad' : Math.abs(dev) > 0.2 ? 'warn' : 'ok';
  return (
    <aside className="pv-stress" aria-label="Stress test">
      <header>
        <span>Stress test · {grid.name}</span>
        <button onClick={onClose} aria-label="Close stress test">×</button>
      </header>
      <div className={`pv-freq ${band}`}>
        <strong>{st.f.toFixed(3)}</strong><span>Hz</span>
        <em>{dev >= 0 ? '+' : ''}{(dev * 1000).toFixed(0)} mHz</em>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="pv-trace" aria-hidden="true">
        <line x1="0" x2={W} y1={y(f0)} y2={y(f0)} className="t-nom" />
        <line x1="0" x2={W} y1={y(f0 * 0.976)} y2={y(f0 * 0.976)} className="t-ufls" />
        <text x="4" y={y(f0 * 0.976) - 3}>UFLS {(f0 * 0.976).toFixed(1)} Hz</text>
        <polyline points={pts} />
      </svg>
      <dl>
        <div><dt>This plant</dt><dd>{Math.round(st.plantMW).toLocaleString()} MW</dd></div>
        <div><dt>{grid.kind === 'hydro' ? 'Turbine flow' : grid.kind === 'thermal' ? 'Boiler firing' : 'Reactor heat'}</dt><dd>{(st.heat * 100).toFixed(1)} %</dd></div>
        <div><dt>{grid.kind === 'hydro' ? 'Spillway' : 'Dump valves'}</dt><dd>{st.dump > 0.05 ? 'Open' : 'Shut'}</dd></div>
        <div><dt>Station supply</dt><dd className={st.lights < 0.5 ? 'bad' : ''}>{st.lights < 0.1 ? 'Dark' : st.diesel ? 'Diesels' : 'Grid'}</dd></div>
        <div><dt>Load shed</dt><dd className={st.shed > 0 ? 'bad' : ''}>{Math.round(st.shed).toLocaleString()} MW</dd></div>
      </dl>
      <div className="pv-sc">
        {SCENARIOS.map((sc) => <button key={sc.id} onClick={() => sim.current.fire(sc.id)} title={sc.note}>{sc.label}</button>)}
      </div>
      <div className="pv-sc-foot">
        <div className="pv-seg" role="group" aria-label="Speed">
          {[1, 4, 16].map((v) => <button key={v} className={speed === v ? 'on' : ''} onClick={() => setSpeed(v)}>×{v}</button>)}
        </div>
        <button className="pv-reset" onClick={() => { sim.current = new StressSim(grid); tick((x) => x + 1); }}>Reset</button>
      </div>
      <ol className="pv-log">
        {st.log.map((l) => <li key={l.t + l.text} className={l.bad ? 'bad' : ''}><time>{l.t.toFixed(1)} s</time>{l.text}</li>)}
      </ol>
      <p className="pv-hint2">Try it at night: the station goes dark on loss of offsite power.</p>
    </aside>
  );
}

function LapsePanel({ lapse, eng, onClose }: { lapse: Lapse; eng: React.RefObject<PlantScene | null>; onClose: () => void }) {
  const [p, setP] = useState(0);
  const [run, setRun] = useState(true);
  useEffect(() => { eng.current?.setBuild(p); }, [p, eng]);
  useEffect(() => () => eng.current?.setBuild(null), [eng]);
  useEffect(() => {
    if (!run) return;
    let last = performance.now(), raf = 0;
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setP((x) => {
        const n = Math.min(1, x + dt / 45);
        if (n >= 1) setRun(false);
        return n;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [run]);
  const year = lapse.from + p * (lapse.to - lapse.from);
  const mark = [...lapse.marks].reverse().find(([at]) => p >= at);
  return (
    <section className="pv-lapse" aria-label="Construction time-lapse">
      <div className="pv-lapse-head">
        <strong>{Math.floor(year)}</strong>
        <p key={mark?.[1]}>{mark?.[1]}</p>
        <button onClick={onClose} aria-label="Close time-lapse">×</button>
      </div>
      <div className="pv-lapse-row">
        <button className="pv-play" onClick={() => { if (p >= 1) setP(0); setRun(!run); }} aria-label={run ? 'Pause' : 'Play'}>{run ? '❚❚' : '▶'}</button>
        <div className="pv-lapse-track">
          <input type="range" min={0} max={1} step={0.001} value={p} onChange={(e) => { setRun(false); setP(Number(e.target.value)); }} aria-label="Construction progress" />
          <div className="pv-ticks" aria-hidden="true">
            {lapse.marks.map(([at, t]) => <span key={t} style={{ left: `${at * 100}%` }} />)}
          </div>
        </div>
        <span className="pv-lapse-end">{Math.floor(lapse.to)}</span>
      </div>
    </section>
  );
}

function Joystick({ onMove }: { onMove: (x: number, y: number) => void }) {
  const [p, setP] = useState({ x: 0, y: 0 });
  const base = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    setP({ x, y });
    onMove(x, -y);
  };
  const end = () => { setP({ x: 0, y: 0 }); onMove(0, 0); };
  return (
    <div className="pv-joy" ref={base} onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); move(e); }} onPointerMove={(e) => e.buttons && move(e)} onPointerUp={end} onPointerCancel={end}>
      <span style={{ transform: `translate(${p.x * 34}px, ${p.y * 34}px)` }} />
    </div>
  );
}
