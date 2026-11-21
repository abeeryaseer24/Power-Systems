// Two grids beyond Earth. Simplified, built from public figures.
//
// Orbit: a station at 420 km goes round every 92.7 minutes. How long it spends
// in Earth's shadow depends on the beta angle (the sun's angle out of the
// orbit plane): about 36 minutes at beta 0, none at all above about 70 degrees.
// Solar arrays deliver ~160 kW in sunlight after losses; the station uses
// 60-120 kW; lithium-ion batteries carry it through every night, and are kept
// above 65 % charge to make them last.
//
// Mars: a six-person base. A sol lasts 24.66 hours; noon sunlight on the
// surface is about 500 W/m² on a clear day and falls exponentially with the
// dust optical depth tau, which can climb from 0.5 to 5 in a global storm and
// stay high for weeks. Small fission reactors (10 kWe each) do not care.

const R = 6371, ALT = 420, PERIOD = 92.7;

/** Fraction of each orbit spent in Earth's shadow. */
export function eclipseFraction(betaDeg: number) {
  const b = (Math.abs(betaDeg) * Math.PI) / 180;
  const bStar = Math.asin(R / (R + ALT));
  if (b >= bStar) return 0;
  return Math.acos(Math.sqrt(ALT * ALT + 2 * R * ALT) / ((R + ALT) * Math.cos(b))) / Math.PI;
}

export type OrbitOpts = { beta: number; loadKW: number; arrays: number /* 0..1 health */ };
export const DEFAULT_ORBIT: OrbitOpts = { beta: 0, loadKW: 90, arrays: 1 };

export function orbitRun(o: OrbitOpts) {
  const f = eclipseFraction(o.beta);
  const batKWh = 100, minSoc = 0.35;
  let soc = 0.8;
  const pts: { t: number; sun: boolean; gen: number; load: number; soc: number; shed: number }[] = [];
  for (let m = 0; m <= PERIOD * 3; m += 0.5) {
    const phase = (m % PERIOD) / PERIOD;
    // shadow centred on the orbit's midnight (phase 0.5)
    const sun = Math.abs(phase - 0.5) > f / 2;
    // arrays must also recharge the batteries, so sunlit output is shared
    const gen = sun ? 160 * o.arrays * (0.92 + 0.08 * Math.cos(phase * 4 * Math.PI)) : 0;
    let load = o.loadKW, shed = 0;
    const net = gen - load;
    soc += (net > 0 ? Math.min(net, 60) * 0.95 : net / 0.95) / 60 * 0.5 / batKWh;
    if (soc < minSoc) { shed = (minSoc - soc) * batKWh * 120; soc = minSoc; load -= shed; }
    soc = Math.min(1, soc);
    pts.push({ t: m, sun, gen, load, soc, shed });
  }
  return { pts, eclipseMin: f * PERIOD, period: PERIOD, sunsetsPerDay: f > 0 ? 1440 / PERIOD : 0 };
}

export type MarsOpts = { solarM2: number; batteryKWh: number; reactors: number; stormSol: number; isru: boolean };
export const DEFAULT_MARS: MarsOpts = { solarM2: 1500, batteryKWh: 600, reactors: 0, stormSol: 12, isru: true };

/** 60 sols at 15-minute steps, with a global dust storm. */
export function marsRun(o: MarsOpts) {
  const SOL = 24.66, steps = Math.round((60 * SOL * 60) / 15);
  let bat = o.batteryKWh * 0.8;
  const out: { sol: number; tau: number; gen: number; load: number; soc: number; shed: number }[] = [];
  let shedH = 0, isruH = 0;
  for (let k = 0; k <= steps; k++) {
    const hrs = (k * 15) / 60, sol = hrs / SOL, hod = (sol % 1) * 24;
    // dust: clear sky tau 0.5; a storm builds over 5 sols to tau 4.5, then decays over about 30 sols
    const ds = sol - o.stormSol;
    const tau = 0.5 + (ds < 0 ? 0 : ds < 5 ? 4 * (ds / 5) : 4 * Math.exp(-(ds - 5) / 12));
    const cosz = Math.max(0, Math.sin(((hod - 6) / 12.33) * Math.PI));
    const direct = 590 * cosz * Math.exp(-tau / Math.max(0.15, cosz));
    const diffuse = 590 * cosz * 0.35 * (1 - Math.exp(-tau)) * Math.exp(-tau * 0.25);
    const solar = ((direct + diffuse) * o.solarM2 * 0.25 * 0.85) / 1000; // kW: 25 % cells, 85 % after dust on panels and wiring
    const gen = solar + o.reactors * 10;
    // loads: life support and habitat 18 kW (more heating at night), science 6 kW, oxygen/propellant plant 25 kW
    const life = 18 + (hod < 6 || hod > 19 ? 5 : 0);
    let isru = o.isru ? 25 : 0, sci = 6;
    // shed the propellant plant first, then science, never life support
    const need = (l: number) => l - gen;
    if (bat < o.batteryKWh * 0.4 && need(life + sci + isru) > 0) isru = 0;
    if (bat < o.batteryKWh * 0.2 && need(life + sci + isru) > 0) sci = 0;
    const load = life + sci + isru;
    const shed = (o.isru ? 25 : 0) + 6 - isru - sci;
    bat = Math.max(0, Math.min(o.batteryKWh, bat + (gen - load) * 0.25 * (gen > load ? 0.92 : 1 / 0.92)));
    if (shed > 0) shedH += 0.25;
    if (isru > 0) isruH += 0.25;
    if (k % 4 === 0) out.push({ sol, tau, gen, load, soc: o.batteryKWh ? bat / o.batteryKWh : 0, shed });
  }
  const lifeLost = out.some((p) => p.soc <= 0.001 && p.gen < 18);
  return { pts: out, shedH, isruH, lifeLost };
}
