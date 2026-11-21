// Mobile network model: cell sites, the exchanges their backhaul runs to, and
// the core. Every site needs mains power or its own backup; it only carries
// calls and data if its exchange (and the core) are up too.
//
// Assumptions, stated on the page:
//   - site positions are modelled from population density (a site per ~1,500
//     people, never more than ~1.1 km apart), not real tower locations
//   - a macro site draws 1.6 kW idle plus up to 2.4 kW with traffic (4G + 5G radios)
//   - batteries are sized in hours at average load, and age: real capacity
//     is 60-120 % of nameplate
//   - a share of sites have a diesel generator (starts in 30 s, 24 h of fuel)
//   - exchanges: 4 h of battery and a generator with 48 h of fuel; the core has 72 h

import { rng } from '../plants3d/textures';
import type { CityData } from './types';

export type Site = { x: number; z: number; r: number; district: number; hub: number; pop: number; batKWh: number; genset: boolean };
export type Hub = { x: number; z: number; district: number; name: string; batKWh: number; kw: number; fuelH: number };
export type TelecomOpts = { batteryH: number; gensetShare: number };

// mobile data traffic, share of the daily busy hour (evening video peak)
const TRAFFIC = [0.42, 0.3, 0.22, 0.17, 0.15, 0.17, 0.26, 0.42, 0.55, 0.6, 0.63, 0.66, 0.7, 0.68, 0.66, 0.67, 0.71, 0.76, 0.84, 0.92, 0.98, 1.0, 0.9, 0.66];
export const traffic = (h: number) => {
  const x = ((h % 24) + 24) % 24, i = Math.floor(x), f = x - i;
  return TRAFFIC[i] + (TRAFFIC[(i + 1) % 24] - TRAFFIC[i]) * f;
};
export const siteKw = (h: number) => 1.6 + 2.4 * traffic(h);

/** State codes, per site per minute. */
export const ST = { grid: 0, battery: 1, genset: 2, isolated: 3, down: 4 } as const;
export const ST_LABEL = ['On mains', 'On battery', 'On generator', 'Powered, but its exchange is down', 'Down'];

export function buildNetwork(c: CityData) {
  const R = rng(4242);
  const [x0, z0, x1, z1] = c.bounds;
  const { nx, nz, data } = c.cells;
  const cellA = ((x1 - x0) / nx) * ((z1 - z0) / nz);
  // built-up area and people per district
  const area = new Float64Array(c.districts.length);
  for (const v of data) if (v !== 255) area[v] += cellA;
  const spacing = c.districts.map((d, i) => {
    const a = Math.max(area[i], 1e5);
    const n = Math.max(d.pop / 1500, a / 1.2e6); // capacity or coverage, whichever needs more
    return Math.min(1100, Math.max(260, Math.sqrt(a / Math.max(1, n))));
  });
  const G = 240;
  const sites: Site[] = [];
  for (let z = z0 + G / 2; z < z1; z += G) {
    for (let x = x0 + G / 2; x < x1; x += G) {
      const i = Math.floor(((x - x0) / (x1 - x0)) * nx), j = Math.floor(((z - z0) / (z1 - z0)) * nz);
      const k = data[j * nx + i];
      if (k === 255 || k === undefined) continue;
      if (R() > (G / spacing[k]) ** 2) continue;
      sites.push({ x: x + (R() - 0.5) * G * 0.8, z: z + (R() - 0.5) * G * 0.8, r: spacing[k] * 0.62, district: k, hub: k, pop: 0, batKWh: 0, genset: false });
    }
  }
  const per = new Array(c.districts.length).fill(0);
  for (const s of sites) per[s.district]++;
  for (const s of sites) s.pop = c.districts[s.district].pop / Math.max(1, per[s.district]);
  const hubs: Hub[] = c.districts.map((d, i) => ({ x: d.cx, z: d.cz, district: i, name: `${d.name} exchange`, batKWh: 25 * 4, kw: 25, fuelH: 48 }));
  // per-site randomness that does not change with the inputs
  const age = sites.map(() => 0.6 + 0.6 * R());
  const gRoll = sites.map(() => R());
  return { sites, hubs, age, gRoll };
}

export type Network = ReturnType<typeof buildNetwork>;

export type TelecomRun = {
  state: Uint8Array; // sites x 1440
  soc: Uint8Array; // battery %, sites x 1440
  hubState: Uint8Array; // hubs x 1440
  mins: { grid: number; battery: number; genset: number; isolated: number; down: number; served: number; mw: number }[];
};

/** Minute-by-minute run of the network against the day's outage pattern. */
export function runTelecom(c: CityData, net: Network, o: TelecomOpts, districtUp: (m: number, d: number) => boolean, M = 1440, h0 = 0): TelecomRun {
  const { sites, hubs, age, gRoll } = net;
  const S = sites.length, H = hubs.length;
  sites.forEach((s, i) => { s.batKWh = o.batteryH * 3 * age[i]; s.genset = gRoll[i] < o.gensetShare; });
  const state = new Uint8Array(S * M), soc = new Uint8Array(S * M), hubState = new Uint8Array(H * M);
  const bat = sites.map((s) => s.batKWh), off = new Float64Array(S); // minutes without mains
  const hbat = hubs.map((h) => h.batKWh), hoff = new Float64Array(H), hfuel = hubs.map((h) => h.fuelH * 60);
  const fuel = sites.map(() => 24 * 60);
  const pop = sites.reduce((a, s) => a + s.pop, 0);
  const mins: TelecomRun['mins'] = [];
  const dt = 1 / 60; // h
  for (let m = 0; m < M; m++) {
    const h = h0 + m / 60, kw = siteKw(h);
    // exchanges first: they decide whether a powered site can carry traffic
    const hubUp = new Uint8Array(H);
    for (let k = 0; k < H; k++) {
      const hb = hubs[k];
      let st: number;
      if (districtUp(m, hb.district)) { st = ST.grid; hoff[k] = 0; hbat[k] = Math.min(hb.batKWh, hbat[k] + hb.kw * 0.25 * dt); }
      else {
        hoff[k]++;
        // generator takes over after 30 s; the battery bridges the start
        if (hoff[k] > 0.5 && hfuel[k] > 0) { st = ST.genset; hfuel[k]--; }
        else if (hbat[k] > 0) { st = ST.battery; hbat[k] -= hb.kw * dt; }
        else st = ST.down;
      }
      hubState[k * M + m] = st;
      hubUp[k] = st === ST.down ? 0 : 1;
    }
    let g = 0, b = 0, gs = 0, iso = 0, dn = 0, served = 0, mw = 0;
    for (let i = 0; i < S; i++) {
      const s = sites[i];
      let st: number;
      if (districtUp(m, s.district)) {
        st = ST.grid; off[i] = 0;
        bat[i] = Math.min(s.batKWh, bat[i] + 0.2 * s.batKWh * dt); // 0.2 C recharge
        mw += kw + (bat[i] < s.batKWh ? 0.2 * s.batKWh : 0);
      } else {
        off[i]++;
        if (s.genset && off[i] > 0.5 && fuel[i] > 0) { st = ST.genset; fuel[i]--; }
        else if (bat[i] > 0) { st = ST.battery; bat[i] -= kw * dt; }
        else st = ST.down;
      }
      if (st !== ST.down && !hubUp[s.hub]) st = ST.isolated;
      state[i * M + m] = st;
      soc[i * M + m] = s.batKWh > 0 ? Math.round((100 * Math.max(0, bat[i])) / s.batKWh) : 0;
      if (st === ST.grid) g++; else if (st === ST.battery) b++; else if (st === ST.genset) gs++; else if (st === ST.isolated) iso++; else dn++;
      if (st <= ST.genset) served += s.pop;
    }
    mins.push({ grid: g, battery: b, genset: gs, isolated: iso, down: dn, served: served / pop, mw: mw / 1000 });
  }
  return { state, soc, hubState, mins };
}
