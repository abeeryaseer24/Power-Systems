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

describe('telecom', () => {
  it('a 6-hour substation outage drains batteries, then sites drop out', async () => {
    const { CityEngine } = await import('./engine');
    const e = new CityEngine(M);
    const sites = e.net.sites.length;
    e.trip('eastfield', true, [18, 24]);
    const t = e.telecom.mins;
    const at = (h: number) => t[Math.floor(h * 60)];
    if (FULL) console.log({ sites, before: at(17.9), plus10: at(18.2), plus3h: at(21), plus5h: at(23) });
    expect(sites).toBeGreaterThan(800);
    expect(sites).toBeLessThan(5000);
    expect(at(17.9).battery).toBe(0);
    expect(at(18.2).battery).toBeGreaterThan(20);
    expect(at(23).down).toBeGreaterThan(at(18.2).down);
    expect(at(23).served).toBeLessThan(at(17.9).served);
  });
});

describe('hospital', () => {
  it('Type 10 transfer, shedding with a failed set, and running dry', async () => {
    const { firstMinutes, threeDays, HOSPITALS, DEFAULT_HOSPITAL } = await import('./hospital');
    const def = HOSPITALS.meridia;
    const f = firstMinutes(def, DEFAULT_HOSPITAL);
    expect(f.secs[5].on.life).toBe(false);
    expect(f.secs[10].on.life && f.secs[10].on.critical).toBe(true);
    expect(f.secs[5].on.critical).toBe(true); // UPS bridges the gap
    const twoDown = firstMinutes(def, { ...DEFAULT_HOSPITAL, failToStart: 2 });
    expect(twoDown.secs[60].on.equipment).toBe(false);
    const long = threeDays(def, { ...DEFAULT_HOSPITAL, duration: 72, fuelH: 24 });
    expect(long.dryAt).toBeGreaterThan(0);
    const refuel = threeDays(def, { ...DEFAULT_HOSPITAL, duration: 72, fuelH: 60, refuel: true });
    expect(refuel.dryAt).toBeLessThan(0);
  });
});

describe('ev and water', () => {
  it('EV load is plausible, smart charging moves it to the night, an outage dries the taps', async () => {
    const { CityEngine } = await import('./engine');
    const e = new CityEngine(M);
    const evAt = (h: number) => { const q = e.ev.mins[Math.floor(h * 60)]; return q.home + q.work + q.hub; };
    const peakEv = Math.max(...e.ev.mins.map((q) => q.home + q.work + q.hub));
    const water = Math.max(...e.water.mins.map((q) => q.mw));
    if (FULL) console.log({ evs: Math.round(e.ev.evs), dailyMWh: e.ev.dailyMWh, peakEv, at20: evAt(20), at3: evAt(3), hubs: e.hubs.length, water, dayPeak: Math.max(...e.baseline.mins.map((m) => m.total)) });
    expect(peakEv).toBeGreaterThan(5);
    expect(peakEv).toBeLessThan(200);
    expect(water).toBeGreaterThan(1);
    expect(water).toBeLessThan(40);
    e.setOpts({ smartCharging: true });
    expect(evAt(3)).toBeGreaterThan(evAt(20) * 0.5);
    e.trip('eastfield', true, [6, 20]);
    const d = e.city.districts.findIndex((q) => q.sub === 'eastfield');
    const p = (h: number) => e.water.pressure[d * 1440 + Math.floor(h * 60)];
    if (FULL) console.log({ p7: p(7), p10: p(10), p14: p(14), p21: p(21) });
    expect(p(5.9)).toBe(0);
    expect(Math.max(p(14), p(16), p(19))).toBeGreaterThan(0);
  });
});

describe('city blackout', () => {
  it('signals fail first, phones within hours, water later; restoration brings them back', async () => {
    const { CityEngine } = await import('./engine');
    const { runCascade, DEFAULT_CASCADE } = await import('./cascade');
    const e = new CityEngine(M);
    const c = runCascade(M, e, { ...DEFAULT_CASCADE, hours: 16 });
    const L = c.lanes, t0 = c.t0;
    expect(L.grid[t0 - 5].v).toBeCloseTo(1, 6);
    expect(L.grid[t0 + 5].v).toBe(0);
    expect(L.signals[t0 + 5].v).toBeLessThan(0.3);
    expect(L.telecom[t0 + 5].v).toBeGreaterThan(0.95); // batteries hold at first
    expect(L.telecom[t0 + 6 * 60].v).toBeLessThan(0.5);
    expect(L.water[t0 + 30].v).toBeGreaterThan(0.9);
    expect(L.water[t0 + 12 * 60].v).toBeLessThan(0.5);
    expect(L.grid[c.M - 1].v).toBeCloseTo(1, 6);
    expect(c.events.length).toBeGreaterThan(6);
  });
});

describe('data centre', () => {
  it('PUE rises with heat; no chilled-water tank means throttling', async () => {
    const { dcDay, dcOutage, DEFAULT_DC, pue } = await import('./datacentre');
    expect(pue(35, false)).toBeGreaterThan(pue(20, false));
    expect(pue(35, true)).toBeLessThan(pue(35, false));
    const d = dcDay(M, DEFAULT_DC, { season: 'summer', day: 'weekday', heat: 0 });
    expect(Math.max(...d.map((x) => x.total))).toBeGreaterThan(DEFAULT_DC.itMW);
    const noTes = dcOutage({ ...DEFAULT_DC, tesMin: 0 }, 34);
    const tes = dcOutage({ ...DEFAULT_DC, tesMin: 15 }, 34);
    expect(Math.max(...noTes.secs.map((s) => s.inlet))).toBeGreaterThan(Math.max(...tes.secs.map((s) => s.inlet)));
  });
});

describe('special days', () => {
  it('half-time pickup, Eid dip and a Grand Prix bump', () => {
    const tot = (h: number, special: 'none' | 'final' | 'eid' | 'gp') => { const l = cityLoad(M, h, { ...DEFAULT_OPTS, special }); return l.res + l.com + l.ind + l.inst + l.light; };
    const pick = tot(20.8, 'final') - tot(20.6, 'final');
    if (FULL) console.log({ pick, eid: tot(12, 'eid') / tot(12, 'none'), gp: tot(22.5, 'gp') - tot(22.5, 'none') });
    expect(pick).toBeGreaterThan(30);
    expect(tot(12, 'eid')).toBeLessThan(tot(12, 'none') * 0.75);
    expect(tot(22.5, 'gp') - tot(22.5, 'none')).toBeGreaterThan(20);
  });
});

describe('frontier', () => {
  it('eclipse, launch power and the Mars storm behave', async () => {
    const { eclipseFraction, marsRun, DEFAULT_MARS } = await import('../frontier/space');
    const { jetPowerGW } = await import('../frontier/launch');
    expect(eclipseFraction(0) * 92.7).toBeGreaterThan(33);
    expect(eclipseFraction(0) * 92.7).toBeLessThan(39);
    expect(eclipseFraction(75)).toBe(0);
    expect(jetPowerGW()).toBeGreaterThan(80);
    const solar = marsRun(DEFAULT_MARS), nuke = marsRun({ ...DEFAULT_MARS, reactors: 4 });
    expect(nuke.shedH).toBeLessThan(solar.shedH);
  });
});

describe('rooftop solar', () => {
  it('lowers midday net demand, and an eclipse takes it away', async () => {
    const { CityEngine } = await import('./engine');
    const e = new CityEngine(M);
    const noon = e.baseline.mins[12 * 60 + 30];
    expect(noon.solar).toBeGreaterThan(100);
    expect(noon.total).toBeLessThan(noon.res + noon.com + noon.ind + noon.inst + noon.light + noon.ev + noon.water + noon.metro + noon.loss);
    e.setOpts({ special: 'eclipse' });
    const max = e.baseline.mins[10 * 60 + 30], before = e.baseline.mins[8 * 60 + 30];
    if (FULL) console.log({ max: max.solar, before: before.solar });
    expect(max.solar).toBeLessThan(before.solar);
  });
});
