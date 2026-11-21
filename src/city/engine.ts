// The coupling engine: one clock, one dependency graph. Every asset in the
// city declares what feeds it; when a feed is lost the asset falls back to its
// backup (if it has one) or goes dark, and everything that depends on it
// follows. Step 1 couples the 132/33 kV substations, the districts they feed
// and the metro traction substations. Later sectors (telecom, hospitals,
// water, EV, data centres) plug into the same graph.

import { DISTRICTS, GRID_SUBS, LINES } from './meridia';
import { cityLoad, districtLoad, LOSS_FRACTION, sunElevation, temperature, type DayInputs, type DistrictLoad } from './demand';
import { DC, TractionSim, headway, type TractionOpts } from './metro';

export type CityOpts = DayInputs & Omit<TractionOpts, 'inp'>;
export const DEFAULT_OPTS: CityOpts = { season: 'summer', day: 'weekday', heat: 0, peakHeadway: 180, regen: true, reversible: false };

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
  res: number; com: number; ind: number; inst: number; light: number; metro: number; loss: number;
  total: number; unserved: number; trains: number; regen: number; burnt: number; returned: number; minV: number; T: number;
  tss: number[]; // per traction substation, MW, flattened across lines
  subs: number[]; // per grid substation, MW
};

export type CityEvent = { t: number; kind: 'info' | 'peak' | 'warn' | 'trip'; title: string; body: string };

const subIndex = new Map(GRID_SUBS.map((s, i) => [s.id, i]));
const tssList = LINES.flatMap((l, li) => l.tss.map((t, ti) => ({ line: li, idx: ti, name: t.name, sub: t.sub })));
export const TSS_LIST = tssList;

type Checkpoint = { t: number; state: string };

/** Runs a whole day headless and records it minute by minute. */
function runDay(opts: CityOpts, trips: Set<string>, ratings: number[]) {
  const sim = new TractionSim({ ...opts, inp: opts });
  applyTrips(sim, trips);
  const mins: Minute[] = [];
  const cps: Checkpoint[] = [];
  const acc = { metro: 0, regen: 0, burnt: 0, returned: 0, minV: DC.E, tss: new Float64Array(tssList.length), n: 0, trains: 0 };
  const DT = 2;
  for (let m = 0; m < 1440; m++) {
    if (m % 15 === 0) cps.push({ t: sim.t, state: save(sim) });
    const h = m / 60;
    const active = h >= 5.4 || sim.trains.length > 0;
    acc.metro = acc.regen = acc.burnt = acc.returned = acc.n = acc.trains = 0;
    acc.minV = DC.E;
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
    mins.push(minuteAt(h + 0.5 / 60, opts, trips, metro, tss, ratings, {
      trains: Math.round(acc.trains / n), regen: acc.regen / n / 1e6, burnt: acc.burnt / n / 1e6, returned: acc.returned / n / 1e6, minV: acc.minV,
    }));
  }
  return { mins, cps };
}

function minuteAt(h: number, opts: CityOpts, trips: Set<string>, metroMW: number, tss: number[], ratings: number[], extra: Pick<Minute, 'trains' | 'regen' | 'burnt' | 'returned' | 'minV'>): Minute {
  const subs = new Array(GRID_SUBS.length).fill(0);
  const out = { res: 0, com: 0, ind: 0, inst: 0, light: 0 };
  let unserved = 0;
  for (const d of DISTRICTS) {
    const l = districtLoad(d, h, opts);
    const sum = l.res + l.com + l.ind + l.inst + l.light;
    if (trips.has(d.sub)) { unserved += sum; continue; }
    out.res += l.res; out.com += l.com; out.ind += l.ind; out.inst += l.inst; out.light += l.light;
    subs[subIndex.get(d.sub)!] += sum;
  }
  tssList.forEach((t, i) => { subs[subIndex.get(t.sub)!] += tss[i]; });
  const base = out.res + out.com + out.ind + out.inst + out.light + metroMW;
  const loss = base * LOSS_FRACTION;
  void ratings;
  return { ...out, metro: metroMW, loss, total: base + loss, unserved, T: temperature(h, opts), tss, subs, ...extra };
}

function applyTrips(sim: TractionSim, trips: Set<string>) {
  tssList.forEach((t) => sim.setTss(t.line, t.idx, !trips.has(`tss:${t.line}:${t.idx}`) && !trips.has(t.sub)));
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
function designRatings() {
  const inp: DayInputs = { season: 'summer', day: 'weekday', heat: 1 };
  const peak = new Array(GRID_SUBS.length).fill(0);
  for (let m = 0; m < 1440; m += 10) {
    const h = m / 60;
    const s = new Array(GRID_SUBS.length).fill(0);
    for (const d of DISTRICTS) {
      const l = districtLoad(d, h, inp);
      s[subIndex.get(d.sub)!] += l.res + l.com + l.ind + l.inst + l.light;
    }
    tssList.forEach((t) => { s[subIndex.get(t.sub)!] += 3; });
    s.forEach((x, i) => { peak[i] = Math.max(peak[i], x); });
  }
  return peak.map((p) => Math.ceil((p * 1.25) / 15) * 15);
}

export type DayRun = { mins: Minute[]; events: CityEvent[] };

export class CityEngine {
  opts: CityOpts;
  trips = new Set<string>();
  graph = new Coupling();
  ratings = designRatings();
  baseline!: DayRun;
  scenario!: DayRun; // same as baseline when nothing is tripped
  private cps: Checkpoint[] = [];
  sim!: TractionSim;
  private acc = 0;

  constructor(opts: CityOpts = DEFAULT_OPTS) {
    this.opts = { ...opts };
    for (const s of GRID_SUBS) this.graph.add(s.id, s.name);
    for (const d of DISTRICTS) this.graph.add(`d:${d.id}`, d.name, [d.sub]);
    tssList.forEach((t) => this.graph.add(`tss:${t.line}:${t.idx}`, t.name, [t.sub]));
    this.recompute(8);
  }

  /** Re-run the day after a change to the inputs or the trips, then return to hour h. */
  recompute(h = this.hour) {
    const base = runDay(this.opts, new Set(), this.ratings);
    this.baseline = { mins: base.mins, events: findEvents(base.mins, this.opts, new Set(), this.ratings) };
    if (this.trips.size) {
      const sc = runDay(this.opts, this.trips, this.ratings);
      this.scenario = { mins: sc.mins, events: findEvents(sc.mins, this.opts, this.trips, this.ratings) };
      this.cps = sc.cps;
    } else {
      this.scenario = this.baseline;
      this.cps = base.cps;
    }
    this.graph.tripped = new Set(this.trips);
    this.graph.resolve();
    this.seek(h);
  }

  setOpts(o: Partial<CityOpts>) {
    Object.assign(this.opts, o);
    this.recompute();
  }

  trip(id: string, on: boolean) {
    if (on) this.trips.add(id);
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
    this.sim = new TractionSim({ ...this.opts, inp: this.opts });
    load(this.sim, cp.state);
    applyTrips(this.sim, this.trips);
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
  }

  /** Loads and states at the current instant, for the scene and the inspector. */
  now() {
    const h = this.hour;
    const districts = DISTRICTS.map((d) => {
      const l = districtLoad(d, h, this.opts);
      const up = this.graph.up(`d:${d.id}`);
      return { d, l, up };
    });
    const subs = GRID_SUBS.map((s, i) => ({ s, mw: 0, rating: this.ratings[i], up: this.graph.up(s.id) }));
    for (const x of districts) if (x.up) subs[subIndex.get(x.d.sub)!].mw += sumLoad(x.l);
    const bySub = this.sim.powerBySub();
    for (const [k, v] of Object.entries(bySub)) subs[subIndex.get(k)!].mw += v / 1e6;
    const c = cityLoad(h, this.opts);
    const metro = this.sim.gridPower() / 1e6;
    let unserved = 0;
    for (const x of districts) if (!x.up) unserved += sumLoad(x.l);
    const served = c.res + c.com + c.ind + c.inst + c.light - unserved + metro;
    return { h, T: temperature(h, this.opts), sunEl: sunElevation(h, this.opts), districts, subs, metro, total: served * (1 + LOSS_FRACTION), unserved, hw: headway(h, { ...this.opts, inp: this.opts }) };
  }

  minute(h = this.hour) {
    return this.scenario.mins[Math.min(1439, Math.max(0, Math.floor(h * 60)))];
  }
}

export const sumLoad = (l: DistrictLoad) => l.res + l.com + l.ind + l.inst + l.light;

const fmtH = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

/** Scan a recorded day for the moments worth a marker on the time bar. */
export function findEvents(mins: Minute[], opts: CityOpts, trips: Set<string>, ratings: number[]): CityEvent[] {
  const ev: CityEvent[] = [];
  const at = (m: number) => m / 60;
  // street lighting follows the sun
  for (let m = 1; m < 1440; m++) {
    const a = sunElevation(at(m - 1), opts), b = sunElevation(at(m), opts);
    if (a > -1 && b <= -1) ev.push({ t: at(m), kind: 'info', title: 'Street lights on', body: `The sun is 1° below the horizon. Photocells switch on about ${Math.round(mins[m + 5]?.light ?? 0)} MW of street lighting across ${DISTRICTS.length} districts.` });
    if (a < -1 && b >= -1) ev.push({ t: at(m), kind: 'info', title: 'Street lights off', body: 'Daylight is back; the street lighting load drops out within a few minutes.' });
  }
  ev.push({ t: 5.5, kind: 'info', title: 'First trains', body: 'Both metro lines start service. Traction load comes on one train at a time.' });
  if (opts.day === 'weekday') ev.push({ t: 7, kind: 'info', title: 'Peak service', body: `Trains every ${Math.round(opts.peakHeadway / 60 * 10) / 10} minutes on both lines until 10:00. More trains, more acceleration, more traction power.` });
  ev.push({ t: 23.5, kind: 'info', title: 'Last departures', body: 'The last trains leave the terminals; traction load fades to zero as they arrive.' });
  // peaks
  let pk = 0;
  mins.forEach((x, i) => { if (x.total > mins[pk].total) pk = i; });
  ev.push({ t: at(pk), kind: 'peak', title: `City peak ${Math.round(mins[pk].total)} MW`, body: `The highest demand of the day. Homes ${Math.round(mins[pk].res)} MW, offices and shops ${Math.round(mins[pk].com)} MW, industry ${Math.round(mins[pk].ind)} MW, at ${mins[pk].T.toFixed(1)} °C.` });
  let mp = 0;
  mins.forEach((x, i) => { if (x.metro > mins[mp].metro) mp = i; });
  if (mins[mp].metro > 0) ev.push({ t: at(mp), kind: 'peak', title: `Traction peak ${mins[mp].metro.toFixed(1)} MW`, body: `${mins[mp].trains} trains in service. Braking trains fed ${mins[mp].regen.toFixed(1)} MW back to accelerating ones.` });
  // overloads and undervoltage, first occurrence of each
  const seen = new Set<string>();
  mins.forEach((x, m) => {
    x.tss.forEach((p, i) => {
      if (p > DC.tssRating && !seen.has('tss' + i)) {
        seen.add('tss' + i);
        ev.push({ t: at(m), kind: 'warn', title: `${tssList[i].name} over rating`, body: `${p.toFixed(1)} MW averaged over a minute against a ${DC.tssRating} MW continuous rating. Rectifiers can carry this for a while, but not all day.` });
      }
    });
    x.subs.forEach((p, i) => {
      if (p > ratings[i] && !seen.has('sub' + i)) {
        seen.add('sub' + i);
        ev.push({ t: at(m), kind: 'warn', title: `${GRID_SUBS[i].name} overloaded`, body: `${Math.round(p)} MW against a firm rating of ${ratings[i]} MVA. Transformer winding temperatures start to climb.` });
      }
    });
    if (x.minV < 1150 && x.trains > 0 && !seen.has('uv')) {
      seen.add('uv');
      ev.push({ t: at(m), kind: 'warn', title: `Undervoltage: ${Math.round(x.minV)} V`, body: 'A train’s pantograph voltage has sagged towards the 1000 V limit. Its traction power is being cut back, so it accelerates more slowly.' });
    }
  });
  if (trips.size) ev.push({ t: 0, kind: 'trip', title: `${trips.size} asset${trips.size > 1 ? 's' : ''} out of service`, body: [...trips].map((id) => tripLabel(id)).join(', ') + ' — out for the whole day in this run.' });
  return ev.sort((a, b) => a.t - b.t).map((e) => ({ ...e, title: e.title }));
}

export function tripLabel(id: string) {
  if (id.startsWith('tss:')) {
    const [, l, i] = id.split(':').map(Number);
    return LINES[l].tss[i].name;
  }
  return GRID_SUBS.find((s) => s.id === id)?.name ?? id;
}

export { fmtH };
