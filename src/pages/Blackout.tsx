import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { CityEngine } from '../city/engine';
import type { CityData } from '../city/types';
import { DEFAULT_CASCADE, LANES, LANE_INFO, runCascade, type Cascade, type CascadeOpts, type Lane } from '../city/cascade';
import { clock, num } from '../lib/format';
import '../plants.css';
import '../city.css';

// City blackout: every system on one 73-hour clock, as swimlanes and a live dependency graph.
export default function Blackout() {
  const { id = 'meridia' } = useParams();
  const [city, setCity] = useState<CityData | null>(null);
  const eng = useRef<CityEngine | null>(null);
  const [o, setO] = useState<CascadeOpts>(DEFAULT_CASCADE);
  const [cas, setCas] = useState<Cascade | null>(null);
  const [m, setM] = useState(40);
  const [playing, setPlaying] = useState(true);
  const [rate, setRate] = useState(60); // simulated minutes per second
  const [pin, setPin] = useState<{ cas: Cascade; label: string } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ CityEngine }, { loadCity }] = await Promise.all([import('../city/engine'), import('../city/load')]);
      const c = await loadCity(id);
      if (!alive) return;
      setCity(c);
      await new Promise((r) => setTimeout(r, 30));
      const e = new CityEngine(c, {}, { deferred: true });
      const { rerunDay } = await import('../city/remote');
      await rerunDay(e, 12);
      if (!alive) return;
      eng.current = e;
      setCas(runCascade(c, eng.current, o));
    })();
    return () => { alive = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!city || !eng.current) return;
    const t = setTimeout(() => setCas(runCascade(city, eng.current!, o)), 20);
    return () => clearTimeout(t);
  }, [o, city]);

  useEffect(() => {
    if (!playing || !cas) return;
    let last = performance.now(), raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setM((v) => { const nv = v + dt * rate; return nv >= cas.M - 1 ? 0 : nv; });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, rate, cas]);

  const set = (p: Partial<CascadeOpts>) => setO((v) => ({ ...v, ...p }));
  const mi = Math.floor(m);
  const hour = cas ? cas.h0 + mi / 60 : o.start;
  const since = cas ? mi - cas.t0 : 0;
  const past = cas ? cas.events.filter((e) => e.m <= mi) : [];

  return (
    <main id="main" className="bo-page">
      <header className="bo-head">
        <Link to={`/city/${id}`} className="pv-back">Back to the city</Link>
        <p className="cy-kicker">{city ? <>{city.name} · <span className={`cy-badge cy-badge-${city.kind}`}>{city.kind === 'prototype' ? 'Prototype city' : 'Real city'}</span></> : ' '}</p>
        <h1>City blackout</h1>
        <p className="bo-sub">The whole grid fails at once. Each system has its own backup and its own clock: traffic signals go dark in seconds, phone masts last hours, water tanks less than a day, hospital fuel a few days. Watch them fail one by one, then come back as the grid is restored.</p>
      </header>

      {!cas || !city ? <div className="cy-busy soft" role="status"><span>Simulating 73 hours</span><small>grid, signals, metro, phones, water, hospital, chargers</small></div> : (
        <>
          <section className="bo-graph" aria-label="Dependencies">
            <Graph cas={cas} mi={mi} />
          </section>
          <aside className="bo-now">
            <span className="cy-clock">{clock(hour)}</span>
            <span className="bo-since">{since < 0 ? `${-since} min before the blackout` : since < 120 ? `${since} min into the blackout` : `${num(since / 60, 1)} h into the blackout`}</span>
            <dl className="cy-rows">
              {LANES.map((l) => { const x = cas.lanes[l][mi]; return <div key={l}><dt>{LANE_INFO[l].label}</dt><dd className={x.s === 2 ? 'bad' : x.s === 1 ? 'warn' : 'ok'}>{l === 'hospital' ? (x.v === 1 ? 'mains' : x.v > 0 ? 'generators' : 'no power') : l === 'metro' ? (x.v ? 'running' : 'stopped') : `${Math.round(x.v * 100)} %`}</dd></div>; })}
            </dl>
            {cas.hospital.mins[Math.max(0, mi - cas.t0)] && since >= 0 && <p className="cy-hint">Hospital fuel: {Math.round(cas.hospital.mins[Math.min(cas.hospital.mins.length - 1, Math.max(0, mi - cas.t0))].fuel * 100)} % of {num(cas.hospital.tankL)} L</p>}
          </aside>

          <section className="bo-lanes" aria-label="Systems over 73 hours">
            <Lanes cas={cas} mi={mi} pin={pin?.cas ?? null} onSeek={(v) => { setPlaying(false); setM(v); }} />
            {pin && <p className="cy-hint">Thin bars under each system: <b>{pin.label}</b>. Change an input below to compare.</p>}
          </section>

          <section className="bo-feed" aria-live="polite">
            {past.slice(-4).reverse().map((ev, i) => (
              <article key={`${ev.m}-${ev.title}`} className={`cy-ev ${i === 0 ? 'cy-ev-warn' : ''}`}>
                <h3><span>{ev.m - cas.t0 < 0 ? '' : ev.m - cas.t0 < 120 ? `+${ev.m - cas.t0} min` : `+${num((ev.m - cas.t0) / 60, 1)} h`}</span>{ev.title}</h3>
                {i === 0 && <p>{ev.body}</p>}
              </article>
            ))}
          </section>

          <footer className="hp-bar">
            <button className="cy-play" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
            <div className="pv-seg" role="group" aria-label="Speed">{[20, 60, 180].map((r) => <button key={r} className={rate === r ? 'on' : ''} onClick={() => setRate(r)}>{r < 60 ? `${r} min/s` : `${r / 60} h/s`}</button>)}</div>
            <label>Blackout at <select value={o.start} onChange={(e) => set({ start: Number(e.target.value) })}>{[0.5, 6.5, 9.5, 12.5, 18.5, 21.5].map((h) => <option key={h} value={h}>{clock(h)}</option>)}</select></label>
            <label>grid down for <select value={o.hours} onChange={(e) => set({ hours: Number(e.target.value) })}>{[2, 6, 10, 16, 24, 36].map((h) => <option key={h} value={h}>{h} h</option>)}</select></label>
            <label>areas restored every <select value={o.stepMin} onChange={(e) => set({ stepMin: Number(e.target.value) })}>{[10, 25, 45].map((v) => <option key={v} value={v}>{v} min</option>)}</select></label>
            <label>Mast batteries <select value={o.batteryH} onChange={(e) => set({ batteryH: Number(e.target.value) })}>{[1, 3, 8].map((v) => <option key={v} value={v}>{v} h</option>)}</select></label>
            <label>Water tanks <select value={o.tankHours} onChange={(e) => set({ tankHours: Number(e.target.value) })}>{[2, 6, 12].map((v) => <option key={v} value={v}>{v} h</option>)}</select></label>
            <label>Hospital fuel <select value={o.hospFuelH} onChange={(e) => set({ hospFuelH: Number(e.target.value) })}>{[24, 60, 96].map((v) => <option key={v} value={v}>{v} h</option>)}</select></label>
            <label className="hp-check"><input type="checkbox" checked={o.refuel} onChange={(e) => set({ refuel: e.target.checked })} /> Fuel tankers</label>
            <button className={`pv-cut ${pin ? 'on' : ''}`} onClick={() => setPin(pin ? null : { cas, label: `blackout at ${clock(o.start)} for ${o.hours} h, ${o.batteryH} h mast batteries, ${o.tankHours} h tanks, ${o.hospFuelH} h hospital fuel${o.refuel ? ', tankers' : ''}` })}>{pin ? 'Unpin' : 'Pin to compare'}</button>
          </footer>
        </>
      )}
    </main>
  );
}

const COLS = ['#2f6d7e', '#ffb04d', '#ff5b4f'];

function Lanes({ cas, mi, onSeek, pin }: { cas: Cascade; mi: number; onSeek: (m: number) => void; pin: Cascade | null }) {
  const W = 1000, RH = 30, H = LANES.length * RH;
  const ref = useRef<SVGSVGElement>(null);
  // run-length bands per lane, so the SVG stays small
  const runs = (c: Cascade) => LANES.map((l) => {
    const out: { a: number; b: number; s: number }[] = [];
    const arr = c.lanes[l];
    let a = 0;
    for (let k = 1; k <= arr.length; k++) if (k === arr.length || arr[k].s !== arr[a].s) { out.push({ a, b: k, s: arr[a].s }); a = k; }
    return out;
  });
  const pinBands = useMemo(() => (pin ? runs(pin) : null), [pin]); // eslint-disable-line react-hooks/exhaustive-deps
  const bands = useMemo(() => LANES.map((l) => {
    const out: { a: number; b: number; s: number }[] = [];
    const arr = cas.lanes[l];
    let a = 0;
    for (let k = 1; k <= arr.length; k++) if (k === arr.length || arr[k].s !== arr[a].s) { out.push({ a, b: k, s: arr[a].s }); a = k; }
    return out;
  }), [cas]);
  const x = (k: number) => (k / cas.M) * W;
  const seek = (ev: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); onSeek(Math.max(0, Math.min(cas.M - 1, ((ev.clientX - r.left) / r.width) * cas.M))); };
  const drag = useRef(false);
  return (
    <div className="bo-lanes-in">
      <ul className="bo-lab">{LANES.map((l) => <li key={l} title={LANE_INFO[l].note}>{LANE_INFO[l].label}</li>)}</ul>
      <div className="bo-plot">
        <svg ref={ref} viewBox={`0 0 ${W} ${H + 18}`} preserveAspectRatio="none" onPointerDown={(e) => { drag.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); seek(e); }} onPointerMove={(e) => drag.current && seek(e)} onPointerUp={() => { drag.current = false; }}>
          {bands.map((bs, li) => bs.map((b, i) => <rect key={`${li}-${i}`} x={x(b.a)} y={li * RH + 4} width={Math.max(0.5, x(b.b) - x(b.a))} height={pinBands ? RH - 13 : RH - 8} fill={COLS[b.s]} opacity={b.s === 0 ? 0.55 : 0.9} />))}
          {pinBands?.map((bs, li) => bs.map((b, i) => <rect key={`p${li}-${i}`} x={x(b.a)} y={li * RH + RH - 8} width={Math.max(0.5, x(b.b) - x(b.a))} height={4} fill={COLS[b.s]} opacity={0.9} />))}
          <rect x={x(cas.t0)} y={0} width={x(Math.min(...cas.restoredAt)) - x(cas.t0)} height={H} className="bo-out" />
          {Array.from({ length: 13 }, (_, k) => k * 6).map((hh) => <g key={hh} className="cy-axis"><line x1={x(hh * 60 + cas.t0)} x2={x(hh * 60 + cas.t0)} y1={0} y2={H} /><text x={x(hh * 60 + cas.t0) + 3} y={H + 13}>+{hh} h</text></g>)}
          {cas.events.map((ev, i) => <circle key={i} cx={x(ev.m)} cy={LANES.indexOf(ev.lane) * RH + RH / 2} r={3.2} className="bo-ev" />)}
          <line x1={x(mi)} x2={x(mi)} y1={0} y2={H} className="cy-head" />
        </svg>
      </div>
    </div>
  );
}

/** Who depends on whom: the grid feeds everything; masts need exchanges; the hospital needs water. */
function Graph({ cas, mi }: { cas: Cascade; mi: number }) {
  const s = (l: Lane) => cas.lanes[l][mi].s;
  const N: { id: string; label: string; x: number; y: number; st: number }[] = [
    { id: 'grid', label: 'Grid', x: 90, y: 120, st: s('grid') },
    { id: 'subs', label: 'Substations', x: 250, y: 120, st: s('grid') },
    { id: 'signals', label: 'Traffic signals', x: 470, y: 30, st: s('signals') },
    { id: 'metro', label: 'Metro', x: 470, y: 80, st: s('metro') },
    { id: 'telecom', label: 'Cell sites', x: 470, y: 135, st: s('telecom') },
    { id: 'water', label: 'Water pumps', x: 470, y: 190, st: s('water') },
    { id: 'ev', label: 'EV hubs', x: 470, y: 240, st: s('ev') },
    { id: 'phones', label: 'Phones', x: 700, y: 135, st: s('telecom') },
    { id: 'taps', label: 'Taps', x: 700, y: 190, st: s('water') },
    { id: 'hospital', label: 'Hospital', x: 880, y: 160, st: s('hospital') },
  ];
  const at = (id: string) => N.find((n) => n.id === id)!;
  const E: [string, string][] = [['grid', 'subs'], ['subs', 'signals'], ['subs', 'metro'], ['subs', 'telecom'], ['subs', 'water'], ['subs', 'ev'], ['telecom', 'phones'], ['water', 'taps'], ['taps', 'hospital'], ['subs', 'hospital'], ['phones', 'hospital']];
  return (
    <svg viewBox="0 0 980 270" className="bo-g" role="img" aria-label="Dependency graph">
      {E.map(([a, b]) => { const A = at(a), B = at(b); const st = Math.max(A.st, 0); return <path key={a + b} d={`M${A.x + 52},${A.y} C${(A.x + B.x) / 2},${A.y} ${(A.x + B.x) / 2},${B.y} ${B.x - 52},${B.y}`} className={`bo-e s${st}`} />; })}
      {N.map((n) => (
        <g key={n.id} className={`bo-n s${n.st}`}>
          <rect x={n.x - 52} y={n.y - 15} width={104} height={30} rx={3} />
          <text x={n.x} y={n.y + 5}>{n.label}</text>
        </g>
      ))}
    </svg>
  );
}
