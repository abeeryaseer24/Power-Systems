import { describe, expect, it } from 'vitest';
import { branchFlows, fdlf, newtonRaphson, type ACBranch, type ACBus } from './acflow';
import { LINES } from './network';

const pq = (P: number, Q: number): ACBus => ({ type: 'pq', P, Q, Vset: 1, Qmin: 0, Qmax: 0, Bsh: 0 });
const slack = (V = 1): ACBus => ({ type: 'slack', P: 0, Q: 0, Vset: V, Qmin: -99, Qmax: 99, Bsh: 0 });

describe('AC power flow', () => {
  it('matches the closed-form receiving-end voltage of a lossless two-bus line', () => {
    const P = 1.2;
    const Q = 0.4;
    const x = 0.25;
    // V^4 + (2Qx - 1) V^2 + x^2 (P^2 + Q^2) = 0, upper root
    const a = 2 * Q * x - 1;
    const c = x * x * (P * P + Q * Q);
    const V2 = (-a + Math.sqrt(a * a - 4 * c)) / 2;
    const br: ACBranch[] = [{ from: 0, to: 1, r: 0, x, b: 0, closed: true }];
    const nr = newtonRaphson([slack(), pq(-P, -Q)], br);
    const fd = fdlf([slack(), pq(-P, -Q)], br, { tol: 1e-9, maxIter: 100 });
    expect(nr.converged).toBe(true);
    expect(fd.converged).toBe(true);
    expect(nr.V[1]).toBeCloseTo(Math.sqrt(V2), 8);
    expect(fd.V[1]).toBeCloseTo(Math.sqrt(V2), 6);
  });

  it('fails to converge beyond the nose of the PV curve (voltage collapse)', () => {
    const x = 0.25;
    // maximum transfer at unity pf for Vs=1 is 1/(2x) = 2 pu
    const br: ACBranch[] = [{ from: 0, to: 1, r: 0, x, b: 0, closed: true }];
    expect(fdlf([slack(), pq(-1.9, 0)], br, { maxIter: 200 }).converged).toBe(true);
    expect(fdlf([slack(), pq(-2.2, 0)], br, { maxIter: 200 }).converged).toBe(false);
  });

  it('agrees with Newton–Raphson on the Halvern ring with losses, charging and PV buses', () => {
    const n = 13;
    const buses: ACBus[] = Array.from({ length: n }, () => pq(-1.6, -0.5));
    buses[9] = { type: 'slack', P: 0, Q: 0, Vset: 1.02, Qmin: -9, Qmax: 9, Bsh: 0 };
    for (const [i, P] of [[1, 6], [10, 6], [0, 3]] as const) buses[i] = { type: 'pv', P, Q: 0, Vset: 1.01, Qmin: -9, Qmax: 9, Bsh: 0 };
    const br: ACBranch[] = LINES.map((l) => ({ from: l.from, to: l.to, r: l.x * 0.1, x: l.x, b: 0.08, closed: true }));
    const nr = newtonRaphson(buses, br);
    const fd = fdlf(buses, br, { tol: 1e-8, maxIter: 100, enforceQ: false });
    expect(nr.converged).toBe(true);
    expect(fd.converged).toBe(true);
    for (let i = 0; i < n; i++) {
      expect(fd.V[i]).toBeCloseTo(nr.V[i], 5);
      expect(fd.theta[i]).toBeCloseTo(nr.theta[i], 5);
    }
    // power balance: generation = load + losses > load
    const loss = br.reduce((a, b) => a + branchFlows(b, nr.V, nr.theta).P + branchFlows({ ...b, from: b.to, to: b.from }, nr.V, nr.theta).P, 0);
    expect(loss).toBeGreaterThan(0);
  });

  it('caps a generator at its reactive limit and lets the voltage sag', () => {
    const br: ACBranch[] = [
      { from: 0, to: 1, r: 0.01, x: 0.2, b: 0, closed: true },
      { from: 1, to: 2, r: 0.01, x: 0.1, b: 0, closed: true },
    ];
    const buses: ACBus[] = [slack(), { type: 'pv', P: 0.2, Q: 0, Vset: 1.0, Qmin: -0.1, Qmax: 0.1, Bsh: 0 }, pq(-0.8, -0.4)];
    const r = fdlf(buses, br, { maxIter: 100 });
    expect(r.converged).toBe(true);
    expect(r.limited).toContain(1);
    expect(r.V[1]).toBeLessThan(1);
  });
});
