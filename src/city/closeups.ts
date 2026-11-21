// Detailed models built on demand when you "look inside" an asset: a 132/33 kV
// substation yard, a metro traction substation, and a cell site. Procedural,
// from typical layouts and dimensions; labelled parts follow the live model.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type CloseLabel = { text: string; pos: THREE.Vector3; live?: () => string };
export type CloseUp = { group: THREE.Group; labels: CloseLabel[]; update: (s: { load: number; soc?: number; on: boolean; night: number }) => void; cam: THREE.Vector3; at: THREE.Vector3 };

const M = {
  steel: new THREE.MeshStandardMaterial({ color: '#8d969b', roughness: 0.45, metalness: 0.75 }),
  galv: new THREE.MeshStandardMaterial({ color: '#a7aeb0', roughness: 0.5, metalness: 0.6 }),
  tank: new THREE.MeshStandardMaterial({ color: '#5e6a68', roughness: 0.6, metalness: 0.4 }),
  porcelain: new THREE.MeshStandardMaterial({ color: '#7b4a33', roughness: 0.35 }),
  concrete: new THREE.MeshStandardMaterial({ color: '#b5b0a5', roughness: 0.9 }),
  gravel: new THREE.MeshStandardMaterial({ color: '#8f8b82', roughness: 1 }),
  panel: new THREE.MeshStandardMaterial({ color: '#d8d9d4', roughness: 0.5, metalness: 0.2 }),
  dark: new THREE.MeshStandardMaterial({ color: '#2b3034', roughness: 0.6 }),
  cable: new THREE.MeshStandardMaterial({ color: '#1d1f22', roughness: 0.7 }),
  copper: new THREE.MeshStandardMaterial({ color: '#b87333', roughness: 0.35, metalness: 0.9 }),
};

const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; };
const cyl = (r: number, h: number, x: number, y: number, z: number, m: THREE.Material, seg = 12) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m); o.position.set(x, y, z); o.castShadow = true; return o; };

/** A stack of insulator sheds: what makes a bushing or post insulator read as one. */
function insulator(h: number, r: number, x: number, y: number, z: number) {
  const g: THREE.BufferGeometry[] = [];
  const n = Math.max(4, Math.round(h / 0.22));
  for (let i = 0; i < n; i++) { const d = new THREE.CylinderGeometry(r * 1.9, r * 1.9, 0.05, 14); d.translate(0, (i + 0.5) * (h / n), 0); g.push(d); }
  const core = new THREE.CylinderGeometry(r, r, h, 10); core.translate(0, h / 2, 0); g.push(core);
  const o = new THREE.Mesh(mergeGeometries(g), M.porcelain);
  o.position.set(x, y, z);
  return o;
}

function lattice(w: number, h: number, x: number, z: number) {
  const g = new THREE.Group();
  for (const [dx, dz] of [[-w / 2, -w / 2], [w / 2, -w / 2], [-w / 2, w / 2], [w / 2, w / 2]]) g.add(box(0.25, h, 0.25, x + dx, h / 2, z + dz, M.galv));
  for (let y = 2; y < h; y += 2) {
    g.add(box(w, 0.12, 0.12, x, y, z - w / 2, M.galv), box(w, 0.12, 0.12, x, y, z + w / 2, M.galv));
    g.add(box(0.12, 0.12, w, x - w / 2, y, z, M.galv), box(0.12, 0.12, w, x + w / 2, y, z, M.galv));
  }
  return g;
}

/** 132/33 kV air-insulated substation: incoming lines, busbar, breakers, three transformers, 33 kV switchroom. */
export function gridSub(x: number, z: number): CloseUp {
  const g = new THREE.Group();
  g.add(box(150, 0.3, 110, 0, 0.15, 0, M.gravel));
  // fence
  for (const [fx, fz, w, d] of [[0, -55, 150, 0.1], [0, 55, 150, 0.1], [-75, 0, 0.1, 110], [75, 0, 0.1, 110]] as const) g.add(box(w || 0.1, 2.4, d || 0.1, fx, 1.2, fz, new THREE.MeshStandardMaterial({ color: '#9aa', transparent: true, opacity: 0.35 })));
  // 132 kV gantries and incoming bays
  for (const gx of [-50, -15, 20]) {
    g.add(lattice(1.2, 16, gx - 6, -45), lattice(1.2, 16, gx + 6, -45));
    g.add(box(13, 0.6, 0.6, gx, 15.8, -45, M.galv));
    for (const p of [-4, 0, 4]) {
      // breaker (dead-tank SF6), disconnector posts, current transformer
      g.add(box(0.9, 3.5, 0.9, gx + p, 1.75, -32, M.steel), cyl(0.55, 2.8, gx + p, 4.9, -32, M.galv), insulator(2.4, 0.18, gx + p, 6.3, -32));
      g.add(insulator(3, 0.16, gx + p, 3, -22), box(0.3, 3, 0.3, gx + p, 1.5, -22, M.galv));
    }
  }
  // tubular busbar on post insulators
  for (const p of [-4, 0, 4]) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 90, 8), M.galv);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(-15, 7.2, -14 + p * 0.6);
    g.add(bar);
    for (let bx = -55; bx <= 25; bx += 10) g.add(insulator(4, 0.16, bx, 3.2, -14 + p * 0.6), box(0.4, 3.2, 0.4, bx, 1.6, -14 + p * 0.6, M.concrete));
  }
  // transformers with radiators, conservators and bushings, separated by firewalls
  const radiators: THREE.Mesh[] = [];
  for (const [i, tx] of [-45, -15, 15].entries()) {
    g.add(box(1, 0.6, 10, tx, 0.3, 8, M.concrete));
    g.add(box(8, 5.5, 5, tx, 3.3, 8, M.tank));
    const rad = new THREE.Mesh(mergeGeometries(Array.from({ length: 10 }, (_, k) => new THREE.BoxGeometry(0.12, 3.8, 1.6).translate(-2.7 + k * 0.6, 0, 0))), new THREE.MeshStandardMaterial({ color: '#5e6a68', roughness: 0.6, metalness: 0.4, emissive: '#ff6a2a', emissiveIntensity: 0 }));
    rad.position.set(tx, 3.4, 11.4);
    g.add(rad);
    radiators.push(rad);
    const cons = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 5, 12), M.tank);
    cons.rotation.z = Math.PI / 2;
    cons.position.set(tx, 7.8, 6.2);
    g.add(cons);
    for (const p of [-2.4, 0, 2.4]) g.add(insulator(3.2, 0.2, tx + p, 6, 7));
    for (const p of [-1.6, 0, 1.6]) g.add(insulator(1.2, 0.14, tx + p, 6, 9.8));
    if (i < 2) g.add(box(0.5, 8, 8, tx + 15, 4, 8, M.concrete));
  }
  // 33 kV switchroom and control building
  g.add(box(40, 6, 12, -10, 3, 38, M.concrete), box(16, 5, 10, 45, 2.5, 38, M.concrete));
  g.add(box(40.4, 0.4, 12.4, -10, 6.2, 38, M.dark), box(16.4, 0.4, 10.4, 45, 5.2, 38, M.dark));
  g.position.set(x, 0, z);
  const at = (lx: number, ly: number, lz: number) => new THREE.Vector3(x + lx, ly, z + lz);
  return {
    group: g,
    labels: [
      { text: '132 kV incoming lines', pos: at(-15, 17, -45) },
      { text: 'SF6 circuit breakers', pos: at(-50, 7, -32) },
      { text: 'Busbar', pos: at(10, 8.5, -14) },
      { text: 'Power transformers 132/33 kV', pos: at(-15, 10, 8) },
      { text: '33 kV switchroom', pos: at(-10, 7.5, 38) },
      { text: 'Control room', pos: at(45, 6.5, 38) },
    ],
    update: ({ load }) => radiators.forEach((r) => { (r.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.max(0, Math.min(1.5, (load - 0.5) * 1.6)); }),
    cam: at(70, 45, 95), at: at(-10, 2, 0),
  };
}

/** Metro traction substation, one wall cut away: 33 kV in, rectifier transformers and rectifiers, DC breakers out. */
export function tractionSub(x: number, z: number, rot: number): CloseUp {
  const g = new THREE.Group();
  g.add(box(36, 0.4, 20, 0, 0.2, 0, M.concrete));
  // three walls and a roof; the near wall is left off so you can see in
  g.add(box(36, 7, 0.4, 0, 3.5, -10, M.concrete), box(0.4, 7, 20, -18, 3.5, 0, M.concrete), box(0.4, 7, 20, 18, 3.5, 0, M.concrete));
  g.add(box(36.4, 0.4, 20.4, 0, 7.2, 0, new THREE.MeshStandardMaterial({ color: '#444', transparent: true, opacity: 0.25 })));
  for (let i = 0; i < 6; i++) g.add(box(1.6, 2.4, 1, -15 + i * 1.8, 1.4, -8.6, M.panel));
  const rects: THREE.Mesh[] = [];
  for (const sx of [-4, 7]) {
    g.add(box(3.6, 3, 2.6, sx, 1.7, -4, M.tank));
    for (let k = 0; k < 8; k++) g.add(box(0.1, 2.4, 1.4, sx - 1.4 + k * 0.4, 1.6, -2.4, M.tank));
    const r = box(2.8, 2.6, 1.6, sx, 1.5, 2.2, new THREE.MeshStandardMaterial({ color: '#d7d8d2', roughness: 0.5, emissive: '#ffb04d', emissiveIntensity: 0 }));
    g.add(r);
    rects.push(r);
  }
  for (let i = 0; i < 4; i++) g.add(box(1.4, 2.4, 1, 12 + (i % 2) * 1.6, 1.4, -6 + Math.floor(i / 2) * 3, M.panel));
  // DC feeder cables out to the line
  for (const dz of [-1, 1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 30, 6), M.cable); c.rotation.x = Math.PI / 2; c.position.set(16, 0.6, 15 + dz); g.add(c); }
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  const at = (lx: number, ly: number, lz: number) => new THREE.Vector3(lx, ly, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot).add(new THREE.Vector3(x, 0, z));
  return {
    group: g,
    labels: [
      { text: '33 kV switchgear', pos: at(-11, 4, -8.6) },
      { text: 'Rectifier transformers', pos: at(1.5, 4.5, -4) },
      { text: '12-pulse diode rectifiers', pos: at(1.5, 4, 2.2) },
      { text: 'DC feeder breakers', pos: at(13, 4, -4.5) },
      { text: 'DC cables to the overhead line', pos: at(16, 2, 18) },
    ],
    update: ({ load, on }) => rects.forEach((r) => { (r.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? Math.min(1.4, load * 1.2) : 0; }),
    cam: at(0, 16, 34), at: at(0, 2, 0),
  };
}

/** Cell site: monopole with three sector antennas and a dish, and a cabinet open to show its batteries. */
export function cellSite(x: number, z: number, genset: boolean): CloseUp {
  const g = new THREE.Group();
  g.add(box(10, 0.3, 10, 0, 0.15, 0, M.gravel));
  g.add(cyl(0.45, 32, 0, 16, 0, M.galv, 10));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const ant = box(0.35, 2.6, 0.9, Math.cos(a) * 1.2, 29.5, Math.sin(a) * 1.2, M.panel);
    ant.rotation.y = -a;
    g.add(ant);
  }
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 16), M.panel);
  dish.rotation.z = Math.PI / 2;
  dish.position.set(0.6, 26, 0);
  g.add(dish);
  // cabinet with the door left open
  g.add(box(2.2, 2, 1.2, -3, 1.15, 2.5, M.panel));
  g.add(box(0.05, 1.9, 1.1, -4.15, 1.1, 2.5, M.dark));
  const cells: THREE.Mesh[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    const b = box(0.4, 0.42, 0.9, -3.75 + c * 0.45, 0.45 + r * 0.5, 2.5, new THREE.MeshStandardMaterial({ color: '#2d3a30', emissive: '#7fd1a8', emissiveIntensity: 0.3 }));
    g.add(b);
    cells.push(b);
  }
  g.add(box(1.4, 1.2, 0.6, -3, 2.6, 1.8, M.dark));
  if (genset) g.add(box(2.6, 1.6, 1.3, 2.8, 0.95, 3, new THREE.MeshStandardMaterial({ color: '#c8b22f', roughness: 0.6 })));
  g.position.set(x, 0, z);
  const at = (lx: number, ly: number, lz: number) => new THREE.Vector3(x + lx, ly, z + lz);
  return {
    group: g,
    labels: [
      { text: 'Sector antennas (4G / 5G radios)', pos: at(0, 31.5, 0) },
      { text: 'Microwave backhaul dish', pos: at(0.6, 27, 0) },
      { text: 'Battery strings', pos: at(-3.2, 2.2, 3.2) },
      { text: 'Rectifier: AC mains to 48 V DC', pos: at(-3, 3.6, 1.8) },
      ...(genset ? [{ text: 'Standby diesel generator', pos: at(2.8, 2.3, 3) }] : []),
    ],
    update: ({ soc = 1 }) => cells.forEach((b, i) => {
      const m = b.material as THREE.MeshStandardMaterial;
      const lit = i / cells.length < soc;
      m.emissive.set(soc > 0.5 ? '#7fd1a8' : soc > 0.2 ? '#ffb04d' : '#ff5b4f');
      m.emissiveIntensity = lit ? 0.6 : 0.03;
    }),
    cam: at(14, 12, 16), at: at(-1, 6, 1),
  };
}
