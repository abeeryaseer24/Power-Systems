// AC power-flow surrogate: a small neural network trained (ml/surrogate.py) to map a grid's
// bus injections and one line outage straight to every bus voltage and every line loading,
// in place of the iterative fast decoupled load flow. The browser runs it with plain typed
// arrays; the exact solver is kept next to it so every answer can be checked.
import { RegionSim, GEN_KIND } from '../grid/region';

/** Settle a grid and freeze its main island as the surrogate's base case. */
export function surrogateBase(s: RegionSim) {
  s.advance(4);
  const live = s.islands.members.filter((m) => s.buses[m[0]].live);
  const m = live.reduce((a, b) => (b.length > a.length ? b : a), live[0]);
  const prob = s.islandProblem(m)!;
  const V0 = m.map((b) => s.buses[b].V || 1), th0 = m.map((b) => s.buses[b].theta);
  return { s, m, prob, V0, th0 };
}

export const isSync = (kind: keyof typeof GEN_KIND) => GEN_KIND[kind].sync;

type Layer = { W: Float32Array; b: Float32Array; inn: number; out: number };
export type SurrogateSpec = {
  region: string; n: number; L: number; cand: number[];
  xMean: number[]; xStd: number[]; yMean: number[]; yStd: number[];
  layers: { w: string; b: string; inn: number; out: number }[];
  metrics: SurrogateMetrics;
  residual: boolean;
  ptdf: string; lodf: string; mva: number[];
  buses: number[]; branches: number[]; samples: number;
};
export type Scores = Record<string, number>;
export type SurrogateMetrics = {
  train_s: number;
  random: Record<string, Scores | number>; unseen_contingency: Record<string, Scores | number>;
  speed: { fdlf_ms: number; surrogate_cpu_ms: number; n1_sweep_cpu_ms: number; n1_sweep_fdlf_ms: number; contingencies: number };
  held_out_lines: number[];
};
export type Surrogate = { spec: SurrogateSpec; layers: Layer[]; ptdf: Float32Array; lodf: Float32Array };

function f32(b64: string) {
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(i);
  return new Float32Array(u.buffer);
}

/** DC post-contingency loading of every line (fraction of rating): the classic screening estimate. */
export function dcLoading(sur: Surrogate, P: ArrayLike<number>, outage: number) {
  const { n, L, mva } = sur.spec;
  const f = new Float64Array(L);
  for (let j = 0; j < L; j++) { let a = 0; const r = j * n; for (let i = 0; i < n; i++) a += sur.ptdf[r + i] * P[i]; f[j] = a; }
  if (outage >= 0) {
    const fk = f[outage];
    for (let j = 0; j < L; j++) f[j] += sur.lodf[j * L + outage] * fk;
    f[outage] = 0;
  }
  const out = new Float32Array(L);
  for (let j = 0; j < L; j++) out[j] = (Math.abs(f[j]) * 100) / mva[j];
  return out;
}

/** Weights travel as little-endian float16, base64. */
function f16(b64: string) {
  const bin = atob(b64), u = new Uint16Array(bin.length / 2);
  for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
  const out = new Float32Array(u.length);
  for (let i = 0; i < u.length; i++) {
    const h = u[i], s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
    out[i] = e === 0 ? s * 2 ** -14 * (f / 1024) : e === 31 ? (f ? NaN : s * Infinity) : s * 2 ** (e - 15) * (1 + f / 1024);
  }
  return out;
}

export function loadSurrogate(spec: SurrogateSpec): Surrogate {
  return { spec, layers: spec.layers.map((l) => ({ W: f16(l.w), b: f16(l.b), inn: l.inn, out: l.out })), ptdf: f32(spec.ptdf), lodf: f32(spec.lodf) };
}

/** Voltages (pu), loadings (fraction of rating) and the probability the case solves. */
export function predictFlow(sur: Surrogate, P: ArrayLike<number>, Q: ArrayLike<number>, outage: number) {
  const { n, L, xMean, xStd, yMean, yStd } = sur.spec;
  // inputs: injections, the (unused) one-hot outage slots, and the DC post-contingency loadings
  const dc = dcLoading(sur, P, outage);
  let x = new Float32Array(2 * n + 2 * L);
  for (let i = 0; i < n; i++) { x[i] = (P[i] - xMean[i]) / xStd[i]; x[n + i] = (Q[i] - xMean[n + i]) / xStd[n + i]; }
  for (let j = 0; j < L; j++) x[2 * n + L + j] = (dc[j] - xMean[2 * n + L + j]) / xStd[2 * n + L + j];
  sur.layers.forEach((l, k) => {
    const y = new Float32Array(l.out);
    for (let o = 0; o < l.out; o++) {
      let a = l.b[o];
      const row = o * l.inn;
      if (k === 0) {
        // the one-hot outage slots are always zero for this model: skip them
        for (let i = 0; i < 2 * n; i++) a += l.W[row + i] * x[i];
        for (let i = 2 * n + L; i < l.inn; i++) a += l.W[row + i] * x[i];
      } else for (let i = 0; i < l.inn; i++) a += l.W[row + i] * x[i];
      y[o] = k < sur.layers.length - 1 ? a / (1 + Math.exp(-a)) : a; // SiLU, linear head
    }
    x = y;
  });
  const V = new Float32Array(n), loading = new Float32Array(L);
  for (let i = 0; i < n; i++) V[i] = x[i] * yStd[i] + yMean[i];
  for (let j = 0; j < L; j++) loading[j] = j === outage ? 0 : Math.max(0, x[n + j] * yStd[n + j] + yMean[n + j] + (sur.spec.residual ? dc[j] : 0));
  const pSolve = 1 / (1 + Math.exp(-x[n + L]));
  return { V, loading, pSolve, dc };
}
