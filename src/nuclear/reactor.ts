// Lumped nuclear plant model for teaching.
//
// Neutronics: point kinetics with six delayed-neutron groups (U-235 data).
// Below 0.8 beta the prompt-jump approximation is used; near or above prompt
// critical the full equations are integrated with micro-steps.
// Thermal-hydraulics: one fuel node, one coolant node, reactor pressure,
// coolant inventory and core coverage, natural circulation, decay heat from a
// four-term fit to the ANS curve, xenon-135 / iodine-135 poisoning, zirconium–
// steam reaction above 1,200 °C and core melt above 2,500 °C.
// Balance of plant: turbine, synchronous generator on the grid, condenser.

export type ReactorType = 'pwr' | 'bwr' | 'rbmk' | 'vver';

export interface ReactorSpec {
  type: ReactorType;
  name: string;
  /** Rated thermal power, MW. */
  P0: number;
  /** Net electrical output at rated power, MW. */
  Pe0: number;
  /** Prompt neutron generation time, s. */
  Lambda: number;
  /** Feedback coefficients: fuel (Doppler) and moderator, pcm per K; void, pcm per % void. */
  aFuel: number;
  aMod: number;
  aVoid: number;
  /** Total rod worth, pcm. */
  rodWorth: number;
  /** Full scram insertion time, s. */
  scramTime: number;
  /** Positive reactivity added in the first part of a scram (RBMK graphite displacers), pcm at zero margin. */
  scramTip: number;
  /** Nominal coolant temperature, °C, and pressure, MPa. */
  Tc0: number;
  p0: number;
  /** Nominal fuel centre-line-average temperature, °C. */
  Tf0: number;
  /** Equilibrium xenon worth at rated power, pcm. */
  xenonWorth: number;
  /** Number of main coolant pumps. */
  pumps: number;
  /** Relief valve (PORV / SRV) opening pressure, MPa. */
  relief: number;
  /** Passive or isolation-condenser cooling available (MW at nominal decay heat conditions). */
  passive: number;
}

export const SPECS: Record<string, ReactorSpec> = {
  rooppur: {
    type: 'vver', name: 'VVER-1200', P0: 3200, Pe0: 1200, Lambda: 2.5e-5, aFuel: -2.6, aMod: -30, aVoid: -60,
    rodWorth: 9000, scramTime: 3.5, scramTip: 0, Tc0: 310, p0: 16.2, Tf0: 900, xenonWorth: 2700, pumps: 4, relief: 18.1, passive: 60,
  },
  tmi: {
    type: 'pwr', name: 'Babcock & Wilcox PWR (TMI-2)', P0: 2772, Pe0: 880, Lambda: 2e-5, aFuel: -2.5, aMod: -25, aVoid: -50,
    rodWorth: 8500, scramTime: 2.2, scramTip: 0, Tc0: 300, p0: 15.2, Tf0: 880, xenonWorth: 2700, pumps: 4, relief: 15.6, passive: 0,
  },
  fukushima: {
    type: 'bwr', name: 'GE BWR/3, Mark I (Fukushima Daiichi 1)', P0: 1380, Pe0: 460, Lambda: 4e-5, aFuel: -2.0, aMod: -10, aVoid: -110,
    rodWorth: 9000, scramTime: 3, scramTip: 0, Tc0: 286, p0: 7.0, Tf0: 820, xenonWorth: 2600, pumps: 2, relief: 7.4, passive: 25,
  },
  forsmark: {
    type: 'bwr', name: 'ASEA-Atom BWR (Forsmark 1)', P0: 2928, Pe0: 1000, Lambda: 4e-5, aFuel: -2.0, aMod: -10, aVoid: -110,
    rodWorth: 9000, scramTime: 3, scramTip: 0, Tc0: 286, p0: 7.0, Tf0: 820, xenonWorth: 2600, pumps: 2, relief: 7.4, passive: 0,
  },
  daini: {
    type: 'bwr', name: 'BWR-5, Mark II (Fukushima Daini)', P0: 3293, Pe0: 1100, Lambda: 4e-5, aFuel: -2.0, aMod: -10, aVoid: -110,
    rodWorth: 9000, scramTime: 3, scramTip: 0, Tc0: 286, p0: 7.0, Tf0: 820, xenonWorth: 2600, pumps: 2, relief: 7.4, passive: 0,
  },
  zaporizhzhia: {
    type: 'vver', name: 'VVER-1000 (Zaporizhzhia)', P0: 3000, Pe0: 1000, Lambda: 2.5e-5, aFuel: -2.6, aMod: -30, aVoid: -60,
    rodWorth: 9000, scramTime: 3.5, scramTip: 0, Tc0: 290, p0: 15.7, Tf0: 880, xenonWorth: 2700, pumps: 4, relief: 17.6, passive: 0,
  },
  chernobyl: {
    type: 'rbmk', name: 'RBMK-1000 (Chernobyl 4)', P0: 3200, Pe0: 1000, Lambda: 1e-3, aFuel: -1.2, aMod: 6, aVoid: 45,
    rodWorth: 6000, scramTime: 18, scramTip: 350, Tc0: 284, p0: 7.0, Tf0: 700, xenonWorth: 3000, pumps: 8, relief: 7.9, passive: 0,
  },
};

const BETA_I = [0.000215, 0.001424, 0.001274, 0.002568, 0.000748, 0.000273];
const LAMBDA_I = [0.0124, 0.0305, 0.111, 0.301, 1.14, 3.01];
const BETA = BETA_I.reduce((a, b) => a + b, 0);
const DECAY_A = [0.022, 0.014, 0.012, 0.015];
const DECAY_TAU = [10, 150, 3000, 150000];

export interface ReactorState {
  t: number;
  /** Relative neutron (fission) power. */
  n: number;
  C: number[];
  /** Decay heat groups, MW. */
  D: number[];
  /** Iodine and xenon, relative to equilibrium at rated power. */
  I: number;
  X: number;
  Tf: number;
  Tc: number;
  p: number;
  /** Coolant inventory, fraction of nominal. */
  M: number;
  void: number;
  /** Rod insertion 0 (withdrawn) .. 1 (fully in). */
  rods: number;
  rodTarget: number;
  scram: boolean;
  scramT: number;
  /** Pumps running and their speed (coast-down). */
  pumpOn: boolean[];
  flow: number;
  feed: boolean;
  porvOpen: boolean;
  porvStuck: boolean;
  porvIndicatedOpen: boolean;
  blockValve: boolean;
  hpi: number;
  eccs: boolean;
  passiveOn: boolean;
  offsite: boolean;
  diesels: boolean;
  dcPower: boolean;
  fireInjection: boolean;
  /** Reactor depressurised through relief valves (needed for low-pressure injection). */
  depress: boolean;
  turbineOnline: boolean;
  genSync: boolean;
  /** Turbine-generator speed, per unit of synchronous. */
  speed: number;
  Pe: number;
  /** Hydrogen produced, kg. */
  h2: number;
  /** Core damage fraction 0..1. */
  damage: number;
  /** Prompt excursion energy, relative. */
  excursion: number;
  destroyed: boolean;
  alarms: Set<string>;
  log: { t: number; text: string; level: 'info' | 'warn' | 'alarm' }[];
}

export class Reactor {
  readonly spec: ReactorSpec;
  s: ReactorState;
  /** Fraction of the rods' worth applied at rods=1 (operating rod margin effect). */
  extraRho = 0;
  /** Reactor protection system enabled (operators disabled trips at Chernobyl). */
  rps = true;
  scheduled: { at: number; run: (r: Reactor) => void; done?: boolean }[] = [];
  trend: { t: number; n: number; Tf: number; Tc: number; p: number; level: number; Pe: number; decay: number }[] = [];
  private trendAcc = 0;

  constructor(spec: ReactorSpec, init: { power?: number; xenon?: number; rods?: number } = {}) {
    this.spec = spec;
    const n = init.power ?? 1;
    const Lam = spec.Lambda;
    const C = BETA_I.map((b, i) => (b / (Lam * LAMBDA_I[i])) * n);
    const D = DECAY_A.map((a) => a * spec.P0 * n);
    this.s = {
      t: 0, n, C, D, I: n, X: init.xenon ?? n, Tf: spec.Tc0 + (spec.Tf0 - spec.Tc0) * n, Tc: spec.Tc0, p: spec.p0, M: 1, void: spec.type === 'pwr' || spec.type === 'vver' ? 0 : 0.35 * n,
      rods: init.rods ?? 0.35, rodTarget: init.rods ?? 0.35, scram: false, scramT: 0, pumpOn: new Array(spec.pumps).fill(true), flow: 1, feed: true,
      porvOpen: false, porvStuck: false, porvIndicatedOpen: false, blockValve: true, hpi: 0, eccs: true, passiveOn: false, offsite: true, diesels: false, dcPower: true,
      fireInjection: false, depress: false, turbineOnline: true, genSync: true, speed: 1, Pe: spec.Pe0 * n, h2: 0, damage: 0, excursion: 0, destroyed: false, alarms: new Set(), log: [],
    };
    // trim reactivity so the initial state is exactly critical
    this.extraRho = -this.rhoNoTrim();
  }

  get beta() {
    return BETA;
  }
  get decay() {
    return this.s.D.reduce((a, b) => a + b, 0);
  }
  /** Total thermal power, MW. */
  get Pth() {
    return this.s.n * this.spec.P0 * (1 - DECAY_A.reduce((a, b) => a + b, 0)) + this.decay;
  }
  /** Reactor period, s (Infinity when steady). */
  period = Infinity;
  /** Core coverage by water, 0..1. */
  get level() {
    return Math.max(0, Math.min(1, (this.s.M - 0.35) / 0.4));
  }

  note(text: string, level: 'info' | 'warn' | 'alarm' = 'info') {
    this.s.log.push({ t: this.s.t, text, level });
    if (this.s.log.length > 200) this.s.log.shift();
  }
  at(t: number, run: (r: Reactor) => void) {
    this.scheduled.push({ at: t, run });
  }

  // ------------------------------------------------------------ reactivity

  rodRho(z = this.s.rods) {
    const sp = this.spec;
    // S-shaped integral rod worth
    const w = -sp.rodWorth * (z - Math.sin(2 * Math.PI * z) / (2 * Math.PI));
    // RBMK graphite displacers: positive reactivity while the tips enter the bottom of the core
    let tip = 0;
    if (sp.scramTip > 0 && this.s.scram) {
      const fromTop = this.s.scramT / sp.scramTime;
      tip = fromTop < 0.25 ? sp.scramTip * Math.sin((Math.PI * fromTop) / 0.25) * this.tipFactor : 0;
    }
    return (w + tip) * 1e-5;
  }
  /** How exposed the core is to the scram tip effect (rods far out = worse). */
  tipFactor = 1;

  private rhoNoTrim() {
    const s = this.s;
    const sp = this.spec;
    const fb = sp.aFuel * (s.Tf - (sp.Tc0 + (sp.Tf0 - sp.Tc0))) + sp.aMod * (s.Tc - sp.Tc0) + sp.aVoid * 100 * (s.void - (sp.type === 'pwr' || sp.type === 'vver' ? 0 : 0.35));
    const xe = -sp.xenonWorth * (s.X - 1);
    return this.rodRho() + (fb + xe) * 1e-5;
  }
  get rho() {
    return this.rhoNoTrim() + this.extraRho;
  }

  // ------------------------------------------------------------ commands

  scram(reason: string) {
    if (this.s.scram) return;
    this.s.scram = true;
    this.s.scramT = 0;
    this.s.rodTarget = 1;
    this.note(`Reactor trip (scram): ${reason}`, 'alarm');
    this.tripTurbine('reactor trip');
  }
  tripTurbine(reason: string) {
    if (!this.s.turbineOnline) return;
    this.s.turbineOnline = false;
    this.note(`Turbine trip: ${reason}. Generator breaker opens.`, 'warn');
  }
  setPump(i: number, on: boolean) {
    this.s.pumpOn[i] = on;
  }
  loseOffsite(reason: string) {
    this.s.offsite = false;
    this.note(`Loss of offsite power: ${reason}`, 'alarm');
    if (this.s.dcPower) {
      this.s.diesels = true;
      this.note('Emergency diesel generators start and load onto the safety buses.');
    }
  }
  stationBlackout(reason: string, loseDC: boolean) {
    this.s.offsite = false;
    this.s.diesels = false;
    if (loseDC) this.s.dcPower = false;
    this.note(`Station blackout: ${reason}${loseDC ? '. DC batteries also lost: instruments and valve control are dark.' : ''}`, 'alarm');
  }
  get acPower() {
    return this.s.offsite || this.s.diesels;
  }

  // ------------------------------------------------------------ dynamics

  advance(seconds: number) {
    let left = seconds;
    while (left > 1e-9) {
      const nearPrompt = this.rho > 0.6 * BETA || this.s.n > 2;
      const dt = Math.min(left, nearPrompt ? 2e-4 : this.s.n > 0.02 || this.s.t < 60 ? 0.02 : 0.25);
      this.step(dt);
      left -= dt;
      if (this.s.destroyed) {
        // the core is gone; only decay heat and the aftermath remain
        this.s.n = 0;
      }
    }
  }

  step(dt: number) {
    const s = this.s;
    const sp = this.spec;
    s.t += dt;
    for (const e of this.scheduled) {
      if (!e.done && s.t >= e.at) {
        e.done = true;
        e.run(this);
      }
    }

    // rods
    if (s.scram) s.scramT += dt;
    const rodSpeed = s.scram ? 1 / sp.scramTime : 1 / 120;
    s.rods += Math.max(-rodSpeed * dt, Math.min(rodSpeed * dt, s.rodTarget - s.rods));

    // pumps: need AC power; coast down otherwise
    const pumpsRunning = s.pumpOn.filter((p) => p).length * (this.acPower && s.offsite ? 1 : 0);
    const forced = pumpsRunning / sp.pumps;
    const natural = 0.04 * Math.min(1, this.level * 1.2);
    const target = Math.max(forced, natural);
    s.flow += (target - s.flow) * (1 - Math.exp(-dt / (target < s.flow ? 12 : 4)));

    // neutronics
    const rho = this.rho;
    const Lam = sp.Lambda;
    if (rho < 0.8 * BETA && s.n < 2) {
      for (let i = 0; i < 6; i++) {
        s.C[i] += (BETA_I[i] / Lam) * s.n * dt - LAMBDA_I[i] * s.C[i] * dt;
      }
      const src = 1e-9;
      const sum = s.C.reduce((a, c, i) => a + LAMBDA_I[i] * c, 0);
      const nNew = (Lam * sum + src) / (BETA - rho);
      this.period = nNew > s.n * 1.000001 || nNew < s.n * 0.999999 ? dt / Math.log(nNew / Math.max(1e-12, s.n)) : Infinity;
      s.n = Math.max(1e-10, nNew);
    } else {
      const sum = s.C.reduce((a, c, i) => a + LAMBDA_I[i] * c, 0);
      const dn = (((rho - BETA) / Lam) * s.n + sum) * dt;
      for (let i = 0; i < 6; i++) s.C[i] += ((BETA_I[i] / Lam) * s.n - LAMBDA_I[i] * s.C[i]) * dt;
      const nNew = Math.max(1e-10, s.n + dn);
      this.period = dt / Math.log(nNew / s.n);
      s.n = nNew;
      if (rho > BETA) s.excursion += s.n * dt;
    }

    // decay heat follows fission power
    const Pf = s.n * sp.P0;
    for (let k = 0; k < 4; k++) s.D[k] += ((DECAY_A[k] * Pf - s.D[k]) / DECAY_TAU[k]) * dt;
    const Pth = this.Pth;

    // xenon / iodine, normalised to equilibrium at rated power
    const lI = 2.87e-5;
    const lX = 2.09e-5;
    const burn = 3.5 * lX; // burnout term so that X = 1 at n = 1
    s.I += (lI * s.n - lI * s.I) * dt;
    s.X += (0.05 * (lX + burn) * s.n + 0.95 * (lX + burn) * s.I - lX * s.X - burn * s.n * s.X) * dt;

    // thermal: fuel node
    const hNom = sp.P0 / (sp.Tf0 - sp.Tc0);
    const cover = this.level;
    const h = hNom * (0.0025 + 0.9975 * cover * cover) * (0.4 + 0.6 * Math.min(1, s.flow * 2.5));
    const Cf = sp.P0 * 6 / (sp.Tf0 - sp.Tc0); // fuel heat capacity, MJ/K (time constant ~6 s)
    s.Tf += ((Pth - h * (s.Tf - s.Tc)) / Cf) * dt;

    // coolant node and heat sinks
    const psat = (T: number) => 7 * Math.pow(Math.max(0.01, (T - 100) / 230), 1 / 0.28);
    const Tsat = 100 + 230 * Math.pow(Math.max(0.05, s.p) / 7, 0.28);
    let sink = 0;
    if (s.turbineOnline) sink = Pth;
    else {
      // after a turbine trip heat goes to the condenser bypass or the steam generators while feedwater runs
      const feedOK = s.feed && this.acPower;
      sink = feedOK ? Math.min(Pth, 0.12 * sp.P0) * Math.min(1, s.flow * 6) : 0;
      if (s.passiveOn && (s.dcPower || sp.type === 'vver')) sink += sp.passive * (0.5 + 0.5 * cover) * Math.max(0, (s.Tc - 100) / Math.max(1, sp.Tc0 - 100));
      if (s.fireInjection && s.depress) sink += 0.004 * sp.P0;
    }
    const Cc = (sp.P0 * 25) / 30;
    const toCoolant = h * (s.Tf - s.Tc);
    let boil = 0;
    s.Tc += ((toCoolant - sink) / Cc) * dt;
    if (s.Tc > Tsat) {
      boil = (s.Tc - Tsat) * Cc;
      s.Tc = Tsat;
    }

    // pressure follows coolant temperature; relief valves cap it, leaks pull it toward saturation
    let pTarget = sp.type === 'pwr' || sp.type === 'vver' ? sp.p0 + 0.09 * (s.Tc - sp.Tc0) : sp.p0 * Math.pow(Math.max(0.2, (s.Tc + 0.01) / sp.Tc0), 3);
    const leaking = s.porvOpen && s.blockValve && s.porvStuck;
    if (leaking) pTarget = Math.min(pTarget, Math.max(psat(s.Tc) + 0.4, 1));
    if (s.depress) pTarget = 0.6;
    pTarget = Math.min(pTarget, sp.relief + 0.15); // safety valves lift above this
    s.p += (pTarget - s.p) * (1 - Math.exp(-dt / (leaking ? 60 : 3)));
    if (s.p > sp.relief && !s.porvOpen) {
      s.porvOpen = true;
      s.porvIndicatedOpen = true;
      this.note(`Relief valve opens at ${s.p.toFixed(1)} MPa`, 'warn');
    }
    if (s.porvOpen && s.p < sp.relief - 0.4 && !s.porvStuck) {
      s.porvOpen = false;
      s.porvIndicatedOpen = false;
      this.note('Relief valve recloses');
    }
    if (s.porvStuck) s.porvIndicatedOpen = false; // solenoid de-energised: the panel says closed

    // inventory: leak through an open relief valve, steam boiled off to the relief valves, makeup
    const leak = leaking ? 0.00011 * Math.sqrt(Math.max(0, s.p) / 15) : 0;
    const boilOff = boil / (sp.P0 * (sp.type === 'bwr' ? 470 : 140));
    const makeup = s.hpi * (this.acPower ? 1 : 0) * 0.00014 + (s.fireInjection && s.p < 1.2 ? 0.00006 : 0);
    s.M += (makeup - leak) * dt - boilOff;
    s.M = Math.max(0, Math.min(1.15, s.M));

    // voids
    const subcool = Math.max(0, Tsat - s.Tc);
    if (sp.type === 'rbmk') {
      // near saturation at low power: void follows power over flow almost directly
      s.void = Math.max(0, Math.min(0.95, (0.35 * (Pth / sp.P0)) / Math.max(0.05, s.flow)));
    } else if (sp.type === 'bwr') {
      s.void = Math.max(0, Math.min(0.95, (0.35 * (Pth / sp.P0)) / Math.max(0.05, s.flow) - subcool * 0.02));
    } else {
      s.void = Math.max(0, Math.min(0.9, 1 - this.level)) * 0.6 + (subcool < 2 ? 0.05 : 0);
    }

    // fuel damage chemistry
    const h2max = 0.3 * sp.P0;
    if (s.Tf > 1200 && s.h2 < h2max) {
      // zirconium + steam -> ZrO2 + H2, exothermic; limited by the cladding left to oxidise
      const rate = Math.min(0.05, 0.0004 * Math.exp((Math.min(s.Tf, 2400) - 1200) / 300)) * (1 - s.h2 / h2max) * (1 - cover);
      s.h2 = Math.min(h2max, s.h2 + rate * dt * h2max * 0.2);
      s.Tf += rate * dt * 40;
    }
    if (s.Tf > 2500 && s.damage < 1) s.damage = Math.min(1, s.damage + ((s.Tf - 2500) / 2000) * dt * 0.0005);
    if (s.Tf > 2850) s.Tf = 2850; // molten fuel relocates downward
    if (s.n > 30 || s.Tf > 3000) {
      if (!s.destroyed) {
        s.destroyed = true;
        s.damage = 1;
        this.note(`Prompt power excursion: power reached ${Math.round(s.n * 100)} % of rated. Fuel fragments, channels rupture, steam explosion.`, 'alarm');
      }
    }

    // turbine-generator
    if (s.turbineOnline) {
      s.Pe = Math.max(0, (Pth / sp.P0) * sp.Pe0);
      s.speed = 1;
    } else {
      s.Pe = 0;
      s.speed += (0 - s.speed) * (1 - Math.exp(-dt / 600));
    }

    this.protect(dt);
    this.trendAcc += dt;
    if (this.trendAcc >= (s.t < 600 ? 0.5 : 10)) {
      this.trendAcc = 0;
      this.trend.push({ t: s.t, n: s.n, Tf: s.Tf, Tc: s.Tc, p: s.p, level: this.level, Pe: s.Pe, decay: this.decay });
      if (this.trend.length > 2000) this.trend.splice(0, 500);
    }
  }

  private protect(dt: number) {
    const s = this.s;
    const sp = this.spec;
    const A = s.alarms;
    const set = (k: string, on: boolean) => (on ? A.add(k) : A.delete(k));
    set('High neutron flux', s.n > 1.08);
    set('Short reactor period', this.period > 0 && this.period < 20);
    set('High pressure', s.p > sp.p0 * 1.06);
    set('Low pressure', s.p < sp.p0 * 0.8);
    set('Low coolant flow', s.flow < 0.85 && s.n > 0.1);
    set('Low water level', this.level < 0.95);
    set('Core uncovered', this.level < 0.6);
    set('High fuel temperature', s.Tf > sp.Tf0 + 300);
    set('Relief valve open', s.porvIndicatedOpen);
    set('Loss of offsite power', !s.offsite);
    set('Station blackout', !this.acPower);
    set('DC power lost', !s.dcPower);
    set('Turbine tripped', !s.turbineOnline);
    set('Hydrogen generation', s.h2 > 5);
    set('Fuel damage', s.damage > 0.02);
    if (!this.rps || s.scram) return;
    if (s.n > 1.18) this.scram('high neutron flux, 118 %');
    else if (this.period > 0 && this.period < 10 && s.n > 0.05) this.scram('reactor period shorter than 10 s');
    else if (s.p > sp.p0 * 1.08) this.scram('high reactor pressure');
    else if (s.flow < 0.6 && s.n > 0.3) this.scram('low coolant flow');
    void dt;
  }
}

export { BETA };
