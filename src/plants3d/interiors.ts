import * as THREE from 'three';
import { Kit, V } from './kit';

// What the cutaway reveals. Each builder returns a group in the containment's
// local frame (y = 0 at grade) plus labels the engine pins on screen.

export type Label = { text: string; obj: THREE.Object3D; at: THREE.Vector3 };

function pipe(k: Kit, pts: THREE.Vector3[], r: number, mat: THREE.Material, parent: THREE.Object3D) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(12, pts.length * 10), r, 12), mat);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function vessel(k: Kit, parent: THREE.Object3D, x: number, y: number, z: number, r: number, h: number, mat: THREE.Material, horizontal = false) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32), mat);
  const capA = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  const capB = capA.clone();
  capA.position.y = h / 2;
  capB.position.y = -h / 2;
  capB.rotation.x = Math.PI;
  g.add(body, capA, capB);
  g.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  if (horizontal) g.rotation.z = Math.PI / 2;
  return g;
}

function floor(k: Kit, parent: THREE.Object3D, y: number, r: number, hole = 0) {
  const g = hole > 0 ? new THREE.RingGeometry(hole, r, 64) : new THREE.CircleGeometry(r, 64);
  const m = new THREE.Mesh(g, k.concrete('#8f8c85', 20, 23));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.receiveShadow = true;
  parent.add(m);
  const edge = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 64, 1, true), k.concrete('#7b7871', 20, 23));
  edge.position.y = y - 0.5;
  parent.add(edge);
}

function polarCrane(k: Kit, parent: THREE.Object3D, y: number, r: number) {
  const yel = k.plain('#d9a31f', 0.55, 0.3);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r - 1, 0.6, 6, 64), k.steel('#5c6366'));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = y;
  parent.add(ring);
  for (const s of [-1.5, 1.5]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2 * r - 2.5, 1.8, 1.2), yel);
    b.position.set(0, y + 0.6, s);
    b.castShadow = true;
    parent.add(b);
  }
  const trolley = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 5), yel);
  trolley.position.set(r * 0.25, y + 1.8, 0);
  parent.add(trolley);
}

/** Blue Cherenkov glow at the core: what an operator sees looking into a flooded vessel. */
function cherenkov(k: Kit, parent: THREE.Object3D, y: number, r: number, h: number) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.55, 2.2), transparent: true, opacity: 0.85 }));
  m.position.y = y;
  parent.add(m);
}

/** Babcock & Wilcox 2-loop PWR, as at TMI: once-through steam generators and candy-cane hot legs. */
export function pwrBW(k: Kit, labels: Label[]) {
  const g = new THREE.Group();
  const st = k.steel('#8b9296'), pale = k.plain('#d8d4ca', 0.5, 0.3), hot = k.plain('#b6503a', 0.5, 0.4), cold = k.plain('#3f6f8f', 0.5, 0.4);
  floor(k, g, 0.2, 19.5);
  floor(k, g, 22, 19, 7);
  const rpv = vessel(k, g, 0, 11, 0, 2.4, 10, st);
  cherenkov(k, g, 9.5, 1.7, 3.6);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 4, 6), st);
  for (let i = 0; i < 12; i++) { const c = head.clone(); c.position.set(Math.cos(i) * 1.4, 18.5, Math.sin(i) * 1.4); g.add(c); }
  for (const s of [-1, 1]) {
    vessel(k, g, s * 10, 15, 0, 1.9, 20, pale);
    // hot leg: up out of the vessel, over the top, down into the SG head
    pipe(k, [V(s * 2.4, 13, 0), V(s * 5, 13.5, 0), V(s * 7, 28, 0), V(s * 9, 29.5, 0), V(s * 10, 26.8, 0)], 0.6, hot, g);
    for (const z of [-1.4, 1.4]) {
      pipe(k, [V(s * 10, 4, z), V(s * 7, 3, z * 2.4), V(s * 5, 3.2, z * 3), V(s * 2.2, 9, z * 0.9)], 0.45, cold, g);
      vessel(k, g, s * 6.5, 4.5, z * 3, 0.9, 2.6, k.steel('#4d6b7a'));
    }
  }
  const prz = vessel(k, g, 0, 17, 9, 1.3, 9, pale);
  pipe(k, [V(-10, 6, 1.5), V(-5, 6, 8), V(0, 11.5, 9)], 0.25, hot, g);
  // PORV line to the reactor coolant drain tank
  pipe(k, [V(0, 23, 9), V(0, 24.5, 11), V(4, 24.5, 12), V(6, 3, 12)], 0.15, k.plain('#e04a3a', 0.4), g);
  vessel(k, g, 7, 1.6, 12, 1.2, 4, k.steel('#5b6466'), true);
  polarCrane(k, g, 44, 20);
  labels.push(
    { text: 'Reactor pressure vessel', obj: rpv, at: V(0, 2, 2.5) },
    { text: 'Once-through steam generator', obj: g, at: V(10, 26, 2) },
    { text: 'Pressurizer', obj: prz, at: V(0, 4, 1.4) },
    { text: 'PORV, stuck open 28 Mar 1979', obj: g, at: V(2, 24.5, 11.5) },
    { text: 'Coolant drain tank', obj: g, at: V(7, 3, 12) },
  );
  return g;
}

/** VVER-1200 (AES-2006): four horizontal steam generators and a core catcher. */
export function vver1200(k: Kit, labels: Label[]) {
  const g = new THREE.Group();
  const st = k.steel('#8b9296'), pale = k.plain('#dcd8ce', 0.5, 0.3), hot = k.plain('#b6503a', 0.5, 0.4), cold = k.plain('#3f6f8f', 0.5, 0.4);
  floor(k, g, 0.2, 21);
  floor(k, g, 26, 21, 6.5);
  // core catcher: a sacrificial crucible under the vessel to hold a molten core
  const cc = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 2.5, 4, 32, 1, true), k.plain('#6d5b4d', 0.8, 0.2));
  cc.position.y = 2.5;
  (cc.material as THREE.Material).side = THREE.DoubleSide;
  g.add(cc);
  const rpv = vessel(k, g, 0, 13, 0, 2.3, 11, st);
  cherenkov(k, g, 11.5, 1.6, 3.6);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const cx = Math.cos(a) * 12, cz = Math.sin(a) * 12;
    const sg = vessel(k, g, cx, 16, cz, 2.1, 11, pale, true);
    sg.rotation.y = -a + Math.PI / 2;
    pipe(k, [V(Math.cos(a) * 2.3, 15, Math.sin(a) * 2.3), V(Math.cos(a) * 6, 14.5, Math.sin(a) * 6), V(cx - Math.cos(a) * 1.5, 14.2, cz - Math.sin(a) * 1.5)], 0.55, hot, g);
    const b = a + 0.45;
    const pump = vessel(k, g, Math.cos(b) * 10, 9, Math.sin(b) * 10, 1.1, 3.4, k.steel('#4d6b7a'));
    pipe(k, [V(cx, 13.8, cz), V(Math.cos(b) * 10, 11, Math.sin(b) * 10)], 0.45, cold, g);
    pipe(k, [V(Math.cos(b) * 10, 7.5, Math.sin(b) * 10), V(Math.cos(b) * 5, 9, Math.sin(b) * 5), V(Math.cos(a) * 2.2, 11.5, Math.sin(a) * 2.2)], 0.45, cold, g);
    if (i === 0) labels.push({ text: 'Reactor coolant pump', obj: pump, at: V(0, 2.5, 1.2) });
  }
  const prz = vessel(k, g, -4, 20, -9, 1.4, 11, pale);
  polarCrane(k, g, 48, 21.5);
  labels.push(
    { text: 'Reactor pressure vessel', obj: rpv, at: V(0, -2, 2.5) },
    { text: 'Horizontal steam generator', obj: g, at: V(8.5, 18.5, 8.5) },
    { text: 'Pressurizer', obj: prz, at: V(0, 6, 1.5) },
    { text: 'Core catcher', obj: g, at: V(0, 2.5, 4.3) },
    { text: 'Polar crane', obj: g, at: V(0, 50, 0) },
  );
  return g;
}

/** GE BWR/3 in a Mark I containment, as at Fukushima Daiichi units 1 to 5. */
export function bwrMarkI(k: Kit, labels: Label[], s = 1) {
  const g = new THREE.Group();
  const st = k.steel('#7f878a'), dw = k.plain('#9da6a2', 0.5, 0.5);
  // inverted light bulb: sphere, neck, bolted head
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 20; i++) { const a = -Math.PI / 2 + (i / 20) * Math.PI * 0.82; pts.push(new THREE.Vector2(10 * Math.cos(a), 18 + 10 * Math.sin(a))); }
  pts.push(new THREE.Vector2(5.2, 31), new THREE.Vector2(5.2, 34), new THREE.Vector2(4.2, 35.5), new THREE.Vector2(0.01, 36.5));
  const bulbMat = dw.clone();
  bulbMat.transparent = true;
  bulbMat.opacity = 0.45;
  bulbMat.side = THREE.DoubleSide;
  bulbMat.depthWrite = false;
  const bulb = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), bulbMat);
  g.add(bulb);
  const rpv = vessel(k, g, 0, 21, 0, 3, 17, st);
  cherenkov(k, g, 16.5, 2.2, 4);
  // suppression chamber: the torus, half full of water
  const torus = new THREE.Mesh(new THREE.TorusGeometry(17, 4.2, 18, 64), dw);
  torus.rotation.x = Math.PI / 2;
  torus.position.y = 5;
  torus.castShadow = true;
  g.add(torus);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    pipe(k, [V(Math.cos(a) * 9.4, 12, Math.sin(a) * 9.4), V(Math.cos(a) * 13, 8.5, Math.sin(a) * 13), V(Math.cos(a) * 16.4, 6.5, Math.sin(a) * 16.4)], 0.9, dw, g);
  }
  for (const sx of [-1, 1]) pipe(k, [V(sx * 3, 15, 0), V(sx * 7, 13, 2), V(sx * 7, 9, 5), V(sx * 3, 11, 2.5)], 0.45, k.plain('#3f6f8f', 0.5, 0.4), g);
  // refuelling floor with the spent fuel pool beside the reactor well
  const fl = new THREE.Mesh(new THREE.BoxGeometry(40 * s, 1.2, 40 * s), k.concrete('#8f8c85', 20, 23));
  fl.position.y = 38;
  g.add(fl);
  const pool = new THREE.Mesh(new THREE.BoxGeometry(10, 0.3, 12), new THREE.MeshStandardMaterial({ color: '#1c6f9a', emissive: '#0f4e8a', emissiveIntensity: 0.6, roughness: 0.05 }));
  pool.position.set(11, 38.7, 0);
  g.add(pool);
  const crane = new THREE.Mesh(new THREE.BoxGeometry(40 * s, 1.6, 2), k.plain('#d9a31f', 0.55, 0.3));
  crane.position.set(0, 46, 6);
  g.add(crane);
  labels.push(
    { text: 'Reactor pressure vessel', obj: rpv, at: V(0, 4, 3.2) },
    { text: 'Drywell ("light bulb")', obj: g, at: V(-9, 22, 4) },
    { text: 'Suppression chamber (torus)', obj: g, at: V(0, 5, 21) },
    { text: 'Spent fuel pool', obj: g, at: V(11, 39.5, 0) },
  );
  return g;
}

/**
 * RBMK-1000 reactor hall: the graphite stack under the "Elena" upper shield,
 * whose 1,661 channel caps make the famous floor; drum separators either side.
 */
export function rbmk(k: Kit, labels: Label[], ruined = false) {
  const g = new THREE.Group();
  const st = k.steel('#7c8487');
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 7, 48), k.plain('#2b2b2c', 0.9, 0.1));
  stack.position.y = 12;
  g.add(stack);
  cherenkov(k, g, 12, 6.6, 6.4);
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 2, 48), st);
  lower.position.y = 7.5;
  g.add(lower);
  const elena = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 3, 64), st);
  elena.add(disc);
  const capG = new THREE.BoxGeometry(0.28, 0.12, 0.28);
  const caps = new THREE.InstancedMesh(capG, k.plain('#c2b9a4', 0.5, 0.2), 1700);
  let n = 0;
  const pitch = 0.32;
  for (let i = -22; i <= 22; i++) for (let j = -22; j <= 22; j++) {
    const x = i * pitch, z = j * pitch;
    if (x * x + z * z > 6.9 * 6.9 || n >= 1700) continue;
    caps.setMatrixAt(n++, new THREE.Matrix4().makeTranslation(x, 1.56, z));
  }
  caps.count = n;
  elena.add(caps);
  elena.position.y = 17;
  g.add(elena);
  if (ruined) {
    // the upper shield was thrown up and came down on edge, at about 15 degrees off vertical
    elena.rotation.x = 1.3;
    elena.position.set(0, 18, 2);
    stack.scale.y = 0.4;
    stack.position.y = 9;
  } else {
    const hall = new THREE.Mesh(new THREE.BoxGeometry(48, 0.8, 30), k.concrete('#8a8378', 16, 23));
    hall.position.y = 18.4;
    hall.receiveShadow = true;
    // cut the reactor disc out of the hall floor
    hall.position.y = 18.45;
    g.add(hall);
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 8.6, 0.9, 64), k.plain('#5d5a55'));
    hole.position.y = 18.5;
    g.add(hole);
    caps.position.y = 1.9;
    // refuelling machine on its bridge
    const yel = k.plain('#cf9b26', 0.55, 0.3);
    for (const s of [-6, 6]) { const b = new THREE.Mesh(new THREE.BoxGeometry(46, 2, 1.5), yel); b.position.set(0, 34, s); g.add(b); }
    const rm = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 12, 16), k.plain('#e1d9c4', 0.5, 0.3));
    rm.position.set(-3, 27, 0);
    g.add(rm);
    labels.push({ text: 'Refuelling machine', obj: rm, at: V(0, 6.5, 1.6) });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const d = vessel(k, g, sx * 17, 24, sz * 5, 1.4, 26, k.plain('#c9c4b6', 0.55, 0.3), true);
    d.rotation.y = Math.PI / 2;
    for (let i = 0; i < 6; i++) pipe(k, [V(sx * 6, 19.2, sz * (1 + i * 0.6)), V(sx * 11, 22, sz * (1.5 + i * 1.3)), V(sx * 16, 23, sz * (2 + i * 1.6))], 0.12, k.steel('#8a8f8f'), g);
  }
  labels.push(
    { text: ruined ? 'Upper shield "Elena", on edge' : 'Upper shield "Elena": 1,661 channels', obj: elena, at: V(0, 2, 8.6) },
    { text: 'Graphite stack', obj: stack, at: V(0, 0, 7.2) },
    { text: 'Drum separator', obj: g, at: V(17, 26, 6.4) },
  );
  return g;
}
