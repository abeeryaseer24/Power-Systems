import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { DISTRICTS, LINES, PLANTS } from '../grid/network';
import type { GridSim } from '../grid/engine';
import {
  buildCity, buildGround, buildMovers, buildLake, buildLights, buildPlants, buildPools, buildSea, buildSky,
  buildSteam, buildSubstations, buildTransmission, GLAZE, makeShared, SODIUM,
  type LineVisual, type PlantVisual,
} from './builders';
import { CHANNELS, PLANT_SITE, plantChannel, terrainY, busPos } from './world';

export type SceneMode = 'hero' | 'control';

const ARC = new THREE.Color('#c9b8ff');
const TRIP = new THREE.Color('#ff5b4f');
const DEAD = new THREE.Color('#1f2d42');

// Hero narrative: when each thing comes back, as a fraction of scroll progress.
const HERO_DISTRICT: Record<string, number> = {
  northside: 0.44, downtown: 0.52, oldtown: 0.58, hillcrest: 0.62, eastside: 0.66, harbourside: 0.71, airport: 0.76,
};
const HERO_PLANT: Record<string, number> = {
  glen: 0.12, ridgeway: 0.56, harbour: 0.6, airport: 0.7, bess: 0.5, westmark: 0.64, sunfield: 0.0, saltmarsh: 0.0, kestrel: 0.84,
};
const HERO_LINE_ORDER = ['glen-north', 'north-central', 'north-hill', 'ridge-north', 'old-central', 'central-harb', 'central-east', 'ridge-old', 'hill-east', 'west-old', 'old-air', 'harb-air', 'salt-harb', 'salt-east', 'hill-sun', 'sun-east', 'west-air', 'east-kes', 'kes-salt'];
const heroLineAt = (id: string) => 0.22 + (HERO_LINE_ORDER.indexOf(id) / HERO_LINE_ORDER.length) * 0.55;

const HERO_CAM: [number, THREE.Vector3, THREE.Vector3][] = [
  [0, new THREE.Vector3(30, 5, 50), new THREE.Vector3(2, 0, -4)],
  [0.2, new THREE.Vector3(9, 3.2, -5), new THREE.Vector3(-7, 0.5, -24)],
  [0.42, new THREE.Vector3(-24, 5.5, -7), new THREE.Vector3(0, 0, 0)],
  [0.62, new THREE.Vector3(-10, 4.5, 19), new THREE.Vector3(3, 0, -1)],
  [0.8, new THREE.Vector3(24, 8, 22), new THREE.Vector3(0, 0, -2)],
  [1, new THREE.Vector3(6, 34, 50), new THREE.Vector3(0, 0, -2)],
];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface Projector {
  (x: number, y: number, z: number): { x: number; y: number; visible: boolean };
}

export class CityScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private controls?: MapControls;
  private shared = makeShared();
  private lines!: { group: THREE.Group; visuals: LineVisual[]; flow: THREE.Points; per: number };
  private flowPhase = LINES.map(() => 0);
  private plants!: PlantVisual[];
  private subs!: ReturnType<typeof buildSubstations>;
  private pools!: THREE.Mesh[];
  private steam!: ReturnType<typeof buildSteam>;
  private steamPlant: number[] = [];
  private starMat!: THREE.ShaderMaterial;
  private movers!: ReturnType<typeof buildMovers>;
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;
  private heroP = 0;
  private heroCam = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  private camPos!: THREE.CatmullRomCurve3;
  private camTgt!: THREE.CatmullRomCurve3;
  /** Smoothed light level per channel, chasing the target. */
  private light = new Array(CHANNELS).fill(0);
  private target = new Array(CHANNELS).fill(0);
  private flicker = new Array(CHANNELS).fill(0);
  private plantActivity = PLANTS.map(() => 0);
  private windSpeed = 8;
  private lineState = LINES.map(() => ({ loading: 0, flow: 0, live: false, closed: true }));
  private busLive = new Array(13).fill(false);
  private shake = 0;
  private selectedLine: string | null = null;
  onFrame?: (project: Projector) => void;
  onPickLine?: (id: string | null) => void;
  private ro: ResizeObserver;

  constructor(private canvas: HTMLCanvasElement, readonly mode: SceneMode) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, mode === 'hero' ? 1.6 : 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 1500);
    this.scene.fog = new THREE.FogExp2('#0b1a2c', 0.014);
    this.scene.background = new THREE.Color('#0b1a2c');
    this.build();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.72);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    if (mode === 'control') {
      this.camera.position.set(6, 40, 44);
      const c = new MapControls(this.camera, canvas);
      c.target.set(0, 0, -1);
      c.enableDamping = true;
      c.dampingFactor = 0.08;
      c.maxPolarAngle = 1.15;
      c.minDistance = 8;
      c.maxDistance = 95;
      c.screenSpacePanning = false;
      c.update();
      this.controls = c;
      canvas.addEventListener('pointerdown', this.onDown);
      canvas.addEventListener('pointerup', this.onUp);
    } else {
      this.camPos = new THREE.CatmullRomCurve3(HERO_CAM.map((k) => k[1]));
      this.camTgt = new THREE.CatmullRomCurve3(HERO_CAM.map((k) => k[2]));
    }
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.loop();
  }

  private build() {
    const moonDir = new THREE.Vector3(-0.35, 0.42, -0.84).normalize();
    const sky = buildSky(moonDir);
    this.starMat = sky.starMat;
    this.scene.add(sky.group);
    this.scene.add(new THREE.HemisphereLight('#3a5478', '#05080d', 0.3));
    const moon = new THREE.DirectionalLight('#9fb4d8', 0.5);
    moon.position.copy(moonDir.clone().multiplyScalar(60));
    this.scene.add(moon);
    this.scene.add(buildGround(this.shared));
    this.scene.add(buildSea(this.shared, moonDir));
    this.scene.add(buildLake(this.shared, moonDir));
    const city = buildCity(this.shared);
    this.scene.add(city.mesh);
    const plants = buildPlants();
    this.plants = plants.visuals;
    for (const v of this.plants) this.scene.add(v.group);
    const lights = buildLights(this.shared, [...city.tall.filter((_, i) => i % 3 === 0), ...plants.red]);
    this.scene.add(lights.points, lights.red);
    this.pools = buildPools(this.shared);
    for (const p of this.pools) this.scene.add(p);
    this.lines = buildTransmission();
    this.scene.add(this.lines.group);
    this.subs = buildSubstations();
    this.scene.add(this.subs.group);
    const sources: THREE.Vector3[] = [];
    this.plants.forEach((v, i) => v.steamFrom.forEach((s) => {
      sources.push(s);
      this.steamPlant.push(i);
    }));
    this.movers = buildMovers();
    this.scene.add(this.movers.points);
    this.steam = buildSteam(sources);
    this.scene.add(this.steam.points);
  }

  // ------------------------------------------------------------ inputs

  private downAt = { x: 0, y: 0 };
  private onDown = (e: PointerEvent) => (this.downAt = { x: e.clientX, y: e.clientY });
  private onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 5) return;
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hits = ray.intersectObjects(this.lines.visuals.map((v) => v.hit), false);
    this.onPickLine?.(hits.length ? (hits[0].object.userData.lineId as string) : null);
  };

  setSelectedLine(id: string | null) {
    this.selectedLine = id;
  }

  /** Fly the control camera to look at a point. */
  focus(x: number, z: number, distance = 22) {
    if (!this.controls) return;
    const c = this.controls;
    const dir = this.camera.position.clone().sub(c.target).normalize();
    const to = new THREE.Vector3(x, 0, z);
    const from = c.target.clone();
    const fromPos = this.camera.position.clone();
    const toPos = to.clone().add(dir.multiplyScalar(distance));
    const t0 = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / 900);
      const e = 1 - Math.pow(1 - t, 3);
      c.target.lerpVectors(from, to, e);
      this.camera.position.lerpVectors(fromPos, toPos, e);
      if (t < 1 && !this.disposed) requestAnimationFrame(step);
    };
    step();
  }

  setHeroProgress(p: number) {
    this.heroP = p;
  }

  kick(amount = 1) {
    this.shake = Math.min(1.5, this.shake + amount);
  }

  // ------------------------------------------------------------ state in

  updateFromSim(s: GridSim) {
    DISTRICTS.forEach((d, i) => {
      const ds = s.districts[i];
      const served = ds.demand > 0 ? ds.served / ds.demand : 0;
      this.target[i] = s.energized[d.bus] ? Math.min(1, served) : 0;
    });
    PLANTS.forEach((p, i) => {
      const ps = s.plants[i];
      const on = ps.units.some((u) => u.status === 'online' || u.status === 'stopping');
      const live = s.energized[p.bus];
      this.target[plantChannel(p.id)] = live || on ? 1 : p.kind === 'hydro' ? 0.15 : 0.05;
      const cap = p.unitMax * p.units;
      this.plantActivity[i] = live ? Math.max(0, ps.output) / cap : 0;
    });
    this.windSpeed = s.wind;
    s.lines.forEach((l, i) => {
      this.lineState[i] = { loading: l.loading, flow: l.flow, live: s.energized[l.def.from] && l.closed, closed: l.closed };
    });
    for (let b = 0; b < 13; b++) this.busLive[b] = s.energized[b];
    if (!this.primed) {
      this.primed = true;
      for (let i = 0; i < CHANNELS; i++) this.light[i] = this.target[i];
    }
  }
  private primed = false;

  private heroState(p: number) {
    DISTRICTS.forEach((d, i) => (this.target[i] = smooth(HERO_DISTRICT[d.id], HERO_DISTRICT[d.id] + 0.05, p)));
    PLANTS.forEach((pl, i) => {
      const at = HERO_PLANT[pl.id];
      const on = smooth(at, at + 0.03, p);
      this.target[plantChannel(pl.id)] = pl.kind === 'wind' || pl.kind === 'solar' ? 0.25 + 0.75 * smooth(0.6, 0.7, p) : on;
      this.plantActivity[i] = pl.kind === 'wind' ? 0.5 : pl.kind === 'solar' ? 0 : on * 0.7;
    });
    LINES.forEach((l, i) => {
      const at = heroLineAt(l.id);
      const live = p > at;
      this.lineState[i] = { loading: live ? 0.25 + 0.35 * Math.sin(i * 1.7) ** 2 : 0, flow: live ? (i % 2 ? 1 : -1) * 300 : 0, live, closed: true };
    });
    for (let b = 0; b < 13; b++) {
      const touching = LINES.some((l, i) => (l.from === b || l.to === b) && this.lineState[i].live);
      this.busLive[b] = b === 0 ? p > 0.12 : touching;
    }
  }

  // ------------------------------------------------------------ loop

  private resize() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    this.camera.fov = w < 700 ? 55 : 42;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.frame();
  };

  /** Render one frame (also callable directly when rAF is throttled). */
  frame() {
    const dt = Math.min(0.1, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    this.shared.uTime.value = t;
    this.starMat.uniforms.uTime.value = t;
    if (this.mode === 'hero') this.heroState(this.heroP);

    // lights chase their targets with an incandescent-ish flicker when changing
    for (let i = 0; i < CHANNELS; i++) {
      const d = this.target[i] - this.light[i];
      if (Math.abs(d) > 0.02) this.flicker[i] = Math.min(1, this.flicker[i] + dt * 3);
      else this.flicker[i] = Math.max(0, this.flicker[i] - dt * 1.5);
      const rate = d > 0 ? 1.4 : 3.5;
      this.light[i] += d * Math.min(1, dt * rate);
      const fl = this.flicker[i] * (Math.sin(t * 37 + i * 3) * Math.sin(t * 23 + i) > 0.3 ? -0.35 : 0);
      this.shared.uLight.value[i] = Math.max(0, Math.min(1, this.light[i] + fl * this.light[i]));
    }
    this.pools.forEach((p, i) => ((p.material as THREE.MeshBasicMaterial).opacity = 0.085 * this.shared.uLight.value[i]));

    // transmission lines
    const geo = this.lines.flow.geometry;
    const pos = geo.attributes.position.array as Float32Array;
    const col = geo.attributes.aColor.array as Float32Array;
    const per = this.lines.per;
    const c = new THREE.Color();
    LINES.forEach((l, i) => {
      const st = this.lineState[i];
      const v = this.lines.visuals[i];
      const L = st.loading;
      if (!st.closed) c.copy(DEAD).multiplyScalar(0.5);
      else if (!st.live) c.copy(DEAD);
      else if (L < 0.6) c.copy(GLAZE).multiplyScalar(0.55 + L * 0.5);
      else if (L < 0.9) c.copy(GLAZE).lerp(SODIUM, (L - 0.6) / 0.3).multiplyScalar(1.0);
      else if (L <= 1) c.copy(SODIUM).lerp(TRIP, (L - 0.9) / 0.1).multiplyScalar(1.3);
      else c.copy(ARC).lerp(new THREE.Color(1, 1, 1), 0.3 + 0.3 * Math.sin(t * 30 + i)).multiplyScalar(1.8 + Math.random() * 1.4);
      if (this.selectedLine === l.id) c.multiplyScalar(1.8);
      v.mat.color.copy(c);
      v.mat.opacity = st.closed ? 0.95 : 0.35;
      const speed = st.live ? Math.min(1.6, Math.abs(st.flow) / 400) * 0.12 * Math.sign(st.flow) : 0;
      this.flowPhase[i] = (this.flowPhase[i] + speed * dt * (12 / v.length) * 3 + 10) % 1;
      const pc = st.live ? c.clone().lerp(new THREE.Color(1, 1, 1), 0.35) : new THREE.Color(0, 0, 0);
      const amp = st.live ? Math.min(1, 0.25 + Math.abs(st.flow) / 600) : 0;
      for (let k = 0; k < per; k++) {
        const u = (k / per + this.flowPhase[i]) % 1;
        const p = v.curve.getPointAt(u);
        const j = (i * per + k) * 3;
        pos[j] = p.x;
        pos[j + 1] = p.y + 0.01;
        pos[j + 2] = p.z;
        col[j] = pc.r * amp;
        col[j + 1] = pc.g * amp;
        col[j + 2] = pc.b * amp;
      }
    });
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;

    this.subs.sprites.forEach((s, b) => {
      const m = s.material as THREE.SpriteMaterial;
      m.opacity = this.busLive[b] ? 0.55 + 0.1 * Math.sin(t * 2 + b) : 0.06;
    });

    // plants: rotors, glows, steam
    this.plants.forEach((v, i) => {
      const act = this.plantActivity[i];
      (v.glow.material as THREE.SpriteMaterial).opacity = Math.min(0.5, act * 0.35 + this.shared.uLight.value[plantChannel(v.id)] * 0.12);
      if (v.rotors.length) {
        const w = this.mode === 'hero' ? 9 : this.windSpeed;
        const rpm = w > 3.5 && w < 25 ? Math.min(1, (w - 3) / 9) * 1.4 : 0.02;
        v.rotors.forEach((r) => (r.rotation.z -= rpm * dt));
      }
    });
    this.updateSteam(dt);
    // traffic thins out when districts go dark (signals fail, people stay home)
    let lit = 0;
    for (let i = 0; i < DISTRICTS.length; i++) lit += this.shared.uLight.value[i];
    this.movers.update(dt, lit / DISTRICTS.length);

    // camera
    if (this.mode === 'hero') {
      const e = this.heroP;
      this.camPos.getPoint(e, this.heroCam.pos);
      this.camTgt.getPoint(e, this.heroCam.target);
      this.heroCam.pos.x += Math.sin(t * 0.07) * 0.6;
      this.heroCam.pos.y += Math.sin(t * 0.11) * 0.25;
      this.camera.position.copy(this.heroCam.pos);
      this.camera.lookAt(this.heroCam.target);
    } else this.controls?.update();
    if (this.shake > 0.001) {
      this.shake *= Math.exp(-dt * 2.5);
      this.camera.position.x += (Math.random() - 0.5) * 0.15 * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * 0.15 * this.shake;
    }

    this.composer.render();
    if (this.onFrame) this.onFrame(this.project);
  }

  private v3 = new THREE.Vector3();
  project: Projector = (x, y, z) => {
    const v = this.v3.set(x, y, z).project(this.camera);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, visible: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
  };

  private updateSteam(dt: number) {
    const { points, per, age } = this.steam;
    const pos = points.geometry.attributes.position.array as Float32Array;
    const size = points.geometry.attributes.aSize.array as Float32Array;
    const alpha = points.geometry.attributes.aAlpha.array as Float32Array;
    let src = 0;
    this.plants.forEach((v, pi) => {
      v.steamFrom.forEach((s) => {
        const act = this.plantActivity[pi];
        const kind = PLANTS[pi].kind;
        const rate = kind === 'ccgt' || kind === 'ocgt' ? 0.18 : 0.12;
        for (let k = 0; k < per; k++) {
          const i = src * per + k;
          age[i] += dt * rate * (0.6 + (k % 5) * 0.12);
          if (age[i] > 1) age[i] -= 1;
          const a = age[i];
          pos[i * 3] = s.x + a * 1.6 + Math.sin(k * 2.1 + a * 4) * 0.12 * a;
          pos[i * 3 + 1] = s.y + a * (kind === 'ccgt' || kind === 'ocgt' ? 0.9 : 1.6);
          pos[i * 3 + 2] = s.z - a * 0.5 + Math.cos(k * 1.3) * 0.1 * a;
          size[i] = (kind === 'ccgt' || kind === 'ocgt' ? 0.08 : 0.16) + a * 0.5;
          alpha[i] = act > 0.02 ? Math.min(1, act * 1.3) * Math.sin(Math.PI * a) * 0.8 : 0;
        }
        src++;
      });
    });
    points.geometry.attributes.position.needsUpdate = true;
    points.geometry.attributes.aSize.needsUpdate = true;
    points.geometry.attributes.aAlpha.needsUpdate = true;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls?.dispose();
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.composer.dispose();
    this.renderer.dispose();
  }
}

/** World positions for DOM labels. */
export const ANCHORS = {
  plant: (id: string) => {
    const s = PLANT_SITE[id];
    return new THREE.Vector3(s.x, terrainY(s.x, s.z) + 1.2, s.z);
  },
  district: (bus: number) => {
    const b = busPos(bus);
    return new THREE.Vector3(b.x, terrainY(b.x, b.z) + 0.4, b.z);
  },
};
