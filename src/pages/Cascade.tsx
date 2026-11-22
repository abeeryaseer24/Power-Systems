import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RegionSim, loadRegion, type RegionData } from '../grid/region';
import { snapshot, snapshotBranches, loadGnn, predictCascade, type Gnn, type GnnSpec, type GnnResults, type Scores } from '../ai/cascade';
import '../plants.css';
import '../city.css';
import '../forecast.css';
import '../surrogate.css';
import '../dispatch.css';
import '../cascade.css';

type Region = { id: string; city: string; country: string; freq: number; buses: number };
type Truth = { lost: number; busLost: number[]; ms: number; events: number };
const UFLS = 0.65, RESPONSE = 0.25;

/** A fresh, settled simulator for this grid and load level (the same every time). */
function settled(data: RegionData, load: number) {
  const s = new RegionSim(structuredClone(data), { loadScale: load });
  s.uflsWorks = UFLS; s.responseShare = RESPONSE;
  s.advance(4);
  return s;
}

const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)} %`;
const lossColour = (p: number) => `color-mix(in oklab, var(--trip) ${Math.round(p * 100)}%, #3a4a60)`;

export default function Cascade() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [rid, setRid] = useState('dhaka');
  const [data, setData] = useState<RegionData | null>(null);
  const [net, setNet] = useState<Gnn | null>(null);
  const [res, setRes] = useState<GnnResults | null>(null);
  const [load, setLoad] = useState(1);
  const [trip, setTrip] = useState<number[]>([]);
  const [plant, setPlant] = useState(false);
  const [tie, setTie] = useState(false);
  const [truth, setTruth] = useState<Truth | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/data/regions/index.json').then((r) => r.json()).then(setRegions).catch(() => {});
    fetch('/data/cascade/gnn.json').then((r) => r.json() as Promise<GnnSpec>).then((spec) => { setNet(loadGnn(spec)); setRes(spec.results ?? null); }).catch(() => {});
  }, []);
  useEffect(() => { setData(null); setTrip([]); setTruth(null); loadRegion(rid).then(setData).catch(() => {}); }, [rid]);
  useEffect(() => setTruth(null), [trip, plant, tie, load]);

  const base = useMemo(() => (data ? settled(data, load) : null), [data, load]);
  const view = useMemo(() => {
    if (!base) return null;
    const sn = snapshot(base), idx = snapshotBranches(base);
    // the largest online plant, if the user takes it out
    const big = base.gens.map((g, i) => ({ g, i })).filter((y) => y.g.online).sort((a, b) => b.g.p - a.g.p)[0];
    const busTrip = new Array(base.buses.length).fill(0);
    if (plant && big) busTrip[big.g.def.bus] += big.g.p / 100;
    const edgeTrip = idx.map((i) => (trip.includes(i) ? 1 : 0));
    const xs = base.buses.map((b) => b.def.x), zs = base.buses.map((b) => b.def.z);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const W = 1000, H = Math.max(420, Math.min(760, (W * (z1 - z0)) / Math.max(1, x1 - x0)));
    const sx = (x: number) => 20 + ((x - x0) / Math.max(1e-6, x1 - x0)) * (W - 40), sz = (z: number) => 20 + ((z - z0) / Math.max(1e-6, z1 - z0)) * (H - 40);
    return { sn, idx, big, busTrip, edgeTrip, W, H, sx, sz };
  }, [base, trip, plant]);

  const pred = useMemo(() => {
    if (!net || !view || !data) return null;
    const t = performance.now();
    const p = predictCascade(net, view.sn, view.edgeTrip, view.busTrip, tie ? 1 : 0, data.freq);
    return { ...p, ms: performance.now() - t };
  }, [net, view, tie, data]);

  const simulate = () => {
    if (!data || !view) return;
    setBusy(true);
    setTimeout(() => {
      const t = performance.now();
      const s = settled(data, load);
      const d0 = Math.max(1, s.demand), live0 = s.buses.map((b) => (b.live ? b.served : 0));
      trip.forEach((i, j) => s.tripBranch(i, 'contingency', j > 0));
      if (plant && view.big) s.tripGen(view.big.i, 'contingency');
      if (tie) s.tripExt('contingency');
      s.advance(90);
      setTruth({
        lost: 1 - s.served / d0, ms: performance.now() - t, events: s.events.length,
        busLost: s.buses.map((b, i) => (live0[i] > 0.5 ? Math.min(1, Math.max(0, 1 - (b.live ? b.served : 0) / live0[i])) : 0)),
      });
      setBusy(false);
    }, 30);
  };

  const fold = res?.splits.unseen.folds.find((f) => f.held_out.includes(rid));
  const region = regions.find((r) => r.id === rid);
  const nothing = !trip.length && !plant && !tie;

  return (
    <main id="main" className="page fc-page sg-page cc-page">
      <header className="fr-head fc-head">
        <p className="pv-kicker">Real grids · Machine learning</p>
        <h1>Where will the cascade go?</h1>
        <p>Take out a few lines on a real transmission grid and a graph neural network says, in milliseconds, how much of the load will be lost and which substations go dark. It reads the grid the way an engineer reads a single-line diagram: buses, lines, flows and the fault. The full simulator then plays the next 90 seconds out (protection, frequency, load shedding) so you can see whether it was right.</p>
      </header>

      <div className="sg-bar">
        <label className="cc-pick">
          <span>Grid</span>
          <select value={rid} onChange={(e) => setRid(e.target.value)}>
            {regions.map((r) => <option key={r.id} value={r.id}>{r.city}, {r.country}</option>)}
          </select>
        </label>
        <label className="sg-slider">
          <span>Load <b>{Math.round(load * 100)} %</b> of a normal peak</span>
          <input type="range" min={0.75} max={1.2} step={0.01} value={load} onChange={(e) => setLoad(Number(e.target.value))} />
        </label>
        <div className="cc-toggles">
          <label><input type="checkbox" checked={plant} onChange={(e) => setPlant(e.target.checked)} /> Lose the largest plant{view?.big ? ` (${view.big.g.def.name}, ${Math.round(view.big.g.p)} MW)` : ''}</label>
          {data && <label><input type="checkbox" checked={tie} onChange={(e) => setTie(e.target.checked)} /> Lose the link to {data.ext.name}</label>}
        </div>
      </div>

      {(!view || !net) && <p className="cy-hint">Loading the grid and the trained network…</p>}
      {view && net && pred && base && (
        <section className="sg-stage">
          <figure className="sg-map">
            <svg viewBox={`0 0 ${view.W} ${view.H}`} role="img" aria-label="Grid map: click lines to take them out; bus colour is the predicted chance of losing supply">
              {view.idx.map((bi, j) => {
                const d = base.branches[bi].def, a = base.buses[d.a].def, b = base.buses[d.b].def, on = trip.includes(bi);
                return (
                  <g key={bi} className={`sg-line can${on ? ' out' : ''}`} onClick={() => setTrip(on ? trip.filter((t) => t !== bi) : trip.length < 4 ? [...trip, bi] : trip)}>
                    <line x1={view.sx(a.x)} y1={view.sz(a.z)} x2={view.sx(b.x)} y2={view.sz(b.z)} className="hit" />
                    <line x1={view.sx(a.x)} y1={view.sz(a.z)} x2={view.sx(b.x)} y2={view.sz(b.z)} stroke={on ? 'var(--trip)' : base.branches[bi].loading > 0.8 ? 'var(--sodium)' : 'rgba(139,154,176,0.6)'} strokeWidth={d.kv >= 300 ? 3 : 1.8} strokeDasharray={on ? '6 5' : undefined} />
                    <title>{base.branchName(bi)}: {pct(base.branches[bi].loading)} loaded{on ? ' · taken out' : ''}</title>
                  </g>
                );
                void j;
              })}
              {base.buses.map((b, i) => (
                <g key={i}>
                  <circle cx={view.sx(b.def.x)} cy={view.sz(b.def.z)} r={b.def.kv >= 300 ? 5 : 3.6} fill={nothing ? 'var(--porcelain)' : lossColour(pred.busLoss[i])} className="sg-bus">
                    <title>{b.def.name}: {nothing ? 'no contingency yet' : `${pct(pred.busLoss[i])} chance of losing supply`}{truth ? ` · simulator: ${truth.busLost[i] > 0.5 ? 'lost' : 'kept'}` : ''}</title>
                  </circle>
                  {truth && truth.busLost[i] > 0.5 && <circle cx={view.sx(b.def.x)} cy={view.sz(b.def.z)} r={8} className="cc-truth" />}
                </g>
              ))}
            </svg>
            <figcaption>
              <ul className="fc-legend">
                <li><i style={{ background: '#3a4a60', height: 10 }} />bus expected to keep supply</li>
                <li><i style={{ background: 'var(--trip)', height: 10 }} />expected to lose it</li>
                <li><i className="k-truth" />lost in the simulator</li>
                <li className="fc-scale">Click up to four lines to take them out.</li>
              </ul>
            </figcaption>
          </figure>

          <aside className="sg-side">
            <h2>{nothing ? 'Choose a contingency' : `${trip.length} line${trip.length === 1 ? '' : 's'}${plant ? ' + plant' : ''}${tie ? ' + tie' : ''} out`}</h2>
            <dl className="sg-vs">
              <div><dt>Network says</dt><dd>{nothing ? '—' : pct(pred.lost)}</dd><small className="cc-sub">of load lost, in {pred.ms.toFixed(0)} ms</small></div>
              <div><dt>Simulator says</dt><dd>{truth ? pct(truth.lost) : '—'}</dd><small className="cc-sub">{truth ? `after 90 s, in ${(truth.ms / 1000).toFixed(1)} s` : 'not run yet'}</small></div>
            </dl>
            {!nothing && <p className={`cc-verdict ${pred.lost > (res ? 0.1 : 0.1) ? 'major' : ''}`}>{pred.lost > 0.1 ? 'Major event expected: more than 10 % of load lost.' : 'Contained: under 10 % of load lost expected.'}</p>}
            {truth && !nothing && (
              <ul className="sg-err">
                <li><span>Buses lost, simulator</span><b>{truth.busLost.filter((v) => v > 0.5).length}</b></li>
                <li><span>Buses the network flagged</span><b>{Array.from(pred.busLoss).filter((v) => v > 0.5).length}</b></li>
                <li><span>Agreed, bus by bus</span><b>{pct(truth.busLost.filter((v, i) => (v > 0.5) === (pred.busLoss[i] > 0.5)).length / truth.busLost.length)}</b></li>
                <li><span>Protection and control events</span><b>{truth.events}</b></li>
              </ul>
            )}
            <button className="pv-cut sg-go" disabled={nothing || busy} onClick={simulate}>{busy ? 'Simulating 90 seconds…' : 'Play it out in the simulator'}</button>
            {fold && <p className="cc-note">In the honest test, {region?.city} was hidden from training together with {fold.held_out.filter((g) => g !== rid).join(' and ')}. There the network’s load-loss error was {fold.gnn.MAE_pct.toFixed(1)} % and its bus-level AUC {fold.gnn.AUC_bus?.toFixed(2)}. The model on this page was then retrained on all grids.</p>}
          </aside>
        </section>
      )}

      {res && <Results r={res} names={Object.fromEntries(regions.map((g) => [g.id, g.city]))} />}

      <section className="fc-block fc-notes">
        <h2>How it was built, and where it stops</h2>
        <ul>
          <li>Training data comes from the simulator behind the blackout replays. Each case sets a load level, how well under-frequency load shedding works and how much generation follows frequency. It takes a snapshot of the grid, applies one to four line trips (biased toward loaded lines), sometimes a large plant or the external tie, and plays 90 seconds out. That gives {res ? res.n.toLocaleString('en-GB') : 'about 10,000'} cases on {res ? res.grids.length : 17} grids rebuilt from OpenStreetMap.</li>
          <li>The network passes messages along the lines six times, so a fault can “see” about six substations away. It predicts each bus’s chance of losing supply, and the share of load lost from a pooled summary plus a few hand-made screening numbers.</li>
          <li>The test that matters is grids it has never seen. Every grid is held out once, in six groups, and the model is trained on the rest. Dhaka and its metro sub-grid are always held out together, so nothing leaks.</li>
          <li>Labels come from a simulator, not from real blackouts, so this measures how well the network learns the simulator’s physics. It is not a forecast of real events. The simulator’s protection is simplified: no relay coordination studies, no operator actions inside the 90 seconds.</li>
        </ul>
        <p className="fc-p">See also: <Link to="/predictor">the blackout predictor</Link>, <Link to="/surrogate">the learned load flow</Link> and <Link to="/blackouts">the historical replays</Link>.</p>
      </section>
    </main>
  );
}

function Results({ r, names }: { r: GnnResults; names: Record<string, string> }) {
  const U = r.splits.unseen, R = r.splits.random;
  const row = (label: string, s: Scores | undefined, bus?: number, ours = false) => (
    <div className={`sg-tr${ours ? ' ours' : ''}`} role="row">
      <span>{label}</span>
      <span>{s ? `${s.MAE_pct.toFixed(1)} %` : '—'}</span>
      <span>{s ? s.AUC_major.toFixed(3) : '—'}</span>
      <span>{s ? s.spearman.toFixed(2) : '—'}</span>
      <span>{bus != null ? bus.toFixed(3) : '—'}</span>
    </div>
  );
  const sd = (s: Scores, k: string) => (s[`${k}_sd`] != null ? ` ± ${s[`${k}_sd`].toFixed(k === 'MAE_pct' ? 1 : 3)}` : '');
  return (
    <section className="fc-block">
      <h2>How good is it, on grids it has never seen?</h2>
      <p className="fc-p">{r.n.toLocaleString('en-GB')} cases on {r.grids.length} grids; {pct(r.major_share)} of them are major events (more than 10 % of load lost). Network results are the mean of {r.seeds} training seeds.</p>
      <dl className="fc-scores fc-small">
        <div className="ours"><dt>Load-loss error</dt><dd>{U.gnn.MAE_pct.toFixed(1)} %</dd><small>unseen grids{sd(U.gnn, 'MAE_pct')}; boosted trees {U.gbm.MAE_pct.toFixed(1)} %</small></div>
        <div className="ours"><dt>Major event, AUC</dt><dd>{U.gnn.AUC_major.toFixed(2)}</dd><small>unseen grids; boosted trees {U.gbm.AUC_major.toFixed(2)}</small></div>
        <div className="ours"><dt>Which bus, AUC</dt><dd>{U.gnn.AUC_bus?.toFixed(2)}</dd><small>unseen grids; best baseline {Math.max(U.node_baselines.hops, U.node_baselines.gbm).toFixed(2)}</small></div>
      </dl>
      <div className="sg-table cc-table" role="table">
        <div className="sg-tr sg-th" role="row"><span>Grids never seen in training</span><span>Load lost<small>mean error</small></span><span>Major event<small>AUC</small></span><span>Ranking<small>Spearman</small></span><span>Which bus<small>AUC</small></span></div>
        {row('Average loss (no model)', U.mean)}
        {row('Boosted trees on screening numbers', U.gbm)}
        {row('Distance from the fault, in hops', undefined, U.node_baselines.hops)}
        {row('Boosted trees, bus by bus', undefined, U.node_baselines.gbm)}
        {row('Graph neural network', U.gnn, U.gnn.AUC_bus, true)}
        {U.node_baselines.hybrid != null && row('Network and bus-level trees, averaged', undefined, U.node_baselines.hybrid)}
      </div>
      <div className="sg-table cc-table" role="table">
        <div className="sg-tr sg-th" role="row"><span>Same grids, new cases</span><span>Load lost<small>mean error</small></span><span>Major event<small>AUC</small></span><span>Ranking<small>Spearman</small></span><span>Which bus<small>AUC</small></span></div>
        {row('Average loss (no model)', R.mean)}
        {row('Boosted trees on screening numbers', R.gbm)}
        {row('Boosted trees, bus by bus', undefined, R.node_baselines.gbm)}
        {row('Graph neural network', R.gnn, R.gnn.AUC_bus, true)}
        {R.node_baselines.hybrid != null && row('Network and bus-level trees, averaged', undefined, R.node_baselines.hybrid)}
      </div>
      <h3 className="dp-h3">Grid by grid</h3>
      <ul className="cc-folds">
        {U.folds.map((f) => (
          <li key={f.held_out.join()}>
            <b>{f.held_out.map((g) => names[g] ?? g).join(', ')}</b>
            <span>network {f.gnn.MAE_pct.toFixed(1)} % error, bus AUC {f.gnn.AUC_bus?.toFixed(2)}</span>
            <span>trees {f.gbm.MAE_pct.toFixed(1)} %, bus AUC {f.node_baselines.gbm.toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <h3 className="dp-h3">What the study found</h3>
      <ul className="dp-find">
        <li><b>On grids it knows, the network is the best tool by a distance.</b> Its error on load lost is {R.gnn.MAE_pct.toFixed(1)} %, against {R.gbm.MAE_pct.toFixed(1)} % for boosted trees, and it picks the buses that go dark with an AUC of {R.gnn.AUC_bus?.toFixed(3)}.</li>
        <li><b>On grids it has never seen, it is the more robust judge of how big an event will be.</b> Error {U.gnn.MAE_pct.toFixed(1)} % against {U.gbm.MAE_pct.toFixed(1)} %, and major-event AUC {U.gnn.AUC_major.toFixed(2)} against {U.gbm.AUC_major.toFixed(2)}. On one group (New York, Istanbul, Colombo) the trees’ estimate falls apart while the network’s holds.</li>
        <li><b>Picking individual buses on a new grid is harder.</b> There, simple trees reading each bus’s own state score {U.node_baselines.gbm.toFixed(2)} against the network’s {U.gnn.AUC_bus?.toFixed(2)}, and averaging the two gives {U.node_baselines.hybrid?.toFixed(2) ?? '—'}. Regularisation (dropout, weight decay, fewer layers, shorter training) only narrowed the gap a little.</li>
        <li><b>Everything gets harder on unfamiliar grids.</b> Every method loses accuracy, which is why a model like this should be checked on the grid it will be used on before anyone trusts it.</li>
      </ul>
    </section>
  );
}
