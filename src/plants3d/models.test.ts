import { describe, expect, it } from 'vitest';
import { StressSim, type GridDef } from './stress';
import { FO_CHERNOBYL, FO_FUKUSHIMA, landMask, proj, simulate } from '../fallout/model';
import { CHERNOBYL4, TMI2, at } from '../controlroom/timelines';

const BD: GridDef = { name: 'BD', f0: 50, loadMW: 15500, H: 4, unitMW: 1200, units: 2, kind: 'pwr', largestOther: 660 };
const run = (g: GridDef, fire: (s: StressSim) => void, seconds: number) => {
  const s = new StressSim(g);
  for (let i = 0; i < 100; i++) s.step(0.05);
  fire(s);
  let fmin = 99;
  for (let i = 0; i < seconds * 20; i++) { s.step(0.05); fmin = Math.min(fmin, s.s.f); }
  return { s: s.s, fmin };
};

describe('stress test grid model', () => {
  it('holds steady with nothing happening', () => {
    const r = run(BD, () => {}, 30);
    expect(Math.abs(r.s.f - 50)).toBeLessThan(0.01);
    expect(r.s.shed).toBe(0);
  });

  it('rides through the loss of the largest other unit and AGC restores frequency', () => {
    const r = run(BD, (s) => s.fire('other'), 300);
    expect(r.fmin).toBeGreaterThan(48.8); // no load shedding for 660 MW on 15.5 GW
    expect(r.s.shed).toBe(0);
    expect(Math.abs(r.s.f - 50)).toBeLessThan(0.05);
  });

  it('sheds load when both Rooppur units are lost at once', () => {
    const r = run(BD, (s) => s.fire('loop'), 60);
    expect(r.fmin).toBeLessThan(48.8);
    expect(r.s.shed).toBeGreaterThan(0);
    expect(r.s.plantMW).toBe(0);
    expect(r.s.diesel).toBe(true);
    expect(r.s.heat).toBeLessThan(0.07); // decay heat after scram
  });

  it('scales the UFLS thresholds for a 60 Hz grid', () => {
    const tmi: GridDef = { name: 'PJM', f0: 60, loadMW: 9000, H: 4, unitMW: 906, units: 2, kind: 'pwr', largestOther: 900 };
    const r = run(tmi, (s) => s.fire('loop'), 30);
    expect(r.s.log.some((l) => l.text.includes('58.6 Hz'))).toBe(true);
  });
});

describe('fallout model', () => {
  it('puts the top contamination band near 30 km along the worst direction', () => {
    for (const d of [FO_CHERNOBYL, FO_FUKUSHIMA]) {
      const r = simulate(d);
      const g = r.snaps[r.snaps.length - 1];
      const N = Math.sqrt(g.length), cell = (2 * d.half) / N, top = d.bands[d.bands.length - 1][0];
      let far = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = -d.half + (i + 0.5) * cell, z = -d.half + (j + 0.5) * cell;
        if (Math.hypot(x, z) > 80 && g[j * N + i] * r.scale > top) far++;
      }
      // the top band is a near-field feature: only scattered cells beyond 80 km
      expect(far).toBeLessThan(N * N * 0.01);
    }
  });

  it('keeps Fukushima deposition on land', () => {
    const land = landMask(FO_FUKUSHIMA);
    const [sx, sz] = proj(FO_FUKUSHIMA, 37.42, 141.3); // 25 km out to sea
    const [lx, lz] = proj(FO_FUKUSHIMA, 37.68, 140.73); // Iitate
    expect(land(sx, sz)).toBe(false);
    expect(land(lx, lz)).toBe(true);
  });
});

describe('control-room replays', () => {
  it('TMI: the PORV light goes out at 04:00:50 while the valve stays open until 06:22', () => {
    expect(at(TMI2.extra.porvLight, 45)).toBe(1);
    expect(at(TMI2.extra.porvLight, 60)).toBe(0);
    expect(at(TMI2.extra.porvActual, 60)).toBe(1);
    expect(at(TMI2.extra.porvActual, 8530)).toBe(0);
  });

  it('Chernobyl: AZ-5 comes before the excursion and the explosion', () => {
    const pwr = CHERNOBYL4.gauges.find((g) => g.id === 'pwr')!.curve;
    expect(at(pwr, 5019)).toBeLessThan(300);
    expect(at(CHERNOBYL4.extra.az5, 5020)).toBe(1);
    expect(at(pwr, 5026)).toBeGreaterThan(3200);
    expect(at(CHERNOBYL4.extra.blast, 5029)).toBe(1);
  });

  it('events are in time order', () => {
    for (const r of [TMI2, CHERNOBYL4]) for (let i = 1; i < r.events.length; i++) expect(r.events[i].t).toBeGreaterThanOrEqual(r.events[i - 1].t);
  });
});
