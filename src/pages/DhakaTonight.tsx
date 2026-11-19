import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRegion } from './atlas/useRegion';
import { shapeAt } from '../grid/profiles';
import type { RegionSim } from '../grid/region';
import SoundToggle from '../components/SoundToggle';
import { mw } from '../lib/format';
import '../control.css';
import '../atlas.css';
import '../dhaka.css';

type Policy = 'rotate' | 'protect' | 'none';
const POLICIES: { id: Policy; title: string; note: string }[] = [
  { id: 'rotate', title: 'Fair rotation', note: 'Every area takes its turn, one hour at a time.' },
  { id: 'protect', title: 'Protect critical areas', note: 'Substations feeding hospitals and water pumps are never cut; the rest rotate more often.' },
  { id: 'none', title: 'No planned shedding', note: 'Let the grid sort it out. The frequency relays will.' },
];
const GROUPS = 4;
const HOUR_SECONDS = 3; // real seconds per simulated hour at play speed

/** Demand shape over the day for Dhaka (mixed residential and commercial), relative to peak. */
const demandAt = (h: number) => shapeAt('mixed', h) * 0.92 + (h >= 18 && h <= 22 ? 0.08 : 0);

export default function DhakaTonight() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [region, setRegion] = useState('dhaka-metro');
  const r = useRegion(region, canvas);
  const { sim, data } = r;
  const [supply, setSupply] = useState(0.82);
  const [policy, setPolicy] = useState<Policy>('rotate');
  const [hour, setHour] = useState(15);
  const [playing, setPlaying] = useState(false);
  const [log, setLog] = useState<boolean[][]>([]); // [busIndexInList][hour] dark?
  const acc = useRef(0);
  const lastHour = useRef(-1);

  useEffect(() => {
    if (r.error && region === 'dhaka-metro') setRegion('dhaka');
  }, [r.error, region]);

  // areas: load-carrying substations, split into rotation groups; the largest central ones are critical
  const areas = useMemo(() => {
    if (!sim) return [];
    const list = sim.buses.map((b, i) => ({ i, name: b.def.name, load: b.def.load, x: b.def.x, z: b.def.z })).filter((a) => a.load > 15);
    list.sort((a, b) => b.load - a.load);
    const critical = new Set(list.slice(0, Math.max(1, Math.round(list.length * 0.15))).map((a) => a.i));
    return list.map((a, k) => ({ ...a, group: k % GROUPS, critical: critical.has(a.i) }));
  }, [sim]);

  useEffect(() => {
    r.speed.current = 0;
    setLog(areas.map(() => new Array(24).fill(false)));
    lastHour.current = -1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, areas.length]);

  const totalPeak = areas.reduce((a, x) => a + x.load, 0);
  const demandNow = (h: number) => totalPeak * demandAt(h);
  const available = totalPeak * supply;

  /** Apply the shedding plan for one hour and return which areas are dark. */
  const plan = (s: RegionSim, h: number) => {
    const need = Math.max(0, demandNow(h) - available);
    const dark = new Set<number>();
    if (policy !== 'none' && need > 0) {
      let cut = 0;
      const eligible = areas.filter((a) => policy !== 'protect' || !a.critical);
      // start with the group whose turn it is, then the next
      for (let g = 0; g < GROUPS && cut < need; g++) {
        const grp = (h + g) % GROUPS;
        for (const a of eligible.filter((x) => x.group === grp)) {
          if (cut >= need) break;
          dark.add(a.i);
          cut += a.load * demandAt(h);
        }
      }
    }
    s.loadScale = demandAt(h);
    for (const a of areas) s.buses[a.i].connected = dark.has(a.i) ? 0 : 1;
    // redispatch for this hour, then scale generation to the demand still connected
    s.dispatch(s.ext.hvdc ? s.ext.MW * 0.6 : 0);
    const total = s.buses.reduce((x, b) => x + b.def.load * s.loadScale, 0);
    const connected = s.buses.reduce((x, b) => x + b.def.load * s.loadScale * b.connected, 0);
    const supplyNow = s.gens.reduce((x, g) => x + (g.online ? g.sched : 0), 0) + (s.ext.online ? s.ext.sched : 0);
    const k = total > 0 ? connected / total : 1;
    // what the plan did not shed is missing generation: plants simply cannot make it
    const short = Math.max(0, connected - available);
    const target = Math.max(0, supplyNow * k - short);
    const f = supplyNow > 0 ? target / supplyNow : 1;
    for (const g of s.gens) {
      if (!g.online) continue;
      g.sched *= f;
      g.p = g.sched;
      g.gov = 0;
      if (short > 0) g.avail = Math.max(g.sched, g.avail * f);
    }
    s.ext.sched *= f;
    s.ext.p = s.ext.sched;
    s.ext.deficit = 0;
    return dark;
  };

  useEffect(() => {
    if (!sim || !playing) return;
    let raf = 0;
    let last = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      acc.current += (now - last) / 1000;
      last = now;
      const h = Math.floor(hour + acc.current / HOUR_SECONDS) % 24;
      if (h !== lastHour.current) {
        lastHour.current = h;
        const dark = plan(sim, h);
        setHour(h);
        setLog((L) => L.map((row, k) => row.map((v, hh) => (hh === h ? dark.has(areas[k].i) || !sim.buses[areas[k].i].live : v))));
      }
      sim.advance(0.5);
      if (h === 14 && acc.current > HOUR_SECONDS * 20) setPlaying(false);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, playing, policy, supply]);

  const start = () => {
    if (!sim) return;
    acc.current = 0;
    lastHour.current = -1;
    setLog(areas.map(() => new Array(24).fill(false)));
    r.restart();
    setPlaying(true);
  };

  const hoursOut = log.map((row) => row.filter(Boolean).length);
  const avgOut = hoursOut.length ? hoursOut.reduce((a, b) => a + b, 0) / hoursOut.length : 0;
  const worst = hoursOut.length ? Math.max(...hoursOut) : 0;
  const shortNow = Math.max(0, demandNow(hour) - available);

  return (
    <main id="main" className="control region dhaka">
      <canvas ref={canvas} className="control-canvas" aria-label="Night map of Dhaka's grid" />
      {!sim && <div className="loading" role="status">{r.error && region === 'dhaka' ? r.error : r.loading}</div>}
      <header className="hud-top">
        <Link to="/" className="hud-back" aria-label="Home">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
        </Link>
        <div className="hud-title">
          <span className="hud-shift">Dhaka tonight</span>
          <span className="hud-clock">{String(hour).padStart(2, '0')}:00</span>
        </div>
        {sim && (
          <div className="hud-kpis">
            <div><span>Demand</span><strong>{mw(demandNow(hour))}</strong></div>
            <div><span>Supply available</span><strong>{mw(available)}</strong></div>
            <div><span>Shortfall</span><strong className={shortNow > 0 ? 'bad' : ''}>{mw(shortNow)}</strong></div>
            <div><span>Frequency</span><strong className={sim.frequency > 0 && sim.frequency < 49.5 ? 'bad' : ''}>{sim.frequency > 0 ? `${sim.frequency.toFixed(2)} Hz` : 'Dark'}</strong></div>
          </div>
        )}
        <div className="hud-actions"><SoundToggle /></div>
      </header>
      {sim && data && (
        <>
          <aside className="hud-left wi-left dk-left">
            <div className="wi-panel">
              <h2>Plan tonight’s load shedding</h2>
              <p className="hint">Gas is short and imports are capped. Decide how {data.city} shares the shortfall over the next 24 hours.</p>
              <label className="w-slider">
                <span>Supply available, share of peak demand</span>
                <input type="range" min={0.6} max={1.05} step={0.01} value={supply} onChange={(e) => setSupply(Number(e.target.value))} disabled={playing} />
                <output>{Math.round(supply * 100)} %</output>
              </label>
              <ul className="wi-list">
                {POLICIES.map((p) => (
                  <li key={p.id}>
                    <label className={policy === p.id ? 'on' : ''}>
                      <input type="radio" name="policy" checked={policy === p.id} onChange={() => setPolicy(p.id)} disabled={playing} />
                      <span><b>{p.title}</b><em>{p.note}</em></span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="wi-cta">
                <button className="btn primary" onClick={start}>{playing ? 'Restart the night' : 'Run the night'}</button>
                {playing && <button className="btn ghost" onClick={() => setPlaying(false)}>Pause</button>}
              </div>
            </div>
          </aside>
          <aside className="hud-right dk-right">
            <div className="insp">
              <div className="insp-head"><div><h2>The timetable</h2><p>Each row is a substation area; dark cells are hours without power.</p></div></div>
              <div className="dk-stats">
                <div><span>Average outage</span><strong>{avgOut.toFixed(1)} h</strong></div>
                <div><span>Worst area</span><strong className={worst > 6 ? 'bad' : ''}>{worst} h</strong></div>
              </div>
              <div className="dk-grid" role="table" aria-label="Load-shedding timetable">
                <div className="dk-row dk-hours" role="row"><span role="columnheader" /> {Array.from({ length: 24 }, (_, h) => <i key={h} role="columnheader" className={h === hour ? 'now' : ''}>{h % 6 === 0 ? h : ''}</i>)}</div>
                {areas.slice(0, 22).map((a, k) => (
                  <div key={a.i} className="dk-row" role="row">
                    <span role="rowheader" title={a.name}>{a.critical && policy === 'protect' ? '✚ ' : ''}{a.name.replace(/ (Substation|Grid Substation|tee).*/i, '')}</span>
                    {(log[k] ?? []).map((d, h) => <i key={h} role="cell" className={`${d ? 'off' : ''} ${h === hour ? 'now' : ''}`} />)}
                  </div>
                ))}
              </div>
              <p className="hint">{policy === 'none' ? 'With no plan, the shortfall drags the frequency down until automatic relays cut whole areas at random, or the grid collapses.' : policy === 'protect' ? 'Protecting critical substations means everyone else is cut more often.' : 'A fair rotation spreads the pain evenly, the way DESCO and DPDC publish their schedules.'}</p>
            </div>
          </aside>
          <p className="osm-credit">© OpenStreetMap contributors</p>
        </>
      )}
    </main>
  );
}

