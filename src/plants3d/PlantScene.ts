import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { gsap } from 'gsap';
import { Kit, type Collider, type Emitter } from './kit';
import { glow, puff, rng } from './textures';
import type { Label } from './interiors';

export type Stop = { title: string; body: string; cam: [number, number, number]; look: [number, number, number] };
export type Mode = 'orbit' | 'tour' | 'walk' | 'axo';

export type SiteDef = {
  id: string;
  name: string;
  place: string;
  lat: number;
  kind: string;
  blurb: string;
  facts: [string, string][];
  eras?: { id: string; label: string }[];
  cutaway?: string;
  focus: [number, number, number];
  cam: [number, number, number];
  spawn: [number, number];
  extent: number;
  shadow?: number;
  fog?: number;
  wind?: [number, number];
  groundY: (x: number, z: number) => number;
  build: (k: Kit, labels: Label[]) => { stops: Stop[]; steam?: (tag: string | undefined, era: string) => boolean };
};

const tmp = new THREE.Vector3();

export class PlantScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  ortho: THREE.OrthographicCamera;
  active: THREE.Camera;
  controls: OrbitControls;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  renderPass: RenderPass;
  sky: Sky;
  sun = new THREE.DirectionalLight('#fff4e5', 3);
  moon = new THREE.DirectionalLight('#8ea6d8', 0);
  hemi = new THREE.HemisphereLight('#bcd4ec', '#5a5345', 0.6);
  kit: Kit;
  stops: Stop[] = [];
  labels: Label[] = [];
  mode: Mode = 'orbit';
  hour = 10.5;
  era = '';
  cut = false;
  night = 0;
  onStop?: (i: number) => void;
  onMode?: (m: Mode) => void;
  private steamRule?: (tag: string | undefined, era: string) => boolean;
  private plumes: Plumes;
  private lampPts!: THREE.Points;
  private beaconPts!: THREE.Points;
  private floods!: THREE.InstancedMesh;
  private stars!: THREE.Points;
  private spots: THREE.SpotLight[] = [];
  private envScene = new THREE.Scene();
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private lastEnvHour = -99;
  private water: THREE.MeshStandardMaterial[] = [];
  private clock = new THREE.Clock();
  private raf = 0;
  private grade: ShaderPass;
  private walker: Walker;
  private labelEls: HTMLDivElement[] = [];
  private tourIdx = 0;
  private disposed = false;
  private sunDir = new THREE.Vector3();

  constructor(private host: HTMLElement, private overlay: HTMLElement, public site: SiteDef) {
    const mobile = matchMedia('(max-width: 760px)').matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.55;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true;
    host.appendChild(this.renderer.domElement);

    const w = host.clientWidth, h = host.clientHeight;
    this.camera = new THREE.PerspectiveCamera(42, w / h, 1.5, 60000);
    this.camera.position.set(...site.cam);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -20000, 40000);
    this.active = this.camera;

    // sky
    this.sky = new Sky();
    this.sky.scale.setScalar(30000);
    const su = this.sky.material.uniforms;
    su.turbidity.value = 4;
    su.rayleigh.value = 1.4;
    su.mieCoefficient.value = 0.004;
    su.mieDirectionalG.value = 0.82;
    this.scene.add(this.sky);
    const envSky = new THREE.Mesh(this.sky.geometry, this.sky.material);
    envSky.scale.setScalar(50);
    this.envScene.add(envSky);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.buildStars();

    // light
    const S = site.shadow ?? 420;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(mobile ? 2048 : 4096, mobile ? 2048 : 4096);
    Object.assign(this.sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 10, far: 6000 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target, this.moon, this.moon.target, this.hemi);
    this.scene.fog = new THREE.FogExp2('#b8c4cf', site.fog ?? 0.00011);

    // world
    this.kit = new Kit(site.groundY);
    const built = site.build(this.kit, this.labels);
    this.stops = built.stops;
    this.steamRule = built.steam;
    this.kit.finish();
    this.scene.add(this.kit.root);
    this.kit.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (o.name === 'water' && m && !this.water.includes(m)) this.water.push(m);
    });
    this.era = site.eras?.[0]?.id ?? '';
    this.applyEra();
    this.buildLights();
    this.plumes = new Plumes(this.kit.emitters, new THREE.Vector3(site.wind?.[0] ?? 3, 0, site.wind?.[1] ?? 1));
    for (let i = 0; i < 110; i++) this.plumes.update(0.2, this.camera);
    this.scene.add(this.plumes.points);
    this.buildLabels();

    // controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(...site.focus);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = 1.47;
    this.controls.minDistance = 20;
    this.controls.maxDistance = site.extent * 1.4;
    this.controls.screenSpacePanning = false;
    this.controls.update();

    this.walker = new Walker(this.kit.colliders, site.groundY, this.renderer.domElement);
    this.walker.figure.visible = false;
    this.scene.add(this.walker.figure);

    // post
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.25, 0.6, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uNight: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; uniform float uTime; uniform float uNight; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime) * 43758.5453); }
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          vec2 q = vUv - 0.5;
          c *= 1.0 - dot(q, q) * (0.55 + 0.35 * uNight);
          // filmic split-tone: cool shadows, warm highlights
          float l = dot(c, vec3(0.299,0.587,0.114));
          c = mix(c, c * vec3(0.93, 0.98, 1.06), (1.0 - l) * 0.35);
          c = mix(c, c * vec3(1.04, 1.0, 0.95), l * 0.25);
          c += (h(vUv * 911.0) - 0.5) * 0.022;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.composer.addPass(this.grade);

    this.setHour(this.hour);
    addEventListener('resize', this.resize);
    this.resize();
    this.loop();
  }

  // ------------------------------------------------------------------ build

  private buildStars() {
    const R = rng(9), n = 3000, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = R() * Math.PI * 2, y = Math.pow(R(), 0.6), r = Math.sqrt(1 - y * y);
      p.set([Math.cos(u) * r * 14000, y * 14000, Math.sin(u) * r * 14000], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#dfe7ff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.scene.add(this.stars);
  }

  private buildLights() {
    const k = this.kit;
    const pts = (arr: THREE.Vector3[]) => new THREE.BufferGeometry().setFromPoints(arr.length ? arr : [new THREE.Vector3(0, -999, 0)]);
    this.lampPts = new THREE.Points(pts(k.lamps), new THREE.PointsMaterial({ map: glow(), color: new THREE.Color(3.2, 2.1, 1.1), size: 9, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.beaconPts = new THREE.Points(pts(k.beacons), new THREE.PointsMaterial({ map: glow(), color: new THREE.Color(4, 0.25, 0.15), size: 7, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false }));
    this.scene.add(this.lampPts, this.beaconPts);
    // pools of sodium light on the ground under lamps and around buildings
    const pool = new THREE.CircleGeometry(1, 24);
    pool.rotateX(-Math.PI / 2);
    const src = [...k.lamps.map((p) => ({ pos: p.clone().setY(k.groundY(p.x, p.z)), r: 11 })), ...k.floods];
    this.floods = new THREE.InstancedMesh(pool, new THREE.MeshBasicMaterial({ map: glow('rgba(255,255,255,1)'), color: new THREE.Color(1.0, 0.62, 0.3), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 }), Math.max(1, src.length));
    src.forEach((f, i) => this.floods.setMatrixAt(i, new THREE.Matrix4().compose(f.pos.clone().setY(f.pos.y + 0.15), new THREE.Quaternion(), new THREE.Vector3(f.r, 1, f.r))));
    this.floods.frustumCulled = false;
    this.scene.add(this.floods);
    // architectural uplighting: a handful of real spotlights washing the big shells
    for (const u of k.uplights.slice(0, 14)) {
      const s = new THREE.SpotLight('#ffd2a0', 0, 700, 0.42, 0.85, 2);
      s.position.copy(u.pos);
      s.target.position.copy(u.at);
      this.scene.add(s, s.target);
      this.spots.push(s);
    }
  }

  private buildLabels() {
    for (const l of this.labels) {
      const el = document.createElement('div');
      el.className = 'pv-label';
      el.textContent = l.text;
      this.overlay.appendChild(el);
      this.labelEls.push(el);
    }
  }

  // ------------------------------------------------------------------ public

  setHour(h: number) {
    this.hour = h;
    const lat = THREE.MathUtils.degToRad(this.site.lat);
    const dec = THREE.MathUtils.degToRad(12); // late April / mid August
    const H = THREE.MathUtils.degToRad((h - 12) * 15);
    const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H));
    let az = Math.acos(THREE.MathUtils.clamp((Math.sin(dec) - Math.sin(el) * Math.sin(lat)) / (Math.cos(el) * Math.cos(lat)), -1, 1));
    if (H > 0) az = Math.PI * 2 - az;
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);
    const elD = THREE.MathUtils.radToDeg(el);
    this.night = 1 - THREE.MathUtils.smoothstep(elD, -7, 3);
    const low = 1 - THREE.MathUtils.smoothstep(elD, 2, 28);
    const day = 1 - this.night;
    this.sun.intensity = 4.2 * THREE.MathUtils.smoothstep(elD, -1, 8);
    this.sun.color.setRGB(1, 0.93 - low * 0.32, 0.84 - low * 0.55);
    this.moon.intensity = 1.1 * this.night;
    for (const s of this.spots) s.intensity = 160000 * this.night;
    this.hemi.intensity = 0.06 + 0.12 * day + 0.1 * this.night;
    this.hemi.color.setRGB(0.55 + 0.2 * day, 0.62 + 0.2 * day, 0.8 + 0.1 * day);
    const fog = this.scene.fog as THREE.FogExp2;
    const dayFog = new THREE.Color('#a7b4c0').lerp(new THREE.Color('#d9b48e'), low * 0.8);
    fog.color.copy(dayFog).lerp(new THREE.Color('#0a121e'), this.night);
    this.renderer.toneMappingExposure = 0.4 + 0.5 * this.night;
    this.bloom.strength = 0.12 + 0.8 * this.night;
    this.bloom.threshold = 2.6 - 1.9 * this.night;
    for (const { m, k } of this.kit.nightMats) m.emissiveIntensity = k * this.night;
    (this.lampPts.material as THREE.PointsMaterial).opacity = this.night;
    (this.floods.material as THREE.MeshBasicMaterial).opacity = this.night * 0.32;
    (this.stars.material as THREE.PointsMaterial).opacity = this.night * 0.9;
    this.grade.uniforms.uNight.value = this.night;
    this.plumes.setLight(this.sun.color.clone().multiplyScalar(this.sun.intensity / 4.2), this.night, this.sunDir);
    if (Math.abs(h - this.lastEnvHour) > 0.25) this.updateEnv();
  }

  private updateEnv() {
    this.lastEnvHour = this.hour;
    this.envRT?.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 200);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.1 + 0.12 * (1 - this.night);
  }

  setMode(m: Mode) {
    if (m === this.mode) return;
    const prev = this.mode;
    this.mode = m;
    gsap.killTweensOf(this.camera.position);
    gsap.killTweensOf(this.controls.target);
    this.controls.autoRotate = false;
    this.walker.figure.visible = m === 'walk';
    this.walker.active = m === 'walk';
    this.controls.enabled = m !== 'walk';
    if (prev === 'axo' || m === 'axo') {
      this.active = m === 'axo' ? this.ortho : this.camera;
      this.controls.object = this.active;
      this.renderPass.camera = this.active;
      if (m === 'axo') {
        const t = this.controls.target;
        this.ortho.position.set(t.x + 1500, t.y + 1500 * 0.8165 * 1.22, t.z + 1500);
        this.ortho.zoom = 1;
        this.ortho.lookAt(t);
        this.resize();
      }
    }
    if (m === 'walk') {
      this.walker.place(this.site.spawn[0], this.site.spawn[1], this.camera);
    } else if (prev === 'walk') {
      this.camera.position.set(...this.site.cam);
      this.controls.target.set(...this.site.focus);
    }
    if (m === 'tour') this.tourGo(0);
    this.onMode?.(m);
  }

  tourGo(i: number) {
    if (!this.stops.length) return;
    this.tourIdx = (i + this.stops.length) % this.stops.length;
    const s = this.stops[this.tourIdx];
    this.controls.autoRotate = false;
    gsap.to(this.camera.position, { x: s.cam[0], y: s.cam[1], z: s.cam[2], duration: 4.2, ease: 'power2.inOut' });
    gsap.to(this.controls.target, {
      x: s.look[0], y: s.look[1], z: s.look[2], duration: 4.2, ease: 'power2.inOut',
      onComplete: () => { if (this.mode === 'tour') { this.controls.autoRotate = true; this.controls.autoRotateSpeed = 0.35; } },
    });
    this.onStop?.(this.tourIdx);
  }

  setCutaway(on: boolean) {
    this.cut = on;
    for (const c of this.kit.cutaways) {
      for (const m of c.mats) { m.clippingPlanes = on ? [c.plane] : []; m.clipShadows = true; m.needsUpdate = true; }
      c.inside.visible = on;
    }
  }

  setEra(id: string) {
    this.era = id;
    this.applyEra();
  }

  private applyEra() {
    for (const [name, g] of this.kit.eras) g.visible = name === this.era;
    this.kit.emitters.forEach((e) => { e.rate = this.steamRule ? (this.steamRule(e.tag, this.era) ? 1 : 0) : 1; });
  }

  setMove(x: number, y: number) {
    this.walker.joy.set(x, y);
  }

  // ------------------------------------------------------------------ loop

  private resize = () => {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const half = this.site.extent * 0.55;
    Object.assign(this.ortho, { left: -half * w / h, right: half * w / h, top: half, bottom: -half });
    this.ortho.updateProjectionMatrix();
  };

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    if (this.mode === 'walk') this.walker.update(dt, this.camera);
    else this.controls.update();
    // keep the shadow frustum centred on what we look at
    const focus = this.mode === 'walk' ? this.walker.figure.position : this.controls.target;
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.sunDir.y > 0 ? this.sunDir : tmp.set(0, 1, 0), 2500);
    this.moon.target.position.copy(focus);
    this.moon.position.copy(focus).add(tmp.set(-800, 1600, 600));
    this.plumes.update(dt, this.active);
    for (const m of this.water) if (m.normalMap) { m.normalMap.offset.x = t * 0.004; m.normalMap.offset.y = t * 0.006; }
    const bm = this.beaconPts.material as THREE.PointsMaterial;
    bm.opacity = (0.25 + 0.75 * this.night) * (Math.sin(t * 3.2) > 0.2 ? 1 : 0.05);
    this.grade.uniforms.uTime.value = t % 10;
    if (this.cut) this.placeLabels();
    else for (const el of this.labelEls) el.style.opacity = '0';
    this.composer.render();
  };

  private placeLabels() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.labels.forEach((l, i) => {
      const el = this.labelEls[i];
      l.obj.updateWorldMatrix(true, false);
      tmp.copy(l.at).applyMatrix4(l.obj.matrixWorld).project(this.active);
      const vis = tmp.z < 1 && Math.abs(tmp.x) < 1 && Math.abs(tmp.y) < 1 && l.obj.parent?.visible !== false;
      el.style.opacity = vis ? '1' : '0';
      el.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * w}px, ${(-tmp.y * 0.5 + 0.5) * h}px)`;
    });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.resize);
    this.walker.dispose();
    this.controls.dispose();
    gsap.killTweensOf(this.camera.position);
    gsap.killTweensOf(this.controls.target);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mm = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mm)) mm.forEach((x) => x.dispose());
      else mm?.dispose();
    });
    this.envRT?.dispose();
    this.pmrem.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelEls.forEach((e) => e.remove());
  }
}

// ------------------------------------------------------------------ steam

const MAXP: Record<Emitter['kind'], number> = { steam: 170, smoke: 90, spray: 260 };

class Plumes {
  points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private owner: Int16Array;
  private R = rng(4);
  private mat: THREE.ShaderMaterial;

  constructor(private em: Emitter[], private wind: THREE.Vector3) {
    const n = em.reduce((s, e) => s + MAXP[e.kind], 0) || 1;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n).fill(999);
    this.life = new Float32Array(n).fill(1);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.owner = new Int16Array(n);
    let o = 0;
    em.forEach((e, k) => { for (let i = 0; i < MAXP[e.kind]; i++) this.owner[o++] = k; });
    // pre-age so plumes are already standing when the page opens
    for (let i = 0; i < n; i++) { this.age[i] = -this.R() * 20; this.life[i] = 14 + this.R() * 8; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uMap: { value: puff() }, uSun: { value: new THREE.Color(1, 1, 1) }, uNight: { value: 0 }, uScale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute float aSize; attribute float aAlpha; uniform float uScale; varying float vA; varying float vH;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aSize * uScale / -mv.z, 1.0, 900.0); vA = aAlpha; vH = position.y; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform vec3 uSun; uniform float uNight; varying float vA; varying float vH;
        void main(){ vec4 t = texture2D(uMap, gl_PointCoord);
          float shade = 0.55 + 0.45 * (1.0 - gl_PointCoord.y);
          vec3 day = mix(vec3(0.52,0.56,0.62), vec3(1.0), shade) * (0.35 + 0.75 * uSun);
          // at night the underside picks up the plant's sodium lighting
          vec3 night = mix(vec3(0.05,0.06,0.09), vec3(0.42,0.24,0.12), (1.0 - gl_PointCoord.y) * exp(-max(vH - 80.0, 0.0) / 160.0));
          vec3 c = mix(day, night, uNight);
          gl_FragColor = vec4(c, t.a * vA); }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
  }

  setLight(sun: THREE.Color, night: number, _dir: THREE.Vector3) {
    this.mat.uniforms.uSun.value.copy(sun);
    this.mat.uniforms.uNight.value = night;
  }

  update(dt: number, cam: THREE.Camera) {
    const ortho = (cam as THREE.OrthographicCamera).isOrthographicCamera;
    this.mat.uniforms.uScale.value = ortho ? 0 : 900;
    const n = this.age.length;
    for (let i = 0; i < n; i++) {
      const e = this.em[this.owner[i]];
      if (!e) continue;
      this.age[i] += dt;
      const i3 = i * 3;
      if (this.age[i] < 0) { this.alpha[i] = 0; continue; }
      if (this.age[i] > this.life[i]) {
        if (e.rate <= 0) { this.alpha[i] = 0; continue; }
        const a = this.R() * Math.PI * 2, r = Math.sqrt(this.R()) * e.radius;
        this.pos[i3] = e.pos.x + Math.cos(a) * r;
        this.pos[i3 + 1] = e.pos.y;
        this.pos[i3 + 2] = e.pos.z + Math.sin(a) * r;
        const up = e.kind === 'spray' ? 0 : e.kind === 'smoke' ? 7 : 5 + this.R() * 3;
        const d = e.dir ?? new THREE.Vector3();
        this.vel[i3] = d.x * (0.7 + this.R() * 0.6) + (this.R() - 0.5) * 1.5;
        this.vel[i3 + 1] = up + d.y * (0.7 + this.R() * 0.6);
        this.vel[i3 + 2] = d.z * (0.7 + this.R() * 0.6) + (this.R() - 0.5) * 1.5;
        this.age[i] = 0;
        this.life[i] = e.kind === 'spray' ? 4 + this.R() * 3 : 13 + this.R() * 8;
      }
      const t = this.age[i] / this.life[i];
      const k = e.kind;
      if (k === 'spray') this.vel[i3 + 1] -= 6 * dt;
      else this.vel[i3 + 1] *= 1 - 0.08 * dt;
      const h = Math.max(0, this.pos[i3 + 1] - e.pos.y);
      const drift = k === 'spray' ? 0.3 : Math.min(1, 0.25 + h / 120);
      this.pos[i3] += (this.vel[i3] + this.wind.x * drift) * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += (this.vel[i3 + 2] + this.wind.z * drift) * dt;
      const base = k === 'spray' ? e.radius * 0.6 : e.radius;
      this.size[i] = base * (k === 'spray' ? 0.8 + t * 2 : 0.9 + t * 2.4);
      const fadeIn = Math.min(1, t * 8);
      this.alpha[i] = fadeIn * Math.pow(1 - t, 1.6) * (k === 'smoke' ? 0.35 : k === 'spray' ? 0.5 : 0.8);
    }
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ------------------------------------------------------------------ walking

/** Third-person walker: hard hat, hi-vis vest, WASD + drag to look, collides with buildings. */
class Walker {
  figure = new THREE.Group();
  active = false;
  joy = new THREE.Vector2();
  private keys = new Set<string>();
  private yaw = 0;
  private pitch = 0.18;
  private phase = 0;
  private parts: Record<string, THREE.Object3D> = {};
  private drag: { x: number; y: number } | null = null;
  private dist = 7;

  constructor(private col: Collider[], private gy: (x: number, z: number) => number, private el: HTMLElement) {
    const skin = new THREE.MeshStandardMaterial({ color: '#b98a6a', roughness: 0.7 });
    const vest = new THREE.MeshStandardMaterial({ color: '#ff7a1a', roughness: 0.6, emissive: '#ff5a00', emissiveIntensity: 0.15 });
    const tape = new THREE.MeshStandardMaterial({ color: '#dcdcdc', roughness: 0.2, metalness: 0.8, emissive: '#ffffff', emissiveIntensity: 0.4 });
    const navy = new THREE.MeshStandardMaterial({ color: '#1f2733', roughness: 0.9 });
    const hat = new THREE.MeshStandardMaterial({ color: '#f2f0e8', roughness: 0.35 });
    const boot = new THREE.MeshStandardMaterial({ color: '#2a2018', roughness: 0.8 });
    const add = (name: string, g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.figure) => {
      const o = new THREE.Mesh(g, m);
      o.position.set(x, y, z);
      o.castShadow = true;
      parent.add(o);
      this.parts[name] = o;
      return o;
    };
    add('torso', new THREE.CapsuleGeometry(0.24, 0.5, 4, 12), vest, 0, 1.28, 0);
    add('tape', new THREE.CylinderGeometry(0.255, 0.255, 0.06, 16), tape, 0, 1.2, 0);
    add('tape2', new THREE.CylinderGeometry(0.255, 0.255, 0.06, 16), tape, 0, 1.38, 0);
    add('head', new THREE.SphereGeometry(0.13, 16, 12), skin, 0, 1.78, 0);
    add('hat', new THREE.SphereGeometry(0.155, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hat, 0, 1.82, 0);
    add('brim', new THREE.CylinderGeometry(0.2, 0.2, 0.02, 20), hat, 0, 1.83, 0.02);
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 0.12, 0.9, 0); this.figure.add(hip); this.parts['hip' + s] = hip;
      add('leg' + s, new THREE.CapsuleGeometry(0.09, 0.62, 4, 8), navy, 0, -0.42, 0, hip);
      add('boot' + s, new THREE.BoxGeometry(0.14, 0.1, 0.28), boot, 0, -0.84, 0.05, hip);
      const sh = new THREE.Group(); sh.position.set(s * 0.32, 1.52, 0); this.figure.add(sh); this.parts['sh' + s] = sh;
      add('arm' + s, new THREE.CapsuleGeometry(0.07, 0.52, 4, 8), vest, 0, -0.32, 0, sh);
      add('hand' + s, new THREE.SphereGeometry(0.065, 8, 6), skin, 0, -0.66, 0, sh);
    }
    addEventListener('keydown', this.kd);
    addEventListener('keyup', this.ku);
    el.addEventListener('pointerdown', this.pd);
    addEventListener('pointermove', this.pm);
    addEventListener('pointerup', this.pu);
    el.addEventListener('wheel', this.wh, { passive: true });
  }

  private kd = (e: KeyboardEvent) => { if (this.active) this.keys.add(e.key.toLowerCase()); };
  private ku = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
  private pd = (e: PointerEvent) => { if (this.active) this.drag = { x: e.clientX, y: e.clientY }; };
  private pm = (e: PointerEvent) => {
    if (!this.drag) return;
    this.yaw -= (e.clientX - this.drag.x) * 0.005;
    this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - this.drag.y) * 0.004, -0.15, 1.2);
    this.drag = { x: e.clientX, y: e.clientY };
  };
  private pu = () => { this.drag = null; };
  private wh = (e: WheelEvent) => { if (this.active) this.dist = THREE.MathUtils.clamp(this.dist + e.deltaY * 0.01, 3, 40); };

  place(x: number, z: number, cam: THREE.PerspectiveCamera) {
    this.figure.position.set(x, this.gy(x, z), z);
    this.yaw = Math.atan2(cam.position.x - x, cam.position.z - z) + Math.PI;
    this.update(0, cam);
  }

  private blocked(x: number, z: number) {
    for (const c of this.col) {
      if ('r' in c) { if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 0.4) ** 2) return true; continue; }
      const dx = x - c.x, dz = z - c.z;
      const cs = Math.cos(-c.rot), sn = Math.sin(-c.rot);
      const lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs;
      if (Math.abs(lx) < c.hw + 0.4 && Math.abs(lz) < c.hd + 0.4) return true;
    }
    return false;
  }

  update(dt: number, cam: THREE.PerspectiveCamera) {
    const k = this.keys;
    let f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0) + this.joy.y;
    let s = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + this.joy.x;
    const len = Math.hypot(f, s);
    if (len > 1) { f /= len; s /= len; }
    const run = k.has('shift') || this.joy.length() > 0.95;
    const speed = (run ? 11 : 4.2) * Math.min(1, len);
    const p = this.figure.position;
    if (len > 0.05) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const vx = (fx * f + -fz * s) * speed, vz = (fz * f + fx * s) * speed;
      const nx = p.x + vx * dt, nz = p.z + vz * dt;
      if (!this.blocked(nx, p.z)) p.x = nx;
      if (!this.blocked(p.x, nz)) p.z = nz;
      const face = Math.atan2(vx, vz);
      let d = face - this.figure.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.figure.rotation.y += d * Math.min(1, dt * 10);
      this.phase += dt * speed * 1.6;
    } else this.phase *= 0.9;
    p.y = this.gy(p.x, p.z);
    const sw = Math.sin(this.phase) * Math.min(0.7, speed * 0.09);
    this.parts['hip-1'].rotation.x = sw;
    this.parts['hip1'].rotation.x = -sw;
    this.parts['sh-1'].rotation.x = -sw * 0.8;
    this.parts['sh1'].rotation.x = sw * 0.8;
    this.figure.position.y += Math.abs(Math.cos(this.phase)) * 0.04 * Math.min(1, speed / 4);
    const back = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(this.dist);
    const want = p.clone().add(new THREE.Vector3(0, 1.7, 0)).add(back);
    want.y = Math.max(want.y, this.gy(want.x, want.z) + 0.8);
    cam.position.lerp(want, dt > 0 ? Math.min(1, dt * 8) : 1);
    cam.lookAt(p.x, p.y + 1.6, p.z);
  }

  dispose() {
    removeEventListener('keydown', this.kd);
    removeEventListener('keyup', this.ku);
    this.el.removeEventListener('pointerdown', this.pd);
    removeEventListener('pointermove', this.pm);
    removeEventListener('pointerup', this.pu);
    this.el.removeEventListener('wheel', this.wh);
  }
}
