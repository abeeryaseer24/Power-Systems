import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CityScene, ANCHORS } from '../scene/CityScene';
import { createSim, scenarioById, type Scenario } from '../grid/scenarios';
import type { GridSim, SimEvent } from '../grid/engine';
import { DISTRICTS, PLANTS } from '../grid/network';
import FrequencyDial from '../components/FrequencyDial';
import Timeline from '../components/Timeline';
import Inspector, { type Selection } from '../components/Inspector';
import { GridAudio } from '../lib/audio';
import { sfx } from '../lib/sfx';
import SoundToggle from '../components/SoundToggle';
import { clock, mw, num } from '../lib/format';
import { saveRun } from '../lib/runStore';
import { PLANT_SITE } from '../scene/world';
import '../control.css';

const SPEEDS = [0, 1, 10, 60, 240];
const SPEED_LABEL = ['Pause', '1×', '10×', '60×', '240×'];
const SHORT: Record<string, string> = {
  kestrel: 'Kestrel Point', ridgeway: 'Ridgeway', harbour: 'Harbour CCGT', airport: 'Airport OCGT', glen: 'Glen Dam',
  saltmarsh: 'Saltmarsh wind', sunfield: 'Sunfield solar', bess: 'Battery', westmark: 'Westmark link',
};

export default function Control() {
  const { id = 'tuesday' } = useParams();
  const sc = scenarioById(id);
  if (!sc) return <main id="main" className="page"><h1>No such shift</h1><Link to="/shifts">Back to the shift board</Link></main>;
  return <ControlRoom key={sc.id} sc={sc} />;
}

function ControlRoom({ sc }: { sc: Scenario }) {
  const nav = useNavigate();
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<Map<string, HTMLButtonElement>>(new Map());
  const simRef = useRef<GridSim>(null as unknown as GridSim);
  if (!simRef.current) simRef.current = createSim(sc);
  const sim = simRef.current;
  const sceneRef = useRef<CityScene | null>(null);
  const audio = useRef(new GridAudio());
  const [tick, setTick] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const speedRef = useRef(0);
  const [started, setStarted] = useState(false);
  const [sel, setSel] = useState<Selection>(null);
  const [cine, setCine] = useState<SimEvent | null>(null);
  const [ended, setEnded] = useState(false);
  const [panel, setPanel] = useState<'freq' | 'inspect' | 'time'>('inspect');
  const slow = useRef<{ until: number; back: number } | null>(null);
  const seen = useRef(0);
  const endedRef = useRef(false);

  const forecast = useMemo(() => {
    const pts: { t: number; d: number }[] = [];
    for (let t = sc.startHour; t <= sc.endHour + 1e-6; t += 1 / 12) pts.push({ t, d: sim.forecastDemand(t) });
    return pts;
  }, [sc, sim]);

  const setSpeed = useCallback((i: number) => {
    speedRef.current = SPEEDS[i];
    setSpeedIdx(i);
    slow.current = null;
  }, []);

  const finish = useCallback(
    (early: boolean) => {
      if (endedRef.current) return;
      endedRef.current = true;
      speedRef.current = 0;
      setSpeedIdx(0);
      saveRun({
        scenarioId: sc.id, title: sc.title, startHour: sc.startHour, endHour: sc.endHour,
        history: sim.history, events: sim.events, log: sim.log, score: sim.result(), finishedEarly: early, at: Date.now(),
      });
      setEnded(true);
    },
    [sc, sim],
  );

  useEffect(() => {
    const scene = new CityScene(canvas.current!, 'control');
    sceneRef.current = scene;
    scene.onPickLine = (lid) => setSel(lid ? { kind: 'line', id: lid } : null);
    let last = performance.now();
    let lastUi = 0;
    const plantAnchors = PLANTS.map((p) => ({ key: `p:${p.id}`, v: ANCHORS.plant(p.id) }));
    const districtAnchors = DISTRICTS.map((d) => ({ key: `d:${d.id}`, v: ANCHORS.district(d.bus) }));
    const all = [...plantAnchors, ...districtAnchors];
    scene.onFrame = (project) => {
      const now = performance.now();
      const real = Math.min(0.25, (now - last) / 1000);
      last = now;
      const s = simRef.current;
      if (speedRef.current > 0 && !s.done) s.advance(Math.min(speedRef.current * real, 12));
      if (s.done && !endedRef.current) finish(false);
      scene.updateFromSim(s);
      // protection events → cinematic slow motion
      if (s.events.length > seen.current) {
        const fresh = s.events.slice(seen.current);
        seen.current = s.events.length;
        const big = fresh.find((e) => e.severity !== 'minor') ?? fresh[fresh.length - 1];
        audio.current.alarm(big.severity);
        if (fresh.some((e) => /tripped|shutdown|Load shedding/i.test(e.title))) sfx.clunk();
        if (big.severity === 'blackout') sfx.powerDown();
        scene.kick(big.severity === 'blackout' ? 1.4 : big.severity === 'major' ? 0.8 : 0.3);
        if (big.severity !== 'minor') {
          setCine(big);
          if (speedRef.current > 1) {
            const back = slow.current?.back ?? speedRef.current;
            slow.current = { until: now + 22000, back };
            speedRef.current = 1;
            setSpeedIdx(1);
          }
          window.setTimeout(() => setCine((c) => (c === big ? null : c)), 6500);
        }
      }
      if (slow.current && now > slow.current.until) {
        const i = SPEEDS.indexOf(slow.current.back);
        speedRef.current = slow.current.back;
        setSpeedIdx(i < 0 ? 3 : i);
        slow.current = null;
      }
      const f = s.frequency;
      const demand = s.districts.reduce((a, d) => a + d.served, 0);
      audio.current.update(f, Math.min(1, demand / 3500));
      // labels
      for (const a of all) {
        const el = labels.current.get(a.key);
        if (!el) continue;
        const p = project(a.v.x, a.v.y, a.v.z);
        el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
        el.style.visibility = p.visible ? 'visible' : 'hidden';
      }
      if (now - lastUi > 110) {
        lastUi = now;
        setTick((t) => t + 1);
      }
    };
    const a = audio.current;
    return () => {
      scene.dispose();
      a.dispose();
    };
  }, [finish]);

  useEffect(() => {
    const off = sfx.onMute((m) => audio.current.setMuted(m));
    return () => {
      off();
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setSelectedLine(sel?.kind === 'line' ? sel.id : null);
    if (sel && window.matchMedia('(max-width: 900px)').matches) setPanel('inspect');
  }, [sel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!started || ended) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === ' ') {
        e.preventDefault();
        setSpeed(speedRef.current > 0 ? 0 : 3);
      } else if (['1', '2', '3', '4'].includes(e.key)) setSpeed(Number(e.key));
      else if (e.key === 'Escape') setSel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started, ended, setSpeed]);

  const act = useCallback((fn: (s: GridSim) => void) => {
    fn(simRef.current);
    audio.current.click();
    setTick((t) => t + 1);
  }, []);

  const begin = () => {
    sfx.unlock();
    audio.current.start();
    audio.current.setMuted(sfx.muted);
    setStarted(true);
    setSpeed(sc.id === 'blackstart' ? 2 : 3);
  };

  const f = sim.frequency;
  const demand = sim.districts.reduce((a, d) => a + d.demand, 0);
  const served = sim.districts.reduce((a, d) => a + d.served, 0);
  const reserve = sim.reserve();
  const need = sim.largestInfeed();
  const latest = sim.log.slice(-4).reverse();
  const dark = f <= 0 && served < 1;
  void tick;

  return (
    <main id="main" className={`control ${dark ? 'is-dark' : ''} ${cine ? 'is-cine' : ''}`}>
      <canvas ref={canvas} className="control-canvas" aria-label="Map of Halvern's grid. Click a line to inspect it." />

      <div className="labels" aria-label="Plants and districts">
        {PLANTS.map((p, i) => {
          const ps = sim.plants[i];
          const on = ps.units.some((u) => u.status === 'online');
          const trip = ps.units.some((u) => u.status === 'tripped');
          return (
            <button
              key={p.id}
              ref={(el) => { if (el) labels.current.set(`p:${p.id}`, el); }}
              className={`lbl lbl-plant ${on ? 'on' : ''} ${trip ? 'trip' : ''} ${sel?.id === p.id ? 'sel' : ''}`}
              onClick={() => { setSel({ kind: 'plant', id: p.id }); sceneRef.current?.focus(PLANT_SITE[p.id].x, PLANT_SITE[p.id].z, 26); }}
            >
              <span className={`kind-dot k-${p.kind}`} aria-hidden="true" />
              <span className="lbl-name">{SHORT[p.id]}</span>
              <span className="lbl-val">{num(ps.output)} MW</span>
            </button>
          );
        })}
        {DISTRICTS.map((d, i) => {
          const ds = sim.districts[i];
          const frac = ds.demand > 0 ? ds.served / ds.demand : 0;
          return (
            <button
              key={d.id}
              ref={(el) => { if (el) labels.current.set(`d:${d.id}`, el); }}
              className={`lbl lbl-district ${frac < 0.995 ? 'short' : ''} ${frac < 0.01 ? 'out' : ''} ${sel?.id === d.id ? 'sel' : ''}`}
              onClick={() => setSel({ kind: 'district', id: d.id })}
            >
              <span className="lbl-name">{d.name}</span>
              <span className="lbl-val">{frac < 0.01 ? 'Dark' : `${Math.round(frac * 100)} %`}</span>
            </button>
          );
        })}
      </div>

      <header className="hud-top">
        <Link to="/shifts" className="hud-back" aria-label="Leave the control room">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
        </Link>
        <div className="hud-title">
          <span className="hud-shift">{sc.title}</span>
          <span className="hud-clock">{clock(sim.hour, speedIdx <= 1)}</span>
        </div>
        <div className="speed" role="radiogroup" aria-label="Simulation speed">
          {SPEED_LABEL.map((l, i) => (
            <button key={l} role="radio" aria-checked={speedIdx === i} className={speedIdx === i ? 'on' : ''} onClick={() => setSpeed(i)} disabled={!started || ended}>
              {i === 0 ? (
                <svg viewBox="0 0 16 16" aria-label="Pause"><rect x="4" y="3" width="3" height="10" fill="currentColor" /><rect x="9" y="3" width="3" height="10" fill="currentColor" /></svg>
              ) : l}
            </button>
          ))}
        </div>
        <div className="hud-kpis">
          <div><span>Demand</span><strong>{mw(demand)}</strong></div>
          <div><span>Unserved</span><strong className={demand - served > 5 ? 'bad' : ''}>{mw(Math.max(0, demand - served))}</strong></div>
          <div><span>Reserve</span><strong className={reserve < need ? 'bad' : ''}>{num(reserve)}<em> / {num(need)}</em></strong></div>
          <div className="kpi-wx"><span>Air</span><strong>{Math.round(sim.temp)} °C</strong></div>
          <div className="kpi-wx"><span>Wind</span><strong>{sim.wind.toFixed(0)} m/s</strong></div>
        </div>
        <div className="hud-actions">
          <SoundToggle />
          <button className="btn ghost small" onClick={() => finish(true)} disabled={!started || ended}>End shift</button>
        </div>
      </header>

      <nav className="mob-tabs" aria-label="Panels">
        {(['freq', 'inspect', 'time'] as const).map((k) => (
          <button key={k} className={panel === k ? 'on' : ''} onClick={() => setPanel(k)}>
            {k === 'freq' ? 'Frequency' : k === 'inspect' ? (sel ? 'Selected' : 'System') : 'Timeline'}
          </button>
        ))}
      </nav>

      <aside className={`hud-left ${panel === 'freq' ? 'mob-on' : ''}`}>
        <FrequencyDial f={f} rocof={sim.rocof} trace={sim.fTrace} />
      </aside>

      <aside className={`hud-right ${panel === 'inspect' ? 'mob-on' : ''}`}>
        <Inspector sim={sim} sel={sel} onSelect={setSel} act={act} />
      </aside>

      <section className={`hud-bottom ${panel === 'time' ? 'mob-on' : ''}`}>
        <Timeline sim={sim} tick={tick} forecast={forecast} />
        <ol className="log" aria-live="polite">
          {latest.map((e, i) => (
            <li key={`${e.t}-${i}`} className={`log-${e.level}`}>
              <time>{clock(e.t / 3600, true)}</time>
              <span>{e.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="letterbox" aria-hidden={!cine}>
        <i className="lb-top" />
        <i className="lb-bottom" />
        {cine && (
          <div className={`cine cine-${cine.severity}`} role="alert">
            <span className="cine-time">{clock(cine.t / 3600, true)}</span>
            <h2>{cine.title}</h2>
            <p>{cine.detail}</p>
            {slow.current && <span className="cine-slow">Slowed to real time</span>}
          </div>
        )}
      </div>

      {!started && (
        <div className="overlay brief" role="dialog" aria-modal="true" aria-labelledby="brief-title">
          <div className="brief-card">
            <span className="brief-meta">{sc.season}, {clock(sc.startHour)} to {clock(sc.endHour)}</span>
            <h1 id="brief-title">{sc.title}</h1>
            {sc.brief.map((p, i) => <p key={i}>{p}</p>)}
            <p className="brief-goal"><strong>Goal.</strong> {sc.goal}</p>
            <ul className="keys">
              <li><kbd>Space</kbd> pause</li>
              <li><kbd>1</kbd>–<kbd>4</kbd> speed</li>
              <li>Click a plant, district or line to control it</li>
            </ul>
            <div className="brief-cta">
              <button className="btn primary" onClick={begin} autoFocus>Start the shift</button>
              <Link className="btn ghost" to="/shifts">Choose another</Link>
            </div>
          </div>
        </div>
      )}

      {ended && (
        <div className="overlay brief" role="dialog" aria-modal="true" aria-labelledby="end-title">
          <div className="brief-card end">
            <span className="brief-meta">{clock(sim.hour)}</span>
            <h1 id="end-title">{sim.done ? 'Shift over' : 'Shift ended early'}</h1>
            <p>{sim.result().blackouts ? 'The city went dark on your watch.' : served >= demand - 5 ? 'Every light in Halvern is on.' : `${mw(demand - served)} of demand is still off supply.`}</p>
            <div className="brief-cta">
              <button className="btn primary" onClick={() => nav('/debrief')}>Read the debrief</button>
              <Link className="btn ghost" to="/shifts">Back to shifts</Link>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
