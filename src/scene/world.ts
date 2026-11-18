// Shared geography of Halvern: coastline, terrain, and where things sit.
import { BUSES, DISTRICTS, PLANTS, type Line } from '../grid/network';

/** Vertical exaggeration for buildings, pylons and plant structures. */
export const V = 3;
/** Scale-up for plant structures so they read on an 80 km map. */
export const S = 4;

export function coastZ(x: number) {
  return 18.5 + 2.5 * Math.sin(x * 0.13) + 1.5 * Math.sin(x * 0.31 + 1);
}

export function terrainY(x: number, z: number) {
  // hills rise to the north behind Glen Dam; flat coastal plain elsewhere
  const north = Math.max(0, Math.min(1, (-z - 13) / 10));
  const n =
    Math.sin(x * 0.21 + 1.3) * Math.cos(z * 0.17) * 0.6 +
    Math.sin(x * 0.07 - z * 0.11) * 0.9 +
    Math.sin(x * 0.53 + z * 0.41) * 0.18;
  const lake = Math.exp(-((x + 7) ** 2 / 30 + (z + 27.5) ** 2 / 9));
  const hills = north * (1.6 + n) * 1.4 - lake * 2.2;
  const sea = z > coastZ(x) ? -0.6 * Math.min(1, (z - coastZ(x)) / 2) : 0;
  return Math.max(hills, -0.3) + sea;
}

export const isSea = (x: number, z: number) => z > coastZ(x) + 0.05;

export const busPos = (id: number) => ({ x: BUSES[id].x, z: BUSES[id].z });

/** Offset plant sites a little from their substation so both read. */
export const PLANT_SITE: Record<string, { x: number; z: number }> = {
  kestrel: { x: 32.5, z: 13 },
  ridgeway: { x: -27, z: -11 },
  harbour: { x: 4.2, z: 15.2 },
  airport: { x: -16.5, z: 16.5 },
  glen: { x: -7, z: -24.3 },
  saltmarsh: { x: 21, z: 29 },
  sunfield: { x: 27, z: -21 },
  bess: { x: 1.6, z: -1.8 },
  westmark: { x: -34.5, z: 6.5 },
};

export const districtIndex = (id: string) => DISTRICTS.findIndex((d) => d.id === id);
export const plantIndex = (id: string) => PLANTS.findIndex((p) => p.id === id);
/** Light-channel index of a plant site (districts occupy 0..6). */
export const plantChannel = (id: string) => DISTRICTS.length + plantIndex(id);
export const CHANNELS = DISTRICTS.length + PLANTS.length;

export function lineEnds(l: Line) {
  return { a: busPos(l.from), b: busPos(l.to) };
}
