// City blackout: the whole grid goes down at once and every system fails on
// its own clock. 73 hours, minute by minute, from an hour before the outage.
//
// What each system does without mains, and the assumption behind it:
//   traffic signals  a quarter of junctions have a 2 h battery (UPS); the rest go dark at once
//   metro            trains stop where they are; evacuation takes about 90 min; service
//                    resumes 30 min after every traction substation has power again
//   mobile network   cell-site batteries and generators (the telecom model)
//   water            elevated tanks drain at the demand rate (the water model)
//   hospital         generators and fuel (the hospital model), plus whether water arrives
//   EV hubs          dark; cars on chargers at the moment of failure are stranded part-charged
// Restoration after the outage: areas come back one at a time, a set number of
// minutes apart, the area with the hospital first, then the biggest.

import type { CityData } from './types';
import type { CityEngine } from './engine';
import { runTelecom } from './telecom';
import { runWater } from './water';
import { DEFAULT_HOSPITAL, HOSPITALS, hospitalFor, threeDays, type HospitalOpts } from './hospital';

export type CascadeOpts = { start: number; hours: number; stepMin: number; batteryH: number; gensetShare: number; tankHours: number; pumpGenShare: number; hospFuelH: number; refuel: boolean; signalUps: number };
export const DEFAULT_CASCADE: CascadeOpts = { start: 12.5, hours: 10, stepMin: 25, batteryH: 3, gensetShare: 0.15, tankHours: 6, pumpGenShare: 0.3, hospFuelH: 60, refuel: false, signalUps: 0.25 };

export const LANES = ['grid', 'signals', 'metro', 'telecom', 'water', 'hospital', 'ev'] as const;
export type Lane = (typeof LANES)[number];
export const LANE_INFO: Record<Lane, { label: string; note: string }> = {
  grid: { label: 'Electricity', note: 'Share of people whose area has mains power.' },
  signals: { label: 'Traffic signals', note: 'Junctions with working signals. A quarter have a 2-hour battery.' },
  metro: { label: 'Metro', note: 'Trains stop between stations; passengers walk out along the viaduct.' },
  telecom: { label: 'Mobile network', note: 'People with a signal: site batteries, generators, exchanges.' },
  water: { label: 'Water', note: 'People with full water pressure from their area’s tank.' },
  hospital: { label: 'Hospital', note: 'Mains, generators, or out of fuel.' },
  ev: { label: 'EV charging', note: 'Fast-charging hubs with power.' },
};

/** 0 working, 1 degraded, 2 failed; value is the share working. */
export type LaneMin = { s: 0 | 1 | 2; v: number };
export type Cascade = {
  M: number; h0: number; t0: number; // minutes; t0 = outage start index
  lanes: Record<Lane, LaneMin[]>;
  restoredAt: number[]; // minute each district gets power back
  events: { m: number; lane: Lane; title: string; body: string }[];
  stranded: { trains: number; evs: number; pax: number };
  hospital: ReturnType<typeof threeDays>;
  hospOpts: HospitalOpts;
};

export function runCascade(c: CityData, e: CityEngine, o: CascadeOpts): Cascade {
  const M = 73 * 60, h0 = o.start - 1, t0 = 60;
  const D = c.districts.length;
  const hosp = hospitalFor(c);
  // restoration order: the hospital's area first, then by population
  const order = c.districts.map((d, i) => ({ i, k: (hosp && d.id === hosp.district ? 1e12 : 0) + d.pop })).sort((a, b) => b.k - a.k).map((x) => x.i);
  const restoredAt = new Array(D).fill(0);
  order.forEach((d, k) => { restoredAt[d] = t0 + Math.round(o.hours * 60) + k * o.stepMin; });
  const up = (m: number, d: number) => m < t0 || m >= restoredAt[d];
  const popShare = c.districts.map((d) => d.pop / c.population);

  const tel = runTelecom(c, e.net, { batteryH: o.batteryH, gensetShare: o.gensetShare }, up, M, h0);
  const wat = runWater(c, e.stations, { tankHours: o.tankHours, pumpGenShare: o.pumpGenShare }, up, M, h0);
  const hospDistrict = hosp ? c.districts.findIndex((d) => d.id === hosp.district) : -1;
  const hospOpts: HospitalOpts = { ...DEFAULT_HOSPITAL, start: o.start, duration: hospDistrict >= 0 ? (restoredAt[hospDistrict] - t0) / 60 : o.hours, fuelH: o.hospFuelH, refuel: o.refuel };
  const hospital = threeDays(hosp ?? HOSPITALS.meridia, hospOpts);

  // what was running at the moment of failure
  const mStart = Math.min(1439, Math.floor(o.start * 60));
  const trains = c.lines.length ? e.baseline.mins[mStart].trains : 0;
  let evs = 0;
  for (let k = 0; k < e.hubs.length; k++) evs += e.ev.hubCars[k * 1440 + mStart];
  const lf = trains ? Math.min(1, 0.15 + 0.8 * Math.max(0, Math.sin(((o.start - 5) / 24) * Math.PI * 2))) : 0;
  const stranded = { trains, evs, pax: Math.round(trains * c.metro.capacity * lf * 0.6) };

  const tssDistricts = c.lines.flatMap((l) => l.tss.map((t) => c.districts.findIndex((d) => d.sub === t.sub))).filter((d) => d >= 0);
  const metroBack = tssDistricts.length ? Math.max(...tssDistricts.map((d) => restoredAt[d])) + 30 : 0;
  const svc = c.metro.service ?? [5.5, 23.5];

  const lanes = Object.fromEntries(LANES.map((l) => [l, [] as LaneMin[]])) as Record<Lane, LaneMin[]>;
  for (let m = 0; m < M; m++) {
    let g = 0, sig = 0, hubs = 0;
    for (let d = 0; d < D; d++) {
      const u = up(m, d);
      if (u) g += popShare[d];
      sig += popShare[d] * (u ? 1 : m - t0 < 120 ? o.signalUps : 0);
    }
    e.hubs.forEach((hb) => { if (up(m, hb.district)) hubs++; });
    hubs /= Math.max(1, e.hubs.length);
    const st = (v: number, a = 0.97, b = 0.5): 0 | 1 | 2 => (v >= a ? 0 : v >= b ? 1 : 2);
    lanes.grid.push({ s: st(g, 0.999, 0.5), v: g });
    lanes.signals.push({ s: st(sig, 0.999, 0.6), v: sig });
    // metro: off outside service hours (shown as working: nothing to fail)
    const hod = ((h0 + m / 60) % 24 + 24) % 24;
    const inService = hod >= svc[0] && hod < svc[1];
    const mv = !c.lines.length ? 1 : m < t0 ? 1 : m < metroBack ? 0 : 1;
    lanes.metro.push({ s: !c.lines.length || !inService || mv ? 0 : 2, v: mv });
    const tv = tel.mins[m].served;
    lanes.telecom.push({ s: st(tv, 0.97, 0.6), v: tv });
    const wv = wat.mins[m].full;
    lanes.water.push({ s: st(wv, 0.97, 0.6), v: wv });
    const hm = hospital.mins[Math.max(0, m - t0)];
    const hs: 0 | 1 | 2 = m < t0 || hm.mains ? 0 : hm.fuel > 0 && hm.gens > 0 ? 1 : 2;
    const water = hospDistrict >= 0 ? wat.pressure[hospDistrict * M + m] : 0;
    lanes.hospital.push({ s: hs === 0 && water === 2 ? 1 : hs === 1 && water === 2 ? 2 : hs, v: hs === 0 ? 1 : hs === 1 ? 0.5 : 0 });
    lanes.ev.push({ s: st(hubs, 0.999, 0.5), v: hubs });
  }

  // the moments worth a caption
  const events: Cascade['events'] = [];
  events.push({ m: t0, lane: 'grid', title: 'The whole grid trips', body: `Every substation in ${c.name} loses supply at once. Lifts stop between floors, fans and air conditioners fall silent, shops go dark.` });
  events.push({ m: t0, lane: 'signals', title: 'Traffic signals go dark', body: `${Math.round((1 - o.signalUps) * 100)} % of junctions lose their signals immediately; the rest run on batteries for about two hours. Police take over the biggest crossings.` });
  if (stranded.trains) events.push({ m: t0, lane: 'metro', title: `${stranded.trains} trains stop between stations`, body: `About ${stranded.pax.toLocaleString('en-GB')} passengers are on board. Emergency lighting and ventilation run on train batteries while staff lead them out along the viaduct walkways.` });
  if (stranded.evs) events.push({ m: t0, lane: 'ev', title: `${stranded.evs} cars stranded on chargers`, body: 'Every fast-charging hub is dark. Cars that were part-way through a charge are stuck with whatever they had.' });
  events.push({ m: t0 + 1, lane: 'hospital', title: 'Hospital on generators', body: `Within 10 seconds the essential branches are on diesel. The bulk tank holds ${Math.round(hospital.tankL).toLocaleString('en-GB')} litres.` });
  events.push({ m: t0 + 1, lane: 'telecom', title: 'Cell sites on batteries', body: `${tel.mins[t0 + 1].battery.toLocaleString('en-GB')} sites switch to batteries, ${tel.mins[t0 + 1].genset} start generators. Call volume surges as everyone tries to reach family.` });
  const first = (lane: Lane, test: (x: LaneMin, m: number) => boolean, from = t0) => { for (let m = from; m < M; m++) if (test(lanes[lane][m], m)) return m; return -1; };
  const sigDead = o.hours * 60 > 120 && o.signalUps > 0 ? t0 + 120 : -1;
  if (sigDead > 0) events.push({ m: sigDead, lane: 'signals', title: 'Last signal batteries flat', body: 'Every junction in the blacked-out areas is now uncontrolled.' });
  const telHalf = first('telecom', (x) => x.v < 0.5);
  if (telHalf > 0) events.push({ m: telHalf, lane: 'telecom', title: 'Half the city has no signal', body: 'Battery-only cell sites are running flat. Only sites with generators and their exchanges keep working.' });
  const wLow = first('water', (x) => x.v < 0.7);
  if (wLow > 0) events.push({ m: wLow, lane: 'water', title: 'Taps losing pressure', body: 'Elevated tanks are below a quarter full in most areas. Upper floors are the first to run dry.' });
  const wDry = first('water', (_, m) => wat.mins[m].dry > 0.5);
  if (wDry > 0) events.push({ m: wDry, lane: 'water', title: 'Most taps dry', body: 'More than half the city has no running water. Boil notices go out as soon as pressure returns, because empty mains can draw in dirty groundwater.' });
  const hDry = first('hospital', (x) => x.s === 2);
  if (hDry > 0) events.push({ m: hDry, lane: 'hospital', title: hospital.dryAt >= 0 && t0 + hospital.dryAt * 60 <= hDry + 1 ? 'Hospital out of fuel' : 'Hospital loses water', body: hospital.dryAt >= 0 && t0 + hospital.dryAt * 60 <= hDry + 1 ? 'The generators stop. Only battery lighting and the UPS remain; patients on ventilators are bagged by hand.' : 'Its area’s water tank is empty: no sterilisation, no dialysis, no flushing. Tankers are requested.' });
  const firstBack = Math.min(...restoredAt);
  events.push({ m: firstBack, lane: 'grid', title: 'Restoration begins', body: `Grid operators energise the network from black-start units, one area at a time, ${o.stepMin} minutes apart, starting with the hospital's area.` });
  events.push({ m: Math.max(...restoredAt), lane: 'grid', title: 'Every area has power', body: 'The last area is reconnected. Water tanks and phone batteries still need hours to refill.' });
  if (metroBack && metroBack < M) events.push({ m: metroBack, lane: 'metro', title: 'Metro service resumes', body: 'Every traction substation is energised and the line has been walked and checked.' });
  events.sort((a, b) => a.m - b.m);
  return { M, h0, t0, lanes, restoredAt, events, stranded, hospital, hospOpts };
}
