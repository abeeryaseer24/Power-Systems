// Night-satellite rendering of a real region: settlement lights driven by the
// supply at their nearest substation, transmission coloured by voltage and
// loading, highway traffic and shipping. Units are kilometres.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { MapControls } from 'three/addons/controls/MapControls.js';
import type { RegionData, RegionSim } from '../grid/region';
import { mulberry32, gaussian } from '../grid/profiles';
import { glowTexture } from './builders';

const KIND_COLOR: Record<string, string> = {
  nuclear: '#c9b8ff', coal: '#a39e94', gas: '#f08a5d', oil: '#e2584d', hydro: '#4fa3d1', wind: '#a7e0ea', solar: '#ffd166', bio: '#9ccf7f', battery: '#7cf0b4',
};

function kvColor(kv: number) {
  if (kv >= 700) return new THREE.Color('#e7f6ff');
  if (kv >= 370) return new THREE.Color('#86c5da');
  if (kv >= 270) return new THREE.Color('#6aa6c4');
  if (kv >= 200) return new THREE.Color('#5a8fae');
  return new THREE.Color('#4a7593');
}

export interface Hover {
  kind: 'plant' | 'bus' | 'branch';
  index: number;
  x: number;
  y: number;
}

export class RegionScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  readonly controls: MapControls;
  private lightTex: THREE.DataTexture;
  private lightData: Float32Array;
  private lightTarget: Float32Array;
  private lineGeo!: THREE.BufferGeometry;
  private lineSeg: { branch: number; start: number; count: number }[] = [];
  private plantSprites: THREE.Sprite[] = [];
  private traffic!: { pts: THREE.Points; paths: { p: Float32Array; len: number; cum: Float32Array }[]; state: Float32Array };
  private ships!: { pts: THREE.Points; paths: { p: Float32Array; len: number; cum: Float32Array }[]; state: Float32Array };
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;
  private ro: ResizeObserver;
  private flash = new Map<number, number>();
  private extent: number;
  private shake = 0;
  private uTime = { value: 0 };
  private uDark = { value: 0 };
  onFrame?: (project: (x: number, z: number) => { x: number; y: number; visible: boolean }) => void;
  onPick?: (h: Hover | null) => void;
  /** Cinematic slow orbit when idle (used by the atlas hero). */
  autoOrbit = false;

  constructor(private canvas: HTMLCanvasElement, readonly data: RegionData) {
    this.extent = data.extent;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = new THREE.Color('#03070e');
    this.camera = new THREE.PerspectiveCamera(40, 1, this.extent / 2000, this.extent * 20);
    const [x0, z0, x1, z1] = data.bounds;
    const cx = 0;
    const cz = 0;
    void x0; void z0; void x1; void z1;
    this.camera.position.set(cx + this.extent * 0.05, this.extent * 0.75, cz + this.extent * 0.55);
    const c = new MapControls(this.camera, canvas);
    c.target.set(cx, 0, cz);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.maxPolarAngle = 1.2;
    c.minDistance = this.extent * 0.02;
    c.maxDistance = this.extent * 2.2;
    c.screenSpacePanning = false;
    c.zoomToCursor = true;
    c.update();
    this.controls = c;

    const nB = data.buses.length;
    const size = Math.max(1, nB);
    this.lightData = new Float32Array(size).fill(1);
    this.lightTarget = new Float32Array(size).fill(1);
    this.lightTex = new THREE.DataTexture(this.lightData, size, 1, THREE.RedFormat, THREE.FloatType);
    this.lightTex.needsUpdate = true;

    this.build();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 1.05, 0.5, 0.35);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('click', this.onClick);
    this.loop();
  }

  private nearestBus(x: number, z: number) {
    let best = 0;
    let bd = Infinity;
    this.data.buses.forEach((b, i) => {
      const d = (b.x - x) ** 2 + (b.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  private build() {
    const d = this.data;
    const E = this.extent;
    const rand = mulberry32(3);

    // faint ground so the camera has a horizon
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(E * 8, E * 8), new THREE.MeshBasicMaterial({ color: '#04090f' }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    this.scene.add(ground);
    this.scene.fog = new THREE.Fog('#03070e', E * 1.2, E * 4);

    // coast and rivers
    const lineMesh = (polys: [number, number][][], color: string, opacity: number, y: number) => {
      const pos: number[] = [];
      for (const p of polys) for (let i = 1; i < p.length; i++) pos.push(p[i - 1][0], y, p[i - 1][1], p[i][0], y, p[i][1]);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
      this.scene.add(m);
      return m;
    };
    lineMesh(d.coast, '#2b4e6e', 0.9, 0);
    lineMesh(d.rivers, '#1d4766', 0.85, 0);
    lineMesh(d.roads, '#ff9a3c', 0.16, 0.01);

    // settlement lights, Black Marble style
    const P: number[] = [];
    const ch: number[] = [];
    const sd: number[] = [];
    const col: number[] = [];
    const warm = new THREE.Color('#ffb860');
    const white = new THREE.Color('#fff1d6');
    const spreadK = E / 600;
    for (const pl of d.places) {
      const n = Math.min(900, Math.max(3, Math.round(Math.pow(pl.pop, 0.55) / 4)));
      const sp = Math.max(0.25, Math.pow(pl.pop, 0.33) / 45) * Math.max(0.6, Math.min(2.2, spreadK));
      const bus = this.nearestBus(pl.x, pl.z);
      for (let i = 0; i < n; i++) {
        const r = Math.abs(gaussian(rand)) * sp;
        const a = rand() * Math.PI * 2;
        P.push(pl.x + Math.cos(a) * r, 0.02, pl.z + Math.sin(a) * r);
        ch.push(bus);
        sd.push(rand());
        const c = rand() < 0.2 ? white : warm;
        col.push(c.r, c.g, c.b);
      }
    }
    // roadside lights between settlements
    for (const road of d.roads) {
      for (let i = 1; i < road.length; i++) {
        const [ax, az] = road[i - 1];
        const [bx, bz] = road[i];
        const L = Math.hypot(bx - ax, bz - az);
        const k = Math.floor(L / Math.max(0.6, E / 400));
        for (let j = 0; j < k; j++) {
          if (rand() > 0.35) continue;
          const t = rand();
          const x = ax + (bx - ax) * t;
          const z = az + (bz - az) * t;
          P.push(x, 0.02, z);
          ch.push(this.nearestBus(x, z));
          sd.push(rand() * 0.6);
          col.push(warm.r * 0.8, warm.g * 0.7, warm.b * 0.6);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aChan', new THREE.Float32BufferAttribute(ch, 1));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(sd, 1));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uLight: { value: this.lightTex }, uN: { value: this.lightData.length }, uScale: { value: 1 }, uTime: this.uTime },
      vertexShader: /* glsl */ `
        uniform sampler2D uLight; uniform float uN; uniform float uScale; uniform float uTime;
        attribute float aChan; attribute float aSeed; attribute vec3 aColor;
        varying vec3 vC; varying float vA;
        void main(){
          float L = texture2D(uLight, vec2((aChan + 0.5) / uN, 0.5)).r;
          float on = step(aSeed, L * 1.02 - 0.01);
          // a few lights flicker on generator backup during the blackout
          float backup = step(0.985, fract(aSeed * 91.7)) * (1.0 - on) * (0.5 + 0.5 * sin(uTime * 3.0 + aSeed * 40.0));
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (on + backup * 0.6) * clamp(uScale * 900.0 / -mv.z, 1.2, 4.5) * (0.7 + 0.6 * fract(aSeed * 7.3));
          vA = on * (0.45 + 0.55 * fract(aSeed * 13.1)) + backup * 0.35;
          vC = aColor;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vC; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vC * a * 1.6, a); }`,
    });
    const lights = new THREE.Points(g, mat);
    lights.frustumCulled = false;
    this.scene.add(lights);

    // transmission: one line strip per branch, vertex colours updated live
    const pos: number[] = [];
    const lc: number[] = [];
    d.branches.forEach((br, i) => {
      const pts = br.pts.length >= 2 ? br.pts : [[d.buses[br.a].x, d.buses[br.a].z], [d.buses[br.b].x, d.buses[br.b].z]];
      const start = pos.length / 3;
      for (let k = 1; k < pts.length; k++) {
        pos.push(pts[k - 1][0], 0.05, pts[k - 1][1], pts[k][0], 0.05, pts[k][1]);
        const c = kvColor(br.kv);
        lc.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
      this.lineSeg.push({ branch: i, start, count: pos.length / 3 - start });
    });
    this.lineGeo = new THREE.BufferGeometry();
    this.lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
    const tl = new THREE.LineSegments(this.lineGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    tl.frustumCulled = false;
    this.scene.add(tl);

    // substations
    const sp = new THREE.BufferGeometry();
    sp.setAttribute('position', new THREE.Float32BufferAttribute(d.buses.flatMap((b) => [b.x, 0.06, b.z]), 3));
    const subs = new THREE.Points(sp, new THREE.PointsMaterial({ color: '#d9eef6', size: 3, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false }));
    this.scene.add(subs);

    // plants: glowing sprites scaled by capacity
    const tex = glowTexture();
    for (const p of d.plants) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(KIND_COLOR[p.kind] ?? '#ffffff'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.position.set(p.x, 0.3, p.z);
      s.scale.setScalar(Math.max(E / 220, Math.sqrt(p.mw) * E / 2600));
      this.scene.add(s);
      this.plantSprites.push(s);
    }

    // traffic on the highways and ships on rivers / along the coast
    const mkPaths = (polys: [number, number][][]) =>
      polys
        .filter((p) => p.length > 1)
        .map((p) => {
          const arr = new Float32Array(p.flat());
          const cum = new Float32Array(p.length);
          for (let i = 1; i < p.length; i++) cum[i] = cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
          return { p: arr, len: cum[p.length - 1], cum };
        })
        .filter((x) => x.len > E / 200);
    const roadPaths = mkPaths(d.roads);
    const offsetCoast = d.coast.map((poly) =>
      poly.map((pt, i) => {
        const a = poly[Math.max(0, i - 1)];
        const b = poly[Math.min(poly.length - 1, i + 1)];
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const L = Math.hypot(dx, dz) || 1;
        // OSM coastlines keep land on the left, so the sea is to the right
        const off = E / 90;
        return [pt[0] - (dz / L) * off, pt[1] + (dx / L) * off] as [number, number];
      }),
    );
    const shipPaths = mkPaths([...d.rivers, ...offsetCoast]);
    this.traffic = this.movers(roadPaths, Math.min(2600, roadPaths.length * 6), ['#fff4dc', '#ff3b2f'], E / 180);
    this.ships = this.movers(shipPaths, Math.min(260, shipPaths.length * 2 + 20), ['#d8f3ff', '#7cff9e', '#ff5a4a'], E / 1400);
  }

  private movers(paths: { p: Float32Array; len: number; cum: Float32Array }[], n: number, colors: string[], speed: number) {
    const rand = mulberry32(11);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const state = new Float32Array(n * 4); // path, s, dir, speed
    const total = paths.reduce((a, p) => a + p.len, 0);
    for (let i = 0; i < n; i++) {
      // pick a path weighted by length
      let r = rand() * total;
      let k = 0;
      while (k < paths.length - 1 && r > paths[k].len) r -= paths[k++].len;
      const dir = rand() < 0.5 ? 1 : -1;
      state.set([k, rand() * (paths[k]?.len ?? 0), dir, speed * (0.6 + rand() * 0.8)], i * 4);
      const c = new THREE.Color(colors.length === 2 ? colors[dir > 0 ? 0 : 1] : colors[Math.floor(rand() * colors.length)]);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uDark: this.uDark },
      vertexShader: `attribute vec3 aColor; varying vec3 vC; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; vC = aColor; gl_PointSize = clamp(500.0 / -mv.z, 1.5, 4.0); }`,
      fragmentShader: `varying vec3 vC; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); gl_FragColor = vec4(vC*a*2.2, a); }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    return { pts, paths, state };
  }

  private moveAlong(m: { pts: THREE.Points; paths: { p: Float32Array; len: number; cum: Float32Array }[]; state: Float32Array }, dt: number) {
    if (!m.paths.length) return;
    const pos = m.pts.geometry.attributes.position.array as Float32Array;
    const n = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const k = m.state[i * 4];
      const path = m.paths[k];
      let s = m.state[i * 4 + 1] + m.state[i * 4 + 2] * m.state[i * 4 + 3] * dt;
      if (s > path.len) s -= path.len;
      if (s < 0) s += path.len;
      m.state[i * 4 + 1] = s;
      // binary search the segment
      let lo = 0;
      let hi = path.cum.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (path.cum[mid] < s) lo = mid;
        else hi = mid;
      }
      const seg = path.cum[hi] - path.cum[lo] || 1;
      const t = (s - path.cum[lo]) / seg;
      pos[i * 3] = path.p[lo * 2] + (path.p[hi * 2] - path.p[lo * 2]) * t;
      pos[i * 3 + 1] = 0.04;
      pos[i * 3 + 2] = path.p[lo * 2 + 1] + (path.p[hi * 2 + 1] - path.p[lo * 2 + 1]) * t;
    }
    m.pts.geometry.attributes.position.needsUpdate = true;
  }

  // ------------------------------------------------------------ live state

  private sim?: RegionSim;
  attach(sim: RegionSim) {
    this.sim = sim;
    for (let i = 0; i < this.lightData.length; i++) this.lightData[i] = this.lightTarget[i] = 1;
  }

  kick(a = 1) {
    this.shake = Math.min(1.5, this.shake + a);
  }

  /** Documentary camera: slow push-in and drift, a target bloom, eased every frame. */
  private cine = { on: false, push: 0, drift: 0, bloom: 1.05, exposure: 1, minDist: 0 };

  /**
   * Frame a cinematic shot around the region centre. `dist` is a fraction of the region extent,
   * `push` the fraction of distance closed per second, `drift` the orbit rate in rad/s.
   */
  shot(opts: { dist: number; push?: number; drift?: number; bloom?: number; exposure?: number; tilt?: number; cut?: boolean }) {
    const c = this.controls;
    const first = !this.cine.on;
    this.cine.on = true;
    this.cine.push = opts.push ?? 0.012;
    this.cine.drift = opts.drift ?? 0.02;
    this.cine.bloom = opts.bloom ?? 1.05;
    this.cine.exposure = opts.exposure ?? 1;
    if (first || opts.cut) {
      // a cut changes exposure at once, as a film edit would
      this.bloom.strength = this.cine.bloom;
      this.renderer.toneMappingExposure = this.cine.exposure;
    }
    this.cine.minDist = this.extent * 0.08;
    const dist = this.extent * opts.dist;
    const tilt = opts.tilt ?? 0.95; // ratio of height to ground distance
    const ang = Math.atan2(this.camera.position.x - c.target.x, this.camera.position.z - c.target.z) + (opts.cut ? 0.6 : 0);
    const ground = dist / Math.sqrt(1 + tilt * tilt);
    const to = new THREE.Vector3(Math.sin(ang) * ground, ground * tilt, Math.cos(ang) * ground);
    const from = this.camera.position.clone().sub(c.target);
    if (opts.cut) {
      this.camera.position.copy(c.target).add(to);
      return;
    }
    const t0 = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / 2600);
      const e = 1 - Math.pow(1 - t, 3);
      this.camera.position.copy(c.target).add(from.clone().lerp(to, e));
      if (t < 1 && !this.disposed) requestAnimationFrame(step);
    };
    step();
  }

  /** Fly to a point at a given viewing distance. */
  focus(x: number, z: number, dist: number) {
    const c = this.controls;
    const from = c.target.clone();
    const fromPos = this.camera.position.clone();
    const dir = fromPos.clone().sub(from).normalize();
    const to = new THREE.Vector3(x, 0, z);
    const toPos = to.clone().add(dir.multiplyScalar(dist));
    const t0 = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / 1400);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      c.target.lerpVectors(from, to, e);
      this.camera.position.lerpVectors(fromPos, toPos, e);
      if (t < 1 && !this.disposed) requestAnimationFrame(step);
    };
    step();
  }

  private syncFromSim(dt: number) {
    const s = this.sim;
    if (!s) return;
    const n = this.data.buses.length;
    let dark = 0;
    for (let i = 0; i < n; i++) {
      const b = s.buses[i];
      const frac = b.demand > 0 ? b.served / b.demand : b.live ? 1 : 0;
      this.lightTarget[i] = b.live ? Math.min(1, frac) : 0;
      dark += 1 - this.lightTarget[i];
      const d = this.lightTarget[i] - this.lightData[i];
      // lights die fast and come back slowly
      this.lightData[i] += d * Math.min(1, dt * (d < 0 ? 6 : 1.2));
    }
    this.uDark.value = dark / n;
    this.lightTex.needsUpdate = true;
    // lines
    const colAttr = this.lineGeo.attributes.color as THREE.BufferAttribute;
    const arr = colAttr.array as Float32Array;
    const c = new THREE.Color();
    const t = this.uTime.value;
    for (const seg of this.lineSeg) {
      const br = s.branches[seg.branch];
      const kv = br.def.kv;
      if (br.tripped && !this.flash.has(seg.branch)) this.flash.set(seg.branch, t);
      const fl = this.flash.get(seg.branch);
      if (!br.closed) {
        const age = fl !== undefined ? t - fl : 99;
        if (age < 1.6) c.set('#ff5b4f').multiplyScalar(2.6 * (1 - age / 1.6) * (0.6 + 0.4 * Math.sin(age * 40)));
        else c.set('#3a1414').multiplyScalar(0.6);
      } else if (!s.buses[br.def.a].live) c.set('#10202e');
      else {
        const L = br.loading;
        c.copy(kvColor(kv));
        if (L > 1) c.set('#c9b8ff').multiplyScalar(1.6 + Math.random());
        else if (L > 0.9) c.set('#ff5b4f').multiplyScalar(1.4);
        else if (L > 0.7) c.lerp(new THREE.Color('#ffb04d'), (L - 0.7) / 0.2).multiplyScalar(1.2);
        else c.multiplyScalar(0.7 + L * 0.6);
        // overvoltage glints violet, undervoltage dims
        const V = Math.min(s.buses[br.def.a].V, s.buses[br.def.b].V);
        if (V < 0.9) c.multiplyScalar(0.5 + V * 0.4);
        if (Math.max(s.buses[br.def.a].V, s.buses[br.def.b].V) > 1.1) c.lerp(new THREE.Color('#d6b8ff'), 0.6);
      }
      for (let k = 0; k < seg.count; k++) arr.set([c.r, c.g, c.b], (seg.start + k) * 3);
    }
    colAttr.needsUpdate = true;
    s.gens.forEach((g, i) => {
      const sp = this.plantSprites[i];
      if (!sp) return; // plants added at run time have no sprite
      const m = sp.material as THREE.SpriteMaterial;
      m.opacity = g.online ? 0.35 + 0.65 * Math.min(1, g.p / Math.max(1, g.def.mw)) : g.tripReason ? 0.18 + 0.12 * Math.sin(t * 6) : 0.08;
      if (g.tripReason) m.color.set('#ff5b4f');
      else m.color.set(KIND_COLOR[g.def.kind] ?? '#fff');
    });
  }

  // ------------------------------------------------------------ picking

  private raycaster = new THREE.Raycaster();
  private pick(e: MouseEvent): Hover | null {
    const r = this.canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let best: Hover | null = null;
    let bd = 14 * 14;
    const v = new THREE.Vector3();
    const test = (kind: Hover['kind'], index: number, x: number, z: number, w = 1) => {
      v.set(x, 0, z).project(this.camera);
      if (v.z > 1) return;
      const sx = ((v.x + 1) / 2) * r.width;
      const sy = ((1 - v.y) / 2) * r.height;
      const d = ((sx - mx) ** 2 + (sy - my) ** 2) * w;
      if (d < bd) {
        bd = d;
        best = { kind, index, x: sx, y: sy };
      }
    };
    this.data.plants.forEach((p, i) => test('plant', i, p.x, p.z, 0.6));
    this.data.buses.forEach((b, i) => test('bus', i, b.x, b.z));
    if (!best) {
      this.data.branches.forEach((br, i) => {
        const pts = br.pts;
        const mid = pts.length ? pts[Math.floor(pts.length / 2)] : [this.data.buses[br.a].x, this.data.buses[br.a].z];
        test('branch', i, mid[0], mid[1], 1.4);
      });
    }
    void this.raycaster;
    return best;
  }
  private onMove = (e: PointerEvent) => {
    if (e.buttons) return;
    this.hover = this.pick(e);
  };
  hover: Hover | null = null;
  private onClick = (e: MouseEvent) => this.onPick?.(this.pick(e));

  // ------------------------------------------------------------ loop

  private resize() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.frame();
  };

  frame() {
    const dt = Math.min(0.1, this.clock.getDelta());
    this.uTime.value += dt;
    this.syncFromSim(dt);
    this.moveAlong(this.traffic, dt * (1 - this.uDark.value * 0.7));
    this.moveAlong(this.ships, dt);
    if (this.autoOrbit) {
      const c = this.controls;
      const off = this.camera.position.clone().sub(c.target);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.03);
      this.camera.position.copy(c.target).add(off);
    }
    if (this.cine.on) {
      const c = this.controls;
      const off = this.camera.position.clone().sub(c.target);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * this.cine.drift);
      if (off.length() > this.cine.minDist) off.multiplyScalar(1 - dt * this.cine.push);
      this.camera.position.copy(c.target).add(off);
      this.bloom.strength += (this.cine.bloom - this.bloom.strength) * Math.min(1, dt * 1.5);
      this.renderer.toneMappingExposure += (this.cine.exposure - this.renderer.toneMappingExposure) * Math.min(1, dt * 1.5);
    }
    this.controls.update();
    if (this.shake > 0.001) {
      this.shake *= Math.exp(-dt * 2.5);
      const k = this.extent * 0.002 * this.shake;
      this.camera.position.x += (Math.random() - 0.5) * k;
      this.camera.position.y += (Math.random() - 0.5) * k;
    }
    this.composer.render();
    if (this.onFrame) {
      const v = new THREE.Vector3();
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      this.onFrame((x, z) => {
        v.set(x, 0, z).project(this.camera);
        return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, visible: v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 };
      });
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('click', this.onClick);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | undefined;
      (mat as THREE.Material | undefined)?.dispose?.();
    });
    this.lightTex.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}

export { KIND_COLOR };
