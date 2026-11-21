// Generates training data for the AC power-flow surrogate (Phase B). Run with:
//   DATA=1 REGIONS=dhaka,adelaide,london N=20000 npx vitest run src/ai/surrogate-data.test.ts
// Each grid is settled once in the simulator to get its operating state (shunt switching,
// dispatch, external tie). Each sample then redraws the operating point - a system load level,
// per-bus load noise, a new dispatch of every plant, inverter output from zero to full - and
// with probability 0.75 takes out one line (N-1; lines whose loss would island part of the
// grid are left out, they are a topology question, not a power-flow one). The fast decoupled
// load flow, warm-started from the base case as it would be in a control room, gives the
// labels: every bus voltage, every line loading, and whether the case solved at all.
// Output: ml/data/surrogate/<region>.json (meta) + <region>.bin (Float32 rows).
import { it } from 'vitest';
import fs from 'node:fs';
import { RegionSim, type RegionData } from '../grid/region';
import { fdlf, branchFlows, type ACBranch } from '../grid/acflow';
import { mulberry32 } from '../grid/profiles';
import { surrogateBase, isSync } from './surrogate';

const OUT = 'ml/data/surrogate';

/** Indices of branches whose removal keeps the island connected (not bridges). */
export function nonBridges(n: number, br: { from: number; to: number }[]) {
  const ok: number[] = [];
  for (let k = 0; k < br.length; k++) {
    const adj: number[][] = Array.from({ length: n }, () => []);
    br.forEach((b, j) => { if (j !== k) { adj[b.from].push(b.to); adj[b.to].push(b.from); } });
    const seen = new Uint8Array(n); const st = [0]; seen[0] = 1; let c = 1;
    while (st.length) { const u = st.pop()!; for (const v of adj[u]) if (!seen[v]) { seen[v] = 1; c++; st.push(v); } }
    if (c === n) ok.push(k);
  }
  return ok;
}

it.skipIf(!process.env.DATA)('generate power-flow surrogate samples', () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ids = (process.env.REGIONS ?? 'dhaka').split(',').filter(Boolean);
  const N = Number(process.env.N ?? 20000);
  for (const id of ids) {
    const data: RegionData = JSON.parse(fs.readFileSync(`public/data/regions/${id}.json`, 'utf8'));
    const { s, m, prob, V0, th0 } = surrogateBase(new RegionSim(structuredClone(data), { loadScale: 0.9 }));
    const n = m.length, L = prob.acbr.length;
    const cand = nonBridges(n, prob.acbr);
    const served0 = m.map((b) => s.buses[b].served);
    const gp0 = s.gens.map((g) => g.p);
    const rand = mulberry32(7919 + id.length * 31);
    const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
    const W = 2 * n + 1 + n + L + 1;
    const rows = new Float32Array(N * W);
    let bad = 0;
    const t0 = Date.now();
    for (let k = 0; k < N; k++) {
      const scale = 0.55 + rand() * 0.9;
      m.forEach((b, i) => { s.buses[b].served = served0[i] * scale * Math.exp(0.15 * gauss()); });
      s.gens.forEach((g, i) => {
        if (!g.online) return;
        g.p = isSync(g.def.kind) ? Math.min(g.avail, gp0[i] * scale * (0.6 + rand() * 0.65)) : g.def.mw * rand();
      });
      const pr = s.islandProblem(m)!;
      const out = rand() < 0.75 && cand.length ? cand[Math.floor(rand() * cand.length)] : -1;
      const br: ACBranch[] = pr.acbr.map((b, j) => ({ ...b, closed: j !== out }));
      const res = fdlf(pr.acb, br, { V0, theta0: th0, maxIter: 60, tol: 6e-4 });
      const o = k * W;
      pr.acb.forEach((b, i) => { rows[o + i] = b.P; rows[o + n + i] = b.Q; });
      rows[o + 2 * n] = out;
      if (res.converged) {
        for (let i = 0; i < n; i++) rows[o + 2 * n + 1 + i] = res.V[i];
        br.forEach((b, j) => {
          if (!b.closed) return;
          const f = branchFlows(b, res.V, res.theta);
          rows[o + 3 * n + 1 + j] = (Math.hypot(f.P, f.Q) * 100) / Math.max(0.3, res.V[b.from]) / s.branches[pr.brIdx[j]].def.mva;
        });
        rows[o + W - 1] = 1;
      } else bad++;
      if (k % 2000 === 0) console.log(`${id} ${k}/${N}  ${((Date.now() - t0) / (k + 1)).toFixed(1)} ms/sample  diverged ${bad}`);
    }
    fs.writeFileSync(`${OUT}/${id}.bin`, Buffer.from(rows.buffer));
    fs.writeFileSync(`${OUT}/${id}.json`, JSON.stringify({
      region: id, n, L, N, W, cand, diverged: bad,
      from: prob.acbr.map((b) => b.from), to: prob.acbr.map((b) => b.to), x: prob.acbr.map((b) => b.x),
      buses: m, branches: prob.brIdx, mva: prob.brIdx.map((i) => s.branches[i].def.mva),
      ms: (Date.now() - t0) / N,
    }));
    console.log(`${id}: ${n} buses, ${L} branches, ${cand.length} N-1 candidates, ${bad}/${N} diverged, ${((Date.now() - t0) / N).toFixed(2)} ms per load flow`);
  }
}, 48 * 3600e3);
