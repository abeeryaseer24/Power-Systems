// Water supply: each service area has a pumping station lifting treated
// water into an elevated tank, and the tank feeds the taps by gravity. Pumps
// need power; the tank buys time. When a district loses mains, its tank drains
// at the rate people use water, pressure falls, and the highest floors run
// dry first; when the tank is empty the taps stop.
//
// Assumptions (stated on the page): 150 litres per person per day with a
// morning and an evening peak; pumping, treatment and boosting take about
// 0.35 kWh per cubic metre; tanks hold a set number of hours of the area's
// average demand; a share of pumping stations have a standby generator.

import { rng } from '../plants3d/textures';
import type { CityData } from './types';

export type WaterOpts = { tankHours: number; pumpGenShare: number };
const LPD = 150, KWH_M3 = 0.35;
const USE = [0.35, 0.25, 0.2, 0.2, 0.3, 0.7, 1.45, 1.75, 1.5, 1.2, 1.05, 1.0, 1.05, 1.0, 0.95, 0.95, 1.05, 1.25, 1.5, 1.6, 1.4, 1.1, 0.8, 0.55];
const useAt = (h: number) => { const x = ((h % 24) + 24) % 24, i = Math.floor(x), f = x - i; return USE[i] + (USE[(i + 1) % 24] - USE[i]) * f; };
const MEAN = USE.reduce((a, b) => a + b, 0) / 24;

export type Station = { x: number; z: number; district: number; name: string; genset: boolean };

export function buildStations(c: CityData): Station[] {
  const R = rng(6060);
  return c.districts.map((d, i) => {
    const a = R() * Math.PI * 2;
    return { x: d.cx + Math.cos(a) * 450, z: d.cz + Math.sin(a) * 450, district: i, name: `${d.name} pumping station`, genset: false };
  });
}

/** Pressure states for the overlay. */
export const PRESSURE = ['Full pressure', 'Low pressure: upper floors dry', 'No water'] as const;

export type WaterRun = {
  level: Float32Array; // tank fraction, districts x 1440
  pressure: Uint8Array; // 0 full, 1 low, 2 dry
  mins: { mw: number; full: number; low: number; dry: number }[]; // population shares
};

export function runWater(c: CityData, st: Station[], o: WaterOpts, districtUp: (m: number, d: number) => boolean): WaterRun {
  const R = rng(5150);
  const D = c.districts.length;
  st.forEach((s) => { s.genset = R() < o.pumpGenShare; });
  const level = new Float32Array(D * 1440), pressure = new Uint8Array(D * 1440);
  const lvl = new Float64Array(D).fill(0.85);
  const mins: WaterRun['mins'] = [];
  const pop = c.population || 1;
  for (let m = 0; m < 1440; m++) {
    const h = m / 60;
    let mw = 0, full = 0, low = 0, dry = 0;
    for (let d = 0; d < D; d++) {
      const dd = c.districts[d];
      const avgM3h = (dd.pop * LPD) / 1000 / 24; // m³ per hour
      const tank = Math.max(1, avgM3h * o.tankHours);
      const use = (avgM3h * useAt(h)) / MEAN; // m³/h right now
      const powered = districtUp(m, d) || st[d].genset;
      // pumps run to keep the tank between 70 and 95 %, at up to 1.6x average demand
      let pump = 0;
      if (powered) pump = lvl[d] < 0.95 ? Math.min(avgM3h * 1.6, use + (0.95 - lvl[d]) * tank * 0.5) : use * 0.95;
      const outflow = lvl[d] > 0 ? use * (lvl[d] < 0.25 ? lvl[d] / 0.25 : 1) : 0;
      lvl[d] = Math.min(1, Math.max(0, lvl[d] + (pump - outflow) / tank / 60));
      if (powered) mw += (pump * KWH_M3) / 1000;
      const p = lvl[d] > 0.25 ? 0 : lvl[d] > 0.02 ? 1 : 2;
      level[d * 1440 + m] = lvl[d];
      pressure[d * 1440 + m] = p;
      if (p === 0) full += dd.pop; else if (p === 1) low += dd.pop; else dry += dd.pop;
    }
    mins.push({ mw, full: full / pop, low: low / pop, dry: dry / pop });
  }
  return { level, pressure, mins };
}
