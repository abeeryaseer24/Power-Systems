import { expect, it } from 'vitest';
import { Reactor, SPECS } from './reactor';

it('startup: subcritical at full insertion, supercritical once rods pass the critical position', () => {
  const r = new Reactor(SPECS.rooppur, { power: 1e-8, rods: 0.45 });
  r.s.rods = r.s.rodTarget = 0.95;
  r.s.turbineOnline = false;
  r.advance(30);
  const nSub = r.s.n;
  expect(r.rho).toBeLessThan(0);
  r.s.rodTarget = 0.446;
  r.advance(400);
  console.log('subcritical n', nSub.toExponential(2), 'after withdrawal n', r.s.n.toExponential(2), 'period', r.period.toFixed(1), 'scram', r.s.scram);
  expect(r.s.n).toBeGreaterThan(nSub * 10);
  expect(r.s.scram).toBe(false);
});
