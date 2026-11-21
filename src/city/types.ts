// The data every city model runs on. A prototype city (Meridia) is generated
// in code; a real city is built from OpenStreetMap by scripts/osm/city-build.mjs
// and loaded from public/data/cities/<id>.json + .bin.

export type Kind = 'res' | 'com' | 'ind' | 'inst';
export type Season = 'summer' | 'monsoon' | 'winter';

export type District = {
  id: string;
  name: string;
  pop: number; // residents
  comM2: number; // commercial floor area, m²
  indMW: number; // industrial base load
  instMW: number; // hospitals, universities
  streetKm: number; // lit street length
  sub: string; // grid substation feeding it
  cx: number; // label / camera centre
  cz: number;
};

export type GridSub = { id: string; name: string; x: number; z: number };
export type Station = { name: string; s: number };
export type MetroLine = {
  id: string;
  name: string;
  colour: string;
  path: [number, number][];
  stations: Station[];
  tss: { name: string; s: number; sub: string; modelled?: boolean }[];
};

export type Building = { x: number; z: number; w: number; d: number; h: number; rot: number; district: number; kind: Kind; seed: number };
export type Street = { pts: [number, number][]; major: boolean };
export type Area = { kind: 'water' | 'park' | 'industrial' | 'commercial' | 'institution' | 'beach'; pts: [number, number][] };

export type Climate = Record<Season, { tmax: number; tmin: number; dec: number; label: string }>;

export type DemandParams = {
  acShare: number; // households with an AC unit
  resBase: number; // kW per person, always on
  resAct: number; // kW per person at full evening activity
  scale: number; // calibration factor on the bottom-up total
  targetPeak?: number; // if set, scale is fitted so a summer weekday peaks at this, MW
};

export type MetroParams = {
  voltage: number; // nominal DC voltage
  E: number; // rectifier no-load voltage
  capacity: number; // passengers per train
  vmax: number; // m/s
  peakHeadway: number; // s
  tssRating: number; // MW
  interchange?: string; // station with longer dwell
  service?: [number, number]; // first and last departure, hours
  peaks?: [number, number][]; // weekday peak windows, hours
  offpeak?: number; // midday headway, s
};


export type CityData = {
  id: string;
  name: string;
  country: string;
  kind: 'prototype' | 'real';
  lat: number;
  bounds: [number, number, number, number]; // x0, z0, x1, z1 in metres
  population: number;
  notes: string[]; // sources and honest caveats
  climate: Climate;
  demand: DemandParams;
  metro: MetroParams;
  districts: District[];
  subs: GridSub[];
  lines: MetroLine[];
  buildings: Building[];
  streets: Street[];
  areas: Area[];
  /** district index per cell over bounds (255 = none), for street lighting at night */
  cells: { nx: number; nz: number; data: Uint8Array };
  ground: string; // base land colour
  sea?: [number, number][]; // optional sea polygon
  view: { city: [number, number, number, number, number, number]; metro: [number, number, number, number, number, number] }; // camera pos + target
};

export function polyLength(p: [number, number][]) {
  let L = 0;
  for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return L;
}

/** Point and unit tangent at chainage s along a polyline. */
export function along(path: [number, number][], s: number): { x: number; z: number; tx: number; tz: number } {
  let rem = Math.max(0, s);
  for (let i = 1; i < path.length; i++) {
    const [x0, z0] = path[i - 1], [x1, z1] = path[i];
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 1e-6) continue;
    if (rem <= L || i === path.length - 1) {
      const t = Math.min(1, rem / L);
      return { x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, tx: (x1 - x0) / L, tz: (z1 - z0) / L };
    }
    rem -= L;
  }
  const [x, z] = path[path.length - 1];
  return { x, z, tx: 1, tz: 0 };
}

/** District raster lookup. */
export function districtAt(c: CityData, x: number, z: number) {
  const [x0, z0, x1, z1] = c.bounds;
  const i = Math.floor(((x - x0) / (x1 - x0)) * c.cells.nx), j = Math.floor(((z - z0) / (z1 - z0)) * c.cells.nz);
  if (i < 0 || j < 0 || i >= c.cells.nx || j >= c.cells.nz) return 255;
  return c.cells.data[j * c.cells.nx + i];
}
