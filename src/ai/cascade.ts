// Cascade GNN (Phase B): the grid snapshot as a graph, exactly as the training data was built
// (src/ai/cascade-data.test.ts), and the trained network (ml/gnn.py) evaluated in the browser.
import type { RegionSim } from '../grid/region';

export type Snapshot = { x: number[][]; edges: number[][]; ea: number[][] };

/** Node and edge features of the live grid (closed, non-external branches only). */
export function snapshot(s: RegionSim): Snapshot {
  const n = s.buses.length;
  const gen = new Array(n).fill(0), cap = new Array(n).fill(0);
  s.gens.forEach((g) => { if (g.online) { gen[g.def.bus] += g.p; cap[g.def.bus] += g.avail; } });
  const deg = new Array(n).fill(0);
  s.branches.forEach((b) => { if (b.closed && !b.ext) { deg[b.def.a]++; deg[b.def.b]++; } });
  const extBus = new Set<number>([s.ext.bus, ...(s.data.ext.tieBuses ?? [])]);
  // node features: voltage class, load, generation, headroom, voltage, angle, degree, external tie
  const x = s.buses.map((b, i) => [b.def.kv / 400, b.demand / 100, gen[i] / 100, Math.max(0, cap[i] - gen[i]) / 100, b.V, b.theta, deg[i] / 4, extBus.has(i) ? 1 : 0]);
  const edges: number[][] = [], ea: number[][] = [];
  s.branches.forEach((b) => {
    if (!b.closed || b.ext) return;
    edges.push([b.def.a, b.def.b]);
    // edge features: reactance, rating, loading, voltage class, circuits
    ea.push([b.def.x * 100, b.def.mva / 1000, b.loading, b.def.kv / 400, (b.def.circuits ?? 1) / 2]);
  });
  return { x, edges, ea };
}

/** Indices (into s.branches) of the closed, non-external branches, in snapshot edge order. */
export const snapshotBranches = (s: RegionSim) => s.branches.map((b, i) => (b.closed && !b.ext ? i : -1)).filter((i) => i >= 0);

/** The screen a power engineer would compute (same as ml/gnn.py hand_features). */
export function handFeatures(sn: Snapshot, edgeTrip: number[], busTrip: number[], extTrip: number, freq: number) {
  const tripped = sn.ea.filter((_, i) => edgeTrip[i] > 0);
  const tl = tripped.length ? tripped : [new Array(sn.ea[0].length).fill(0)];
  const load = sn.x.reduce((a, r) => a + r[1], 0), gen = sn.x.reduce((a, r) => a + r[2], 0), head = sn.x.reduce((a, r) => a + r[3], 0);
  const ld = sn.ea.map((e) => e[2]);
  return [
    edgeTrip.filter((v) => v > 0).length, Math.max(...tl.map((e) => e[2])), tl.reduce((a, e) => a + e[2] * e[1], 0), Math.max(...tl.map((e) => e[3])),
    busTrip.reduce((a, b) => a + b, 0), extTrip, load, gen, head / Math.max(load, 1e-3), Math.max(...ld), ld.reduce((a, b) => a + b, 0) / ld.length,
    ld.filter((v) => v > 0.8).length / ld.length, sn.x.length, sn.ea.length, freq === 60 ? 1 : 0,
  ];
}

/** Hops from every bus to the contingency; tripped lines no longer connect (as ml/gnn.py hops). */
export function hopsToFault(n: number, edges: number[][], edgeTrip: number[], busTrip: number[]) {
  const adj: number[][] = Array.from({ length: n }, () => []);
  const d = new Array(n).fill(99), q: number[] = [];
  busTrip.forEach((v, i) => { if (v > 0) { d[i] = 0; q.push(i); } });
  edges.forEach(([a, b], j) => {
    if (edgeTrip[j]) { for (const v of [a, b]) if (d[v] !== 0) { d[v] = 0; q.push(v); } } else { adj[a].push(b); adj[b].push(a); }
  });
  for (let h = 0; h < q.length; h++) { const u = q[h]; for (const v of adj[u]) if (d[v] > d[u] + 1) { d[v] = d[u] + 1; q.push(v); } }
  return d;
}

type W = { shape: number[]; data: string };
export type GnnSpec = {
  weights: Record<string, W>; norm: Record<'mx' | 'sx' | 'me' | 'se' | 'mg' | 'sg', string>;
  layers: number; hidden: number; trainedOn: number; major: number; results?: GnnResults;
};
export type Scores = { MAE_pct: number; AUC_major: number; spearman: number; AUC_bus?: number } & Record<string, number>;
export type GnnResults = {
  n: number; grids: string[]; per_grid: Record<string, number>; major_share: number; seeds: number; minutes: number;
  splits: {
    random: { mean: Scores; gbm: Scores; gnn: Scores; node_baselines: { hops: number; gbm: number; hybrid?: number } };
    unseen: { mean: Scores; gbm: Scores; gnn: Scores; node_baselines: { hops: number; gbm: number; hybrid?: number }; folds: { held_out: string[]; samples: number; gnn: Scores; gbm: Scores; node_baselines: { hops: number; gbm: number; hybrid?: number } }[] };
  };
};

function f16(b64: string) {
  const bin = atob(b64), out = new Float32Array(bin.length / 2);
  for (let i = 0; i < out.length; i++) {
    const h = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
    out[i] = e === 0 ? s * 2 ** -14 * (f / 1024) : e === 31 ? (f ? NaN : s * Infinity) : s * 2 ** (e - 15) * (1 + f / 1024);
  }
  return out;
}

type Lin = { W: Float32Array; b: Float32Array; i: number; o: number };
export type Gnn = { spec: GnnSpec; lin: (k: string) => Lin; ln: (k: string) => { g: Float32Array; b: Float32Array }; norm: Record<string, Float32Array> };

export function loadGnn(spec: GnnSpec): Gnn {
  const cache = new Map<string, Float32Array>();
  const get = (k: string) => { if (!cache.has(k)) cache.set(k, f16(spec.weights[k].data)); return cache.get(k)!; };
  const norm = Object.fromEntries(Object.entries(spec.norm).map(([k, v]) => [k, f16(v)]));
  return {
    spec, norm,
    lin: (k) => { const sh = spec.weights[`${k}.weight`].shape; return { W: get(`${k}.weight`), b: get(`${k}.bias`), o: sh[0], i: sh[1] }; },
    ln: (k) => ({ g: get(`${k}.weight`), b: get(`${k}.bias`) }),
  };
}

/** y = x W^T + b for a row-major batch x [rows, i]. */
function dense(x: Float32Array, rows: number, L: Lin, relu = false) {
  const y = new Float32Array(rows * L.o);
  for (let r = 0; r < rows; r++) {
    const xo = r * L.i, yo = r * L.o;
    for (let o = 0; o < L.o; o++) {
      let a = L.b[o]; const wo = o * L.i;
      for (let k = 0; k < L.i; k++) a += L.W[wo + k] * x[xo + k];
      y[yo + o] = relu && a < 0 ? 0 : a;
    }
  }
  return y;
}
// Linear, ReLU, [Dropout,] Linear: with dropout in training the second layer sits at index 3
const mlp2 = (net: Gnn, k: string, x: Float32Array, rows: number) =>
  dense(dense(x, rows, net.lin(`${k}.0`), true), rows, net.lin(net.spec.weights[`${k}.3.weight`] ? `${k}.3` : `${k}.2`));

/** Probability each bus loses supply, and the share of the grid's load lost. */
export function predictCascade(net: Gnn, sn: Snapshot, edgeTrip: number[], busTrip: number[], extTrip: number, freq: number) {
  const n = sn.x.length, H = net.spec.hidden, E = sn.edges.length;
  const { mx, sx, me, se, mg, sg } = net.norm;
  const NX = mx.length, NE = me.length;
  // node inputs: snapshot features + tripped plant MW at the bus + external tie lost + 60 Hz system + nearness to the fault
  const hops = hopsToFault(n, sn.edges, edgeTrip, busTrip);
  const x = new Float32Array(n * NX);
  sn.x.forEach((r, i) => { const v = [...r, busTrip[i], extTrip, freq === 60 ? 1 : 0, 1 / (1 + hops[i])]; for (let k = 0; k < NX; k++) x[i * NX + k] = (v[k] - mx[k]) / sx[k]; });
  // edges both ways, with the tripped flag
  const src = new Int32Array(2 * E), dst = new Int32Array(2 * E), ea = new Float32Array(2 * E * NE);
  sn.edges.forEach(([a, b], j) => {
    src[j] = a; dst[j] = b; src[E + j] = b; dst[E + j] = a;
    const v = [...sn.ea[j], edgeTrip[j]];
    for (let k = 0; k < NE; k++) { const z = (v[k] - me[k]) / se[k]; ea[j * NE + k] = z; ea[(E + j) * NE + k] = z; }
  });
  let h = mlp2(net, 'enc', x, n);
  const e = dense(ea, 2 * E, net.lin('eenc.0'), true);
  const EH = H / 2;
  const deg = new Float32Array(n); for (let j = 0; j < 2 * E; j++) deg[dst[j]]++;
  for (let l = 0; l < net.spec.layers; l++) {
    // messages from [h_src, h_dst, e]
    const inp = new Float32Array(2 * E * (2 * H + EH));
    for (let j = 0; j < 2 * E; j++) {
      const o = j * (2 * H + EH);
      inp.set(h.subarray(src[j] * H, src[j] * H + H), o);
      inp.set(h.subarray(dst[j] * H, dst[j] * H + H), o + H);
      inp.set(e.subarray(j * EH, j * EH + EH), o + 2 * H);
    }
    const m = mlp2(net, `layers.${l}.msg`, inp, 2 * E);
    const agg = new Float32Array(n * H);
    for (let j = 0; j < 2 * E; j++) { const d = dst[j] * H, mo = j * H; for (let k = 0; k < H; k++) agg[d + k] += m[mo + k]; }
    const cat = new Float32Array(n * 2 * H);
    for (let i = 0; i < n; i++) {
      const dg = Math.max(1, deg[i]);
      cat.set(h.subarray(i * H, i * H + H), i * 2 * H);
      for (let k = 0; k < H; k++) cat[i * 2 * H + H + k] = agg[i * H + k] / dg;
    }
    const u = mlp2(net, `layers.${l}.upd`, cat, n);
    const ln = net.ln(`layers.${l}.norm`);
    const nh = new Float32Array(n * H);
    for (let i = 0; i < n; i++) {
      let mu = 0; for (let k = 0; k < H; k++) { nh[i * H + k] = h[i * H + k] + u[i * H + k]; mu += nh[i * H + k]; }
      mu /= H; let v = 0; for (let k = 0; k < H; k++) v += (nh[i * H + k] - mu) ** 2;
      const inv = 1 / Math.sqrt(v / H + 1e-5);
      for (let k = 0; k < H; k++) nh[i * H + k] = (nh[i * H + k] - mu) * inv * ln.g[k] + ln.b[k];
    }
    h = nh;
  }
  const mean = new Float32Array(H), mxp = new Float32Array(H).fill(-1e9);
  for (let i = 0; i < n; i++) for (let k = 0; k < H; k++) { mean[k] += h[i * H + k] / n; mxp[k] = Math.max(mxp[k], h[i * H + k]); }
  const gfRaw = handFeatures(sn, edgeTrip, busTrip, extTrip, freq);
  const gf = new Float32Array(gfRaw.length); gfRaw.forEach((v, k) => { gf[k] = (v - mg[k]) / sg[k]; });
  const genc = dense(gf, 1, net.lin('genc.0'), true);
  // bus head: each bus sees its own state and the pooled summary of the whole event
  const node = new Float32Array(n);
  if (net.spec.weights['node.0.weight']) {
    const D = H + 2 * H + EH, inp = new Float32Array(n * D);
    for (let i = 0; i < n; i++) { inp.set(h.subarray(i * H, i * H + H), i * D); inp.set(mean, i * D + H); inp.set(mxp, i * D + 2 * H); inp.set(genc, i * D + 3 * H); }
    const z = mlp2(net, 'node', inp, n);
    for (let i = 0; i < n; i++) node[i] = 1 / (1 + Math.exp(-z[i]));
  } else {
    const nodeL = net.lin('node');
    for (let i = 0; i < n; i++) { let a = nodeL.b[0]; for (let k = 0; k < H; k++) a += nodeL.W[k] * h[i * H + k]; node[i] = 1 / (1 + Math.exp(-a)); }
  }
  const nloss = node.reduce((a, b) => a + b, 0) / n;
  const gin = new Float32Array(2 * H + EH + 1);
  gin.set(mean, 0); gin.set(mxp, H); gin.set(genc, 2 * H); gin[2 * H + EH] = nloss;
  const g1 = dense(gin, 1, net.lin('graph.0'), true), g2 = dense(g1, 1, net.lin('graph.2'), true), g3 = dense(g2, 1, net.lin('graph.4'));
  return { busLoss: node, lost: 1 / (1 + Math.exp(-g3[0])) };
}
