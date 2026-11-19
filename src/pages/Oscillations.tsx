import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import '../oscillations.css';

// Two areas, two machines each, classical model on a lossless reduced network:
//   dδ/dt = ω0·Δω,   2H·dΔω/dt = Pm − Pe − D·Δω,   Pe_i = Σ_j E_i E_j B_ij sin(δ_i − δ_j)
// Area 1 (G1, G2) exports to area 2 (G3, G4) over a weak tie. Per unit on a common base.
const F0 = 50;
const W0 = 2 * Math.PI * F0;
const H = [6.5, 6.5, 6.2, 6.2];
const B_LOCAL = 9; // strong coupling inside each area
const B_TIE_PER_LINE = 0.75;
const DT = 0.005;
const SPAN = 20;

interface Opts { lines: number; transfer: number; pss: boolean; fastAvr: boolean; fault: 'trip' | 'fault' }
interface Run { t: number[]; dw: number[][]; delta: number[][]; tie: number[]; lost: number | null; eq: boolean }

function bMatrix(tie: number) {
  const B = [[0, B_LOCAL, 0, 0], [B_LOCAL, 0, tie, 0], [0, tie, 0, B_LOCAL], [0, 0, B_LOCAL, 0]];
  return B;
}
function pe(d: number[], B: number[][]) {
  return d.map((di, i) => d.reduce((a, dj, j) => a + B[i][j] * Math.sin(di - dj), 0));
}

function simulate(o: Opts): Run {
  const T = o.transfer;
  const Pm = [T / 2, T / 2, -T / 2, -T / 2];
  // damping: a little natural damping, power system stabilisers add a lot, fast high-gain exciters
  // subtract damping in proportion to the transfer (the classic 1960s problem)
  const D = [0, 1, 2, 3].map(() => 1.2 + (o.pss ? 14 : 0) - (o.fastAvr ? 3.2 * T : 0));
  const tie0 = o.lines * B_TIE_PER_LINE;
  // pre-disturbance equilibrium: the tie carries T at angle asin(T / tie) across it
  const s = T / tie0;
  if (Math.abs(s) >= 1) return { t: [0], dw: [[0, 0, 0, 0]], delta: [[0, 0, 0, 0]], tie: [T], lost: 0, eq: false };
  // solve the full equilibrium by heavily damped relaxation from the tie-angle estimate
  let d = [0.05 * T, 0, -Math.asin(s), -Math.asin(s) - 0.05 * T];
  const B0 = bMatrix(tie0);
  for (let k = 0; k < 4000; k++) {
    const P = pe(d, B0);
    d = d.map((x, i) => x + 0.02 * (Pm[i] - P[i]));
    const m = d.reduce((a, b) => a + b, 0) / 4;
    d = d.map((x) => x - m);
  }
  const w = [0, 0, 0, 0];
  const out: Run = { t: [], dw: [], delta: [], tie: [], lost: null, eq: true };
  const afterTie = o.fault === 'trip' ? (o.lines - 1) * B_TIE_PER_LINE : tie0;
  const deriv = (dd: number[], ww: number[], B: number[][]) => {
    const P = pe(dd, B);
    return { dd: ww.map((x) => W0 * x), dw: ww.map((x, i) => (Pm[i] - P[i] - D[i] * x) / (2 * H[i])) };
  };
  for (let n = 0, t = 0; t <= SPAN; n++, t = n * DT) {
    // disturbance at t = 1 s: a three-phase fault on the tie (cleared after 80 ms), or a tie circuit trips
    const tieNow = t < 1 ? tie0 : o.fault === 'fault' && t < 1.08 ? 0.05 : afterTie;
    const B = bMatrix(tieNow);
    if (n % 4 === 0) {
      out.t.push(t);
      out.dw.push(w.map((x) => x * F0));
      const mean = d.reduce((a, b) => a + b, 0) / 4;
      out.delta.push(d.map((x) => x - mean));
      out.tie.push(tieNow * Math.sin(d[1] - d[2]));
    }
    // RK4
    const k1 = deriv(d, w, B);
    const k2 = deriv(d.map((x, i) => x + (DT / 2) * k1.dd[i]), w.map((x, i) => x + (DT / 2) * k1.dw[i]), B);
    const k3 = deriv(d.map((x, i) => x + (DT / 2) * k2.dd[i]), w.map((x, i) => x + (DT / 2) * k2.dw[i]), B);
    const k4 = deriv(d.map((x, i) => x + DT * k3.dd[i]), w.map((x, i) => x + DT * k3.dw[i]), B);
    d = d.map((x, i) => x + (DT / 6) * (k1.dd[i] + 2 * k2.dd[i] + 2 * k3.dd[i] + k4.dd[i]));
    for (let i = 0; i < 4; i++) w[i] += (DT / 6) * (k1.dw[i] + 2 * k2.dw[i] + 2 * k3.dw[i] + k4.dw[i]);
    if (out.lost === null && Math.abs(d[1] - d[2]) > Math.PI) out.lost = t;
    if (out.lost !== null && t > out.lost + 2) break;
  }
  return out;
}

/** Frequency and damping ratio of the inter-area mode, from successive peaks of the area speed difference. */
function mode(r: Run) {
  // area-average speeds cancel the fast local swings inside each area
  const x = r.dw.map((w) => (w[0] + w[1]) / 2 - (w[2] + w[3]) / 2);
  const peaks: { t: number; v: number }[] = [];
  for (let i = 1; i < x.length - 1; i++) {
    if (r.t[i] < 1.5) continue;
    if (x[i] > x[i - 1] && x[i] >= x[i + 1] && x[i] > 1e-5) peaks.push({ t: r.t[i], v: x[i] });
  }
  if (peaks.length < 3) return null;
  const p = peaks.slice(0, 6);
  const period = (p[p.length - 1].t - p[0].t) / (p.length - 1);
  const dec = Math.log(p[0].v / p[p.length - 1].v) / (p.length - 1);
  const zeta = dec / Math.sqrt(4 * Math.PI * Math.PI + dec * dec);
  return { f: 1 / period, zeta };
}

const COL = ['#ffb04d', '#ffd27a', '#86c5da', '#5aa6c8'];

export default function Oscillations() {
  const [o, setO] = useState<Opts>({ lines: 2, transfer: 0.6, pss: false, fastAvr: true, fault: 'trip' });
  const run = useMemo(() => simulate(o), [o]);
  const m = useMemo(() => (run.eq && run.lost === null ? mode(run) : null), [run]);
  const [play, setPlay] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const t0 = performance.now();
    const tick = () => {
      const t = ((performance.now() - t0) / 1000) * 1.5;
      setPlay(Math.min(run.t.length - 1, Math.floor(t / (DT * 4))));
      if (t < run.t[run.t.length - 1]) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [run]);

  const W = 860;
  const Hh = 240;
  const tMax = run.t[run.t.length - 1] || SPAN;
  const amp = Math.max(0.02, ...run.dw.slice(0, play + 1).flat().map(Math.abs)) * 1.15;
  const X = (t: number) => 40 + (t / SPAN) * (W - 50);
  const Y = (v: number) => Hh / 2 - (Math.max(-amp, Math.min(amp, v)) / amp) * (Hh / 2 - 12);
  const path = (k: number) => run.dw.slice(0, play + 1).map((w, i) => `${i ? 'L' : 'M'}${X(run.t[i]).toFixed(1)},${Y(w[k]).toFixed(1)}`).join(' ');
  const dNow = run.delta[Math.min(play, run.delta.length - 1)] ?? [0, 0, 0, 0];
  const set = <K extends keyof Opts>(k: K, v: Opts[K]) => setO({ ...o, [k]: v });
  const verdict = !run.eq
    ? 'The tie cannot carry this much power even before the disturbance. There is no stable operating point.'
    : run.lost !== null
      ? `The two areas lose synchronism ${(run.lost - 1).toFixed(1)} s after the disturbance. Out-of-step protection would split the grid.`
      : m
        ? m.zeta < 0
          ? `The oscillation grows: ${m.f.toFixed(2)} Hz with negative damping (${(m.zeta * 100).toFixed(1)} %). Left alone, it ends in a split.`
          : m.zeta < 0.03
            ? `A ${m.f.toFixed(2)} Hz swing that barely dies away (damping ${(m.zeta * 100).toFixed(1)} %). Operators would cut the transfer.`
            : `The swing dies away: ${m.f.toFixed(2)} Hz, damping ${(m.zeta * 100).toFixed(1)} %. Comfortable.`
        : 'Well damped: the swing dies out within a cycle or two.';

  return (
    <main id="main" className="page oscillations">
      <div className="page-head">
        <h1>When half a grid swings</h1>
        <p>Every generator on an AC grid spins in step with every other. Kick the system and whole regions rock against each other through the lines between them, a slow sway at well under one hertz that you can see in the power flows. Usually it dies away. Sometimes it grows.</p>
      </div>

      <section className="os-stage">
        <svg viewBox="0 0 860 200" className="os-svg" aria-label="Two areas with rotor angle needles">
          <rect x="40" y="30" width="300" height="140" rx="16" className="os-area" />
          <rect x="520" y="30" width="300" height="140" rx="16" className="os-area" />
          <text x="56" y="54" className="os-al">Area 1, exporting</text>
          <text x="536" y="54" className="os-al">Area 2, importing</text>
          {[{ x: 120, i: 0 }, { x: 260, i: 1 }, { x: 600, i: 2 }, { x: 740, i: 3 }].map(({ x, i }) => (
            <g key={i} transform={`translate(${x} 112)`}>
              <circle r="38" className="os-gen" />
              <line x1="0" y1="0" x2={34 * Math.cos(dNow[i] - Math.PI / 2)} y2={34 * Math.sin(dNow[i] - Math.PI / 2)} stroke={COL[i]} strokeWidth="4" strokeLinecap="round" />
              <text y="60" className="os-gl">G{i + 1}</text>
            </g>
          ))}
          {Array.from({ length: o.lines }).map((_, k) => (
            <line key={k} x1="300" y1={100 + k * 10 - (o.lines - 1) * 5} x2="560" y2={100 + k * 10 - (o.lines - 1) * 5}
              className={`os-tie ${o.fault === 'trip' && k === o.lines - 1 && run.t[play] >= 1 ? 'out' : ''} ${o.fault === 'fault' && run.t[play] >= 1 && run.t[play] < 1.1 ? 'flt' : ''}`} />
          ))}
          <text x="430" y="150" className="os-flow" textAnchor="middle">{((run.tie[play] ?? 0) * 1000).toFixed(0)} MW →</text>
        </svg>

        <svg viewBox={`0 0 ${W} ${Hh + 24}`} className="os-svg" aria-label="Rotor speed deviations">
          <line x1="40" y1={Hh / 2} x2={W - 10} y2={Hh / 2} className="os-axis" />
          <line x1={X(1)} y1="6" x2={X(1)} y2={Hh - 6} className="os-dist" />
          <text x={X(1) + 4} y="16" className="os-ax">disturbance</text>
          {[0, 1, 2, 3].map((k) => <path key={k} d={path(k)} stroke={COL[k]} className="os-trace" />)}
          {[0, 5, 10, 15, 20].map((t) => <text key={t} x={X(t)} y={Hh + 18} className="os-ax" textAnchor="middle">{t} s</text>)}
          <text x="36" y="16" className="os-ax" textAnchor="end">+{(amp * 1000).toFixed(0)} mHz</text>
        </svg>
        {play >= run.t.length - 1 || !run.eq ? (
          <p className={`os-verdict ${run.lost !== null || !run.eq || (m && m.zeta < 0.03) ? 'bad' : ''}`}>{verdict}</p>
        ) : (
          <p className="os-verdict">t = {run.t[play].toFixed(1)} s</p>
        )}
        {run.t.length > 1 && tMax < SPAN && <p className="hint">Simulation stopped after the split.</p>}
      </section>

      <section className="os-controls">
        <label className="w-slider">Power flowing from area 1 to area 2 <output>{Math.round(o.transfer * 1000)} MW</output>
          <input type="range" min={0.1} max={1.6} step={0.05} value={o.transfer} onChange={(e) => set('transfer', Number(e.target.value))} /></label>
        <label className="w-slider">Tie lines in service <output>{o.lines}</output>
          <input type="range" min={1} max={3} step={1} value={o.lines} onChange={(e) => set('lines', Number(e.target.value))} /></label>
        <div className="os-toggles">
          <label><input type="checkbox" checked={o.fastAvr} onChange={(e) => set('fastAvr', e.target.checked)} /> Fast, high-gain voltage regulators</label>
          <label><input type="checkbox" checked={o.pss} onChange={(e) => set('pss', e.target.checked)} /> Power system stabilisers</label>
          <label>Disturbance
            <select value={o.fault} onChange={(e) => set('fault', e.target.value as Opts['fault'])}>
              <option value="fault">Short circuit on the tie, cleared in 80 ms</option>
              <option value="trip">One tie line trips</option>
            </select>
          </label>
        </div>
      </section>

      <section className="os-text">
        <h2>Why it happens</h2>
        <p>Each area behaves like one heavy flywheel. The tie lines are a spring between them. Pull one flywheel ahead and the spring pulls it back, overshooting, again and again, at a frequency set by the spring’s stiffness and the flywheels’ mass. Weak ties between big areas make slow, lazy swings of 0.1 to 0.8 Hz.</p>
        <p>Modern voltage regulators react in milliseconds. That is good for holding voltage after a fault, but on a heavily loaded tie it pushes power the wrong way at the wrong moment and removes damping. The fix, from the late 1960s onwards, is the power system stabiliser: a small extra signal into each regulator that measures speed and adds damping back.</p>
        <p>On 10 August 1996, with lines already out in the Pacific Northwest, a growing oscillation of about a quarter of a hertz appeared on the California–Oregon Intertie. Within about a minute it split the Western Interconnection into islands and cut power to some 7.5 million customers. A related case file: <Link to="/academy/europe-2006">Europe splits in three</Link>.</p>
        <p className="hint">Simplified: classical machine models with constant internal voltage and lumped damping; the regulator and stabiliser effects are represented as negative and positive damping rather than modelled in full.</p>
      </section>
    </main>
  );
}
