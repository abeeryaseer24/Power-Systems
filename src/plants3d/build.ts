import * as THREE from 'three';
import type { Job, Kit } from './kit';
import { rng } from './textures';

// Construction time-lapse. A float texture over the site holds, per cell, how
// high the structure standing there is allowed to be at this moment. Every
// lit material discards fragments above it, so walls rise course by course and
// tower shells climb the way jump-forms do. Cranes stand on the big jobs.

export type Lapse = { from: number; to: number; end?: number; marks: [number, string][] };

const WINDOW: Record<string, [number, number, number]> = {
  // kind: [start, finish, full height grown over the window]
  dam: [0.04, 0.8, 200],
  containment: [0.1, 0.62, 110],
  tall: [0.12, 0.6, 120],
  box: [0.2, 0.75, 80],
  hall: [0.22, 0.66, 60],
  chimney: [0.28, 0.7, 270],
  tower: [0.32, 0.88, 185],
  yard: [0.72, 0.94, 40],
};

const N = 256;

export class BuildLapse {
  uniforms = {
    uBuildOn: { value: 0 },
    uBuildTex: { value: null as THREE.DataTexture | null },
    uBuildMin: { value: new THREE.Vector2() },
    uBuildSize: { value: 1 },
  };
  private data = new Float32Array(N * N);
  private tex: THREE.DataTexture;
  private plan: { job: Job; t0: number; t1: number; H: number; cells: number[]; ground: number[] }[] = [];
  private cranes: { g: THREE.Group; t0: number; t1: number }[] = [];
  private patched = false;

  constructor(kit: Kit, private root: THREE.Object3D, center: THREE.Vector2, span: number, lapse: Lapse) {
    this.tex = new THREE.DataTexture(this.data, N, N, THREE.RedFormat, THREE.FloatType);
    this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter;
    this.uniforms.uBuildTex.value = this.tex;
    const min = new THREE.Vector2(center.x - span / 2, center.y - span / 2);
    this.uniforms.uBuildMin.value.copy(min);
    this.uniforms.uBuildSize.value = span;
    const R = rng(13);
    const end = lapse.end ?? 1;
    const cell = span / N;
    for (const job of kit.jobs) {
      const w = job.kind === 'late' ? [0.88, 0.98, 80] : WINDOW[job.kind] ?? WINDOW.box;
      const scale = job.kind === 'late' ? 1 : end;
      const len = (w[1] - w[0]) * 0.55;
      const t0 = (w[0] + R() * (w[1] - w[0] - len)) * scale;
      const t1 = t0 + len * scale;
      // rasterise the footprint once
      const cells: number[] = [], ground: number[] = [];
      const ext = 'r' in job ? job.r : Math.hypot(job.hw, job.hd);
      const i0 = Math.max(0, Math.floor((job.x - ext - min.x) / cell)), i1 = Math.min(N - 1, Math.ceil((job.x + ext - min.x) / cell));
      const j0 = Math.max(0, Math.floor((job.z - ext - min.y) / cell)), j1 = Math.min(N - 1, Math.ceil((job.z + ext - min.y) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = min.x + (i + 0.5) * cell, z = min.y + (j + 0.5) * cell;
        let inside: boolean;
        if ('r' in job) inside = (x - job.x) ** 2 + (z - job.z) ** 2 <= (job.r + cell * 0.7) ** 2;
        else {
          const c = Math.cos(-job.rot), s = Math.sin(-job.rot), dx = x - job.x, dz = z - job.z;
          inside = Math.abs(dx * c + dz * s) <= job.hw + cell * 0.7 && Math.abs(-dx * s + dz * c) <= job.hd + cell * 0.7;
        }
        if (inside) { cells.push(j * N + i); ground.push(kit.groundY(x, z)); }
      }
      this.plan.push({ job, t0, t1, H: w[2], cells, ground });
      if ((job.kind === 'containment' || job.kind === 'tower' || job.kind === 'chimney' || job.kind === 'tall') && this.cranes.length < 14) {
        const r = 'r' in job ? job.r : Math.max(job.hw, job.hd);
        this.cranes.push({ g: crane(job.x + r + 8, job.z + 6, kit.groundY(job.x + r + 8, job.z), w[2] * 0.9 + 20, r + 30, R() * 6.28), t0, t1: t1 + 0.02 });
      }
    }
    for (const c of this.cranes) { c.g.visible = false; root.add(c.g); }
  }

  /** Inject the height test into every standard material once. */
  prepare() {
    if (this.patched) return;
    this.patched = true;
    const seen = new Set<THREE.Material>();
    const u = this.uniforms;
    this.root.traverse((o) => {
      if (o.name === 'terrain' || o.name === 'water') return;
      const mats = (o as THREE.Mesh).material;
      if (!mats) return;
      for (const m of Array.isArray(mats) ? mats : [mats]) {
        if (seen.has(m) || !(m as THREE.MeshStandardMaterial).isMeshStandardMaterial) continue;
        seen.add(m);
        m.onBeforeCompile = (sh) => {
          Object.assign(sh.uniforms, u);
          sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vBuildW;')
            .replace('#include <project_vertex>', `#include <project_vertex>
              vec4 bw = vec4(transformed, 1.0);
              #ifdef USE_INSTANCING
                bw = instanceMatrix * bw;
              #endif
              vBuildW = (modelMatrix * bw).xyz;`);
          sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vBuildW; uniform float uBuildOn; uniform sampler2D uBuildTex; uniform vec2 uBuildMin; uniform float uBuildSize;')
            .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
              if (uBuildOn > 0.5) {
                vec2 bu = (vBuildW.xz - uBuildMin) / uBuildSize;
                if (bu.x > 0.0 && bu.y > 0.0 && bu.x < 1.0 && bu.y < 1.0 && vBuildW.y > texture2D(uBuildTex, bu).r) discard;
              }`);
        };
        m.customProgramCacheKey = () => 'build1';
        m.needsUpdate = true;
      }
    });
  }

  set(p: number | null) {
    if (p === null) {
      this.uniforms.uBuildOn.value = 0;
      for (const c of this.cranes) c.g.visible = false;
      return;
    }
    this.prepare();
    this.uniforms.uBuildOn.value = 1;
    this.data.fill(1e5);
    // pass 1: mark every footprint as unbuilt; pass 2: grow the started ones
    for (const pl of this.plan) for (const c of pl.cells) this.data[c] = -1e4;
    for (const pl of this.plan) {
      const q = (p - pl.t0) / (pl.t1 - pl.t0);
      if (q <= 0) continue;
      const h = q >= 1 ? 1e5 : q * pl.H;
      pl.cells.forEach((c, k) => { this.data[c] = Math.max(this.data[c], pl.ground[k] + h); });
    }
    this.tex.needsUpdate = true;
    for (const c of this.cranes) c.g.visible = p > c.t0 - 0.03 && p < c.t1;
  }
}

function crane(x: number, z: number, y: number, h: number, jib: number, rot: number) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rot;
  const m = new THREE.MeshStandardMaterial({ color: '#d9a21d', roughness: 0.6, metalness: 0.3 });
  const mast = new THREE.Mesh(new THREE.BoxGeometry(2.2, h, 2.2), m);
  mast.position.y = h / 2;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(jib * 1.3, 1.6, 1.6), m);
  arm.position.set(jib * 0.35, h + 1, 0);
  const cw = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, 2.6), new THREE.MeshStandardMaterial({ color: '#6c6c66', roughness: 0.9 }));
  cw.position.set(-jib * 0.27, h + 1.2, 0);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 2.6), m);
  cab.position.set(1.8, h - 1.5, 0);
  const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h * 0.5, 4), new THREE.MeshBasicMaterial({ color: '#222' }));
  hook.position.set(jib * 0.7, h * 0.75, 0);
  for (const o of [mast, arm, cw, cab, hook]) { o.castShadow = true; g.add(o); }
  return g;
}
