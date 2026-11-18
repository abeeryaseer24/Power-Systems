// DC power flow with island detection.
// Each island is solved separately; its slack bus absorbs the island's
// mismatch, which the frequency model then attributes to inertia/governors.

import { S_BASE } from './network';

export interface FlowLine {
  from: number;
  to: number;
  x: number;
  closed: boolean;
}

export interface Islands {
  /** island index per bus */
  of: number[];
  /** buses per island */
  members: number[][];
}

export function findIslands(nBus: number, lines: FlowLine[]): Islands {
  const parent = Array.from({ length: nBus }, (_, i) => i);
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  for (const l of lines) {
    if (!l.closed) continue;
    const a = find(l.from);
    const b = find(l.to);
    if (a !== b) parent[a] = b;
  }
  const rootIndex = new Map<number, number>();
  const of: number[] = new Array(nBus);
  const members: number[][] = [];
  for (let i = 0; i < nBus; i++) {
    const r = find(i);
    let k = rootIndex.get(r);
    if (k === undefined) {
      k = members.length;
      rootIndex.set(r, k);
      members.push([]);
    }
    of[i] = k;
    members[k].push(i);
  }
  return { of, members };
}

/** Solve A·x = b in place by Gaussian elimination with partial pivoting. */
export function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (p !== c) {
      [A[p], A[c]] = [A[c], A[p]];
      [b[p], b[c]] = [b[c], b[p]];
    }
    const d = A[c][c];
    if (Math.abs(d) < 1e-12) continue;
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / d;
      if (f === 0) continue;
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k];
    x[r] = Math.abs(A[r][r]) < 1e-12 ? 0 : s / A[r][r];
  }
  return x;
}

export interface FlowResult {
  /** Bus voltage angle, radians. */
  theta: number[];
  /** Line flow from→to, MW (0 for open lines). */
  flow: number[];
  /** Power the slack of each island had to absorb, MW (gen − load mismatch). */
  slackMismatch: number[];
}

/**
 * @param injection net injection per bus, MW (generation − load)
 * @param slackOf   preferred slack bus per island (index = island)
 */
export function dcFlow(
  injection: number[],
  lines: FlowLine[],
  islands: Islands,
  slackOf: number[],
): FlowResult {
  const n = injection.length;
  const theta = new Array(n).fill(0);
  const slackMismatch: number[] = [];

  islands.members.forEach((bus, k) => {
    const total = bus.reduce((s, b) => s + injection[b], 0);
    slackMismatch[k] = total;
    if (bus.length < 2) return;
    const slack = slackOf[k] ?? bus[0];
    // Distribute the mismatch so the reduced system is balanced: the slack
    // bus takes it all (classic DC flow); frequency handles the rest.
    const idx = new Map<number, number>();
    const others = bus.filter((b) => b !== slack);
    others.forEach((b, i) => idx.set(b, i));
    const m = others.length;
    const B = Array.from({ length: m }, () => new Array(m).fill(0));
    for (const l of lines) {
      if (!l.closed) continue;
      if (islands.of[l.from] !== k) continue;
      const y = 1 / l.x;
      const i = idx.get(l.from);
      const j = idx.get(l.to);
      if (i !== undefined) B[i][i] += y;
      if (j !== undefined) B[j][j] += y;
      if (i !== undefined && j !== undefined) {
        B[i][j] -= y;
        B[j][i] -= y;
      }
    }
    const P = others.map((b) => injection[b] / S_BASE);
    const th = solve(B, P);
    others.forEach((b, i) => (theta[b] = th[i]));
    theta[slack] = 0;
  });

  const flow = lines.map((l) => (l.closed ? ((theta[l.from] - theta[l.to]) / l.x) * S_BASE : 0));
  return { theta, flow, slackMismatch };
}
