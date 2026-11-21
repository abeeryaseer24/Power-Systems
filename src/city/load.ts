// Load a city: the prototype is generated in code, real cities come from
// public/data/cities/<id>.json (metadata, districts, metro, areas) plus
// <id>.bin (buildings, streets, district raster), written by
// scripts/osm/city-build.mjs.
//
// .bin layout, little-endian:
//   buildings: n x 14 bytes  int16 x/2, int16 z/2, uint16 w*4, uint16 d*4, uint16 h*4, int8 rot*127/pi, uint8 district, uint8 kind, uint8 pad
//   streets:   per street uint16 (n | major << 15), then n x (int16 x/2, int16 z/2)
//   cells:     nx*nz uint8

import type { Building, CityData, Kind, Street } from './types';
import { cityLoad, LOSS_FRACTION, solarOut } from './demand';

export type CityIndexEntry = { id: string; name: string; country: string; kind: 'prototype' | 'real'; population: number; lines: number; districts: number; blurb: string };

const KINDS: Kind[] = ['res', 'com', 'ind', 'inst'];

export async function loadCity(id: string): Promise<CityData> {
  if (id === 'meridia') return (await import('./meridia')).buildMeridia();
  const [meta, bin] = await Promise.all([
    fetch(`/data/cities/${id}.json`).then((r) => { if (!r.ok) throw new Error(`no city ${id}`); return r.json(); }),
    fetch(`/data/cities/${id}.bin`).then((r) => r.arrayBuffer()),
  ]);
  const dv = new DataView(bin);
  let o = 0;
  const buildings: Building[] = new Array(meta.counts.buildings);
  for (let i = 0; i < meta.counts.buildings; i++, o += 14) {
    buildings[i] = {
      x: dv.getInt16(o, true) * 2, z: dv.getInt16(o + 2, true) * 2,
      w: dv.getUint16(o + 4, true) / 4, d: dv.getUint16(o + 6, true) / 4, h: dv.getUint16(o + 8, true) / 4,
      rot: (dv.getInt8(o + 10) * Math.PI) / 127, district: dv.getUint8(o + 11), kind: KINDS[dv.getUint8(o + 12)] ?? 'res',
      seed: ((i * 2654435761) >>> 0) / 4294967296,
    };
  }
  const streets: Street[] = [];
  for (let i = 0; i < meta.counts.streets; i++) {
    const head = dv.getUint16(o, true); o += 2;
    const n = head & 0x7fff, major = !!(head >> 15);
    const pts: [number, number][] = new Array(n);
    for (let k = 0; k < n; k++, o += 4) pts[k] = [dv.getInt16(o, true) * 2, dv.getInt16(o + 2, true) * 2];
    streets.push({ pts, major });
  }
  const { nx, nz } = meta.cells;
  const data = new Uint8Array(bin, o, nx * nz);
  const city = { ...meta, buildings, streets, cells: { nx, nz, data } } as CityData;
  calibrate(city);
  return city;
}

/** Fit the demand scale so a summer weekday peaks at the published figure. */
function calibrate(c: CityData) {
  const T = c.demand.targetPeak;
  if (!T) return;
  const inp = { season: (c.demand.peakSeason ?? 'summer'), day: 'weekday' as const, heat: 0 };
  for (let it = 0; it < 3; it++) {
    let best = 0, bh = 0;
    for (let m = 0; m < 1440; m += 10) {
      const l = cityLoad(c, m / 60, inp);
      const t = l.res + l.com + l.ind + l.inst + l.light - solarOut(c, m / 60, inp);
      if (t > best) { best = t; bh = m / 60; }
    }
    const l = cityLoad(c, bh, inp);
    // loads the other models add at the evening peak: water pumping, EV charging (8 % of cars) and the metro
    const water = (c.population * 0.15 * 0.35 * 1.6) / 24 / 1000;
    const ev = (c.population * 0.18 * 0.08 * 38 * 0.17 * 0.146) / 1000;
    const metro = c.lines.length * 12;
    const scaled = l.res + l.com, rest = l.ind + l.inst + l.light - solarOut(c, bh, inp) + water + ev + metro;
    c.demand.scale *= Math.max(0.05, (T / (1 + LOSS_FRACTION) - rest) / scaled);
  }
}

export async function cityIndex(): Promise<CityIndexEntry[]> {
  const { buildMeridia } = await import('./meridia');
  const m = buildMeridia();
  const proto: CityIndexEntry = { id: 'meridia', name: m.name, country: m.country, kind: 'prototype', population: m.population, lines: m.lines.length, districts: m.districts.length, blurb: 'Fictional test bench. Every model is built here first, then applied to real cities.' };
  try {
    const real: CityIndexEntry[] = await fetch('/data/cities/index.json').then((r) => r.json());
    return [proto, ...real];
  } catch {
    return [proto];
  }
}
