import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RegionSim, loadRegion } from '../grid/region';
import { fdlf, branchFlows, type ACBranch } from '../grid/acflow';
import { surrogateBase, isSync, loadSurrogate, predictFlow, dcLoading, type Surrogate, type SurrogateSpec, type Scores } from '../ai/surrogate';
import '../plants.css';
import '../city.css';
import '../forecast.css';
import '../surrogate.css';

const GRIDS = [
  { id: 'dhaka', name: 'Dhaka' },
  { id: 'adelaide', name: 'South Australia' },
  { id: 'london', name: 'London' },
];

type Base = ReturnType<typeof surrogateBase> & { served0: number[]; gp0: number[] };
type Case = { V: Float32Array | Float64Array; loading: Float32Array | number[]; ok: boolean; ms: number };

/** Set the operating point: every load and every machine scaled together. */
function operate(b: Base, scale: number) {
  b.m.forEach((bus, i) => { b.s.buses[bus].served = b.served0[i] * scale; });
  b.s.gens.forEach((g, i) => { if (g.online && isSync(g.def.kind)) g.p = Math.min(g.avail, b.gp0[i] * scale); });
  const pr = b.s.islandProblem(b.m)!;
  return { pr, P: pr.acb.map((x) => x.P), Q: pr.acb.map((x) => x.Q) };
}

function exact(b: Base, pr: ReturnType<Base['s']['islandProblem']> & object, out: number, mva: number[]): Case {
  const t = performance.now();
  const br: ACBranch[] = pr.acbr.map((x, j) => ({ ...x, closed: j !== out }));
  const res = fdlf(pr.acb, br, { V0: b.V0, theta0: b.th0, maxIter: 60, tol: 6e-4 });
  const loading = br.map((x, j) => {
    if (!x.closed || !res.converged) return 0;
    const f = branchFlows(x, res.V, res.theta);
    return (Math.hypot(f.P, f.Q) * 100) / Math.max(0.3, res.V[x.from]) / mva[j];
  });
  return { V: res.V, loading, ok: res.converged, ms: performance.now() - t };
}

function learned(sur: Surrogate, P: number[], Q: number[], out: number): Case & { pSolve: number } {
  const t = performance.now();
  const p = predictFlow(sur, P, Q, out);
  return { V: p.V, loading: p.loading, ok: p.pSolve > 0.5, pSolve: p.pSolve, ms: performance.now() - t };
}

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)} %`;
const tone = (l: number) => (l > 1 ? 'var(--trip)' : l > 0.8 ? 'var(--sodium)' : l > 0.5 ? 'var(--glaze)' : 'rgba(139,154,176,0.55)');

export default function SurrogatePage() {
  const [gid, setGid] = useState('dhaka');
  const [base, setBase] = useState<Base | null>(null);
  const [sur, setSur] = useState<Surrogate | null>(null);
  const [scale, setScale] = useState(1);
  const [out, setOut] = useState(-1);
  const [sweep, setSweep] = useState<{ rows: { k: number; sMax: number; eMax: number; sOv: number; eOv: number }[]; sMs: number; eMs: number; dcMs: number } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let dead = false;
    setBase(null); setSur(null); setOut(-1); setSweep(null); setErr('');
    Promise.all([loadRegion(gid), fetch(`/data/surrogate/${gid}.json`).then((r) => r.json() as Promise<SurrogateSpec>)])
      .then(([data, spec]) => {
        if (dead) return;
        const b = surrogateBase(new RegionSim(data, { loadScale: 0.9 }));
        setBase({ ...b, served0: b.m.map((x) => b.s.buses[x].served), gp0: b.s.gens.map((g) => g.p) });
        setSur(loadSurrogate(spec));
      })
      .catch((e) => !dead && setErr(String(e)));
    return () => { dead = true; };
  }, [gid]);

  const run = useMemo(() => {
    if (!base || !sur) return null;
    const { pr, P, Q } = operate(base, scale);
    const e = exact(base, pr, out, sur.spec.mva);
    const s = learned(sur, P, Q, out);
    // time the network over many repeats: a single call is below the timer's resolution
    const t = performance.now(); for (let r = 0; r < 50; r++) predictFlow(sur, P, Q, out); s.ms = (performance.now() - t) / 50;
    const t2 = performance.now(); for (let r = 0; r < 10; r++) exact(base, pr, out, sur.spec.mva); e.ms = (performance.now() - t2) / 10;
    let vErr = 0, lErr = 0, nl = 0;
    for (let i = 0; i < sur.spec.n; i++) vErr = Math.max(vErr, Math.abs(s.V[i] - e.V[i]));
    for (let j = 0; j < sur.spec.L; j++) if (j !== out) { lErr += Math.abs(s.loading[j] - e.loading[j]); nl++; }
    return { e, s, vErr, lErr: lErr / nl, P };
  }, [base, sur, scale, out]);

  const screen = () => {
    if (!base || !sur) return;
    const { pr, P, Q } = operate(base, scale);
    const cand = sur.spec.cand;
    let t = performance.now();
    const S = cand.map((k) => predictFlow(sur, P, Q, k));
    const sMs = performance.now() - t;
    t = performance.now();
    cand.forEach((k) => dcLoading(sur, P, k));
    const dcMs = performance.now() - t;
    t = performance.now();
    const E = cand.map((k) => exact(base, pr, k, sur.spec.mva));
    const eMs = performance.now() - t;
    const rows = cand.map((k, i) => {
      const sl = Array.from(S[i].loading), el = E[i].loading as number[];
      return { k, sMax: Math.max(...sl), eMax: E[i].ok ? Math.max(...el) : NaN, sOv: sl.filter((x) => x > 1).length, eOv: el.filter((x) => x > 1).length };
    }).sort((a, b) => b.eMax - a.eMax);
    setSweep({ rows, sMs, eMs, dcMs });
  };

  // map geometry
  const geo = useMemo(() => {
    if (!base || !sur) return null;
    const pts = base.m.map((b) => base.s.buses[b].def);
    const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const W = 1000, H = Math.max(420, Math.min(760, (W * (z1 - z0)) / Math.max(1, x1 - x0)));
    const sx = (x: number) => 20 + ((x - x0) / Math.max(1e-6, x1 - x0)) * (W - 40);
    const sz = (z: number) => 20 + ((z - z0) / Math.max(1e-6, z1 - z0)) * (H - 40);
    const lines = sur.spec.branches.map((bi, j) => {
      const d = base.s.branches[bi].def, a = base.s.buses[d.a].def, b = base.s.buses[d.b].def;
      return { j, x1: sx(a.x), y1: sz(a.z), x2: sx(b.x), y2: sz(b.z), kv: d.kv, name: base.s.branchName(bi) };
    });
    return { W, H, lines, buses: pts.map((p) => ({ x: sx(p.x), y: sz(p.z), kv: p.kv, name: p.name })) };
  }, [base, sur]);

  const M = sur?.spec.metrics;
  const cand = useMemo(() => new Set(sur?.spec.cand ?? []), [sur]);
  const held = useMemo(() => new Set(M?.held_out_lines ?? []), [M]);
  const worst = run ? Math.max(0, ...Array.from(run.e.loading)) : 0;

  return (
    <main id="main" className="page fc-page sg-page">
      <header className="fr-head fc-head">
        <p className="pv-kicker">Real grids · Machine learning</p>
        <h1>The load flow, learned</h1>
        <p>Every few minutes a control room asks the same question: if any one line failed now, would anything else overload? Answering it means solving the AC power flow once per line. Here a small neural network answers it instead, in a fraction of a millisecond, and the exact solver runs beside it so you can see every place it is right or wrong. It starts from the classic DC estimate and learns only the correction to it.</p>
      </header>

      <div className="sg-bar">
        <div className="pv-seg" role="tablist" aria-label="Grid">
          {GRIDS.map((g) => <button key={g.id} role="tab" aria-selected={gid === g.id} className={gid === g.id ? 'on' : ''} onClick={() => setGid(g.id)}>{g.name}</button>)}
        </div>
        <label className="sg-slider">
          <span>System load <b>{Math.round(scale * 100)} %</b> of the base case</span>
          <input type="range" min={0.6} max={1.4} step={0.01} value={scale} onChange={(e) => { setScale(Number(e.target.value)); setSweep(null); }} />
        </label>
      </div>

      {err && <p className="cy-hint warn">Could not load this grid: {err}</p>}
      {!geo && !err && <p className="cy-hint">Loading the grid and its trained network…</p>}

      {geo && run && sur && (
        <section className="sg-stage">
          <figure className="sg-map">
            <svg viewBox={`0 0 ${geo.W} ${geo.H}`} role="img" aria-label="Grid map: line colour is loading, click a line to take it out">
              {geo.lines.map((l) => {
                const ld = run.s.loading[l.j], isOut = l.j === out, ok = cand.has(l.j);
                return (
                  <g key={l.j} className={`sg-line${ok ? ' can' : ''}${isOut ? ' out' : ''}`} onClick={() => ok && setOut(isOut ? -1 : l.j)}>
                    <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className="hit" />
                    <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={isOut ? 'var(--trip)' : tone(ld)} strokeWidth={l.kv >= 300 ? 3.2 : 2} strokeDasharray={isOut ? '6 5' : undefined} />
                    <title>{l.name}: {isOut ? 'taken out' : `${pct(ld, 0)} (exact ${pct(run.e.loading[l.j] as number, 0)})`}{!ok ? ' · its loss would split the grid' : held.has(l.j) ? ' · never taken out in training' : ''}</title>
                  </g>
                );
              })}
              {geo.buses.map((b, i) => {
                const v = run.s.V[i];
                return <circle key={i} cx={b.x} cy={b.y} r={b.kv >= 300 ? 4.5 : 3} className="sg-bus" fill={v < 0.95 ? 'var(--trip)' : v > 1.05 ? 'var(--arc)' : 'var(--porcelain)'}><title>{b.name}: {v.toFixed(3)} pu (exact {(run.e.V[i] as number).toFixed(3)})</title></circle>;
              })}
            </svg>
            <figcaption>
              <ul className="fc-legend">
                <li><i style={{ background: 'rgba(139,154,176,0.55)' }} />under 50 %</li>
                <li><i style={{ background: 'var(--glaze)' }} />50–80 %</li>
                <li><i style={{ background: 'var(--sodium)' }} />80–100 %</li>
                <li><i style={{ background: 'var(--trip)' }} />overloaded</li>
                <li className="fc-scale">Click a line to take it out. Colours are the network’s answer; hover for the exact one.</li>
              </ul>
            </figcaption>
          </figure>

          <aside className="sg-side">
            <h2>{out < 0 ? 'Intact grid' : `Out: ${geo.lines[out].name}`}</h2>
            {out >= 0 && held.has(out) && <p className="sg-flag">This line was never taken out during training. The network has to generalise.</p>}
            <dl className="sg-vs">
              <div><dt>Neural network</dt><dd>{run.s.ms < 1 ? `${(run.s.ms * 1000).toFixed(0)} µs` : `${run.s.ms.toFixed(2)} ms`}</dd></div>
              <div><dt>Exact AC load flow</dt><dd>{run.e.ms.toFixed(2)} ms</dd></div>
            </dl>
            {run.e.ok ? (
              <ul className="sg-err">
                <li><span>Largest voltage error</span><b>{run.vErr.toFixed(4)} pu</b></li>
                <li><span>Mean loading error</span><b>{pct(run.lErr, 2)}</b></li>
                <li><span>Most loaded line</span><b>{pct(Math.max(...Array.from(run.s.loading)), 0)} <small>exact {pct(worst, 0)}</small></b></li>
                <li><span>Overloaded lines</span><b>{Array.from(run.s.loading).filter((x) => x > 1).length} <small>exact {(run.e.loading as number[]).filter((x) => x > 1).length}</small></b></li>
              </ul>
            ) : (
              <p className="cy-hint warn">The exact load flow does not solve here: the grid cannot carry this point (voltage collapse). The network gives it a {pct(run.s.pSolve, 0)} chance of solving.</p>
            )}
            <button className="pv-cut sg-go" onClick={screen}>Screen every N-1 case</button>
          </aside>
        </section>
      )}

      {sweep && sur && geo && (
        <section className="fc-block">
          <h2>N-1 screening: {sweep.rows.length} contingencies</h2>
          <dl className="fc-scores fc-small">
            <div className="ours"><dt>Neural network</dt><dd>{sweep.sMs.toFixed(1)} ms</dd><small>all cases, in this browser</small></div>
            <div><dt>Exact AC load flow</dt><dd>{sweep.eMs.toFixed(0)} ms</dd><small>{(sweep.eMs / Math.max(0.01, sweep.sMs)).toFixed(0)}× slower</small></div>
            <div><dt>DC screening</dt><dd>{sweep.dcMs.toFixed(1)} ms</dd><small>fast, but ignores voltage and reactive power</small></div>
            <div><dt>Same worst case</dt><dd>{sweep.rows.slice(0, 5).filter((r) => r.sMax > 1 === r.eMax > 1).length}/5</dd><small>top five: overload flagged by both</small></div>
          </dl>
          <ol className="sg-rank">
            {sweep.rows.slice(0, 8).map((r) => (
              <li key={r.k}>
                <button onClick={() => setOut(r.k)}>{geo.lines[r.k].name}</button>
                <span className="bar"><i style={{ width: `${Math.min(100, (r.eMax / 1.6) * 100)}%` }} /><em style={{ left: `${Math.min(100, (r.sMax / 1.6) * 100)}%` }} /></span>
                <b>{Number.isNaN(r.eMax) ? 'does not solve' : pct(r.eMax, 0)}</b>
                <small>net {pct(r.sMax, 0)}</small>
              </li>
            ))}
          </ol>
          <p className="fc-p">Worst line loading after each contingency. The bar is the exact answer; the tick is the network’s.</p>
        </section>
      )}

      {M && sur && <Results m={M} n={sur.spec.samples} />}

      <section className="fc-block fc-notes">
        <h2>How it was built, and where it stops</h2>
        <ul>
          <li>Training cases come from the same simulator as the rest of this site. The grid is settled once. Then each case redraws the load level (55–145 %), every bus’s load, every plant’s output and the solar and wind output. In three cases out of four it takes out one line. The fast decoupled load flow labels each case: {num0(sur?.spec.samples ?? 30000)} per grid.</li>
          <li>The network sees the bus injections and, for the outage, only the DC post-contingency loadings from PTDF and LODF factors, never the line’s identity. It predicts every voltage and the AC correction to every DC loading. This is what lets it handle outages it never saw. A version given a one-hot code of the line memorises line identities instead, and does worse on new ones.</li>
          <li>One fifth of the lines were never taken out in training. They are scored separately, as the “unseen” test.</li>
          <li>Lines whose loss would split the grid are left out. Islanding is a topology question, and the cascade model handles it.</li>
          <li>Limits: one fixed base topology per grid (no double outages yet), and voltages are less accurate for unseen outages than loadings are. The “will it solve at all” output does not generalise to unseen outages either (AUC about 0.5). Near voltage collapse, keep the exact solver.</li>
        </ul>
        <p className="fc-p">See also: <Link to="/predictor">the blackout predictor</Link> and <Link to="/forecast">the demand forecaster</Link>.</p>
      </section>
    </main>
  );
}

const num0 = (x: number) => x.toLocaleString('en-GB');

function Results({ m, n }: { m: NonNullable<SurrogateSpec['metrics']>; n: number }) {
  const ROWS: [string, string][] = [['surrogate', 'Neural network, DC physics + learned correction'], ['black_box_one_hot', 'Neural network, line identity (black box)'], ['ridge', 'Linear regression on the same inputs'], ['dc_screening', 'DC screening (industry shortcut)'], ['mean_state', 'No model: the average state']];
  const cell = (s: Scores | undefined, k: string, f: (x: number) => string) => (s && k in s ? f(s[k]) : '—');
  return (
    <section className="fc-block">
      <h2>How good is it? Tested on cases it never saw</h2>
      <p className="fc-p">Trained on {num0(Math.round(n * 0.72))} cases, then tested two ways. “New cases” are new operating points with outages it has seen before. “New outages” are lines it never saw taken out.</p>
      <div className="sg-table" role="table">
        <div className="sg-tr sg-th" role="row"><span>Method</span><span>Voltage error<small>new cases</small></span><span>Loading error<small>new cases</small></span><span>Loading error<small>new outages</small></span><span>Overloads caught<small>new outages</small></span></div>
        {ROWS.map(([k, label]) => {
          const a = m.random[k] as Scores | undefined, b = m.unseen_contingency[k] as Scores | undefined;
          return (
            <div key={k} className={`sg-tr${k === 'surrogate' ? ' ours' : ''}`} role="row">
              <span>{label}</span>
              <span>{cell(a, 'V_MAE_pu', (x) => `${x.toFixed(4)} pu`)}</span>
              <span>{cell(a, 'loading_MAE_pct', (x) => `${x.toFixed(2)} %`)}</span>
              <span>{cell(b, 'loading_MAE_pct', (x) => `${x.toFixed(2)} %`)}</span>
              <span>{b && 'overloads' in b && b.overloads === 0 ? 'none occur' : cell(b, 'overload_recall', (x) => `${(x * 100).toFixed(0)} %`)}</span>
            </div>
          );
        })}
      </div>
      <p className="fc-p">Mean absolute errors; loading as a percentage of the line rating. Speed in Python on one CPU core: {m.speed.surrogate_cpu_ms.toFixed(2)} ms per case against {m.speed.fdlf_ms.toFixed(2)} ms for the load flow. The whole N-1 set takes {m.speed.n1_sweep_cpu_ms.toFixed(1)} ms in one batch against {m.speed.n1_sweep_fdlf_ms.toFixed(0)} ms.</p>
    </section>
  );
}
