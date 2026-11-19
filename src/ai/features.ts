// Features the blackout predictor reads from a running grid. The same code is
// used to build the training set and for live inference in the browser.
import type { RegionSim } from '../grid/region';
import { GEN_KIND } from '../grid/region';

export const FEATURE_NAMES = [
  'Frequency deviation',
  'Rate of change of frequency',
  'Lowest frequency, last 5 s',
  'Lowest voltage',
  'Demand served',
  'Live islands',
  'Spinning headroom',
  'Inertia per MW of demand',
  'Heaviest line loading',
  'Share of lines overloaded',
  'Import share',
  'Uncovered loss in the wider grid',
] as const;

export function features(s: RegionSim): number[] {
  const f0 = s.f0;
  const tr = s.trace;
  const n = tr.length;
  const f = s.frequency;
  const fDev = f > 0 ? ((f - f0) / f0) * 100 : -6;
  const back = tr[Math.max(0, n - 5)];
  const rocof = n > 4 && f > 0 && back.f > 0 ? ((f - back.f) / 2 / f0) * 100 : 0;
  let fMin = f0;
  for (let i = Math.max(0, n - 10); i < n; i++) if (tr[i].f > 0) fMin = Math.min(fMin, tr[i].f);
  const fMinDev = f > 0 ? ((fMin - f0) / f0) * 100 : -6;
  const vMin = n ? Math.min(1.2, tr[n - 1].vMin) : 1;
  const demand = Math.max(1, s.demand);
  const served = s.served / demand;
  const islands = s.islands.members.filter((m) => m.length > 1 && s.buses[m[0]].live).length;
  let headroom = 0;
  let ek = 0;
  for (const g of s.gens) {
    if (!g.online) continue;
    const k = GEN_KIND[g.def.kind];
    if (k.sync) {
      headroom += Math.max(0, g.avail - g.p);
      ek += k.H * g.def.mw;
    }
  }
  if (s.extBus >= 0 && s.ext.online) ek += s.ext.H * s.ext.MW * 0.15;
  let maxLoad = 0;
  let over = 0;
  let closed = 0;
  for (const b of s.branches) {
    if (!b.closed || b.ext) continue;
    closed++;
    maxLoad = Math.max(maxLoad, b.loading);
    if (b.loading > 1) over++;
  }
  const imp = s.ext.online ? s.ext.p / demand : 0;
  const deficit = Math.max(0, s.ext.deficit - s.ext.shed) / demand;
  return [
    fDev, rocof, fMinDev, vMin, served, Math.min(5, islands), Math.min(2, headroom / demand), Math.min(20, ek / demand),
    Math.min(3, maxLoad), closed ? over / closed : 0, Math.max(-1, Math.min(1, imp)), Math.min(2, deficit),
  ];
}

export interface PredictorModel {
  names: string[];
  mean: number[];
  std: number[];
  layers: { w: number[][]; b: number[] }[];
  horizon: number;
  metrics: { auc: number; accuracy: number; precision: number; recall: number; samples: number; runs: number; positives: number };
  trained: string;
}

/** Forward pass of the small MLP: ReLU hidden layers, sigmoid output. */
export function predict(model: PredictorModel, x: number[]) {
  let a = x.map((v, i) => (v - model.mean[i]) / (model.std[i] || 1));
  model.layers.forEach((L, li) => {
    const out = L.b.map((b, j) => b + L.w[j].reduce((acc, w, i) => acc + w * a[i], 0));
    a = li < model.layers.length - 1 ? out.map((v) => Math.max(0, v)) : out.map((v) => 1 / (1 + Math.exp(-v)));
  });
  return a[0];
}

export async function loadPredictor(): Promise<PredictorModel> {
  const r = await fetch('/data/predictor.json');
  if (!r.ok) throw new Error('predictor model missing');
  return r.json();
}

/**
 * Why the model is worried: for each feature, how much the risk falls if that one
 * reading is put back to its typical training value with everything else unchanged.
 * Occlusion is crude but honest for a model this small, and it needs no extra training.
 */
export function explain(model: PredictorModel, x: number[]) {
  const base = predict(model, x);
  return x
    .map((v, i) => {
      const y = x.slice();
      y[i] = model.mean[i];
      return { i, name: model.names[i] ?? FEATURE_NAMES[i], value: v, share: base - predict(model, y) };
    })
    .sort((a, b) => b.share - a.share);
}

/** A reading in words, for the explanation panel. */
export function describe(i: number, v: number, f0: number) {
  switch (i) {
    case 0: return `${(f0 * (1 + v / 100)).toFixed(2)} Hz`;
    case 1: return `${((v / 100) * f0).toFixed(2)} Hz/s`;
    case 2: return `${(f0 * (1 + v / 100)).toFixed(2)} Hz`;
    case 3: return `${v.toFixed(2)} pu`;
    case 4: return `${Math.round(v * 100)} % of demand`;
    case 5: return `${Math.round(v)}`;
    case 6: return `${Math.round(v * 100)} % of demand`;
    case 7: return `${v.toFixed(1)} s`;
    case 8: return `${Math.round(v * 100)} % of rating`;
    case 9: return `${Math.round(v * 100)} % of lines`;
    case 10: return `${Math.round(v * 100)} % of demand`;
    case 11: return `${Math.round(v * 100)} % of demand`;
    default: return v.toFixed(2);
  }
}
