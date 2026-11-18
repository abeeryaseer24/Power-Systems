// AC power flow. Fast decoupled load flow (Stott & Alsac, 1974, XB scheme)
// for the live simulation, with a dense Newton–Raphson solver kept as the
// reference it is tested against. Per unit on a 100 MVA base throughout.

export type BusType = 'slack' | 'pv' | 'pq';

export interface ACBus {
  type: BusType;
  /** Net active injection, pu (generation − load). */
  P: number;
  /** Net reactive injection, pu. For PV buses this is the load part only. */
  Q: number;
  /** Voltage setpoint for PV / slack, pu. */
  Vset: number;
  /** Reactive limits of generation at the bus, pu (PV buses). */
  Qmin: number;
  Qmax: number;
  /** Shunt susceptance, pu (capacitors positive). */
  Bsh: number;
}

export interface ACBranch {
  from: number;
  to: number;
  r: number;
  x: number;
  /** Total line charging susceptance, pu. */
  b: number;
  closed: boolean;
}

export interface ACResult {
  V: Float64Array;
  theta: Float64Array;
  converged: boolean;
  iterations: number;
  /** Reactive generation needed at each PV/slack bus, pu. */
  Qgen: Float64Array;
  /** Buses that hit a reactive limit and were converted to PQ. */
  limited: number[];
  mismatch: number;
}

interface Adj {
  j: Int32Array;
  g: Float64Array;
  b: Float64Array;
}

/** Sparse admittance matrix as adjacency rows plus a dense diagonal. */
export function buildY(n: number, branches: ACBranch[], bsh?: ArrayLike<number>) {
  const Gd = new Float64Array(n);
  const Bd = new Float64Array(n);
  const rows: Map<number, { g: number; b: number }>[] = Array.from({ length: n }, () => new Map());
  for (const br of branches) {
    if (!br.closed || br.from === br.to) continue;
    const z2 = br.r * br.r + br.x * br.x;
    const g = br.r / z2;
    const b = -br.x / z2;
    Gd[br.from] += g;
    Gd[br.to] += g;
    Bd[br.from] += b + br.b / 2;
    Bd[br.to] += b + br.b / 2;
    for (const [i, k] of [[br.from, br.to], [br.to, br.from]]) {
      const e = rows[i].get(k) ?? { g: 0, b: 0 };
      e.g -= g;
      e.b -= b;
      rows[i].set(k, e);
    }
  }
  if (bsh) for (let i = 0; i < n; i++) Bd[i] += bsh[i];
  const adj: Adj[] = rows.map((m) => {
    const ks = [...m.keys()];
    return { j: Int32Array.from(ks), g: Float64Array.from(ks.map((k) => m.get(k)!.g)), b: Float64Array.from(ks.map((k) => m.get(k)!.b)) };
  });
  return { Gd, Bd, adj };
}

// ------------------------------------------------------------ dense LU

export interface LU {
  a: Float64Array;
  piv: Int32Array;
  n: number;
}

export function luFactor(A: Float64Array, n: number): LU {
  const a = A;
  const piv = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    let p = k;
    let mx = Math.abs(a[k * n + k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(a[i * n + k]);
      if (v > mx) {
        mx = v;
        p = i;
      }
    }
    piv[k] = p;
    if (p !== k) {
      for (let j = 0; j < n; j++) {
        const t = a[k * n + j];
        a[k * n + j] = a[p * n + j];
        a[p * n + j] = t;
      }
    }
    const d = a[k * n + k];
    if (Math.abs(d) < 1e-14) continue;
    for (let i = k + 1; i < n; i++) {
      const f = (a[i * n + k] /= d);
      if (f === 0) continue;
      const ri = i * n;
      const rk = k * n;
      for (let j = k + 1; j < n; j++) a[ri + j] -= f * a[rk + j];
    }
  }
  return { a, piv, n };
}

export function luSolve(lu: LU, rhs: Float64Array) {
  const { a, piv, n } = lu;
  const x = rhs;
  for (let k = 0; k < n; k++) {
    const p = piv[k];
    if (p !== k) {
      const t = x[k];
      x[k] = x[p];
      x[p] = t;
    }
  }
  for (let i = 0; i < n; i++) {
    let s = x[i];
    const r = i * n;
    for (let j = 0; j < i; j++) s -= a[r + j] * x[j];
    x[i] = s;
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i];
    const r = i * n;
    for (let j = i + 1; j < n; j++) s -= a[r + j] * x[j];
    const d = a[r + i];
    x[i] = Math.abs(d) < 1e-14 ? 0 : s / d;
  }
  return x;
}

// ------------------------------------------------------------ injections

function injections(n: number, Y: ReturnType<typeof buildY>, V: Float64Array, th: Float64Array, P: Float64Array, Q: Float64Array) {
  for (let i = 0; i < n; i++) {
    let p = V[i] * Y.Gd[i];
    let q = -V[i] * Y.Bd[i];
    const r = Y.adj[i];
    for (let k = 0; k < r.j.length; k++) {
      const j = r.j[k];
      const d = th[i] - th[j];
      const c = Math.cos(d);
      const s = Math.sin(d);
      p += V[j] * (r.g[k] * c + r.b[k] * s);
      q += V[j] * (r.g[k] * s - r.b[k] * c);
    }
    P[i] = V[i] * p;
    Q[i] = V[i] * q;
  }
}

// ------------------------------------------------------------ fast decoupled

export interface FdlfOptions {
  tol?: number;
  maxIter?: number;
  /** Warm start. */
  V0?: ArrayLike<number>;
  theta0?: ArrayLike<number>;
  enforceQ?: boolean;
}

/**
 * Solve one island. `buses` must contain exactly one slack.
 * Islands are handled by the caller (each solved separately).
 */
export function fdlf(buses: ACBus[], branches: ACBranch[], opt: FdlfOptions = {}): ACResult {
  const n = buses.length;
  const tol = opt.tol ?? 1e-6;
  const maxIter = opt.maxIter ?? 30;
  const types = buses.map((b) => b.type);
  const bsh = Float64Array.from(buses.map((b) => b.Bsh));
  const Y = buildY(n, branches, bsh);
  const V = new Float64Array(n);
  const th = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    V[i] = opt.V0 ? opt.V0[i] : types[i] === 'pq' ? 1 : buses[i].Vset;
    th[i] = opt.theta0 ? opt.theta0[i] : 0;
    if (types[i] !== 'pq') V[i] = buses[i].Vset;
  }
  const limited: number[] = [];
  const Qspec = Float64Array.from(buses.map((b) => b.Q));
  const Pspec = Float64Array.from(buses.map((b) => b.P));
  const Pc = new Float64Array(n);
  const Qc = new Float64Array(n);

  let factored = '';
  let luP: LU | null = null;
  let luQ: LU | null = null;
  let pIdx: number[] = [];
  let qIdx: number[] = [];
  const factor = () => {
    pIdx = [];
    qIdx = [];
    for (let i = 0; i < n; i++) {
      if (types[i] !== 'slack') pIdx.push(i);
      if (types[i] === 'pq') qIdx.push(i);
    }
    const key = types.join('');
    if (key === factored) return;
    factored = key;
    // B': series reactance only (XB scheme ignores r here)
    const posP = new Int32Array(n).fill(-1);
    pIdx.forEach((b, k) => (posP[b] = k));
    const np = pIdx.length;
    const Bp = new Float64Array(np * np);
    for (const br of branches) {
      if (!br.closed || br.from === br.to) continue;
      const y = 1 / br.x;
      const a = posP[br.from];
      const c = posP[br.to];
      if (a >= 0) Bp[a * np + a] += y;
      if (c >= 0) Bp[c * np + c] += y;
      if (a >= 0 && c >= 0) {
        Bp[a * np + c] -= y;
        Bp[c * np + a] -= y;
      }
    }
    luP = luFactor(Bp, np);
    // B'': −imag(Y) restricted to PQ buses
    const posQ = new Int32Array(n).fill(-1);
    qIdx.forEach((b, k) => (posQ[b] = k));
    const nq = qIdx.length;
    const Bq = new Float64Array(nq * nq);
    qIdx.forEach((i, a) => {
      Bq[a * nq + a] = -Y.Bd[i];
      const r = Y.adj[i];
      for (let k = 0; k < r.j.length; k++) {
        const c = posQ[r.j[k]];
        if (c >= 0) Bq[a * nq + c] = -r.b[k];
      }
    });
    luQ = luFactor(Bq, nq);
  };

  let it = 0;
  let mis = Infinity;
  let converged = false;
  factor();
  for (it = 1; it <= maxIter; it++) {
    injections(n, Y, V, th, Pc, Qc);
    // P–θ half step
    const dP = new Float64Array(pIdx.length);
    let mP = 0;
    pIdx.forEach((i, k) => {
      const d = Pspec[i] - Pc[i];
      mP = Math.max(mP, Math.abs(d));
      dP[k] = d / V[i];
    });
    luSolve(luP!, dP);
    pIdx.forEach((i, k) => (th[i] += dP[k]));
    // Q–V half step
    injections(n, Y, V, th, Pc, Qc);
    const dQ = new Float64Array(qIdx.length);
    let mQ = 0;
    qIdx.forEach((i, k) => {
      const d = Qspec[i] - Qc[i];
      mQ = Math.max(mQ, Math.abs(d));
      dQ[k] = d / V[i];
    });
    if (qIdx.length) luSolve(luQ!, dQ);
    qIdx.forEach((i, k) => {
      V[i] += dQ[k];
      if (V[i] < 0.05) V[i] = 0.05;
    });
    mis = Math.max(mP, mQ);
    if (!Number.isFinite(mis) || mis > 1e3) break;
    if (mis < tol) {
      // reactive limits: convert violating PV buses to PQ and continue
      if (opt.enforceQ !== false) {
        injections(n, Y, V, th, Pc, Qc);
        let changed = false;
        for (let i = 0; i < n; i++) {
          if (types[i] !== 'pv') continue;
          const qg = Qc[i] - buses[i].Q;
          if (qg > buses[i].Qmax + 1e-6 || qg < buses[i].Qmin - 1e-6) {
            types[i] = 'pq';
            Qspec[i] = buses[i].Q + (qg > buses[i].Qmax ? buses[i].Qmax : buses[i].Qmin);
            limited.push(i);
            changed = true;
          }
        }
        if (changed) {
          factor();
          continue;
        }
      }
      converged = true;
      break;
    }
  }
  injections(n, Y, V, th, Pc, Qc);
  const Qgen = new Float64Array(n);
  for (let i = 0; i < n; i++) if (buses[i].type !== 'pq') Qgen[i] = Qc[i] - buses[i].Q;
  return { V, theta: th, converged, iterations: it, Qgen, limited, mismatch: mis };
}

// ------------------------------------------------------------ Newton–Raphson (reference)

export function newtonRaphson(buses: ACBus[], branches: ACBranch[], tol = 1e-9, maxIter = 20): ACResult {
  const n = buses.length;
  const Y = buildY(n, branches, buses.map((b) => b.Bsh));
  const V = Float64Array.from(buses.map((b) => (b.type === 'pq' ? 1 : b.Vset)));
  const th = new Float64Array(n);
  const pv = buses.map((_, i) => i).filter((i) => buses[i].type !== 'slack');
  const pq = buses.map((_, i) => i).filter((i) => buses[i].type === 'pq');
  const Pc = new Float64Array(n);
  const Qc = new Float64Array(n);
  // dense G, B
  const G = new Float64Array(n * n);
  const B = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    G[i * n + i] = Y.Gd[i];
    B[i * n + i] = Y.Bd[i];
    const r = Y.adj[i];
    for (let k = 0; k < r.j.length; k++) {
      G[i * n + r.j[k]] = r.g[k];
      B[i * n + r.j[k]] = r.b[k];
    }
  }
  let it = 0;
  let mis = Infinity;
  for (it = 1; it <= maxIter; it++) {
    injections(n, Y, V, th, Pc, Qc);
    const m = pv.length + pq.length;
    const F = new Float64Array(m);
    pv.forEach((i, k) => (F[k] = buses[i].P - Pc[i]));
    pq.forEach((i, k) => (F[pv.length + k] = buses[i].Q - Qc[i]));
    mis = F.reduce((a, v) => Math.max(a, Math.abs(v)), 0);
    if (mis < tol) break;
    const J = new Float64Array(m * m);
    const col = (i: number, isV: boolean) => (isV ? pv.length + pq.indexOf(i) : pv.indexOf(i));
    const rows: [number, boolean][] = [...pv.map((i) => [i, false] as [number, boolean]), ...pq.map((i) => [i, true] as [number, boolean])];
    rows.forEach(([i, isQ], r) => {
      rows.forEach(([j, isV], c) => {
        let v: number;
        if (i === j) {
          const Gii = G[i * n + i];
          const Bii = B[i * n + i];
          if (!isQ && !isV) v = -Qc[i] - Bii * V[i] * V[i];
          else if (!isQ && isV) v = Pc[i] / V[i] + Gii * V[i];
          else if (isQ && !isV) v = Pc[i] - Gii * V[i] * V[i];
          else v = Qc[i] / V[i] - Bii * V[i];
        } else {
          const Gij = G[i * n + j];
          const Bij = B[i * n + j];
          const d = th[i] - th[j];
          const c0 = Math.cos(d);
          const s0 = Math.sin(d);
          if (!isQ && !isV) v = V[i] * V[j] * (Gij * s0 - Bij * c0);
          else if (!isQ && isV) v = V[i] * (Gij * c0 + Bij * s0);
          else if (isQ && !isV) v = -V[i] * V[j] * (Gij * c0 + Bij * s0);
          else v = V[i] * (Gij * s0 - Bij * c0);
        }
        J[r * m + c] = v;
      });
    });
    void col;
    const lu = luFactor(J, m);
    luSolve(lu, F);
    pv.forEach((i, k) => (th[i] += F[k]));
    pq.forEach((i, k) => (V[i] += F[pv.length + k]));
  }
  injections(n, Y, V, th, Pc, Qc);
  const Qgen = new Float64Array(n);
  for (let i = 0; i < n; i++) if (buses[i].type !== 'pq') Qgen[i] = Qc[i] - buses[i].Q;
  return { V, theta: th, converged: mis < tol, iterations: it, Qgen, limited: [], mismatch: mis };
}

/** Branch flows from a solved state: from-end P, Q (pu) and current magnitude (pu). */
export function branchFlows(br: ACBranch, V: ArrayLike<number>, th: ArrayLike<number>) {
  if (!br.closed) return { P: 0, Q: 0, I: 0 };
  const z2 = br.r * br.r + br.x * br.x;
  const g = br.r / z2;
  const b = -br.x / z2;
  const Vi = V[br.from];
  const Vj = V[br.to];
  const d = th[br.from] - th[br.to];
  const P = Vi * Vi * g - Vi * Vj * (g * Math.cos(d) + b * Math.sin(d));
  const Q = -Vi * Vi * (b + br.b / 2) - Vi * Vj * (g * Math.sin(d) - b * Math.cos(d));
  return { P, Q, I: Math.hypot(P, Q) / Math.max(Vi, 0.05) };
}
