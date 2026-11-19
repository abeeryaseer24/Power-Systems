import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { EVENTS, eventById, stageEvent } from '../grid/events';
import { loadRegion, RegionSim } from '../grid/region';
import { describe, explain, features, loadPredictor, predict, type PredictorModel } from '../ai/features';
import { num } from '../lib/format';
import '../predictor.css';

interface Point { t: number; f: number; p: number; served: number; x: number[] }
interface Result { id: string; points: Point[]; warnAt: number | null; collapseAt: number | null; f0: number }

async function evaluate(model: PredictorModel, id: string, onProgress?: (pts: Point[]) => void, alive = () => true): Promise<Result> {
  const ev = eventById(id)!;
  const data = await loadRegion(ev.region);
  const s = new RegionSim(data);
  stageEvent(s, ev, 'watch');
  const end = Math.min(ev.span, 420);
  const pts: Point[] = [];
  let warnAt: number | null = null;
  let collapseAt: number | null = null;
  await new Promise<void>((resolve) => {
    const chunk = () => {
      if (!alive()) return resolve();
      const t0 = performance.now();
      while (s.t < end && performance.now() - t0 < 12) {
        s.advance(2);
        const served = s.served / Math.max(1, s.demand);
        const x = features(s);
        const p = served < 0.5 ? 1 : predict(model, x);
        pts.push({ t: s.t, f: s.frequency, p, served, x });
        if (warnAt === null && p > 0.5 && served >= 0.5) warnAt = s.t;
        if (collapseAt === null && served < 0.5) collapseAt = s.t;
      }
      onProgress?.([...pts]);
      if (s.t < end) setTimeout(chunk, 0);
      else resolve();
    };
    chunk();
  });
  return { id, points: pts, warnAt, collapseAt, f0: s.f0 };
}

function RiskChart({ r, steps, at }: { r: Result; steps: number[]; at: number | null }) {
  const W = 900;
  const H = 300;
  const pl = 50;
  const pts = r.points;
  if (pts.length < 2) return <div className="pr-chart pending">Running the replay…</div>;
  const t1 = Math.max(60, pts[pts.length - 1].t);
  const X = (t: number) => pl + (t / t1) * (W - pl - 10);
  const Yp = (p: number) => 20 + (1 - p) * (H - 60);
  const fLo = r.f0 - 2.5;
  const fHi = r.f0 + 1;
  const Yf = (f: number) => 20 + (1 - (Math.max(fLo, Math.min(fHi, f)) - fLo) / (fHi - fLo)) * (H - 60);
  const area = `M${X(pts[0].t)},${Yp(0)} ${pts.map((q) => `L${X(q.t)},${Yp(q.p)}`).join(' ')} L${X(pts[pts.length - 1].t)},${Yp(0)} Z`;
  const fl = pts.filter((q) => q.f > 0).map((q, i) => `${i ? 'L' : 'M'}${X(q.t)},${Yf(q.f)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="pr-chart" role="img" aria-label="Predicted collapse risk and frequency over the event">
      <line x1={pl} x2={W - 10} y1={Yp(0.5)} y2={Yp(0.5)} className="pr-half" />
      <text x={pl - 6} y={Yp(1) + 4} className="pr-ax" textAnchor="end">100 %</text>
      <text x={pl - 6} y={Yp(0.5) + 4} className="pr-ax" textAnchor="end">50 %</text>
      <text x={pl - 6} y={Yp(0) + 4} className="pr-ax" textAnchor="end">0</text>
      {steps.map((t, i) => <line key={i} x1={X(t)} x2={X(t)} y1={16} y2={H - 40} className="pr-step" />)}
      <path d={area} className="pr-risk" />
      <path d={fl} className="pr-f" />
      {r.warnAt !== null && (<g><line x1={X(r.warnAt)} x2={X(r.warnAt)} y1={12} y2={H - 40} className="pr-warn" /><text x={X(r.warnAt) + 6} y={24} className="pr-lbl warn">First warning</text></g>)}
      {r.collapseAt !== null && (<g><line x1={X(r.collapseAt)} x2={X(r.collapseAt)} y1={12} y2={H - 40} className="pr-col" /><text x={X(r.collapseAt) + 6} y={42} className="pr-lbl col">Collapse</text></g>)}
      {at !== null && <line x1={X(at)} x2={X(at)} y1={12} y2={H - 40} className="pr-at" />}
      {[0, 0.25, 0.5, 0.75, 1].map((k) => <text key={k} x={X(k * t1)} y={H - 18} className="pr-ax" textAnchor="middle">{Math.round(k * t1)} s</text>)}
    </svg>
  );
}

export default function Predictor() {
  const [model, setModel] = useState<PredictorModel | null>(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState(EVENTS[0].id);
  const [res, setRes] = useState<Result | null>(null);
  const [board, setBoard] = useState<Result[]>([]);
  const [scoring, setScoring] = useState(false);
  const [moment, setMoment] = useState<number | null>(null);
  const runId = useRef(0);
  useEffect(() => {
    loadPredictor().then(setModel).catch((e) => setErr(String(e.message ?? e)));
  }, []);
  useEffect(() => {
    if (!model) return;
    const my = ++runId.current;
    setRes({ id: sel, points: [], warnAt: null, collapseAt: null, f0: 50 });
    evaluate(model, sel, (pts) => my === runId.current && setRes((r) => (r ? { ...r, points: pts } : r)), () => my === runId.current).then((r) => my === runId.current && setRes(r));
    setMoment(null);
  }, [model, sel]);
  const scoreAll = async () => {
    if (!model) return;
    setScoring(true);
    setBoard([]);
    const out: Result[] = [];
    for (const e of EVENTS) {
      out.push(await evaluate(model, e.id));
      setBoard([...out]);
    }
    setScoring(false);
  };
  const ev = eventById(sel)!;
  // the moment to explain: chosen by the slider, else the first warning, else the riskiest live moment
  const why = (() => {
    if (!model || !res || res.points.length < 3) return null;
    const pts = res.points;
    let k = moment ?? -1;
    if (k < 0 || k >= pts.length) {
      k = res.warnAt !== null ? pts.findIndex((q) => q.t === res.warnAt) : -1;
      if (k < 0) k = pts.reduce((bi, q, i) => (q.served >= 0.5 && q.p > pts[bi].p ? i : bi), 0);
    }
    const pt = pts[k];
    const drivers = explain(model, pt.x).filter((d) => Math.abs(d.share) > 0.005).slice(0, 5);
    return { k, pt, drivers };
  })();
  const lead = res && res.warnAt !== null && res.collapseAt !== null ? res.collapseAt - res.warnAt : null;

  return (
    <main id="main" className="page predictor">
      <div className="page-head">
        <h1>Would we have seen it coming?</h1>
        <p>A small neural network trained on thousands of simulated disturbances watches the grid every two seconds and estimates the chance it collapses within the next minute. Here it is run against every historical blackout in the project.</p>
      </div>
      {err && <p className="hint bad">The trained model could not be loaded: {err}</p>}
      {model && (
        <section className="pr-card">
          <div><span>Trained on</span><strong>{num(model.metrics.runs)} disturbances</strong><em>{num(model.metrics.samples)} snapshots across ten real grids</em></div>
          <div><span>AUC on unseen disturbances</span><strong>{model.metrics.auc.toFixed(2)}</strong><em>1.0 is perfect, 0.5 is guessing</em></div>
          <div><span>Precision</span><strong>{num(model.metrics.precision * 100)} %</strong><em>of warnings were real</em></div>
          <div><span>Recall</span><strong>{num(model.metrics.recall * 100)} %</strong><em>of collapses were warned of</em></div>
        </section>
      )}

      <section className="pr-sec">
        <h2>One event at a time</h2>
        <label className="pr-pick">
          <span>Event</span>
          <select value={sel} onChange={(e) => setSel(e.target.value)}>
            {EVENTS.map((e) => <option key={e.id} value={e.id}>{e.date.slice(-4)}, {e.title}</option>)}
          </select>
        </label>
        {res && <RiskChart r={res} steps={ev.steps.map((s) => s.t)} at={why ? why.pt.t : null} />}
        <ul className="legend">
          <li><i style={{ background: 'rgba(255,91,79,0.5)' }} />Predicted collapse risk</li>
          <li><i style={{ background: '#ece6d8' }} />Frequency</li>
          <li><i style={{ background: 'rgba(255,91,79,0.25)' }} />Reconstructed steps</li>
        </ul>
        {res && res.points.length > 10 && (
          <p className="pr-verdict">
            {res.collapseAt === null
              ? res.warnAt === null ? 'No collapse, and the model stayed quiet.' : `No collapse. The model raised a warning at ${Math.round(res.warnAt)} s that turned out to be a false alarm in this replay.`
              : lead !== null && lead > 0 ? `The model warned ${Math.round(lead)} seconds before the collapse.` : 'The collapse came faster than the model could warn: the grid went from healthy to dark between two snapshots.'}
          </p>
        )}
      </section>

      {model && why && (
        <section className="pr-sec pr-why">
          <h2>Why it {why.pt.p > 0.5 ? 'is worried' : 'is calm'} at {Math.round(why.pt.t)} s</h2>
          <p className="hint">Each bar is how much the risk would fall if that one reading were back to normal. Scrub through the replay to see what the model is looking at.</p>
          <label className="w-slider">Moment in the replay <output>{Math.round(why.pt.t)} s, risk {Math.round(why.pt.p * 100)} %</output>
            <input type="range" min={0} max={res!.points.length - 1} value={why.k} onChange={(e) => setMoment(Number(e.target.value))} />
          </label>
          {why.pt.served < 0.5 ? (
            <p className="pr-verdict">The grid has already collapsed here.</p>
          ) : (
            <ol className="pr-drivers">
              {why.drivers.map((d) => (
                <li key={d.i}>
                  <span className="pr-d-n">{d.name}</span>
                  <span className="pr-d-v">{describe(d.i, d.value, res!.f0)}</span>
                  <span className="pr-d-bar"><i style={{ width: `${Math.min(100, Math.abs(d.share) * 100)}%` }} className={d.share < 0 ? 'calm' : ''} /></span>
                  <span className="pr-d-s">{d.share >= 0 ? '+' : '−'}{Math.round(Math.abs(d.share) * 100)} pts</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      <section className="pr-sec">
        <h2>Every event</h2>
        <button className="btn primary" onClick={scoreAll} disabled={!model || scoring}>{scoring ? `Scoring… ${board.length} of ${EVENTS.length}` : 'Score all events'}</button>
        {board.length > 0 && (
          <ol className="pr-board">
            {board.map((r) => {
              const e = eventById(r.id)!;
              const l = r.warnAt !== null && r.collapseAt !== null ? r.collapseAt - r.warnAt : null;
              return (
                <li key={r.id}>
                  <span className="pr-b-t">{e.date.slice(-4)}, {e.title}</span>
                  <span className={`pr-b-v ${r.collapseAt === null ? (r.warnAt ? 'fa' : 'ok') : l !== null && l > 0 ? 'ok' : 'miss'}`}>
                    {r.collapseAt === null ? (r.warnAt ? 'False alarm' : 'Survived, no alarm') : l !== null && l > 0 ? `Warned ${Math.round(l)} s ahead` : 'Missed'}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="pr-sec prose">
        <h2>How it works</h2>
        <p>Training data comes from this project’s own grid engine. Each run takes one of the ten OpenStreetMap regions, randomises how well load shedding and primary response work, and applies one to three random disturbances: large plants tripping, the busiest lines tripping, separation from the wider grid, demand surges, or a generation deficit next door. The grid is sampled every two seconds, and each snapshot is labelled by whether demand served falls below half within the next {model?.horizon ?? 60} seconds.</p>
        <p>The model is a multilayer perceptron with two hidden layers (16 and 8 neurons), trained with Adam on twelve features: frequency deviation, rate of change of frequency, the lowest frequency in the last five seconds, lowest voltage, demand served, number of live islands, spinning headroom, inertia per megawatt of demand, the heaviest line loading, the share of lines overloaded, the import share, and any uncovered generation loss in the wider grid. One run in five is held out for testing, so the scores above are on disturbances the model never saw.</p>
        <h2>What it cannot do</h2>
        <p>It has only ever seen simulated grids, so it inherits every simplification of the simulator. It cannot know about a tree touching a line or a relay with the wrong setting until the grid physically reacts. In real control rooms, models like this support operators; they do not replace protection.</p>
        <p><Link to="/blackouts">Back to the blackouts</Link></p>
      </section>
    </main>
  );
}
