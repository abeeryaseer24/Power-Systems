// Fallout: a Lagrangian puff model driven by reconstructed release histories
// and the hour-by-hour wind and rain. Deposition is scaled so its pattern can
// be read against the published Cs-137 maps; shapes are indicative only.

import { rng } from '../plants3d/textures';

export type Place = { name: string; lat: number; lon: number; big?: boolean };
export type Zone = { r: number; t: number; label: string };
export type WindSeg = { t: number; to: number; ms: number; rain?: number }; // from t (h): blowing toward `to` degrees
export type FalloutDef = {
  id: string;
  name: string;
  date0: Date; // t = 0
  lat0: number;
  lon0: number;
  half: number; // map half-size, km
  hours: number;
  release: [number, number][]; // relative release rate (per hour) vs t
  wind: WindSeg[];
  places: Place[];
  zones: Zone[];
  events: [number, string][];
  bands: [number, string][]; // lower bound, label (kBq/m² Cs-137)
  coast?: [number, number][]; // lat, lon; land lies west of it
  rivers?: [number, number][][];
  offmap?: { name: string; bearing: number; km: number }[];
};

export const FO_CHERNOBYL: FalloutDef = {
  id: 'chernobyl',
  name: 'Chernobyl, April–May 1986',
  date0: new Date(Date.UTC(1986, 3, 25, 21, 23)), // 01:23 Moscow time
  lat0: 51.389,
  lon0: 30.099,
  half: 170,
  hours: 240,
  release: [[0, 40], [1, 12], [6, 7], [24, 4], [72, 2], [110, 1.6], [130, 2.4], [190, 4.5], [222, 5], [228, 0.6], [240, 0.1]],
  wind: [
    { t: 0, to: 280, ms: 6 }, { t: 12, to: 305, ms: 6 }, { t: 30, to: 350, ms: 5 }, { t: 48, to: 40, ms: 5 },
    { t: 58, to: 48, ms: 5, rain: 1 }, { t: 74, to: 70, ms: 4 }, { t: 96, to: 175, ms: 4 }, { t: 120, to: 205, ms: 4, rain: 0.4 },
    { t: 150, to: 240, ms: 3 }, { t: 180, to: 270, ms: 4 }, { t: 210, to: 220, ms: 3 },
  ],
  places: [
    { name: 'Pripyat', lat: 51.405, lon: 30.057, big: true }, { name: 'Chernobyl', lat: 51.276, lon: 30.222 }, { name: 'Kyiv', lat: 50.45, lon: 30.52, big: true },
    { name: 'Gomel', lat: 52.44, lon: 30.98, big: true }, { name: 'Bragin', lat: 51.79, lon: 30.27 }, { name: 'Narodychi', lat: 51.2, lon: 29.08 },
    { name: 'Mozyr', lat: 52.05, lon: 29.24 }, { name: 'Chernihiv', lat: 51.5, lon: 31.3, big: true }, { name: 'Khoiniki', lat: 51.89, lon: 29.96 },
    { name: 'Korosten', lat: 50.95, lon: 28.64 }, { name: 'Ovruch', lat: 51.32, lon: 28.81 },
  ],
  zones: [{ r: 10, t: 150, label: '10 km zone, 2 May' }, { r: 30, t: 170, label: '30 km zone, 2–6 May' }],
  events: [
    [0, '26 April, 01:23. The explosion lifts a hot plume over a kilometre high. The wind carries it west and north-west.'],
    [36, '27 April, 14:00. Pripyat’s 49,000 people are evacuated in three hours, told they will be back in three days.'],
    [54, '28 April. Sensors at Forsmark, in Sweden, alarm on workers’ shoes. The world learns from the fallout.'],
    [60, '28–29 April. Rain over the Gomel region washes the plume out: hotspots 100–150 km north-east, in Belarus.'],
    [96, '30 April. The wind swings south, towards Kyiv.'],
    [130, '1–5 May. The burning graphite drives a second rise in release. 5,000 tonnes of sand, lead and boron are dropped from helicopters.'],
    [170, '2–6 May. The 30 km zone is evacuated: about 116,000 people.'],
    [226, '6 May. The release drops sharply, by a hundred times.'],
  ],
  bands: [[37, '37–185'], [185, '185–555'], [555, '555–1,480'], [1480, 'over 1,480']],
  rivers: [
    [[51.62, 28.7], [51.55, 29.2], [51.5, 29.65], [51.44, 30.0], [51.37, 30.2], [51.3, 30.42], [51.24, 30.55]],
    [[52.6, 30.45], [52.1, 30.5], [51.62, 30.55], [51.24, 30.55], [50.9, 30.5], [50.6, 30.48], [50.45, 30.58], [50.0, 30.8]],
  ],
  offmap: [{ name: 'Minsk', bearing: 330, km: 330 }, { name: 'Scandinavia', bearing: 320, km: 1200 }],
};

export const FO_FUKUSHIMA: FalloutDef = {
  id: 'fukushima',
  name: 'Fukushima, March 2011',
  date0: new Date(Date.UTC(2011, 2, 11, 5, 46)), // 14:46 JST
  lat0: 37.421,
  lon0: 141.033,
  half: 120,
  hours: 264,
  release: [[0, 0], [20, 0], [20.5, 3], [24.5, 2], [24.8, 25], [25.8, 3], [40, 1], [68, 1], [68.2, 18], [69.5, 3], [80, 3], [81, 40], [92, 22], [104, 8], [130, 2], [200, 1], [240, 0.6], [264, 0.3]],
  wind: [
    { t: 0, to: 90, ms: 5 }, { t: 22, to: 10, ms: 4 }, { t: 30, to: 95, ms: 6 }, { t: 60, to: 110, ms: 5 },
    { t: 80, to: 200, ms: 4 }, { t: 92, to: 300, ms: 3, rain: 0.3 }, { t: 98, to: 312, ms: 3, rain: 1 }, { t: 108, to: 90, ms: 6 },
    { t: 200, to: 195, ms: 4, rain: 0.6 }, { t: 228, to: 100, ms: 5 },
  ],
  places: [
    { name: 'Iitate', lat: 37.68, lon: 140.73 }, { name: 'Fukushima', lat: 37.76, lon: 140.47, big: true }, { name: 'Minamisoma', lat: 37.64, lon: 140.96 },
    { name: 'Namie', lat: 37.49, lon: 141.0 }, { name: 'Futaba', lat: 37.45, lon: 141.01 }, { name: 'Tomioka', lat: 37.34, lon: 141.02 },
    { name: 'Iwaki', lat: 37.05, lon: 140.89, big: true }, { name: 'Koriyama', lat: 37.4, lon: 140.38, big: true }, { name: 'Sendai', lat: 38.27, lon: 140.87, big: true },
    { name: 'Date', lat: 37.82, lon: 140.56 }, { name: 'Soma', lat: 37.8, lon: 140.92 },
  ],
  zones: [{ r: 3, t: 6.6, label: '3 km, 21:23 11 Mar' }, { r: 10, t: 15, label: '10 km, 05:44 12 Mar' }, { r: 20, t: 27.6, label: '20 km, 18:25 12 Mar' }, { r: 30, t: 92, label: '20–30 km shelter, 15 Mar' }],
  events: [
    [0, '11 March, 14:46. Earthquake, then the tsunami. No release yet: the cores are still covered.'],
    [6.6, '21:23. Residents within 3 km told to evacuate.'],
    [20.5, '12 March, morning. Unit 1 is vented by hand. The first releases.'],
    [24.8, '15:36. Hydrogen explosion at unit 1. The wind is offshore, then briefly north along the coast.'],
    [68.2, '14 March, 11:01. Unit 3 explodes. The plume goes out to sea.'],
    [81, '15 March, early morning. Unit 2’s containment fails: the largest release. The wind turns south along the coast.'],
    [96, '15 March, afternoon. The wind turns north-west and snow falls: the plume is washed onto Iitate and Fukushima city, 40–60 km away.'],
    [108, '16 March. Back offshore. Most of the release ends up in the Pacific.'],
    [200, '20–21 March. Rain over the Kanto plain, south towards Tokyo, deposits the last major plume.'],
  ],
  bands: [[30, '30–100'], [100, '100–300'], [300, '300–1,000'], [1000, 'over 1,000']],
  coast: [[38.45, 141.4], [38.3, 141.05], [38.15, 140.96], [38.0, 140.93], [37.8, 140.97], [37.6, 141.01], [37.42, 141.04], [37.2, 141.01], [37.0, 140.97], [36.85, 140.82], [36.6, 140.66], [36.3, 140.6]],
  offmap: [{ name: 'Tokyo', bearing: 205, km: 225 }],
};

export const FALLOUT: Record<string, FalloutDef> = { chernobyl: FO_CHERNOBYL, fukushima: FO_FUKUSHIMA };

export function proj(d: FalloutDef, lat: number, lon: number): [number, number] {
  return [(lon - d.lon0) * 111.32 * Math.cos((d.lat0 * Math.PI) / 180), -(lat - d.lat0) * 110.57];
}

function lerp(c: [number, number][], t: number) {
  if (t <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) if (t <= c[i][0]) return c[i - 1][1] + ((c[i][1] - c[i - 1][1]) * (t - c[i - 1][0])) / (c[i][0] - c[i - 1][0] || 1);
  return c[c.length - 1][1];
}
const windAt = (d: FalloutDef, t: number) => [...d.wind].reverse().find((w) => t >= w.t) ?? d.wind[0];

/** Is (x, z) km over land? Land is west of the coast polyline, if there is one. */
export function landMask(d: FalloutDef) {
  if (!d.coast) return () => true;
  const pts = d.coast.map(([la, lo]) => proj(d, la, lo));
  return (x: number, z: number) => {
    for (let i = 1; i < pts.length; i++) {
      const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
      if ((z >= z1 && z <= z0) || (z >= z0 && z <= z1)) {
        const cx = x0 + ((x1 - x0) * (z - z0)) / (z1 - z0 || 1);
        return x < cx;
      }
    }
    return z > pts[pts.length - 1][1] ? x < pts[pts.length - 1][0] : x < pts[0][0];
  };
}

export const N = 200;
const DT = 0.5;

export type FalloutRun = {
  snapEvery: number;
  snaps: Float32Array[]; // deposition grid every snapEvery hours
  puffs: Float32Array[]; // per step: x, z, mass for each puff alive
  scale: number; // multiply grid values to get kBq/m²
};

export function simulate(d: FalloutDef): FalloutRun {
  const R = rng(7);
  const land = landMask(d);
  const cell = (2 * d.half) / N;
  const grid = new Float32Array(N * N);
  const puffs: { x: number; z: number; m: number; age: number; jit: number; sp: number }[] = [];
  const snapEvery = 3;
  const snaps: Float32Array[] = [];
  const frames: Float32Array[] = [];
  const steps = Math.ceil(d.hours / DT);
  const isLand = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) isLand[j * N + i] = land(-d.half + (i + 0.5) * cell, -d.half + (j + 0.5) * cell) ? 1 : 0;
  for (let s = 0; s <= steps; s++) {
    const t = s * DT;
    // two puffs per half hour, each with its own meander
    const rel = lerp(d.release, t) * DT;
    if (rel > 0) for (let k = 0; k < 2; k++) puffs.push({ x: (R() - 0.5) * 0.6, z: (R() - 0.5) * 0.6, m: rel / 2, age: 0, jit: (R() - 0.5) * 0.5, sp: 0.75 + R() * 0.5 });
    const w = windAt(d, t);
    const frame = new Float32Array(puffs.length * 3);
    puffs.forEach((p, n) => {
      const a = ((w.to + p.jit * 57 + Math.sin(t * 0.3 + p.jit * 9) * 12) * Math.PI) / 180;
      const v = w.ms * 3.6 * p.sp * DT;
      p.x += Math.sin(a) * v;
      p.z -= Math.cos(a) * v;
      p.age += DT;
      // deposit under the puff: dry everywhere, wet much faster in rain
      const sig = Math.min(7, 1.2 + p.age * 0.35);
      const rate = (0.012 + (w.rain ?? 0) * 0.09) * DT;
      const dep = p.m * rate;
      p.m -= dep;
      const ci = Math.floor((p.x + d.half) / cell), cj = Math.floor((p.z + d.half) / cell);
      const rr = Math.ceil((2 * sig) / cell);
      const norm = dep / (2 * Math.PI * sig * sig);
      for (let j = cj - rr; j <= cj + rr; j++) {
        if (j < 0 || j >= N) continue;
        for (let i = ci - rr; i <= ci + rr; i++) {
          if (i < 0 || i >= N) continue;
          const k = j * N + i;
          if (!isLand[k]) continue;
          const dx = -d.half + (i + 0.5) * cell - p.x, dz = -d.half + (j + 0.5) * cell - p.z;
          grid[k] += norm * Math.exp(-(dx * dx + dz * dz) / (2 * sig * sig)) * cell * cell;
        }
      }
      frame[n * 3] = p.x;
      frame[n * 3 + 1] = p.z;
      frame[n * 3 + 2] = p.m;
    });
    frames.push(frame);
    if (s % (snapEvery / DT) === 0) snaps.push(grid.slice());
  }
  // calibrate: the top band reaches about 30 km along the worst direction, as on the published maps
  let v30 = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const r = Math.hypot(-d.half + (i + 0.5) * cell, -d.half + (j + 0.5) * cell);
    if (r > 28 && r < 34) v30 = Math.max(v30, grid[j * N + i]);
  }
  const scale = (d.bands[d.bands.length - 1][0] * 1.15) / (v30 || 1);
  return { snapEvery, snaps, puffs: frames, scale };
}

export const STEP = DT;
