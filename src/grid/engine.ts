// The Halvern grid in the time domain.
//
// Per island of the network:  df/dt = f0 · (Pgen − Pload(f)) / (2 · Ek)
// where Ek = Σ H·S of synchronised machines. Governors follow droop with a
// first-order lag, AGC integrates frequency error, a DC load flow gives the
// line flows, an inverse-time thermal model trips overloaded lines, and
// under-frequency load shedding / generator protection close the loop.

import {
  BUSES, DISTRICTS, F0, LINES, PLANTS, SLACK_PREFERENCE,
  type District, type Line, type Plant, type PlantKind,
} from './network';
import { dcFlow, findIslands, type FlowLine, type Islands } from './loadflow';
import {
  clearSky, districtDemand, mulberry32, OU, ratingFactor, temperatureAt,
  windPowerFraction, type Weather,
} from './profiles';

export type UnitStatus = 'off' | 'starting' | 'waiting' | 'online' | 'stopping' | 'tripped';

export interface UnitState {
  status: UnitStatus;
  /** Seconds remaining until synchronisation. */
  startLeft: number;
  /** Scheduled (dispatch + AGC) output, MW. */
  sched: number;
  /** Governor / fast response contribution, MW. */
  gov: number;
  /** Electrical output, MW. */
  p: number;
  unavailable?: boolean;
}

export interface PlantState {
  def: Plant;
  units: UnitState[];
  setpoint: number;
  agc: boolean;
  agcOffset: number;
  /** Available renewable power before curtailment, MW. */
  available: number;
  /** Stored energy, MWh (battery / reservoir). */
  stored: number;
  output: number;
}

export interface LineState {
  def: Line;
  closed: boolean;
  flow: number;
  loading: number;
  rating: number;
  /** Thermal integral; trips at 1. */
  heat: number;
  reclosing: number;
  tripped: boolean;
}

export interface DistrictState {
  def: District;
  demand: number;
  /** Operator-controlled feeder connection, 0..1. */
  connected: number;
  uflsStage: number;
  served: number;
  rooftop: number;
  rooftopTripped: number;
  surge: number;
}

export type LogLevel = 'info' | 'warn' | 'alarm';
export interface LogEntry {
  t: number;
  level: LogLevel;
  text: string;
}

export interface Sample {
  t: number;
  demand: number;
  served: number;
  fMin: number;
  fMax: number;
  f: number;
  byKind: Record<PlantKind | 'rooftop', number>;
  costRate: number;
  co2Rate: number;
}

export interface SimEvent {
  t: number;
  title: string;
  detail: string;
  severity: 'major' | 'blackout' | 'minor';
}

export interface ScenarioHooks {
  weather: Weather;
  seed: number;
  startHour: number;
  endHour: number;
  linkPrice?: (hour: number) => number;
}

export interface Score {
  demandMWh: number;
  servedMWh: number;
  unservedMWh: number;
  reliability: number;
  inBand: number;
  fMin: number;
  fMax: number;
  cost: number;
  co2: number;
  avgCost: number;
  co2Intensity: number;
  blackouts: number;
  points: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
}

const UFLS = [48.8, 48.6, 48.4, 48.2, 48.0];
const UFLS_BLOCK = 0.09;
const ROCOF_TRIP = 0.5;
const START_COST: Partial<Record<PlantKind, number>> = { coal: 42000, ccgt: 26000, ocgt: 4500, hydro: 300 };
const VOLL = 9000; // value of lost load, € per MWh

const isSync = (k: PlantKind) => k === 'nuclear' || k === 'coal' || k === 'ccgt' || k === 'ocgt' || k === 'hydro';

export class GridSim {
  /** Seconds since midnight of day 0. */
  t: number;
  readonly startT: number;
  readonly endT: number;
  weather: Weather;
  plants: PlantState[];
  lines: LineState[];
  districts: DistrictState[];
  /** Frequency of the island each bus belongs to; 0 when dead. */
  busF: number[];
  busRocof: number[];
  energized: boolean[];
  islands: Islands;
  private topoDirty = true;
  private flowLines: FlowLine[];
  private rand: () => number;
  private windOU: OU;
  private cloudOU: OU;
  private demandOU: OU;
  private windCut = [false, false, false, false, false];
  private underTimer: number[] = [];
  temp = 15;
  wind = 8;
  cloud = 0.3;
  sun = 0;
  log: LogEntry[] = [];
  events: SimEvent[] = [];
  history: Sample[] = [];
  /** Recent frequency of the main island at 0.25 s spacing (newest last). */
  fTrace: number[] = [];
  private traceAcc = 0;
  private sampleAcc = 0;
  private sampleMin = Infinity;
  private sampleMax = -Infinity;
  private surges: { district: string; start: number; dur: number; mw: number }[] = [];
  linkPrice: (hour: number) => number;
  scheduled: { at: number; run: (s: GridSim) => void; done?: boolean }[] = [];
  score = {
    demand: 0, served: 0, cost: 0, co2: 0, inBand: 0, energizedTime: 0,
    fMin: F0, fMax: F0, blackouts: 0,
  };
  scoring = true;
  mainIsland = 0;

  constructor(h: ScenarioHooks) {
    this.weather = h.weather;
    this.t = h.startHour * 3600;
    this.startT = this.t;
    this.endT = h.endHour * 3600;
    this.rand = mulberry32(h.seed);
    this.windOU = new OU(4 * 3600, h.weather.windSigma, this.rand);
    this.cloudOU = new OU(1200, 0.18, this.rand);
    this.demandOU = new OU(600, 0.012, this.rand);
    this.linkPrice = h.linkPrice ?? (() => PLANTS.find((p) => p.kind === 'link')!.cost);
    this.plants = PLANTS.map((def) => ({
      def,
      units: Array.from({ length: def.units }, () => ({ status: 'off' as UnitStatus, startLeft: 0, sched: 0, gov: 0, p: 0 })),
      setpoint: 0,
      agc: !!def.agc,
      agcOffset: 0,
      available: 0,
      stored: def.energy ? def.energy * (def.kind === 'battery' ? 0.6 : 0.7) : 0,
      output: 0,
    }));
    this.lines = LINES.map((def) => ({ def, closed: true, flow: 0, loading: 0, rating: def.rating, heat: 0, reclosing: 0, tripped: false }));
    this.districts = DISTRICTS.map((def) => ({ def, demand: 0, connected: 1, uflsStage: 0, served: 0, rooftop: 0, rooftopTripped: 0, surge: 0 }));
    this.flowLines = this.lines.map((l) => ({ from: l.def.from, to: l.def.to, x: l.def.x, closed: true }));
    this.busF = BUSES.map(() => F0);
    this.busRocof = BUSES.map(() => 0);
    this.energized = BUSES.map(() => true);
    this.islands = findIslands(BUSES.length, this.flowLines);
    this.underTimer = BUSES.map(() => 0);
    this.updateWeather(0);
  }

  get hour() {
    return this.t / 3600;
  }
  get done() {
    return this.t >= this.endT;
  }
  plant(id: string) {
    return this.plants.find((p) => p.def.id === id)!;
  }
  line(id: string) {
    return this.lines.find((l) => l.def.id === id)!;
  }
  district(id: string) {
    return this.districts.find((d) => d.def.id === id)!;
  }

  /** Frequency of the island carrying the most demand. */
  get frequency() {
    const m = this.islands.members[this.mainIsland];
    return m ? this.busF[m[0]] : 0;
  }
  get rocof() {
    const m = this.islands.members[this.mainIsland];
    return m ? this.busRocof[m[0]] : 0;
  }

  // ---------------------------------------------------------------- commands

  note(level: LogLevel, text: string) {
    this.log.push({ t: this.t, level, text });
    if (this.log.length > 300) this.log.shift();
  }

  raise(title: string, detail: string, severity: SimEvent['severity']) {
    this.events.push({ t: this.t, title, detail, severity });
  }

  setSetpoint(id: string, mw: number) {
    const p = this.plant(id);
    const d = p.def;
    const lo = d.kind === 'wind' || d.kind === 'solar' ? 0 : Math.min(0, d.unitMin * d.units);
    p.setpoint = Math.max(lo, Math.min(d.unitMax * d.units, mw));
  }

  startUnit(id: string) {
    const p = this.plant(id);
    const u = p.units.find((u) => (u.status === 'off' || u.status === 'tripped') && !u.unavailable);
    if (!u) return false;
    u.status = 'starting';
    u.startLeft = p.def.startTime;
    u.sched = 0;
    u.gov = 0;
    if (this.scoring) this.score.cost += START_COST[p.def.kind] ?? 0;
    this.note('info', `${p.def.name}: unit ${p.units.indexOf(u) + 1} start ordered`);
    return true;
  }

  stopUnit(id: string) {
    const p = this.plant(id);
    const list = [...p.units].reverse();
    const u = list.find((u) => u.status === 'starting' || u.status === 'waiting') ?? list.find((u) => u.status === 'online');
    if (!u) return false;
    u.status = u.status === 'online' ? 'stopping' : 'off';
    this.note('info', `${p.def.name}: unit ${p.units.indexOf(u) + 1} ${u.status === 'stopping' ? 'run-down ordered' : 'start cancelled'}`);
    return true;
  }

  tripUnit(id: string, index: number, reason: string) {
    const p = this.plant(id);
    const u = p.units[index];
    if (!u || u.status !== 'online') return;
    const lost = u.p;
    u.status = 'tripped';
    u.p = 0;
    u.sched = 0;
    u.gov = 0;
    this.note('alarm', `${p.def.name} unit ${index + 1} tripped: ${reason}`);
    this.raise(`${p.def.name} unit ${index + 1} tripped`, `${Math.round(lost)} MW lost. ${reason}`, lost > 150 ? 'major' : 'minor');
  }

  setAgc(id: string, on: boolean) {
    const p = this.plant(id);
    p.agc = on;
    if (!on) {
      p.setpoint = Math.max(0, p.setpoint + p.agcOffset);
      p.agcOffset = 0;
    }
  }

  toggleLine(id: string) {
    const l = this.line(id);
    l.closed = !l.closed;
    l.reclosing = 0;
    if (l.closed) {
      l.tripped = false;
      l.heat = Math.min(l.heat, 0.5);
    }
    this.topoDirty = true;
    this.note('info', `${l.def.name} ${l.closed ? 'closed' : 'opened'} by operator`);
  }

  tripLine(id: string, reason: string, reclose = 0) {
    const l = this.line(id);
    if (!l.closed) return;
    l.closed = false;
    l.tripped = true;
    l.reclosing = reclose;
    this.topoDirty = true;
    this.note('alarm', `${l.def.name} tripped: ${reason}`);
    if (!reclose) this.raise(`${l.def.name} tripped`, reason, 'major');
  }

  setConnected(id: string, frac: number) {
    const d = this.district(id);
    d.connected = Math.max(0, Math.min(1, Math.round(frac * 10) / 10));
  }

  restoreUfls(id: string) {
    const d = this.district(id);
    if (d.uflsStage > 0) {
      d.uflsStage -= 1;
      this.note('info', `${d.def.name}: one block of shed demand restored`);
    }
  }

  addSurge(district: string, startHour: number, minutes: number, mw: number) {
    this.surges.push({ district, start: startHour * 3600, dur: minutes * 60, mw });
  }

  at(hour: number, run: (s: GridSim) => void) {
    this.scheduled.push({ at: hour * 3600, run });
  }

  // ---------------------------------------------------------------- forecast

  forecastDemand(hour: number) {
    const temp = temperatureAt(this.weather, hour);
    let total = 0;
    for (const d of this.districts) total += districtDemand(d.def, this.weather, hour, temp);
    return total;
  }

  forecastRooftop(hour: number) {
    const s = clearSky(this.weather, hour) * (1 - 0.7 * this.weather.cloud);
    return this.districts.reduce((a, d) => a + d.def.rooftop * s, 0);
  }

  /**
   * Merit-order dispatch of units that are already synchronised, aimed at the
   * forecast demand `ahead` minutes from now. Leaves AGC units some headroom.
   */
  suggestDispatch(aheadMin = 15) {
    const hour = this.hour + aheadMin / 60;
    let need = this.forecastDemand(hour) * this.servedRatio() - this.forecastRooftop(hour) * this.servedRatio();
    const online = (p: PlantState) => p.units.filter((u) => u.status === 'online' || u.status === 'starting' || u.status === 'waiting').length;
    for (const p of this.plants) {
      if (p.def.kind === 'wind' || p.def.kind === 'solar') {
        p.setpoint = p.def.unitMax;
        need -= p.available;
      } else if (p.def.kind === 'nuclear') {
        const n = online(p);
        p.setpoint = n * p.def.unitMax;
        need -= p.setpoint;
      } else if (p.def.kind === 'battery') {
        p.setpoint = 0;
      }
    }
    const disp = this.plants
      .filter((p) => ['coal', 'ccgt', 'ocgt', 'hydro', 'link'].includes(p.def.kind))
      .sort((a, b) => this.costOf(a) - this.costOf(b));
    for (const p of disp) {
      const n = p.def.kind === 'link' ? 1 : online(p);
      p.agcOffset = 0;
      if (n === 0) {
        p.setpoint = 0;
        continue;
      }
      const min = p.def.kind === 'link' || p.def.kind === 'hydro' ? 0 : n * p.def.unitMin;
      p.setpoint = min;
      need -= min;
    }
    for (const p of disp) {
      const n = p.def.kind === 'link' ? 1 : online(p);
      if (n === 0 || need <= 0) continue;
      const max = n * p.def.unitMax * (p.agc ? 0.88 : 1);
      const add = Math.max(0, Math.min(need, max - p.setpoint));
      p.setpoint += add;
      need -= add;
    }
    if (need < 0) {
      // surplus: pump, export, then curtail
      const glen = this.plant('glen');
      const nG = online(glen);
      if (nG > 0 && glen.setpoint <= 1) {
        const pump = Math.max(nG * glen.def.unitMin, need);
        glen.setpoint = pump;
        need -= pump;
      }
      const link = this.plant('westmark');
      if (need < 0) {
        const ex = Math.max(link.def.unitMin, link.setpoint + need);
        need -= ex - link.setpoint;
        link.setpoint = ex;
      }
      for (const k of ['solar', 'wind'] as const) {
        if (need >= 0) break;
        const p = this.plants.find((p) => p.def.kind === k)!;
        const cut = Math.min(p.available, -need);
        p.setpoint = Math.max(0, p.available - cut);
        need += cut;
      }
    }
    // keep regulating units off their floor so AGC can move both ways
    const agcUnits = disp.filter((p) => p.agc && online(p) > 0 && p.def.kind !== 'link');
    const room = agcUnits.reduce((a, p) => a + (p.setpoint - (p.def.kind === 'hydro' ? online(p) * p.def.unitMin : online(p) * p.def.unitMin)), 0);
    let lack = 150 - room;
    for (const k of ['solar', 'wind'] as const) {
      if (lack <= 0) break;
      const p = this.plants.find((p) => p.def.kind === k)!;
      const give = Math.min(lack, Math.min(p.setpoint, p.available));
      if (give <= 0) continue;
      p.setpoint = Math.min(p.setpoint, p.available) - give;
      lack -= give;
      const tgt = agcUnits.find((u) => u.setpoint + give <= online(u) * u.def.unitMax);
      if (tgt) tgt.setpoint += give;
    }
    this.note('info', 'Dispatch updated to merit order for the 15-minute forecast');
  }

  private servedRatio() {
    let dem = 0;
    let con = 0;
    for (const d of this.districts) {
      dem += d.demand;
      con += d.demand * d.connected * (1 - d.uflsStage * UFLS_BLOCK) * (this.energized[d.def.bus] ? 1 : 0);
    }
    return dem > 0 ? con / dem : 1;
  }

  costOf(p: PlantState) {
    return p.def.kind === 'link' ? this.linkPrice(this.hour) : p.def.cost;
  }

  /** Spinning reserve available from primary response in the main island, MW. */
  reserve() {
    let r = 0;
    for (const p of this.plants) {
      if (!this.energized[p.def.bus] || this.islands.of[p.def.bus] !== this.mainIsland) continue;
      for (const u of p.units) {
        if (u.status !== 'online' || p.def.droop === 0) continue;
        if (p.def.kind === 'battery') r += Math.max(0, p.def.unitMax - u.p) * (p.stored > 10 ? 1 : 0);
        else r += Math.max(0, p.def.unitMax - u.p);
      }
    }
    return r;
  }

  /** The single largest loss the system could suffer right now, MW. */
  largestInfeed() {
    let m = 0;
    for (const p of this.plants) {
      if (p.def.kind === 'wind' || p.def.kind === 'solar') continue;
      for (const u of p.units) if (u.status === 'online') m = Math.max(m, u.p);
    }
    return m;
  }

  // ---------------------------------------------------------------- stepping

  /** Advance simulated time by `seconds`, sub-stepping internally. */
  advance(seconds: number) {
    let left = Math.min(seconds, this.endT - this.t);
    while (left > 1e-9) {
      const calm = Math.abs(this.frequency - F0) < 0.15 && Math.abs(this.rocof) < 0.02;
      const dt = Math.min(left, calm && seconds > 2 ? 0.1 : 0.05);
      this.step(dt);
      left -= dt;
    }
  }

  private updateWeather(dt: number) {
    const w = this.weather;
    const hour = this.hour;
    this.temp = temperatureAt(w, hour);
    this.wind = Math.max(0, w.windMean + (dt ? this.windOU.step(dt) : 0));
    this.cloud = Math.min(1, Math.max(0, w.cloud + (dt ? this.cloudOU.step(dt) : 0)));
    this.sun = clearSky(w, hour) * (1 - 0.75 * this.cloud);
  }

  step(dt: number) {
    this.t += dt;
    this.updateWeather(dt);
    const hour = this.hour;
    const noise = 1 + this.demandOU.step(dt);

    for (const s of this.scheduled) {
      if (!s.done && this.t >= s.at) {
        s.done = true;
        s.run(this);
      }
    }

    // auto-reclose after transient faults
    for (const l of this.lines) {
      if (l.reclosing > 0) {
        l.reclosing -= dt;
        if (l.reclosing <= 0) {
          l.reclosing = 0;
          if (this.rand() < 0.75) {
            l.closed = true;
            l.tripped = false;
            this.topoDirty = true;
            this.note('info', `${l.def.name} reclosed automatically`);
          } else {
            this.note('alarm', `${l.def.name}: reclose failed, line locked out`);
            this.raise(`${l.def.name} locked out`, 'Permanent fault. The line stays open until you close it.', 'major');
          }
        }
      }
    }

    if (this.topoDirty) this.rebuildIslands();

    // ---- renewable availability
    const wind = this.plant('saltmarsh');
    let wAvail = 0;
    for (let g = 0; g < 5; g++) {
      const v = this.wind * (0.92 + g * 0.04);
      if (!this.windCut[g] && v > 25) {
        this.windCut[g] = true;
        this.note('warn', `Saltmarsh string ${g + 1} shut down: storm cut-out at ${v.toFixed(0)} m/s`);
        if (g === 2) this.raise('Saltmarsh storm shutdown', 'Turbines feather above 25 m/s. Wind output is collapsing.', 'major');
      } else if (this.windCut[g] && v < 20) {
        this.windCut[g] = false;
        this.note('info', `Saltmarsh string ${g + 1} back in service`);
      }
      if (!this.windCut[g]) wAvail += (wind.def.unitMax / 5) * windPowerFraction(v);
    }
    wind.available = wAvail;
    const solar = this.plant('sunfield');
    solar.available = solar.def.unitMax * this.sun;

    // ---- island bookkeeping: inertia and synchronous capacity
    const nI = this.islands.members.length;
    const Ek = new Array(nI).fill(0);
    const syncCap = new Array(nI).fill(0);
    for (const p of this.plants) {
      if (!isSync(p.def.kind)) continue;
      const k = this.islands.of[p.def.bus];
      for (const u of p.units) {
        if (u.status === 'online') {
          Ek[k] += p.def.H * (p.def.unitMax / 0.9);
          syncCap[k] += p.def.unitMax;
        }
      }
    }
    for (let i = 0; i < BUSES.length; i++) this.energized[i] = Ek[this.islands.of[i]] > 0 && this.busF[i] > 0;

    // ---- units
    const injection = new Array(BUSES.length).fill(0);
    const pGen = new Array(nI).fill(0);
    const invOut = new Array(nI).fill(0);
    for (const p of this.plants) {
      const d = p.def;
      const bus = d.bus;
      const k = this.islands.of[bus];
      const f = this.busF[bus];
      const live = this.energized[bus];
      const df = live ? f - F0 : 0;
      const nOn = p.units.filter((u) => u.status === 'online').length;
      p.output = 0;

      // AGC integrator (secondary control), ~60 s time constant system-wide
      if (p.agc && nOn > 0 && live) {
        // gain weighted by ramp capability so fast units carry regulation
        p.agcOffset += -0.5 * d.ramp * nOn * df * dt;
        const lo = nOn * Math.min(d.unitMin, 0) - p.setpoint;
        const hi = nOn * d.unitMax - p.setpoint;
        // anti-windup: never ask for more than the units can reach within ~45 s of ramping
        let sched = 0;
        for (const u of p.units) if (u.status === 'online') sched += u.sched;
        const reach = (d.ramp / 60) * nOn * 45;
        const now = sched - p.setpoint;
        p.agcOffset = Math.max(lo, Math.min(hi, Math.max(now - reach, Math.min(now + reach, p.agcOffset))));
      } else if (!p.agc) p.agcOffset = 0;

      for (const u of p.units) {
        if (u.status === 'starting') {
          u.startLeft -= dt;
          if (u.startLeft <= 0) u.status = 'waiting';
        }
        if (u.status === 'waiting') {
          const canForm = d.blackStart && Ek[k] === 0;
          const needStrong = d.kind === 'link' ? syncCap[k] >= 300 : true;
          if ((live && needStrong) || canForm) {
            u.status = 'online';
            u.sched = 0;
            u.gov = 0;
            if (canForm) {
              for (const b of this.islands.members[k]) this.busF[b] = F0;
              Ek[k] += d.H * (d.unitMax / 0.9);
              syncCap[k] += d.unitMax;
              for (const b of this.islands.members[k]) this.energized[b] = true;
              this.note('info', `${d.name} formed a live island: black start`);
            } else this.note('info', `${d.name}: unit ${p.units.indexOf(u) + 1} synchronised`);
          }
        }
        if (u.status === 'online' && !this.energized[bus]) {
          if (isSync(d.kind)) {
            // island died under it
            u.status = 'tripped';
            u.p = u.sched = u.gov = 0;
          } else {
            // inverters ride through a dead bus and wait for voltage
            u.p = u.sched = u.gov = 0;
            continue;
          }
        }
        if (u.status !== 'online' && u.status !== 'stopping') {
          u.p = 0;
          continue;
        }

        const rampStep = (d.ramp / 60) * dt;
        let target: number;
        if (u.status === 'stopping') target = 0;
        else if (d.kind === 'wind' || d.kind === 'solar') target = Math.min(p.available, p.setpoint);
        else {
          const share = (p.setpoint + p.agcOffset) / Math.max(1, nOn);
          target = Math.max(Math.min(d.unitMin, d.unitMax), Math.min(d.unitMax, share));
          if (d.kind === 'battery' && ((p.stored <= 1 && target > 0) || (p.stored >= (d.energy ?? 0) - 1 && target < 0))) target = 0;
        }
        u.sched += Math.max(-rampStep, Math.min(rampStep, target - u.sched));
        if (d.kind === 'wind' || d.kind === 'solar') u.sched = Math.min(u.sched, p.available);

        // primary response
        if (d.droop > 0 && u.status === 'online') {
          const db = d.kind === 'battery' ? 0.05 : 0.015;
          const e = Math.abs(df) > db ? df - Math.sign(df) * db : 0;
          let g = -(d.unitMax / d.droop) * (e / F0);
          const lo = (d.kind === 'battery' ? -d.unitMax : Math.min(d.unitMin, 0)) - u.sched;
          const hi = d.unitMax - u.sched;
          if (d.kind === 'battery' && p.stored <= 1) g = Math.min(g, 0);
          g = Math.max(lo, Math.min(hi, g));
          u.gov += (g - u.gov) * (1 - Math.exp(-dt / d.Tg));
        } else u.gov *= Math.exp(-dt / 2);
        // limited frequency-sensitive mode for inverters at high frequency
        let p0 = u.sched + u.gov;
        if ((d.kind === 'wind' || d.kind === 'solar') && df > 0.2) p0 *= Math.max(0, 1 - 0.4 * (df - 0.2));
        u.p = p0;
        if (u.status === 'stopping' && Math.abs(u.sched) < 1) {
          u.status = 'off';
          u.p = u.sched = u.gov = 0;
          this.note('info', `${d.name}: unit ${p.units.indexOf(u) + 1} off`);
        }
        p.output += u.p;
      }
      if (!isSync(d.kind) && !live) p.output = 0;
      if (!isSync(d.kind)) invOut[k] += Math.max(0, p.output);

      // storage
      if (d.kind === 'battery') {
        p.stored -= (p.output > 0 ? p.output / 0.92 : p.output * 0.92) * (dt / 3600);
        p.stored = Math.max(0, Math.min(d.energy ?? 0, p.stored));
      } else if (d.kind === 'hydro') {
        p.stored -= (p.output > 0 ? p.output : p.output * 0.76) * (dt / 3600);
        p.stored = Math.max(0, Math.min(d.energy ?? 0, p.stored));
        if (p.stored <= 0 && p.output > 0) {
          p.setpoint = 0;
          p.agcOffset = 0;
        }
      }
    }
    // system strength: inverter output cannot exceed 2x synchronous capacity
    for (const p of this.plants) {
      if (isSync(p.def.kind)) continue;
      const k = this.islands.of[p.def.bus];
      const limit = 2 * syncCap[k];
      if (invOut[k] > limit && p.output > 0) p.output *= limit / invOut[k];
      injection[p.def.bus] += p.output;
      pGen[k] += p.output;
    }
    for (const p of this.plants) {
      if (!isSync(p.def.kind)) continue;
      injection[p.def.bus] += p.output;
      pGen[this.islands.of[p.def.bus]] += p.output;
    }

    // ---- demand
    const pLoad = new Array(nI).fill(0);
    const dampK = new Array(nI).fill(0);
    let totalDemand = 0;
    let totalServed = 0;
    for (const ds of this.districts) {
      const d = ds.def;
      let surge = 0;
      for (const s of this.surges) {
        if (s.district === d.id && this.t >= s.start && this.t < s.start + s.dur) {
          const x = (this.t - s.start) / s.dur;
          surge += s.mw * Math.sin(Math.PI * Math.min(1, x * 1.6)) ** 2 * (x < 0.62 ? 1 : Math.max(0, 1 - (x - 0.62) / 0.38));
        }
      }
      ds.surge = surge;
      ds.demand = districtDemand(d, this.weather, hour, this.temp) * noise + surge;
      totalDemand += ds.demand;
      const bus = d.bus;
      const k = this.islands.of[bus];
      const live = this.energized[bus];
      const roofOk = live ? 1 - ds.rooftopTripped : 0;
      ds.rooftop = d.rooftop * this.sun * roofOk * ds.connected * (1 - ds.uflsStage * UFLS_BLOCK);
      if (!live) {
        ds.served = 0;
        continue;
      }
      const df = this.busF[bus] - F0;
      const frac = ds.connected * Math.max(0, 1 - ds.uflsStage * UFLS_BLOCK);
      const gross = ds.demand * frac;
      const load = gross * (1 + 1.6 * (df / F0));
      ds.served = gross;
      totalServed += gross;
      const net = load - ds.rooftop;
      injection[bus] -= net;
      pLoad[k] += net;
      dampK[k] += gross * 1.6 / F0;
    }

    // ---- frequency per island
    const islandF = new Array(nI).fill(0);
    for (let k = 0; k < nI; k++) {
      const b0 = this.islands.members[k][0];
      const f = this.busF[b0];
      if (Ek[k] <= 0 || f <= 0) {
        for (const b of this.islands.members[k]) {
          this.busF[b] = 0;
          this.busRocof[b] = 0;
        }
        continue;
      }
      const rocof = (F0 * (pGen[k] - pLoad[k])) / (2 * Ek[k]);
      const fNew = f + rocof * dt;
      islandF[k] = fNew;
      for (const b of this.islands.members[k]) {
        this.busF[b] = fNew;
        this.busRocof[b] = rocof;
      }
    }

    // distribute island mismatch across machines by inertia so the DC flow is balanced
    for (let k = 0; k < nI; k++) {
      const mis = pGen[k] - pLoad[k];
      if (Ek[k] <= 0 || Math.abs(mis) < 1e-9) continue;
      for (const p of this.plants) {
        if (!isSync(p.def.kind) || this.islands.of[p.def.bus] !== k) continue;
        const on = p.units.filter((u) => u.status === 'online').length;
        if (!on) continue;
        injection[p.def.bus] -= mis * (on * p.def.H * (p.def.unitMax / 0.9)) / Ek[k];
      }
    }

    // ---- load flow
    const slackOf = this.islands.members.map((m) => SLACK_PREFERENCE.find((b) => m.includes(b)) ?? m[0]);
    const res = dcFlow(injection, this.flowLines, this.islands, slackOf);
    const rf = ratingFactor(this.temp);
    this.lines.forEach((l, i) => {
      l.flow = this.energized[l.def.from] ? res.flow[i] : 0;
      l.rating = l.def.rating * rf;
      l.loading = Math.abs(l.flow) / l.rating;
      if (!l.closed) {
        l.heat = Math.max(0, l.heat - dt / 600);
        return;
      }
      if (l.loading > 1) l.heat += ((l.loading * l.loading - 1) / 240) * dt;
      else l.heat = Math.max(0, l.heat - ((1 - l.loading * l.loading) / 900) * dt);
      if (l.loading > 2.3) this.tripLine(l.def.id, `distance protection, ${Math.round(l.loading * 100)} % of rating`);
      else if (l.heat >= 1) this.tripLine(l.def.id, `conductor overheated after a sustained ${Math.round(l.loading * 100)} % overload`);
    });

    // ---- protection
    for (let k = 0; k < nI; k++) {
      const f = islandF[k];
      if (f <= 0) continue;
      const members = this.islands.members[k];
      const rocof = this.busRocof[members[0]];
      // rooftop inverters with legacy loss-of-mains settings
      if (Math.abs(rocof) > ROCOF_TRIP) {
        let lost = 0;
        for (const ds of this.districts) {
          if (this.islands.of[ds.def.bus] === k && ds.rooftopTripped < 1) {
            lost += ds.rooftop * (1 - 0.35);
            ds.rooftopTripped = Math.max(ds.rooftopTripped, 0.65);
          }
        }
        if (lost > 20) {
          this.note('alarm', `Rooftop solar loss-of-mains relays tripped on RoCoF: ${Math.round(lost)} MW of embedded generation gone`);
          this.raise('Embedded solar tripped', `RoCoF passed ${ROCOF_TRIP} Hz/s. ${Math.round(lost)} MW of rooftop solar disconnected.`, 'minor');
        }
      } else if (Math.abs(f - F0) < 0.2) {
        for (const ds of this.districts) {
          if (this.islands.of[ds.def.bus] === k && ds.rooftopTripped > 0) ds.rooftopTripped = Math.max(0, ds.rooftopTripped - dt / 300);
        }
      }
      // under-frequency load shedding
      let stage = 0;
      while (stage < UFLS.length && f < UFLS[stage]) stage++;
      if (stage > 0) {
        let shed = 0;
        for (const ds of this.districts) {
          if (this.islands.of[ds.def.bus] === k && ds.uflsStage < stage && ds.connected > 0) {
            shed += ds.demand * ds.connected * (stage - ds.uflsStage) * UFLS_BLOCK;
            ds.uflsStage = stage;
          }
        }
        if (shed > 1) {
          this.note('alarm', `Under-frequency load shedding stage ${stage} at ${f.toFixed(2)} Hz: ${Math.round(shed)} MW of homes and businesses disconnected`);
          this.raise(`Load shedding, stage ${stage}`, `Frequency fell to ${f.toFixed(2)} Hz. Relays cut ${Math.round(shed)} MW of demand to save the rest.`, 'major');
        }
      }
      // generator under/over-frequency protection
      const b0 = members[0];
      if (f < 47.5 || f > 52) this.underTimer[b0] += dt;
      else this.underTimer[b0] = 0;
      if (this.underTimer[b0] > 0.4 || f < 46.5) this.collapse(k, f);
    }

    // ---- scoring and history
    const fMain = this.frequency;
    const calcMain = () => {
      let best = 0;
      let bestLoad = -1;
      this.islands.members.forEach((m, k) => {
        let l = 0;
        for (const ds of this.districts) if (m.includes(ds.def.bus)) l += ds.demand;
        if (l > bestLoad) {
          bestLoad = l;
          best = k;
        }
      });
      this.mainIsland = best;
    };
    calcMain();
    if (this.scoring) {
      const s = this.score;
      s.demand += totalDemand * dt / 3600;
      s.served += totalServed * dt / 3600;
      for (const p of this.plants) {
        const c = this.costOf(p);
        s.cost += p.output * c * dt / 3600;
        s.co2 += Math.max(0, p.output) * p.def.co2 * dt / 3.6e6;
      }
      if (fMain > 0) {
        s.energizedTime += dt;
        if (fMain >= 49.8 && fMain <= 50.2) s.inBand += dt;
        s.fMin = Math.min(s.fMin, fMain);
        s.fMax = Math.max(s.fMax, fMain);
      }
    }
    this.traceAcc += dt;
    if (this.traceAcc >= 0.25) {
      this.traceAcc = 0;
      this.fTrace.push(fMain);
      if (this.fTrace.length > 480) this.fTrace.shift();
    }
    if (fMain > 0) {
      this.sampleMin = Math.min(this.sampleMin, fMain);
      this.sampleMax = Math.max(this.sampleMax, fMain);
    }
    this.sampleAcc += dt;
    if (this.sampleAcc >= 60) {
      this.sampleAcc = 0;
      this.record(totalDemand, totalServed, fMain);
    }
  }

  private record(demand: number, served: number, f: number) {
    const byKind = { nuclear: 0, coal: 0, ccgt: 0, ocgt: 0, hydro: 0, wind: 0, solar: 0, battery: 0, link: 0, rooftop: 0 };
    let costRate = 0;
    let co2Rate = 0;
    for (const p of this.plants) {
      byKind[p.def.kind] += p.output;
      costRate += p.output * this.costOf(p);
      co2Rate += Math.max(0, p.output) * p.def.co2;
    }
    byKind.rooftop = this.districts.reduce((a, d) => a + d.rooftop, 0);
    this.history.push({
      t: this.hour, demand, served, f,
      fMin: Number.isFinite(this.sampleMin) ? this.sampleMin : 0,
      fMax: Number.isFinite(this.sampleMax) ? this.sampleMax : 0,
      byKind, costRate, co2Rate,
    });
    this.sampleMin = Infinity;
    this.sampleMax = -Infinity;
  }

  private collapse(k: number, f: number) {
    const members = this.islands.members[k];
    let lost = 0;
    for (const ds of this.districts) {
      if (members.includes(ds.def.bus)) {
        lost += ds.served;
        ds.connected = 0; // under-voltage relays open the feeders
        ds.uflsStage = 0;
      }
    }
    for (const p of this.plants) {
      if (!members.includes(p.def.bus)) continue;
      for (const u of p.units) {
        if (u.status === 'online' || u.status === 'stopping') {
          u.status = 'tripped';
          u.p = u.sched = u.gov = 0;
        }
      }
      p.agcOffset = 0;
    }
    for (const b of members) {
      this.busF[b] = 0;
      this.busRocof[b] = 0;
      this.energized[b] = false;
      this.underTimer[b] = 0;
    }
    const names = this.districts.filter((d) => members.includes(d.def.bus)).map((d) => d.def.name);
    const total = this.districts.length;
    const full = names.length >= total - 1;
    this.score.blackouts += 1;
    this.note('alarm', `${full ? 'System blackout' : 'Island collapse'} at ${f.toFixed(2)} Hz. ${Math.round(lost)} MW of demand lost.`);
    this.raise(
      full ? 'Blackout' : 'Island collapsed',
      full
        ? `Generators tripped at ${f.toFixed(2)} Hz. Halvern is dark. Start Glen Dam to black start the grid.`
        : `${names.join(', ') || 'Part of the network'} went dark at ${f.toFixed(2)} Hz.`,
      'blackout',
    );
  }

  private rebuildIslands() {
    this.topoDirty = false;
    this.lines.forEach((l, i) => (this.flowLines[i].closed = l.closed));
    const old = this.busF.slice();
    this.islands = findIslands(BUSES.length, this.flowLines);
    // new island frequency: average of live member buses (they were in sync if they shared an island)
    for (const m of this.islands.members) {
      const live = m.filter((b) => old[b] > 0);
      const f = live.length ? live.reduce((a, b) => a + old[b], 0) / live.length : 0;
      for (const b of m) this.busF[b] = f;
    }
  }

  // ---------------------------------------------------------------- result

  result(): Score {
    const s = this.score;
    const reliability = s.demand > 0 ? s.served / s.demand : 1;
    const inBand = s.energizedTime > 0 ? s.inBand / s.energizedTime : 0;
    const genMWh = this.history.reduce((a, h) => a + Object.values(h.byKind).reduce((x, y) => x + Math.max(0, y), 0) / 60, 0);
    const avgCost = s.served > 0 ? s.cost / s.served : 0;
    const co2Intensity = genMWh > 0 ? (s.co2 * 1000) / genMWh : 0;
    const unserved = Math.max(0, s.demand - s.served);
    const costTerm = Math.max(0, Math.min(1, 1 - (avgCost - 55) / 110));
    const relTerm = Math.pow(reliability, 8);
    const points = Math.round(620 * relTerm + 260 * inBand + 120 * costTerm - Math.min(200, s.blackouts * 120));
    const grade = points >= 930 ? 'S' : points >= 860 ? 'A' : points >= 760 ? 'B' : points >= 620 ? 'C' : 'D';
    return {
      demandMWh: s.demand, servedMWh: s.served, unservedMWh: unserved, reliability, inBand,
      fMin: s.fMin, fMax: s.fMax, cost: s.cost, avgCost, co2: s.co2, co2Intensity,
      blackouts: s.blackouts, points, grade,
    };
  }
}

export { isSync, UFLS, UFLS_BLOCK, VOLL };
