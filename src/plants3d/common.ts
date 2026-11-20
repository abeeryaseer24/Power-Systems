import * as THREE from 'three';
import { Kit, V } from './kit';

/** Smoothstep that also works with reversed edges (a > b ramps down). */
export const ss = (x: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Cheap deterministic terrain noise: a few rotated sine octaves. */
export function hills(x: number, z: number, scale = 1) {
  let v = 0, a = 1, f = 1 / 900;
  for (let i = 0; i < 5; i++) {
    const c = Math.cos(i * 1.7), s = Math.sin(i * 1.7);
    const u = (x * c - z * s) * f, w = (x * s + z * c) * f;
    v += a * (Math.sin(u + i) * Math.cos(w * 1.3 - i * 0.7));
    a *= 0.5;
    f *= 2.1;
  }
  return v * scale;
}

/** Turn a kit box into a cutaway: clone its materials so only this building clips. */
export function cutBox(k: Kit, mesh: THREE.Mesh, plane: THREE.Plane, inside: THREE.Object3D, groundY: number) {
  const mats = (mesh.material as THREE.Material[]).map((m) => m.clone());
  mesh.material = mats;
  const uniq = [...new Set(mats)];
  uniq.forEach((m) => { m.side = THREE.DoubleSide; });
  inside.position.set(mesh.position.x, groundY, mesh.position.z);
  inside.rotation.y = mesh.rotation.y;
  inside.visible = false;
  k.root.add(inside);
  k.cutaways.push({ plane, mats: uniq, inside });
}

/** Steel truss bridge spans on piers, e.g. the Hardinge Bridge. */
export function trussBridge(k: Kit, x0: number, x1: number, z: number, deckY: number, spans: number, h = 18) {
  const m = k.steel('#6e6a5e');
  const L = (x1 - x0) / spans;
  for (let i = 0; i < spans; i++) {
    const a = x0 + i * L, b = a + L;
    for (const s of [-5, 5]) {
      // camelback top chord
      const top = (t: number) => deckY + h * (0.7 + 0.3 * Math.sin(Math.PI * t));
      const n = 8;
      for (let j = 0; j < n; j++) {
        const t0 = j / n, t1 = (j + 1) / n;
        k.strut(V(a + L * t0, deckY, z + s), V(a + L * t1, deckY, z + s), 0.8, m, 'truss');
        k.strut(V(a + L * t0, top(t0), z + s), V(a + L * t1, top(t1), z + s), 0.8, m, 'truss');
        k.strut(V(a + L * t0, deckY, z + s), V(a + L * t0, top(t0), z + s), 0.5, m, 'truss');
        k.strut(V(a + L * t0, deckY, z + s), V(a + L * t1, top(t1), z + s), 0.35, m, 'truss');
      }
      k.strut(V(b, deckY, z + s), V(b, top(1), z + s), 0.5, m, 'truss');
    }
    for (let j = 0; j <= 4; j++) k.strut(V(a + (L * j) / 4, deckY + h, z - 5), V(a + (L * j) / 4, deckY + h, z + 5), 0.3, m, 'truss');
    k.mesh(new THREE.BoxGeometry(5, deckY + 12, 12), k.concrete('#8f8a80', 10, 3), b, (deckY - 12) / 2, z);
  }
  k.mesh(new THREE.BoxGeometry(x1 - x0, 1.2, 11), k.plain('#3a3a38', 0.9), (x0 + x1) / 2, deckY, z);
}

/** Apartment blocks on the horizon (Pripyat, Okuma, Ishurdi). */
export function townBlocks(k: Kit, cx: number, cz: number, n: number, spread: number, floors: [number, number], seed = 1) {
  const R = k.R;
  void seed;
  for (let i = 0; i < n; i++) {
    const x = cx + (R() - 0.5) * spread, z = cz + (R() - 0.5) * spread;
    const f = floors[0] + Math.floor(R() * (floors[1] - floors[0]));
    const w = 14 + R() * 50, d = 12 + R() * 4;
    k.box(x, z, w, d, f * 2.9, k.win('#c9c3b5', { cols: 12, rows: 8, lit: 0.35, seed: 2 + (i % 4), glass: '#26323b' }), { rot: R() < 0.5 ? 0 : Math.PI / 2, tile: 23, collide: false });
  }
}
