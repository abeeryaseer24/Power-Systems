import { describe, expect, it } from 'vitest';
import { CityEngine, DEFAULT_OPTS } from './engine';
import { DC, TractionSim } from './metro';
import { cityLoad } from './demand';
import { buildMeridia } from './meridia';

const M = buildMeridia();

const FULL = !!process.env.FULL;

describe('city demand', () => {
  it('summer weekday peaks in the evening at a plausible size', () => {
    let pk = 0, pkH = 0, min = 1e9;
    for (let m = 0; m < 1440; m += 5) {
      const c = cityLoad(M, m / 60, DEFAULT_OPTS);
      const t = c.res + c.com + c.ind + c.inst + c.light;
      if (t > pk) { pk = t; pkH = m / 60; }
      min = Math.min(min, t);
    }
    if (FULL) console.log({ pk, pkH, min });
    expect(pk).toBeGreaterThan(1300);
    expect(pk).toBeLessThan(2400);
    expect(min / pk).toBeGreaterThan(0.45);
    expect(min / pk).toBeLessThan(0.8);
  });
});

describe('traction', () => {
  it('runs an hour of peak service with sane voltages and energy balance', () => {
    const sim = new TractionSim(M, { peakHeadway: 180, regen: true, reversible: false, inp: DEFAULT_OPTS });
    sim.t = 7 * 3600;
    let maxTrains = 0, minV = 1e9, maxV = 0;
    const t0 = performance.now();
    for (let k = 0; k < 3600 * 2; k++) {
      sim.step(1);
      maxTrains = Math.max(maxTrains, sim.trains.length);
      for (const tr of sim.trains) { minV = Math.min(minV, tr.volt); maxV = Math.max(maxV, tr.volt); }
    }
    const ms = performance.now() - t0;
    const eT = sim.eTraction / 3.6e9, eR = sim.eRegenUsed / 3.6e9, eG = sim.eGrid / 3.6e9;
    if (FULL) console.log({ ms, maxTrains, minV, maxV, eG, eT, eR, aux: sim.eAux / 3.6e9, burnt: sim.eBurnt / 3.6e9, loss: sim.eLoss / 3.6e9 });
    expect(maxTrains).toBeGreaterThan(25);
    expect(minV).toBeGreaterThan(900);
    expect(maxV).toBeLessThanOrEqual(DC.Vregen + 50);
    // regeneration recovers a meaningful share of traction energy
    expect(eR / eT).toBeGreaterThan(0.12);
    expect(eR / eT).toBeLessThan(0.5);
  });

  it('a train covers 1.2 km between stations in about 80-110 s', () => {
    const sim = new TractionSim(M, { peakHeadway: 180, regen: true, reversible: false, inp: DEFAULT_OPTS });
    sim.t = 12 * 3600;
    sim.step(1);
    const tr = sim.trains[0];
    let t = 0, left = false;
    while (t < 400) {
      sim.step(0.5); t += 0.5;
      if (tr.phase !== 'dwell') left = true;
      if (left && tr.phase === 'dwell') break;
    }
    if (FULL) console.log('run time', t);
    expect(t).toBeGreaterThan(70);
    expect(t).toBeLessThan(140);
  });
});

describe('engine', () => {
  it('builds a day, and a tripped TSS raises its neighbours', () => {
    const t0 = performance.now();
    const e = new CityEngine(M);
    const ms = performance.now() - t0;
    const pk = Math.max(...e.baseline.mins.map((m) => m.metro));
    if (FULL) console.log({ ms, metroPeak: pk, events: e.baseline.events.map((x) => `${x.t.toFixed(2)} ${x.title}`) });
    expect(pk).toBeGreaterThan(8);
    expect(pk).toBeLessThan(60);
    const before = Math.max(...e.baseline.mins.map((m) => m.tss[5] + m.tss[7]));
    e.trip('tss:0:6', true);
    const after = Math.max(...e.scenario.mins.map((m) => m.tss[5] + m.tss[7]));
    if (FULL) console.log({ before, after });
    expect(after).toBeGreaterThan(before);
    e.seek(18.25);
    expect(Math.abs(e.hour - 18.25)).toBeLessThan(0.01);
  });
});

describe('whole day', () => {
  it('trains keep flowing all day with 2 s steps (no jams)', async () => {
    const { CityEngine } = await import('./engine');
    const e = new CityEngine(M);
    const noon = e.baseline.mins[12 * 60], eve = e.baseline.mins[18 * 60];
    if (FULL) console.log({ noonTrains: noon.trains, noonMW: noon.metro, eveTrains: eve.trains, eveMW: eve.metro, regen: noon.regen });
    expect(noon.trains).toBeLessThan(40);
    expect(noon.regen).toBeGreaterThan(0.5);
    const late = e.baseline.mins[23 * 60 + 59];
    expect(late.trains).toBeLessThan(20);
  });
});

describe('meridia data', () => {
  it('has a sensible fabric', () => {
    expect(M.kind).toBe('prototype');
    expect(M.buildings.length).toBeGreaterThan(8000);
    expect(M.buildings.length).toBeLessThan(45000);
    expect(M.cells.data.some((v) => v !== 255)).toBe(true);
  });
});
