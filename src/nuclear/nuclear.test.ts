import { describe, expect, it } from 'vitest';
import { Reactor, SPECS, BETA } from './reactor';
import { PLANTS, buildReactor } from './plants';

describe('reactor model', () => {
  it('holds steady at rated power', () => {
    const r = new Reactor(SPECS.rooppur);
    r.advance(120);
    expect(r.s.n).toBeGreaterThan(0.97);
    expect(r.s.n).toBeLessThan(1.03);
  });
  it('a scram drops fission power to a few percent within a minute and leaves decay heat', () => {
    const r = new Reactor(SPECS.rooppur);
    r.scram('test');
    r.advance(60);
    expect(r.s.n).toBeLessThan(0.05);
    expect(r.decay / r.spec.P0).toBeGreaterThan(0.02);
    expect(r.decay / r.spec.P0).toBeLessThan(0.07);
  });
  it('a step of +0.1 beta gives a stable period near the inhour value', () => {
    const r = new Reactor({ ...SPECS.rooppur, aFuel: 0, aMod: 0, aVoid: 0 });
    r.rps = false;
    r.extraRho += 0.1 * BETA;
    r.advance(3);
    expect(r.period).toBeGreaterThan(20);
    expect(r.period).toBeLessThan(200);
  });
  for (const p of PLANTS) {
    it(`${p.id}: historical scenario runs`, () => {
      const r = buildReactor(p, 'watch');
      let peak = 0;
      let lowLevel = 1;
      const step = p.span / 400;
      for (let t = 0; t < p.span; t += step) {
        r.advance(step);
        peak = Math.max(peak, r.s.n);
        lowLevel = Math.min(lowLevel, r.level);
      }
      console.log(`${p.id}: peak n ${peak.toFixed(2)} min level ${lowLevel.toFixed(2)} Tf ${Math.round(r.s.Tf)} damage ${r.s.damage.toFixed(2)} h2 ${Math.round(r.s.h2)} destroyed ${r.s.destroyed}`);
      expect(Number.isFinite(r.s.Tf)).toBe(true);
    });
  }
});
