import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { gsap } from 'gsap';
import { glow, rng } from '../plants3d/textures';
import { CITY, DISTRICTS, GRID_SUBS, LINES, RIVER_W, along, coastZ, polyLength, riverX } from './meridia';
import { generate, KIND_INDEX, wet } from './layout';
import { DC, TRAIN, type TractionSim } from './metro';
import { SEASONS, type Season } from './demand';

// The 3D twin of Meridia. Everything visible is driven by the engine:
// window lights follow the demand model, street lighting follows the sun,
// trains move as the traction simulation moves them, and the flow particles
// travel along the catenary at a speed set by the solved DC currents.

export type Pick = { type: 'train'; id: number } | { type: 'tss'; line: number; idx: number } | { type: 'sub'; id: string } | { type: 'district'; id: string } | { type: 'station'; line: number; idx: number };

export type SceneState = {
  hour: number;
  season: Season;
  districts: { lit: [number, number, number, number]; up: boolean; street: number }[];
  subs: { load: number; up: boolean }[]; // load as a fraction of rating
  sim: TractionSim;
};

const DECK = 13; // viaduct deck height, m
const W = 16000, D = 10800, X0 = -8000, Z0 = -6200; // ground texture footprint

export class TwinScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private sky: Sky;
  private sun = new THREE.DirectionalLight('#fff4e0', 4);
  private hemi = new THREE.HemisphereLight('#bcd2e8', '#3a3328', 0.4);
  private moon = new THREE.DirectionalLight('#9fb4dc', 0);
  private stars!: THREE.Points;
  private nightDome!: THREE.Mesh;
  private night = 0;
  private bUniforms = {
    uLit: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) },
    uOn: { value: new Array(12).fill(1) as number[] },
    uNight: { value: 0 },
    uHi: { value: -1 },
  };
  private gUniforms = {
    uStreet: { value: new Array(12).fill(0) as number[] },
    uRects: { value: DISTRICTS.map((d) => new THREE.Vector4(...d.rect)) },
    uNight: { value: 0 },
    uHi: { value: -1 },
  };
  private cars: THREE.InstancedMesh[] = [];
  private carMat!: THREE.MeshStandardMaterial;
  private trainGlow: THREE.Points;
  private tssGlow: THREE.Sprite[] = [];
  private tssPos: THREE.Vector3[][] = [];
  private subGlow: THREE.Sprite[] = [];
  private flow: { pts: THREE.Points; s: Float32Array; lat: Float32Array; line: number }[] = [];
  private flowOn = true;
  private stationPos: THREE.Vector3[][] = [];
  private lineLen = LINES.map((l) => polyLength(l.path));
  private trainHeads = new Map<number, THREE.Vector3>();
  private raf = 0;
  private last = performance.now();
  private shadowAt = new THREE.Vector3(1e9, 0, 0);
  private lastHour = -1;
  private disposed = false;
  onFrame?: (dt: number) => void;
  state?: SceneState;
  selected: Pick | null = null;
  private ring: THREE.Mesh;

  constructor(private host: HTMLElement, opts: { view?: 'city' | 'metro' } = {}) {
    const mobile = matchMedia('(max-width: 760px)').matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = !mobile;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    host.appendChild(this.renderer.domElement);
    const w = host.clientWidth, h = host.clientHeight;
    this.camera = new THREE.PerspectiveCamera(40, w / h, 5, 90000);

    this.sky = new Sky();
    this.sky.scale.setScalar(60000);
    const su = this.sky.material.uniforms;
    su.turbidity.value = 3.2; su.rayleigh.value = 1.3; su.mieCoefficient.value = 0.003; su.mieDirectionalG.value = 0.86;
    this.scene.add(this.sky);
    this.buildNightSky();
    this.scene.fog = new THREE.FogExp2('#a9b8c6', 0.000024);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -1400, right: 1400, top: 1400, bottom: -1400, near: 10, far: 9000 });
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 1.2;
    this.scene.add(this.sun, this.sun.target, this.hemi, this.moon, this.moon.target);

    this.buildGround();
    this.buildWater();
    this.buildHills();
    this.buildBuildings();
    this.buildMetro();
    this.buildGrid();
    this.trainGlow = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ map: glow(), size: 70, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.trainGlow.frustumCulled = false;
    this.scene.add(this.trainGlow);
    this.buildFlow();
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), new THREE.MeshBasicMaterial({ color: '#ffb04d', transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide, fog: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 10;
    this.ring.visible = false;
    this.scene.add(this.ring);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.maxPolarAngle = 1.42;
    this.controls.minDistance = 80;
    this.controls.maxDistance = 26000;
    this.controls.screenSpacePanning = false;
    this.view(opts.view ?? 'city', false);

    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: mobile ? 0 : 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.8, 0.55, 0.8);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uNight: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uNight; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; vec2 q = vUv - 0.5;
          c *= 1.0 - dot(q,q) * (0.5 + 0.4 * uNight);
          float g = dot(c, vec3(0.299,0.587,0.114)); c = mix(vec3(g), c, 1.12);
          float l = dot(c, vec3(0.299,0.587,0.114));
          c = mix(c, c * vec3(0.92,0.98,1.07), (1.0 - l) * 0.4);
          c = mix(c, c * vec3(1.05,1.0,0.94), l * 0.25);
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.composer.addPass(this.grade);
    addEventListener('resize', this.resize);
    this.resize();
    this.loop();
  }

  // ------------------------------------------------------------------ build

  private buildNightSky() {
    const R = rng(5), n = 2600, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = R() * Math.PI * 2, y = Math.pow(R(), 0.6), r = Math.sqrt(1 - y * y);
      p.set([Math.cos(u) * r * 40000, y * 40000, Math.sin(u) * r * 40000], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#e6ecff', size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.nightDome = new THREE.Mesh(new THREE.SphereGeometry(42000, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, fog: false, uniforms: { uNight: { value: 0 } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uNight; varying vec3 vD; void main(){ float y = max(vD.y, 0.0);
        vec3 c = mix(vec3(0.06,0.07,0.11), vec3(0.01,0.018,0.05), pow(y, 0.45));
        c += vec3(0.32,0.17,0.07) * exp(-y * 10.0) * 0.6; // sodium sky-glow over the city
        gl_FragColor = vec4(c, uNight); }`,
    }));
    this.nightDome.renderOrder = -1;
    this.scene.add(this.stars, this.nightDome);
  }

  private buildGround() {
    const { streets } = generate();
    // colour map: land use tints, parks, the river and beaches
    const CW = 2048, CH = Math.round((CW * D) / W);
    const cv = document.createElement('canvas');
    cv.width = CW; cv.height = CH;
    const g = cv.getContext('2d')!;
    const px = (x: number) => ((x - X0) / W) * CW, pz = (z: number) => ((z - Z0) / D) * CH;
    g.fillStyle = '#6f7556';
    g.fillRect(0, 0, CW, CH);
    const R = rng(77);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${90 + R() * 40},${95 + R() * 35},${60 + R() * 20},0.35)`;
      g.beginPath(); g.ellipse(R() * CW, R() * CH, 10 + R() * 60, 8 + R() * 40, R() * 3, 0, 7); g.fill();
    }
    for (const d of DISTRICTS) {
      const [x0, z0, x1, z1] = d.rect;
      g.fillStyle = d.colour;
      g.globalAlpha = 0.85;
      g.fillRect(px(x0), pz(z0), px(x1) - px(x0), pz(z1) - pz(z0));
      g.globalAlpha = 1;
      for (let i = 0; i < 14; i++) {
        g.fillStyle = 'rgba(86,110,64,0.75)';
        const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
        if (!wet(x, z)) g.fillRect(px(x), pz(z), 6 + R() * 18, 6 + R() * 14);
      }
    }
    // the mask: street brightness in one channel, sampled by the night shader
    const MW = 4096, MH = Math.round((MW * D) / W);
    const mv = document.createElement('canvas');
    mv.width = MW; mv.height = MH;
    const m = mv.getContext('2d')!;
    m.fillStyle = '#000'; m.fillRect(0, 0, MW, MH);
    const mx = (x: number) => ((x - X0) / W) * MW, mz = (z: number) => ((z - Z0) / D) * MH;
    for (const s of streets) {
      g.strokeStyle = s.major ? '#4a4a48' : '#5e5d58';
      g.lineWidth = s.major ? 2.2 : 1;
      g.beginPath(); g.moveTo(px(s.x0), pz(s.z0)); g.lineTo(px(s.x1), pz(s.z1)); g.stroke();
      m.strokeStyle = s.major ? '#fff' : '#8a8a8a';
      m.lineWidth = s.major ? 3.2 : 1.4;
      m.beginPath(); m.moveTo(mx(s.x0), mz(s.z0)); m.lineTo(mx(s.x1), mz(s.z1)); m.stroke();
    }
    // inter-district highways
    m.strokeStyle = '#fff'; g.strokeStyle = '#3c3c3b'; m.lineWidth = 4; g.lineWidth = 3;
    for (const z of [-2600, 900]) { for (const c of [g, m]) { c.beginPath(); c.moveTo(c === g ? px(-7600) : mx(-7600), c === g ? pz(z) : mz(z)); c.lineTo(c === g ? px(7600) : mx(7600), c === g ? pz(z) : mz(z)); c.stroke(); } }
    // blank the wet parts of the mask, paint the river and shore
    g.fillStyle = '#2f4a52'; m.fillStyle = '#000';
    for (let z = Z0; z < Z0 + D; z += 20) {
      const rx = riverX(z);
      g.fillRect(px(rx - RIVER_W / 2), pz(z), (RIVER_W / W) * CW, (24 / D) * CH);
      m.fillRect(mx(rx - RIVER_W / 2 - 8), mz(z), ((RIVER_W + 16) / W) * MW, (24 / D) * MH);
    }
    for (let x = X0; x < X0 + W; x += 20) {
      const cz = coastZ(x);
      g.fillStyle = '#b9ad8c';
      g.fillRect(px(x), pz(cz - 50), (24 / W) * CW, (60 / D) * CH);
      g.fillStyle = '#2f4a52';
      g.fillRect(px(x), pz(cz), (24 / W) * CW, CH);
      m.fillRect(mx(x), mz(cz - 20), (24 / W) * MW, MH);
    }
    const map = new THREE.CanvasTexture(cv);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    const mask = new THREE.CanvasTexture(mv);
    mask.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.95 });
    const U = this.gUniforms;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, { uMask: { value: mask } });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <project_vertex>', '#include <project_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vW; uniform sampler2D uMask; uniform float uStreet[12]; uniform vec4 uRects[11]; uniform float uNight; uniform float uHi;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          vec2 muv = vec2((vW.x - ${X0.toFixed(1)}) / ${W.toFixed(1)}, 1.0 - (vW.z - ${Z0.toFixed(1)}) / ${D.toFixed(1)});
          float st = texture2D(uMask, muv).r;
          float lv = 0.0;
          for (int i = 0; i < 11; i++) { vec4 r = uRects[i]; if (vW.x > r.x && vW.x < r.z && vW.z > r.y && vW.z < r.w) lv = uStreet[i]; }
          // highways between districts stay lit as long as any of the grid is up
          if (lv == 0.0 && st > 0.6) lv = uStreet[11];
          float hi = uHi == 5.0 ? 1.8 : (uHi >= 0.0 ? 0.4 : 1.0);
          totalEmissiveRadiance += vec3(1.0, 0.56, 0.2) * st * st * lv * hi * 1.3;
          if (uHi == 5.0) totalEmissiveRadiance += vec3(1.0, 0.7, 0.3) * st * lv * 0.4 * (1.0 - uNight);`);
    };
    // flipY: canvas row 0 is the north edge (Z0); plane uv v=1 at the north edge after the rotation
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(X0 + W / 2, 0, Z0 + D / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);
    // countryside beyond the city
    const far = new THREE.Mesh(new THREE.RingGeometry(9000, 70000, 64, 1), new THREE.MeshStandardMaterial({ color: '#5d6648', roughness: 1 }));
    far.rotation.x = -Math.PI / 2;
    far.position.y = -0.5;
    this.scene.add(far);
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(W + 4000, D + 4000), new THREE.MeshStandardMaterial({ color: '#626a4c', roughness: 1 }));
    fill.rotation.x = -Math.PI / 2;
    fill.position.set(0, -0.8, (Z0 + D / 2));
    this.scene.add(fill);
  }

  private buildWater() {
    const shape = new THREE.Shape();
    const pts: THREE.Vector2[] = [];
    for (let x = -12000; x <= 12000; x += 100) pts.push(new THREE.Vector2(x, -coastZ(x)));
    shape.moveTo(-70000, -coastZ(-12000));
    pts.forEach((p) => shape.lineTo(p.x, p.y));
    shape.lineTo(70000, -coastZ(12000));
    shape.lineTo(70000, -70000);
    shape.lineTo(-70000, -70000);
    const sea = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: '#1d3a46', roughness: 0.16, metalness: 0.15, side: THREE.DoubleSide }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = 0.6;
    this.scene.add(sea);
    const rp: THREE.Vector3[] = [];
    for (let z = -12000; z <= coastZ(riverX(3000)) + 40; z += 60) rp.push(new THREE.Vector3(riverX(z), 0.7, z));
    const pos: number[] = [], idx: number[] = [];
    rp.forEach((p, i) => {
      pos.push(p.x - RIVER_W / 2, p.y, p.z, p.x + RIVER_W / 2, p.y, p.z);
      if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    });
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    rg.setIndex(idx);
    rg.computeVertexNormals();
    this.scene.add(new THREE.Mesh(rg, sea.material));
  }

  private buildHills() {
    const g = new THREE.PlaneGeometry(60000, 16000, 160, 40);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      const t = (y + 8000) / 16000;
      const n = Math.sin(x / 2300) * 0.5 + Math.sin(x / 900 + 1.3) * 0.3 + Math.sin(x / 410 + y / 700) * 0.15;
      p.setZ(i, Math.max(0, t * (650 + 380 * n)));
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#4f5a44', roughness: 1, flatShading: true }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, -2, -6200 - 8800);
    this.scene.add(m);
  }

  private buildBuildings() {
    const { buildings } = generate();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const n = buildings.length;
    const info = new Float32Array(n * 4);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.02 });
    const U = this.bUniforms;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aInfo; varying vec4 vInfo; varying vec3 vW; varying vec3 vWN;')
        .replace('#include <project_vertex>', `#include <project_vertex>
          vInfo = aInfo;
          vW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
          vWN = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec4 vInfo; varying vec3 vW; varying vec3 vWN;
          uniform vec4 uLit[12]; uniform float uOn[12]; uniform float uNight; uniform float uHi;
          float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
          float winMask; float winLit;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            int di = int(vInfo.x + 0.5); int kind = int(vInfo.y + 0.5);
            vec4 L = uLit[di];
            float lit = kind == 0 ? L.x : kind == 1 ? L.y : kind == 2 ? L.z : L.w;
            winMask = 0.0; winLit = 0.0;
            if (abs(vWN.y) < 0.5) {
              vec2 t = normalize(vec2(-vWN.z, vWN.x));
              float u = dot(vW.xz, t);
              float cw = kind == 2 ? 7.0 : (kind == 1 ? 2.6 : 3.4);
              float ch = kind == 2 ? 9.0 : 3.3;
              vec2 cell = vec2(floor(u / cw), floor((vW.y - 1.2) / ch));
              vec2 f = vec2(fract(u / cw), fract((vW.y - 1.2) / ch));
              float mx = kind == 1 ? 0.06 : 0.2;
              winMask = step(mx, f.x) * step(f.x, 1.0 - mx) * step(0.22, f.y) * step(f.y, kind == 1 ? 0.92 : 0.78) * step(1.2, vW.y);
              if (kind == 2) winMask *= step(0.6, f.y) * 0.6;
              float r = h21(cell + vInfo.z * 97.0);
              winLit = winMask * smoothstep(r - 0.04, r + 0.04, lit) * uOn[di];
            }
            float hiK = uHi >= 0.0 && uHi < 4.0 ? (abs(float(kind) - uHi) < 0.5 ? 1.0 : 0.0) : -1.0;
            diffuseColor.rgb *= mix(1.0, 0.42, winMask);
            if (hiK == 0.0 || uHi >= 4.0) diffuseColor.rgb *= 0.5;
            if (hiK == 1.0) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.62, 0.25), 0.35);
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            int kind = int(vInfo.y + 0.5);
            vec3 wc = kind == 0 ? vec3(1.0, 0.66, 0.34) : kind == 1 ? vec3(0.78, 0.88, 1.0) : kind == 2 ? vec3(1.0, 0.75, 0.4) : vec3(0.85, 0.95, 0.9);
            float k = 0.06 + 1.05 * uNight;
            float hiK = uHi >= 0.0 && uHi < 4.0 ? (abs(float(kind) - uHi) < 0.5 ? 1.6 : 0.15) : (uHi >= 4.0 ? 0.25 : 1.0);
            totalEmissiveRadiance += wc * winLit * k * hiK;
          }`);
    };
    const im = new THREE.InstancedMesh(geo, mat, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    const R = rng(3);
    const palette: Record<string, string[]> = {
      res: ['#cfc6b4', '#d8cfbf', '#bfb6a6', '#c9b9a0', '#e0d8c8', '#b8a990', '#a9a091'],
      com: ['#9fb0bd', '#8c99a3', '#c8ccc8', '#7d8d98', '#b4b8b2', '#d6d2c6'],
      ind: ['#a5a39c', '#8f9592', '#b6b0a2', '#7f8584'],
      inst: ['#c9b49a', '#b9a68e', '#d2c3a8'],
    };
    buildings.forEach((b, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rot);
      m4.compose(new THREE.Vector3(b.x, 0, b.z), q, new THREE.Vector3(b.w, b.h, b.d));
      im.setMatrixAt(i, m4);
      const p = palette[b.kind];
      col.set(p[Math.floor(R() * p.length)]);
      im.setColorAt(i, col);
      info.set([b.district, KIND_INDEX[b.kind], b.seed, 0], i * 4);
    });
    geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
    im.castShadow = true;
    im.receiveShadow = true;
    this.scene.add(im);
  }

  private buildMetro() {
    const concrete = new THREE.MeshStandardMaterial({ color: '#b3ada2', roughness: 0.9 });
    const deckG: THREE.BufferGeometry[] = [], pierG: THREE.BufferGeometry[] = [], railG: THREE.BufferGeometry[] = [];
    LINES.forEach((l, li) => {
      const L = this.lineLen[li];
      const step = 30;
      for (let s = 0; s < L; s += step) {
        const a = along(l.path, s), b = along(l.path, Math.min(L, s + step));
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        if (len < 1) continue;
        const ang = Math.atan2(b.x - a.x, b.z - a.z);
        const box = new THREE.BoxGeometry(10, 1.9, len + 0.6);
        box.rotateY(ang);
        box.translate((a.x + b.x) / 2, DECK, (a.z + b.z) / 2);
        deckG.push(box);
        for (const off of [-2.2, 2.2]) {
          const rr = new THREE.BoxGeometry(0.35, 0.3, len + 0.6);
          rr.rotateY(ang);
          rr.translate((a.x + b.x) / 2 + off * Math.cos(ang), DECK + 1.1, (a.z + b.z) / 2 - off * Math.sin(ang));
          railG.push(rr);
        }
        {
          const pier = new THREE.CylinderGeometry(1.1, 1.3, DECK - 1, 8);
          pier.translate(a.x, (DECK - 1) / 2, a.z);
          pierG.push(pier);
        }
      }
      // stations
      this.stationPos[li] = [];
      for (const st of l.stations) {
        const a = along(l.path, st.s);
        const ang = Math.atan2(a.tx, a.tz);
        const g = new THREE.BoxGeometry(24, 9, 150);
        g.rotateY(ang);
        g.translate(a.x, DECK + 4.5, a.z);
        deckG.push(g);
        const roof = new THREE.BoxGeometry(28, 1, 156);
        roof.rotateY(ang);
        roof.translate(a.x, DECK + 9.5, a.z);
        railG.push(roof);
        this.stationPos[li].push(new THREE.Vector3(a.x, DECK + 6, a.z));
      }
      // traction substations: low buildings beside the line, with a glow that tracks load
      this.tssPos[li] = [];
      for (const t of l.tss) {
        const a = along(l.path, t.s);
        const ox = -a.tz * 45, oz = a.tx * 45;
        const b = new THREE.BoxGeometry(34, 8, 18);
        b.rotateY(Math.atan2(a.tx, a.tz));
        b.translate(a.x + ox, 4, a.z + oz);
        pierG.push(b);
        const pos = new THREE.Vector3(a.x + ox, 16, a.z + oz);
        this.tssPos[li].push(pos);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: '#86c5da', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        sp.position.copy(pos);
        sp.scale.setScalar(120);
        this.scene.add(sp);
        this.tssGlow.push(sp);
      }
    });
    const deck = new THREE.Mesh(mergeGeometries(deckG), concrete);
    deck.castShadow = deck.receiveShadow = true;
    const piers = new THREE.Mesh(mergeGeometries(pierG), concrete);
    piers.castShadow = true;
    const rails = new THREE.Mesh(mergeGeometries(railG), new THREE.MeshStandardMaterial({ color: '#4d4f52', roughness: 0.5, metalness: 0.6 }));
    this.scene.add(deck, piers, rails);
    // the trains: six cars each
    const carG = new THREE.BoxGeometry(2.9, 3.6, TRAIN.length / TRAIN.cars - 1.2);
    carG.translate(0, DECK + 1.25 + 1.8, 0);
    this.carMat = new THREE.MeshStandardMaterial({ color: '#d9dcdc', roughness: 0.35, metalness: 0.5, emissive: '#ffd9a0', emissiveIntensity: 0 });
    LINES.forEach((l) => {
      const im = new THREE.InstancedMesh(carG, this.carMat.clone(), 90 * TRAIN.cars);
      (im.material as THREE.MeshStandardMaterial).color.set(l.colour).lerp(new THREE.Color('#e8e8e4'), 0.55);
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = true;
      this.scene.add(im);
      this.cars.push(im);
    });
  }

  private buildGrid() {
    const yard = new THREE.MeshStandardMaterial({ color: '#8d8a80', roughness: 1 });
    const tx = new THREE.MeshStandardMaterial({ color: '#59605f', roughness: 0.6, metalness: 0.4 });
    for (const s of GRID_SUBS) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(150, 0.6, 110), yard);
      pad.position.set(s.x, 0.3, s.z);
      pad.receiveShadow = true;
      this.scene.add(pad);
      for (let i = 0; i < 3; i++) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(14, 9, 10), tx);
        t.position.set(s.x - 40 + i * 40, 4.5, s.z);
        t.castShadow = true;
        this.scene.add(t);
      }
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: '#86c5da', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      sp.position.set(s.x, 30, s.z);
      sp.scale.setScalar(260);
      this.scene.add(sp);
      this.subGlow.push(sp);
    }
  }

  private buildFlow() {
    LINES.forEach((_, li) => {
      const N = 700;
      const s = new Float32Array(N), lat = new Float32Array(N);
      const R = rng(40 + li);
      for (let i = 0; i < N; i++) { s[i] = R() * this.lineLen[li]; lat[i] = R() < 0.5 ? -2.2 : 2.2; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: glow(), size: 16, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      pts.frustumCulled = false;
      this.scene.add(pts);
      this.flow.push({ pts, s, lat, line: li });
    });
  }

  // ------------------------------------------------------------------ public

  view(v: 'city' | 'metro' | 'overhead', animate = true) {
    const shots = {
      city: { pos: new THREE.Vector3(4300, 3300, 8200), at: new THREE.Vector3(-200, 0, 400) },
      metro: { pos: new THREE.Vector3(900, 420, 900), at: new THREE.Vector3(-150, 0, -420) },
      overhead: { pos: new THREE.Vector3(0, 17000, 1200), at: new THREE.Vector3(0, 0, -800) },
    }[v];
    this.flyTo(shots.pos, shots.at, animate);
  }

  flyTo(pos: THREE.Vector3, at: THREE.Vector3, animate = true) {
    if (!animate) {
      this.camera.position.copy(pos);
      this.controls?.target.copy(at);
      this.controls?.update();
      return;
    }
    gsap.to(this.camera.position, { x: pos.x, y: pos.y, z: pos.z, duration: 1.8, ease: 'power2.inOut' });
    gsap.to(this.controls.target, { x: at.x, y: at.y, z: at.z, duration: 1.8, ease: 'power2.inOut' });
  }

  /** Fly towards something without losing the current viewing angle. */
  focus(p: THREE.Vector3, dist = 900) {
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.flyTo(p.clone().add(dir.multiplyScalar(dist)), p.clone());
  }

  setHighlight(k: number) {
    this.bUniforms.uHi.value = k;
    this.gUniforms.uHi.value = k;
  }

  setFlow(on: boolean) {
    this.flowOn = on;
    this.flow.forEach((f) => { f.pts.visible = on; });
  }

  private setHour(h: number, season: Season) {
    const lat = THREE.MathUtils.degToRad(CITY.lat), dec = THREE.MathUtils.degToRad(SEASONS[season].dec);
    const H = THREE.MathUtils.degToRad((h - 12) * 15);
    const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H));
    let az = Math.acos(THREE.MathUtils.clamp((Math.sin(dec) - Math.sin(el) * Math.sin(lat)) / (Math.cos(el) * Math.cos(lat)), -1, 1));
    if (H > 0) az = Math.PI * 2 - az;
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    this.sky.material.uniforms.sunPosition.value.copy(dir);
    const elD = THREE.MathUtils.radToDeg(el);
    this.night = 1 - THREE.MathUtils.smoothstep(elD, -8, 2);
    const low = 1 - THREE.MathUtils.smoothstep(elD, 2, 25);
    const day = 1 - this.night;
    this.sun.intensity = 4.4 * THREE.MathUtils.smoothstep(elD, -1, 9);
    this.sun.color.setRGB(1, 0.93 - low * 0.3, 0.84 - low * 0.52);
    const t = this.controls.target;
    this.sun.position.copy(t).addScaledVector(dir, 5000);
    this.sun.target.position.copy(t);
    this.moon.position.set(t.x - 3000, 4000, t.z + 2000);
    this.moon.target.position.copy(t);
    this.moon.intensity = 0.5 * this.night;
    this.hemi.intensity = 0.25 + 0.55 * day + 0.12 * this.night;
    this.hemi.color.setRGB(0.6 + 0.2 * day, 0.68 + 0.18 * day, 0.85 + 0.1 * day);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(new THREE.Color('#b4c2cd').lerp(new THREE.Color('#d9ab82'), low * 0.75)).lerp(new THREE.Color('#0e1828'), this.night);
    this.renderer.toneMappingExposure = 0.5 + 0.1 * this.night;
    this.bloom.enabled = this.night > 0.04;
    this.bloom.strength = 0.55 * this.night;
    this.bloom.threshold = 0.82 + 0.4 * day;
    (this.stars.material as THREE.PointsMaterial).opacity = this.night;
    (this.nightDome.material as THREE.ShaderMaterial).uniforms.uNight.value = this.night;
    this.grade.uniforms.uNight.value = this.night;
    this.bUniforms.uNight.value = this.night;
    this.gUniforms.uNight.value = this.night;
    this.carMat.emissiveIntensity = 0;
    this.cars.forEach((c) => { (c.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.05 + 1.6 * this.night; });
    if (Math.abs(h - this.lastHour) > 0.05) { this.lastHour = h; this.renderer.shadowMap.needsUpdate = true; }
  }

  private apply(st: SceneState, dt: number) {
    this.setHour(st.hour, st.season);
    st.districts.forEach((d, i) => {
      this.bUniforms.uLit.value[i].set(...d.lit);
      this.bUniforms.uOn.value[i] = d.up ? 1 : 0;
      this.gUniforms.uStreet.value[i] = d.up ? d.street * this.night : 0;
    });
    this.gUniforms.uStreet.value[11] = st.districts.some((d) => d.up) ? this.night : 0;
    st.subs.forEach((s, i) => {
      const sp = this.subGlow[i];
      const m = sp.material as THREE.SpriteMaterial;
      m.color.set(!s.up ? '#000000' : s.load > 1 ? '#ff5b4f' : s.load > 0.85 ? '#ffb04d' : '#86c5da');
      m.opacity = !s.up ? 0 : 0.25 + 0.6 * Math.min(1, s.load);
      sp.scale.setScalar(180 + 160 * Math.min(1.2, s.load));
    });
    // traction substations
    const sim = st.sim;
    let k = 0;
    sim.lines.forEach((ln) => ln.tss.forEach((t) => {
      const sp = this.tssGlow[k++];
      const m = sp.material as THREE.SpriteMaterial;
      const f = Math.max(0, t.p) / 1e6 / DC.tssRating;
      m.color.set(!t.on ? '#000' : f > 1 ? '#ff5b4f' : f > 0.05 ? '#ffb04d' : '#86c5da');
      m.opacity = !t.on ? 0 : 0.3 + 0.7 * Math.min(1, f);
      sp.scale.setScalar(70 + 160 * Math.min(1.5, f));
    }));
    // trains
    const counts = LINES.map(() => 0);
    const glowPos: number[] = [], glowCol: number[] = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    this.trainHeads.clear();
    for (const tr of sim.trains) {
      const li = tr.line, path = LINES[li].path, L = this.lineLen[li];
      const im = this.cars[li];
      const head = tr.dir > 0 ? tr.p : L - tr.p;
      const off = tr.dir > 0 ? -2.2 : 2.2;
      for (let c = 0; c < TRAIN.cars; c++) {
        const sc = head - tr.dir * (c + 0.5) * (TRAIN.length / TRAIN.cars);
        const a = along(path, Math.max(0, Math.min(L, sc)));
        q.setFromAxisAngle(up, Math.atan2(a.tx, a.tz));
        m4.compose(new THREE.Vector3(a.x + a.tz * off, 0, a.z - a.tx * off), q, one);
        im.setMatrixAt(counts[li]++, m4);
      }
      const mid = along(path, Math.max(0, Math.min(L, head - tr.dir * TRAIN.length / 2)));
      const pos = new THREE.Vector3(mid.x, DECK + 8, mid.z);
      this.trainHeads.set(tr.id, pos);
      glowPos.push(pos.x, pos.y, pos.z);
      const pw = tr.pDel / 1e6;
      const c = pw > 0.6 ? new THREE.Color(1.6, 0.8, 0.25).multiplyScalar(0.4 + Math.min(1.4, pw / 3)) : pw < -0.1 ? new THREE.Color(0.4, 1.1, 1.5).multiplyScalar(0.4 + Math.min(1.2, -pw / 3)) : new THREE.Color(0.3, 0.28, 0.24);
      glowCol.push(c.r, c.g, c.b);
    }
    this.cars.forEach((im, li) => { im.count = counts[li]; im.instanceMatrix.needsUpdate = true; });
    const gg = this.trainGlow.geometry;
    gg.setAttribute('position', new THREE.Float32BufferAttribute(glowPos.length ? glowPos : [0, -999, 0], 3));
    gg.setAttribute('color', new THREE.Float32BufferAttribute(glowCol.length ? glowCol : [0, 0, 0], 3));
    // flow particles ride the solved catenary currents
    if (this.flowOn) {
      for (const f of this.flow) {
        const segs = sim.lines[f.line].segs, L = this.lineLen[f.line], path = LINES[f.line].path;
        const P = f.pts.geometry.attributes.position as THREE.BufferAttribute, C = f.pts.geometry.attributes.color as THREE.BufferAttribute;
        for (let i = 0; i < f.s.length; i++) {
          let I = 0;
          for (const sg of segs) if (f.s[i] >= sg.s0 && f.s[i] < sg.s1) { I = sg.i; break; }
          const v = Math.sign(I) * Math.min(260, Math.abs(I) * 0.09);
          const ns = f.s[i] + v * dt;
          let I2 = 0;
          for (const sg of segs) if (ns >= sg.s0 && ns < sg.s1) { I2 = sg.i; break; }
          f.s[i] = ns < 0 || ns > L || (I2 !== 0 && Math.sign(I2) !== Math.sign(I)) ? Math.random() * L : ns;
          const a = along(path, f.s[i]);
          P.setXYZ(i, a.x + a.tz * f.lat[i], DECK + 7.5, a.z - a.tx * f.lat[i]);
          const k2 = Math.min(1, Math.abs(I) / 2500);
          C.setXYZ(i, 1.4 * k2, 0.75 * k2, 0.25 * k2);
        }
        P.needsUpdate = true; C.needsUpdate = true;
      }
    }
    // selection ring
    const sp = this.selPos();
    this.ring.visible = !!sp;
    if (sp) {
      this.ring.position.set(sp.x, (sp.y > 5 ? DECK + 2 : 2), sp.z);
      const dist = this.camera.position.distanceTo(sp);
      this.ring.scale.setScalar(Math.max(40, dist * 0.035));
    }
  }

  private selPos(): THREE.Vector3 | null {
    const s = this.selected;
    if (!s) return null;
    if (s.type === 'train') return this.trainHeads.get(s.id) ?? null;
    if (s.type === 'tss') return this.tssPos[s.line][s.idx];
    if (s.type === 'station') return this.stationPos[s.line][s.idx];
    if (s.type === 'sub') { const g = GRID_SUBS.find((x) => x.id === s.id)!; return new THREE.Vector3(g.x, 30, g.z); }
    const d = DISTRICTS.find((x) => x.id === s.id)!;
    return new THREE.Vector3((d.rect[0] + d.rect[2]) / 2, 0, (d.rect[1] + d.rect[3]) / 2);
  }

  /** World position of a pickable thing, for camera moves. */
  posOf(p: Pick) {
    const keep = this.selected;
    this.selected = p;
    const v = this.selPos();
    this.selected = keep;
    return v;
  }

  /** Nearest pickable object to a screen point. */
  pick(clientX: number, clientY: number): Pick | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const x = clientX - r.left, y = clientY - r.top;
    let best: Pick | null = null, bd = 26;
    const test = (p: THREE.Vector3, k: Pick, rad = 26) => {
      const v = p.clone().project(this.camera);
      if (v.z > 1) return;
      const sx = (v.x * 0.5 + 0.5) * r.width, sy = (-v.y * 0.5 + 0.5) * r.height;
      const dd = Math.hypot(sx - x, sy - y) * (26 / rad);
      if (dd < bd) { bd = dd; best = k; }
    };
    this.trainHeads.forEach((p, id) => test(p, { type: 'train', id }, 30));
    this.tssPos.forEach((arr, line) => arr.forEach((p, idx) => test(p, { type: 'tss', line, idx })));
    this.stationPos.forEach((arr, line) => arr.forEach((p, idx) => test(p, { type: 'station', line, idx }, 18)));
    GRID_SUBS.forEach((s) => test(new THREE.Vector3(s.x, 30, s.z), { type: 'sub', id: s.id }));
    if (best) return best;
    // otherwise: the district under the cursor
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1), this.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
    const d = DISTRICTS.find((dd) => hit.x > dd.rect[0] && hit.x < dd.rect[2] && hit.z > dd.rect[1] && hit.z < dd.rect[3]);
    return d ? { type: 'district', id: d.id } : null;
  }

  /** Screen position of a world point (for labels). */
  project(p: THREE.Vector3) {
    const v = p.clone().project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height, vis: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
  }

  get isNight() {
    return this.night > 0.5;
  }

  private inset = 0;
  /** Keep what the camera looks at centred in the part of the screen not covered by panels. */
  setInset(px: number) {
    this.inset = Math.max(0, Math.round(px));
    this.resize();
  }

  private resize = () => {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.camera.aspect = w / h;
    if (this.inset > 0) this.camera.setViewOffset(w, h + this.inset, 0, this.inset, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  };

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.onFrame?.(dt);
    this.controls.update();
    if (this.state) this.apply(this.state, dt);
    // shadows only near what you are looking at, redrawn when the view moves
    const t = this.controls.target;
    const dist = this.camera.position.distanceTo(t);
    const S = THREE.MathUtils.clamp(dist * 0.9, 500, 3500);
    const cam = this.sun.shadow.camera;
    if (t.distanceTo(this.shadowAt) > S * 0.15 || Math.abs(cam.right - S) > S * 0.2) {
      this.shadowAt.copy(t);
      Object.assign(cam, { left: -S, right: S, top: S, bottom: -S });
      cam.updateProjectionMatrix();
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.composer.render();
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.resize);
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
