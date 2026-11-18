// Halvern: a fictional coastal city of ~1.4 million people served by a
// 275 kV transmission ring. Positions are map kilometres (x east, z south).

export type BusId = number;

export interface Bus {
  id: BusId;
  name: string;
  x: number;
  z: number;
}

export interface Line {
  id: string;
  name: string;
  from: BusId;
  to: BusId;
  /** Series reactance, per unit on 100 MVA. */
  x: number;
  /** Continuous thermal rating at 25 °C, MW. */
  rating: number;
}

export type PlantKind =
  | 'nuclear'
  | 'coal'
  | 'ccgt'
  | 'ocgt'
  | 'hydro'
  | 'wind'
  | 'solar'
  | 'battery'
  | 'link';

export interface Plant {
  id: string;
  name: string;
  kind: PlantKind;
  bus: BusId;
  units: number;
  /** Per-unit maximum output, MW (for wind/solar: nameplate). */
  unitMax: number;
  /** Per-unit minimum stable generation while synchronised, MW. Negative = can absorb. */
  unitMin: number;
  /** Ramp rate per unit, MW per minute. */
  ramp: number;
  /** Time from start command to synchronisation, seconds. */
  startTime: number;
  /** Inertia constant H, seconds on unit MVA. 0 for inverter-based plant. */
  H: number;
  /** Governor droop (fraction). 0 = no primary response. */
  droop: number;
  /** Governor / prime-mover lag, seconds. */
  Tg: number;
  /** Short-run marginal cost, € per MWh. */
  cost: number;
  /** CO2 intensity, kg per MWh. */
  co2: number;
  blackStart?: boolean;
  /** Storage energy, MWh (battery, hydro reservoir). */
  energy?: number;
  /** Takes part in automatic generation control by default. */
  agc?: boolean;
}

export type DistrictKind = 'residential' | 'commercial' | 'industrial' | 'mixed';

export interface District {
  id: string;
  name: string;
  bus: BusId;
  kind: DistrictKind;
  /** Peak base demand on a mild weekday, MW. */
  peak: number;
  /** Rooftop solar capacity, MW. */
  rooftop: number;
  /** Sensitivity of demand to temperature, MW per °C above 21 °C. */
  cooling: number;
  /** MW per °C below 14 °C. */
  heating: number;
  /** Visual radius of the built-up area, km. */
  radius: number;
  /** Building height scale for the 3D city. */
  height: number;
}

export const BUSES: Bus[] = [
  { id: 0, name: 'Glen Dam', x: -7, z: -23 },
  { id: 1, name: 'Ridgeway', x: -24, z: -9 },
  { id: 2, name: 'Westmark converter', x: -32, z: 5 },
  { id: 3, name: 'Northgate', x: -5, z: -12 },
  { id: 4, name: 'Hillcrest', x: 10, z: -13 },
  { id: 5, name: 'Sunfield', x: 24, z: -18 },
  { id: 6, name: 'Old Town', x: -13, z: 1 },
  { id: 7, name: 'Central', x: 0, z: 0 },
  { id: 8, name: 'Eastgate', x: 14, z: -1 },
  { id: 9, name: 'Kestrel Point', x: 30, z: 11 },
  { id: 10, name: 'Harbour', x: 2, z: 12 },
  { id: 11, name: 'Airport', x: -19, z: 14 },
  { id: 12, name: 'Saltmarsh', x: 17, z: 15 },
];

export const SLACK_PREFERENCE: BusId[] = [9, 7, 10, 0, 1];

export const LINES: Line[] = [
  { id: 'glen-north', name: 'Glen Dam to Northgate', from: 0, to: 3, x: 0.06, rating: 650 },
  { id: 'ridge-north', name: 'Ridgeway to Northgate', from: 1, to: 3, x: 0.08, rating: 600 },
  { id: 'ridge-old', name: 'Ridgeway to Old Town', from: 1, to: 6, x: 0.07, rating: 700 },
  { id: 'west-old', name: 'Westmark to Old Town', from: 2, to: 6, x: 0.05, rating: 550 },
  { id: 'west-air', name: 'Westmark to Airport', from: 2, to: 11, x: 0.07, rating: 400 },
  { id: 'north-central', name: 'Northgate to Central', from: 3, to: 7, x: 0.04, rating: 900 },
  { id: 'north-hill', name: 'Northgate to Hillcrest', from: 3, to: 4, x: 0.05, rating: 600 },
  { id: 'hill-sun', name: 'Hillcrest to Sunfield', from: 4, to: 5, x: 0.06, rating: 650 },
  { id: 'hill-east', name: 'Hillcrest to Eastgate', from: 4, to: 8, x: 0.05, rating: 600 },
  { id: 'sun-east', name: 'Sunfield to Eastgate', from: 5, to: 8, x: 0.07, rating: 500 },
  { id: 'old-central', name: 'Old Town to Central', from: 6, to: 7, x: 0.03, rating: 900 },
  { id: 'old-air', name: 'Old Town to Airport', from: 6, to: 11, x: 0.05, rating: 500 },
  { id: 'central-east', name: 'Central to Eastgate', from: 7, to: 8, x: 0.03, rating: 900 },
  { id: 'central-harb', name: 'Central to Harbour', from: 7, to: 10, x: 0.03, rating: 1000 },
  { id: 'east-kes', name: 'Eastgate to Kestrel Point', from: 8, to: 9, x: 0.045, rating: 950 },
  { id: 'kes-salt', name: 'Kestrel Point to Saltmarsh', from: 9, to: 12, x: 0.04, rating: 850 },
  { id: 'salt-harb', name: 'Saltmarsh to Harbour', from: 12, to: 10, x: 0.04, rating: 900 },
  { id: 'salt-east', name: 'Saltmarsh to Eastgate', from: 12, to: 8, x: 0.05, rating: 700 },
  { id: 'harb-air', name: 'Harbour to Airport', from: 10, to: 11, x: 0.06, rating: 600 },
];

export const PLANTS: Plant[] = [
  {
    id: 'kestrel', name: 'Kestrel Point nuclear', kind: 'nuclear', bus: 9,
    units: 2, unitMax: 600, unitMin: 540, ramp: 3, startTime: 36 * 3600,
    H: 6, droop: 0, Tg: 10, cost: 11, co2: 0,
  },
  {
    id: 'ridgeway', name: 'Ridgeway coal', kind: 'coal', bus: 1,
    units: 2, unitMax: 400, unitMin: 160, ramp: 8, startTime: 3 * 3600,
    H: 5, droop: 0.05, Tg: 8, cost: 88, co2: 910, agc: true,
  },
  {
    id: 'harbour', name: 'Harbour combined cycle', kind: 'ccgt', bus: 10,
    units: 2, unitMax: 420, unitMin: 190, ramp: 24, startTime: 50 * 60,
    H: 5, droop: 0.04, Tg: 4, cost: 72, co2: 360, agc: true,
  },
  {
    id: 'airport', name: 'Airport peaking turbines', kind: 'ocgt', bus: 11,
    units: 2, unitMax: 120, unitMin: 25, ramp: 60, startTime: 9 * 60,
    H: 3, droop: 0.04, Tg: 2, cost: 165, co2: 560,
  },
  {
    id: 'glen', name: 'Glen Dam pumped hydro', kind: 'hydro', bus: 0,
    units: 4, unitMax: 125, unitMin: -100, ramp: 90, startTime: 100,
    H: 3.5, droop: 0.03, Tg: 3, cost: 45, co2: 0, blackStart: true, energy: 3200, agc: true,
  },
  {
    id: 'saltmarsh', name: 'Saltmarsh offshore wind', kind: 'wind', bus: 12,
    units: 1, unitMax: 900, unitMin: 0, ramp: 300, startTime: 0,
    H: 0, droop: 0, Tg: 1, cost: 0, co2: 0,
  },
  {
    id: 'sunfield', name: 'Sunfield solar', kind: 'solar', bus: 5,
    units: 1, unitMax: 600, unitMin: 0, ramp: 300, startTime: 0,
    H: 0, droop: 0, Tg: 1, cost: 0, co2: 0,
  },
  {
    id: 'bess', name: 'Central battery', kind: 'battery', bus: 7,
    units: 1, unitMax: 250, unitMin: -250, ramp: 3000, startTime: 0,
    H: 0, droop: 0.01, Tg: 0.4, cost: 0, co2: 0, energy: 500,
  },
  {
    id: 'westmark', name: 'Westmark HVDC link', kind: 'link', bus: 2,
    units: 1, unitMax: 500, unitMin: -500, ramp: 50, startTime: 0,
    H: 0, droop: 0, Tg: 2, cost: 120, co2: 300,
  },
];

export const DISTRICTS: District[] = [
  { id: 'northside', name: 'Northside', bus: 3, kind: 'residential', peak: 420, rooftop: 70, cooling: 9, heating: 11, radius: 6, height: 0.5 },
  { id: 'hillcrest', name: 'Hillcrest', bus: 4, kind: 'mixed', peak: 330, rooftop: 60, cooling: 7, heating: 8, radius: 5, height: 0.7 },
  { id: 'oldtown', name: 'Old Town', bus: 6, kind: 'mixed', peak: 380, rooftop: 40, cooling: 8, heating: 9, radius: 5.5, height: 0.6 },
  { id: 'downtown', name: 'Downtown', bus: 7, kind: 'commercial', peak: 560, rooftop: 30, cooling: 16, heating: 7, radius: 4.5, height: 2.6 },
  { id: 'eastside', name: 'Eastside', bus: 8, kind: 'residential', peak: 400, rooftop: 80, cooling: 9, heating: 10, radius: 6, height: 0.55 },
  { id: 'harbourside', name: 'Harbourside', bus: 10, kind: 'industrial', peak: 520, rooftop: 50, cooling: 4, heating: 3, radius: 5, height: 0.9 },
  { id: 'airport', name: 'Airport', bus: 11, kind: 'commercial', peak: 160, rooftop: 30, cooling: 3, heating: 2, radius: 3.5, height: 0.4 },
];

export const F0 = 50;
export const S_BASE = 100;

export const KIND_LABEL: Record<PlantKind, string> = {
  nuclear: 'Nuclear',
  coal: 'Coal',
  ccgt: 'Gas, combined cycle',
  ocgt: 'Gas, peaking',
  hydro: 'Hydro',
  wind: 'Wind',
  solar: 'Solar',
  battery: 'Battery',
  link: 'Import link',
};

export const busById = (id: BusId) => BUSES[id];
