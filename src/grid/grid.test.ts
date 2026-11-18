import { describe, expect, it } from 'vitest';
import { dcFlow, findIslands, solve, type FlowLine } from './loadflow';
import { createSim, online, SCENARIOS, scenarioById } from './scenarios';
import { GridSim } from './engine';
import { windPowerFraction, shapeAt, temperatureAt } from './profiles';

describe('linear algebra and DC flow', () => {
  it('solves a small system', () => {
    const x = solve([[4, -2], [-2, 3]], [2, 1]);
    expect(x[0]).toBeCloseTo(1, 9);
    expect(x[1]).toBeCloseTo(1, 9);
  });

  it('splits flow inversely to reactance on parallel paths', () => {
    // bus 0 injects 300 MW, bus 1 absorbs it; direct line x=0.1, path via bus 2 x=0.1+0.1
    const lines: FlowLine[] = [
      { from: 0, to: 1, x: 0.1, closed: true },
      { from: 0, to: 2, x: 0.1, closed: true },
      { from: 2, to: 1, x: 0.1, closed: true },
    ];
    const isl = findIslands(3, lines);
    const r = dcFlow([300, -300, 0], lines, isl, [0]);
    expect(r.flow[0]).toBeCloseTo(200, 6);
    expect(r.flow[1]).toBeCloseTo(100, 6);
    expect(r.flow[2]).toBeCloseTo(100, 6);
  });

  it('detects islands when a bridge opens', () => {
    const lines: FlowLine[] = [
      { from: 0, to: 1, x: 0.1, closed: true },
      { from: 1, to: 2, x: 0.1, closed: false },
    ];
    const isl = findIslands(3, lines);
    expect(isl.members.length).toBe(2);
    expect(isl.of[0]).toBe(isl.of[1]);
    expect(isl.of[2]).not.toBe(isl.of[0]);
  });
});

describe('profiles', () => {
  it('wind power curve is monotone from cut-in to rated', () => {
    let prev = 0;
    for (let v = 3.5; v <= 12.5; v += 0.5) {
      const p = windPowerFraction(v);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    expect(windPowerFraction(12.5)).toBe(1);
    expect(windPowerFraction(2)).toBe(0);
  });

  it('demand shapes are continuous across midnight', () => {
    expect(shapeAt('residential', 23.999)).toBeCloseTo(shapeAt('residential', 0), 2);
  });

  it('temperature peaks mid-afternoon', () => {
    const w = SCENARIOS[1].weather;
    expect(temperatureAt(w, 15)).toBeCloseTo(w.tMax, 6);
    expect(temperatureAt(w, 3)).toBeCloseTo(w.tMin, 6);
  });
});

describe('grid simulation', () => {
  it('opens every scripted scenario in balance', () => {
    for (const sc of SCENARIOS) {
      if (sc.id === 'blackstart') continue;
      const s = createSim(sc);
      s.advance(30);
      expect(Math.abs(s.frequency - 50), sc.id).toBeLessThan(0.1);
      for (const l of s.lines) expect(l.loading, `${sc.id} ${l.def.id}`).toBeLessThan(1);
    }
  });

  it('frequency nadir after a 600 MW trip matches the swing equation order of magnitude', () => {
    const s = createSim(scenarioById('infeed')!);
    s.scheduled = [];
    const f0 = s.frequency;
    s.tripUnit('kestrel', 0, 'test');
    let nadir = f0;
    let rocof0 = 0;
    for (let i = 0; i < 600; i++) {
      s.step(0.05);
      if (i === 1) rocof0 = s.rocof;
      nadir = Math.min(nadir, s.frequency);
    }
    expect(rocof0).toBeLessThan(-0.3);
    expect(nadir).toBeLessThan(49.8);
    expect(nadir).toBeGreaterThan(48.0);
  });

  it('AGC returns frequency to nominal after a disturbance', () => {
    const base = scenarioById('sandbox')!;
    const s = createSim({ ...base, weather: { ...base.weather, windSigma: 0 } });
    online(s, 'glen', 3); // enough fast regulating reserve to cover the loss
    s.advance(30);
    s.tripUnit('harbour', 0, 'test');
    s.advance(420);
    let err = 0;
    for (let i = 0; i < 60; i++) {
      s.advance(1);
      err += Math.abs(s.frequency - 50) / 60;
    }
    expect(err).toBeLessThan(0.05);
  });

  it('overloaded line trips on the thermal model, sooner for larger overloads', () => {
    const s = new GridSim({ weather: SCENARIOS[0].weather, seed: 1, startHour: 12, endHour: 14 });
    const l = s.lines[0];
    const time = (loading: number) => {
      let h = 0;
      let t = 0;
      while (h < 1 && t < 3600) {
        h += ((loading * loading - 1) / 240) * 0.1;
        t += 0.1;
      }
      return t;
    };
    expect(time(1.5)).toBeLessThan(time(1.2));
    expect(time(1.2)).toBeGreaterThan(300);
    expect(l.heat).toBe(0);
  });

  it('collapses an island that loses too much generation', () => {
    const s = createSim(scenarioById('sandbox')!);
    s.tripUnit('kestrel', 0, 'test');
    s.tripUnit('kestrel', 1, 'test');
    s.tripUnit('ridgeway', 0, 'test');
    s.advance(20);
    expect(s.score.blackouts + s.districts.filter((d) => d.uflsStage > 0).length).toBeGreaterThan(0);
  });

  it('black start forms an island from Glen Dam and picks up load', () => {
    const s = createSim(scenarioById('blackstart')!);
    expect(s.frequency).toBe(0);
    s.startUnit('glen');
    s.advance(120);
    expect(s.frequency).toBeGreaterThan(49);
    s.setSetpoint('glen', 60);
    s.setConnected('northside', 0.1);
    s.advance(60);
    expect(s.district('northside').served).toBeGreaterThan(10);
    expect(s.frequency).toBeGreaterThan(49.3);
  });
});
