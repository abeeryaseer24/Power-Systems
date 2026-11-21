import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BRANCHES, DEFAULT_HOSPITAL, HOSPITALS, firstMinutes, hospitalFor, hospLoad, threeDays, type Branch, type HospitalDef, type HospitalOpts } from '../city/hospital';
import type { CityData } from '../city/types';
import { clock, num } from '../lib/format';
import '../plants.css';
import '../city.css';

// Model 04: one hospital through a blackout, on its single-line diagram.
type Scale = 'secs' | 'days';

export default function Hospital() {
  const { id = 'meridia' } = useParams();
  const [city, setCity] = useState<CityData | null>(null);
  useEffect(() => { import('../city/load').then(({ loadCity }) => loadCity(id).then(setCity)); }, [id]);
  const def: HospitalDef & { source?: string } = (city && hospitalFor(city)) ?? HOSPITALS.meridia;
  const [o, setO] = useState<HospitalOpts>(DEFAULT_HOSPITAL);
  const [scale, setScale] = useState<Scale>('secs');
  const [t, setT] = useState(0); // seconds (secs) or hours (days)
  const [playing, setPlaying] = useState(true);
  const first = useMemo(() => firstMinutes(def, o), [def, o]);
  const days = useMemo(() => threeDays(def, o), [def, o]);
  const raf = useRef(0);

  useEffect(() => { setT(0); }, [scale, o]);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      // first minutes at 4x real time; 72 hours in about 70 s
      setT((v) => {
        const nv = v + dt * (scale === 'secs' ? 4 : 1);
        return scale === 'secs' ? (nv > 180 ? 0 : nv) : nv > 72 ? 0 : nv;
      });
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, scale]);

  // the state the diagram draws
  const st = useMemo(() => {
    if (scale === 'secs') {
      const s = first.secs[Math.min(180, Math.floor(t))];
      return { mains: s.mains, gens: s.gensOn, on: s.on, ats: s.atsPos, ups: s.ups, fuel: 1, load: 0, clockH: o.start + t / 3600 };
    }
    const m = days.mins[Math.min(days.mins.length - 1, Math.floor(t * 60))];
    const em = !m.mains && m.gens > 0 && m.fuel > 0;
    const pos = (b: Branch) => (m.mains ? 'normal' : em && m.on[b] ? 'emergency' : 'open') as 'normal' | 'open' | 'emergency';
    return { mains: m.mains, gens: em ? m.gens : 0, on: m.on, ats: { life: pos('life'), critical: pos('critical'), equipment: pos('equipment') }, ups: m.on.critical ? 1 : 0, fuel: m.fuel, load: m.load, clockH: o.start + t };
  }, [scale, t, first, days, o.start]);

  const steps = scale === 'secs' ? first.steps.filter((s) => s.t <= t) : [];
  const L = hospLoad(def, st.clockH);
  const set = (p: Partial<HospitalOpts>) => setO((v) => ({ ...v, ...p }));

  return (
    <main id="main" className="hp-page">
      <header className="hp-head">
        <Link to={`/city/${id}`} className="pv-back">Back to the city</Link>
        <p className="cy-kicker">{city ? <>{city.name} · <span className={`cy-badge cy-badge-${city.kind}`}>{city.kind === 'prototype' ? 'Prototype city' : 'Real city'}</span></> : ' '}</p>
        <h1>Hospital in a blackout</h1>
        <p className="hp-sub">{def.name}: {def.beds} beds, about {num(def.peakMW, 1)} MW at peak. Its essential electrical system is laid out the way NFPA 99 and 110 require{city?.kind === 'real' ? ' (a typical layout, not this hospital’s actual drawings)' : ''}. Watch the first three minutes second by second, then the next three days.</p>
      </header>

      {def.source && <p className="hp-src">{def.source}</p>}
      <section className="hp-diagram" aria-label="Single-line diagram">
        <SLD st={st} gens={o.gens} failed={o.failToStart} second={o.secondFeeder} />
        <div className="hp-scale pv-seg" role="group" aria-label="Timescale">
          <button className={scale === 'secs' ? 'on' : ''} onClick={() => setScale('secs')}>First 3 minutes</button>
          <button className={scale === 'days' ? 'on' : ''} onClick={() => setScale('days')}>Next 72 hours</button>
        </div>
      </section>

      <aside className="hp-side">
        <div className="hp-now">
          <span className="cy-clock">{clock(st.clockH, scale === 'secs')}</span>
          <span>{scale === 'secs' ? `${Math.floor(t)} s after the mains failed` : `${num(t, 1)} h into the outage`}</span>
        </div>
        <dl className="cy-rows">
          <div><dt>Mains</dt><dd className={st.mains ? 'ok' : 'bad'}>{st.mains ? (o.secondFeeder ? 'feeder B' : 'restored') : 'lost'}</dd></div>
          <div><dt>Generators running</dt><dd>{st.gens} of {o.gens}</dd></div>
          <div><dt>Hospital load</dt><dd>{num(L * 1000)} kW normal</dd></div>
          {scale === 'days' && <div><dt>Fuel</dt><dd className={st.fuel < 0.2 ? 'bad' : ''}>{Math.round(st.fuel * 100)} % of {num(days.tankL)} L</dd></div>}
          {scale === 'days' && <div><dt>On generators</dt><dd>{num(st.load * 1000)} kW</dd></div>}
        </dl>
        <ul className="hp-branches">
          {BRANCHES.map((b) => (
            <li key={b.id} className={st.on[b.id] ? 'on' : 'off'}>
              <i style={{ background: b.colour }} />
              <span><b>{b.label}</b> {Math.round(b.share * 100)} % of load</span>
              <em>{st.on[b.id] ? 'supplied' : 'off'}</em>
              <small>{b.note}</small>
            </li>
          ))}
        </ul>
        {scale === 'days' && (
          <p className={`cy-hint ${days.dryAt >= 0 ? 'warn' : ''}`}>
            {o.secondFeeder ? 'With a second feeder from another substation, the generators are never needed.'
              : days.dryAt >= 0 ? `The fuel runs out ${num(days.dryAt, 1)} hours in, at ${clock(o.start + days.dryAt)}${o.duration > days.dryAt ? ', before the grid comes back. Only battery fittings and UPS remain' : ''}.`
              : `Fuel lasts the whole ${o.duration} h outage${o.refuel ? ' with a tanker every 24 h' : ''}.`}
          </p>
        )}
      </aside>

      <section className="hp-steps" aria-live="polite">
        {scale === 'secs' ? steps.slice().reverse().map((s, i) => (
          <article key={s.title} className={`cy-ev ${i === 0 ? 'cy-ev-peak' : ''}`}>
            <h3><span>{s.t < 1 ? `${Math.round(s.t * 1000)} ms` : `${s.t} s`}</span>{s.title}</h3>
            {i === 0 && <p>{s.body}</p>}
          </article>
        )) : <DaysChart days={days} t={t} o={o} />}
      </section>

      <footer className="hp-bar">
        <button className="cy-play" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
        <input type="range" min={0} max={scale === 'secs' ? 180 : 72} step={scale === 'secs' ? 1 : 0.1} value={t} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }} aria-label="Time since the outage" />
        <label>Outage at <select value={o.start} onChange={(e) => set({ start: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select></label>
        <label>lasting <select value={o.duration} onChange={(e) => set({ duration: Number(e.target.value) })}>{[2, 6, 12, 24, 36, 48, 72].map((d) => <option key={d} value={d}>{d} h</option>)}</select></label>
        <label>Generators <select value={o.gens} onChange={(e) => set({ gens: Number(e.target.value) })}>{[2, 3, 4].map((g) => <option key={g} value={g}>{g} × {o.genMW} MW</option>)}</select></label>
        <label>Fail to start <select value={o.failToStart} onChange={(e) => set({ failToStart: Number(e.target.value) })}>{[0, 1, 2].map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
        <label>Fuel <select value={o.fuelH} onChange={(e) => set({ fuelH: Number(e.target.value) })}>{[24, 36, 60, 96].map((h) => <option key={h} value={h}>{h} h of one set at full load</option>)}</select></label>
        <label className="hp-check"><input type="checkbox" checked={o.refuel} onChange={(e) => set({ refuel: e.target.checked })} /> Tanker every 24 h</label>
        <label className="hp-check"><input type="checkbox" checked={o.secondFeeder} onChange={(e) => set({ secondFeeder: e.target.checked })} /> Second feeder from another substation</label>
      </footer>
    </main>
  );
}

type St = { mains: boolean; gens: number; on: Record<Branch, boolean>; ats: Record<'life' | 'critical' | 'equipment', 'normal' | 'open' | 'emergency'>; ups: number };

/** The single-line diagram. Live conductors glow and carry moving dashes. */
function SLD({ st, gens, failed, second }: { st: St; gens: number; failed: number; second: boolean }) {
  const live = (on: boolean) => (on ? 'hp-live' : 'hp-dead');
  const emBus = st.gens > 0;
  const W = 1000, H = 560;
  const branchX = { life: 200, critical: 420, equipment: 640, nonEss: 860 } as const;
  const ATS = ({ b, x }: { b: 'life' | 'critical' | 'equipment'; x: number }) => {
    const pos = st.ats[b];
    // blade pivots at the bottom; tips to the normal (left) or emergency (right) contact
    const tip = pos === 'normal' ? [x - 22, 330] : pos === 'emergency' ? [x + 22, 330] : [x, 322];
    return (
      <g className="hp-ats">
        <rect x={x - 42} y={318} width={84} height={56} rx={2} />
        <circle cx={x - 22} cy={330} r={3} className={live(st.mains)} />
        <circle cx={x + 22} cy={330} r={3} className={live(emBus)} />
        <line x1={x} y1={364} x2={tip[0]} y2={tip[1]} className={live(st.on[b])} />
        <text x={x} y={392}>ATS</text>
      </g>
    );
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hp-sld" role="img" aria-label="Hospital single-line diagram">
      {/* utility */}
      <text x={60} y={36} className="hp-lab">11 kV feeder A</text>
      <text x={330} y={36} className="hp-lab">11 kV feeder B{second ? ' · other substation' : ' · same substation'}</text>
      <line x1={110} y1={46} x2={110} y2={110} className={live(st.mains && !second)} />
      <line x1={390} y1={46} x2={390} y2={110} className={live(st.mains)} />
      {[110, 390].map((x) => (
        <g key={x} className="hp-tx">
          <circle cx={x} cy={124} r={14} /><circle cx={x} cy={144} r={14} />
          <text x={x + 24} y={138}>11/0.4 kV</text>
        </g>
      ))}
      <line x1={110} y1={158} x2={110} y2={200} className={live(st.mains)} />
      <line x1={390} y1={158} x2={390} y2={200} className={live(st.mains)} />
      {/* normal bus */}
      <line x1={80} y1={200} x2={900} y2={200} className={`hp-bus ${live(st.mains)}`} />
      <text x={80} y={190} className="hp-lab">Main LV switchboard</text>
      {/* generators */}
      {Array.from({ length: gens }, (_, i) => {
        const x = 620 + i * 110;
        const up = i < gens - failed && st.gens > 0;
        return (
          <g key={i} className={`hp-gen ${i >= gens - failed ? 'failed' : ''}`}>
            <circle cx={x} cy={84} r={22} className={up ? 'run' : ''} />
            <text x={x} y={90}>G{i + 1}</text>
            <line x1={x} y1={106} x2={x} y2={250} className={live(up)} />
            {i >= gens - failed && <text x={x} y={58} className="hp-fail">failed to start</text>}
          </g>
        );
      })}
      <line x1={560} y1={250} x2={620 + (gens - 1) * 110 + 30} y2={250} className={`hp-bus ${live(emBus)}`} />
      <text x={560} y={272} className="hp-lab">Generator bus</text>
      {/* normal and emergency risers to each ATS */}
      {(['life', 'critical', 'equipment'] as const).map((b) => {
        const x = branchX[b];
        return (
          <g key={b}>
            <polyline points={`${x - 22},200 ${x - 22},330`} className={live(st.mains)} />
            <polyline points={`${x + 22},250 ${x + 22},330`} className={live(emBus)} />
            <line x1={x + 22} y1={250} x2={560} y2={250} className={`hp-thin ${live(emBus)}`} />
            <ATS b={b} x={x} />
            <line x1={x} y1={374} x2={x} y2={460} className={live(st.on[b])} />
          </g>
        );
      })}
      {/* non-essential: on the normal bus, plus a load-managed tie to the generators */}
      <line x1={branchX.nonEss} y1={200} x2={branchX.nonEss} y2={460} className={live(st.on.nonEss)} />
      <text x={branchX.nonEss + 8} y={300} className="hp-lab">load manager</text>
      {/* UPS on the critical branch */}
      <g className="hp-ups">
        <rect x={branchX.critical + 40} y={410} width={70} height={34} rx={2} />
        <text x={branchX.critical + 75} y={432}>UPS {Math.round(st.ups * 100)} %</text>
      </g>
      {/* branch panels */}
      {BRANCHES.map((b) => {
        const x = branchX[b.id];
        return (
          <g key={b.id} className={`hp-panel ${st.on[b.id] ? 'on' : ''}`}>
            <rect x={x - 80} y={460} width={160} height={60} rx={2} style={{ stroke: b.colour }} />
            <text x={x} y={486} className="hp-pname">{b.label}</text>
            <text x={x} y={506} className="hp-pstate">{st.on[b.id] ? 'supplied' : 'off'}</text>
          </g>
        );
      })}
    </svg>
  );
}

function DaysChart({ days, t, o }: { days: ReturnType<typeof threeDays>; t: number; o: HospitalOpts }) {
  const W = 1000, H = 90;
  const pts = days.mins.filter((_, i) => i % 20 === 0).map((m) => `${(m.t / 72) * W},${H - m.fuel * H}`).join(' ');
  return (
    <div className="hp-days">
      <span className="hp-lab2">Fuel in the bulk tank over 72 hours</span>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <rect x={0} y={0} width={(Math.min(o.duration, 72) / 72) * W} height={H} className="hp-out" />
        <polyline points={pts} className="hp-fuel" />
        <line x1={(t / 72) * W} x2={(t / 72) * W} y1={0} y2={H} className="cy-head" />
      </svg>
      <span className="hp-lab2">shaded: grid out ({o.duration} h)</span>
    </div>
  );
}
