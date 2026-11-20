import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ELEVATIONS, SITES, siteById, type El } from '../plants3d/sites';
import type { FloodDef, Mode, PlantScene, SiteDef, Stop } from '../plants3d/PlantScene';
import { TOURS, type Tour } from '../plants3d/tours';
import { sfx } from '../lib/sfx';
import { at } from '../controlroom/timelines';
import { SCENARIOS, StressSim, type GridDef } from '../plants3d/stress';
import type { Lapse } from '../plants3d/build';
import SoundToggle from '../components/SoundToggle';
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
      <nav className="pv-more" aria-label="More">
        <Link to="/control-room/tmi"><span>Control room</span>TMI-2, 28 March 1979</Link>
        <Link to="/control-room/chernobyl"><span>Control room</span>Chernobyl-4, 26 April 1986</Link>
        <Link to="/fallout/chernobyl"><span>Fallout map</span>Chernobyl, April–May 1986</Link>
        <Link to="/fallout/fukushima"><span>Fallout map</span>Fukushima, March 2011</Link>
      </nav>
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

function localHour(tz: string) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return g('hour') + g('minute') / 60;
}
function localClock(tz: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
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
  const [flood, setFlood] = useState(false);
  const [fp, setFp] = useState(false);
  const [live, setLive] = useState(false);
  const [film, setFilm] = useState<{ i: number; p: number } | null>(null);
  const [filmPaused, setFilmPaused] = useState(false);
  const [card, setCard] = useState(true);
  const [seen, setSeen] = useState<Set<number>>(new Set());
  const tour = TOURS[site.id];
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
      e.onFp = setFp;
      e.onFilm = (i, p) => setFilm({ i, p });
      e.onPin = () => setCard(true);
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
  // live mode: the sky follows the real local time at the plant, updated every 30 s
  useEffect(() => {
    if (!live || !site.tz) return;
    const tick = () => setHour(localHour(site.tz!));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [live, site.tz]);
  const filmI = film?.i ?? null;
  useEffect(() => {
    if (mode !== 'film' || filmI === null || !tour) return;
    const act = tour.stops[filmI]?.act;
    if (filmI === -1) { setHour(tour.stops[0]?.act?.hour ?? 10); setCut(false); }
    if (!act) return;
    if (act.hour !== undefined) setHour(act.hour);
    setCut(!!act.cut);
    if (act.era) setEra(act.era);
    if (!act.build) eng.current?.setBuild(null);
    if (!act.flood) eng.current?.setFlood(null);
  }, [filmI, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (mode !== 'film' || !film || !tour) return;
    const act = tour.stops[film.i]?.act;
    if (act?.build && film.p > 0) eng.current?.setBuild(act.build[0] + (act.build[1] - act.build[0]) * film.p);
    if (act?.flood && s.flood && film.p > 0) eng.current?.setFlood(act.flood[0] + (act.flood[1] - act.flood[0]) * Math.min(1, film.p * 1.4), s.flood.start + (s.flood.finish - s.flood.start) * Math.min(1, film.p * 1.2));
  }, [film, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mode === 'tour') setSeen((x) => new Set(x).add(stop)); }, [stop, mode]);
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
      if (mode === 'film' && ev.key === ' ') { ev.preventDefault(); const v = !filmPaused; setFilmPaused(v); if (eng.current) eng.current.filmPaused = v; }
      if (mode === 'film' && ev.key === 'Escape') go('orbit');
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [mode, stop, filmPaused]); // eslint-disable-line react-hooks/exhaustive-deps

  const openFlood = () => {
    if (!flood) { setStress(false); setLapse(false); eng.current?.setStress(null); if (s.eras) setEra(s.eras[0].id); }
    setFlood(!flood);
    setFacts(false);
  };
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
  const endFilm = () => {
    eng.current?.setBuild(null);
    eng.current?.setFlood(null);
    setCut(false);
    if (s.eras) setEra(s.eras[0].id);
    setFilm(null);
    sfx.setDrone(0);
  };
  const go = (m: Mode) => {
    if (mode === 'film' && m !== 'film') endFilm();
    if (m === 'film') {
      setLapse(false); setFlood(false); setStress(false); eng.current?.setStress(null);
      sfx.unlock();
      sfx.setDrone(0.22);
      eng.current?.startFilm((tour?.stops ?? []).map((t) => ({ shot: t.shot ?? 'orbit', dur: t.dur ?? 12 })));
      setFilmPaused(false);
      setMode('film');
      return;
    }
    if (m === 'tour') { setCard(true); setFacts(false); }
    eng.current?.setMode(m);
    setMode(m);
  };
  const s = site;
  const night = hour < 5.5 || hour > 19;

  return (
    <main id="main" ref={main} className={`pv-viewer ${night ? 'is-night' : ''}`}>
      <div className="pv-canvas" ref={host} />
      <div className="pv-overlay" ref={overlay} aria-hidden="true" />
      {!ready && <div className="pv-loading" role="status"><span>Pouring concrete</span><small>{s.name}</small></div>}

      <header className="pv-title">
        <Link to="/plants" className="pv-back">All plants</Link>
        <SoundToggle className="pv-sound" />
        <button className={`pv-moon ${night ? 'on' : ''}`} onClick={() => setHour(night ? 10.5 : 22.5)} aria-pressed={night} aria-label={night ? 'Switch to day' : 'Switch to night'}>{night ? '☀ Day' : '☾ Night'}</button>
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

      {flood && s.flood && <FloodPanel flood={s.flood} eng={eng} onClose={openFlood} />}
      {lapse && s.lapse && <LapsePanel lapse={s.lapse} eng={eng} onClose={openLapse} />}
      {stress && s.grid && <StressPanel grid={s.grid} eng={eng} onClose={openStress} />}

      {mode === 'tour' && card && eng.current && (
        <TourCard site={s} tour={tour} stops={eng.current.stops} i={stop} seen={seen.size} eng={eng} cut={cut} setCut={setCut} era={era} setEra={setEra} setHour={setHour} onGo={(k) => eng.current?.tourGo(k)} onClose={() => setCard(false)} />
      )}
      {mode === 'tour' && !card && <button className="tc-reopen" onClick={() => setCard(true)}>Show card</button>}
      {mode === 'tour' && <p className="pv-hint">Click a numbered pin to go there</p>}

      {mode === 'film' && film && tour && eng.current && (
        <FilmOverlay site={s} tour={tour} stops={eng.current.stops} i={film.i} p={film.p} paused={filmPaused}
          onPause={() => { const v = !filmPaused; setFilmPaused(v); if (eng.current) eng.current.filmPaused = v; }}
          onJump={(k) => { if (k === -1) { eng.current?.startFilm((tour.stops).map((t) => ({ shot: t.shot ?? 'orbit', dur: t.dur ?? 12 }))); } else eng.current?.filmJump(k); }}
          onExit={() => go('orbit')} onExplore={() => go('tour')} />
      )}

      {mode === 'walk' && (
        <p className="pv-hint">{touch ? 'Drag the pad to walk, drag the view to look' : 'WASD to walk · Shift to run · drag to look · V for first person · Esc to leave'}</p>
      )}
      {mode === 'walk' && <button className={`pv-fp ${fp ? 'on' : ''}`} onClick={() => { const n = !fp; setFp(n); eng.current?.setFirstPerson(n); }} aria-pressed={fp}>{fp ? 'Third person' : 'First person'} <kbd>V</kbd></button>}
      {mode === 'walk' && touch && <Joystick onMove={(x, y) => eng.current?.setMove(x, y)} />}

      <nav className="pv-bar" ref={bar} aria-label="Viewer controls">
        <div className="pv-seg" role="group" aria-label="Mode">
          {(['orbit', 'film', 'tour', 'walk', 'axo'] as Mode[]).map((m) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => go(m)} aria-pressed={mode === m}>
              {m === 'orbit' ? 'Orbit' : m === 'film' ? 'Film tour' : m === 'tour' ? 'Interactive tour' : m === 'walk' ? 'Walk' : 'Axonometric'}
            </button>
          ))}
        </div>
        <label className="pv-time">
          <span className="pv-clock">{HOURS(hour)}</span>
          <input type="range" min={0} max={23.99} step={0.05} value={hour} onChange={(e) => { setLive(false); setHour(Number(e.target.value)); }} aria-label="Time of day" />
          <button className={`pv-play ${play ? 'on' : ''}`} onClick={(e) => { e.preventDefault(); setPlay(!play); }} aria-label={play ? 'Stop the clock' : 'Run the clock'}>{play ? '❚❚' : '▶'}</button>
        </label>
        <div className="pv-seg pv-quick" role="group" aria-label="Time of day">
          <button onClick={() => { setLive(false); setHour(10.5); }} className={!night && !live ? 'on' : ''}>Day</button>
          <button onClick={() => { setLive(false); setHour(23); }} className={night && !live ? 'on' : ''}>Night</button>
          {s.tz && <button onClick={() => setLive(!live)} className={live ? 'on' : ''} title={`Local time at ${s.name} right now`}>Live {live ? localClock(s.tz) : ''}</button>}
        </div>
        {s.eras && (
          <div className="pv-seg" role="group" aria-label="Period">
            {s.eras.map((e) => <button key={e.id} className={era === e.id ? 'on' : ''} onClick={() => setEra(e.id)}>{e.label}</button>)}
          </div>
        )}
        {(s.id === 'fukushima' || s.id === 'chernobyl') && <Link className="pv-cut pv-room-btn" to={`/fallout/${s.id}`}>Fallout map</Link>}
        {(s.id === 'tmi' || s.id === 'chernobyl') && <Link className="pv-cut pv-room-btn" to={`/control-room/${s.id}`}>Control room</Link>}
        {s.flood && <button className={`pv-cut pv-flood-btn ${flood ? 'on' : ''}`} onClick={openFlood} aria-pressed={flood}>Flood</button>}
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
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)) * speed;
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
      const dt = Math.max(0, (now - last) / 1000);
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

function FloodPanel({ flood, eng, onClose }: { flood: FloodDef; eng: React.RefObject<PlantScene | null>; onClose: () => void }) {
  const sc = flood.scenario;
  const [level, setLevel] = useState(flood.normal);
  const [front, setFront] = useState<number | null>(null);
  const [t, setT] = useState<number | null>(null); // scenario minutes
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [run, setRun] = useState(false);
  useEffect(() => { eng.current?.setFlood(level, front); }, [level, front, eng]);
  useEffect(() => () => { eng.current?.setFlood(null); eng.current?.setStress(null); }, [eng]);
  // scenario playback: one real minute per second
  useEffect(() => {
    if (!run || !sc) return;
    let last = performance.now(), raf = 0;
    const loop = (now: number) => {
      const dt = Math.max(0, (now - last) / 1000);
      last = now;
      setT((x) => {
        const n = Math.min(70, (x ?? 0) + dt);
        if (n >= 70) setRun(false);
        return n;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [run, sc]);
  useEffect(() => {
    if (t === null || !sc) return;
    const lv = at(sc.level, t), fr = at(sc.front, t);
    setLevel(lv);
    setFront(fr);
    setFailed((f) => {
      const n = new Set(f);
      for (const q of flood.equipment) if (lv > q.elev) n.add(q.name);
      return n;
    });
    // station lighting: offsite power lost at the quake, diesels pick up, then the water takes them
    const offsite = t < (sc.quakeAt ?? 0);
    const diesels = t > (sc.quakeAt ?? 0) + 1 && !failed.has(flood.equipment[1]?.name);
    eng.current?.setStress({ lights: offsite ? 1 : diesels ? 0.4 : t < (sc.quakeAt ?? 0) + 1 ? 0.05 : 0.02, arc: 0, steam: 1, dump: 0 } as never);
  }, [t]); // eslint-disable-line react-hooks/exhaustive-deps
  const manual = (v: number) => {
    setRun(false); setT(null); setFront(null); setLevel(v);
    setFailed(new Set(flood.equipment.filter((q) => v > q.elev).map((q) => q.name)));
    eng.current?.setStress(null);
  };
  const ev = sc && t !== null ? [...sc.events].reverse().find(([m]) => t >= m) : undefined;
  const clk = sc && t !== null ? sc.clock0 + Math.floor(t) * 60 : null;
  const sbo = failed.size >= 2 && (t === null || t > (sc?.quakeAt ?? 0));
  return (
    <aside className="pv-stress pv-flood" aria-label="Flood scenario">
      <header>
        <span>Flood · {flood.from === 'east' ? 'tsunami' : 'river flood'}</span>
        <button onClick={onClose} aria-label="Close flood panel">×</button>
      </header>
      <div className="pv-freq ok">
        <strong>{level.toFixed(1)}</strong><span>m</span>
        <em>{clk !== null ? `${String(Math.floor(clk / 3600)).padStart(2, '0')}:${String(Math.floor((clk % 3600) / 60)).padStart(2, '0')}` : 'water level'}</em>
      </div>
      <label className="pv-flood-slider">
        <input type="range" min={flood.normal} max={flood.max} step={0.1} value={level} onChange={(e) => manual(Number(e.target.value))} aria-label="Water level" />
        <span className="pv-flood-marks" aria-hidden="true">
          {flood.marks.map(([v, txt]) => <i key={txt} style={{ left: `${((v - flood.normal) / (flood.max - flood.normal)) * 100}%` }} title={txt} />)}
        </span>
      </label>
      <ul className="pv-flood-legend">
        {flood.marks.map(([v, txt]) => <li key={txt} className={level >= v ? 'past' : ''}><b>{v > 0 ? '+' : ''}{v} m</b> {txt}</li>)}
      </ul>
      {sc && <button className="pv-flood-play" onClick={() => { if (t === null || t >= 70) { setFailed(new Set()); setT(0); } setRun(!run); }}>{run ? 'Pause' : t === null || t >= 70 ? `Play ${sc.label}` : 'Resume'}</button>}
      {ev && <p className="pv-flood-ev" key={ev[1]}>{ev[1]}</p>}
      <ol className="pv-equip">
        {flood.equipment.map((q) => {
          const dead = failed.has(q.name);
          return <li key={q.name} className={dead ? 'bad' : ''}><span className="dot" /><span>{q.name}<small>{q.elev < 15 ? `${q.elev > 0 ? '+' : ''}${q.elev} m` : ''}{q.note ? ` · ${q.note}` : ''}</small></span><b>{dead ? 'Flooded' : 'OK'}</b></li>;
        })}
      </ol>
      {flood.from === 'east' && <div className={`pv-sbo ${sbo ? 'on' : ''}`}>{sbo ? 'STATION BLACKOUT' : 'AC power available'}</div>}
      <p className="pv-hint2">{flood.note}</p>
    </aside>
  );
}

// instructions written for the buttons ("Open the cutaway.") are not narration
const sentences = (t: string) => t.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter((x) => x && !/^(Open the cutaway|Switch to )/.test(x));

/** Documentary-style overlay for the film tour. */
function FilmOverlay({ site, tour, stops, i, p, paused, onPause, onJump, onExit, onExplore }: {
  site: SiteDef; tour: Tour; stops: Stop[]; i: number; p: number; paused: boolean;
  onPause: () => void; onJump: (i: number) => void; onExit: () => void; onExplore: () => void;
}) {
  const n = stops.length;
  if (i < 0) {
    return (
      <div className="fm-wrap">
        <div className="fm-bars" aria-hidden="true"><i /><i /></div>
        <section className="fm-title" aria-live="polite">
          <span>A film tour · {tour.year}</span>
          <h2>{site.name}</h2>
          <p>{tour.logline}</p>
        </section>
        <FilmControls n={n} i={i} paused={paused} onPause={onPause} onJump={onJump} onExit={onExit} />
      </div>
    );
  }
  if (i >= n) {
    return (
      <div className="fm-wrap">
        <div className="fm-bars" aria-hidden="true"><i /><i /></div>
        <section className="fm-end" aria-live="polite">
          <span>End of the film</span>
          <h2>{site.name}</h2>
          <div>
            <button onClick={() => onJump(-1)}>Watch again</button>
            <button onClick={onExplore} className="fm-primary">Explore it yourself</button>
            <button onClick={onExit}>Close</button>
          </div>
        </section>
      </div>
    );
  }
  const st = stops[i], ts = tour.stops[i];
  const lines = sentences(`${st.body} ${ts?.deep ?? ''}`);
  const flying = p === 0;
  const k = Math.min(lines.length - 1, Math.floor(p * lines.length * 1.02));
  return (
    <div className="fm-wrap">
      <div className="fm-bars" aria-hidden="true"><i /><i /></div>
      <header className={`fm-chapter ${flying ? 'in' : ''}`} key={'c' + i}>
        <span>Chapter {String(i + 1).padStart(2, '0')}</span>
        <h2>{st.title}</h2>
      </header>
      {!flying && <p className="fm-sub" key={'s' + i + '-' + k} aria-live="polite">{lines[k]}</p>}
      {ts && !flying && (
        <dl className="fm-stats">
          {ts.stats.map(([a, b], j) => (
            <div key={a} className={p > 0.06 + j * 0.12 ? 'on' : ''}><dt>{a}</dt><dd>{b}</dd></div>
          ))}
        </dl>
      )}
      <FilmControls n={n} i={i} p={p} paused={paused} onPause={onPause} onJump={onJump} onExit={onExit} />
    </div>
  );
}

function FilmControls({ n, i, p = 0, paused, onPause, onJump, onExit }: { n: number; i: number; p?: number; paused: boolean; onPause: () => void; onJump: (i: number) => void; onExit: () => void }) {
  return (
    <nav className="fm-ctl" aria-label="Film controls">
      <button onClick={() => onJump(Math.max(-1, i - 1))} aria-label="Previous chapter">‹</button>
      <button onClick={onPause} aria-label={paused ? 'Play' : 'Pause'}>{paused ? '▶' : '❚❚'}</button>
      <button onClick={() => onJump(i + 1)} aria-label="Next chapter">›</button>
      <ol>
        {Array.from({ length: n }, (_, k) => (
          <li key={k} onClick={() => onJump(k)}><i style={{ width: `${k < i ? 100 : k === i ? p * 100 : 0}%` }} /></li>
        ))}
      </ol>
      <button onClick={onExit} className="fm-exit">Exit film</button>
    </nav>
  );
}

/** Card for the interactive tour: insight, statistics, things to do. */
function TourCard({ site, tour, stops, i, seen, eng, cut, setCut, era, setEra, setHour, onGo, onClose }: {
  site: SiteDef; tour?: Tour; stops: Stop[]; i: number; seen: number; eng: React.RefObject<PlantScene | null>;
  cut: boolean; setCut: (v: boolean) => void; era: string; setEra: (v: string) => void; setHour: (v: number) => void; onGo: (i: number) => void; onClose: () => void;
}) {
  const st = stops[i], ts = tour?.stops[i], act = ts?.act;
  const [busy, setBusy] = useState<string | null>(null);
  const animate = (label: string, f: (p: number) => void, dur: number, end: () => void) => {
    setBusy(label);
    const t0 = performance.now();
    const loop = (now: number) => {
      const p = Math.min(1, (now - t0) / (dur * 1000));
      f(p);
      if (p < 1) requestAnimationFrame(loop); else setTimeout(() => { end(); setBusy(null); }, 2500);
    };
    requestAnimationFrame(loop);
  };
  if (!st) return null;
  const eraLabel = act?.era ? site.eras?.find((e) => e.id === act.era)?.label : undefined;
  return (
    <section className="tc-card" aria-live="polite" key={i}>
      <header>
        <span>{String(i + 1).padStart(2, '0')} / {String(stops.length).padStart(2, '0')} · {seen} visited</span>
        <button onClick={onClose} aria-label="Close card">×</button>
      </header>
      <h2>{st.title}</h2>
      <p>{sentences(st.body).join(' ')}</p>
      {ts && (
        <>
          <dl className="tc-stats">{ts.stats.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>
          <h3>Why it matters</h3>
          <p className="tc-deep">{ts.deep}</p>
        </>
      )}
      <div className="tc-acts">
        {site.cutaway && <button className={cut ? 'on' : ''} onClick={() => setCut(!cut)}>{cut ? 'Close the cutaway' : 'Look inside'}</button>}
        {eraLabel && era !== act!.era && <button onClick={() => setEra(act!.era!)}>Show {eraLabel}</button>}
        <button onClick={() => setHour(20.8)}>See it at night</button>
        {act?.build && <button disabled={!!busy} onClick={() => animate('build', (p) => eng.current?.setBuild(act.build![0] + (act.build![1] - act.build![0]) * p), 12, () => eng.current?.setBuild(null))}>{busy === 'build' ? 'Building…' : 'Watch it being built'}</button>}
        {act?.flood && site.flood && <button disabled={!!busy} onClick={() => animate('flood', (p) => eng.current?.setFlood(act.flood![0] + (act.flood![1] - act.flood![0]) * Math.min(1, p * 1.4), site.flood!.start + (site.flood!.finish - site.flood!.start) * Math.min(1, p * 1.2)), 12, () => eng.current?.setFlood(null))}>{busy === 'flood' ? 'The wave…' : 'Replay the wave'}</button>}
      </div>
      <nav className="tc-nav">
        <button onClick={() => onGo(i - 1)} aria-label="Previous stop">‹</button>
        <button onClick={() => onGo(i + 1)} className="pv-next">Next stop ›</button>
      </nav>
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
