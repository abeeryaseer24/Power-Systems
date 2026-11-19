import { useEffect, useState } from 'react';
import type { RegionSim } from '../grid/region';
import { describe, explain, features, loadPredictor, predict, type PredictorModel } from '../ai/features';
import '../copilot.css';

let cached: Promise<PredictorModel> | null = null;
const model = () => (cached ??= loadPredictor());

interface Advice { text: string; act?: { label: string; run: () => void } }

/** Rule-based advice, ordered by urgency. The predictor supplies the risk and the reason. */
export function advise(s: RegionSim): Advice {
  const f0 = s.f0;
  const f = s.frequency;
  const served = s.served / Math.max(1, s.demand);
  if (f <= 0 || served < 0.5) return { text: 'The grid has collapsed. Nothing to save now: the next job is a black start.' };
  const dev = (f - f0) / f0;
  const vMin = Math.min(...s.buses.filter((b) => b.live && b.demand > 0).map((b) => b.V));
  let worst = -1;
  for (let i = 0; i < s.branches.length; i++) {
    const b = s.branches[i];
    if (b.closed && !b.ext && (worst < 0 || b.loading > s.branches[worst].loading)) worst = i;
  }
  const reserve = s.gens.map((g, i) => ({ g, i })).filter((x) => !x.g.online && !x.g.tripReason && s.buses[x.g.def.bus].live).sort((a, b) => b.g.def.mw - a.g.def.mw)[0];
  const headroom = s.gens.reduce((a, g) => a + (g.online ? Math.max(0, g.avail - g.p) : 0), 0);
  if (dev < -0.012 || (dev < -0.006 && s.rocof < -0.002 * f0)) {
    return { text: `Frequency ${f.toFixed(2)} Hz and falling. Shed load now, before under-frequency relays and generator protection do it for you.`, act: { label: 'Shed 5 % now', run: () => s.shedLoad(0.05) } };
  }
  if (vMin < 0.9) {
    return { text: `Voltage down to ${vMin.toFixed(2)} pu. Reactive power is running out; shedding load in the weak area is the fastest relief.`, act: { label: 'Shed 5 % now', run: () => s.shedLoad(0.05) } };
  }
  if (worst >= 0 && s.branches[worst].loading > 1.1) {
    const L = s.branches[worst].loading;
    return { text: `${s.branchName(worst)} is at ${Math.round(L * 100)} % of its rating and heating up. Cut the flow before it sags and trips, or the next line takes its load.`, act: { label: 'Shed 5 % now', run: () => s.shedLoad(0.05) } };
  }
  if (dev > 0.01) {
    const big = s.gens.map((g, i) => ({ g, i })).filter((x) => x.g.online).sort((a, b) => b.g.p - a.g.p)[0];
    return big
      ? { text: `Frequency ${f.toFixed(2)} Hz: too much generation for what is left connected. Back a large unit down.`, act: { label: `Cut ${big.g.def.name.slice(0, 22)} by 10 %`, run: () => s.setGen(big.i, big.g.p * 0.9) } }
      : { text: 'Frequency high: too much generation.' };
  }
  if (dev < -0.003) {
    if (s.ext.online && s.ext.sched < s.ext.MW * 0.9) return { text: `Frequency sagging to ${f.toFixed(2)} Hz. The neighbours have room: ask for more import.`, act: { label: 'Ask for 200 MW', run: () => s.setExt(s.ext.sched + 200) } };
    if (reserve) return { text: `Frequency sagging to ${f.toFixed(2)} Hz with ${Math.round(headroom)} MW of headroom. Bring reserve online.`, act: { label: `Start ${reserve.g.def.name.slice(0, 22)}`, run: () => s.startGen(reserve.i) } };
  }
  if (headroom < s.demand * 0.05 && reserve) {
    return { text: `Only ${Math.round(headroom)} MW of spinning reserve. One more trip and you are short. Start a plant now while it is quiet.`, act: { label: `Start ${reserve.g.def.name.slice(0, 22)}`, run: () => s.startGen(reserve.i) } };
  }
  if (served < 0.98) return { text: 'Stable for now. Restore shed demand in small steps and watch the frequency.', act: { label: 'Restore 10 %', run: () => s.restoreLoad(0.1) } };
  return { text: 'Steady. Nothing needs doing yet.' };
}

/** An AI co-pilot for Take control mode: risk from the trained model, advice from operating rules. */
export default function CoPilot({ sim, tick }: { sim: RegionSim; tick: number }) {
  const [m, setM] = useState<PredictorModel | null>(null);
  const [took, setTook] = useState(0);
  useEffect(() => {
    model().then(setM).catch(() => setM(null));
  }, []);
  void tick;
  const x = features(sim);
  const served = sim.served / Math.max(1, sim.demand);
  const risk = !m ? null : served < 0.5 ? 1 : predict(m, x);
  const why = m && risk !== null && served >= 0.5 ? explain(m, x)[0] : null;
  const a = advise(sim);
  const level = risk === null ? '' : risk > 0.5 ? 'hot' : risk > 0.2 ? 'warm' : 'calm';
  return (
    <section className={`copilot ${level}`} aria-live="polite">
      <div className="cp-head">
        <span>Co-pilot</span>
        <strong>{risk === null ? '…' : `${Math.round(risk * 100)} %`}</strong>
        <em>risk of collapse within a minute</em>
      </div>
      {why && why.share > 0.03 && <p className="cp-why">Mostly because of {why.name.toLowerCase()}: {describe(why.i, why.value, sim.f0)}.</p>}
      <p className="cp-say">{a.text}</p>
      {a.act && <button className="btn small" onClick={() => { a.act!.run(); setTook(took + 1); }}>{a.act.label}</button>}
      {took > 0 && <p className="cp-note">You took the co-pilot’s advice {took} time{took > 1 ? 's' : ''}.</p>}
    </section>
  );
}
