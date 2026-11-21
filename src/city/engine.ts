// The coupling engine: one clock, one dependency graph. Every asset in the
// city declares what feeds it; when a feed is lost the asset falls back to its
// backup (if it has one) or goes dark, and everything that depends on it
// follows. Step 1 couples the 132/33 kV substations, the districts they feed
// and the metro traction substations. Later sectors (telecom, hospitals,
// water, EV, data centres) plug into the same graph.

import type { CityData } from './types';
import { cityLoad, districtLoad, LOSS_FRACTION, SPECIAL, sunElevation, temperature, type DayInputs, type DistrictLoad } from './demand';
import { TractionSim, headway, type TractionOpts } from './metro';
import { buildNetwork, runTelecom, type Network, type TelecomOpts, type TelecomRun } from './telecom';
import { buildHubs, runEv, type EvOpts, type EvRun, type Hub as EvHub } from './ev';
import { buildStations, runWater, type Station, type WaterOpts, type WaterRun } from './water';

export type CityOpts = DayInputs & Omit<TractionOpts, 'inp'> & TelecomOpts & EvOpts & WaterOpts;
export const DEFAULT_OPTS: CityOpts = { season: 'summer', day: 'weekday', heat: 0, special: 'none', peakHeadway: 180, regen: true, reversible: false, batteryH: 3, gensetShare: 0.15, evShare: 0.08, smartCharging: false, hubBattery: false, tankHours: 6, pumpGenShare: 0.3 };

/** Loads from the other models that the day run adds to the demand stack. */
type Extra = { evD: Float32Array; water: Float32Array };

/** One graph node: an asset, what it needs, and an optional backup supply. */
export type Asset = { id: string; label: string; needs: string[]; backup?: { kwh: number; kw: number }; up: boolean; onBackup: boolean; left: number };

export class Coupling {
  assets = new Map<string, Asset>();
  tripped = new Set<string>();
  add(id: string, label: string, needs: string[] = [], backup?: { kwh: number; kw: number }) {
    this.assets.set(id, { id, label, needs, backup, up: true, onBackup: false, left: backup?.kwh ?? 0 });
  }
  /** Propagate supply through the graph; dt drains batteries and fuel. */
  resolve(dtH = 0) {
    const done = new Set<string>();
    const visit = (a: Asset): boolean => {
      if (done.has(a.id)) return a.up;
      done.add(a.id);
      const fed = !this.tripped.has(a.id) && a.needs.every((n) => {
        const b = this.assets.get(n);
        return b ? visit(b) : true;
      });
      if (fed) { a.up = true; a.onBackup = false; if (a.backup) a.left = Math.min(a.backup.kwh, a.left + a.backup.kw * 0.2 * dtH); }
      else if (a.backup && a.left > 0 && !this.tripped.has(a.id)) { a.up = true; a.onBackup = true; a.left = Math.max(0, a.left - a.backup.kw * dtH); }
      else { a.up = false; a.onBackup = false; }
      return a.up;
    };
    for (const a of this.assets.values()) visit(a);
  }
  up(id: string) {
    return this.assets.get(id)?.up ?? true;
  }
  /** Ids that are down because something upstream failed. */
  downstreamOf(id: string) {
    const out: string[] = [];
    for (const a of this.assets.values()) if (a.needs.includes(id)) out.push(a.id, ...this.downstreamOf(a.id));
    return out;
  }
}

export type Minute = {
  res: number; com: number; ind: number; inst: number; light: number; ev: number; water: number; metro: number; loss: number;
  total: number; unserved: number; trains: number; regen: number; burnt: number; returned: number; minV: number; T: number;
  tss: number[]; // per traction substation, MW, flattened across lines
  subs: number[]; // per grid substation, MW
};

export type CityEvent = { t: number; kind: 'info' | 'peak' | 'warn' | 'trip'; title: string; body: string };

/** Per-city lookup tables shared by the day runs. */
type Ctx = { c: CityData; subIndex: Map<string, number>; tssList: { line: number; idx: number; name: string; sub: string }[] };
function makeCtx(c: CityData): Ctx {
  return {
    c,
    subIndex: new Map(c.subs.map((s, i) => [s.id, i])),
    tssList: c.lines.flatMap((l, li) => l.tss.map((t, ti) => ({ line: li, idx: ti, name: t.name, sub: t.sub }))),
  };
}

type Checkpoint = { t: number; state: string };

/** Outage windows: id -> [from, to) in hours; to may run past 24 into the next morning. */
export type Trips = Map<string, [number, number]>;
export const WHOLE_DAY: [number, number] = [0, 24];
export function activeAt(trips: Trips, h: number) {
  const out = new Set<string>();
  for (const [id, [a, b]] of trips) if ((h >= a && h < b) || h + 24 < b) out.add(id);
  return out;
}

/** Runs a whole day headless and records it minute by minute. */
function runDay(x: Ctx, opts: CityOpts, trips: Trips, ratings: number[], ex: Extra) {
  const sim = new TractionSim(x.c, { ...opts, inp: opts });
  let act = activeAt(trips, 0), actKey = [...act].join();
  applyTrips(x, sim, act);
  const mins: Minute[] = [];
  const cps: Checkpoint[] = [];
  const acc = { metro: 0, regen: 0, burnt: 0, returned: 0, minV: sim.dc.E, tss: new Float64Array(x.tssList.length), n: 0, trains: 0 };
  const DT = 2;
  for (let m = 0; m < 1440; m++) {
    if (m % 15 === 0) cps.push({ t: sim.t, state: save(sim) });
    const h = m / 60;
    act = activeAt(trips, h + 0.5 / 60);
    if ([...act].join() !== actKey) { actKey = [...act].join(); applyTrips(x, sim, act); }
    const active = x.c.lines.length > 0 && (h >= (x.c.metro.service?.[0] ?? 5.5) - 0.1 || sim.trains.length > 0);
    acc.metro = acc.regen = acc.burnt = acc.returned = acc.n = acc.trains = 0;
    acc.minV = sim.dc.E;
    acc.tss.fill(0);
    if (active) {
      for (let k = 0; k < 60 / DT; k++) {
        const e0 = sim.eRegenUsed;
        sim.step(DT);
        acc.metro += sim.gridPower();
        acc.returned += sim.returnedPower();
        acc.burnt += sim.burntPower();
        acc.regen += (sim.eRegenUsed - e0) / DT;
        acc.trains += sim.trains.length;
        let j = 0;
        for (const ln of sim.lines) for (const t of ln.tss) acc.tss[j++] += Math.max(0, t.p);
        for (const ln of sim.lines) acc.minV = Math.min(acc.minV, ln.minV);
        acc.n++;
      }
    } else sim.t = (m + 1) * 60;
    const n = Math.max(1, acc.n);
    const metro = acc.metro / n / 1e6;
    const tss = Array.from(acc.tss, (x) => x / n / 1e6);
    mins.push(minuteAt(x, h + 0.5 / 60, opts, act, metro, tss, ratings, ex, m, {
      trains: Math.round(acc.trains / n), regen: acc.regen / n / 1e6, burnt: acc.burnt / n / 1e6, returned: acc.returned / n / 1e6, minV: acc.minV,
    }));
  }
  return { mins, cps };
}

function minuteAt(x: Ctx, h: number, opts: CityOpts, trips: Set<string>, metroMW: number, tss: number[], ratings: number[], ex: Extra, m: number, extra: Pick<Minute, 'trains' | 'regen' | 'burnt' | 'returned' | 'minV'>): Minute {
  const subs = new Array(x.c.subs.length).fill(0);
  const out = { res: 0, com: 0, ind: 0, inst: 0, light: 0 };
  let unserved = 0;
  let ev = 0;
  const D = x.c.districts.length;
  x.c.districts.forEach((d, di) => {
    const l = districtLoad(x.c, d, h, opts);
    const sum = l.res + l.com + l.ind + l.inst + l.light;
    if (trips.has(d.sub)) { unserved += sum; return; }
    const e = ex.evD[di * 1440 + m] ?? 0;
    out.res += l.res; out.com += l.com; out.ind += l.ind; out.inst += l.inst; out.light += l.light;
    ev += e;
    subs[x.subIndex.get(d.sub)!] += sum + e + (ex.water[m] * d.pop) / (x.c.population || 1);
  });
  void D;
  x.tssList.forEach((t, i) => { subs[x.subIndex.get(t.sub)!] += tss[i]; });
  const water = ex.water[m] ?? 0;
  const base = out.res + out.com + out.ind + out.inst + out.light + ev + water + metroMW;
  const loss = base * LOSS_FRACTION;
  void ratings;
  return { ...out, ev, water, metro: metroMW, loss, total: base + loss, unserved, T: temperature(x.c, h, opts), tss, subs, ...extra };
}

function applyTrips(x: Ctx, sim: TractionSim, trips: Set<string>) {
  x.tssList.forEach((t) => sim.setTss(t.line, t.idx, !trips.has(`tss:${t.line}:${t.idx}`) && !trips.has(t.sub)));
}

function save(sim: TractionSim) {
  return JSON.stringify({ t: sim.t, trains: sim.trains, lines: sim.lines.map((l) => ({ tss: l.tss, lastDep: l.lastDep })), seed: sim.seed, nextId: sim.nextId, e: [sim.eGrid, sim.eTraction, sim.eAux, sim.eRegenUsed, sim.eBurnt, sim.eReturned, sim.eLoss] });
}
function load(sim: TractionSim, s: string) {
  const o = JSON.parse(s);
  sim.t = o.t;
  sim.trains = o.trains;
  o.lines.forEach((l: { tss: typeof sim.lines[0]['tss']; lastDep: [number, number] }, i: number) => {
    sim.lines[i].tss.forEach((t, j) => Object.assign(t, l.tss[j]));
    sim.lines[i].lastDep = l.lastDep;
  });
  sim.seed = o.seed;
  sim.nextId = o.nextId;
  [sim.eGrid, sim.eTraction, sim.eAux, sim.eRegenUsed, sim.eBurnt, sim.eReturned, sim.eLoss] = o.e;
}

/** Design ratings of the 132/33 kV substations: 1.25 x a hot weekday's peak, in 15 MVA steps. */
function designRatings(x: Ctx) {
  const inp: DayInputs = { season: 'summer', day: 'weekday', heat: 1 };
  const peak = new Array(x.c.subs.length).fill(0);
  for (let m = 0; m < 1440; m += 10) {
    const h = m / 60;
    const s = new Array(x.c.subs.length).fill(0);
    for (const d of x.c.districts) {
      const l = districtLoad(x.c, d, h, inp);
      s[x.subIndex.get(d.sub)!] += l.res + l.com + l.ind + l.inst + l.light;
    }
    x.tssList.forEach((t) => { s[x.subIndex.get(t.sub)!] += 3; });
    s.forEach((v, i) => { peak[i] = Math.max(peak[i], v); });
  }
  return peak.map((p) => Math.ceil((p * 1.25) / 15) * 15);
}

export type DayRun = { mins: Minute[]; events: CityEvent[] };

export class CityEngine {
  opts: CityOpts;
  trips: Trips = new Map();
  graph = new Coupling();
  ratings: number[];
  x: Ctx;
  baseline!: DayRun;
  scenario!: DayRun; // same as baseline when nothing is tripped
  private cps: Checkpoint[] = [];
  sim!: TractionSim;
  private _net?: Network;
  telecom!: TelecomRun;
  ev!: EvRun;
  water!: WaterRun;
  private _hubs?: EvHub[];
  private _st?: Station[];
  get net() { return (this._net ??= buildNetwork(this.city)); }
  get hubs() { return (this._hubs ??= buildHubs(this.city)); }
  get stations() { return (this._st ??= buildStations(this.city)); }
  private acc = 0;

  constructor(public city: CityData, opts: Partial<CityOpts> = {}) {
    const x = (this.x = makeCtx(city));
    this.opts = { ...DEFAULT_OPTS, peakHeadway: city.metro.peakHeadway, ...opts };
    this.ratings = designRatings(x);
    for (const s of x.c.subs) this.graph.add(s.id, s.name);
    for (const d of x.c.districts) this.graph.add(`d:${d.id}`, d.name, [d.sub]);
    x.tssList.forEach((t) => this.graph.add(`tss:${t.line}:${t.idx}`, t.name, [t.sub]));
    this.recompute(8);
  }

  /** Re-run the day after a change to the inputs or the trips, then return to hour h. */
  recompute(h = this.hour) {
    const x = this.x;
    // EV charging and water pumping first: they add load to the day run
    const evBase = runEv(this.city, this.hubs, this.opts, () => true);
    const wBase = runWater(this.city, this.stations, this.opts, () => true);
    const exBase: Extra = { evD: evBase.districtMW, water: Float32Array.from(wBase.mins, (q) => q.mw) };
    const down = this.downByMinute();
    const upFn = (m: number, d: number) => !down[m].has(this.city.districts[d].sub);
    this.ev = this.trips.size ? runEv(this.city, this.hubs, this.opts, upFn) : evBase;
    this.water = this.trips.size ? runWater(this.city, this.stations, this.opts, upFn) : wBase;
    const exSc: Extra = this.trips.size ? { evD: this.ev.districtMW, water: Float32Array.from(this.water.mins, (q) => q.mw) } : exBase;
    const base = runDay(x, this.opts, new Map(), this.ratings, exBase);
    this.baseline = { mins: base.mins, events: findEvents(x, base.mins, this.opts, new Map(), this.ratings) };
    if (this.trips.size) {
      const sc = runDay(x, this.opts, this.trips, this.ratings, exSc);
      this.scenario = { mins: sc.mins, events: findEvents(x, sc.mins, this.opts, this.trips, this.ratings) };
      this.cps = sc.cps;
    } else {
      this.scenario = this.baseline;
      this.cps = base.cps;
    }
    this.runTelecom();
    this.seek(h);
  }

  /** The mobile network against the same outages, minute by minute. */
  private downByMinute() {
    const down: Set<string>[] = [];
    for (let m = 0; m < 1440; m++) down.push(this.trips.size ? activeAt(this.trips, (m + 0.5) / 60) : new Set());
    return down;
  }

  runTelecom() {
    const c = this.city;
    const down = this.downByMinute();
    this.telecom = runTelecom(c, this.net, this.opts, (m, d) => !down[m].has(c.districts[d].sub));
  }

  setOpts(o: Partial<CityOpts>) {
    Object.assign(this.opts, o);
    this.recompute();
  }

  trip(id: string, on: boolean, win: [number, number] = WHOLE_DAY) {
    if (on) this.trips.set(id, win);
    else this.trips.delete(id);
    this.recompute();
  }

  get hour() {
    return this.sim ? this.sim.t / 3600 : 8;
  }

  seek(h: number) {
    h = Math.min(23.999, Math.max(0, h));
    const t = h * 3600;
    let cp = this.cps[0];
    for (const c of this.cps) if (c.t <= t) cp = c;
    this.sim = new TractionSim(this.city, { ...this.opts, inp: this.opts });
    load(this.sim, cp.state);
    this.syncTrips(true);
    while (this.sim.t < t - 0.5) this.sim.step(Math.min(1, t - this.sim.t));
    this.acc = 0;
  }

  /** Advance the clock by simSec seconds of city time. */
  advance(simSec: number) {
    this.acc += simSec;
    // fine steps at slow speeds for smooth motion, 1 s steps otherwise
    if (simSec < 0.5) {
      this.sim.step(this.acc);
      this.acc = 0;
    } else {
      let guard = 0;
      while (this.acc >= 1 && guard++ < 4000) { this.sim.step(1); this.acc -= 1; }
    }
    if (this.sim.t >= 86400 - 1) this.seek(0);
    this.syncTrips();
  }

  private tripKey = '';
  /** Apply the outages that are active at the current instant to the trains and the graph. */
  private syncTrips(force = false) {
    const act = activeAt(this.trips, this.hour);
    const key = [...act].join();
    if (!force && key === this.tripKey) return;
    this.tripKey = key;
    applyTrips(this.x, this.sim, act);
    this.graph.tripped = act;
    this.graph.resolve();
  }

  /** Loads and states at the current instant, for the scene and the inspector. */
  now() {
    const h = this.hour, x = this.x;
    const districts = x.c.districts.map((d) => {
      const l = districtLoad(x.c, d, h, this.opts);
      const up = this.graph.up(`d:${d.id}`);
      return { d, l, up };
    });
    const subs = x.c.subs.map((s, i) => ({ s, mw: 0, rating: this.ratings[i], up: this.graph.up(s.id) }));
    for (const q of districts) if (q.up) subs[x.subIndex.get(q.d.sub)!].mw += sumLoad(q.l);
    const bySub = this.sim.powerBySub();
    for (const [k, v] of Object.entries(bySub)) subs[x.subIndex.get(k)!].mw += v / 1e6;
    const c = cityLoad(x.c, h, this.opts);
    const metro = this.sim.gridPower() / 1e6;
    let unserved = 0;
    for (const q of districts) if (!q.up) unserved += sumLoad(q.l);
    const mi = Math.min(1439, Math.floor(h * 60));
    let evNow = 0;
    districts.forEach((q, di) => { if (q.up) evNow += this.ev.districtMW[di * 1440 + mi]; });
    const waterNow = this.water.mins[mi].mw;
    const served = c.res + c.com + c.ind + c.inst + c.light - unserved + metro + evNow + waterNow;
    return { h, T: temperature(x.c, h, this.opts), sunEl: sunElevation(x.c, h, this.opts), districts, subs, metro, total: served * (1 + LOSS_FRACTION), unserved, hw: headway(h, { ...this.opts, inp: this.opts }, x.c.metro) };
  }

  minute(h = this.hour) {
    return this.scenario.mins[Math.min(1439, Math.max(0, Math.floor(h * 60)))];
  }
}

export const sumLoad = (l: DistrictLoad) => l.res + l.com + l.ind + l.inst + l.light;

const fmtH = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

/** Scan a recorded day for the moments worth a marker on the time bar. */
export function findEvents(x: Ctx, mins: Minute[], opts: CityOpts, trips: Trips, ratings: number[]): CityEvent[] {
  const ev: CityEvent[] = [];
  const at = (m: number) => m / 60;
  // street lighting follows the sun
  for (let m = 1; m < 1440; m++) {
    const a = sunElevation(x.c, at(m - 1), opts), b = sunElevation(x.c, at(m), opts);
    if (a > -1 && b <= -1) ev.push({ t: at(m), kind: 'info', title: 'Street lights on', body: `The sun is 1° below the horizon. Photocells switch on about ${Math.round(mins[m + 5]?.light ?? 0)} MW of street lighting across ${x.c.districts.length} districts.` });
    if (a < -1 && b >= -1) ev.push({ t: at(m), kind: 'info', title: 'Street lights off', body: 'Daylight is back; the street lighting load drops out within a few minutes.' });
  }
  const [svc0, svc1] = x.c.metro.service ?? [5.5, 23.5];
  if (x.c.lines.length) ev.push({ t: svc0, kind: 'info', title: 'First trains', body: 'Metro service starts. Traction load comes on one train at a time.' });
  const pk0 = x.c.metro.peaks?.[0] ?? [7, 10];
  if (opts.day === 'weekday' && x.c.lines.length) ev.push({ t: pk0[0], kind: 'info', title: 'Peak service', body: `Trains every ${Math.round(opts.peakHeadway / 60 * 10) / 10} minutes until ${String(pk0[1]).padStart(2, '0')}:00. More trains, more acceleration, more traction power.` });
  if (x.c.lines.length) ev.push({ t: svc1, kind: 'info', title: 'Last departures', body: 'The last trains leave the terminals; traction load fades to zero as they arrive.' });
  for (const mk of SPECIAL[opts.special ?? 'none'].marks) ev.push({ t: mk.t, kind: 'peak', title: mk.title, body: mk.body });
  // peaks
  let pk = 0;
  mins.forEach((x, i) => { if (x.total > mins[pk].total) pk = i; });
  ev.push({ t: at(pk), kind: 'peak', title: `City peak ${Math.round(mins[pk].total)} MW`, body: `The highest demand of the day. Homes ${Math.round(mins[pk].res)} MW, offices and shops ${Math.round(mins[pk].com)} MW, industry ${Math.round(mins[pk].ind)} MW, at ${mins[pk].T.toFixed(1)} °C.` });
  let mp = 0;
  mins.forEach((x, i) => { if (x.metro > mins[mp].metro) mp = i; });
  if (mins[mp].metro > 0) ev.push({ t: at(mp), kind: 'peak', title: `Traction peak ${mins[mp].metro.toFixed(1)} MW`, body: `${mins[mp].trains} trains in service. Braking trains fed ${mins[mp].regen.toFixed(1)} MW back to accelerating ones.` });
  // overloads and undervoltage, first occurrence of each
  const seen = new Set<string>();
  const uvLim = 1150 * (x.c.metro.voltage / 1500);
  mins.forEach((q, m) => {
    q.tss.forEach((p, i) => {
      if (p > x.c.metro.tssRating && !seen.has('tss' + i)) {
        seen.add('tss' + i);
        ev.push({ t: at(m), kind: 'warn', title: `${x.tssList[i].name} over rating`, body: `${p.toFixed(1)} MW averaged over a minute against a ${x.c.metro.tssRating} MW continuous rating. Rectifiers can carry this for a while, but not all day.` });
      }
    });
    q.subs.forEach((p, i) => {
      if (p > ratings[i] && !seen.has('sub' + i)) {
        seen.add('sub' + i);
        ev.push({ t: at(m), kind: 'warn', title: `${x.c.subs[i].name} overloaded`, body: `${Math.round(p)} MW against a firm rating of ${ratings[i]} MVA. Transformer winding temperatures start to climb.` });
      }
    });
    if (q.minV < uvLim && q.trains > 0 && !seen.has('uv')) {
      seen.add('uv');
      ev.push({ t: at(m), kind: 'warn', title: `Undervoltage: ${Math.round(q.minV)} V`, body: 'A train’s pantograph voltage has sagged towards the 1000 V limit. Its traction power is being cut back, so it accelerates more slowly.' });
    }
  });
  for (const [id, [a, b]] of trips) {
    const name = tripLabel(x.c, id);
    if (a <= 0 && b >= 24) ev.push({ t: 0, kind: 'trip', title: `${name} out all day`, body: `${name} is out of service for the whole day in this run.` });
    else {
      ev.push({ t: a, kind: 'trip', title: `${name} trips`, body: `${name} goes out of service. Everything it feeds loses mains power now; anything with a battery or a generator starts its own countdown.` });
      if (b < 24) ev.push({ t: b, kind: 'info', title: `${name} restored`, body: `${name} is back. Loads reconnect, and batteries start recharging.` });
    }
  }
  return ev.sort((a, b) => a.t - b.t).map((e) => ({ ...e, title: e.title }));
}

export function tripLabel(c: CityData, id: string) {
  if (id.startsWith('tss:')) {
    const [, l, i] = id.split(':').map(Number);
    return c.lines[l].tss[i].name;
  }
  return c.subs.find((s) => s.id === id)?.name ?? id;
}

export { fmtH };
