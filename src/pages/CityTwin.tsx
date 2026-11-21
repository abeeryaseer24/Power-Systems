import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { CityEngine, CityEvent, CityOpts, Minute } from '../city/engine';
import type { Pick, TwinScene } from '../city/TwinScene';
import type { CityData } from '../city/types';
import { SECTORS, SECTOR_INFO, type Sector } from '../city/demand';
import { TRAIN } from '../city/metro';
import { clock, num } from '../lib/format';
import '../city.css';

// One viewer, two models on two pages:
//   /city        City Day: where 2.7 million people's demand comes from, hour by hour
//   /city/metro  Metro traction: trains, substations and the 1500 V DC network
type Mode = 'day' | 'metro';

const SPEEDS: Record<Mode, number[]> = { day: [60, 300, 900, 1800], metro: [1, 10, 30, 120] };
const speedLabel = (s: number) => (s >= 60 ? `${s / 60} min/s` : `${s}×`);
const HI: Partial<Record<Sector, number>> = { res: 0, com: 1, ind: 2, inst: 3, metro: 4, light: 5 };

export default function CityTwin({ mode }: { mode: Mode }) {
  const { id: cityId = 'meridia' } = useParams();
  const [city, setCity] = useState<CityData | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const eng = useRef<CityEngine | null>(null);
  const scn = useRef<TwinScene | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState('Building the city');
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(SPEEDS[mode][1]);
  const [opts, setOpts] = useState<CityOpts | null>(null);
  const [trips, setTrips] = useState<string[]>([]);
  const [sel, setSel] = useState<Pick | null>(null);
  const [hi, setHi] = useState<Sector | null>(null);
  const [flow, setFlow] = useState(true);
  const [line, setLine] = useState(0);
  const [feed, setFeed] = useState<CityEvent[]>([]);
  const [panel, setPanel] = useState<'inputs' | null>(null);
  const [graphs, setGraphs] = useState(() => { try { return localStorage.getItem('blackstart.cityGraphs') !== '0'; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem('blackstart.cityGraphs', graphs ? '1' : '0'); } catch { /* storage unavailable */ } }, [graphs]);
  const play = useRef({ playing, speed });
  play.current = { playing, speed };
  const lastEv = useRef(0);

  // build the engine and the scene
  useEffect(() => {
    let alive = true;
    let scene: TwinScene | null = null;
    (async () => {
      const [{ CityEngine }, { TwinScene }, { loadCity }] = await Promise.all([import('../city/engine'), import('../city/TwinScene'), import('../city/load')]);
      const c = await loadCity(cityId);
      if (!alive || !host.current) return;
      setCity(c);
      setBusy(`Simulating a day in ${c.name}`);
      await new Promise((r) => setTimeout(r, 40));
      if (!alive || !host.current) return;
      const e = new CityEngine(c);
      e.seek(mode === 'metro' ? 8.1 : 17.5);
      eng.current = e;
      setOpts({ ...e.opts });
      scene = new TwinScene(host.current, c, { view: mode === 'metro' && c.lines.length ? 'metro' : 'city' });
      scn.current = scene;
      if (import.meta.env.DEV) (window as unknown as { __city: unknown }).__city = { e, scene };
      scene.onFrame = (dt) => {
        const p = play.current;
        if (p.playing) e.advance(dt * p.speed);
        scene!.state = sceneState(e);
      };
      scene.state = sceneState(e);
      lastEv.current = e.hour;
      setReady(true);
      setBusy('');
    })();
    return () => {
      alive = false;
      scene?.dispose();
      scn.current = null;
      eng.current = null;
    };
  }, [mode, cityId]);

  // the UI reads the engine a few times a second, not every frame
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      const e = eng.current;
      if (!e) return;
      const h = e.hour;
      // events the clock just passed go into the caption feed
      const passed = e.scenario.events.filter((ev) => (lastEv.current <= h ? ev.t > lastEv.current && ev.t <= h : ev.t > lastEv.current || ev.t <= h));
      if (passed.length) setFeed((f) => [...passed.reverse(), ...f].slice(0, 4));
      lastEv.current = h;
      setTick((t) => t + 1);
    }, mode === 'metro' ? 120 : 200);
    return () => clearInterval(id);
  }, [ready, mode]);

  useEffect(() => { scn.current?.setHighlight(hi === null ? -1 : HI[hi] ?? -1); }, [hi, ready]);
  useEffect(() => { scn.current?.setFlow(mode === 'metro' && flow); }, [flow, ready, mode]);
  useEffect(() => { if (scn.current) scn.current.selected = sel; }, [sel]);
  // centre the 3D view in the area above the bottom panels
  useEffect(() => {
    if (!ready) return;
    const fit = () => {
      const top = (document.querySelector('.cy-schem') ?? document.querySelector('.cy-strip'))?.getBoundingClientRect().top;
      if (top) scn.current?.setInset(innerHeight - top);
    };
    fit();
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, [ready, mode, graphs]);

  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement)?.closest('input, select, textarea')) return;
      if (ev.key === 'g' || ev.key === 'G') setGraphs((g) => !g);
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);

  const rerun = useCallback((fn: (e: CityEngine) => void, msg = 'Re-running the day') => {
    const e = eng.current;
    if (!e) return;
    setBusy(msg);
    setTimeout(() => {
      fn(e);
      setOpts({ ...e.opts });
      setTrips([...e.trips]);
      lastEv.current = e.hour;
      setBusy('');
    }, 40);
  }, []);

  const seek = (h: number) => {
    const e = eng.current;
    if (!e) return;
    e.seek(h);
    lastEv.current = h;
    setTick((t) => t + 1);
  };

  const onCanvasClick = (ev: React.MouseEvent) => {
    const s = scn.current;
    if (!s || (ev.target as HTMLElement).tagName !== 'CANVAS') return;
    const p = s.pick(ev.clientX, ev.clientY);
    setSel(p);
  };
  const downAt = useRef<[number, number]>([0, 0]);

  const e = eng.current;
  const now = e?.now();
  const minute = e?.minute();
  const night = scn.current?.isNight ?? false;
  void tick;

  return (
    <main id="main" className={`cy-viewer cy-${mode} ${night ? 'is-night' : ''} ${graphs ? '' : 'cy-nographs'}`}>
      <div
        className="cy-canvas"
        ref={host}
        onPointerDown={(ev) => { downAt.current = [ev.clientX, ev.clientY]; }}
        onClick={(ev) => { if (Math.hypot(ev.clientX - downAt.current[0], ev.clientY - downAt.current[1]) < 5) onCanvasClick(ev); }}
      />
      {busy && (
        <div className={`cy-busy ${ready ? 'soft' : ''}`} role="status">
          <span>{busy}</span>
          <small>{ready ? 'every train, every minute, 00:00 to 24:00' : city ? `${num(city.population / 1e6, 1)} million people · ${city.lines.length} metro line${city.lines.length === 1 ? '' : 's'} · ${city.subs.length} substations` : 'loading map data'}</small>
        </div>
      )}

      <header className="cy-title">
        <Link to="/cities" className="pv-back">Cities</Link>
        <p className="cy-kicker">{city ? <>{city.name} · <span className={`cy-badge cy-badge-${city.kind}`}>{city.kind === 'prototype' ? 'Prototype city' : 'Real city · OpenStreetMap'}</span></> : ' '}</p>
        <h1>{mode === 'day' ? 'City Day' : 'Metro traction'}</h1>
        <nav className="cy-switch" aria-label="Models">
          <Link to={`/city/${cityId}`} className={mode === 'day' ? 'on' : ''}>City Day</Link>
          {(!city || city.lines.length > 0) && <Link to={`/city/${cityId}/metro`} className={mode === 'metro' ? 'on' : ''}>Metro traction</Link>}
        </nav>
      </header>

      {ready && e && now && minute && opts && (
        <>
          <Captions mode={mode} e={e} now={now} minute={minute} feed={feed} />
          <Inspector sel={sel} e={e} now={now} mode={mode} onClose={() => setSel(null)} onFocus={(p) => { const v = scn.current?.posOf(p); if (v) scn.current!.focus(v, p.type === 'district' ? 2600 : 700); }}
            onTrip={(id, on) => rerun((en) => en.trip(id, on), on ? 'Taking it out of service' : 'Back in service')} trips={trips} />

          <div className="cy-tools">
            <div className="pv-seg" role="group" aria-label="Camera">
              <button onClick={() => scn.current?.view('city')}>City</button>
              <button onClick={() => scn.current?.view('metro')}>Close</button>
              <button onClick={() => scn.current?.view('overhead')}>Plan</button>
            </div>
            {mode === 'metro' && <button className={`pv-cut ${flow ? 'on' : ''}`} onClick={() => setFlow(!flow)} aria-pressed={flow}>Current flow</button>}
            <button className={`pv-cut ${panel === 'inputs' ? 'on' : ''}`} onClick={() => setPanel(panel === 'inputs' ? null : 'inputs')} aria-expanded={panel === 'inputs'}>Model inputs</button>
          </div>
          {panel === 'inputs' && <Inputs city={e.city} mode={mode} opts={opts} trips={trips} onOpts={(o) => rerun((en) => en.setOpts(o))} onTrip={(id, on) => rerun((en) => en.trip(id, on))} onClose={() => setPanel(null)} />}

          {mode === 'metro' && graphs && <LineSchematic e={e} line={line} setLine={setLine} sel={sel} setSel={setSel} />}

          <section className="cy-strip" aria-label="Timeline">
            <div className="cy-controls">
              <button className="cy-play" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
              <span className="cy-clock">{clock(now.h, mode === 'metro')}</span>
              <span className="cy-temp">{now.T.toFixed(1)} °C</span>
              <div className="pv-seg" role="group" aria-label="Speed">
                {SPEEDS[mode].map((s) => <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{speedLabel(s)}</button>)}
              </div>
              <button className={`cy-hide ${graphs ? '' : 'off'}`} onClick={() => setGraphs(!graphs)} aria-pressed={!graphs} title="Show or hide the graphs (G)">{graphs ? 'Hide graphs' : 'Show graphs'}</button>
              <span className="cy-sum">
                {mode === 'day' ? <>Demand <b>{num(now.total)}</b> MW{now.unserved > 1 && <em> · {num(now.unserved)} MW unserved</em>}</> : <>Traction <b>{num(now.metro, 1)}</b> MW · <b>{e.sim.trains.length}</b> trains · headway <b>{Number.isFinite(now.hw) ? `${num(now.hw / 60, 1)} min` : 'no service'}</b></>}
              </span>
            </div>
            {!graphs ? null : mode === 'day' ? <DemandChart e={e} hour={now.h} hi={hi} setHi={setHi} seek={seek} /> : <TractionChart e={e} hour={now.h} seek={seek} />}
          </section>
        </>
      )}
    </main>
  );
}

function sceneState(e: CityEngine) {
  const n = e.now();
  return {
    hour: n.h,
    season: e.opts.season,
    districts: n.districts.map((x) => ({ lit: x.l.lit, up: x.up, street: x.l.light > 0.001 ? 1 : 0 })),
    subs: n.subs.map((s) => ({ load: s.mw / s.rating, up: s.up })),
    sim: e.sim,
  };
}

// ------------------------------------------------------------------ captions

function Captions({ mode, e, now, minute, feed }: { mode: Mode; e: CityEngine; now: ReturnType<CityEngine['now']>; minute: Minute; feed: CityEvent[] }) {
  const peak = Math.max(...e.scenario.mins.map((m) => m.total));
  const h = now.h;
  let line: string;
  if (mode === 'day') {
    const parts = [...SECTORS].filter((s) => s !== 'loss').map((s) => [s, minute[s as keyof Minute] as number] as const).sort((a, b) => b[1] - a[1]);
    const lead = SECTOR_INFO[parts[0][0]].label.toLowerCase();
    const phase = h < 5 ? 'Night. Bedroom air conditioners hold the base load up.' : h < 9 ? 'Morning ramp. Homes wake, then offices and shops open.' : h < 16 ? 'Working day. Chillers in offices follow the afternoon heat.' : h < 18.5 ? 'Late afternoon. Offices wind down while homes fill up.' : h < 22.5 ? 'Evening peak. Everyone is home, lights and AC on together.' : 'Late evening. Demand falls as the city goes to bed.';
    line = `${phase} ${parts[0][1] > 0 ? `${cap(lead)} lead with ${num(parts[0][1])} MW.` : ''} Demand is at ${Math.round((now.total / peak) * 100)} % of today's peak.`;
  } else {
    const trains = e.sim.trains;
    const acc = trains.filter((t) => t.phase === 'accel').length, br = trains.filter((t) => t.phase === 'brake').length;
    const regen = trains.reduce((a, t) => a + Math.max(0, -t.pDel), 0) / 1e6;
    line = trains.length
      ? `${trains.length} trains in service: ${acc} accelerating, ${br} braking. Braking trains are pushing ${num(regen, 1)} MW back into the overhead line for the others to use. Lowest pantograph voltage ${num(Math.min(...e.sim.lines.map((l) => l.minV)))} V.`
      : h > 23 || h < 5.5 ? 'No service. The traction substations idle at no-load voltage, about 1650 V.' : 'Waiting for the first departures.';
  }
  return (
    <aside className="cy-captions" aria-live="polite">
      <p className="cy-live"><span>{clock(h)}</span>{line}</p>
      {feed.map((ev, i) => (
        <article key={`${ev.t}-${ev.title}-${i}`} className={`cy-ev cy-ev-${ev.kind}`}>
          <h3><span>{clock(ev.t)}</span>{ev.title}</h3>
          {i === 0 && <p>{ev.body}</p>}
        </article>
      ))}
    </aside>
  );
}
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// ------------------------------------------------------------------ charts

const CW = 1000, CH = 120;
function useTimeline(seek: (h: number) => void) {
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef(false);
  const at = (ev: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.min(23.99, Math.max(0, ((ev.clientX - r.left) / r.width) * 24));
  };
  return {
    ref,
    onPointerDown: (ev: React.PointerEvent) => { drag.current = true; (ev.target as Element).setPointerCapture?.(ev.pointerId); seek(at(ev)); },
    onPointerMove: (ev: React.PointerEvent) => { if (drag.current) seek(at(ev)); },
    onPointerUp: () => { drag.current = false; },
  };
}

function Markers({ events, seek }: { events: CityEvent[]; seek: (h: number) => void }) {
  return (
    <div className="cy-marks">
      {events.filter((ev) => ev.t > 0).map((ev, i) => (
        <button key={i} className={`cy-mark cy-mark-${ev.kind}`} style={{ left: `${(ev.t / 24) * 100}%` }} onClick={() => seek(ev.t)} title={`${clock(ev.t)} ${ev.title}`} aria-label={`${clock(ev.t)} ${ev.title}`} />
      ))}
    </div>
  );
}

function Axis() {
  return (
    <g className="cy-axis">
      {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
        <g key={h}><line x1={(h / 24) * CW} x2={(h / 24) * CW} y1={0} y2={CH} /><text x={(h / 24) * CW + 4} y={CH - 4}>{String(h).padStart(2, '0')}</text></g>
      ))}
    </g>
  );
}

function DemandChart({ e, hour, hi, setHi, seek }: { e: CityEngine; hour: number; hi: Sector | null; setHi: (s: Sector | null) => void; seek: (h: number) => void }) {
  const tl = useTimeline(seek);
  const mins = e.scenario.mins, base = e.baseline.mins;
  const max = Math.max(...base.map((m) => m.total + m.unserved)) * 1.08;
  const paths = useMemo(() => {
    const step = 6;
    const acc = new Float64Array(Math.ceil(1440 / step) + 1);
    return SECTORS.map((s) => {
      const top: string[] = [], bot: string[] = [];
      for (let i = 0, k = 0; i <= 1440; i += step, k++) {
        const m = mins[Math.min(1439, i)];
        const x = (i / 1440) * CW;
        const y0 = CH - (acc[k] / max) * CH;
        acc[k] += m[s];
        const y1 = CH - (acc[k] / max) * CH;
        top.push(`${x.toFixed(1)},${y1.toFixed(1)}`);
        bot.unshift(`${x.toFixed(1)},${y0.toFixed(1)}`);
      }
      return { s, d: `M${top.join(' L')} L${bot.join(' L')} Z` };
    });
  }, [mins, max]);
  const baseLine = useMemo(() => base.filter((_, i) => i % 6 === 0).map((m, k) => `${((k * 6) / 1440) * CW},${CH - (m.total / max) * CH}`).join(' '), [base, max]);
  const m = mins[Math.min(1439, Math.floor(hour * 60))];
  return (
    <div className="cy-chart">
      <ul className="cy-legend">
        {SECTORS.map((s) => (
          <li key={s}>
            <button className={hi === s ? 'on' : ''} onMouseEnter={() => setHi(s)} onMouseLeave={() => setHi(null)} onFocus={() => setHi(s)} onBlur={() => setHi(null)} onClick={() => setHi(hi === s ? null : s)} title={SECTOR_INFO[s].note}>
              <i style={{ background: SECTOR_INFO[s].colour }} />{SECTOR_INFO[s].label}<b>{num(m[s], m[s] < 10 ? 1 : 0)}</b>
            </button>
          </li>
        ))}
      </ul>
      <div className="cy-plot">
        <svg ref={tl.ref} viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" onPointerDown={tl.onPointerDown} onPointerMove={tl.onPointerMove} onPointerUp={tl.onPointerUp} role="slider" aria-label="Time of day" aria-valuemin={0} aria-valuemax={24} aria-valuenow={hour}>
          <Axis />
          {paths.map((p) => <path key={p.s} d={p.d} fill={SECTOR_INFO[p.s].colour} opacity={hi && hi !== p.s ? 0.18 : 0.85} />)}
          {e.trips.size > 0 && <polyline points={baseLine} className="cy-base" />}
          <line x1={(hour / 24) * CW} x2={(hour / 24) * CW} y1={0} y2={CH} className="cy-head" />
        </svg>
        <Markers events={e.scenario.events} seek={seek} />
        <span className="cy-ymax">{num(max, 0)} MW</span>
      </div>
      {hi && <p className="cy-note"><b>{SECTOR_INFO[hi].label}.</b> {SECTOR_INFO[hi].note}</p>}
    </div>
  );
}

function TractionChart({ e, hour, seek }: { e: CityEngine; hour: number; seek: (h: number) => void }) {
  const tl = useTimeline(seek);
  const mins = e.scenario.mins, base = e.baseline.mins;
  const max = Math.max(4, ...base.map((m) => m.metro + m.regen), ...mins.map((m) => m.metro + m.regen)) * 1.1;
  const series = useMemo(() => {
    const mk = (f: (m: Minute) => number, src = mins) => src.filter((_, i) => i % 2 === 0).map((m, k) => `${((k * 2) / 1440) * CW},${CH - (f(m) / max) * CH}`).join(' ');
    return {
      grid: mk((m) => m.metro),
      regen: mk((m) => m.metro + m.regen),
      burnt: mk((m) => m.burnt),
      base: mk((m) => m.metro, base),
    };
  }, [mins, base, max]);
  const m = mins[Math.min(1439, Math.floor(hour * 60))];
  const eDay = mins.reduce((a, x) => a + x.metro, 0) / 60, rDay = mins.reduce((a, x) => a + x.regen, 0) / 60, bDay = mins.reduce((a, x) => a + x.burnt, 0) / 60, retDay = mins.reduce((a, x) => a + x.returned, 0) / 60;
  return (
    <div className="cy-chart">
      <ul className="cy-legend">
        <li><span><i style={{ background: '#ff8a5c' }} />From the grid<b>{num(m.metro, 1)}</b></span></li>
        <li><span><i style={{ background: '#86c5da' }} />Regen reused<b>{num(m.regen, 1)}</b></span></li>
        <li><span><i style={{ background: '#ff5b4f' }} />Burnt in resistors<b>{num(m.burnt, 1)}</b></span></li>
        {e.opts.reversible && <li><span><i style={{ background: '#7fd1a8' }} />Returned to grid<b>{num(m.returned, 1)}</b></span></li>}
        <li className="cy-day"><span>Today<b>{num(eDay, 0)} MWh</b></span><small>regen saved {Math.round((rDay / (eDay + rDay)) * 100)} % · burnt {num(bDay, 1)} MWh{e.opts.reversible ? ` · returned ${num(retDay, 1)} MWh` : ''}</small></li>
      </ul>
      <div className="cy-plot">
        <svg ref={tl.ref} viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" onPointerDown={tl.onPointerDown} onPointerMove={tl.onPointerMove} onPointerUp={tl.onPointerUp} role="slider" aria-label="Time of day" aria-valuemin={0} aria-valuemax={24} aria-valuenow={hour}>
          <Axis />
          <polygon points={`0,${CH} ${series.regen} ${CW},${CH}`} fill="#86c5da" opacity={0.35} />
          <polygon points={`0,${CH} ${series.grid} ${CW},${CH}`} fill="#ff8a5c" opacity={0.8} />
          <polyline points={series.burnt} fill="none" stroke="#ff5b4f" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          {e.trips.size > 0 && <polyline points={series.base} className="cy-base" />}
          <line x1={(hour / 24) * CW} x2={(hour / 24) * CW} y1={0} y2={CH} className="cy-head" />
        </svg>
        <Markers events={e.scenario.events} seek={seek} />
        <span className="cy-ymax">{num(max, 0)} MW</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ line schematic

function LineSchematic({ e, line, setLine, sel, setSel }: { e: CityEngine; line: number; setLine: (n: number) => void; sel: Pick | null; setSel: (p: Pick) => void }) {
  const C = e.city, dc = e.sim.dc;
  const ln = e.sim.lines[line];
  const L = ln.L, SW = 1000, SH = 150, top = 22, vh = 70;
  const x = (s: number) => 20 + (s / L) * (SW - 40);
  const lo = dc.Vmin * 0.9, hi = dc.Vregen * 1.03;
  const vy = (v: number) => top + vh - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * vh;
  // voltage profile from the solved nodes
  const nodes: [number, number][] = [];
  ln.tss.forEach((t) => { if (t.on) nodes.push([t.s, t.v]); });
  e.sim.trains.filter((t) => t.line === line).forEach((t) => nodes.push([e.sim.chain(t), t.volt]));
  nodes.sort((a, b) => a[0] - b[0]);
  const prof = nodes.map(([s, v]) => `${x(s).toFixed(1)},${vy(v).toFixed(1)}`).join(' ');
  return (
    <section className="cy-schem" aria-label="Line schematic">
      <div className="cy-schem-head">
        <div className="pv-seg" role="group" aria-label="Line">
          {C.lines.map((l, i) => <button key={l.id} className={line === i ? 'on' : ''} onClick={() => setLine(i)}><i style={{ background: l.colour }} />{l.name}</button>)}
        </div>
        <span>Pantograph voltage along the line, V</span>
      </div>
      <svg viewBox={`0 0 ${SW} ${SH}`} preserveAspectRatio="none">
        {[[dc.Vregen, `Umax1 ${dc.Vregen}`], [C.metro.voltage, `nominal ${C.metro.voltage}`], [dc.Vmin, `Umin1 ${dc.Vmin}`]].map(([v, l]) => (
          <g key={v} className={`cy-ref ${v === C.metro.voltage ? 'nom' : ''}`}><line x1={20} x2={SW - 20} y1={vy(v as number)} y2={vy(v as number)} /><text x={SW - 22} y={vy(v as number) - 3}>{l}</text></g>
        ))}
        <polyline points={prof} className="cy-prof" />
        <line x1={20} x2={SW - 20} y1={118} y2={118} className="cy-track" />
        <line x1={20} x2={SW - 20} y1={128} y2={128} className="cy-track" />
        {C.lines[line].stations.map((st, i) => (
          <g key={st.name} className="cy-st" onClick={() => setSel({ type: 'station', line, idx: i })}>
            <line x1={x(st.s)} x2={x(st.s)} y1={113} y2={133} />
            <text x={x(st.s)} y={146}>{st.name}</text>
          </g>
        ))}
        {ln.tss.map((t, i) => {
          const f = Math.max(0, t.p) / 1e6 / dc.tssRating;
          const on = sel?.type === 'tss' && sel.line === line && sel.idx === i;
          return (
            <g key={t.name} className={`cy-tss ${!t.on ? 'off' : f > 1 ? 'over' : ''} ${on ? 'sel' : ''}`} onClick={() => setSel({ type: 'tss', line, idx: i })}>
              <rect x={x(t.s) - 6} y={98} width={12} height={10} />
              <rect x={x(t.s) - 6} y={108 - Math.min(1.4, f) * 10} width={12} height={Math.min(1.4, f) * 10} className="fill" />
            </g>
          );
        })}
        {e.sim.trains.filter((t) => t.line === line).map((t) => {
          const pw = t.pDel / 1e6;
          const on = sel?.type === 'train' && sel.id === t.id;
          return <circle key={t.id} cx={x(e.sim.chain(t))} cy={t.dir > 0 ? 118 : 128} r={on ? 6 : 4.2} className={`cy-train ${pw > 0.6 ? 'mot' : pw < -0.1 ? 'reg' : 'idle'} ${on ? 'sel' : ''}`} onClick={() => setSel({ type: 'train', id: t.id })} />;
        })}
      </svg>
    </section>
  );
}

// ------------------------------------------------------------------ inspector

function Inspector({ sel, e, now, mode, onClose, onFocus, onTrip, trips }: { sel: Pick | null; e: CityEngine; now: ReturnType<CityEngine['now']>; mode: Mode; onClose: () => void; onFocus: (p: Pick) => void; onTrip: (id: string, on: boolean) => void; trips: string[] }) {
  let body: React.ReactNode;
  let title = '', kicker = '';
  const C = e.city, dc = e.sim.dc;
  if (!sel) {
    kicker = `${C.name} now`;
    title = mode === 'day' ? `${num(now.total)} MW` : `${num(now.metro, 1)} MW`;
    const peak = Math.max(...e.scenario.mins.map((m) => m.total));
    body = (
      <>
        <Rows rows={mode === 'day' ? [
          ['Air temperature', `${now.T.toFixed(1)} °C`],
          ['Sun', now.sunEl > 0 ? `${now.sunEl.toFixed(0)}° up` : `${(-now.sunEl).toFixed(0)}° below horizon`],
          ['Today’s peak', `${num(peak)} MW`],
          ['Season', C.climate[e.opts.season].label],
          ['Population', `${num(C.population / 1e6, 2)} million`],
        ] : [
          ['Trains in service', `${e.sim.trains.length}`],
          ['Substations on', `${e.sim.lines.reduce((a, l) => a + l.tss.filter((t) => t.on).length, 0)} of ${e.sim.lines.reduce((a, l) => a + l.tss.length, 0)}`],
          ['System', `${C.metro.voltage} V DC overhead`],
          ['Regenerative braking', e.opts.regen ? 'on' : 'off'],
          ['Substation type', e.opts.reversible ? 'reversible (inverter)' : 'diode rectifier'],
        ]} />
        <p className="cy-hint">Click a {mode === 'day' ? 'district, substation or train' : 'train, substation or station'} in the city to inspect it.</p>
        <details className="cy-notes">
          <summary>{C.kind === 'prototype' ? 'This is a prototype city' : 'Where the data comes from'}</summary>
          <ul>{C.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </details>
      </>
    );
  } else if (sel.type === 'district') {
    const x = now.districts.find((d) => d.d.id === sel.id)!;
    const sub = C.subs.find((s) => s.id === x.d.sub)!;
    const sn = now.subs.find((s) => s.s.id === sub.id)!;
    kicker = 'District';
    title = x.d.name;
    const parts: [Sector, number][] = [['res', x.l.res], ['com', x.l.com], ['ind', x.l.ind], ['inst', x.l.inst], ['light', x.l.light]];
    const tot = parts.reduce((a, p) => a + p[1], 0);
    body = (
      <>
        <Rows rows={[['Demand now', x.up ? `${num(tot, 1)} MW` : 'no supply'], ['Residents', num(x.d.pop)], ['Commercial floor space', `${num(x.d.comM2 / 1e6, 2)} million m²`], ['Fed from', sub.name], ['Substation loading', `${Math.round((sn.mw / sn.rating) * 100)} % of ${sn.rating} MVA`]]} />
        <Bars parts={parts} />
        <p className="cy-hint">Window lights in this district follow the same numbers: {Math.round(x.l.lit[0] * 100)} % of home windows and {Math.round(x.l.lit[1] * 100)} % of office windows are lit.</p>
      </>
    );
  } else if (sel.type === 'sub') {
    const i = C.subs.findIndex((s) => s.id === sel.id);
    const s = now.subs[i];
    const fed = C.districts.filter((d) => d.sub === sel.id);
    const tssFed = C.lines.flatMap((l) => l.tss.filter((t) => t.sub === sel.id).map((t) => t.name));
    const tripped = trips.includes(sel.id);
    kicker = '132/33 kV substation';
    title = s.s.name.replace(' 132/33 kV', '');
    body = (
      <>
        <Rows rows={[['Load', tripped ? 'out of service' : `${num(s.mw, 1)} MW`], ['Firm rating', `${s.rating} MVA`], ['Loading', tripped ? '—' : `${Math.round((s.mw / s.rating) * 100)} %`], ['Feeds', fed.map((d) => d.name).join(', ')], ['Traction feeds', tssFed.length ? tssFed.join(', ') : 'none']]} />
        <button className="cy-trip" onClick={() => onTrip(sel.id, !tripped)}>{tripped ? 'Return to service' : 'Take out of service'}</button>
        <p className="cy-hint">Taking it out re-runs the day without it: its districts go dark and any traction substations it feeds lose supply.</p>
      </>
    );
  } else if (sel.type === 'tss') {
    const t = e.sim.lines[sel.line].tss[sel.idx];
    const id = `tss:${sel.line}:${sel.idx}`;
    kicker = `${C.lines[sel.line].name} · traction substation`;
    title = t.name.replace(' TSS', '');
    body = (
      <>
        <Rows rows={[['Output', t.on ? `${num(Math.max(0, t.p) / 1e6, 2)} MW` : 'out of service'], ['Current', t.on ? `${num(Math.max(0, t.i))} A` : '—'], ['Busbar voltage', t.on ? `${num(t.v)} V` : '—'], ['Rating', `${dc.tssRating} MW${t.modelled ? ' (position modelled)' : ''}`], ['Fed from', C.subs.find((g) => g.id === t.sub)!.name]]} />
        <button className="cy-trip" onClick={() => onTrip(id, !trips.includes(id))}>{trips.includes(id) ? 'Return to service' : 'Take out of service'}</button>
        <p className="cy-hint">A diode rectifier only conducts while the line voltage is below its {dc.E} V no-load voltage, so substations share each train’s load by distance.</p>
      </>
    );
  } else if (sel.type === 'train') {
    const t = e.sim.trains.find((x) => x.id === sel.id);
    kicker = t ? `${C.lines[t.line].name} · train ${t.id}` : 'Train';
    title = t ? `${num(t.v * 3.6)} km/h` : 'Arrived';
    if (t) {
      const ln = e.sim.lines[t.line];
      const stops = ln.names[t.dir > 0 ? 0 : 1];
      const pw = t.pDel / 1e6;
      const phase = { accel: 'Accelerating', cruise: 'Cruising', brake: 'Braking', dwell: 'At the platform', held: 'Held at signal', stalled: 'Stalled: no traction voltage' }[t.phase];
      body = (
        <>
          <Rows rows={[['Doing', phase], ['Power', pw >= 0 ? `${num(pw, 2)} MW drawn` : `${num(-pw, 2)} MW regenerated`], ['Pantograph', `${num(t.volt)} V`], ['Passengers', `${num(t.pax)} (${Math.round((t.pax / e.sim.cap) * 100)} %)`], ['Mass', `${num(TRAIN.tare + t.pax * 0.07)} t`], ['Next stop', stops[t.next]], ['Towards', stops[stops.length - 1]]]} />
          {t.burnt > 1000 && <p className="cy-hint warn">{num(t.burnt / 1e6, 2)} MW of braking power is being burnt in the roof resistors: no train nearby can take it.</p>}
        </>
      );
    } else body = <p className="cy-hint">This train has reached its terminal and left service.</p>;
  } else {
    const st = C.lines[sel.line].stations[sel.idx];
    kicker = `${C.lines[sel.line].name} · station`;
    title = st.name;
    body = <Rows rows={[['Chainage', `${num(st.s / 1000, 2)} km`], ['Platform', '150 m, elevated, 13 m above street'], ['Dwell', '25–50 s, longer at the peak']]} />;
  }
  return (
    <aside className="cy-insp" aria-label="Inspector">
      <p className="cy-kicker">{kicker}</p>
      <h2>{title}</h2>
      {body}
      {sel && (
        <div className="cy-insp-act">
          <button onClick={() => onFocus(sel)}>Fly to</button>
          <button onClick={onClose}>Close</button>
        </div>
      )}
    </aside>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return <dl className="cy-rows">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}
function Bars({ parts }: { parts: [Sector, number][] }) {
  const max = Math.max(0.1, ...parts.map((p) => p[1]));
  return (
    <ul className="cy-bars">
      {parts.map(([s, v]) => <li key={s}><span>{SECTOR_INFO[s].label}</span><i style={{ width: `${(v / max) * 100}%`, background: SECTOR_INFO[s].colour }} /><b>{num(v, 1)}</b></li>)}
    </ul>
  );
}

// ------------------------------------------------------------------ inputs

function Inputs({ city: C, mode, opts, trips, onOpts, onTrip, onClose }: { city: CityData; mode: Mode; opts: CityOpts; trips: string[]; onOpts: (o: Partial<CityOpts>) => void; onTrip: (id: string, on: boolean) => void; onClose: () => void }) {
  return (
    <aside className="cy-inputs" aria-label="Model inputs">
      <header><h2>Model inputs</h2><button onClick={onClose} aria-label="Close">×</button></header>
      <p className="cy-hint">Change an input and the whole day is simulated again, every train and every minute.</p>
      <fieldset>
        <legend>Season</legend>
        <div className="pv-seg">{(['summer', 'monsoon', 'winter'] as const).map((s) => <button key={s} className={opts.season === s ? 'on' : ''} onClick={() => onOpts({ season: s })}>{cap(s)}</button>)}</div>
      </fieldset>
      <fieldset>
        <legend>Day</legend>
        <div className="pv-seg">{(['weekday', 'weekend'] as const).map((s) => <button key={s} className={opts.day === s ? 'on' : ''} onClick={() => onOpts({ day: s })}>{cap(s)}</button>)}</div>
      </fieldset>
      <fieldset>
        <legend>Heat <b>{opts.heat > 0 ? '+' : ''}{opts.heat} °C</b> on the seasonal average</legend>
        <input type="range" min={-3} max={5} step={1} defaultValue={opts.heat} onPointerUp={(ev) => onOpts({ heat: Number((ev.target as HTMLInputElement).value) })} onKeyUp={(ev) => onOpts({ heat: Number((ev.target as HTMLInputElement).value) })} />
      </fieldset>
      {mode === 'metro' && (
        <>
          <fieldset>
            <legend>Peak headway</legend>
            <div className="pv-seg">{[120, 150, 180, 240, 300].map((s) => <button key={s} className={opts.peakHeadway === s ? 'on' : ''} onClick={() => onOpts({ peakHeadway: s })}>{s / 60} min</button>)}</div>
          </fieldset>
          <fieldset>
            <legend>Regenerative braking</legend>
            <div className="pv-seg"><button className={opts.regen ? 'on' : ''} onClick={() => onOpts({ regen: true })}>On</button><button className={!opts.regen ? 'on' : ''} onClick={() => onOpts({ regen: false })}>Off</button></div>
          </fieldset>
          <fieldset>
            <legend>Substations</legend>
            <div className="pv-seg"><button className={!opts.reversible ? 'on' : ''} onClick={() => onOpts({ reversible: false })}>Diode only</button><button className={opts.reversible ? 'on' : ''} onClick={() => onOpts({ reversible: true })}>Reversible</button></div>
          </fieldset>
        </>
      )}
      <fieldset>
        <legend>Out of service</legend>
        <select value="" onChange={(ev) => ev.target.value && onTrip(ev.target.value, true)}>
          <option value="">Take something out…</option>
          {mode === 'metro'
            ? C.lines.flatMap((l, li) => l.tss.map((t, ti) => <option key={`${li}${ti}`} value={`tss:${li}:${ti}`} disabled={trips.includes(`tss:${li}:${ti}`)}>{l.name}: {t.name}</option>))
            : C.subs.map((s) => <option key={s.id} value={s.id} disabled={trips.includes(s.id)}>{s.name}</option>)}
        </select>
        {trips.length > 0 && <ul className="cy-trips">{trips.map((id) => <li key={id}>{labelOf(C, id)}<button onClick={() => onTrip(id, false)}>Restore</button></li>)}</ul>}
      </fieldset>
    </aside>
  );
}

function labelOf(C: CityData, id: string) {
  if (id.startsWith('tss:')) { const [, l, i] = id.split(':').map(Number); return C.lines[l].tss[i].name; }
  return C.subs.find((s) => s.id === id)?.name ?? id;
}
