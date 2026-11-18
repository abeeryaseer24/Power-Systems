import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DISTRICTS, LINES, PLANTS } from '../grid/network';
import { mulberry32, gaussian } from '../grid/profiles';
import { CHANNELS, coastZ, isSea, PLANT_SITE, plantChannel, S, terrainY, V, busPos } from './world';

export const SODIUM = new THREE.Color('#ffb04d');
export const GLAZE = new THREE.Color('#86c5da');

export function glowTexture(inner = 'rgba(255,255,255,1)', size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  r.addColorStop(0, inner);
  r.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Uniforms shared by every light-emitting material, so one array drives the city. */
export function makeShared() {
  return {
    uLight: { value: new Array(CHANNELS).fill(0) as number[] },
    uTime: { value: 0 },
    uFog: { value: new THREE.Color('#0b1a2c') },
    uFogDensity: { value: 0.014 },
  };
}
export type Shared = ReturnType<typeof makeShared>;

const FOG_GLSL = /* glsl */ `
  uniform vec3 uFog; uniform float uFogDensity;
  vec3 applyFog(vec3 c, float depth) {
    float f = 1.0 - exp(-uFogDensity * uFogDensity * depth * depth);
    return mix(c, uFog, clamp(f, 0.0, 1.0));
  }
`;

// --------------------------------------------------------------- ground + sea

export function buildGround(shared: Shared) {
  const size = 150;
  const seg = 220;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const glow = new Float32Array(pos.count * CHANNELS > 0 ? pos.count : 0);
  const chan = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i) + 4;
    pos.setZ(i, z);
    pos.setY(i, terrainY(x, z));
    // nearest district for the warm light pool on the ground
    let best = 0;
    let bd = Infinity;
    DISTRICTS.forEach((d, k) => {
      const b = busPos(d.bus);
      const dd = Math.hypot(x - b.x, z - b.z) / d.radius;
      if (dd < bd) {
        bd = dd;
        best = k;
      }
    });
    glow[i] = Math.exp(-bd * bd * 1.6) * (isSea(x, z) ? 0.2 : 1);
    chan[i] = best;
  }
  geo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  geo.setAttribute('aChan', new THREE.BufferAttribute(chan, 1));
  geo.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...shared, uMoon: { value: new THREE.Vector3(-0.4, 0.55, -0.7).normalize() } },
    vertexShader: /* glsl */ `
      attribute float aGlow; attribute float aChan;
      varying float vGlow; varying float vChan; varying vec3 vN; varying vec3 vW; varying float vDepth;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz; vN = normal; vGlow = aGlow; vChan = aChan;
        vec4 mv = viewMatrix * w; vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uLight[${CHANNELS}]; uniform vec3 uMoon;
      varying float vGlow; varying float vChan; varying vec3 vN; varying vec3 vW; varying float vDepth;
      ${FOG_GLSL}
      void main() {
        float L = uLight[int(vChan + 0.5)];
        float moon = max(dot(normalize(vN), uMoon), 0.0);
        vec3 c = vec3(0.020, 0.032, 0.048) + vec3(0.03, 0.045, 0.07) * moon;
        c += vec3(1.0, 0.55, 0.2) * vGlow * L * 0.09;
        gl_FragColor = vec4(applyFog(c, vDepth), 1.0);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

export function buildSea(shared: Shared, moonDir: THREE.Vector3) {
  const geo = new THREE.PlaneGeometry(260, 140, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -0.05, 82);
  const mat = new THREE.ShaderMaterial({
    transparent: false,
    uniforms: { ...shared, uMoon: { value: moonDir } },
    vertexShader: /* glsl */ `
      varying vec3 vW; varying float vDepth;
      void main() { vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uMoon; uniform float uTime; uniform float uLight[${CHANNELS}];
      varying vec3 vW; varying float vDepth;
      ${FOG_GLSL}
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main() {
        vec2 p = vW.xz;
        float t = uTime * 0.25;
        float w = n(p * 3.0 + vec2(t, t * 0.6)) * 0.6 + n(p * 9.0 - vec2(t * 1.7, 0.0)) * 0.4;
        vec3 nrm = normalize(vec3((w - 0.5) * 0.16, 1.0, (n(p * 3.0 + 7.0 + t) - 0.5) * 0.16));
        vec3 view = normalize(cameraPosition - vW);
        vec3 r = reflect(-view, nrm);
        float spec = pow(max(dot(r, uMoon), 0.0), 900.0) * step(0.55, w);
        float fres = pow(1.0 - max(view.y, 0.0), 4.0);
        vec3 c = vec3(0.006, 0.014, 0.028) + vec3(0.03, 0.05, 0.08) * fres;
        c += vec3(0.75, 0.82, 0.95) * spec * 0.6;
        // the city's glow on the water near the shore
        float shore = exp(-max(vW.z - 18.0, 0.0) * 0.35);
        float city = (uLight[3] + uLight[5] + uLight[4]) / 3.0;
        c += vec3(1.0, 0.55, 0.22) * shore * city * 0.10 * (0.7 + 0.6 * w);
        gl_FragColor = vec4(applyFog(c, vDepth), 1.0);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

export function buildLake(shared: Shared, moonDir: THREE.Vector3) {
  const geo = new THREE.CircleGeometry(1, 48);
  geo.rotateX(-Math.PI / 2);
  geo.scale(5.2, 1, 2.6);
  geo.translate(-7, -0.35, -27.5);
  const sea = buildSea(shared, moonDir);
  return new THREE.Mesh(geo, sea.material as THREE.Material);
}

// --------------------------------------------------------------- sky

export function buildSky(moonDir: THREE.Vector3) {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(600, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uMoon: { value: moonDir } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uMoon; varying vec3 vD;
      void main(){
        float y = max(vD.y, 0.0);
        vec3 zen = vec3(0.006, 0.012, 0.03);
        vec3 hor = vec3(0.028, 0.05, 0.085);
        vec3 c = mix(hor, zen, pow(y, 0.45));
        float m = max(dot(vD, uMoon), 0.0);
        c += vec3(0.35, 0.42, 0.55) * pow(m, 80.0) * 0.35 + vec3(0.1,0.13,0.2) * pow(m, 8.0) * 0.18;
        // faint sodium skyglow over the city
        c += vec3(0.30, 0.16, 0.06) * exp(-y * 9.0) * 0.18;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  group.add(new THREE.Mesh(geo, mat));

  const rand = mulberry32(5);
  const n = 2600;
  const p = new Float32Array(n * 3);
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = rand() * 2 * Math.PI;
    const y = Math.pow(rand(), 0.7);
    const r = Math.sqrt(1 - y * y);
    p.set([Math.cos(u) * r * 560, y * 560 + 10, Math.sin(u) * r * 560], i * 3);
    s[i] = Math.pow(rand(), 6) * 3 + 0.6;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(s, 1));
  const starMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `attribute float aSize; uniform float uTime; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix*mv;
      vA = 0.55 + 0.45 * sin(uTime * (0.6 + aSize) + position.x);
      gl_PointSize = aSize; }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vec3(0.8,0.86,1.0) * a, a); }`,
  });
  const stars = new THREE.Points(g, starMat);
  group.add(stars);

  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,255,255,1)'), color: new THREE.Color(2.4, 2.45, 2.6), depthWrite: false, fog: false }));
  moon.position.copy(moonDir.clone().multiplyScalar(520));
  moon.scale.setScalar(26);
  group.add(moon);
  return { group, starMat };
}

// --------------------------------------------------------------- city

export function buildCity(shared: Shared) {
  const rand = mulberry32(99);
  const mats: THREE.Matrix4[] = [];
  const dist: number[] = [];
  const seeds: number[] = [];
  const tall: THREE.Vector3[] = [];
  const m = new THREE.Matrix4();
  DISTRICTS.forEach((d, k) => {
    const c = busPos(d.bus);
    const count = Math.round(d.peak * 2.6);
    for (let i = 0; i < count; i++) {
      const r = Math.abs(gaussian(rand)) * d.radius * 0.45;
      const a = rand() * Math.PI * 2;
      // snap to a street grid rotated per district
      const rot = k * 0.37;
      let x = c.x + Math.cos(a) * r;
      let z = c.z + Math.sin(a) * r;
      const gx = Math.cos(rot) * x + Math.sin(rot) * z;
      const gz = -Math.sin(rot) * x + Math.cos(rot) * z;
      const sx = Math.round(gx / 0.22) * 0.22;
      const sz = Math.round(gz / 0.22) * 0.22;
      x = Math.cos(rot) * sx - Math.sin(rot) * sz + (rand() - 0.5) * 0.04;
      z = Math.sin(rot) * sx + Math.cos(rot) * sz + (rand() - 0.5) * 0.04;
      if (isSea(x, z)) continue;
      const fall = Math.max(0, 1 - r / (d.radius * 0.9));
      const h = (0.012 + d.height * 0.11 * Math.pow(rand(), 2.6) * Math.pow(fall, 1.4)) * V;
      const w = 0.05 + rand() * 0.09 + (d.kind === 'industrial' ? 0.08 : 0);
      const dd = 0.05 + rand() * 0.09 + (d.kind === 'industrial' ? 0.06 : 0);
      m.compose(
        new THREE.Vector3(x, terrainY(x, z) + h / 2, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot),
        new THREE.Vector3(w, h, dd),
      );
      mats.push(m.clone());
      dist.push(k);
      seeds.push(rand());
      if (h > 0.55) tall.push(new THREE.Vector3(x, terrainY(x, z) + h + 0.02, z));
    }
  });
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.setAttribute('aDistrict', new THREE.InstancedBufferAttribute(new Float32Array(dist), 1));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: shared,
    vertexShader: /* glsl */ `
      attribute float aDistrict; attribute float aSeed;
      varying vec3 vW; varying vec3 vN; varying float vD; varying float vS; varying float vDepth;
      void main(){
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vW = w.xyz; vN = normalize(mat3(instanceMatrix) * normal);
        vD = aDistrict; vS = aSeed;
        vec4 mv = viewMatrix * w; vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uLight[${CHANNELS}]; uniform float uTime;
      varying vec3 vW; varying vec3 vN; varying float vD; varying float vS; varying float vDepth;
      ${FOG_GLSL}
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        float L = uLight[int(vD + 0.5)];
        vec3 n = normalize(vN);
        vec3 c = vec3(0.028, 0.040, 0.062) * (0.7 + 0.5 * max(n.y, 0.0));
        if (abs(n.y) < 0.5) {
          float u = (abs(n.x) > abs(n.z) ? vW.z : vW.x) * 75.0;
          float v = vW.y * 70.0;
          vec2 cell = floor(vec2(u, v));
          vec2 f = fract(vec2(u, v));
          float frame = step(0.2, f.x) * step(f.x, 0.8) * step(0.22, f.y) * step(f.y, 0.78);
          float h = hash(cell + vS * 31.0);
          float lit = step(h, 0.5 * L) * frame;
          vec3 warm = hash(cell * 1.3 + 2.0) > 0.82 ? vec3(0.75, 0.86, 1.0) : vec3(1.0, 0.70, 0.38);
          c += warm * lit * (0.6 + 0.8 * hash(cell + 7.0)) * 1.25;
        }
        c += vec3(1.0, 0.58, 0.25) * L * 0.22 * exp(-max(vW.y, 0.0) * 9.0);
        gl_FragColor = vec4(applyFog(c, vDepth), 1.0);
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((mm, i) => mesh.setMatrixAt(i, mm));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return { mesh, tall };
}

/** Street lights, highways, runway: points whose brightness follows their channel. */
export function buildLights(shared: Shared, extraRed: THREE.Vector3[]) {
  const rand = mulberry32(17);
  const P: number[] = [];
  const C: number[] = [];
  const Sd: number[] = [];
  const Col: number[] = [];
  const push = (x: number, z: number, ch: number, col: THREE.Color, y = 0.015) => {
    if (isSea(x, z)) return;
    P.push(x, terrainY(x, z) + y, z);
    C.push(ch);
    Sd.push(rand());
    Col.push(col.r, col.g, col.b);
  };
  const white = new THREE.Color('#dfe8ff');
  const led = new THREE.Color('#f4f0e6');
  DISTRICTS.forEach((d, k) => {
    const c = busPos(d.bus);
    const rot = k * 0.37;
    const R = d.radius;
    for (let gx = -R; gx <= R; gx += 0.22) {
      for (let gz = -R; gz <= R; gz += 0.22) {
        const onRoad = rand() < 0.5;
        const lx = onRoad ? gx : gx + 0.11;
        const lz = onRoad ? gz + 0.11 : gz;
        const r = Math.hypot(lx, lz);
        if (rand() > Math.exp(-((r / (R * 0.62)) ** 2))) continue;
        const x = c.x + Math.cos(rot) * lx - Math.sin(rot) * lz;
        const z = c.z + Math.sin(rot) * lx + Math.cos(rot) * lz;
        push(x, z, k, rand() < 0.18 ? led : SODIUM);
      }
    }
  });
  // highways along the transmission corridors between districts
  for (const l of LINES) {
    const a = busPos(l.from);
    const b = busPos(l.to);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const near = (x: number, z: number) => {
      let best = 0;
      let bd = Infinity;
      DISTRICTS.forEach((d, k) => {
        const p = busPos(d.bus);
        const dd = Math.hypot(x - p.x, z - p.z);
        if (dd < bd) {
          bd = dd;
          best = k;
        }
      });
      return best;
    };
    const nx = -(b.z - a.z) / len;
    const nz = (b.x - a.x) / len;
    for (let s = 0; s < len; s += 0.16) {
      const t = s / len;
      const bow = Math.sin(t * Math.PI) * 1.2;
      const x = a.x + (b.x - a.x) * t + nx * (0.9 + bow);
      const z = a.z + (b.z - a.z) * t + nz * (0.9 + bow);
      push(x, z, near(x, z), SODIUM);
    }
  }
  // airport runway edge lights and plant site lights
  const ap = PLANT_SITE.airport;
  for (let s = -2.2; s <= 2.2; s += 0.09) {
    for (const off of [-0.06, 0.06]) push(ap.x - 2.6 + s, ap.z - 1.4 + off, DISTRICTS.length - 1, white);
    push(ap.x - 2.6 + s, ap.z - 1.0, DISTRICTS.length - 1, new THREE.Color('#5d8bff'));
  }
  for (const p of PLANTS) {
    const site = PLANT_SITE[p.id];
    const n = p.kind === 'solar' ? 12 : p.kind === 'wind' ? 0 : 40;
    for (let i = 0; i < n; i++) push(site.x + (rand() - 0.5) * 1.6, site.z + (rand() - 0.5) * 1.2, plantChannel(p.id), rand() < 0.5 ? white : SODIUM, 0.03);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('aChan', new THREE.Float32BufferAttribute(C, 1));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(Sd, 1));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(Col, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...shared, uSize: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aChan; attribute float aSeed; attribute vec3 aColor;
      uniform float uLight[${CHANNELS}]; uniform float uSize; uniform float uTime;
      varying float vA; varying vec3 vC; varying float vDepth;
      void main(){
        float L = uLight[int(aChan + 0.5)];
        float on = step(aSeed, L * 1.04 - 0.02);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = on * uSize * (0.7 + 0.6 * fract(aSeed * 7.31)) * clamp(150.0 / vDepth, 1.0, 5.0);
        vA = on * (0.55 + 0.45 * fract(aSeed * 13.7));
        vC = aColor;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA; varying vec3 vC; varying float vDepth;
      ${FOG_GLSL}
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        float fogK = exp(-uFogDensity * uFogDensity * vDepth * vDepth);
        gl_FragColor = vec4(vC * a * vA * 2.2 * fogK, a * vA);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  // red aviation obstruction lights, battery-backed so they never go out
  const rg = new THREE.BufferGeometry().setFromPoints(extraRed);
  const redMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: shared.uTime },
    vertexShader: `uniform float uTime; varying float vA; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv;
      float blink = step(0.45, fract(uTime * 0.5)); vA = 0.25 + 0.75 * blink; gl_PointSize = clamp(260.0 / -mv.z, 1.5, 7.0); }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d)*vA; gl_FragColor = vec4(vec3(2.6,0.25,0.18)*a, a); }`,
  });
  const red = new THREE.Points(rg, redMat);
  red.frustumCulled = false;
  return { points, red, mat };
}

/** Flat warm light pools under each district: the cheapest way to make the city glow. */
export function buildPools(shared: Shared) {
  const tex = glowTexture('rgba(255,255,255,1)', 256);
  const pools: THREE.Mesh[] = [];
  DISTRICTS.forEach((d) => {
    const c = busPos(d.bus);
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color('#ff9a3c'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(c.x, terrainY(c.x, c.z) + 0.25, c.z);
    m.scale.setScalar(d.radius * 2.2);
    pools.push(m);
  });
  void shared;
  return pools;
}

// --------------------------------------------------------------- transmission

export interface LineVisual {
  curve: THREE.CatmullRomCurve3;
  mesh: THREE.Mesh;
  hit: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  length: number;
}

export function buildTransmission() {
  const group = new THREE.Group();
  const visuals: LineVisual[] = [];
  const towerTop = 0.06 * V;
  const pylonPos: THREE.Vector3[] = [];
  for (const l of LINES) {
    const a = busPos(l.from);
    const b = busPos(l.to);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const spans = Math.max(2, Math.round(len / 1.4));
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= spans; i++) {
      const t = i / spans;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const top = new THREE.Vector3(x, terrainY(x, z) + towerTop, z);
      if (i > 0 && i < spans) pylonPos.push(new THREE.Vector3(x, terrainY(x, z), z));
      if (i > 0) {
        const prev = pts[pts.length - 1];
        for (let k = 1; k < 4; k++) {
          const s = k / 4;
          const p = prev.clone().lerp(top, s);
          p.y -= 0.05 * V * 4 * s * (1 - s) * 0.5;
          pts.push(p);
        }
      }
      pts.push(top);
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const mat = new THREE.MeshBasicMaterial({ color: GLAZE.clone(), transparent: true, opacity: 0.95, fog: true });
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, spans * 8, 0.013, 4, false), mat);
    const hit = new THREE.Mesh(new THREE.TubeGeometry(curve, spans * 2, 0.55, 4, false), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.lineId = l.id;
    group.add(mesh, hit);
    visuals.push({ curve, mesh, hit, mat, length: curve.getLength() });
  }
  // lattice-ish pylons as tapered four-sided towers with a cross arm
  const tower = new THREE.CylinderGeometry(0.006, 0.03, towerTop, 4, 1);
  tower.translate(0, towerTop / 2, 0);
  const arm = new THREE.BoxGeometry(0.11, 0.008, 0.008);
  arm.translate(0, towerTop * 0.92, 0);
  const pyl = mergeGeometries([tower, arm])!;
  const pm = new THREE.InstancedMesh(pyl, new THREE.MeshStandardMaterial({ color: '#4b5a6e', roughness: 0.8, metalness: 0.4 }), pylonPos.length);
  const mm = new THREE.Matrix4();
  pylonPos.forEach((p, i) => pm.setMatrixAt(i, mm.makeTranslation(p.x, p.y, p.z)));
  group.add(pm);

  // flow particles: a handful per line, moved on the CPU
  const per = 26;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(LINES.length * per * 3);
  const col = new Float32Array(LINES.length * per * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const flowMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aColor; varying vec3 vC; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; vC = aColor; gl_PointSize = clamp(300.0 / -mv.z, 2.0, 12.0) * step(0.001, length(aColor)); }`,
    fragmentShader: `varying vec3 vC; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.0,d); gl_FragColor = vec4(vC*a*2.0, a); }`,
  });
  const flow = new THREE.Points(geo, flowMat);
  flow.frustumCulled = false;
  group.add(flow);
  return { group, visuals, flow, per };
}

export function buildSubstations() {
  const tex = glowTexture();
  const group = new THREE.Group();
  const sprites: THREE.Sprite[] = [];
  const pads: THREE.Mesh[] = [];
  for (let i = 0; i < 13; i++) {
    const b = busPos(i);
    const y = terrainY(b.x, b.z);
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.03, 0.7),
      new THREE.MeshStandardMaterial({ color: '#1c2a3d', roughness: 0.6, metalness: 0.5, emissive: new THREE.Color('#86c5da'), emissiveIntensity: 0 }),
    );
    pad.position.set(b.x, y + 0.02, b.z);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: GLAZE.clone(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.set(b.x, y + 0.35, b.z);
    s.scale.setScalar(1.6);
    group.add(pad, s);
    sprites.push(s);
    pads.push(pad);
  }
  return { group, sprites, pads };
}

// --------------------------------------------------------------- plants

function hyperboloid() {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const y = i / 16;
    const r = 0.38 * Math.sqrt(1 + ((y - 0.72) / 0.42) ** 2) * 0.62;
    pts.push(new THREE.Vector2(r, y));
  }
  const g = new THREE.LatheGeometry(pts, 28);
  return g;
}

export interface PlantVisual {
  id: string;
  group: THREE.Group;
  steamFrom: THREE.Vector3[];
  rotors: THREE.Object3D[];
  glow: THREE.Sprite;
}

export function buildPlants() {
  const concrete = new THREE.MeshStandardMaterial({ color: '#6c7686', roughness: 0.9, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2a3445', roughness: 0.7, metalness: 0.3 });
  const white = new THREE.MeshStandardMaterial({ color: '#c9d1dc', roughness: 0.5, metalness: 0.2 });
  const panel = new THREE.MeshStandardMaterial({ color: '#0d1d3a', roughness: 0.25, metalness: 0.7 });
  const tex = glowTexture();
  const red: THREE.Vector3[] = [];
  const visuals: PlantVisual[] = [];
  const k = S * 0.05; // km per "structure unit"

  for (const p of PLANTS) {
    const site = PLANT_SITE[p.id];
    const g = new THREE.Group();
    const y0 = terrainY(site.x, site.z);
    g.position.set(site.x, y0, site.z);
    const steamFrom: THREE.Vector3[] = [];
    const rotors: THREE.Object3D[] = [];
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x * k, y * k, z * k);
      m.scale.set(sx * k, sy * k, sz * k);
      g.add(m);
      return m;
    };
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    if (p.kind === 'coal' || p.kind === 'nuclear') {
      const n = p.kind === 'coal' ? 4 : 2;
      for (let i = 0; i < n; i++) {
        const tx = (i % 2) * 1.3 - 0.65 + (p.kind === 'nuclear' ? 2.2 : 0);
        const tz = Math.floor(i / 2) * 1.3 - 0.4;
        add(hyperboloid(), concrete, tx, 0, tz, 1.6, 2.6, 1.6);
        steamFrom.push(new THREE.Vector3(site.x + tx * k, y0 + 2.6 * k, site.z + tz * k));
      }
      if (p.kind === 'nuclear') {
        const dome = new THREE.SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        add(new THREE.CylinderGeometry(0.5, 0.5, 0.8, 24).translate(0, 0.4, 0), white, -0.8, 0, -0.2, 1, 1, 1);
        add(dome, white, -0.8, 0.8, -0.2);
        add(new THREE.CylinderGeometry(0.5, 0.5, 0.8, 24).translate(0, 0.4, 0), white, -0.8, 0, 0.9);
        add(dome, white, -0.8, 0.8, 0.9);
        add(box, dark, 0.4, 0, 0.35, 1.2, 0.6, 1.8);
      } else {
        add(box, dark, -2, 0, 0, 1.4, 0.9, 2.2);
        add(new THREE.CylinderGeometry(0.08, 0.12, 4, 10).translate(0, 2, 0), concrete, -2.9, 0, 0.3);
        red.push(new THREE.Vector3(site.x - 2.9 * k, y0 + 4.05 * k, site.z + 0.3 * k));
      }
    } else if (p.kind === 'ccgt' || p.kind === 'ocgt') {
      const n = p.kind === 'ccgt' ? 2 : 2;
      const sc = p.kind === 'ccgt' ? 1 : 0.6;
      for (let i = 0; i < n; i++) {
        add(box, dark, i * 1.4 * sc - 0.7 * sc, 0, 0, 1.1 * sc, 0.8 * sc, 1.8 * sc);
        add(new THREE.CylinderGeometry(0.1, 0.12, 2.2 * sc, 10).translate(0, 1.1 * sc, 0), concrete, i * 1.4 * sc - 0.7 * sc, 0, 1.1 * sc);
        steamFrom.push(new THREE.Vector3(site.x + (i * 1.4 * sc - 0.7 * sc) * k, y0 + 2.2 * sc * k, site.z + 1.1 * sc * k));
        red.push(new THREE.Vector3(site.x + (i * 1.4 * sc - 0.7 * sc) * k, y0 + 2.25 * sc * k, site.z + 1.1 * sc * k));
      }
    } else if (p.kind === 'hydro') {
      const dam = new THREE.CylinderGeometry(4.5, 4.5, 1.6, 40, 1, true, -0.55, 1.1);
      const m = add(dam, concrete, 0, 0.2, -4.4, 1, 1, 1);
      m.rotation.y = Math.PI;
      (m.material as THREE.Material).side = THREE.DoubleSide;
      add(box, dark, 0, 0, 0.5, 2.4, 0.5, 0.8);
    } else if (p.kind === 'wind') {
      const tower = new THREE.CylinderGeometry(0.03, 0.06, 1, 8).translate(0, 0.5, 0);
      const blade = new THREE.BoxGeometry(0.05, 0.75, 0.015).translate(0, 0.375, 0);
      for (let i = 0; i < 30; i++) {
        const tx = (i % 6) * 2.4 - 6 + (Math.floor(i / 6) % 2) * 1.2;
        const tz = Math.floor(i / 6) * 2.2 - 4.4;
        const t = add(tower, white, tx, 0, tz, 1, 2.6, 1);
        void t;
        const rotor = new THREE.Group();
        rotor.position.set(tx * k, 2.6 * k, tz * k + 0.05 * k);
        for (let b = 0; b < 3; b++) {
          const bm = new THREE.Mesh(blade, white);
          bm.rotation.z = (b * Math.PI * 2) / 3;
          rotor.add(bm);
        }
        rotor.scale.setScalar(k);
        rotor.rotation.z = i * 0.7;
        g.add(rotor);
        rotors.push(rotor);
        red.push(new THREE.Vector3(site.x + tx * k, 2.68 * k - 0.05, site.z + tz * k));
      }
      g.position.y = 0;
    } else if (p.kind === 'solar') {
      const n = 1400;
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.02, 0.45), panel, n);
      const mm = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, 0));
      for (let i = 0; i < n; i++) {
        const r = i % 35;
        const c = Math.floor(i / 35);
        mm.compose(new THREE.Vector3((r - 17) * 0.11, 0.04, (c - 20) * 0.08), q, new THREE.Vector3(0.1, 1, 0.1));
        im.setMatrixAt(i, mm);
      }
      g.add(im);
    } else if (p.kind === 'battery') {
      for (let i = 0; i < 12; i++) add(box, white, (i % 6) * 0.5 - 1.25, 0, Math.floor(i / 6) * 0.7 - 0.35, 0.4, 0.3, 0.55);
    } else if (p.kind === 'link') {
      add(box, white, 0, 0, 0, 2.6, 0.9, 1.4);
      add(box, dark, 0, 0, 1.4, 2.0, 0.5, 0.8);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color('#ffb04d'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.set(0, 0.6, 0);
    glow.scale.setScalar(p.kind === 'wind' ? 0.01 : 3.2);
    g.add(glow);
    visuals.push({ id: p.id, group: g, steamFrom, rotors, glow });
  }
  return { visuals, red };
}

export function buildSteam(sources: THREE.Vector3[]) {
  const per = 36;
  const n = sources.length * per;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const alpha = new Float32Array(n);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTex: { value: glowTexture('rgba(255,255,255,0.9)') } },
    vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; vA = aAlpha; gl_PointSize = aSize * 900.0 / -mv.z; }`,
    fragmentShader: `uniform sampler2D uTex; varying float vA; void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vec3(0.46,0.5,0.58), t.a * vA * 0.5); }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const age = new Float32Array(n).map(() => Math.random());
  return { points, per, age };
}

export { coastZ };
