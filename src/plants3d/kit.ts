import * as THREE from 'three';
import type { PropId, PropSpot } from './props';
import { bands, cladding, concrete, glow, ground, rng, roadLines, waterNormal, windows } from './textures';

// The building kit. Units are metres, +y up, north is -z, east is +x.
// Sites call these builders; the Kit collects instances, colliders, light points
// and steam emitters, and the scene engine brings them to life.

export type Emitter = { pos: THREE.Vector3; radius: number; rate: number; base?: number; kind: 'steam' | 'smoke' | 'spray' | 'jet'; tag?: string; dir?: THREE.Vector3 };
export type Collider = { x: number; z: number; hw: number; hd: number; rot: number } | { x: number; z: number; r: number };
export type Job = Collider & { kind: string };
export type Cutaway = { plane: THREE.Plane; mats: THREE.Material[]; inside: THREE.Object3D };

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Box geometry whose UVs are in world metres / tile, so textures keep their scale. */
export function worldBox(w: number, h: number, d: number, tile = 8) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // face order: px nx py ny pz nz, 4 verts each
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
  }
  return g;
}

export class Kit {
  root = new THREE.Group();
  colliders: Collider[] = [];
  /** Construction footprints, in build order, for the time-lapse. */
  jobs: Job[] = [];
  emitters: Emitter[] = [];
  lamps: THREE.Vector3[] = [];
  floods: { pos: THREE.Vector3; r: number }[] = [];
  beacons: THREE.Vector3[] = [];
  uplights: { pos: THREE.Vector3; at: THREE.Vector3 }[] = [];
  props: PropSpot[] = [];
  yards: THREE.Vector3[] = [];

  /** Place a downloaded prop (loaded later, when the viewer is close). */
  prop(id: PropId, x: number, z: number, rot = this.R() * Math.PI * 2, s?: number) {
    this.props.push({ id, x, z, rot, s });
  }

  /** Drums and crates stacked by a doorway: the clutter of a working plant. */
  clutter(x: number, z: number, n = 6) {
    for (let i = 0; i < n; i++) {
      const a = this.R() * 6.28, r = 1 + this.R() * 4;
      this.prop(this.R() < 0.6 ? 'Barrel_01' : 'wooden_crate_02', x + Math.cos(a) * r, z + Math.sin(a) * r);
    }
  }

  /** Jersey barriers in a line, e.g. at a security gate. */
  barriers(x0: number, z0: number, x1: number, z1: number) {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / 3.2), rot = Math.atan2(-(z1 - z0), x1 - x0);
    for (let i = 0; i <= n; i++) this.prop('concrete_road_barrier_02', x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, rot);
  }
  nightMats: { m: THREE.MeshStandardMaterial; k: number }[] = [];
  cutaways: Cutaway[] = [];
  eras = new Map<string, THREE.Group>();
  groundY: (x: number, z: number) => number;
  private inst = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; m: THREE.Matrix4[]; c: THREE.Color[]; shadow: boolean }>();
  private mats = new Map<string, THREE.Material>();
  R = rng(77);

  constructor(groundY: (x: number, z: number) => number = () => 0) {
    this.groundY = groundY;
  }

  // ------------------------------------------------------------------ materials

  concrete(color = '#bab5aa', tile = 24, seed = 3, lifts = 8) {
    return this.memo(`c${color}${tile}${seed}${lifts}`, () => {
      const t = concrete(color, { seed, lifts, ties: lifts < 16 });
      return new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 0.12, roughness: 0.92, metalness: 0 });
    }) as THREE.MeshStandardMaterial;
  }

  clad(color = '#8d969c', seed = 5) {
    return this.memo(`k${color}${seed}`, () => {
      const t = cladding(color, seed);
      return new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 0.15, roughness: 0.55, metalness: 0.35 });
    }) as THREE.MeshStandardMaterial;
  }

  win(wall: string, opts: { cols?: number; rows?: number; lit?: number; seed?: number; glass?: string; band?: boolean } = {}) {
    const key = `w${wall}${JSON.stringify(opts)}`;
    return this.memo(key, () => {
      const t = windows({ cols: opts.cols ?? 8, rows: opts.rows ?? 8, wall, lit: opts.lit, seed: opts.seed, glass: opts.glass, band: opts.band });
      const m = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0, roughness: 0.6, metalness: 0.1 });
      this.nightMats.push({ m, k: 2.2 });
      return m;
    }) as THREE.MeshStandardMaterial;
  }

  plain(color: string, rough = 0.8, metal = 0) {
    return this.memo(`p${color}${rough}${metal}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal })) as THREE.MeshStandardMaterial;
  }

  steel(color = '#6f777c') {
    return this.plain(color, 0.45, 0.7);
  }

  emissive(color: string, k = 3) {
    return this.memo(`e${color}${k}`, () => {
      const m = new THREE.MeshStandardMaterial({ color: '#222', emissive: color, emissiveIntensity: 0 });
      this.nightMats.push({ m, k });
      return m;
    }) as THREE.MeshStandardMaterial;
  }

  private memo(k: string, f: () => THREE.Material) {
    if (!this.mats.has(k)) this.mats.set(k, f());
    return this.mats.get(k)!;
  }

  // ------------------------------------------------------------------ primitives

  add(o: THREE.Object3D, parent: THREE.Object3D = this.root) {
    parent.add(o);
    return o;
  }

  mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0, parent?: THREE.Object3D, shadow = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    this.add(m, parent);
    return m;
  }

  /** A block building. Sides get `side`, the roof gets `roof`. y is ground level. */
  box(x: number, z: number, w: number, d: number, h: number, side: THREE.Material, opts: { roof?: THREE.Material; rot?: number; y?: number; tile?: number; parent?: THREE.Object3D; collide?: boolean; parapet?: boolean } = {}) {
    const roof = opts.roof ?? this.concrete('#8e8a82', 30, 9);
    const y = opts.y ?? this.groundY(x, z);
    const g = worldBox(w, h, d, opts.tile ?? 32);
    const m = this.mesh(g, [side, side, roof, roof, side, side], 0, 0, 0, opts.parent);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = opts.rot ?? 0;
    if (opts.parapet !== false && w > 12 && d > 12) {
      // parapet lip + a few rooftop units, the tell of a real roof
      const lip = this.concrete('#a9a49a', 20, 6);
      const pg = new THREE.BoxGeometry(w + 0.6, 1.1, 0.5);
      const grp = new THREE.Group();
      grp.position.copy(m.position).setY(y + h);
      grp.rotation.y = m.rotation.y;
      this.add(grp, opts.parent);
      for (const s of [-1, 1]) {
        this.mesh(pg, lip, 0, 0.55, s * d / 2, grp, false);
        const sg = new THREE.BoxGeometry(0.5, 1.1, d);
        this.mesh(sg, lip, s * w / 2, 0.55, 0, grp, false);
      }
      const units = Math.min(6, Math.floor((w * d) / 900));
      for (let k = 0; k < units; k++) {
        const ux = (this.R() - 0.5) * (w - 8), uz = (this.R() - 0.5) * (d - 8);
        this.instance('rtu', new THREE.BoxGeometry(1, 1, 1), this.clad('#a3a8aa', 8), new THREE.Matrix4().compose(
          V(ux, 1.2, uz).applyEuler(grp.rotation).add(grp.position), new THREE.Quaternion().setFromEuler(grp.rotation), V(3 + this.R() * 4, 2.4, 2.5 + this.R() * 3)));
      }
    }
    if (opts.collide !== false) this.colliders.push({ x, z, hw: w / 2, hd: d / 2, rot: opts.rot ?? 0 });
    this.jobs.push({ x, z, hw: w / 2 + 1, hd: d / 2 + 1, rot: opts.rot ?? 0, kind: h > 45 ? 'tall' : 'box' });
    return m;
  }

  /** Long hall with a shallow pitched or barrel roof (turbine halls, boiler houses). */
  hall(x: number, z: number, w: number, d: number, h: number, opts: { wall?: THREE.Material; roofKind?: 'pitch' | 'barrel' | 'flat'; roofColor?: string; rot?: number; band?: boolean; parent?: THREE.Object3D } = {}) {
    const wall = opts.wall ?? this.clad('#9aa3a6');
    const grp = new THREE.Group();
    grp.position.set(x, this.groundY(x, z), z);
    grp.rotation.y = opts.rot ?? 0;
    this.add(grp, opts.parent);
    const body = this.mesh(worldBox(w, h, d, 24), [wall, wall, this.plain('#555'), wall, wall, wall], 0, h / 2, 0, grp);
    body.name = 'hall';
    // clerestory window band near the eaves
    if (opts.band !== false) {
      const bm = this.win('#4a5560', { cols: 16, rows: 1, lit: 0.8, band: true, glass: '#2a3a46', seed: 4 });
      const bg = new THREE.PlaneGeometry(w * 0.96, 3.2);
      (bg.attributes.uv as THREE.BufferAttribute).array.forEach((_, i, a) => { if (i % 2 === 0) (a as Float32Array)[i] *= w / 40; });
      for (const s of [-1, 1]) {
        const p = this.mesh(bg, bm, 0, h - 4, s * (d / 2 + 0.05), grp, false);
        if (s < 0) p.rotation.y = Math.PI;
      }
    }
    const rc = opts.roofColor ?? '#6c7174';
    const kind = opts.roofKind ?? 'pitch';
    if (kind === 'barrel') {
      const rg = new THREE.CylinderGeometry(d / 2 / Math.sin(0.5), d / 2 / Math.sin(0.5), w, 32, 1, true, -0.5, 1);
      const r = this.mesh(rg, this.clad(rc, 12), 0, h - (d / 2 / Math.tan(0.5)), 0, grp);
      r.rotation.z = Math.PI / 2;
      r.rotation.x = 0;
      (r.material as THREE.Material).side = THREE.DoubleSide;
    } else if (kind === 'pitch') {
      const rise = d * 0.06;
      const shape = new THREE.Shape([new THREE.Vector2(-d / 2 - 0.4, 0), new THREE.Vector2(0, rise), new THREE.Vector2(d / 2 + 0.4, 0)]);
      const rg = new THREE.ExtrudeGeometry(shape, { depth: w + 0.8, bevelEnabled: false });
      rg.translate(0, 0, -(w + 0.8) / 2);
      const r = this.mesh(rg, this.clad(rc, 12), 0, h, 0, grp);
      r.rotation.y = Math.PI / 2;
    }
    this.colliders.push({ x, z, hw: w / 2, hd: d / 2, rot: opts.rot ?? 0 });
    this.jobs.push({ x, z, hw: w / 2 + 2, hd: d / 2 + 2, rot: opts.rot ?? 0, kind: 'hall' });
    // atmospheric dump / relief valve stacks on the roof: silent until a trip
    for (const s of [-0.3, 0.3]) {
      const p = V(s * w, 0, 0).applyAxisAngle(V(0, 1, 0), opts.rot ?? 0);
      const top = grp.position.y + h + d * 0.06 + 6;
      this.mesh(new THREE.CylinderGeometry(0.8, 0.8, 7, 12), this.steel('#7b8285'), x + p.x, top - 3.5, z + p.z);
      this.emitters.push({ pos: V(x + p.x, top, z + p.z), radius: 1.2, rate: 0, kind: 'jet', tag: 'dump' });
    }
    for (const s of [-1, 1]) {
      const p = V(s * (w / 2 + 6), 0, d * 0.3).applyAxisAngle(V(0, 1, 0), opts.rot ?? 0);
      this.clutter(x + p.x, z + p.z, 5);
    }
    return grp;
  }

  /** Natural-draught hyperbolic cooling tower. */
  coolingTower(x: number, z: number, o: { h: number; rb: number; rt: number; ry?: number; built?: number; steam?: boolean; tag?: string; color?: string; seed?: number }) {
    const y0 = this.groundY(x, z);
    const yT = (o.ry ?? 0.78) * o.h; // throat height
    const legH = o.h * 0.07;
    const rTh = o.rt * 0.92; // throat radius a touch under the outlet
    const b = yT / Math.sqrt((o.rb / rTh) ** 2 - 1);
    const r = (y: number) => rTh * Math.sqrt(1 + ((y - yT) / b) ** 2);
    const top = o.h * (o.built ?? 1);
    const pts: THREE.Vector2[] = [];
    const N = 48;
    for (let i = 0; i <= N; i++) {
      const y = legH + (top - legH) * (i / N);
      pts.push(new THREE.Vector2(r(y), y));
    }
    const grp = new THREE.Group();
    grp.position.set(x, y0, z);
    this.add(grp);
    const mat = this.concrete(o.color ?? '#a8a397', 1, o.seed ?? 3, 1);
    const outer = new THREE.LatheGeometry(pts, 96);
    const uv = outer.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * (top / o.h));
    this.mesh(outer, mat, 0, 0, 0, grp);
    const inner = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p.x - 0.35, p.y)), 96);
    const im = this.memo('towerIn', () => new THREE.MeshStandardMaterial({ color: '#4d4a44', roughness: 1, side: THREE.BackSide }));
    this.mesh(inner, im, 0, 0, 0, grp, false);
    // stiffening ring at the lip
    if ((o.built ?? 1) >= 1) {
      const rim = new THREE.TorusGeometry(r(top), 0.6, 6, 96);
      const rm = this.mesh(rim, mat, 0, top, 0, grp);
      rm.rotation.x = Math.PI / 2;
    } else {
      // jump-form scaffold ring on an unfinished shell
      const sc = new THREE.CylinderGeometry(r(top) + 1.2, r(top) + 1.2, 5, 64, 1, true);
      this.mesh(sc, this.memo('scaff', () => new THREE.MeshStandardMaterial({ color: '#5b5249', roughness: 0.9, metalness: 0.3, side: THREE.DoubleSide, wireframe: false })), 0, top - 2, 0, grp);
    }
    // diagonal leg pairs: the "X" colonnade the air pours in through
    const legs = Math.round(o.rb * 1.1);
    const lm = this.concrete('#a9a498', 6, 8, 4);
    const rb = r(legH);
    for (let k = 0; k < legs; k++) {
      const a0 = (k / legs) * Math.PI * 2;
      for (const s of [-1, 1]) {
        const a1 = a0 + s * (Math.PI / legs) * 0.9;
        const p0 = V(Math.cos(a0) * rb, 0, Math.sin(a0) * rb).add(grp.position);
        const p1 = V(Math.cos(a1) * rb, legH, Math.sin(a1) * rb).add(grp.position);
        this.strut(p0, p1, 0.9, lm, 'tleg');
      }
    }
    // basin wall and the rain zone under the shell
    const basin = new THREE.CylinderGeometry(rb + 3, rb + 3, 1.6, 96, 1, true);
    this.mesh(basin, this.concrete('#9d998f', 8, 2, 2), 0, 0.8, 0, grp);
    const fill = new THREE.CircleGeometry(rb + 3, 64);
    const fm = this.mesh(fill, this.memo('basinW', () => new THREE.MeshStandardMaterial({ color: '#28343a', roughness: 0.15, metalness: 0.2 })), 0, 0.9, 0, grp, false);
    fm.rotation.x = -Math.PI / 2;
    const pack = new THREE.CylinderGeometry(rb - 1, rb - 1, 2.5, 64);
    this.mesh(pack, this.plain('#3a3b38', 1), 0, legH + 1.5, 0, grp, false);
    if (o.steam !== false && (o.built ?? 1) >= 1) this.emitters.push({ pos: V(x, y0 + top, z), radius: r(top) * 0.95, rate: 1, kind: 'steam', tag: o.tag });
    if (o.h > 90 && (o.built ?? 1) >= 1) for (let k = 0; k < 4; k++) this.beacons.push(V(x + Math.cos(k * 1.57) * r(top), y0 + top + 1, z + Math.sin(k * 1.57) * r(top)));
    this.colliders.push({ x, z, r: rb + 3 });
    this.jobs.push({ x, z, r: rb + 4, kind: 'tower' });
    this.uplights.push({ pos: V(x + rb + 20, y0 + 2, z + rb * 0.5), at: V(x, y0 + top * 0.55, z) });
    return { grp, rTop: r(top), top };
  }

  /**
   * Containment: cylinder + dome, with an inner face so a section cut reads as a
   * thick wall. Returns the shell material so the cutaway can clip it.
   */
  containment(x: number, z: number, o: { r: number; h: number; dome: number; color?: string; buttresses?: number; ring?: boolean; cut?: THREE.Plane; inside?: THREE.Object3D; parent?: THREE.Object3D; y?: number }) {
    const y0 = o.y ?? this.groundY(x, z);
    const grp = new THREE.Group();
    grp.position.set(x, y0, z);
    this.add(grp, o.parent);
    const prof = (off: number) => {
      const p: THREE.Vector2[] = [new THREE.Vector2(o.r - off, 0), new THREE.Vector2(o.r - off, o.h)];
      for (let i = 1; i <= 24; i++) {
        const a = (i / 24) * Math.PI / 2;
        p.push(new THREE.Vector2((o.r - off) * Math.cos(a), o.h + (o.dome - off * 0.6) * Math.sin(a)));
      }
      return p;
    };
    const base = this.concrete(o.color ?? '#c9c4b8', 1, 13, 14);
    const mat = o.cut ? base.clone() : base;
    const og = new THREE.LatheGeometry(prof(0), 96);
    const uv = og.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 1.2);
    this.mesh(og, mat, 0, 0, 0, grp);
    const inMat = this.memo('contIn' + (o.cut ? Math.random() : ''), () => new THREE.MeshStandardMaterial({ color: '#8d8a83', roughness: 1, side: THREE.BackSide })) as THREE.MeshStandardMaterial;
    this.mesh(new THREE.LatheGeometry(prof(1.2), 96), inMat, 0, 0, 0, grp, false);
    if (o.ring !== false) {
      const ring = new THREE.TorusGeometry(o.r + 0.4, 0.9, 8, 96);
      const rm = this.mesh(ring, mat, 0, o.h, 0, grp);
      rm.rotation.x = Math.PI / 2;
    }
    for (let k = 0; k < (o.buttresses ?? 0); k++) {
      const a = (k / (o.buttresses ?? 1)) * Math.PI * 2 + 0.3;
      const bm = this.mesh(new THREE.BoxGeometry(3.2, o.h, 2.4), mat, Math.cos(a) * (o.r + 0.6), o.h / 2, Math.sin(a) * (o.r + 0.6), grp);
      bm.rotation.y = -a;
    }
    // equipment hatch
    const hatch = this.mesh(new THREE.CylinderGeometry(4, 4, 2, 32), this.steel('#59605f'), o.r, 16, 0, grp);
    hatch.rotation.z = Math.PI / 2;
    if (o.cut && o.inside) {
      this.cutaways.push({ plane: o.cut, mats: [mat, inMat, hatch.material as THREE.Material], inside: o.inside });
      o.inside.visible = false;
      grp.add(o.inside);
    }
    this.colliders.push({ x, z, r: o.r + 1 });
    this.jobs.push({ x, z, r: o.r + 3, kind: 'containment' });
    for (let k = 0; k < 6; k++) this.floods.push({ pos: V(x + Math.cos(k) * (o.r + 6), y0, z + Math.sin(k) * (o.r + 6)), r: 14 });
    for (const a of [0.8, 2.4]) this.uplights.push({ pos: V(x + Math.cos(a) * (o.r + 18), y0 + 2, z + Math.sin(a) * (o.r + 18)), at: V(x, y0 + o.h * 0.8, z) });
    return { grp, mat };
  }

  /** Reinforced-concrete chimney with platforms and aviation bands. */
  chimney(x: number, z: number, o: { h: number; rb: number; rt: number; bands?: number; bandFrom?: number; color?: string; flues?: boolean; smoke?: boolean; tag?: string }) {
    const y0 = this.groundY(x, z);
    const g = new THREE.CylinderGeometry(o.rt, o.rb, o.h, 48, 1, true);
    const mat = o.bands
      ? new THREE.MeshStandardMaterial({ map: bands(o.bands, '#c4372b', '#ede9df', o.bandFrom ?? 0), roughness: 0.85 })
      : this.concrete(o.color ?? '#b8b2a5', 1, 17, 40);
    if (!o.bands) {
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 3);
    }
    this.mesh(g, mat, x, y0 + o.h / 2, z);
    const cap = this.mesh(new THREE.TorusGeometry(o.rt + 0.3, 0.7, 6, 48), this.steel('#3c3f40'), x, y0 + o.h, z);
    cap.rotation.x = Math.PI / 2;
    const top = new THREE.CircleGeometry(o.rt, 32);
    const tm = this.mesh(top, this.plain('#111', 1), x, y0 + o.h - 0.5, z, undefined, false);
    tm.rotation.x = -Math.PI / 2;
    for (const f of [0.33, 0.66, 0.96]) {
      const rr = o.rb + (o.rt - o.rb) * f;
      const p = this.mesh(new THREE.CylinderGeometry(rr + 1.6, rr + 1.6, 0.6, 48), this.steel('#4a4f52'), x, y0 + o.h * f, z);
      p.castShadow = true;
      this.beacons.push(V(x + rr + 1.6, y0 + o.h * f + 1, z));
    }
    this.uplights.push({ pos: V(x + o.rb + 14, y0 + 2, z + 6), at: V(x, y0 + o.h * 0.6, z) });
    if (o.smoke) this.emitters.push({ pos: V(x, y0 + o.h, z), radius: o.rt * 0.7, rate: 0.5, kind: 'smoke', tag: o.tag });
    this.colliders.push({ x, z, r: o.rb + 1 });
    this.jobs.push({ x, z, r: o.rb + 4, kind: 'chimney' });
  }

  /** Exhaust stack in a steel lattice frame, as at Fukushima Daiichi and Chernobyl. */
  latticeStack(x: number, z: number, h: number, base = 14, top = 4) {
    const y0 = this.groundY(x, z);
    const tube = this.mesh(new THREE.CylinderGeometry(1.6, 2.2, h, 24), this.plain('#d6d3cc', 0.7, 0.2), x, y0 + h / 2, z);
    tube.castShadow = true;
    const m = this.steel('#a7aaa9');
    const lv = 10;
    const half = (y: number) => base / 2 + (top / 2 - base / 2) * (y / h);
    for (let i = 0; i < lv; i++) {
      const ya = (h * i) / lv, yb = (h * (i + 1)) / lv;
      const a = half(ya), b = half(yb);
      const cs = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
      for (let k = 0; k < 4; k++) {
        const [sx, sz] = cs[k], [tx, tz] = cs[(k + 1) % 4];
        this.strut(V(x + sx * a, y0 + ya, z + sz * a), V(x + sx * b, y0 + yb, z + sz * b), 0.6, m, 'lat');
        this.strut(V(x + sx * b, y0 + yb, z + sz * b), V(x + tx * b, y0 + yb, z + tz * b), 0.35, m, 'lat');
        this.strut(V(x + sx * a, y0 + ya, z + sz * a), V(x + tx * b, y0 + yb, z + tz * b), 0.25, m, 'lat');
      }
    }
    this.beacons.push(V(x, y0 + h + 1, z), V(x + top / 2, y0 + h * 0.6, z));
    this.colliders.push({ x, z, r: base / 2 });
    this.jobs.push({ x, z, r: base / 2 + 3, kind: 'chimney' });
  }

  /** A thin box from a to b, instanced. Used for every lattice member in the scene. */
  strut(a: THREE.Vector3, b: THREE.Vector3, t: number, mat: THREE.Material, key = 'strut') {
    const d = b.clone().sub(a);
    const len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize());
    const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(t, len, t));
    this.instance(key + mat.uuid, this.unitBox, mat, m);
  }
  private unitBox = new THREE.BoxGeometry(1, 1, 1);

  instance(key: string, geo: THREE.BufferGeometry, mat: THREE.Material, m: THREE.Matrix4, color?: THREE.Color, shadow = true) {
    let e = this.inst.get(key);
    if (!e) { e = { geo, mat, m: [], c: [], shadow }; this.inst.set(key, e); }
    e.m.push(m);
    if (color) e.c.push(color);
  }

  // ------------------------------------------------------------------ electrical

  transformer(x: number, z: number, rot = 0, s = 1) {
    const y0 = this.groundY(x, z);
    const grp = new THREE.Group();
    grp.position.set(x, y0, z);
    grp.rotation.y = rot;
    grp.scale.setScalar(s);
    this.add(grp);
    const tank = this.plain('#6b7a6e', 0.6, 0.4);
    this.mesh(new THREE.BoxGeometry(12, 7, 5), tank, 0, 4.5, 0, grp);
    this.mesh(new THREE.BoxGeometry(14, 1, 7), this.concrete('#8f8b84', 8), 0, 0.5, 0, grp);
    // radiator banks
    for (const sx of [-1, 1]) for (let k = 0; k < 8; k++) this.mesh(new THREE.BoxGeometry(0.15, 5.5, 2.2), tank, sx * 7.2, 4.2, -2.6 + k * 0.75, grp, false);
    this.mesh(new THREE.CylinderGeometry(1, 1, 5, 16), tank, -4, 9.2, 0, grp).rotation.z = Math.PI / 2;
    for (let k = 0; k < 3; k++) {
      this.mesh(new THREE.CylinderGeometry(0.35, 0.5, 5, 10), this.plain('#7a4a2e', 0.4), -3 + k * 3, 10.5, 1, grp, false);
      for (let j = 0; j < 7; j++) this.mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.18, 12), this.plain('#7a4a2e', 0.4), -3 + k * 3, 8.6 + j * 0.65, 1, grp, false);
    }
    this.colliders.push({ x, z, hw: 7 * s, hd: 4 * s, rot });
    this.jobs.push({ x, z, hw: 8 * s, hd: 8 * s, rot, kind: 'yard' });
    const off = V(0, 0, 6.5 * s).applyAxisAngle(V(0, 1, 0), rot);
    this.prop('utility_box_02', x + off.x, z + off.z, rot);
    this.prop('utility_box_02', x + off.x + 1.2 * Math.cos(rot), z + off.z - 1.2 * Math.sin(rot), rot);
  }

  /** Switchyard: bays of gantries, breakers, insulator posts and busbars. */
  switchyard(x: number, z: number, w: number, d: number, o: { bays?: number; kv?: number; rot?: number } = {}) {
    const bays = o.bays ?? Math.max(3, Math.floor(w / 22));
    const H = (o.kv ?? 400) >= 700 ? 32 : (o.kv ?? 400) >= 330 ? 24 : 18;
    const y0 = this.groundY(x, z);
    const gravel = this.memo('gravel', () => new THREE.MeshStandardMaterial({ map: ground({ grass: '#8c8a83', dry: '#a29f97', earth: '#77746d' }, 51), roughness: 1 }));
    const pad = this.mesh(new THREE.PlaneGeometry(w, d), gravel, x, y0 + 0.05, z, undefined, false);
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = -(o.rot ?? 0);
    const m = this.steel('#a6aaa8');
    const ins = this.plain('#c8c2b4', 0.3);
    const rot = new THREE.Matrix4().makeRotationY(o.rot ?? 0);
    const P = (lx: number, ly: number, lz: number) => V(lx, ly, lz).applyMatrix4(rot).add(V(x, y0, z));
    const insGeo = new THREE.CylinderGeometry(0.25, 0.3, 4, 8);
    for (let b = 0; b <= bays; b++) {
      const lx = -w / 2 + (w * b) / bays;
      for (const lz of [-d / 2 + 4, d / 2 - 4]) {
        for (const o2 of [-1.2, 1.2]) {
          this.strut(P(lx + o2, 0, lz - 1.2), P(lx + o2 * 0.4, H, lz), 0.4, m, 'sy');
          this.strut(P(lx + o2, 0, lz + 1.2), P(lx + o2 * 0.4, H, lz), 0.4, m, 'sy');
        }
      }
      this.strut(P(lx, H, -d / 2 + 4), P(lx, H, d / 2 - 4), 0.9, m, 'sy');
      if (b < bays) {
        const cx = lx + w / bays / 2;
        for (let k = 0; k < 3; k++) {
          for (let row = 0; row < 4; row++) {
            const lz = -d / 2 + 12 + row * ((d - 24) / 3);
            const p = P(cx - 3 + k * 3, 0, lz);
            this.strut(p, p.clone().setY(y0 + 4), 0.35, m, 'sy');
            this.instance('ins', insGeo, ins, new THREE.Matrix4().makeTranslation(p.x, y0 + 6, p.z), undefined, false);
          }
          this.strut(P(cx - 3 + k * 3, 8, -d / 2 + 6), P(cx - 3 + k * 3, 8, d / 2 - 6), 0.18, this.steel('#c9b37d'), 'bus');
        }
      }
    }
    this.colliders.push({ x, z, hw: w / 2, hd: d / 2, rot: o.rot ?? 0 });
    this.jobs.push({ x, z, hw: w / 2 + 2, hd: d / 2 + 2, rot: o.rot ?? 0, kind: 'yard' });
    this.yards.push(V(x, y0 + H * 0.6, z));
    for (let k = 0; k < 6; k++) this.lamps.push(P(-w / 2 + (w * k) / 5, 12, -d / 2));
  }

  /** Lattice pylon; returns the attachment points of its three crossarms. */
  pylon(x: number, z: number, h = 50, rot = 0) {
    const y0 = this.groundY(x, z);
    const m = this.steel('#9ea2a1');
    const R = new THREE.Matrix4().makeRotationY(rot);
    const P = (a: number, b: number, c: number) => V(a, b, c).applyMatrix4(R).add(V(x, y0, z));
    const lv = 6;
    for (let i = 0; i < lv; i++) {
      const ya = (h * i) / lv, yb = (h * (i + 1)) / lv;
      const a = 5 * (1 - ya / h) + 1, b = 5 * (1 - yb / h) + 1;
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
        this.strut(P(sx * a, ya, sz * a), P(sx * b, yb, sz * b), 0.35, m, 'py');
        this.strut(P(sx * a, ya, sz * a), P(-sx * b, yb, sz * b), 0.15, m, 'py');
      }
    }
    const arms: THREE.Vector3[] = [];
    for (const [yy, len] of [[0.62, 9], [0.78, 11], [0.93, 8]] as const) {
      this.strut(P(-len, h * yy, 0), P(len, h * yy, 0), 0.5, m, 'py');
      arms.push(P(-len, h * yy - 3, 0), P(len, h * yy - 3, 0));
    }
    return arms;
  }

  /** A transmission line: pylons every `span` metres from a to b, conductors sagging between. */
  line(a: THREE.Vector2, b: THREE.Vector2, span = 340, h = 50) {
    const d = b.clone().sub(a);
    const n = Math.max(1, Math.round(d.length() / span));
    const rot = Math.atan2(d.x, d.y) + Math.PI / 2;
    let prev: THREE.Vector3[] | null = null;
    const pts: number[] = [];
    for (let i = 0; i <= n; i++) {
      const p = a.clone().add(d.clone().multiplyScalar(i / n));
      const arms = this.pylon(p.x, p.y, h, rot);
      if (prev) for (let k = 0; k < arms.length; k++) {
        const s = prev[k], e = arms[k];
        const L = s.distanceTo(e);
        for (let j = 0; j < 12; j++) {
          const t0 = j / 12, t1 = (j + 1) / 12;
          const q0 = s.clone().lerp(e, t0); q0.y -= Math.sin(Math.PI * t0) * L * 0.03;
          const q1 = s.clone().lerp(e, t1); q1.y -= Math.sin(Math.PI * t1) * L * 0.03;
          pts.push(q0.x, q0.y, q0.z, q1.x, q1.y, q1.z);
        }
      }
      prev = arms;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.add(new THREE.LineSegments(g, this.memo('wire', () => new THREE.LineBasicMaterial({ color: '#2b2f31', transparent: true, opacity: 0.8 }))));
  }

  // ------------------------------------------------------------------ site

  tank(x: number, z: number, r: number, h: number, color = '#d9d6cf') {
    const y0 = this.groundY(x, z);
    const m = this.plain(color, 0.5, 0.3);
    this.mesh(new THREE.CylinderGeometry(r, r, h, 32), m, x, y0 + h / 2, z);
    this.mesh(new THREE.SphereGeometry(r, 32, 8, 0, Math.PI * 2, 0, 0.35), m, x, y0 + h - r * Math.cos(0.35), z);
    this.colliders.push({ x, z, r });
    this.jobs.push({ x, z, r: r + 2, kind: 'box' });
  }

  /** Instanced field of identical tanks, e.g. Fukushima's treated-water farm. */
  tankFarm(x: number, z: number, cols: number, rows: number, r: number, h: number, gap = 2, color = '#cfd2d0', parent?: THREE.Object3D) {
    const geo = new THREE.CylinderGeometry(r, r, h, 20);
    geo.translate(0, h / 2, 0);
    const mat = this.plain(color, 0.45, 0.4);
    const im = new THREE.InstancedMesh(geo, mat, cols * rows);
    let i = 0;
    for (let a = 0; a < cols; a++) for (let b = 0; b < rows; b++) {
      const px = x + (a - cols / 2) * (2 * r + gap), pz = z + (b - rows / 2) * (2 * r + gap);
      im.setMatrixAt(i++, new THREE.Matrix4().makeTranslation(px, this.groundY(px, pz), pz));
    }
    im.castShadow = im.receiveShadow = true;
    this.add(im, parent);
    this.colliders.push({ x, z, hw: cols * (r + gap / 2), hd: rows * (r + gap / 2), rot: 0 });
    this.jobs.push({ x, z, hw: cols * (r + gap / 2) + 4, hd: rows * (r + gap / 2) + 4, rot: 0, kind: 'late' });
  }

  road(pts: [number, number][], w = 8, lit = true) {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let len = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = V(pts[i][0], 0, pts[i][1]);
      const qn = pts[Math.min(i + 1, pts.length - 1)], on = pts[Math.max(i - 1, 0)];
      const q = V(qn[0], 0, qn[1]);
      const o = V(on[0], 0, on[1]);
      const dir = q.clone().sub(o).normalize();
      const n = V(-dir.z, 0, dir.x).multiplyScalar(w / 2);
      if (i > 0) len += p.distanceTo(V(pts[i - 1][0], 0, pts[i - 1][1]));
      for (const s of [-1, 1]) {
        const v = p.clone().addScaledVector(n, s);
        pos.push(v.x, this.groundY(v.x, v.z) + 0.08, v.z);
        uv.push(s < 0 ? 0 : 1, len / 30);
      }
      if (i > 0) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
      if (lit && i > 0) {
        const seg = p.distanceTo(V(pts[i - 1][0], 0, pts[i - 1][1]));
        for (let s = 0; s < seg; s += 45) {
          const c = V(pts[i - 1][0], 0, pts[i - 1][1]).lerp(p, s / seg).add(n);
          const lp = c.clone().addScaledVector(n.clone().normalize(), 1.5);
          lp.y = this.groundY(lp.x, lp.z);
          this.lampPost(lp.x, lp.z, lp.y);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = this.memo('road', () => new THREE.MeshStandardMaterial({ map: roadLines(), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = true;
    this.add(mesh);
  }

  /** A paved apron under a group of buildings. */
  apron(x: number, z: number, w: number, d: number, rot = 0) {
    const m = this.memo('apron', () => {
      const t = ground({ grass: '#8a867d', dry: '#9b978e', earth: '#77736b' }, 61);
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 });
    });
    const g = new THREE.PlaneGeometry(w, d);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 160, uv.getY(i) * d / 160);
    const p = this.mesh(g, m, x, this.groundY(x, z) + 0.04, z, undefined, false);
    p.rotation.x = -Math.PI / 2;
    p.rotation.z = rot;
    if (w > 120) for (let t = -w / 2; t < w / 2; t += 32) for (const s of [-1, 1]) {
      const q = V(t + this.R() * 10, 0, s * (d / 2 + 3)).applyAxisAngle(V(0, 1, 0), rot);
      this.prop('shrub_03', x + q.x, z + q.z, undefined, 1.4 + this.R());
    }
  }

  lampPost(x: number, z: number, y = this.groundY(x, z), h = 10) {
    const pole = this.steel('#6c7377');
    this.instance('pole', this.poleGeo, pole, new THREE.Matrix4().compose(V(x, y + h / 2, z), new THREE.Quaternion(), V(1, h, 1)), undefined, false);
    this.lamps.push(V(x, y + h, z));
  }
  private poleGeo = new THREE.CylinderGeometry(0.12, 0.18, 1, 6);

  /** Floodlight mast for the big yards. */
  mast(x: number, z: number, h = 30) {
    const y = this.groundY(x, z);
    this.strut(V(x, y, z), V(x, y + h, z), 0.6, this.steel('#7d8487'), 'mast');
    for (let k = 0; k < 3; k++) this.lamps.push(V(x - 1 + k, y + h, z));
    this.floods.push({ pos: V(x, y, z), r: 60 });
  }

  /** Scattered trees, instanced, with colour variation. */
  trees(n: number, box: [number, number, number, number], avoid: (x: number, z: number) => boolean, kind: 'pine' | 'broad' | 'palm' | 'mixed' = 'mixed', seed = 3) {
    const R = rng(seed);
    const pineG = this.memo2('pineG', () => {
      const g = new THREE.ConeGeometry(2.6, 9, 7, 3);
      g.translate(0, 9.5, 0);
      jitter(g, 0.35, 5);
      return g;
    });
    const broadG = this.memo2('broadG', () => {
      const g = new THREE.IcosahedronGeometry(3.6, 1);
      g.scale(1, 0.85, 1);
      g.translate(0, 7, 0);
      jitter(g, 0.8, 7);
      return g;
    });
    const trunkG = this.memo2('trunkG', () => { const g = new THREE.CylinderGeometry(0.22, 0.32, 6, 5); g.translate(0, 3, 0); return g; });
    const leaf = this.memo('leaf', () => new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }));
    const bark = this.plain('#4a3a2c', 1);
    for (let i = 0; i < n; i++) {
      const x = box[0] + R() * (box[2] - box[0]), z = box[1] + R() * (box[3] - box[1]);
      if (avoid(x, z)) continue;
      const y = this.groundY(x, z);
      const s = 0.7 + R() * 0.8;
      const isPine = kind === 'pine' || (kind === 'mixed' && R() < 0.45);
      const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), R() * 6.28);
      const m = new THREE.Matrix4().compose(V(x, y, z), q, V(s, s * (0.9 + R() * 0.4), s));
      const c = isPine ? new THREE.Color().setHSL(0.26 + R() * 0.05, 0.5, 0.045 + R() * 0.035) : new THREE.Color().setHSL(0.19 + R() * 0.08, 0.55, 0.06 + R() * 0.06);
      this.instance(isPine ? 'pine' : 'broad', isPine ? pineG : broadG, leaf, m, c);
      this.instance('trunk', trunkG, bark, m);
    }
  }
  private geos = new Map<string, THREE.BufferGeometry>();
  private memo2(k: string, f: () => THREE.BufferGeometry) {
    if (!this.geos.has(k)) this.geos.set(k, f());
    return this.geos.get(k)!;
  }

  /** Parked cars in rows. */
  parking(x: number, z: number, cols: number, rows: number, rot = 0, fill = 0.75) {
    // sedan side profile extruded across its width, bevelled so it catches light
    const extrude = (pts: [number, number][], w: number, bevel: number) => {
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))), { depth: w - 2 * bevel, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2 });
      g.translate(0, 0, -(w - 2 * bevel) / 2);
      return g;
    };
    const body = this.memo2('car', () => extrude([[-2.2, 0.32], [-2.25, 0.78], [-1.25, 0.92], [-0.72, 1.38], [0.62, 1.4], [1.25, 0.96], [2.22, 0.84], [2.2, 0.32]], 1.76, 0.07));
    const glass = this.memo2('carGlass', () => extrude([[-1.16, 0.93], [-0.68, 1.33], [0.58, 1.35], [1.16, 0.97]], 1.8, 0));
    const wheels = this.memo2('carWheels', () => {
      const ws: THREE.BufferGeometry[] = [];
      for (const wx of [-1.38, 1.4]) for (const wz of [-0.78, 0.78]) {
        const c = new THREE.CylinderGeometry(0.33, 0.33, 0.22, 14);
        c.rotateX(Math.PI / 2);
        c.translate(wx, 0.33, wz);
        ws.push(c);
      }
      return mergeSimple(ws);
    });
    const glassM = this.plain('#0e1418', 0.08, 0.6);
    const tyre = this.plain('#121212', 0.9);
    const paint = this.memo('paint', () => new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.6 }));
    const pal = ['#d9d9d6', '#1b1c1e', '#7c8186', '#9b1d1d', '#2a3c5c', '#e8e4da', '#4d5a4a'];
    const R = new THREE.Matrix4().makeRotationY(rot);
    this.apron(x, z, cols * 2.8 + 6, rows * 6 + 4, -rot);
    for (let a = 0; a < Math.min(cols, 8); a++) {
      const p = V((a - cols / 2) * 2.8, 0, (rows / 2 + 0.2) * 6).applyMatrix4(R);
      this.prop('covered_car', x + p.x, z + p.z, rot + (this.R() - 0.5) * 0.12);
    }
    for (let a = 0; a < cols; a++) for (let b = 0; b < rows; b++) {
      if (this.R() > fill) continue;
      const p = V((a - cols / 2) * 2.8, 0, (b - rows / 2) * 6).applyMatrix4(R).add(V(x, this.groundY(x, z), z));
      const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rot + Math.PI / 2 + (b % 2 ? Math.PI : 0));
      const cm = new THREE.Matrix4().compose(p, q, V(1, 1, 1));
      this.instance('car', body, paint, cm, new THREE.Color(pal[Math.floor(this.R() * pal.length)]));
      this.instance('carGlass', glass, glassM, cm, undefined, false);
      this.instance('carWheels', wheels, tyre, cm, undefined, false);
    }
  }

  /** Tower crane (lattice mast + jib). */
  towerCrane(x: number, z: number, h: number, jib: number, rot = 0) {
    const y = this.groundY(x, z);
    const m = this.plain('#d8a21e', 0.6, 0.3);
    const R = new THREE.Matrix4().makeRotationY(rot);
    const P = (a: number, b: number, c: number) => V(a, b, c).applyMatrix4(R).add(V(x, y, z));
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) this.strut(P(sx * 1.2, 0, sz * 1.2), P(sx * 1.2, h, sz * 1.2), 0.25, m, 'crane');
    for (let i = 0; i < h; i += 3) this.strut(P(1.2, i, 1.2), P(-1.2, i + 3, -1.2), 0.12, m, 'crane');
    this.strut(P(-jib * 0.3, h + 1, 0), P(jib, h + 1, 0), 1.2, m, 'crane');
    this.strut(P(0, h, 0), P(0, h + 7, 0), 0.5, m, 'crane');
    this.strut(P(0, h + 7, 0), P(jib * 0.7, h + 1.5, 0), 0.12, m, 'crane');
    this.mesh(new THREE.BoxGeometry(4, 2.4, 2.4), this.concrete('#888', 4), ...P(-jib * 0.27, h + 2, 0).toArray() as [number, number, number]);
    this.beacons.push(P(jib, h + 2, 0), P(0, h + 8, 0));
  }

  /** Water body (river, pond, sea). Shares one animated normal map. */
  water(x: number, z: number, w: number, d: number, y: number, color = '#24414a') {
    const m = this.memo('water' + color, () => {
      const n = waterNormal();
      return new THREE.MeshStandardMaterial({ color, roughness: 0.24, metalness: 0, normalMap: n, normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 0.4 });
    }) as THREE.MeshStandardMaterial;
    const g = new THREE.PlaneGeometry(w, d, 1, 1);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 60, uv.getY(i) * d / 60);
    const p = this.mesh(g, m, x, y, z, undefined, false);
    p.rotation.x = -Math.PI / 2;
    p.name = 'water';
    return p;
  }

  /** Terrain mesh following groundY, textured with a blended ground palette. */
  terrain(size: number, palette: { grass: string; dry: string; earth: string }, seg = 256, cx = 0, cz = 0, fn = this.groundY) {
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, fn(p.getX(i) + cx, p.getZ(i) + cz));
    g.computeVertexNormals();
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size / 90, uv.getY(i) * size / 90);
    const m = new THREE.MeshStandardMaterial({ map: ground(palette), roughness: 1 });
    const t = this.mesh(g, m, cx, 0, cz, undefined, false);
    t.receiveShadow = true;
    t.name = 'terrain';
    return t;
  }

  era(name: string) {
    let g = this.eras.get(name);
    if (!g) { g = new THREE.Group(); g.name = 'era:' + name; this.eras.set(name, g); this.root.add(g); }
    return g;
  }

  /** Bake instance lists into InstancedMeshes. Call once after building. */
  finish() {
    for (const [, e] of this.inst) {
      const im = new THREE.InstancedMesh(e.geo, e.mat, e.m.length);
      e.m.forEach((m, i) => im.setMatrixAt(i, m));
      if (e.c.length === e.m.length) e.c.forEach((c, i) => im.setColorAt(i, c));
      im.castShadow = e.shadow;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.root.add(im);
    }
    this.inst.clear();
    return this;
  }
}

function jitter(g: THREE.BufferGeometry, amt: number, seed: number) {
  const R = rng(seed);
  const p = g.attributes.position as THREE.BufferAttribute;
  const seen = new Map<string, [number, number, number]>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(2)},${p.getY(i).toFixed(2)},${p.getZ(i).toFixed(2)}`;
    if (!seen.has(k)) seen.set(k, [(R() - 0.5) * amt, (R() - 0.5) * amt, (R() - 0.5) * amt]);
    const d = seen.get(k)!;
    p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
  }
  g.computeVertexNormals();
}

/** Merge non-indexed copies of simple geometries (position/normal/uv only). */
export function mergeSimple(gs: THREE.BufferGeometry[]) {
  const parts = gs.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const arrs = parts.map((g) => (g.attributes[name] as THREE.BufferAttribute).array as Float32Array);
    const tot = arrs.reduce((s, a) => s + a.length, 0);
    const buf = new Float32Array(tot);
    let o = 0;
    for (const a of arrs) { buf.set(a, o); o += a.length; }
    out.setAttribute(name, new THREE.BufferAttribute(buf, name === 'uv' ? 2 : 3));
  }
  return out;
}

export { V, glow };
