// Demand model for the city: weather, sun, and bottom-up load per district
// and sector. Every number traces back to a simple physical assumption, so
// the inspector can explain where each megawatt comes from.

import type { CityData, District, Season } from './types';

export type { Season };
export type DayType = 'weekday' | 'weekend';
export type Special = 'none' | 'final' | 'eid' | 'ramadan' | 'gp' | 'eclipse';
export type DayInputs = { season: Season; day: DayType; heat: number /* °C offset */; special?: Special };

/** Special days: what changes, and when. Illustrative shapes, not measured curves. */
export const SPECIAL: Record<Special, { label: string; note: string; marks: { t: number; title: string; body: string }[] }> = {
  none: { label: 'An ordinary day', note: '', marks: [] },
  final: {
    label: 'World Cup final night', note: 'Kick-off at 20:00. Most homes are watching; at half-time and full-time thousands of fans, fridges, kettles and lights switch on within a few minutes: the TV pickup grid operators plan for.',
    marks: [
      { t: 20, title: 'Kick-off', body: 'Streets empty, TVs on. Home demand rises a little and stays flat: nobody moves.' },
      { t: 20.78, title: 'Half-time pickup', body: 'Within five minutes everyone gets up at once: lights, fans, fridges opened, kettles and rice cookers on. Operators hold fast reserve ready for exactly this minute.' },
      { t: 21.85, title: 'Full-time pickup', body: 'The final whistle: a second, bigger surge, then celebrations spill outside and demand drifts down.' },
    ],
  },
  eid: {
    label: 'Eid holiday', note: 'Offices, shops and factories close, and a large share of the city travels to family villages. Demand falls by a third or more; the grid has the opposite problem to a heatwave: too little load to keep big plants stable.',
    marks: [{ t: 8, title: 'Eid prayers', body: 'The morning is quiet: offices and factories are shut and much of the city has left for the holiday.' }],
  },
  ramadan: {
    label: 'A Ramadan evening', note: 'Daytime demand dips while people fast; at iftar (sunset) every kitchen switches on together, then mosques and markets light up late; a second small peak at sehri before dawn.',
    marks: [
      { t: 18.3, title: 'Iftar', body: 'Sunset: the fast breaks across the city within minutes. Kitchens, lights and fans all come on together.' },
      { t: 3.6, title: 'Sehri', body: 'Before dawn, families wake to eat before the fast: a small night peak.' },
    ],
  },
  eclipse: {
    label: 'Solar eclipse', note: 'A deep partial eclipse: the Moon covers nine-tenths of the Sun at 10:30. Rooftop solar output falls and recovers over two and a half hours, and the grid has to cover the gap with plants that ramp up and down on cue, as Europe did in March 2015.',
    marks: [
      { t: 9.25, title: 'First contact', body: 'The Moon starts to cross the Sun. Rooftop solar output begins to fall, minute by minute.' },
      { t: 10.5, title: 'Maximum eclipse', body: 'Nine-tenths of the Sun is covered. Solar output is down to a fraction of normal and the air cools a degree or two. Gas and hydro plants have ramped up to cover the gap.' },
      { t: 11.75, title: 'Last contact', body: 'The Sun is back. Solar output surges back faster than it fell, and the plants that filled in have to ramp down just as fast.' },
    ],
  },
  gp: {
    label: 'Street-circuit Grand Prix night', note: 'A night race on city streets: floodlighting the circuit to broadcast standard, hospitality suites, fan zones and screens in the central district, from late afternoon until after midnight. The numbers here are illustrative.',
    marks: [
      { t: 17, title: 'Circuit lights up', body: 'Floodlights along the street circuit and the fan zones come on in the central district, several megawatts on top of a normal evening.' },
      { t: 22, title: 'Race start', body: 'Broadcast lighting at full output, fan zones packed, hospitality kitchens busy.' },
    ],
  },
};
const coreOf = new WeakMap<CityData, District>();

export const SECTORS = ['res', 'com', 'ind', 'inst', 'light', 'ev', 'water', 'metro', 'loss'] as const;
export type Sector = (typeof SECTORS)[number];
export const SECTOR_INFO: Record<Sector, { label: string; colour: string; note: string }> = {
  res: { label: 'Homes', colour: '#ffb04d', note: 'Lights, fans, fridges, cooking, TVs and air conditioning in every home in the city.' },
  com: { label: 'Offices & shops', colour: '#86c5da', note: 'Commercial floor space: lighting, lifts, IT, and chillers that follow office and shop hours.' },
  ind: { label: 'Industry', colour: '#c9b8ff', note: 'Factories, workshops, cold stores and port cranes: three shifts, a dip at night.' },
  inst: { label: 'Hospitals & campus', colour: '#e98fb0', note: 'Hospitals run flat around the clock; universities follow the teaching day.' },
  light: { label: 'Street lighting', colour: '#e8d27a', note: 'Switches on when the sun drops 1° below the horizon, dims to 70 % after midnight.' },
  ev: { label: 'EV charging', colour: '#7fd1a8', note: 'Home wallboxes in the evening (or after midnight with smart charging), office chargers by day, and 250 kW hubs simulated car by car.' },
  water: { label: 'Water pumping', colour: '#5fa8d3', note: 'Pumping stations lifting treated water into each area’s elevated tank: about 0.35 kWh per cubic metre.' },
  metro: { label: 'Metro traction', colour: '#ff8a5c', note: 'The metro, from the traction substations’ meters. Simulated train by train.' },
  loss: { label: 'Network losses', colour: '#5d6d84', note: 'Heat in cables and transformers between the 132 kV intake and the meters, about 6 %.' },
};

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smooth = (x: number, a: number, b: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Periodic cosine-interpolated lookup in a 24-value hourly table. */
function hourly(tbl: number[], h: number) {
  const x = ((h % 24) + 24) % 24;
  const i = Math.floor(x), f = x - i;
  const a = tbl[i], b = tbl[(i + 1) % 24];
  const w = (1 - Math.cos(f * Math.PI)) / 2;
  return a + (b - a) * w;
}

/** Air temperature, °C. Minimum just before dawn, maximum mid-afternoon. */
export const eclipseFactor = (h: number) => 1 - 0.9 * Math.max(0, 1 - Math.abs(h - 10.5) / 1.25) ** 1.3;

export function temperature(c: CityData, h: number, inp: DayInputs) {
  const s = c.climate[inp.season];
  const ecl = inp.special === 'eclipse' ? (1 - eclipseFactor(h)) * 2 : 0;
  const x = ((h - 5.5 + 24) % 24) / 24; // 0 at 05:30
  // asymmetric day: fast warm-up to 15:00, slow cooling through the night
  const w = x < 0.396 ? Math.sin((x / 0.396) * Math.PI / 2) : Math.cos(((x - 0.396) / 0.604) * Math.PI / 2) ** 1.4;
  return s.tmin + inp.heat + (s.tmax - s.tmin) * w - ecl;
}

/** Solar elevation in degrees for the city latitude and the season's declination. */
export function sunElevation(c: CityData, h: number, inp: DayInputs) {
  const lat = (c.lat * Math.PI) / 180, dec = (c.climate[inp.season].dec * Math.PI) / 180;
  const H = ((h - 12) * 15 * Math.PI) / 180;
  return (Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H)) * 180) / Math.PI;
}

// Occupancy and activity shapes, 00:00..23:00
const HOME_ACTIVITY = [0.32, 0.28, 0.26, 0.25, 0.27, 0.38, 0.58, 0.72, 0.62, 0.48, 0.44, 0.44, 0.47, 0.48, 0.46, 0.47, 0.54, 0.68, 0.86, 1.0, 1.0, 0.94, 0.78, 0.5];
const HOME_ACTIVITY_WE = [0.4, 0.33, 0.29, 0.27, 0.27, 0.32, 0.44, 0.58, 0.68, 0.7, 0.68, 0.66, 0.68, 0.66, 0.62, 0.6, 0.64, 0.74, 0.88, 1.0, 1.0, 0.96, 0.84, 0.58];
const HOME_OCC = [0.97, 0.98, 0.98, 0.98, 0.98, 0.95, 0.88, 0.7, 0.5, 0.42, 0.4, 0.42, 0.45, 0.45, 0.44, 0.48, 0.56, 0.68, 0.8, 0.88, 0.92, 0.95, 0.96, 0.97];
const OFFICE_OCC = [0.04, 0.03, 0.03, 0.03, 0.04, 0.06, 0.14, 0.38, 0.75, 0.95, 1.0, 1.0, 0.96, 0.98, 1.0, 0.98, 0.9, 0.72, 0.5, 0.34, 0.24, 0.15, 0.09, 0.06];
const SHOP_OCC = [0.06, 0.04, 0.04, 0.04, 0.04, 0.05, 0.08, 0.15, 0.3, 0.55, 0.75, 0.85, 0.9, 0.9, 0.88, 0.88, 0.92, 0.98, 1.0, 1.0, 0.95, 0.75, 0.4, 0.14];
const IND_SHIFT = [0.78, 0.76, 0.75, 0.75, 0.76, 0.8, 0.9, 0.98, 1.0, 1.0, 1.0, 0.98, 0.94, 0.98, 1.0, 1.0, 0.98, 0.96, 0.92, 0.88, 0.86, 0.84, 0.82, 0.8];
const CAMPUS = [0.35, 0.33, 0.32, 0.32, 0.33, 0.36, 0.45, 0.62, 0.85, 0.98, 1.0, 1.0, 0.97, 0.98, 1.0, 0.96, 0.88, 0.76, 0.66, 0.6, 0.55, 0.5, 0.44, 0.38];

export type DistrictLoad = { res: number; com: number; ind: number; inst: number; light: number; /** window-lighting levels 0..1 by building kind */ lit: [number, number, number, number] };

const STREET_KW_PER_KM = 9;

/** Load of one district in MW at hour h. */
export function districtLoad(c: CityData, d: District, h: number, inp: DayInputs): DistrictLoad {
  const T = temperature(c, h, inp);
  const we = inp.day === 'weekend';
  const sunEl = sunElevation(c, h, inp);
  const k = c.demand.scale;
  const dark = 1 - smooth(sunEl, -2, 6); // how dark it is outside, 0..1

  // homes: base appliances + activity + AC that follows occupancy and heat
  const act = hourly(we ? HOME_ACTIVITY_WE : HOME_ACTIVITY, h);
  const occ = hourly(HOME_OCC, h);
  const acShare = c.demand.acShare; // households with at least one AC unit
  // bedroom AC keeps running through hot nights, so cooling follows occupancy, not activity
  const cool = Math.max(0, T - 25.5) * 0.05 * acShare * (0.55 + 0.45 * occ) + Math.max(0, T - 24) * 0.01 * occ; // AC + fans, kW per person
  // electric heating in cold cities: heat pumps, storage and panel heaters below 15 °C
  const heat = Math.max(0, 15 - T) * 0.035 * (c.demand.heatShare ?? 0) * (0.45 + 0.55 * occ);
  const resKw = c.demand.resBase + c.demand.resAct * act + cool + heat + 0.04 * dark * occ;
  // special days reshape the activity curves
  const sp = inp.special ?? 'none';
  let resMul = 1, comMul = 1, indMul = 1, extra = 0;
  if (sp === 'final') {
    const pulse = (t0: number, w: number) => Math.exp(-(((h - t0) * 60) ** 2) / (2 * w * w));
    resMul = (h >= 19.9 && h < 22.1 ? 1.03 : 1) + 0.075 * pulse(20.8, 4) + 0.1 * pulse(21.88, 5);
  } else if (sp === 'eid') {
    resMul = 0.62; comMul = 0.3; indMul = 0.25;
  } else if (sp === 'ramadan') {
    const pulse = (t0: number, w: number) => Math.exp(-(((h - t0) * 60) ** 2) / (2 * w * w));
    resMul = (h > 9 && h < 17 ? 0.9 : 1) + 0.12 * pulse(18.35, 18) + 0.06 * pulse(3.6, 25) + (h > 20 && h < 23.5 ? 0.04 : 0);
    comMul = h > 20 && h < 24 ? 1.25 : h > 9 && h < 16 ? 0.9 : 1;
  } else if (sp === 'gp') {
    let core = coreOf.get(c);
    if (!core) { core = c.districts.reduce((a, b) => (b.comM2 > a.comM2 ? b : a)); coreOf.set(c, core); }
    if (d === core) {
      // 5 km of circuit floodlit to broadcast level (~1.6 MW/km), fan zones and hospitality (~25 MW)
      const on = h >= 16.8 || h < 1.2 ? 1 : 0, race = h >= 21.8 && h < 23.8 ? 1 : 0;
      extra = on * (8 + 25 * (h >= 18 || h < 1 ? 1 : 0.4)) + race * 4;
      comMul = 1.12;
    }
  }
  const res = (k * d.pop * resKw * resMul) / 1000;

  // commercial floor space: W/m² base + occupancy-driven + chillers
  const offOcc = hourly(OFFICE_OCC, h) * (we ? 0.35 : 1);
  const shopOcc = hourly(SHOP_OCC, h) * (we ? 1.1 : 1);
  const comOcc = 0.6 * offOcc + 0.4 * shopOcc;
  const wm2 = 6 + 22 * comOcc + Math.max(0, T - 23) * 1.25 * (0.25 + 0.75 * comOcc) + Math.max(0, 12 - T) * 0.6 * (c.demand.heatShare ?? 0) * (0.3 + 0.7 * comOcc);
  const com = (k * d.comM2 * wm2 * comMul) / 1e6 + extra;

  const ind = d.indMW * hourly(IND_SHIFT, h) * (we ? 0.78 : 1) * (1 + Math.max(0, T - 30) * 0.008) * indMul;
  // institutions: half hospital-like (flat, cooling), half campus-like
  const inst = d.instMW * (0.5 * (0.85 + Math.max(0, T - 24) * 0.012) + 0.5 * hourly(CAMPUS, h) * (we ? 0.6 : 1));
  const light = (d.streetKm * STREET_KW_PER_KM * dark * (h >= 0.5 && h < 5 ? 0.7 : 1)) / 1000;

  // how many windows glow: people at home in the dark, offices occupied, etc.
  const lit: [number, number, number, number] = [
    clamp((0.18 + 0.82 * act) * occ * (0.25 + 0.75 * dark), 0, 1),
    clamp(0.04 + 0.85 * comOcc, 0, 1),
    clamp(0.25 + 0.55 * hourly(IND_SHIFT, h) * (we ? 0.7 : 1) - 0.4, 0, 1),
    clamp(0.25 + 0.6 * hourly(CAMPUS, h) * (we ? 0.6 : 1), 0, 1),
  ];
  return { res, com, ind, inst, light, lit };
}

export const LOSS_FRACTION = 0.062;

/** Rooftop solar output, MW: sun height, season's cloud, inverter and dust losses, and any eclipse. */
export function solarOut(c: CityData, h: number, inp: DayInputs) {
  const cap = c.demand.rooftopMW ?? 0;
  if (!cap) return 0;
  const el = sunElevation(c, h, inp);
  if (el <= 0) return 0;
  const label = c.climate[inp.season].label.toLowerCase();
  const cloud = /monsoon|rain/.test(label) ? 0.55 : inp.season === 'winter' ? 0.75 : inp.season === 'summer' ? 0.9 : 0.8;
  const sun = Math.sin((el * Math.PI) / 180) ** 1.15;
  return cap * sun * cloud * 0.82 * (inp.special === 'eclipse' ? eclipseFactor(h) : 1);
}

/** Sum of the closed-form sectors over all districts (metro comes from the traction sim). */
export function cityLoad(c: CityData, h: number, inp: DayInputs) {
  const t = { res: 0, com: 0, ind: 0, inst: 0, light: 0 };
  for (const d of c.districts) {
    const l = districtLoad(c, d, h, inp);
    t.res += l.res; t.com += l.com; t.ind += l.ind; t.inst += l.inst; t.light += l.light;
  }
  return t;
}

