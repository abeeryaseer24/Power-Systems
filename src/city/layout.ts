// Procedural city fabric: streets and buildings for each district, generated
// from the district's block size, height range and land-use mix. Seeded, so
// Meridia is the same city on every visit.

import { rng } from '../plants3d/textures';
import { CITY, DISTRICTS, LINES, RIVER_W, coastZ, riverX, type Kind } from './meridia';

export type Building = { x: number; z: number; w: number; d: number; h: number; rot: number; district: number; kind: Kind; seed: number };
export type Street = { x0: number; z0: number; x1: number; z1: number; major: boolean; district: number };

export const KIND_INDEX: Record<Kind, number> = { res: 0, com: 1, ind: 2, inst: 3 };

const LOT: Record<Kind, number> = { res: 34, com: 44, ind: 80, inst: 64 };
const FLOOR = 3.3;

/** True if a point is in the sea or the river (with a margin). */
export function wet(x: number, z: number, margin = 0) {
  return z > coastZ(x) - margin || Math.abs(x - riverX(z)) < RIVER_W / 2 + margin;
}

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

export function generate() {
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
    for (let i = 0; i <= nx; i++) streets.push({ x0: x0 + i * B, z0, x1: x0 + i * B, z1, major: i % 4 === 0, district: di });
    for (let j = 0; j <= nz; j++) streets.push({ x0, z0: z0 + j * B, x1, z1: z0 + j * B, major: j % 4 === 0, district: di });
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
  return { buildings, streets };
}

export { CITY };
