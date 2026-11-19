// Time-domain simulation of a real transmission region built from OpenStreetMap.
//
// Frequency: aggregated swing equation per electrical island, including the
// external equivalent (the rest of the interconnection) when it is AC-coupled.
// Network: AC fast-decoupled load flow per island every 0.25 s of simulated time,
// giving bus voltages, reactive limits and branch MVA flows.
// Protection: inverse-time thermal, distance (>230 %), out-of-step on large angle
// separation, under-frequency load shedding, generator under/over-frequency and
// over/under-voltage tripping, under-voltage load shedding and voltage collapse.

import { fdlf, newtonRaphson, branchFlows, type ACBranch, type ACBus } from './acflow';
import { findIslands, type FlowLine, type Islands } from './loadflow';

export interface RegionBus { x: number; z: number; name: string; kv: number; boundary?: boolean; load: number }
export interface RegionBranch { a: number; b: number; kv: number; circuits: number; km: number; x: number; r: number; bc: number; mva: number; name?: string; pts: [number, number][] }
export type GenKind = 'nuclear' | 'coal' | 'gas' | 'oil' | 'hydro' | 'wind' | 'solar' | 'bio' | 'battery';
export interface RegionPlant { name: string; kind: GenKind; mw: number; bus: number; x: number; z: number; est?: boolean; offline?: boolean }
export interface RegionPlace { x: number; z: number; pop: number; name?: string; t: string }
export interface RegionData {
  id: string; city: string; country: string; scope: string; freq: number;
  center: [number, number]; bbox: [number, number, number, number]; extent: number; bounds: [number, number, number, number];
  demandMW: number; ext: { name: string; MW: number; H: number; hvdc?: boolean; bus?: number; tieBuses?: number[] };
  buses: RegionBus[]; branches: RegionBranch[]; plants: RegionPlant[]; places: RegionPlace[];
  roads: [number, number][][]; coast: [number, number][][]; rivers: [number, number][][];
  source: string; built: string;
  /** Fraction of reactance cancelled by series capacitors on long 765 kV lines. */
  seriesComp?: number;
  /** Plants (name fragments) that run regardless of merit order. */
  mustRun?: string[];
  /** Share of a plant's capacity that feeds this AC model (name fragment -> fraction), e.g. the 60 Hz half of Itaipu. */
  acShare?: Record<string, number>;
}

const KIND: Record<GenKind, { H: number; droop: number; Tg: number; ramp: number; minFrac: number; cost: number; sync: boolean }> = {
  nuclear: { H: 6, droop: 0, Tg: 10, ramp: 0.005, minFrac: 0.9, cost: 12, sync: true },
  coal: { H: 5, droop: 0.05, Tg: 8, ramp: 0.02, minFrac: 0.4, cost: 80, sync: true },
  gas: { H: 4.5, droop: 0.04, Tg: 3.5, ramp: 0.06, minFrac: 0.35, cost: 70, sync: true },
  oil: { H: 3, droop: 0.04, Tg: 2, ramp: 0.1, minFrac: 0.2, cost: 160, sync: true },
  hydro: { H: 3.5, droop: 0.03, Tg: 3, ramp: 0.3, minFrac: 0, cost: 40, sync: true },
  bio: { H: 4, droop: 0.05, Tg: 6, ramp: 0.03, minFrac: 0.4, cost: 90, sync: true },
  wind: { H: 0, droop: 0, Tg: 1, ramp: 1, minFrac: 0, cost: 0, sync: false },
  solar: { H: 0, droop: 0, Tg: 1, ramp: 1, minFrac: 0, cost: 0, sync: false },
  // grid-forming battery: an inverter that behaves as a voltage source, with synthetic inertia and a
  // very stiff, very fast droop; idle until frequency moves, and it can absorb as well as inject
  battery: { H: 6, droop: 0.01, Tg: 0.15, ramp: 1, minFrac: 0, cost: 500, sync: true },
};

export interface GenState {
  def: RegionPlant;
  online: boolean;
  /** Scheduled output, MW. */
  sched: number;
  gov: number;
  p: number;
  q: number;
  /** Available capacity (derates, weather), MW. */
  avail: number;
  tripReason?: string;
  vTimer: number;
}

export interface BranchState {
  def: RegionBranch;
  closed: boolean;
  P: number;
  Q: number;
  loading: number;
  heat: number;
  tripped?: string;
  ext?: boolean;
}

export interface BusState {
  def: RegionBus;
  V: number;
  theta: number;
  f: number;
  rocof: number;
  live: boolean;
  demand: number;
  served: number;
  /** Fraction shed by UFLS / UVLS. */
  shed: number;
  connected: number;
  uvTimer: number;
}

export interface RegionLog { t: number; level: 'info' | 'warn' | 'alarm'; text: string }
export interface RegionEvent { t: number; title: string; detail: string; severity: 'minor' | 'major' | 'blackout' }

export interface RegionTrace { t: number; f: number; vMin: number; served: number; demand: number; islands: number }

export class RegionSim {
  readonly data: RegionData;
  readonly f0: number;
  t = 0;
  buses: BusState[];
  branches: BranchState[];
  gens: GenState[];
  /** Index of the external equivalent bus (-1 if HVDC or none). */
  extBus = -1;
  ext: { online: boolean; p: number; sched: number; gov: number; MW: number; H: number; hvdc: boolean; bus: number; deficit: number; shed: number };
  /** Fraction of designed UFLS that actually operates (1 = all relays work). */
  uflsWorks = 1;
  /** Optional generator under-frequency endurance rule, e.g. ERCOT 59.4 Hz for 9 minutes. */
  ufGenRule?: { f: number; seconds: number };
  private ufGenTimer = 0;
  /** Inverter output dropped by fault ride-through settings during voltage dips, MW per event. */
  rideThroughLoss = 0;
  /** Fraction of synchronous capacity providing primary frequency response. */
  responseShare = 0.35;
  /** Extra shunt susceptance per bus, pu (capacitors and lightly loaded cables push voltage up). */
  shunt: number[] = [];
  /** Extra demand per bus, MW (lost embedded generation shows up as demand). */
  extraLoad: number[] = [];
  /** Shunt reactors at EHV substations, pu (negative susceptance), sized against line charging. */
  reactor: number[] = [];
  private reactorMin: number[] = [];
  islands!: Islands;
  private topoDirty = true;
  private acTimer = 0;
  private flowLines: FlowLine[] = [];
  loadScale = 1;
  log: RegionLog[] = [];
  events: RegionEvent[] = [];
  trace: RegionTrace[] = [];
  private traceAcc = 0;
  private ufTimer = new Map<number, number>();
  private divergeCount = new Map<number, number>();
  ufls: number[];
  scheduled: { at: number; run: (s: RegionSim) => void; label?: string; done?: boolean }[] = [];
  get ufGenSeconds() {
    return this.ufGenTimer;
  }
  /** Peak unserved demand during the run, MW. */
  peakLost = 0;
  servedMWh = 0;
  demandMWh = 0;

  constructor(data: RegionData, opts: { loadScale?: number; extImport?: number } = {}) {
    this.data = data;
    this.f0 = data.freq;
    this.ufls = data.freq === 60 ? [59.3, 59.0, 58.7, 58.4, 58.1] : [48.8, 48.6, 48.4, 48.2, 48.0];
    this.loadScale = opts.loadScale ?? 1;
    this.buses = data.buses.map((def) => ({ def, V: 1, theta: 0, f: this.f0, rocof: 0, live: true, demand: def.load, served: def.load, shed: 0, connected: 1, uvTimer: 0 }));
    // series capacitors on long 765 kV lines cancel part of their reactance (copy so reloading does not compound it)
    const sc = data.seriesComp ?? 0;
    this.branches = data.branches.map((d) => ({ def: sc && d.kv >= 700 && d.km > 120 ? { ...d, x: d.x * (1 - sc) } : d, closed: true, P: 0, Q: 0, loading: 0, heat: 0 }));
    const share = (def: RegionPlant) => Object.entries(data.acShare ?? {}).find(([n]) => def.name.toLowerCase().includes(n.toLowerCase()))?.[1] ?? 1;
    this.gens = data.plants.map((d) => {
      const def = share(d) < 1 ? { ...d, mw: Math.round(d.mw * share(d)) } : d;
      return { def, online: !def.offline, sched: 0, gov: 0, p: 0, q: 0, avail: def.mw, vTimer: 0, tripReason: def.offline ? 'out of service' : undefined };
    });

    // external equivalent
    const boundary = data.buses.map((b, i) => (b.boundary ? i : -1)).filter((i) => i >= 0);
    const hvdc = !!data.ext.hvdc || boundary.length === 0;
    let hvBus = 0;
    if (hvdc) {
      // HVDC import lands at the boundary bus nearest the region's edge, or the highest-voltage bus
      hvBus = data.ext.bus ?? boundary[0] ?? data.buses.reduce((bi, b, i) => (b.kv > data.buses[bi].kv ? i : bi), 0);
    } else {
      this.extBus = this.buses.length;
      const [x0, z0, x1, z1] = data.bounds;
      const def: RegionBus = { x: (x0 + x1) / 2, z: z0 - (z1 - z0) * 0.2, name: data.ext.name, kv: 400, load: 0 };
      this.buses.push({ def, V: 1, theta: 0, f: this.f0, rocof: 0, live: true, demand: 0, served: 0, shed: 0, connected: 1, uvTimer: 0 });
      // only the strongest crossings carry the interconnection; low-voltage stubs leaving the box are left radial
      const topKV = Math.max(...boundary.map((bi) => data.buses[bi].kv));
      const tied = data.ext.tieBuses?.length ? data.ext.tieBuses : boundary;
      void topKV;
      for (const bi of tied) {
        const kv = data.buses[bi].kv;
        const tie: RegionBranch = { a: bi, b: this.extBus, kv, circuits: 2, km: 0, x: 0.015, r: 0.0015, bc: 0, mva: kv >= 370 ? 3000 : kv >= 270 ? 1600 : 900, name: `Tie to ${data.ext.name}`, pts: [] };
        this.branches.push({ def: tie, closed: true, P: 0, Q: 0, loading: 0, heat: 0, ext: true });
      }
    }
    this.ext = { online: true, p: opts.extImport ?? 0, sched: opts.extImport ?? 0, gov: 0, MW: data.ext.MW, H: data.ext.H, hvdc, bus: hvdc ? hvBus : this.extBus, deficit: 0, shed: 0 };
    this.flowLines = this.branches.map((b) => ({ from: b.def.a, to: b.def.b, x: b.def.x, closed: true }));
    this.reactor = this.buses.map(() => 0);
    this.reactorMin = this.buses.map(() => 0);
    for (const br of this.branches) {
      this.reactorMin[br.def.a] -= 0.9 * (br.def.bc / 2);
      this.reactorMin[br.def.b] -= 0.9 * (br.def.bc / 2);
      // long EHV lines (several hundred MVAr of charging) carry fixed line reactors at both ends,
      // typically compensating about 70 % of the charging; without them the first solve has no answer
      if (br.def.bc > 3) {
        this.reactor[br.def.a] -= 0.7 * (br.def.bc / 2);
        this.reactor[br.def.b] -= 0.7 * (br.def.bc / 2);
      }
    }
    this.rebuild();
    // fragments of the OSM network with no path to the main system are not energised
    let main = 0;
    let best = -1;
    this.islands.members.forEach((m, k) => {
      const d = m.reduce((a, b) => a + this.buses[b].def.load, 0) + (this.extBus >= 0 && m.includes(this.extBus) ? 1e9 : 0);
      if (d > best) {
        best = d;
        main = k;
      }
    });
    this.buses.forEach((b, i) => {
      if (this.islands.of[i] !== main) {
        b.f = 0;
        b.def.load = 0;
      }
    });
    this.gens.forEach((g) => {
      if (this.islands.of[g.def.bus] !== main) g.tripReason = 'not connected to the main system in this model';
    });
    this.dispatch(opts.extImport);
    this.solveNetwork(true);
    this.settle();
  }

  /** Let governors and voltages settle, then start the clock from zero. */
  settle(seconds = 40) {
    const sched = this.scheduled;
    this.scheduled = [];
    this.advance(seconds);
    // undo anything the start-up transient shed or curtailed, then settle again
    for (const b of this.buses) if (b.live) b.shed = 0;
    for (const g of this.gens) if (!KIND[g.def.kind].sync && !g.tripReason) g.avail = g.def.mw;
    this.advance(10);
    this.scheduled = sched;
    this.t = 0;
    this.log = [];
    this.events = [];
    this.trace = [];
    this.peakLost = 0;
    this.servedMWh = this.demandMWh = 0;
  }

  get demand() {
    return this.buses.reduce((a, b) => a + b.demand, 0);
  }
  get served() {
    return this.buses.reduce((a, b) => a + b.served, 0);
  }
  /** Frequency of the island holding the most demand. */
  get frequency() {
    let best = -1;
    let bestD = -1;
    this.islands.members.forEach((m, k) => {
      if (this.buses[m[0]].f <= 0) return; // the main island is the largest live one
      const d = m.reduce((a, b) => a + this.buses[b].demand, 0) + 1;
      if (d > bestD) {
        bestD = d;
        best = k;
      }
    });
    const m = this.islands.members[best];
    return m ? this.buses[m[0]].f : 0;
  }
  get rocof() {
    const live = this.buses.filter((b) => b.live && b.demand > 0);
    return live.length ? live[0].rocof : 0;
  }

  note(level: RegionLog['level'], text: string) {
    this.log.push({ t: this.t, level, text });
    if (this.log.length > 400) this.log.shift();
  }
  raise(title: string, detail: string, severity: RegionEvent['severity']) {
    this.events.push({ t: this.t, title, detail, severity });
  }
  at(t: number, run: (s: RegionSim) => void, label?: string) {
    this.scheduled.push({ at: t, run, label });
    this.scheduled.sort((a, b) => a.at - b.at);
  }

  // ------------------------------------------------------------ setup

  /** Merit-order dispatch of online plant to the current demand, with the external link taking the rest. */
  dispatch(extImport?: number, margin = 1.12) {
    for (const b of this.buses) b.demand = b.def.load * this.loadScale;
    let need = this.demand * 1.02 - (extImport ?? (this.ext.hvdc ? this.ext.MW * 0.6 : 0));
    const must = (g: GenState) => !!this.data.mustRun?.some((n) => g.def.name.toLowerCase().includes(n.toLowerCase()));
    const order = [...this.gens].sort((a, b) => KIND[a.def.kind].cost - (must(a) ? 100 : 0) - (KIND[b.def.kind].cost - (must(b) ? 100 : 0)));
    // unit commitment: cheapest plant first until demand plus a reserve margin is covered
    let committed = 0;
    for (const g of order) {
      if (g.tripReason) continue;
      g.online = committed < need * margin;
      if (g.online) committed += g.avail;
    }
    // system strength: keep a minimum of synchronous machines online, as operators require
    let syncOn = order.filter((g) => g.online && KIND[g.def.kind].sync).reduce((x, g) => x + g.avail, 0);
    for (const g of order) {
      if (syncOn >= this.demand * 0.4) break;
      if (g.online || g.tripReason || !KIND[g.def.kind].sync) continue;
      g.online = true;
      syncOn += g.avail;
    }
    for (const g of order) {
      g.sched = 0;
      if (!g.online) continue;
      const k = KIND[g.def.kind];
      const min = g.avail * (must(g) ? Math.max(0.6, k.minFrac) : k.minFrac);
      g.sched = min;
      need -= min;
    }
    for (const g of order) {
      if (!g.online || need <= 0) continue;
      const k = KIND[g.def.kind];
      const room = g.avail * (k.droop > 0 ? 0.9 : 1) - g.sched;
      const add = Math.max(0, Math.min(room, need));
      g.sched += add;
      need -= add;
    }
    for (const g of this.gens) g.p = g.sched;
    if (extImport === undefined) {
      const cap = this.ext.hvdc ? this.ext.MW : this.ext.MW * 0.25;
      const planned = this.ext.hvdc ? this.ext.MW * 0.6 : 0;
      this.ext.sched = Math.max(-cap, Math.min(cap, planned + need));
      need -= this.ext.sched - planned;
    } else this.ext.sched = extImport;
    this.ext.p = this.ext.sched;
    // if still short, scale demand down so the case starts balanced
    const shortfall = need;
    if (shortfall > 1) {
      const k = Math.max(0.5, 1 - shortfall / this.demand);
      for (const b of this.buses) b.def.load *= k;
      for (const b of this.buses) b.demand = b.def.load * this.loadScale;
    }
  }

  // ------------------------------------------------------------ commands

  tripBranch(i: number, reason: string, quiet = false) {
    const br = this.branches[i];
    if (!br || !br.closed) return;
    br.closed = false;
    br.tripped = reason;
    this.topoDirty = true;
    this.note('alarm', `${this.branchName(i)} tripped: ${reason}`);
    if (!quiet) this.raise(`${this.branchName(i)} tripped`, reason, 'major');
  }
  closeBranch(i: number) {
    const br = this.branches[i];
    br.closed = true;
    br.tripped = undefined;
    br.heat = Math.min(br.heat, 0.5);
    this.topoDirty = true;
    this.note('info', `${this.branchName(i)} closed`);
  }
  tripGen(i: number, reason: string) {
    const g = this.gens[i];
    if (!g || !g.online) return;
    const lost = g.p;
    g.online = false;
    g.tripReason = reason;
    g.p = g.sched = g.gov = 0;
    this.note('alarm', `${g.def.name} tripped (${Math.round(lost)} MW): ${reason}`);
    this.raise(`${g.def.name} tripped`, `${Math.round(lost)} MW lost. ${reason}`, lost > 200 ? 'major' : 'minor');
  }
  /** Hydro and small gas or oil units can start without outside power. */
  canBlackStart(i: number) {
    const d = this.gens[i].def;
    return d.kind === 'hydro' || ((d.kind === 'gas' || d.kind === 'oil') && d.mw <= 220);
  }

  /** Total blackout: every machine stopped, every breaker open, every feeder off. */
  goDark() {
    for (const g of this.gens) {
      if (g.tripReason === 'out of service' || g.tripReason?.startsWith('not connected')) continue;
      g.online = false;
      g.tripReason = undefined;
      g.p = g.sched = g.gov = 0;
    }
    this.branches.forEach((b) => {
      b.closed = false;
      b.tripped = undefined;
      b.heat = 0;
    });
    for (const b of this.buses) {
      b.f = 0;
      b.V = 0;
      b.live = false;
      b.connected = 0;
      b.shed = 0;
    }
    this.ext.sched = this.ext.p = 0;
    this.topoDirty = true;
    this.rebuild();
    this.log = [];
    this.events = [];
    this.trace = [];
    this.peakLost = 0;
    this.t = 0;
  }

  /** Reconnect demand at one substation in a block. */
  connectBus(i: number, frac: number) {
    const b = this.buses[i];
    if (!b.live) return;
    b.connected = Math.max(0, Math.min(1, b.connected + frac));
    if (frac > 0) b.shed = Math.max(0, b.shed - frac);
  }

  startGen(i: number) {
    const g = this.gens[i];
    const b = this.buses[g.def.bus];
    if (!g.online && !b.live && this.canBlackStart(i) && !g.tripReason) {
      // black start: this machine forms a new live island
      if (this.topoDirty) this.rebuild();
      g.online = true;
      g.sched = 0;
      for (const m of this.islands.members[this.islands.of[g.def.bus]]) {
        this.buses[m].f = this.f0;
        this.buses[m].V = 1;
        this.buses[m].live = true;
      }
      this.note('info', `${g.def.name} black-started: a live island forms`);
      return true;
    }
    if (g.online || !b.live) return false;
    g.online = true;
    g.tripReason = undefined;
    g.sched = 0;
    this.note('info', `${g.def.name} synchronised`);
    return true;
  }
  setGen(i: number, mw: number) {
    const g = this.gens[i];
    g.sched = Math.max(0, Math.min(g.avail, mw));
  }
  setExt(mw: number) {
    this.ext.sched = Math.max(-this.ext.MW, Math.min(this.ext.MW, mw));
  }
  tripExt(reason: string) {
    if (!this.ext.online) return;
    const lost = this.ext.p;
    if (this.ext.hvdc) {
      this.ext.online = false;
      this.ext.p = 0;
      this.note('alarm', `${this.data.ext.name} blocked: ${reason}`);
      this.raise(`${this.data.ext.name} lost`, `${Math.round(lost)} MW of imports gone. ${reason}`, 'major');
    } else {
      this.branches.forEach((b, i) => b.ext && b.closed && this.tripBranch(i, reason, true));
      this.raise(`Separated from ${this.data.ext.name}`, `${Math.round(lost)} MW was flowing in. ${reason}`, 'major');
    }
  }
  shedLoad(frac: number, near?: { x: number; z: number; r: number }) {
    for (const b of this.buses) {
      if (near && Math.hypot(b.def.x - near.x, b.def.z - near.z) > near.r) continue;
      b.connected = Math.max(0, b.connected - frac);
    }
  }
  restoreLoad(frac: number) {
    for (const b of this.buses) {
      if (!b.live) continue;
      b.connected = Math.min(1, b.connected + frac);
      if (b.shed > 0) b.shed = Math.max(0, b.shed - frac);
    }
  }

  /** Add a new plant (e.g. a unit that does not exist yet) running at `mw`, backing off others. */
  addPlant(def: RegionPlant, mw: number) {
    this.gens.push({ def, online: true, sched: mw, gov: 0, p: mw, q: 0, avail: def.mw, vTimer: 0 });
    // other plant backs down to make room, cheapest-last
    let excess = mw;
    const order = this.gens.slice(0, -1).filter((g) => g.online && KIND[g.def.kind].droop > 0).sort((a, b) => KIND[b.def.kind].cost - KIND[a.def.kind].cost);
    for (const g of order) {
      if (excess <= 0) break;
      const cut = Math.min(excess, g.sched - g.avail * KIND[g.def.kind].minFrac);
      if (cut > 0) {
        g.sched -= cut;
        g.p -= cut;
        excess -= cut;
      }
    }
    this.data.plants.push(def);
  }

  /** Add demand spread over buses near a point (or everywhere), MW. */
  loadStep(mw: number, near?: { x: number; z: number; r: number }) {
    const idx = this.buses.map((_b, i) => i).filter((i) => this.buses[i].def.load > 0 && (!near || Math.hypot(this.buses[i].def.x - near.x, this.buses[i].def.z - near.z) < near.r));
    const tot = idx.reduce((a, i) => a + this.buses[i].def.load, 0) || 1;
    for (const i of idx) this.extraLoad[i] = (this.extraLoad[i] ?? 0) + (mw * this.buses[i].def.load) / tot;
  }
  /** Raise voltages in an area by adding shunt capacitance, pu per bus. */
  addShunt(bpu: number, near?: { x: number; z: number; r: number }) {
    this.buses.forEach((b, i) => {
      if (near && Math.hypot(b.def.x - near.x, b.def.z - near.z) > near.r) return;
      this.shunt[i] = (this.shunt[i] ?? 0) + bpu;
    });
  }
  /** Partial loss of a plant (e.g. some units or turbines), fraction 0..1 lost. */
  derateGen(i: number, frac: number, reason: string) {
    const g = this.gens[i];
    if (!g || !g.online) return;
    const lost = g.p * frac;
    g.avail *= 1 - frac;
    g.sched = Math.min(g.sched, g.avail);
    g.gov = Math.min(g.gov, g.avail - g.sched);
    g.p -= lost;
    this.note('alarm', `${g.def.name} lost ${Math.round(lost)} MW: ${reason}`);
    this.raise(`${g.def.name}: ${Math.round(lost)} MW lost`, reason, lost > 200 ? 'major' : 'minor');
  }

  branchName(i: number) {
    const br = this.branches[i];
    if (br.def.name && !/^[a-z]{2,10}$/.test(br.def.name)) return br.def.name;
    const a = this.data.buses[br.def.a]?.name ?? '';
    const b = br.ext ? this.data.ext.name : this.data.buses[br.def.b]?.name ?? '';
    return `${a || 'Junction'} to ${b || 'junction'} ${br.def.kv} kV`;
  }

  // ------------------------------------------------------------ lookup helpers for scripted events

  findBus(name: string, near?: [number, number]) {
    const q = name.toLowerCase();
    let hits = this.data.buses.map((b, i) => ({ b, i })).filter(({ b }) => b.name.toLowerCase().includes(q));
    if (!hits.length && near) hits = this.data.buses.map((b, i) => ({ b, i }));
    if (!hits.length) return -1;
    if (near) hits.sort((a, b) => Math.hypot(a.b.x - near[0], a.b.z - near[1]) - Math.hypot(b.b.x - near[0], b.b.z - near[1]));
    else hits.sort((a, b) => b.b.kv - a.b.kv);
    return hits[0].i;
  }
  findGen(name: string, near?: [number, number], kind?: GenKind) {
    const q = name.toLowerCase();
    let hits = this.gens.map((g, i) => ({ g, i })).filter(({ g }) => g.def.name.toLowerCase().includes(q) && (!kind || g.def.kind === kind));
    if (!hits.length && near) hits = this.gens.map((g, i) => ({ g, i })).filter(({ g }) => !kind || g.def.kind === kind);
    if (!hits.length) return -1;
    if (near) hits.sort((a, b) => Math.hypot(a.g.def.x - near[0], a.g.def.z - near[1]) - Math.hypot(b.g.def.x - near[0], b.g.def.z - near[1]));
    else hits.sort((a, b) => b.g.def.mw - a.g.def.mw);
    return hits[0].i;
  }
  /** Branches touching a bus, heaviest first. */
  branchesAt(bus: number) {
    return this.branches.map((b, i) => ({ b, i })).filter(({ b }) => b.def.a === bus || b.def.b === bus).sort((x, y) => Math.abs(y.b.P) - Math.abs(x.b.P)).map((x) => x.i);
  }
  /** Branch between two buses (or the heaviest at the first if none). */
  branchBetween(a: number, b: number) {
    const i = this.branches.findIndex((br) => (br.def.a === a && br.def.b === b) || (br.def.a === b && br.def.b === a));
    return i;
  }
  /** Branches crossing a straight cut line (x0,z0)-(x1,z1). */
  branchesCrossing(x0: number, z0: number, x1: number, z1: number) {
    const side = (x: number, z: number) => Math.sign((x1 - x0) * (z - z0) - (z1 - z0) * (x - x0));
    return this.branches
      .map((br, i) => ({ br, i }))
      .filter(({ br }) => {
        if (br.ext) return false;
        const A = this.data.buses[br.def.a];
        const B = this.data.buses[br.def.b];
        if (side(A.x, A.z) === side(B.x, B.z)) return false;
        // segment intersection with the cut
        const s2 = (x: number, z: number) => Math.sign((B.x - A.x) * (z - A.z) - (B.z - A.z) * (x - A.x));
        return s2(x0, z0) !== s2(x1, z1);
      })
      .map(({ i }) => i);
  }

  // ------------------------------------------------------------ simulation

  advance(seconds: number) {
    let left = seconds;
    while (left > 1e-9) {
      const dt = Math.min(left, 0.05);
      this.step(dt);
      left -= dt;
    }
  }

  private rebuild() {
    this.topoDirty = false;
    this.branches.forEach((b, i) => (this.flowLines[i].closed = b.closed));
    const old = this.buses.map((b) => b.f);
    this.islands = findIslands(this.buses.length, this.flowLines);
    for (const m of this.islands.members) {
      const live = m.filter((b) => old[b] > 0);
      const f = live.length ? live.reduce((a, b) => a + old[b], 0) / live.length : 0;
      for (const b of m) this.buses[b].f = f;
    }
  }

  step(dt: number) {
    this.t += dt;
    for (const s of this.scheduled) {
      if (!s.done && this.t >= s.at) {
        s.done = true;
        s.run(this);
      }
    }
    if (this.topoDirty) this.rebuild();
    const nI = this.islands.members.length;
    const Ek = new Array(nI).fill(0);
    const pGen = new Array(nI).fill(0);
    const pLoad = new Array(nI).fill(0);
    for (const g of this.gens) {
      if (!g.online) continue;
      const k = KIND[g.def.kind];
      if (k.sync) Ek[this.islands.of[g.def.bus]] += k.H * (g.def.mw / 0.9);
    }
    if (this.extBus >= 0 && this.ext.online) Ek[this.islands.of[this.extBus]] += this.ext.H * this.ext.MW;
    for (let k = 0; k < nI; k++) {
      if (Ek[k] <= 0) for (const b of this.islands.members[k]) this.buses[b].f = 0;
    }
    for (const b of this.buses) b.live = b.f > 0;

    // generators
    for (const g of this.gens) {
      const b = this.buses[g.def.bus];
      const k = KIND[g.def.kind];
      if (!g.online) {
        g.p = 0;
        continue;
      }
      if (!b.live) {
        if (k.sync) {
          g.online = false;
          g.tripReason = 'island collapsed';
        }
        g.p = 0;
        continue;
      }
      const df = b.f - this.f0;
      if (g.sched > g.avail) g.sched = g.avail;
      if (k.droop > 0) {
        const e = Math.abs(df) > 0.015 ? df - Math.sign(df) * 0.015 : 0;
        // only part of the fleet runs in frequency-sensitive mode with headroom held back
        const batt = g.def.kind === 'battery';
        let target = -((g.def.mw * (batt ? 1 : this.responseShare)) / k.droop) * (e / this.f0);
        target = Math.max(batt ? -g.def.mw - g.sched : -g.sched, Math.min(g.avail - g.sched, target));
        g.gov += (target - g.gov) * (1 - Math.exp(-dt / k.Tg));
        // secondary control nudges the schedule back toward nominal frequency; a battery stays at its set point
        if (!batt) g.sched = Math.max(g.avail * k.minFrac, Math.min(g.avail, g.sched - 0.002 * g.def.mw * df * dt));
      }
      // limited frequency-sensitive mode: inverter plant backs off at high frequency
      if (!k.sync && df > 0.1) g.sched = Math.max(0, g.sched - 0.01 * g.def.mw * (df - 0.1) * dt * 10);
      g.p = g.def.kind === 'battery' ? g.sched + g.gov : Math.max(0, g.sched + g.gov);
      pGen[this.islands.of[g.def.bus]] += g.p;
    }
    // external equivalent
    if (this.ext.online) {
      const kb = this.islands.of[this.ext.bus];
      const live = this.buses[this.ext.bus].live || (this.extBus >= 0);
      if (this.ext.hvdc) {
        const target = live ? this.ext.sched : 0;
        this.ext.p += Math.max(-dt * 200, Math.min(dt * 200, target - this.ext.p));
        if (!this.buses[this.ext.bus].live) this.ext.p = 0;
        pGen[kb] += this.ext.p;
      } else {
        const df = this.buses[this.extBus].f - this.f0;
        const target = -((this.ext.MW * this.responseShare) / 0.05) * (df / this.f0);
        this.ext.gov += (target - this.ext.gov) * (1 - Math.exp(-dt / 5));
        // the rest of the system keeps its own internal balance; only a deficit there moves frequency
        // slow secondary control in the wider grid restores the scheduled exchange
        if (this.ext.deficit <= this.ext.shed) this.ext.sched -= this.ext.MW * 0.0012 * df * dt;
        this.ext.p = this.ext.sched + Math.max(-this.ext.MW * 0.12, Math.min(this.ext.MW * 0.12, this.ext.gov));
        pGen[kb] += this.ext.p - Math.max(0, this.ext.deficit - this.ext.shed);
      }
    }

    // demand
    let served = 0;
    let demand = 0;
    for (let i = 0; i < this.buses.length; i++) {
      const b = this.buses[i];
      b.demand = b.def.load * this.loadScale + (this.extraLoad[i] ?? 0);
      demand += b.demand;
      if (!b.live) {
        b.served = 0;
        continue;
      }
      const frac = b.connected * Math.max(0, 1 - b.shed);
      const vfac = Math.min(1, Math.max(0.3, b.V)); // demand falls with voltage below 1 pu, constant above
      b.served = b.demand * frac * vfac;
      served += b.served;
      const df = b.f - this.f0;
      pLoad[this.islands.of[i]] += b.served * (1 + 1.5 * (df / this.f0));
    }
    this.servedMWh += (served * dt) / 3600;
    this.demandMWh += (demand * dt) / 3600;
    this.peakLost = Math.max(this.peakLost, demand - served);

    // frequency
    for (let k = 0; k < nI; k++) {
      if (Ek[k] <= 0) continue;
      const m = this.islands.members[k];
      const f = this.buses[m[0]].f;
      if (f <= 0) continue;
      const rocof = (this.f0 * (pGen[k] - pLoad[k])) / (2 * Ek[k]);
      const fNew = f + rocof * dt;
      for (const b of m) {
        this.buses[b].f = fNew;
        this.buses[b].rocof = rocof;
      }
    }

    // network solution
    this.acTimer += dt;
    if (this.acTimer >= 0.25) {
      this.acTimer = 0;
      this.solveNetwork(false);
      this.protect(0.25);
    }
    this.frequencyProtection(dt);

    this.traceAcc += dt;
    if (this.traceAcc >= 0.5) {
      this.traceAcc = 0;
      const vMin = Math.min(...this.buses.filter((b) => b.live && b.def.kv > 0).map((b) => b.V), 1.2);
      this.trace.push({ t: this.t, f: this.frequency, vMin, served, demand, islands: this.islands.members.filter((m, k) => Ek[k] > 0 && m.length > 1).length });
      if (this.trace.length > 4000) this.trace.shift();
    }
  }

  /** Solve AC load flow in every live island. */
  solveNetwork(initial: boolean) {
    if (this.topoDirty) this.rebuild();
    const n = this.buses.length;
    this.islands.members.forEach((m, k) => {
      const live = this.buses[m[0]].live;
      if (!live || m.length < 1) {
        for (const b of m) {
          this.buses[b].V = 0;
        }
        return;
      }
      const local = new Map<number, number>();
      m.forEach((b, i) => local.set(b, i));
      const acb: ACBus[] = m.map((bi) => {
        const b = this.buses[bi];
        const Pl = b.served / 100;
        return { type: 'pq', P: -Pl, Q: -Pl * 0.33, Vset: 1, Qmin: 0, Qmax: 0, Bsh: Pl * 0.26 + (this.shunt[bi] ?? 0) + this.reactor[bi] };
      });
      // generation and their reactive capability
      let Ekk = 0;
      const syncAt: [number, number][] = [];
      for (const g of this.gens) {
        if (!g.online || !local.has(g.def.bus)) continue;
        const li = local.get(g.def.bus)!;
        acb[li].P += g.p / 100;
        const k = KIND[g.def.kind];
        if (k.sync) {
          acb[li].type = 'pv';
          acb[li].Vset = 1.0;
          acb[li].Qmax += (0.55 * g.def.mw) / 100;
          acb[li].Qmin -= (0.3 * g.def.mw) / 100;
          Ekk += k.H * g.def.mw;
          syncAt.push([li, k.H * g.def.mw]);
        } else {
          acb[li].Q += 0; // inverters at unity power factor
        }
      }
      if (this.ext.online && local.has(this.ext.bus)) {
        const li = local.get(this.ext.bus)!;
        acb[li].P += this.ext.p / 100;
        if (!this.ext.hvdc) {
          acb[li].type = 'pv';
          acb[li].Vset = 1.0;
          acb[li].Qmax += this.ext.MW / 200;
          acb[li].Qmin -= this.ext.MW / 300;
          Ekk += this.ext.H * this.ext.MW;
          syncAt.push([li, this.ext.H * this.ext.MW]);
        }
      }
      if (!syncAt.length) return;
      // share the island's imbalance among machines by inertia so the slack only carries losses
      const mis = acb.reduce((a, b) => a + b.P, 0);
      for (const [li, w] of syncAt) acb[li].P -= (mis * w) / Ekk;
      const slack = syncAt.reduce((best, s) => (s[1] > best[1] ? s : best), syncAt[0])[0];
      acb[slack].type = 'slack';
      const acbr: ACBranch[] = [];
      const brIdx: number[] = [];
      this.branches.forEach((br, i) => {
        if (!br.closed || !local.has(br.def.a) || !local.has(br.def.b)) return;
        acbr.push({ from: local.get(br.def.a)!, to: local.get(br.def.b)!, r: br.def.r, x: Math.max(6e-4, br.def.x), b: br.def.bc, closed: true });
        brIdx.push(i);
      });
      let res = fdlf(acb, acbr, {
        V0: initial ? undefined : m.map((b) => this.buses[b].V || 1),
        theta0: initial ? undefined : m.map((b) => this.buses[b].theta),
        maxIter: initial ? 200 : 40, tol: 6e-4,
      });
      if (!res.converged && !initial) {
        // a warm start can wander off after a big change; retry from flat before calling it a collapse
        res = fdlf(acb, acbr, { maxIter: 200, tol: 6e-4 });
      }
      if (!res.converged && initial) {
        // the fast decoupled method can fail to start on large, heavily loaded EHV networks (Türkiye) that
        // do have a solution; take the very first operating point from Newton-Raphson. Later solves warm-start
        // from it, and genuine collapses during events are still detected by the decoupled solver.
        const nr = newtonRaphson(acb.map((x) => ({ ...x })), acbr, 6e-4, 30);
        if (nr.converged && Math.min(...Array.from(nr.V)) > 0.85) {
          res = nr;
          // long EHV lines lightly loaded push voltages up past what the machines can absorb: switch in the
          // full complement of line reactors, as operators do at light load
          // (the machines alone cannot absorb the charging); automatic switching takes them out again below 0.96 pu
          for (const b of m) this.reactor[b] = Math.min(this.reactor[b], this.reactorMin[b]);
        }
      }
      if (!res.converged) {
        const c = (this.divergeCount.get(k) ?? 0) + 1;
        this.divergeCount.set(k, c);
        this.voltageEmergency(m, c, res.V);
        return;
      }
      this.divergeCount.set(k, 0);
      m.forEach((b, i) => {
        this.buses[b].V = res.V[i];
        this.buses[b].theta = res.theta[i];
        // automatic switching of shunt reactors and capacitors toward 0.97–1.05 pu
        const bs = this.buses[b];
        const capMax = (bs.def.load * 0.35) / 100;
        const step = Math.max(0.02, -this.reactorMin[b] * 0.1, capMax * 0.1);
        if (res.V[i] > 1.05) this.reactor[b] = Math.max(this.reactorMin[b], this.reactor[b] - step);
        else if (res.V[i] < 0.96) this.reactor[b] = Math.min(capMax, this.reactor[b] + step);
      });
      acbr.forEach((br, j) => {
        const st = this.branches[brIdx[j]];
        const fl = branchFlows(br, res.V, res.theta);
        st.P = fl.P * 100;
        st.Q = fl.Q * 100;
        st.loading = (Math.hypot(st.P, st.Q) / Math.max(0.3, res.V[br.from])) / st.def.mva;
      });
      void n;
    });
    for (const br of this.branches) if (!br.closed) { br.P = br.Q = br.loading = 0; }
  }

  private voltageEmergency(members: number[], count: number, Vtry: ArrayLike<number>) {
    // load flow has no solution: part of the island is past the nose of its PV curve.
    // Rank buses by the voltages of the failed solve to find the weak area.
    const rank = members.map((b, i) => ({ b, v: Number.isFinite(Vtry[i]) ? Vtry[i] : 0 })).sort((x, y) => x.v - y.v);
    const n = Math.max(1, Math.ceil(rank.length * 0.2));
    const weak = rank.slice(0, n).map((x) => x.b);
    let shed = 0;
    for (const b of weak) {
      const bs = this.buses[b];
      if (bs.demand <= 0) continue;
      const add = Math.min(0.3, 1 - bs.shed);
      shed += bs.demand * bs.connected * add;
      bs.shed += add;
    }
    // inverter plant in the weak area loses its voltage reference and cuts back
    let cut = 0;
    for (const g of this.gens) {
      if (!g.online || KIND[g.def.kind].sync || !weak.includes(g.def.bus)) continue;
      const lose = g.p * 0.35;
      g.avail = Math.max(0, g.avail - lose);
      g.sched = Math.min(g.sched, g.avail);
      cut += lose;
    }
    if (count === 1) {
      this.note('alarm', `Voltage collapse risk: load flow has no solution. Under-voltage relays shed ${Math.round(shed)} MW${cut > 5 ? `; inverter plant cut ${Math.round(cut)} MW` : ''}.`);
      this.raise('Voltage collapse', `Voltages in the weak area are falling away. ${Math.round(shed)} MW of demand shed${cut > 5 ? ` and ${Math.round(cut)} MW of wind and solar lost` : ''}.`, 'major');
    }
    if (count >= 14) this.collapseIsland(members, 'voltage collapse');
  }

  private protect(dt: number) {
    for (let i = 0; i < this.branches.length; i++) {
      const br = this.branches[i];
      if (!br.closed) {
        br.heat = Math.max(0, br.heat - dt / 600);
        continue;
      }
      const L = br.loading;
      if (L > 1) br.heat += ((L * L - 1) / 300) * dt;
      else br.heat = Math.max(0, br.heat - ((1 - L * L) / 900) * dt);
      if (L > 2.3) this.tripBranch(i, `distance protection at ${Math.round(L * 100)} % of rating`, true);
      else if (br.heat >= 1) this.tripBranch(i, `overload: conductor sagged after ${Math.round(L * 100)} % loading`);
      else {
        const d = Math.abs(this.buses[br.def.a].theta - this.buses[br.def.b].theta);
        if (d > 1.45 && this.buses[br.def.a].live) this.tripBranch(i, `out-of-step relay: ${Math.round((d * 180) / Math.PI)}° across the line`, true);
      }
    }
    // generator voltage protection and under-voltage load shedding
    for (const g of this.gens) {
      if (!g.online || !this.buses[g.def.bus].live) continue;
      const V = this.buses[g.def.bus].V;
      if (V > 1.15 || V < 0.75) g.vTimer += dt;
      else g.vTimer = 0;
      if (g.vTimer > (V > 1.15 ? 0.5 : 1.5)) {
        const idx = this.gens.indexOf(g);
        this.tripGen(idx, V > 1.15 ? `overvoltage protection at ${V.toFixed(2)} pu` : `undervoltage ride-through exceeded at ${V.toFixed(2)} pu`);
      }
    }
    for (const b of this.buses) {
      if (!b.live || b.demand <= 0) continue;
      if (b.V < 0.85) b.uvTimer += dt;
      else b.uvTimer = 0;
      if (b.uvTimer > 2 && b.shed < 1) {
        b.shed = Math.min(1, b.shed + 0.1);
        b.uvTimer = 0;
      }
    }
  }

  private frequencyProtection(dt: number) {
    this.islands.members.forEach((m, k) => {
      const f = this.buses[m[0]].f;
      if (f <= 0) return;
      let stage = 0;
      while (stage < this.ufls.length && f < this.ufls[stage]) stage++;
      if (stage > 0) {
        let shed = 0;
        for (const b of m) {
          const bs = this.buses[b];
          const target = stage * 0.08 * this.uflsWorks;
          if (bs.shed < target && bs.demand > 0) {
            shed += bs.demand * bs.connected * (target - bs.shed);
            bs.shed = target;
          }
        }
        if (this.extBus >= 0 && m.includes(this.extBus)) {
          const extShed = stage * 0.08 * this.ext.MW * 0.8 * this.uflsWorks;
          if (extShed > this.ext.shed) {
            shed += extShed - this.ext.shed;
            this.ext.shed = extShed;
          }
        }
        if (shed > 5) {
          this.note('alarm', `Under-frequency load shedding stage ${stage} at ${f.toFixed(2)} Hz: ${Math.round(shed)} MW cut`);
          this.raise(`Load shedding, stage ${stage}`, `Frequency ${f.toFixed(2)} Hz. ${Math.round(shed)} MW disconnected.`, 'major');
        }
      }
      if (this.ufGenRule) {
        if (f < this.ufGenRule.f) this.ufGenTimer += dt;
        else this.ufGenTimer = 0;
        if (this.ufGenTimer > this.ufGenRule.seconds) {
          this.ufGenTimer = 0;
          this.collapseIsland(m, `generators reached their under-frequency endurance limit (${this.ufGenRule.f} Hz for ${this.ufGenRule.seconds / 60} min)`);
          return;
        }
      }
      const low = f < this.f0 * 0.95 || f > this.f0 * 1.04;
      const tmr = (this.ufTimer.get(m[0]) ?? 0) + (low ? dt : -this.ufTimer.get(m[0])!);
      this.ufTimer.set(m[0], low ? tmr : 0);
      if ((low && tmr > 0.4) || f < this.f0 * 0.93) this.collapseIsland(m, `frequency ${f.toFixed(2)} Hz`);
      void k;
    });
  }

  private collapseIsland(members: number[], why: string) {
    let lost = 0;
    for (const b of members) {
      const bs = this.buses[b];
      lost += bs.served;
      bs.f = 0;
      bs.live = false;
      bs.V = 0;
      bs.connected = 0;
    }
    for (const g of this.gens) {
      if (members.includes(g.def.bus) && g.online && KIND[g.def.kind].sync) {
        g.online = false;
        g.tripReason = why;
        g.p = 0;
      }
    }
    if (this.ext.hvdc && members.includes(this.ext.bus)) this.ext.p = 0;
    if (!this.ext.hvdc && members.includes(this.extBus)) {
      // the wider interconnection collapsed with this island
      this.ext.online = false;
      this.ext.p = 0;
    }
    const share = lost / Math.max(1, this.demand);
    const big = share > 0.5;
    this.note('alarm', `${big ? 'System blackout' : 'Island collapse'}: ${why}. ${Math.round(lost)} MW of demand lost.`);
    this.raise(big ? 'Blackout' : 'Island collapsed', `${Math.round(lost)} MW lost (${Math.round(share * 100)} % of demand). Cause: ${why}.`, 'blackout');
  }
}

export const GEN_KIND = KIND;

export async function loadRegion(id: string, onProgress?: (frac: number) => void): Promise<RegionData> {
  const r = await fetch(`/data/regions/${id}.json`);
  // single-page hosting answers unknown paths with the app's HTML, not a 404
  if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error(`Region ${id} not found`);
  const total = Number(r.headers.get('content-length')) || 0;
  if (!r.body || !onProgress) return r.json();
  // stream the download so the page can show progress for the bigger grids
  const reader = r.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(total ? Math.min(1, got / total) : Math.min(0.95, got / 600000));
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) {
    buf.set(c, o);
    o += c.length;
  }
  return JSON.parse(new TextDecoder().decode(buf));
}
