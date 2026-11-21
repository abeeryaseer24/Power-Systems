// Demand model for the city: weather, sun, and bottom-up load per district
// and sector. Every number traces back to a simple physical assumption, so
// the inspector can explain where each megawatt comes from.

import { CITY, DISTRICTS, type District } from './meridia';

export type Season = 'summer' | 'monsoon' | 'winter';
export type DayType = 'weekday' | 'weekend';
export type DayInputs = { season: Season; day: DayType; heat: number /* °C offset */ };

export const SEASONS: Record<Season, { tmax: number; tmin: number; dec: number; label: string }> = {
  summer: { tmax: 35, tmin: 27, dec: 20, label: 'Pre-monsoon summer' },
  monsoon: { tmax: 31.5, tmin: 26.5, dec: 15, label: 'Monsoon' },
  winter: { tmax: 25, tmin: 13.5, dec: -20, label: 'Dry winter' },
};

export const SECTORS = ['res', 'com', 'ind', 'inst', 'light', 'metro', 'loss'] as const;
export type Sector = (typeof SECTORS)[number];
export const SECTOR_INFO: Record<Sector, { label: string; colour: string; note: string }> = {
  res: { label: 'Homes', colour: '#ffb04d', note: 'Lights, fans, fridges, cooking, TVs, and air conditioning in 2.7 million homes.' },
  com: { label: 'Offices & shops', colour: '#86c5da', note: 'Commercial floor space: lighting, lifts, IT, and chillers that follow office and shop hours.' },
  ind: { label: 'Industry', colour: '#c9b8ff', note: 'Port cranes, cold stores and the Kiln Works: three shifts, a dip at night.' },
  inst: { label: 'Hospitals & campus', colour: '#7fd1a8', note: 'The infirmary runs flat around the clock; the university follows the teaching day.' },
  light: { label: 'Street lighting', colour: '#e8d27a', note: 'Switches on when the sun drops 1° below the horizon, dims to 70 % after midnight.' },
  metro: { label: 'Metro traction', colour: '#ff8a5c', note: 'The two metro lines, from the traction substations’ meters. Simulated train by train.' },
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
export function temperature(h: number, inp: DayInputs) {
  const s = SEASONS[inp.season];
  const x = ((h - 5.5 + 24) % 24) / 24; // 0 at 05:30
  // asymmetric day: fast warm-up to 15:00, slow cooling through the night
  const w = x < 0.396 ? Math.sin((x / 0.396) * Math.PI / 2) : Math.cos(((x - 0.396) / 0.604) * Math.PI / 2) ** 1.4;
  return s.tmin + inp.heat + (s.tmax - s.tmin) * w;
}

/** Solar elevation in degrees for the city latitude and the season's declination. */
export function sunElevation(h: number, inp: DayInputs) {
  const lat = (CITY.lat * Math.PI) / 180, dec = (SEASONS[inp.season].dec * Math.PI) / 180;
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

/** Street lighting: kW per km of lit street, and street length per district. */
const STREET_KW_PER_KM = 9;
export const streetKm = (d: District) => {
  const [x0, z0, x1, z1] = d.rect;
  const area = ((x1 - x0) * (z1 - z0)) / 1e6; // km²
  return area * (2000 / d.block) * 0.8; // grid streets, both directions, 80 % lit
};

/** Load of one district in MW at hour h. */
export function districtLoad(d: District, h: number, inp: DayInputs): DistrictLoad {
  const T = temperature(h, inp);
  const we = inp.day === 'weekend';
  const sunEl = sunElevation(h, inp);
  const dark = 1 - smooth(sunEl, -2, 6); // how dark it is outside, 0..1

  // homes: base appliances + activity + AC that follows occupancy and heat
  const act = hourly(we ? HOME_ACTIVITY_WE : HOME_ACTIVITY, h);
  const occ = hourly(HOME_OCC, h);
  const acShare = 0.42; // households with at least one AC unit
  // bedroom AC keeps running through hot nights, so cooling follows occupancy, not activity
  const cool = Math.max(0, T - 25.5) * 0.05 * acShare * (0.55 + 0.45 * occ) + Math.max(0, T - 24) * 0.01 * occ; // AC + fans, kW per person
  const resKw = 0.07 + 0.165 * act + cool + 0.04 * dark * occ;
  const res = (d.pop * resKw) / 1000;

  // commercial floor space: W/m² base + occupancy-driven + chillers
  const offOcc = hourly(OFFICE_OCC, h) * (we ? 0.35 : 1);
  const shopOcc = hourly(SHOP_OCC, h) * (we ? 1.1 : 1);
  const comOcc = 0.6 * offOcc + 0.4 * shopOcc;
  const wm2 = 6 + 22 * comOcc + Math.max(0, T - 23) * 1.25 * (0.25 + 0.75 * comOcc);
  const com = (d.comM2 * wm2) / 1e6;

  const ind = d.indMW * hourly(IND_SHIFT, h) * (we ? 0.78 : 1) * (1 + Math.max(0, T - 30) * 0.008);
  // institutions: half hospital-like (flat, cooling), half campus-like
  const inst = d.instMW * (0.5 * (0.85 + Math.max(0, T - 24) * 0.012) + 0.5 * hourly(CAMPUS, h) * (we ? 0.6 : 1));
  const light = (streetKm(d) * STREET_KW_PER_KM * dark * (h >= 0.5 && h < 5 ? 0.7 : 1)) / 1000;

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

/** Sum of the closed-form sectors over all districts (metro comes from the traction sim). */
export function cityLoad(h: number, inp: DayInputs) {
  const t = { res: 0, com: 0, ind: 0, inst: 0, light: 0 };
  for (const d of DISTRICTS) {
    const l = districtLoad(d, h, inp);
    t.res += l.res; t.com += l.com; t.ind += l.ind; t.inst += l.inst; t.light += l.light;
  }
  return t;
}

export { DISTRICTS };
