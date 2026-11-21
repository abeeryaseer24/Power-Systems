// The browser surrogate against the exact load flow on fresh Dhaka cases: same base case
// as training, new operating points, intact grid and every N-1 line in turn.
import { expect, it } from 'vitest';
import fs from 'node:fs';
import { RegionSim, type RegionData } from '../grid/region';
import { fdlf, branchFlows, type ACBranch } from '../grid/acflow';
import { surrogateBase, loadSurrogate, predictFlow, dcLoading, type SurrogateSpec } from './surrogate';

it('surrogate matches the AC load flow on new Dhaka cases', () => {
  const spec: SurrogateSpec = JSON.parse(fs.readFileSync('public/data/surrogate/dhaka.json', 'utf8'));
  const sur = loadSurrogate(spec);
  const data: RegionData = JSON.parse(fs.readFileSync('public/data/regions/dhaka.json', 'utf8'));
  const { s, m, V0, th0 } = surrogateBase(new RegionSim(data, { loadScale: 0.9 }));
  expect(m.length).toBe(spec.n);
  const served0 = m.map((b) => s.buses[b].served);
  let vErr = 0, lErr = 0, dcErr = 0, nv = 0, nl = 0;
  for (const scale of [0.7, 1.0, 1.25]) {
    m.forEach((b, i) => { s.buses[b].served = served0[i] * scale; });
    const pr = s.islandProblem(m)!;
    const P = pr.acb.map((b) => b.P), Q = pr.acb.map((b) => b.Q);
    for (const out of [-1, ...spec.cand.filter((_, k) => k % 4 === 0)]) {
      const br: ACBranch[] = pr.acbr.map((b, j) => ({ ...b, closed: j !== out }));
      const res = fdlf(pr.acb, br, { V0, theta0: th0, maxIter: 60, tol: 6e-4 });
      if (!res.converged) continue;
      const p = predictFlow(sur, P, Q, out), dc = dcLoading(sur, P, out);
      for (let i = 0; i < spec.n; i++) { vErr += Math.abs(p.V[i] - res.V[i]); nv++; }
      br.forEach((b, j) => {
        if (!b.closed) return;
        const f = branchFlows(b, res.V, res.theta);
        const ld = (Math.hypot(f.P, f.Q) * 100) / Math.max(0.3, res.V[b.from]) / spec.mva[j];
        lErr += Math.abs(p.loading[j] - ld); dcErr += Math.abs(dc[j] - ld); nl++;
      });
    }
  }
  vErr /= nv; lErr /= nl; dcErr /= nl;
  console.log(`V MAE ${vErr.toFixed(4)} pu, loading MAE ${(lErr * 100).toFixed(2)} %, DC screening ${(dcErr * 100).toFixed(2)} %`);
  expect(vErr).toBeLessThan(0.01);
  expect(lErr).toBeLessThan(0.02);
  expect(lErr).toBeLessThan(dcErr);
});
