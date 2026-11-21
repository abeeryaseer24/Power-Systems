// Meridia: the prototype city. Fictional, built to show how a city runs on
// electricity before the same models are applied to real cities. A coastal
// city of 2.7 million on a subtropical bay, about 16 km by 11 km. The numbers
// are illustrative, calibrated to published figures for hot, dense cities.
//
// Coordinates are metres: x east, z south, origin near the central interchange.

import { rng } from '../plants3d/textures';
import { polyLength, type Area, type Building, type CityData, type Climate, type GridSub, type Kind, type MetroLine, type Station, type Street } from './types';

type Proto = {
  id: string; name: string; rect: [number, number, number, number]; pop: number; comM2: number; indMW: number; instMW: number;
  block: number; floors: [number, number]; mix: Partial<Record<Kind, number>>; colour: string; sub: string;
};

/** Coastline: land is north of this z. */
const coastZ = (x: number) => 3700 + 520 * Math.cos((x - 600) / 2600) - 260 * Math.sin(x / 1400) * Math.exp(-((x - 4000) ** 2) / 8e6);
/** River centreline x as a function of z. */
const riverX = (z: number) => -1350 + 260 * Math.sin(z / 1300) + 120 * Math.sin(z / 470);
const RIVER_W = 170;

const GRID_SUBS: GridSub[] = [
  { id: 'harbour', name: 'Harbour 132/33 kV', x: 900, z: 2500 },
  { id: 'oldq', name: 'Old Quarter 132/33 kV', x: -3000, z: 2300 },
  { id: 'port', name: 'Port 132/33 kV', x: 4800, z: 2600 },
  { id: 'uni', name: 'University 132/33 kV', x: -5900, z: -700 },
  { id: 'westbank', name: 'Westbank 132/33 kV', x: -2700, z: -900 },
  { id: 'civic', name: 'Civic 132/33 kV', x: 300, z: -900 },
  { id: 'eastfield', name: 'Eastfield 132/33 kV', x: 3500, z: -1200 },
  { id: 'works', name: 'Works 132/33 kV', x: 6500, z: -800 },
  { id: 'northgate', name: 'Northgate 132/33 kV', x: -3600, z: -4300 },
  { id: 'lakeside', name: 'Lakeside 132/33 kV', x: 1500, z: -4300 },
  { id: 'logistics', name: 'Logistics 132/33 kV', x: 5800, z: -4300 },
];

const DISTRICTS: Proto[] = [
  { id: 'cbd', name: 'Harbourside', rect: [-1150, 900, 2400, 4300], pop: 90_000, comM2: 4.2e6, indMW: 0, instMW: 0, block: 130, floors: [12, 58], mix: { com: 0.75, res: 0.25 }, colour: '#9a9389', sub: 'harbour' },
  { id: 'oldq', name: 'Old Quarter', rect: [-5200, 900, -1550, 4300], pop: 520_000, comM2: 1.4e6, indMW: 12, instMW: 0, block: 62, floors: [3, 8], mix: { res: 0.7, com: 0.3 }, colour: '#a39070', sub: 'oldq' },
  { id: 'port', name: 'Port Meridia', rect: [2400, 1500, 7600, 4300], pop: 40_000, comM2: 0.35e6, indMW: 150, instMW: 0, block: 170, floors: [1, 4], mix: { ind: 0.8, com: 0.2 }, colour: '#8a8a84', sub: 'port' },
  { id: 'uni', name: 'University Hill', rect: [-7600, -2600, -4300, 900], pop: 140_000, comM2: 0.45e6, indMW: 0, instMW: 24, block: 110, floors: [3, 10], mix: { inst: 0.35, res: 0.55, com: 0.1 }, colour: '#8f9a74', sub: 'uni' },
  { id: 'westbank', name: 'Westbank', rect: [-4300, -2600, -1550, 900], pop: 430_000, comM2: 0.75e6, indMW: 0, instMW: 0, block: 80, floors: [5, 14], mix: { res: 0.85, com: 0.15 }, colour: '#9c8f78', sub: 'westbank' },
  { id: 'civic', name: 'Civic & Medical', rect: [-1150, -2600, 1700, 900], pop: 120_000, comM2: 1.2e6, indMW: 0, instMW: 34, block: 120, floors: [4, 22], mix: { inst: 0.3, com: 0.4, res: 0.3 }, colour: '#958d80', sub: 'civic' },
  { id: 'eastfield', name: 'Eastfield', rect: [1700, -2600, 5500, 1500], pop: 600_000, comM2: 0.9e6, indMW: 0, instMW: 0, block: 115, floors: [10, 32], mix: { res: 0.88, com: 0.12 }, colour: '#9a917f', sub: 'eastfield' },
  { id: 'works', name: 'Kiln Works', rect: [5500, -2600, 7600, 1500], pop: 20_000, comM2: 0.1e6, indMW: 210, instMW: 0, block: 190, floors: [1, 3], mix: { ind: 0.92, com: 0.08 }, colour: '#86837a', sub: 'works' },
  { id: 'northgate', name: 'Northgate', rect: [-6400, -6000, -1000, -2600], pop: 450_000, comM2: 0.6e6, indMW: 0, instMW: 0, block: 90, floors: [4, 12], mix: { res: 0.88, com: 0.12 }, colour: '#9a8e74', sub: 'northgate' },
  { id: 'lakeside', name: 'Lakeside', rect: [-1000, -6000, 4000, -2600], pop: 220_000, comM2: 0.35e6, indMW: 0, instMW: 0, block: 105, floors: [2, 5], mix: { res: 0.92, com: 0.08 }, colour: '#8f9775', sub: 'lakeside' },
  { id: 'logistics', name: 'Logistics Park', rect: [4000, -6000, 7600, -2600], pop: 30_000, comM2: 0.6e6, indMW: 55, instMW: 0, block: 180, floors: [1, 3], mix: { ind: 0.55, com: 0.45 }, colour: '#87877d', sub: 'logistics' },
];
const L1: [number, number][] = [
  [-7000, -1000], [-5600, -820], [-4300, -640], [-3000, -420], [-1700, -300], [-500, -260], [200, -250], [1500, -330], [2800, -520], [4100, -760], [5300, -900], [6500, -820], [7200, -700],
];
const L2: [number, number][] = [
  [-3300, -5700], [-2900, -4600], [-2350, -3500], [-1600, -2400], [-800, -1300], [0, -500], [250, 400], [500, 1300], [800, 2200], [1150, 3000], [1350, 3420],
];

function evenStations(path: [number, number][], names: string[]): Station[] {
  const L = polyLength(path);
  return names.map((name, i) => ({ name, s: Math.round((L * i) / (names.length - 1)) }));
}

const L1_ST = ['University', 'Observatory', 'Cotton Mills', 'Westbank', 'Riverside', 'Ferry Lane', 'Civic Centre', 'Mint Street', 'Eastfield', 'Tannery', 'Kiln Road', 'Works Gate', 'Saltmarsh'];
const L2_ST = ['Northgate', 'Reservoir', 'Linden', 'Hollow Park', 'Cathedral', 'Civic Centre', 'Infirmary', 'Exchange', 'Harbourside', 'Pier Head'];

function tssAt(stations: Station[], idx: number[], subOf: (s: Station) => string) {
  return idx.map((i) => ({ name: `${stations[i].name} TSS`, s: stations[i].s, sub: subOf(stations[i]) }));
}

const l1s = evenStations(L1, L1_ST);
const l2s = evenStations(L2, L2_ST);

const LINES: MetroLine[] = [
  {
    id: 'l1', name: 'Sodium Line', colour: '#ffb04d', path: L1, stations: l1s,
    tss: tssAt(l1s, [0, 2, 4, 6, 8, 10, 12], (s) => ({ University: 'uni', 'Cotton Mills': 'westbank', Riverside: 'westbank', 'Civic Centre': 'civic', Eastfield: 'eastfield', 'Kiln Road': 'works', Saltmarsh: 'works' })[s.name] ?? 'civic'),
  },
  {
    id: 'l2', name: 'Glaze Line', colour: '#86c5da', path: L2, stations: l2s,
    tss: tssAt(l2s, [0, 2, 4, 6, 8, 9], (s) => ({ Northgate: 'northgate', Linden: 'northgate', Cathedral: 'civic', Infirmary: 'civic', Harbourside: 'harbour', 'Pier Head': 'harbour' })[s.name] ?? 'civic'),
  },
];


export const MERIDIA_CLIMATE: Climate = {
  summer: { tmax: 35, tmin: 27, dec: 20, label: 'Pre-monsoon summer' },
  monsoon: { tmax: 31.5, tmin: 26.5, dec: 15, label: 'Monsoon' },
  winter: { tmax: 25, tmin: 13.5, dec: -20, label: 'Dry winter' },
};

const LOT: Record<Kind, number> = { res: 34, com: 44, ind: 80, inst: 64 };
const FLOOR = 3.3;
const wet = (x: number, z: number, margin = 0) => z > coastZ(x) - margin || Math.abs(x - riverX(z)) < RIVER_W / 2 + margin;
function distToLines(x: number, z: number) {
  let best = 1e9;
  for (const l of LINES) {
    for (let i = 1; i < l.path.length; i++) {
      const [ax, az] = l.path[i - 1], [bx, bz] = l.path[i];
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
    }
  }
  return best;
}

let cached: CityData | null = null;

export function buildMeridia(): CityData {
  if (cached) return cached;
  const R = rng(1121);
  const buildings: Building[] = [];
  const streets: Street[] = [];
  DISTRICTS.forEach((d, di) => {
    const [x0, z0, x1, z1] = d.rect;
    const B = d.block;
    const mixes = Object.entries(d.mix) as [Kind, number][];
    const pick = () => {
      let r = R();
      for (const [k, w] of mixes) { if ((r -= w) <= 0) return k; }
      return mixes[0][0];
    };
    // streets on the block grid, arterials every fourth line
    const nx = Math.floor((x1 - x0) / B), nz = Math.floor((z1 - z0) / B);
    for (let i = 0; i <= nx; i++) streets.push({ pts: [[x0 + i * B, z0], [x0 + i * B, z1]], major: i % 4 === 0 });
    for (let j = 0; j <= nz; j++) streets.push({ pts: [[x0, z0 + j * B], [x1, z0 + j * B]], major: j % 4 === 0 });
    // central business district: towers cluster near the harbour interchange
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const bx = x0 + i * B, bz = z0 + j * B;
        const road = (i % 4 === 0 ? 14 : 7) + 4;
        const inner = B - road * 2;
        if (inner < 14) continue;
        if (R() < 0.05) continue; // parks and squares
        const kind0 = pick();
        const per = Math.max(1, Math.round(inner / (LOT[kind0] * (kind0 === 'res' && d.floors[1] > 15 ? 1.7 : 1))));
        const lot = inner / per;
        for (let a = 0; a < per; a++) {
          for (let b = 0; b < per; b++) {
            const kind = per > 1 && R() < 0.25 ? pick() : kind0;
            const x = bx + road + lot * (a + 0.5), z = bz + road + lot * (b + 0.5);
            if (wet(x, z, 45)) continue;
            if (distToLines(x, z) < 46) continue; // the viaduct runs down a wide avenue
            // edges of suburbs thin out
            const ex = Math.min(x - x0, x1 - x) / (x1 - x0), ez = Math.min(z - z0, z1 - z) / (z1 - z0);
            if (d.floors[1] <= 5 && Math.min(ex, ez) < 0.08 && R() < 0.5) continue;
            const fill = kind === 'ind' ? 0.85 : kind === 'res' ? 0.62 + R() * 0.2 : 0.72 + R() * 0.18;
            let w = lot * fill, dd = lot * fill * (0.7 + R() * 0.3);
            const [f0, f1] = d.floors;
            let floors: number;
            if (kind === 'ind') floors = 0;
            else if (d.id === 'cbd') {
              // taller towards the waterfront centre
              const k = Math.exp(-((x - cx) ** 2 + (z - cz - 600) ** 2) / 2.2e6);
              floors = Math.round(f0 + (f1 - f0) * Math.pow(R(), 1.6) * (0.35 + 0.65 * k));
              if (kind === 'res') floors = Math.round(floors * 0.7);
            } else floors = Math.round(f0 + (f1 - f0) * Math.pow(R(), kind === 'inst' ? 1.2 : 1.8));
            let h = kind === 'ind' ? 7 + R() * 9 : Math.max(1, floors) * FLOOR + 1.2;
            if (kind === 'ind') { w = lot * (0.8 + R() * 0.15); dd = lot * (0.5 + R() * 0.4); }
            if (kind === 'inst') { w *= 1.1; h = Math.max(h, 12); }
            const rot = R() < 0.12 ? (R() - 0.5) * 0.2 : 0;
            buildings.push({ x, z, w: Math.min(w, lot * 0.95), d: Math.min(dd, lot * 0.95), h, rot, district: di, kind, seed: R() });
          }
        }
      }
    }
  });
  for (const z of [-2600, 900]) streets.push({ pts: [[-7600, z], [7600, z]], major: true });

  // water, parks and the sea
  const areas: Area[] = [];
  const left: [number, number][] = [], right: [number, number][] = [];
  for (let z = -6400; z <= coastZ(riverX(3000)) + 60; z += 60) { left.push([riverX(z) - RIVER_W / 2, z]); right.push([riverX(z) + RIVER_W / 2, z]); }
  areas.push({ kind: 'water', pts: [...left, ...right.reverse()] });
  const P = rng(77);
  for (const d of DISTRICTS) {
    const [x0, z0, x1, z1] = d.rect;
    for (let i = 0; i < 6; i++) {
      const x = x0 + P() * (x1 - x0), z = z0 + P() * (z1 - z0), w = 40 + P() * 120, h = 40 + P() * 90;
      if (!wet(x, z, 60)) areas.push({ kind: 'park', pts: [[x, z], [x + w, z], [x + w, z + h], [x, z + h]] });
    }
  }
  const sea: [number, number][] = [];
  for (let x = -14000; x <= 14000; x += 100) sea.push([x, coastZ(x)]);
  sea.push([60000, coastZ(14000)], [60000, 60000], [-60000, 60000], [-60000, coastZ(-14000)]);

  // district raster
  const bounds: [number, number, number, number] = [-8000, -6200, 8000, 4600];
  const nx = 320, nz = Math.round((nx * (bounds[3] - bounds[1])) / (bounds[2] - bounds[0]));
  const data = new Uint8Array(nx * nz).fill(255);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = bounds[0] + ((i + 0.5) / nx) * (bounds[2] - bounds[0]), z = bounds[1] + ((j + 0.5) / nz) * (bounds[3] - bounds[1]);
    const k = DISTRICTS.findIndex((d) => x > d.rect[0] && x < d.rect[2] && z > d.rect[1] && z < d.rect[3]);
    if (k >= 0 && !wet(x, z)) data[j * nx + i] = k;
  }

  cached = {
    id: 'meridia', name: 'Meridia', country: 'Prototype city', kind: 'prototype', lat: 23.4, bounds,
    population: DISTRICTS.reduce((a, d) => a + d.pop, 0),
    notes: ['Meridia is fictional. Its layout, people and loads are invented, calibrated to published figures for hot, dense Asian cities.', 'It is the test bench: every model is built here first, then applied to real cities.', 'It has 350 MW of rooftop solar, an illustrative figure.'],
    climate: MERIDIA_CLIMATE,
    demand: { acShare: 0.42, resBase: 0.07, resAct: 0.165, scale: 1, rooftopMW: 350 },
    metro: { voltage: 1500, E: 1650, capacity: 1950, vmax: 22.2, peakHeadway: 180, tssRating: 5, interchange: 'Civic Centre' },
    districts: DISTRICTS.map((d) => {
      const [x0, z0, x1, z1] = d.rect;
      const area = ((x1 - x0) * (z1 - z0)) / 1e6;
      return { id: d.id, name: d.name, pop: d.pop, comM2: d.comM2, indMW: d.indMW, instMW: d.instMW, streetKm: area * (2000 / d.block) * 0.8, sub: d.sub, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
    }),
    subs: GRID_SUBS,
    lines: LINES,
    buildings, streets, areas, sea,
    cells: { nx, nz, data },
    ground: '#6f7556',
    hospital: { name: 'Meridia General Infirmary', beds: 620, peakMW: 3.1, district: 'civic', x: 300, z: -1500, source: 'Fictional, sized like a large teaching hospital in a hot city.' },
    view: { city: [4300, 3300, 8200, -200, 0, 400], metro: [900, 420, 900, -150, 0, -420] },
  };
  return cached;
}

export { polyLength };
