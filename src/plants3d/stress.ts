// A plant on its real grid: aggregate swing equation, governors with limited
// headroom, AGC, under-frequency load shedding, and a plant whose reactor,
// condenser and station supply respond to what the grid does to it.

export type GridDef = {
  name: string;
  f0: 50 | 60;
  loadMW: number; // system demand at the time
  H: number; // system inertia constant, s (on demand base)
  unitMW: number; // one unit of this plant
  units: number; // units online in the stress scenario
  kind: 'pwr' | 'bwr' | 'rbmk' | 'thermal' | 'hydro';
  era?: string; // period the plant was running, switched to for the test
  largestOther: number; // biggest single infeed elsewhere, MW
};

export type Scenario = 'other' | 'trip' | 'loop' | 'surge';

export const SCENARIOS: { id: Scenario; label: string; note: string }[] = [
  { id: 'other', label: 'Lose the largest other unit', note: 'Somewhere else on the grid the biggest infeed trips. Watch this plant help hold frequency up.' },
  { id: 'trip', label: 'Trip one unit here', note: 'Turbine trip, reactor scram. The steam has nowhere to go but the dump valves.' },
  { id: 'loop', label: 'Loss of offsite power', note: 'Every line to the switchyard opens. The station goes dark until the diesels start.' },
  { id: 'surge', label: 'Evening demand surge', note: 'Load climbs 4 % in a minute. Governors and AGC chase it.' },
];

export type StressState = {
  t: number;
  f: number;
  plantMW: number;
  heat: number; // reactor/boiler thermal power, fraction of rated (all units)
  steam: number; // heat going to the towers, 0..1
  dump: number; // atmospheric dump / relief, 0..1
  lights: number; // station lighting, 0..1
  arc: number; // switchyard flash, 0..1
  shed: number; // load shed, MW
  diesel: boolean;
  log: { t: number; text: string; bad?: boolean }[];
  trace: number[]; // frequency, one sample per 0.25 s
};

export class StressSim {
  s: StressState;
  private g: GridDef;
  private other0: number;
  private other: number;
  private agc = 0;
  private load: number;
  private loadTarget: number;
  private unitOn: boolean[];
  private unitP: number[];
  private unitHeat: number[];
  private tripT: number[];
  private offsite = true;
  private loopT = -1;
  private stages = [0, 0, 0, 0];
  private acc = 0;
  private lost = 0;

  constructor(g: GridDef) {
    this.g = g;
    const plant = g.unitMW * g.units;
    this.load = this.loadTarget = g.loadMW;
    this.other0 = this.other = g.loadMW - plant;
    this.unitOn = Array(g.units).fill(true);
    this.unitP = Array(g.units).fill(g.unitMW);
    this.unitHeat = Array(g.units).fill(1);
    this.tripT = Array(g.units).fill(-1);
    this.s = { t: 0, f: g.f0, plantMW: plant, heat: 1, steam: 1, dump: 0, lights: 1, arc: 0, shed: 0, diesel: false, log: [{ t: 0, text: `${g.name}: ${g.loadMW.toLocaleString()} MW demand, ${g.f0}.00 Hz` }], trace: [] };
  }

  private note(text: string, bad = false) {
    this.s.log.unshift({ t: this.s.t, text, bad });
    if (this.s.log.length > 14) this.s.log.pop();
  }

  fire(sc: Scenario) {
    const g = this.g;
    if (sc === 'other') {
      this.lost += g.largestOther;
      this.note(`${g.largestOther.toLocaleString()} MW lost elsewhere on the grid`, true);
    } else if (sc === 'trip') {
      const k = this.unitOn.findIndex((u) => u);
      if (k < 0) return;
      this.unitOn[k] = false;
      this.tripT[k] = this.s.t;
      this.s.arc = 0.7;
      this.note(`Unit ${k + 1} turbine trip, ${g.unitMW.toLocaleString()} MW off the grid`, true);
      if (g.kind !== 'hydro' && g.kind !== 'thermal') this.note(`Unit ${k + 1} reactor scram: rods in within 2 s`);
    } else if (sc === 'loop') {
      if (!this.offsite) return;
      this.offsite = false;
      this.loopT = this.s.t;
      this.s.arc = 1;
      this.unitOn.forEach((u, k) => { if (u) { this.unitOn[k] = false; this.tripT[k] = this.s.t; } });
      this.note('All offsite lines open: station blackout', true);
      this.note(`${(g.unitMW * this.unitP.filter((p) => p > 1).length).toLocaleString()} MW gone from the grid at once`, true);
    } else if (sc === 'surge') {
      this.loadTarget *= 1.04;
      this.note(`Demand rising to ${Math.round(this.loadTarget).toLocaleString()} MW`);
    }
  }

  step(dt: number) {
    const g = this.g, s = this.s;
    s.t += dt;
    const df = (s.f - g.f0) / g.f0;
    // demand: ramps toward target, 1.5 %/% frequency sensitivity, minus what UFLS shed
    this.load += (this.loadTarget - this.load) * Math.min(1, dt / 40);
    const demand = this.load * (1 + 1.5 * df) - s.shed;
    // rest of the grid: droop 5 %, 6 s lag, headroom 4 % of its size; AGC integrates the error
    const head = this.other0 * 0.04;
    const want = this.other0 + Math.max(-head, Math.min(head, (-df / 0.05) * this.other0 * 0.25)) + this.agc - this.lost;
    this.other += (want - this.other) * Math.min(1, dt / 6);
    this.agc += -df * this.other0 * 0.12 * dt;
    this.agc = Math.min(this.agc, this.lost + this.other0 * 0.08);
    // this plant
    let plant = 0, heat = 0;
    for (let k = 0; k < g.units; k++) {
      if (this.unitOn[k]) {
        const target = g.unitMW * Math.min(1.03, 1 - df / 0.05 * 0.04);
        this.unitP[k] += (target - this.unitP[k]) * Math.min(1, dt / (g.kind === 'hydro' ? 3 : 10));
        this.unitHeat[k] = this.unitP[k] / g.unitMW;
      } else {
        this.unitP[k] = Math.max(0, this.unitP[k] - g.unitMW * dt * 4);
        const since = s.t - this.tripT[k];
        // decay heat after scram (Way-Wigner, roughly 6.6 % falling as t^-0.2); a boiler or turbine just stops
        this.unitHeat[k] = g.kind === 'hydro' || g.kind === 'thermal' ? Math.max(0, 1 - since / 4) * 0.1 : 0.066 * Math.pow(Math.max(since, 1), -0.2);
      }
      plant += this.unitP[k];
      heat += this.unitHeat[k];
    }
    s.plantMW = plant;
    s.heat = heat / g.units;
    // swing equation on the system base
    const gen = this.other + plant;
    const fdot = (g.f0 / (2 * g.H * this.load)) * (gen - demand);
    s.f += fdot * dt;
    // UFLS stages (scaled to 50/60 Hz)
    const k = g.f0 / 50;
    [48.8, 48.6, 48.4, 48.2].forEach((th, i) => {
      if (!this.stages[i] && s.f < th * k) {
        this.stages[i] = 1;
        const mw = this.load * 0.05;
        s.shed += mw;
        this.note(`UFLS stage ${i + 1} at ${(th * k).toFixed(1)} Hz: ${Math.round(mw).toLocaleString()} MW of feeders shed`, true);
      }
    });
    // the plant's own systems
    const tripped = this.unitOn.filter((u) => !u).length / g.units;
    const condenser = this.offsite || (s.diesel && g.kind === 'hydro') ? 1 : Math.max(0, 1 - (s.t - this.loopT) / 25);
    s.steam = Math.max(0, Math.min(1, (heat / g.units) * condenser));
    const since = Math.min(...this.tripT.map((t) => (t >= 0 ? s.t - t : 1e9)));
    // relief valves lift hard for a few seconds after a trip; without offsite power the
    // condenser is lost, so decay heat leaves through the atmospheric dump valves for good
    let dumpWant = 0;
    if (!this.offsite) dumpWant = since < 60 ? 1 : 0.45;
    else if (since < 14) dumpWant = Math.max(0.5, tripped);
    else if (g.kind === 'hydro') dumpWant = tripped * 0.6;
    s.dump += (dumpWant - s.dump) * Math.min(1, dt / 1.5);
    if (!this.offsite) {
      const since = s.t - this.loopT;
      if (!s.diesel && since > 10) { s.diesel = true; this.note('Emergency diesels up to speed, safety buses re-energised'); }
      s.lights = since < 10 ? (since < 0.4 ? 0.6 * Math.random() : 0.02) : 0.4;
    } else {
      // lights dip with voltage when frequency sags hard
      s.lights = 1 - Math.max(0, Math.min(0.5, (g.f0 * 0.985 - s.f) * 0.6)) * (Math.random() < 0.3 ? 1 : 0.2);
    }
    s.arc = Math.max(0, s.arc - dt * 2.5);
    this.acc += dt;
    while (this.acc >= 0.25) {
      this.acc -= 0.25;
      s.trace.push(s.f);
      if (s.trace.length > 360) s.trace.shift();
    }
    if (Math.abs(s.f - g.f0) < 0.02 && this.lost > 0 && s.t > 30 && !this.s.log.some((l) => l.text.startsWith('Frequency restored'))) this.note(`Frequency restored to ${g.f0}.00 Hz by AGC`);
  }
}
