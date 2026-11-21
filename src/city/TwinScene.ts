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
import { along, districtAt, polyLength, type CityData, type Kind, type Season } from './types';
import { TRAIN, type TractionSim } from './metro';
import type { Network } from './telecom';

const KIND_INDEX: Record<Kind, number> = { res: 0, com: 1, ind: 2, inst: 3 };
export const MAXD = 64;

// The 3D twin of Meridia. Everything visible is driven by the engine:
// window lights follow the demand model, street lighting follows the sun,
// trains move as the traction simulation moves them, and the flow particles
// travel along the catenary at a speed set by the solved DC currents.

export type Pick = { type: 'site'; idx: number } | { type: 'hub'; idx: number } | { type: 'train'; id: number } | { type: 'tss'; line: number; idx: number } | { type: 'sub'; id: string } | { type: 'district'; id: string } | { type: 'station'; line: number; idx: number };

export type SceneState = {
  hour: number;
  season: Season;
  districts: { lit: [number, number, number, number]; up: boolean; street: number }[];
  subs: { load: number; up: boolean }[]; // load as a fraction of rating
  sim: TractionSim;
  telecom?: { state: Uint8Array; soc: Uint8Array; hub: Uint8Array; minute: number };
};

const DECK = 13; // viaduct deck height, m

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
    uLit: { value: Array.from({ length: MAXD }, () => new THREE.Vector4()) },
    uOn: { value: new Array(MAXD).fill(1) as number[] },
    uNight: { value: 0 },
    uHi: { value: -1 },
  };
  private gUniforms = {
    uStreet: { value: new Array(MAXD + 1).fill(0) as number[] },
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
  private lineLen: number[];
  private W: number; private D: number; private X0: number; private Z0: number;
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
  private tel?: { net: Network; hex: THREE.InstancedMesh; masts: THREE.InstancedMesh; lights: THREE.Points; hubs: THREE.InstancedMesh };

  constructor(private host: HTMLElement, public city: CityData, opts: { view?: 'city' | 'metro' } = {}) {
    const [bx0, bz0, bx1, bz1] = city.bounds;
    this.X0 = bx0; this.Z0 = bz0; this.W = bx1 - bx0; this.D = bz1 - bz0;
    this.lineLen = city.lines.map((l) => polyLength(l.path));
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
    if (city.kind === 'prototype') this.buildHills();
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
    const c = this.city, { W, D, X0, Z0 } = this;
    // colour map: land use, parks, water; drawn on a canvas from the city data
    const CW = 2048, CH = Math.round((CW * D) / W);
    const cv = document.createElement('canvas');
    cv.width = CW; cv.height = CH;
    const g = cv.getContext('2d')!;
    const px = (x: number) => ((x - X0) / W) * CW, pz = (z: number) => ((z - Z0) / D) * CH;
    g.fillStyle = c.ground;
    g.fillRect(0, 0, CW, CH);
    const R = rng(77);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${90 + R() * 40},${95 + R() * 35},${60 + R() * 20},0.3)`;
      g.beginPath(); g.ellipse(R() * CW, R() * CH, 10 + R() * 60, 8 + R() * 40, R() * 3, 0, 7); g.fill();
    }
    // built-up land is paler than the countryside: tint every district cell
    const { nx, nz, data } = c.cells;
    g.fillStyle = 'rgba(160,150,132,0.55)';
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (data[j * nx + i] !== 255) g.fillRect((i / nx) * CW, (j / nz) * CH, CW / nx + 1, CH / nz + 1);
    const fills: Record<string, string> = { park: 'rgba(78,104,58,0.9)', industrial: 'rgba(132,130,124,0.7)', commercial: 'rgba(150,140,128,0.5)', institution: 'rgba(150,138,112,0.6)', beach: '#b9ad8c', water: '#2f4a52' };
    const poly = (ctx: CanvasRenderingContext2D, pts: [number, number][], fx: (x: number) => number, fz: (z: number) => number) => {
      ctx.beginPath();
      pts.forEach(([x, z], i) => (i ? ctx.lineTo(fx(x), fz(z)) : ctx.moveTo(fx(x), fz(z))));
      ctx.closePath();
    };
    for (const a of c.areas) if (a.kind !== 'water') { g.fillStyle = fills[a.kind]; poly(g, a.pts, px, pz); g.fill(); }
    // the mask: street brightness in one channel, sampled by the night shader
    const MW = 4096, MH = Math.round((MW * D) / W);
    const mv = document.createElement('canvas');
    mv.width = MW; mv.height = MH;
    const m = mv.getContext('2d')!;
    m.fillStyle = '#000'; m.fillRect(0, 0, MW, MH);
    const mx = (x: number) => ((x - X0) / W) * MW, mz = (z: number) => ((z - Z0) / D) * MH;
    m.lineCap = g.lineCap = 'round';
    for (const major of [false, true]) {
      g.strokeStyle = major ? '#4a4a48' : '#5e5d58';
      g.lineWidth = major ? 2.2 : 1;
      m.strokeStyle = major ? '#fff' : '#8a8a8a';
      m.lineWidth = major ? 3.2 : 1.4;
      g.beginPath(); m.beginPath();
      for (const s of c.streets) {
        if (s.major !== major) continue;
        s.pts.forEach(([x, z], i) => {
          if (i) { g.lineTo(px(x), pz(z)); m.lineTo(mx(x), mz(z)); } else { g.moveTo(px(x), pz(z)); m.moveTo(mx(x), mz(z)); }
        });
      }
      g.stroke(); m.stroke();
    }
    // water over everything; no street light on water
    g.fillStyle = fills.water; m.fillStyle = '#000';
    for (const a of c.areas) if (a.kind === 'water') { poly(g, a.pts, px, pz); g.fill(); poly(m, a.pts, mx, mz); m.fill(); }
    if (c.sea) { poly(g, c.sea, px, pz); g.fill(); poly(m, c.sea, mx, mz); m.fill(); }
    const map = new THREE.CanvasTexture(cv);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    const mask = new THREE.CanvasTexture(mv);
    mask.anisotropy = 8;
    // district ids for the street-lighting lookup (nearest, never blended)
    const dt = new THREE.DataTexture(data, nx, nz, THREE.RedFormat, THREE.UnsignedByteType);
    dt.magFilter = dt.minFilter = THREE.NearestFilter;
    dt.flipY = false;
    dt.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.95 });
    const U = this.gUniforms;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, { uMask: { value: mask }, uCells: { value: dt } });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <project_vertex>', '#include <project_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vW; uniform sampler2D uMask; uniform sampler2D uCells; uniform float uStreet[${MAXD + 1}]; uniform float uNight; uniform float uHi;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          vec2 q = vec2((vW.x - ${X0.toFixed(1)}) / ${W.toFixed(1)}, (vW.z - ${Z0.toFixed(1)}) / ${D.toFixed(1)});
          float st = texture2D(uMask, vec2(q.x, 1.0 - q.y)).r;
          int di = int(texture2D(uCells, q).r * 255.0 + 0.5);
          float lv = 0.0;
          for (int i = 0; i < ${MAXD}; i++) { if (i == di) lv = uStreet[i]; }
          // roads outside every district (highways) stay lit while any of the grid is up
          if (di == 255 && st > 0.6) lv = uStreet[${MAXD}];
          float hi = uHi == 5.0 ? 1.8 : (uHi >= 0.0 ? 0.4 : 1.0);
          totalEmissiveRadiance += vec3(1.0, 0.56, 0.2) * st * st * lv * hi * 1.3;
          if (uHi == 5.0) totalEmissiveRadiance += vec3(1.0, 0.7, 0.3) * st * lv * 0.4 * (1.0 - uNight);`);
    };
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(X0 + W / 2, 0, Z0 + D / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);
    const far = new THREE.Mesh(new THREE.PlaneGeometry(160000, 160000), new THREE.MeshStandardMaterial({ color: '#5d6648', roughness: 1 }));
    far.rotation.x = -Math.PI / 2;
    far.position.set(X0 + W / 2, -0.8, Z0 + D / 2);
    this.scene.add(far);
  }

  private buildWater() {
    const toShape = (pts: [number, number][]) => new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const shapes = this.city.areas.filter((a) => a.kind === 'water' && a.pts.length > 2).map((a) => toShape(a.pts));
    if (this.city.sea) shapes.push(toShape(this.city.sea));
    if (!shapes.length) return;
    const water = new THREE.Mesh(new THREE.ShapeGeometry(shapes), new THREE.MeshStandardMaterial({ color: '#1d3a46', roughness: 0.16, metalness: 0.15, side: THREE.DoubleSide }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.6;
    this.scene.add(water);
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
    const { buildings } = this.city;
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
    this.city.lines.forEach((l, li) => {
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
    this.city.lines.forEach((l) => {
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
    for (const s of this.city.subs) {
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
    this.city.lines.forEach((_, li) => {
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
    const c = this.city;
    const [cx0, cz0, cx1, cz1] = c.bounds;
    const at = (a: number[]) => ({ pos: new THREE.Vector3(a[0], a[1], a[2]), at: new THREE.Vector3(a[3], a[4], a[5]) });
    const shot = v === 'overhead'
      ? { pos: new THREE.Vector3((cx0 + cx1) / 2, Math.max(cx1 - cx0, cz1 - cz0) * 1.05, (cz0 + cz1) / 2 + 1200), at: new THREE.Vector3((cx0 + cx1) / 2, 0, (cz0 + cz1) / 2) }
      : at(c.view[v]);
    this.flyTo(shot.pos, shot.at, animate);
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

  /** The mobile network layer: masts, exchanges and a coverage hex per site. */
  setTelecom(net: Network | null) {
    if (this.tel) { this.tel.hex.visible = this.tel.masts.visible = this.tel.lights.visible = this.tel.hubs.visible = !!net; }
    if (!net || this.tel) return;
    const n = net.sites.length;
    const hexG = new THREE.CircleGeometry(1, 6);
    hexG.rotateX(-Math.PI / 2);
    hexG.rotateY(Math.PI / 6);
    const hex = new THREE.InstancedMesh(hexG, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }), n);
    const mastG = new THREE.CylinderGeometry(0.5, 0.9, 32, 5);
    mastG.translate(0, 16, 0);
    const head = new THREE.BoxGeometry(3.2, 2.4, 3.2);
    head.translate(0, 30, 0);
    const masts = new THREE.InstancedMesh(mergeGeometries([mastG, head]), new THREE.MeshStandardMaterial({ color: '#9aa2a6', roughness: 0.5, metalness: 0.6 }), n);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    const lp: number[] = [];
    net.sites.forEach((st, i) => {
      // tall buildings: the mast sits on a roof; elsewhere on the ground
      m4.makeScale(st.r, 1, st.r).setPosition(st.x, 1.4, st.z);
      hex.setMatrixAt(i, m4);
      hex.setColorAt(i, c.set('#86c5da'));
      m4.makeTranslation(st.x, 0, st.z);
      masts.setMatrixAt(i, m4);
      lp.push(st.x, 33, st.z);
    });
    hex.frustumCulled = masts.frustumCulled = false;
    hex.renderOrder = 2;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    const lights = new THREE.Points(lg, new THREE.PointsMaterial({ map: glow(), color: new THREE.Color(3, 0.2, 0.12), size: 22, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const hubs = new THREE.InstancedMesh(new THREE.BoxGeometry(46, 16, 30).translate(0, 8, 0), new THREE.MeshStandardMaterial({ color: '#c8c2b4', roughness: 0.8 }), net.hubs.length);
    net.hubs.forEach((hb, i) => { m4.makeTranslation(hb.x, 0, hb.z); hubs.setMatrixAt(i, m4); });
    hubs.castShadow = masts.castShadow = true;
    this.scene.add(hex, masts, lights, hubs);
    this.tel = { net, hex, masts, lights, hubs };
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
    const lat = THREE.MathUtils.degToRad(this.city.lat), dec = THREE.MathUtils.degToRad(this.city.climate[season].dec);
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
    this.gUniforms.uStreet.value[MAXD] = st.districts.some((d) => d.up) ? this.night : 0;
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
      const f = Math.max(0, t.p) / 1e6 / sim.dc.tssRating;
      m.color.set(!t.on ? '#000' : f > 1 ? '#ff5b4f' : f > 0.05 ? '#ffb04d' : '#86c5da');
      m.opacity = !t.on ? 0 : 0.3 + 0.7 * Math.min(1, f);
      sp.scale.setScalar(70 + 160 * Math.min(1.5, f));
    }));
    // trains
    const counts = this.city.lines.map(() => 0);
    const glowPos: number[] = [], glowCol: number[] = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    this.trainHeads.clear();
    for (const tr of sim.trains) {
      const li = tr.line, path = this.city.lines[li].path, L = this.lineLen[li];
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
        const segs = sim.lines[f.line].segs, L = this.lineLen[f.line], path = this.city.lines[f.line].path;
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
    // mobile network: colour every coverage hex by its site's state this minute
    if (this.tel && st.telecom && this.tel.hex.visible) {
      const { state, soc, minute } = st.telecom;
      const hex = this.tel.hex, c = new THREE.Color();
      const n = this.tel.net.sites.length;
      for (let i = 0; i < n; i++) {
        const v = state[i * 1440 + minute];
        if (v === 0) c.setRGB(0.03, 0.08, 0.1);
        else if (v === 1) { const f = soc[i * 1440 + minute] / 100; c.setRGB(1, 0.45 + 0.25 * f, 0.1 + 0.2 * f).multiplyScalar(0.55 + 0.6 * f); }
        else if (v === 2) c.setRGB(0.75, 0.62, 1);
        else if (v === 3) c.setRGB(0.4, 0.42, 0.48);
        else c.setRGB(0.9, 0.15, 0.12);
        hex.setColorAt(i, c);
      }
      if (hex.instanceColor) hex.instanceColor.needsUpdate = true;
      (this.tel.lights.material as THREE.PointsMaterial).opacity = 0.25 + 0.75 * this.night;
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
    if (s.type === 'site') { const q = this.tel?.net.sites[s.idx]; return q ? new THREE.Vector3(q.x, 2, q.z) : null; }
    if (s.type === 'hub') { const q = this.tel?.net.hubs[s.idx]; return q ? new THREE.Vector3(q.x, 2, q.z) : null; }
    if (s.type === 'train') return this.trainHeads.get(s.id) ?? null;
    if (s.type === 'tss') return this.tssPos[s.line][s.idx];
    if (s.type === 'station') return this.stationPos[s.line][s.idx];
    if (s.type === 'sub') { const g = this.city.subs.find((x) => x.id === s.id)!; return new THREE.Vector3(g.x, 30, g.z); }
    const d = this.city.districts.find((x) => x.id === s.id)!;
    return new THREE.Vector3(d.cx, 0, d.cz);
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
    this.city.subs.forEach((s) => test(new THREE.Vector3(s.x, 30, s.z), { type: 'sub', id: s.id }));
    if (this.tel?.hex.visible) {
      this.tel.net.hubs.forEach((h, idx) => test(new THREE.Vector3(h.x, 10, h.z), { type: 'hub', idx }));
      this.tel.net.sites.forEach((q, idx) => test(new THREE.Vector3(q.x, 30, q.z), { type: 'site', idx }, 16));
    }
    if (best) return best;
    // otherwise: the district under the cursor
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1), this.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
    const k = districtAt(this.city, hit.x, hit.z);
    return k !== 255 ? { type: 'district', id: this.city.districts[k].id } : null;
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
