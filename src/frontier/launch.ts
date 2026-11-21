// A heavy launcher's pad and the power behind it. Illustrative, built from
// public figures for methane / liquid-oxygen heavy launchers; not any one
// company's site.
//
// Propellant: 4,600 t, of which 78 % liquid oxygen (LOX) and 22 % liquid
// methane. Making LOX in an air separation unit and liquefying it costs about
// 0.5 kWh per kg; liquefying methane about 0.3 kWh per kg. Liquid nitrogen
// (for purging and subcooling) another 600 t at 0.45 kWh/kg.

export const LV = {
  propellantT: 4600,
  loxShare: 0.78,
  thrustMN: 72, // at liftoff
  ve: 3250, // effective exhaust velocity, m/s
  massT: 5000, // fully fuelled
  burn: 165, // booster burn, s
};

export const KWH_PER_KG = { lox: 0.5, ch4: 0.3, ln2: 0.45 };

export function propellantEnergy() {
  const lox = LV.propellantT * LV.loxShare * 1000, ch4 = LV.propellantT * (1 - LV.loxShare) * 1000, ln2 = 600 * 1000;
  return { loxMWh: (lox * KWH_PER_KG.lox) / 1000, ch4MWh: (ch4 * KWH_PER_KG.ch4) / 1000, ln2MWh: (ln2 * KWH_PER_KG.ln2) / 1000 };
}

/** Jet (exhaust kinetic) power at liftoff: 1/2 · F · ve. */
export const jetPowerGW = () => (0.5 * LV.thrustMN * 1e6 * LV.ve) / 1e9;

/** Site load through a launch campaign: hours relative to T-0. */
export function siteLoad(asuMW: number) {
  const pts: { t: number; mw: number; parts: { asu: number; chill: number; pumps: number; deluge: number; base: number } }[] = [];
  for (let t = -48; t <= 6; t += 1 / 60) {
    const base = 4; // offices, hangars, tracking, lighting
    const asu = t < -1 ? asuMW : t < 0.5 ? asuMW * 0.6 : asuMW; // plant keeps topping up the tank farm
    const chill = t > -3 && t < -0.8 ? 6 : 0; // ground systems chilldown
    const pumps = t > -0.8 && t < -0.05 ? 18 : t >= -0.05 && t < 0 ? 6 : 0; // fast propellant load, then topping
    const deluge = t >= -0.003 && t < 0.01 ? 40 : 0; // water deluge pumps for the seconds around liftoff
    pts.push({ t, mw: base + asu + chill + pumps + deluge, parts: { asu, chill, pumps, deluge, base } });
  }
  return pts;
}

/** First 165 s of flight: thrust, velocity, and the power delivered to the vehicle (F·v). */
export function ascent() {
  const g = 9.81, mdot = (LV.thrustMN * 1e6) / LV.ve; // kg/s
  let m = LV.massT * 1000, v = 0, h = 0;
  const out: { t: number; v: number; h: number; jetGW: number; vehGW: number }[] = [];
  for (let t = 0; t <= LV.burn; t += 1) {
    const F = LV.thrustMN * 1e6 * (1 + 0.12 * Math.min(1, h / 30000)); // thrust rises as air pressure falls
    const drag = 0.5 * 1.2 * Math.exp(-h / 8500) * v * v * 0.35 * 63; // crude Cd·A
    const a = (F - drag) / m - g * Math.max(0.2, Math.cos(Math.min(1.2, t / 140)));
    out.push({ t, v, h, jetGW: (0.5 * F * LV.ve) / 1e9, vehGW: (F * v) / 1e9 });
    v += a; h += v * Math.max(0.3, Math.cos(Math.min(1.2, t / 140))); m -= mdot * 0.97;
  }
  return out;
}

export const COMPARE = [
  { name: 'Meridia (prototype city), evening peak', gw: 2.4 },
  { name: 'Bangladesh, national peak', gw: 16 },
  { name: 'United Kingdom, winter peak', gw: 45 },
  { name: 'Japan, summer peak', gw: 160 },
];
