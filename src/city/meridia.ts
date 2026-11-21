// Meridia: the first prototype city. A fictional coastal city of 2.7 million
// on a subtropical bay, about 16 km by 12 km. The numbers are illustrative but
// calibrated to published figures for hot, dense Asian cities.
//
// Coordinates are metres: x east, z south (the three.js convention), origin
// near the central interchange. The sea is to the south, a river runs north-south.

export type Kind = 'res' | 'com' | 'ind' | 'inst';

export type District = {
  id: string;
  name: string;
  rect: [number, number, number, number]; // x0, z0, x1, z1
  pop: number; // residents
  comM2: number; // commercial floor area, m²
  indMW: number; // industrial base load
  instMW: number; // hospitals, universities (detailed models come later)
  block: number; // street block size, m
  floors: [number, number]; // typical building height range
  mix: Partial<Record<Kind, number>>; // share of building footprints
  colour: string; // ground tint
  sub: string; // grid substation feeding it
};

export type GridSub = { id: string; name: string; x: number; z: number };

export type Station = { name: string; s: number }; // chainage along the line, m
export type MetroLine = {
  id: string;
  name: string;
  colour: string;
  path: [number, number][]; // plan polyline
  stations: Station[];
  tss: { name: string; s: number; sub: string }[]; // traction substations
};

export const CITY = {
  id: 'meridia',
  name: 'Meridia',
  lat: 23.4,
  population: 0, // filled below
  extent: [-8000, -6200, 8000, 4600] as [number, number, number, number],
};

/** Coastline: land is north of this z. A shallow bay centred on the harbour. */
export const coastZ = (x: number) => 3700 + 520 * Math.cos((x - 600) / 2600) - 260 * Math.sin(x / 1400) * Math.exp(-((x - 4000) ** 2) / 8e6);

/** River centreline x as a function of z (runs from the north hills to the bay). */
export const riverX = (z: number) => -1350 + 260 * Math.sin(z / 1300) + 120 * Math.sin(z / 470);
export const RIVER_W = 170;

export const GRID_SUBS: GridSub[] = [
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

export const DISTRICTS: District[] = [
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
CITY.population = DISTRICTS.reduce((a, d) => a + d.pop, 0);

// ------------------------------------------------------------------ metro

const L1: [number, number][] = [
  [-7000, -1000], [-5600, -820], [-4300, -640], [-3000, -420], [-1700, -300], [-500, -260], [200, -250], [1500, -330], [2800, -520], [4100, -760], [5300, -900], [6500, -820], [7200, -700],
];
const L2: [number, number][] = [
  [-3300, -5700], [-2900, -4600], [-2350, -3500], [-1600, -2400], [-800, -1300], [0, -500], [250, 400], [500, 1300], [800, 2200], [1150, 3000], [1350, 3420],
];

export function polyLength(p: [number, number][]) {
  let L = 0;
  for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return L;
}

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

export const LINES: MetroLine[] = [
  {
    id: 'l1', name: 'Sodium Line', colour: '#ffb04d', path: L1, stations: l1s,
    tss: tssAt(l1s, [0, 2, 4, 6, 8, 10, 12], (s) => ({ University: 'uni', 'Cotton Mills': 'westbank', Riverside: 'westbank', 'Civic Centre': 'civic', Eastfield: 'eastfield', 'Kiln Road': 'works', Saltmarsh: 'works' })[s.name] ?? 'civic'),
  },
  {
    id: 'l2', name: 'Glaze Line', colour: '#86c5da', path: L2, stations: l2s,
    tss: tssAt(l2s, [0, 2, 4, 6, 8, 9], (s) => ({ Northgate: 'northgate', Linden: 'northgate', Cathedral: 'civic', Infirmary: 'civic', Harbourside: 'harbour', 'Pier Head': 'harbour' })[s.name] ?? 'civic'),
  },
];

/** Point and unit tangent at chainage s along a polyline. */
export function along(path: [number, number][], s: number): { x: number; z: number; tx: number; tz: number } {
  let rem = Math.max(0, s);
  for (let i = 1; i < path.length; i++) {
    const [x0, z0] = path[i - 1], [x1, z1] = path[i];
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (rem <= L || i === path.length - 1) {
      const t = Math.min(1, rem / L);
      return { x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, tx: (x1 - x0) / L, tz: (z1 - z0) / L };
    }
    rem -= L;
  }
  const [x, z] = path[path.length - 1];
  return { x, z, tx: 1, tz: 0 };
}

export const districtById = (id: string) => DISTRICTS.find((d) => d.id === id);
export const subById = (id: string) => GRID_SUBS.find((s) => s.id === id);
