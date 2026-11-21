// Electric vehicle charging, three ways:
//   home      7 kW wallboxes, plugged in when people get home (or shifted to
//             the night by smart charging)
//   work      7-11 kW at offices through the working day
//   fast hubs 250 kW stalls at public hubs, car by car: arrivals through the
//             day, each car's charging curve tapering as its battery fills,
//             a queue when the stalls are full, a site transformer limit, and
//             an optional battery that shaves the site's peak
// Assumptions (stated on the page): 180 cars per 1,000 people, 38 km a day,
// 0.17 kWh/km; 55 % of charging energy at home, 15 % at work, 30 % at hubs.

import { rng } from '../plants3d/textures';
import type { CityData } from './types';

export type EvOpts = { evShare: number; smartCharging: boolean; hubBattery: boolean };
export type Hub = { x: number; z: number; district: number; name: string; stalls: number; limitKW: number; batKWh: number };

const CARS_PER_PERSON = 0.18, KM = 38, KWH_KM = 0.17;
const SPLIT = { home: 0.55, work: 0.15, hub: 0.3 };
// arrivals at fast hubs, share per hour (sums to 1)
const HUB_ARR = [0.012, 0.008, 0.006, 0.005, 0.006, 0.012, 0.028, 0.045, 0.055, 0.056, 0.058, 0.062, 0.066, 0.064, 0.06, 0.06, 0.064, 0.072, 0.074, 0.066, 0.052, 0.04, 0.03, 0.02];
const HOME_PLUG = [0.01, 0.005, 0.004, 0.003, 0.003, 0.004, 0.008, 0.012, 0.01, 0.008, 0.008, 0.01, 0.012, 0.012, 0.014, 0.02, 0.04, 0.09, 0.15, 0.17, 0.15, 0.11, 0.08, 0.05];
const norm = (a: number[]) => { const s = a.reduce((x, y) => x + y, 0); return a.map((v) => v / s); };
const ARR = norm(HUB_ARR), PLUG = norm(HOME_PLUG);

/** Fast-charging curve: full power to 30 % state of charge, then tapering. */
export const chargeKW = (soc: number, maxKW: number) => (soc < 0.3 ? maxKW : soc < 0.8 ? maxKW - (maxKW - 70) * ((soc - 0.3) / 0.5) : 30);

export function buildHubs(c: CityData): Hub[] {
  const R = rng(9090);
  // one hub per ~90,000 people, more in districts with offices and shops; at least one per area
  const hubs: Hub[] = [];
  c.districts.forEach((d, i) => {
    const n = Math.max(1, Math.round(d.pop / 90000 + d.comM2 / 1.5e6));
    for (let k = 0; k < n; k++) {
      const a = R() * Math.PI * 2, r = 300 + R() * 900;
      hubs.push({ x: d.cx + Math.cos(a) * r, z: d.cz + Math.sin(a) * r, district: i, name: `${d.name} hub ${k + 1}`, stalls: 8 + Math.floor(R() * 3) * 4, limitKW: 0, batKWh: 0 });
    }
  });
  for (const h of hubs) h.limitKW = Math.round(h.stalls * 250 * 0.6 / 100) * 100; // transformer sized for 60 % of stall nameplate
  return hubs;
}

export type EvRun = {
  mins: { home: number; work: number; hub: number; queue: number; charging: number; batt: number }[];
  hubMW: Float32Array; // hubs x 1440
  hubCars: Uint8Array; // charging cars, hubs x 1440
  hubQueue: Uint8Array;
  hubSoc: Uint8Array; // site battery %, hubs x 1440
  districtMW: Float32Array; // districts x 1440, all EV charging in the area
  evs: number;
  dailyMWh: number;
};

type Car = { soc: number; cap: number; maxKW: number; target: number };

export function runEv(c: CityData, hubs: Hub[], o: EvOpts, districtUp: (m: number, d: number) => boolean): EvRun {
  const R = rng(777);
  const D = c.districts.length, H = hubs.length;
  const evs = c.population * CARS_PER_PERSON * o.evShare;
  const dailyKWh = evs * KM * KWH_KM;
  const popShare = c.districts.map((d) => d.pop / c.population);
  const comTot = c.districts.reduce((a, d) => a + d.comM2, 0) || 1;
  const comShare = c.districts.map((d) => d.comM2 / comTot);
  const hubMW = new Float32Array(H * 1440), hubCars = new Uint8Array(H * 1440), hubQueue = new Uint8Array(H * 1440), hubSoc = new Uint8Array(H * 1440);
  const districtMW = new Float32Array(D * 1440);
  const mins: EvRun['mins'] = [];

  // home charging: each plug-in delivers ~11 kWh at 7 kW (about 1.6 h); smart charging starts them after midnight
  const homeKWh = dailyKWh * SPLIT.home;
  const homeKW = new Float64Array(1440);
  for (let hh = 0; hh < 24; hh++) {
    const e = homeKWh * PLUG[hh];
    let start = hh * 60;
    if (o.smartCharging && (hh >= 17 || hh < 1)) start = (60 * 1 + Math.round((((hh + 7) % 24) / 8) * 240)) % 1440; // spread 01:00-05:00
    for (let k = 0; k < 96; k++) homeKW[(start + k) % 1440] += e / 1.6; // e kWh at 7 kW per car takes 1.6 h
  }
  // work charging: through the office day on weekdays
  const workKWh = dailyKWh * SPLIT.work;
  const workKW = new Float64Array(1440);
  for (let m = 8.5 * 60; m < 17 * 60; m++) workKW[m] = workKWh / 8.5;

  // fast hubs: car by car
  const hubKWh = dailyKWh * SPLIT.hub;
  const carsPerDay = hubKWh / 32; // a stop adds about 32 kWh
  const hubWeight = hubs.map((h) => 0.4 * popShare[h.district] + 0.6 * comShare[h.district]);
  const wsum = hubWeight.reduce((a, b) => a + b, 0) || 1;
  const stalls: Car[][] = hubs.map(() => []), queues: Car[][] = hubs.map(() => []);
  const bat = hubs.map(() => (o.hubBattery ? 1 : 0));
  hubs.forEach((h) => { h.batKWh = o.hubBattery ? h.stalls * 125 : 0; });
  for (let m = 0; m < 1440; m++) {
    const hh = Math.floor(m / 60);
    let hubTot = 0, q = 0, ch = 0, bsum = 0;
    for (let k = 0; k < H; k++) {
      const hub = hubs[k], up = districtUp(m, hub.district);
      // arrivals this minute (Poisson by thinning)
      const lam = (carsPerDay * ARR[hh] * hubWeight[k]) / wsum / 60;
      let arrivals = 0;
      let p = Math.exp(-lam), u = R(), acc = p;
      while (u > acc && arrivals < 20) { arrivals++; p *= lam / arrivals; acc += p; }
      for (let a = 0; a < arrivals; a++) {
        const cap = 55 + R() * 45;
        queues[k].push({ soc: 0.08 + R() * 0.3, cap, maxKW: R() < 0.35 ? 150 : 250, target: 0.75 + R() * 0.1 });
      }
      while (stalls[k].length < hub.stalls && queues[k].length) stalls[k].push(queues[k].shift()!);
      // drivers give up after a long wait; queues do not grow forever
      if (queues[k].length > hub.stalls * 2) queues[k].splice(0, queues[k].length - hub.stalls * 2);
      let want = 0;
      for (const car of stalls[k]) want += chargeKW(car.soc, car.maxKW);
      let site = 0;
      if (up) {
        // the site battery covers what the transformer cannot, and recharges when there is headroom
        const head = hub.limitKW - want;
        let fromBat = 0;
        if (hub.batKWh > 0) {
          if (head < 0 && bat[k] > 0.05) { fromBat = Math.min(-head, 600, bat[k] * hub.batKWh * 60); bat[k] -= fromBat / 60 / hub.batKWh; }
          else if (head > 0 && bat[k] < 1) { const inKW = Math.min(head, 300, (1 - bat[k]) * hub.batKWh * 60); bat[k] += inKW / 60 / hub.batKWh; site += inKW; }
        }
        const avail = hub.limitKW + fromBat;
        const scale = want > avail ? avail / want : 1;
        for (const car of stalls[k]) car.soc += (chargeKW(car.soc, car.maxKW) * scale) / 60 / car.cap;
        site += Math.min(want, hub.limitKW + fromBat) - fromBat;
        stalls[k] = stalls[k].filter((car) => car.soc < car.target);
      }
      hubMW[k * 1440 + m] = site / 1000;
      hubCars[k * 1440 + m] = Math.min(255, stalls[k].length);
      hubQueue[k * 1440 + m] = Math.min(255, queues[k].length);
      hubSoc[k * 1440 + m] = Math.round(bat[k] * 100);
      districtMW[hub.district * 1440 + m] += site / 1000;
      hubTot += site; q += queues[k].length; ch += stalls[k].length; bsum += bat[k];
    }
    let home = 0, work = 0;
    for (let d = 0; d < D; d++) {
      if (!districtUp(m, d)) continue;
      const hk = (homeKW[m] * popShare[d]) / 1000, wk = (workKW[m] * comShare[d]) / 1000;
      districtMW[d * 1440 + m] += hk + wk;
      home += hk; work += wk;
    }
    mins.push({ home, work, hub: hubTot / 1000, queue: q, charging: ch, batt: H ? bsum / H : 0 });
  }
  return { mins, hubMW, hubCars, hubQueue, hubSoc, districtMW, evs, dailyMWh: dailyKWh / 1000 };
}
