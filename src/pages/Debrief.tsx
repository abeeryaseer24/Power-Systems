import { Link } from 'react-router-dom';
import { lastRun } from '../lib/runStore';
import { clock, euro, num } from '../lib/format';
import type { Sample } from '../grid/engine';

const GROUPS: { key: string; label: string; color: string; of: (s: Sample) => number }[] = [
  { key: 'nuclear', label: 'Nuclear', color: '#b9a6f2', of: (s) => s.byKind.nuclear },
  { key: 'coal', label: 'Coal', color: '#8f8a80', of: (s) => s.byKind.coal },
  { key: 'gas', label: 'Gas', color: '#f08a5d', of: (s) => s.byKind.ccgt + s.byKind.ocgt },
  { key: 'hydro', label: 'Hydro', color: '#4fa3d1', of: (s) => Math.max(0, s.byKind.hydro) },
  { key: 'wind', label: 'Wind', color: '#a7e0ea', of: (s) => s.byKind.wind },
  { key: 'solar', label: 'Solar and rooftop', color: '#ffd166', of: (s) => s.byKind.solar + s.byKind.rooftop },
  { key: 'other', label: 'Battery and imports', color: '#7fd1a8', of: (s) => Math.max(0, s.byKind.battery) + Math.max(0, s.byKind.link) },
];

const VERDICT: Record<string, string> = {
  S: 'Textbook. The grid never noticed the trouble you were managing.',
  A: 'A clean shift. Frequency stayed tight and the lights stayed on.',
  B: 'Solid, with a few rough moments a reviewer would ask about.',
  C: 'The city got through, but customers noticed.',
  D: 'A shift the incident report will be written about.',
};

export default function Debrief() {
  const run = lastRun();
  if (!run) {
    return (
      <main id="main" className="page">
        <div className="page-head">
          <h1>No shift to review yet</h1>
          <p>Finish a shift in the control room and its debrief appears here.</p>
        </div>
        <Link className="btn primary" to="/shifts">Choose a shift</Link>
      </main>
    );
  }
  const s = run.score;
  const h = run.history;
  return (
    <main id="main" className="page debrief">
      <header className="db-head">
        <div className={`db-grade g-${s.grade}`} aria-label={`Grade ${s.grade}`}>{s.grade}</div>
        <div>
          <span className="brief-meta">{run.title}, {clock(run.startHour)} to {clock(run.endHour)}{run.finishedEarly ? ', ended early' : ''}</span>
          <h1>{num(s.points)} points</h1>
          <p>{VERDICT[s.grade]}</p>
        </div>
      </header>

      <section className="db-stats" aria-label="Shift results">
        <Stat label="Demand served" value={`${(s.reliability * 100).toFixed(2)} %`} note={`${num(s.unservedMWh, 1)} MWh unserved`} bad={s.reliability < 0.995} />
        <Stat label="Time in 49.8–50.2 Hz" value={`${(s.inBand * 100).toFixed(1)} %`} note={`Lowest ${s.fMin.toFixed(2)} Hz, highest ${s.fMax.toFixed(2)} Hz`} bad={s.inBand < 0.95} />
        <Stat label="Average cost" value={`€${num(s.avgCost)}/MWh`} note={`${euro(s.cost)} for the shift`} />
        <Stat label="Carbon intensity" value={`${num(s.co2Intensity)} g/kWh`} note={`${num(s.co2)} t of CO₂`} />
        <Stat label="Blackouts" value={String(s.blackouts)} note={s.blackouts ? 'Islands or the whole system collapsed' : 'None'} bad={s.blackouts > 0} />
      </section>

      {h.length > 2 && (
        <>
          <section className="db-chart">
            <h2>Where the power came from</h2>
            <MixChart h={h} />
            <ul className="legend">
              {GROUPS.map((g) => <li key={g.key}><i style={{ background: g.color }} />{g.label}</li>)}
              <li><i className="lg-line" />Demand</li>
            </ul>
          </section>
          <section className="db-chart">
            <h2>Frequency, minute by minute</h2>
            <FreqChart h={h} />
            <p className="muted">The band shows the lowest and highest frequency in each minute. The shaded strip is the operational limit of 49.8 to 50.2 Hz.</p>
          </section>
        </>
      )}

      {run.events.length > 0 && (
        <section className="db-events">
          <h2>What happened</h2>
          <ol>
            {run.events.map((e, i) => (
              <li key={i} className={`ev-${e.severity}`}>
                <time>{clock(e.t / 3600, true)}</time>
                <div>
                  <strong>{e.title}</strong>
                  <p>{e.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="db-cta">
        <Link className="btn primary" to={`/control/${run.scenarioId}`}>Run this shift again</Link>
        <Link className="btn ghost" to="/shifts">Choose another shift</Link>
      </div>
    </main>
  );
}

function Stat({ label, value, note, bad }: { label: string; value: string; note: string; bad?: boolean }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong className={bad ? 'bad' : ''}>{value}</strong>
      <em>{note}</em>
    </div>
  );
}

const W = 900;
const H = 280;
const PL = 46;
const PB = 26;

function axes(t0: number, t1: number, maxV: number, unit: (v: number) => string, step: number) {
  const X = (t: number) => PL + ((t - t0) / (t1 - t0)) * (W - PL - 8);
  const Y = (v: number) => 8 + (1 - v / maxV) * (H - PB - 8);
  const hs = t1 - t0 > 12 ? 3 : t1 - t0 > 6 ? 2 : 1;
  const ticks: number[] = [];
  for (let t = Math.ceil(t0); t <= t1; t += hs) ticks.push(t);
  const grid: number[] = [];
  for (let v = 0; v <= maxV + 1e-9; v += step) grid.push(v);
  const el = (
    <g className="axes">
      {grid.map((v) => (
        <g key={v}>
          <line x1={PL} x2={W - 8} y1={Y(v)} y2={Y(v)} />
          <text x={PL - 8} y={Y(v) + 4} textAnchor="end">{unit(v)}</text>
        </g>
      ))}
      {ticks.map((t) => <text key={t} x={X(t)} y={H - 6} textAnchor="middle">{clock(t)}</text>)}
    </g>
  );
  return { X, Y, el };
}

function MixChart({ h }: { h: Sample[] }) {
  const t0 = h[0].t;
  const t1 = h[h.length - 1].t;
  const maxV = Math.ceil((Math.max(...h.map((s) => Math.max(s.demand, GROUPS.reduce((a, g) => a + g.of(s), 0)))) * 1.05) / 500) * 500;
  const { X, Y, el } = axes(t0, t1, maxV, (v) => `${v / 1000} GW`, maxV > 3000 ? 1000 : 500);
  const base = h.map(() => 0);
  const areas = GROUPS.map((g) => {
    const top = h.map((s, i) => base[i] + g.of(s));
    const d = `M${h.map((s, i) => `${X(s.t)},${Y(top[i])}`).join(' L')} L${h.map((_s, i) => `${X(h[h.length - 1 - i].t)},${Y(base[h.length - 1 - i])}`).join(' L')} Z`;
    top.forEach((v, i) => (base[i] = v));
    return <path key={g.key} d={d} fill={g.color} opacity={0.85} />;
  });
  const demand = `M${h.map((s) => `${X(s.t)},${Y(s.demand)}`).join(' L')}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Stacked generation by source with demand">
      {el}
      {areas}
      <path d={demand} className="demand-line" />
    </svg>
  );
}

function FreqChart({ h }: { h: Sample[] }) {
  const t0 = h[0].t;
  const t1 = h[h.length - 1].t;
  const lo = Math.min(49.4, ...h.filter((s) => s.fMin > 0).map((s) => s.fMin)) - 0.05;
  const hi = Math.max(50.6, ...h.map((s) => s.fMax)) + 0.05;
  const span = hi - lo;
  const X = (t: number) => PL + ((t - t0) / (t1 - t0)) * (W - PL - 8);
  const Y = (f: number) => 8 + (1 - (f - lo) / span) * (H - PB - 8);
  const live = h.filter((s) => s.fMin > 0);
  const band = live.length
    ? `M${live.map((s) => `${X(s.t)},${Y(s.fMax)}`).join(' L')} L${[...live].reverse().map((s) => `${X(s.t)},${Y(s.fMin)}`).join(' L')} Z`
    : '';
  const ticks = [49, 49.5, 50, 50.5, 51].filter((f) => f > lo && f < hi);
  const hs = t1 - t0 > 12 ? 3 : t1 - t0 > 6 ? 2 : 1;
  const tt: number[] = [];
  for (let t = Math.ceil(t0); t <= t1; t += hs) tt.push(t);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Frequency envelope per minute">
      <rect x={PL} width={W - PL - 8} y={Y(50.2)} height={Y(49.8) - Y(50.2)} className="op-band" />
      <g className="axes">
        {ticks.map((f) => (
          <g key={f}>
            <line x1={PL} x2={W - 8} y1={Y(f)} y2={Y(f)} />
            <text x={PL - 8} y={Y(f) + 4} textAnchor="end">{f.toFixed(1)}</text>
          </g>
        ))}
        {tt.map((t) => <text key={t} x={X(t)} y={H - 6} textAnchor="middle">{clock(t)}</text>)}
      </g>
      <path d={band} className="f-band" />
      {h.filter((s) => s.fMin <= 0).map((s, i) => <rect key={i} x={X(s.t) - 1} width={3} y={8} height={H - PB - 8} className="dead" />)}
    </svg>
  );
}
