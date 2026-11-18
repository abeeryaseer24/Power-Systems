// Weather and demand. Everything here is deterministic given a seed, so a
// scenario replays identically and the forecast is the noiseless curve.

import type { District, DistrictKind } from './network';

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rand: () => number) {
  const u = Math.max(1e-9, rand());
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Ornstein–Uhlenbeck process: mean-reverting noise with time constant tau (s). */
export class OU {
  x = 0;
  constructor(private tau: number, private sigma: number, private rand: () => number) {}
  step(dt: number) {
    const a = Math.exp(-dt / this.tau);
    this.x = this.x * a + this.sigma * Math.sqrt(1 - a * a) * gaussian(this.rand);
    return this.x;
  }
}

// Normalised hourly shapes (fraction of peak), index = hour 0..24 (24 wraps to 0).
const SHAPES: Record<DistrictKind, number[]> = {
  residential: [0.52, 0.46, 0.43, 0.42, 0.43, 0.5, 0.66, 0.8, 0.76, 0.66, 0.62, 0.62, 0.64, 0.62, 0.6, 0.62, 0.7, 0.86, 0.98, 1.0, 0.95, 0.86, 0.74, 0.62, 0.52],
  commercial: [0.38, 0.35, 0.34, 0.34, 0.36, 0.42, 0.56, 0.76, 0.92, 0.98, 1.0, 1.0, 0.98, 0.99, 0.98, 0.96, 0.92, 0.85, 0.72, 0.62, 0.55, 0.5, 0.45, 0.41, 0.38],
  industrial: [0.78, 0.76, 0.75, 0.75, 0.76, 0.8, 0.88, 0.95, 0.99, 1.0, 1.0, 0.99, 0.97, 0.99, 1.0, 0.99, 0.96, 0.92, 0.88, 0.85, 0.83, 0.82, 0.8, 0.79, 0.78],
  mixed: [0.46, 0.42, 0.4, 0.4, 0.41, 0.47, 0.62, 0.78, 0.84, 0.82, 0.8, 0.8, 0.81, 0.8, 0.78, 0.79, 0.82, 0.9, 0.97, 1.0, 0.93, 0.83, 0.71, 0.58, 0.46],
};

export function shapeAt(kind: DistrictKind, hour: number) {
  const s = SHAPES[kind];
  const h = ((hour % 24) + 24) % 24;
  const i = Math.floor(h);
  const f = h - i;
  // cosine interpolation keeps the curve smooth without overshoot
  const w = (1 - Math.cos(f * Math.PI)) / 2;
  return s[i] * (1 - w) + s[i + 1] * w;
}

export interface Weather {
  /** Daily min / max air temperature, °C. */
  tMin: number;
  tMax: number;
  /** Mean hub-height wind speed, m/s. */
  windMean: number;
  /** Wind variability (std, m/s). */
  windSigma: number;
  /** Cloud cover 0..1 (mean). */
  cloud: number;
  sunrise: number;
  sunset: number;
  /** Demand multiplier for day type (weekend, holiday). */
  demandScale: number;
}

export function temperatureAt(w: Weather, hour: number) {
  // minimum near 05:00, maximum near 15:00
  const phase = ((hour - 15) / 24) * 2 * Math.PI;
  const c = Math.cos(phase);
  return w.tMin + (w.tMax - w.tMin) * (0.5 + 0.5 * c);
}

export function clearSky(w: Weather, hour: number) {
  if (hour <= w.sunrise || hour >= w.sunset) return 0;
  const x = (hour - w.sunrise) / (w.sunset - w.sunrise);
  return Math.pow(Math.sin(Math.PI * x), 1.3);
}

export function districtDemand(d: District, w: Weather, hour: number, temp: number) {
  const base = d.peak * shapeAt(d.kind, hour) * w.demandScale;
  const occupancy = d.kind === 'commercial' ? (hour > 7 && hour < 20 ? 1 : 0.35) : 1;
  const cool = Math.max(0, temp - 21) * d.cooling * occupancy;
  const heat = Math.max(0, 14 - temp) * d.heating;
  return base + cool + heat;
}

/** Offshore turbine power curve, fraction of rated, with cut-out handled by caller. */
export function windPowerFraction(v: number) {
  const cutIn = 3.5;
  const rated = 12.5;
  if (v < cutIn) return 0;
  if (v >= rated) return 1;
  const r = (v - cutIn) / (rated - cutIn);
  // smoothstep-shaped approximation of the cubic region of a real curve
  return r * r * (3 - 2 * r) * 0.35 + Math.pow(r, 2.4) * 0.65;
}

/** Dynamic line rating multiplier with ambient temperature. */
export function ratingFactor(temp: number) {
  return 1 - 0.008 * Math.max(0, temp - 20) + 0.004 * Math.max(0, 10 - temp);
}
