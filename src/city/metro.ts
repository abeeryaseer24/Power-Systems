// Metro traction power: trains driven train by train on a 1500 V DC overhead
// system, with a nodal DC load flow of each line every time step.
//
// Electrical model (per line, both tracks paralleled at every substation):
//   - traction substations (TSS): 12-pulse diode rectifiers, a no-load voltage
//     E behind an internal resistance. Diodes only let current out. A
//     "reversible" TSS adds an inverter that takes current back above Vinv.
//   - catenary plus running rail return: a loop resistance per km between nodes.
//   - trains: constant-power loads while motoring, constant-power sources while
//     braking. Regeneration is clipped at the EN 50163 limit Umax1 = 1800 V,
//     and traction power fades to zero between 1200 V and Umin1 = 1000 V.
// The DC network is a chain, so each solve is a tridiagonal system, iterated a
// few times for the constant-power loads and the diode states.

import { polyLength, type CityData, type MetroLine } from './types';
import { temperature, type DayInputs } from './demand';

export const DC = {
  E: 1650, // rectifier no-load voltage, V
  Rint: 0.028, // equivalent source resistance, Ω
  rLoop: 0.032e-3, // catenary + rail loop resistance, Ω per metre
  Vregen: 1800, // EN 50163 Umax1: regen clipped above this
  Vinv: 1720, // reversible TSS: inverter starts absorbing above this
  Vmin: 1000, // EN 50163 Umin1: no traction below this
  Vfull: 1200, // full traction above this
  tssRating: 5.0, // MW continuous per substation (2 x 2.5 MW rectifier groups)
};

export const TRAIN = {
  cars: 6,
  length: 140, // m
  tare: 228, // t empty
  capacity: 1950, // passengers at 6 per m² standing
  vmax: 22.2, // m/s (80 km/h)
  aMax: 1.0, // m/s²
  bServ: 1.0, // service braking, m/s²
  Fmax: 310e3, // N, starting tractive effort
  Pmax: 3.4e6, // W at the wheel
  PbrakeMax: 4.2e6, // W electric braking
  etaMotor: 0.88,
  etaRegen: 0.84,
};

export type TractionOpts = { peakHeadway: number; regen: boolean; reversible: boolean; inp: DayInputs };

export type Phase = 'accel' | 'cruise' | 'brake' | 'dwell' | 'held' | 'stalled';

export type Train = {
  id: number;
  line: number;
  dir: 1 | -1;
  p: number; // progress along its direction of travel, m
  v: number;
  next: number; // index into the direction's station list
  dwell: number;
  phase: Phase;
  pax: number;
  pReq: number; // electrical power asked for this step, W (negative = regenerating)
  pDel: number; // power actually exchanged with the catenary, W
  burnt: number; // braking power burnt in the on-board resistors, W
  volt: number; // pantograph voltage, V
  ratio: number; // delivered / requested traction
  desF: number; // tractive (+) or electric braking (-) force asked for, N
  aux: number;
};

export type TssState = { name: string; s: number; sub: string; modelled?: boolean; on: boolean; p: number; i: number; v: number; peak: number };
export type Segment = { s0: number; s1: number; i: number };

const LF_WD = [0.04, 0.02, 0.02, 0.02, 0.03, 0.12, 0.38, 0.8, 0.95, 0.78, 0.5, 0.42, 0.44, 0.45, 0.44, 0.5, 0.62, 0.82, 0.9, 0.74, 0.52, 0.38, 0.26, 0.12];
const LF_WE = [0.06, 0.03, 0.02, 0.02, 0.02, 0.06, 0.14, 0.26, 0.38, 0.48, 0.55, 0.6, 0.62, 0.62, 0.6, 0.6, 0.62, 0.66, 0.66, 0.6, 0.5, 0.4, 0.28, 0.14];
const lerpTbl = (t: number[], h: number) => {
  const x = ((h % 24) + 24) % 24, i = Math.floor(x), f = x - i;
  return t[i] + (t[(i + 1) % 24] - t[i]) * f;
};
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export const SERVICE = { start: 5.5, lastDeparture: 23.5 };

/** Timetable headway in seconds at hour h (Infinity outside service hours). */
export function headway(h: number, o: Pick<TractionOpts, 'peakHeadway' | 'inp'>, m?: { service?: [number, number]; peaks?: [number, number][]; offpeak?: number }) {
  const [start, last] = m?.service ?? [SERVICE.start, SERVICE.lastDeparture];
  if (h < start || h >= last) return Infinity;
  const off = m?.offpeak ?? 360;
  if (o.inp.day === 'weekend') return h < start + 2.5 || h >= last - 1.5 ? off * 1.6 : off;
  const peaks = m?.peaks ?? [[7, 10], [16.5, 20]];
  if (peaks.some(([a, b]) => h >= a && h < b)) return o.peakHeadway;
  if (h < start + 1.5) return off * 1.3;
  if (h >= last - 1.5) return off * 1.6;
  return off;
}

/** Passenger load factor 0..1 for trains at hour h. */
export const loadFactor = (h: number, inp: DayInputs) => lerpTbl(inp.day === 'weekend' ? LF_WE : LF_WD, h);

type LineRun = {
  def: MetroLine;
  L: number;
  stops: [number[], number[]]; // station progress for dir +1 and dir -1
  names: [string[], string[]];
  tss: TssState[];
  segs: Segment[];
  lastDep: [number, number];
  minV: number;
};

export class TractionSim {
  lines: LineRun[];
  trains: Train[] = [];
  t = 0; // seconds since midnight
  opts: TractionOpts;
  nextId = 1;
  seed = 20261121;
  /** Seeded so a re-run of the same day gives the same trains. */
  rand() {
    this.seed = (this.seed + 0x6d2b79f5) | 0;
    let t = this.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // energy accumulators, J
  eGrid = 0; eTraction = 0; eAux = 0; eRegenUsed = 0; eBurnt = 0; eReturned = 0; eLoss = 0;

  dc: typeof DC;
  cap: number;
  vmax: number;
  private interchange: string;

  constructor(public city: CityData, opts: TractionOpts) {
    this.opts = opts;
    // EN 50163 limits scale with the nominal voltage (750 V: Umin1 500, Umax1 900)
    const k = city.metro.voltage / 1500;
    this.dc = { ...DC, E: city.metro.E, Vregen: DC.Vregen * k, Vinv: DC.Vinv * k, Vmin: DC.Vmin * k, Vfull: DC.Vfull * k, Rint: DC.Rint * k * k, tssRating: city.metro.tssRating };
    this.cap = city.metro.capacity;
    this.vmax = city.metro.vmax;
    this.interchange = city.metro.interchange ?? '';
    this.lines = city.lines.map((def) => {
      const L = polyLength(def.path);
      const fwd = def.stations.map((s) => s.s);
      return {
        def, L,
        stops: [fwd, fwd.map((s) => L - s).reverse()],
        names: [def.stations.map((s) => s.name), def.stations.map((s) => s.name).reverse()],
        tss: def.tss.map((t) => ({ ...t, on: true, p: 0, i: 0, v: this.dc.E, peak: 0 })),
        segs: [],
        lastDep: [-1e9, -1e9],
        minV: this.dc.E,
      };
    });
  }

  /** Chainage (from the line's start) of a train. */
  chain(tr: Train) {
    return tr.dir > 0 ? tr.p : this.lines[tr.line].L - tr.p;
  }

  setTss(line: number, idx: number, on: boolean) {
    this.lines[line].tss[idx].on = on;
  }

  get hour() {
    return this.t / 3600;
  }

  step(dt: number) {
    const h = this.hour, o = this.opts;
    const T = temperature(this.city, h, o.inp);
    const auxW = TRAIN.cars * (18 + 3.2 * Math.max(0, T - 22)) * 1000;
    const lf = loadFactor(h, o.inp);

    // 1. dispatch from the terminals on the timetable
    const hw = headway(h, o, this.city.metro);
    this.lines.forEach((ln, li) => {
      for (const d of [0, 1] as const) {
        if (this.t - ln.lastDep[d] < hw) continue;
        // the two directions are timetabled half a headway apart
        if (d === 1 && ln.lastDep[1] < -1e8 && this.t - ln.lastDep[0] < hw / 2) continue;
        const dir = d === 0 ? 1 : -1;
        const blocked = this.trains.some((tr) => tr.line === li && tr.dir === dir && tr.p < TRAIN.length + 250);
        if (blocked) continue;
        ln.lastDep[d] = this.t;
        const pax = Math.round(this.cap * clamp(lf * (0.85 + 0.3 * this.rand()), 0.01, 1));
        this.trains.push({ id: this.nextId++, line: li, dir, p: 0, v: 0, next: 1, dwell: 20, phase: 'dwell', pax, pReq: 0, pDel: 0, burnt: 0, volt: this.dc.E, ratio: 1, desF: 0, aux: auxW });
      }
    });

    // 2. what each train wants to do: authority, braking curve, forces
    const leader = this.leaders();
    for (const tr of this.trains) {
      const ln = this.lines[tr.line];
      const stops = ln.stops[tr.dir > 0 ? 0 : 1];
      const mass = (TRAIN.tare + tr.pax * 0.07) * 1000 * 1.08; // kg incl. rotating inertia
      const R = this.resistance(tr.v, TRAIN.tare + tr.pax * 0.07);
      tr.aux = auxW;
      const lead = leader.get(tr);
      const gap = lead ? lead.p - TRAIN.length - tr.p - 60 : Infinity;
      if (tr.phase === 'dwell') {
        tr.dwell -= dt;
        tr.desF = 0;
        if (tr.dwell <= 0 && gap > 300) tr.phase = 'accel';
        else if (tr.dwell <= 0) tr.phase = 'held';
      } else if (tr.phase === 'held') {
        tr.desF = 0;
        if (gap > 300) tr.phase = 'accel';
      }
      if (tr.phase !== 'dwell' && tr.phase !== 'held') {
        const auth = Math.min(stops[tr.next] - tr.p, gap);
        const brakeD = (tr.v * tr.v) / (2 * TRAIN.bServ) + tr.v * 0.8;
        if (auth <= brakeD + 0.2 && tr.v > 0.05) {
          tr.phase = 'brake';
          const dec = Math.min(1.3, (tr.v * tr.v) / (2 * Math.max(auth, 0.4)));
          tr.desF = -Math.max(0, mass * dec - R);
        } else if (auth > 2 && tr.v < this.vmax - 0.3) {
          tr.phase = 'accel';
          tr.desF = Math.min(mass * TRAIN.aMax + R, TRAIN.Fmax, TRAIN.Pmax / Math.max(tr.v, 0.5));
        } else if (auth > 2) {
          tr.phase = 'cruise';
          tr.desF = R;
        } else {
          // stopped within a couple of metres of the mark: creep in; otherwise held behind a train
          tr.desF = 0;
          if (stops[tr.next] - tr.p < 3) tr.p = stops[tr.next];
          else tr.phase = 'held';
        }
      }
      // electrical request
      if (tr.desF > 0) {
        tr.pReq = (tr.desF * tr.v) / TRAIN.etaMotor + tr.aux;
        tr.burnt = 0;
      } else if (tr.desF < 0) {
        const Fe = Math.min(-tr.desF, 300e3, TRAIN.PbrakeMax / Math.max(tr.v, 0.5));
        const pb = Fe * tr.v;
        if (o.regen) {
          tr.pReq = tr.aux - pb * TRAIN.etaRegen;
          tr.burnt = 0;
        } else {
          tr.pReq = tr.aux;
          tr.burnt = pb * TRAIN.etaRegen;
        }
      } else {
        tr.pReq = tr.aux;
        tr.burnt = 0;
      }
    }

    // 3. DC load flow per line
    this.lines.forEach((ln, li) => this.solve(ln, this.trains.filter((tr) => tr.line === li), dt));

    // 4. move the trains with the force the catenary could actually support
    const done: Train[] = [];
    for (const tr of this.trains) {
      if (tr.phase === 'dwell' || (tr.phase === 'held' && tr.p < this.lines[tr.line].stops[tr.dir > 0 ? 0 : 1][tr.next] - 1.5)) continue;
      const ln = this.lines[tr.line];
      const stops = ln.stops[tr.dir > 0 ? 0 : 1];
      const mt = TRAIN.tare + tr.pax * 0.07;
      const mass = mt * 1000 * 1.08;
      const R = this.resistance(tr.v, mt);
      let a: number;
      if (tr.desF > 0) a = (tr.desF * tr.ratio - R) / mass;
      else if (tr.desF < 0) a = (tr.desF - R) / mass; // blended braking always delivers
      else a = -R / mass;
      if (tr.desF > 0 && tr.ratio < 0.05 && tr.v < 0.2) tr.phase = 'stalled';
      tr.v = Math.max(0, tr.v + a * dt);
      tr.p += tr.v * dt;
      const target = stops[tr.next];
      if (tr.p >= target - 1.5 && tr.v < 0.8) {
        tr.p = target;
        tr.v = 0;
        if (tr.next >= stops.length - 1) {
          done.push(tr);
          continue;
        }
        tr.next++;
        tr.phase = 'dwell';
        const inter = ln.names[tr.dir > 0 ? 0 : 1][tr.next - 1] === this.interchange;
        // dwell varies with how many people get on and off: this keeps trains from running in lockstep
        tr.dwell = 25 + 25 * lf + (inter ? 12 : 0) + (this.rand() - 0.5) * 18;
        // passengers change at each stop
        tr.pax = Math.round(clamp(tr.pax + (this.rand() - 0.5) * 0.25 * this.cap * Math.max(lf, 0.1), 0, this.cap));
      } else if (tr.p > target) {
        tr.p = target;
      }
    }
    if (done.length) this.trains = this.trains.filter((tr) => !done.includes(tr));
    this.t += dt;
  }

  /** Davis running resistance, N, for a train of mt tonnes at v m/s. */
  private resistance(v: number, mt: number) {
    return v > 0.01 ? mt * (11 + 0.28 * v) + 5.6 * v * v : 0;
  }

  private leaders() {
    const m = new Map<Train, Train>();
    for (let li = 0; li < this.lines.length; li++) {
      for (const dir of [1, -1]) {
        const g = this.trains.filter((t) => t.line === li && t.dir === dir).sort((a, b) => b.p - a.p);
        for (let i = 1; i < g.length; i++) m.set(g[i], g[i - 1]);
      }
    }
    return m;
  }

  private solve(ln: LineRun, trains: Train[], dt: number) {
    type N = { s: number; tss?: TssState; tr?: Train };
    const nodes: N[] = [];
    for (const t of ln.tss) if (t.on) nodes.push({ s: t.s, tss: t });
    for (const tr of trains) nodes.push({ s: this.chain(tr), tr });
    for (const t of ln.tss) if (!t.on) { t.p = 0; t.i = 0; }
    nodes.sort((a, b) => a.s - b.s);
    const n = nodes.length;
    if (!n) return;
    const g = new Float64Array(Math.max(0, n - 1));
    for (let i = 0; i < n - 1; i++) g[i] = 1 / (this.dc.rLoop * Math.max(nodes[i + 1].s - nodes[i].s, 2));
    // warm start from the last step's voltages: usually converges in 3-5 passes
    const V = new Float64Array(n);
    for (let i = 0; i < n; i++) V[i] = nodes[i].tss ? (nodes[i].tss!.v || this.dc.E) : Math.min(nodes[i].tr!.volt || this.dc.E, this.dc.Vregen);
    const Gs = new Float64Array(n), J = new Float64Array(n);
    const clampState = new Uint8Array(n);
    const BIG = 50;
    const a = new Float64Array(n), b = new Float64Array(n), c = new Float64Array(n), d = new Float64Array(n), Vn = new Float64Array(n);
    const uv = (v: number) => clamp((v - this.dc.Vmin) / (this.dc.Vfull - this.dc.Vmin), 0, 1);
    for (let it = 0; it < 24; it++) {
      for (let i = 0; i < n; i++) {
        const nd = nodes[i];
        Gs[i] = 1e-6; J[i] = 0;
        if (nd.tss) {
          if (V[i] < this.dc.E) { Gs[i] += 1 / this.dc.Rint; J[i] += this.dc.E / this.dc.Rint; }
          else if (this.opts.reversible && V[i] > this.dc.Vinv) { Gs[i] += 1 / this.dc.Rint; J[i] += this.dc.Vinv / this.dc.Rint; }
        } else if (nd.tr) {
          let P = nd.tr.pReq;
          if (P > 0) P *= uv(V[i]);
          const Vi = Math.max(V[i], 300);
          // a regenerating train injects P/V until the line reaches Umax1, then acts as a voltage limit
          clampState[i] = P < 0 && BIG * (this.dc.Vregen - Vi) < -P / Vi ? 1 : 0;
          if (clampState[i]) { Gs[i] += BIG; J[i] += BIG * this.dc.Vregen; }
          else J[i] -= P / Vi;
        }
      }
      for (let i = 0; i < n; i++) {
        const gl = i > 0 ? g[i - 1] : 0, gr = i < n - 1 ? g[i] : 0;
        a[i] = -gl; c[i] = -gr; b[i] = gl + gr + Gs[i]; d[i] = J[i];
      }
      for (let i = 1; i < n; i++) {
        const w = a[i] / b[i - 1];
        b[i] -= w * c[i - 1];
        d[i] -= w * d[i - 1];
      }
      Vn[n - 1] = d[n - 1] / b[n - 1];
      for (let i = n - 2; i >= 0; i--) Vn[i] = (d[i] - c[i] * Vn[i + 1]) / b[i];
      let dmax = 0;
      for (let i = 0; i < n; i++) {
        const v = 0.5 * Vn[i] + 0.5 * V[i];
        dmax = Math.max(dmax, Math.abs(v - V[i]));
        V[i] = v;
      }
      if (dmax < 0.5 && it > 1) break;
    }
    // read back: substation and train powers, segment currents
    let minV = this.dc.E;
    ln.segs = [];
    for (let i = 0; i < n - 1; i++) {
      const I = g[i] * (V[i] - V[i + 1]);
      ln.segs.push({ s0: nodes[i].s, s1: nodes[i + 1].s, i: I });
      this.eLoss += I * I / g[i] * dt;
    }
    for (let i = 0; i < n; i++) {
      const nd = nodes[i];
      if (nd.tss) {
        const t = nd.tss;
        let I = 0;
        if (V[i] < this.dc.E) I = (this.dc.E - V[i]) / this.dc.Rint;
        else if (this.opts.reversible && V[i] > this.dc.Vinv) I = (this.dc.Vinv - V[i]) / this.dc.Rint;
        t.i = I; t.v = V[i];
        // grid side: rectifier-transformer losses on top of E·I
        t.p = I >= 0 ? (this.dc.E * I) / 0.985 : this.dc.Vinv * I * 0.97;
        if (t.p > 0) this.eGrid += t.p * dt;
        else this.eReturned += -t.p * dt;
      } else if (nd.tr) {
        const tr = nd.tr;
        tr.volt = V[i];
        minV = Math.min(minV, V[i]);
        if (tr.pReq > 0) {
          const f = uv(V[i]);
          tr.pDel = tr.pReq * f;
          tr.ratio = f;
          this.eTraction += (tr.pDel - tr.aux * f) * dt;
          this.eAux += tr.aux * f * dt;
        } else {
          // regenerating: how much the catenary accepted
          const avail = -tr.pReq;
          const accepted = clamp(Math.min(avail, V[i] * BIG * (this.dc.Vregen - V[i])), 0, avail);
          tr.volt = Math.min(V[i], this.dc.Vregen);
          tr.pDel = -accepted;
          tr.burnt += avail - accepted;
          tr.ratio = 1;
          this.eRegenUsed += accepted * dt;
          this.eAux += tr.aux * dt;
        }
        this.eBurnt += tr.burnt * dt;
      }
    }
    ln.minV = minV;
  }

  /** Total power drawn from the 33 kV grid by all traction substations, W. */
  gridPower() {
    let p = 0;
    for (const ln of this.lines) for (const t of ln.tss) p += Math.max(0, t.p);
    return p;
  }
  returnedPower() {
    let p = 0;
    for (const ln of this.lines) for (const t of ln.tss) p += Math.max(0, -t.p);
    return p;
  }
  /** Grid power drawn by the substations fed from one 132/33 kV substation, W. */
  powerBySub() {
    const m: Record<string, number> = {};
    for (const ln of this.lines) for (const t of ln.tss) m[t.sub] = (m[t.sub] ?? 0) + t.p;
    return m;
  }
  burntPower() {
    return this.trains.reduce((a, t) => a + t.burnt, 0);
  }
}
