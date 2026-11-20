import * as THREE from 'three';

// Procedural surface textures. Everything is drawn on canvases at load so the
// plants ship as code, not megabytes of images.

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// tileable value noise on a grid of `cells`
function noiseField(size: number, cells: number, seed: number) {
  const r = rng(seed);
  const g = new Float32Array(cells * cells).map(() => r());
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells, fy = (y / size) * cells;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const i = (xx: number, yy: number) => g[((yy % cells) * cells) + (xx % cells)];
      const a = i(x0, y0), b = i(x0 + 1, y0), c = i(x0, y0 + 1), d = i(x0 + 1, y0 + 1);
      out[y * size + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

export function fbm(size: number, seed: number, octaves = 5, base = 4) {
  const out = new Float32Array(size * size);
  let amp = 0.5, tot = 0;
  for (let o = 0; o < octaves; o++) {
    const n = noiseField(size, base << o, seed + o * 17);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    tot += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

function canvas(w: number, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tex(c: HTMLCanvasElement, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function hex(c: string) {
  const v = new THREE.Color(c);
  return [v.r * 255, v.g * 255, v.b * 255];
}

const cache = new Map<string, unknown>();
function memo<T>(key: string, f: () => T): T {
  if (!cache.has(key)) cache.set(key, f());
  return cache.get(key) as T;
}

/**
 * Weathered cast concrete: formwork lifts, tie holes, rain streaks running down
 * from every ledge, and a darker skirt where splash-back stains the base.
 */
export function concrete(color = '#b9b4a8', opts: { lifts?: number; streaks?: number; seed?: number; ties?: boolean } = {}) {
  const { lifts = 8, streaks = 1, seed = 3, ties = true } = opts;
  return memo(`con${color}${lifts}${streaks}${seed}${ties}`, () => {
    const S = 512;
    const c = canvas(S);
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(S, S);
    const n = fbm(S, seed, 6, 4);
    const fine = fbm(S, seed + 9, 3, 64);
    const [r0, g0, b0] = hex(color);
    const R = rng(seed);
    // streak columns
    const col = new Float32Array(S);
    for (let k = 0; k < 60 * streaks; k++) {
      const x = Math.floor(R() * S), w = 2 + Math.floor(R() * 7), s = R() * R() * 0.3;
      for (let j = -w; j <= w; j++) col[(x + j + S) % S] += s * (1 - Math.abs(j) / (w + 1));
    }
    const bump = new Uint8ClampedArray(S * S);
    for (let y = 0; y < S; y++) {
      const lift = (y % Math.floor(S / lifts));
      const liftLine = lift < 2 ? 0.75 : 1;
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        const streak = col[x] * (0.5 + 0.5 * n[(i + 37 * S) % (S * S)]) * (0.3 + (lift / (S / lifts)) * 0.9);
        let v = 0.82 + (n[i] - 0.5) * 0.32 + (fine[i] - 0.5) * 0.1 - streak;
        v *= liftLine;
        img.data[i * 4] = r0 * v;
        img.data[i * 4 + 1] = g0 * v;
        img.data[i * 4 + 2] = b0 * v * 0.98;
        img.data[i * 4 + 3] = 255;
        bump[i] = 128 + (fine[i] - 0.5) * 120 - (liftLine < 1 ? 50 : 0);
      }
    }
    ctx.putImageData(img, 0, 0);
    if (ties) {
      ctx.fillStyle = 'rgba(40,38,34,0.35)';
      const step = S / lifts;
      for (let y = step / 2; y < S; y += step) for (let x = 16; x < S; x += 64) ctx.fillRect(x, y, 3, 3);
    }
    const bc = canvas(S);
    const bctx = bc.getContext('2d')!;
    const bi = bctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) { bi.data[i * 4] = bi.data[i * 4 + 1] = bi.data[i * 4 + 2] = bump[i]; bi.data[i * 4 + 3] = 255; }
    bctx.putImageData(bi, 0, 0);
    return { map: tex(c), bump: tex(bc, false) };
  });
}

/** Profiled steel cladding: trapezoidal ribs, panel joints and a little chalking. */
export function cladding(color = '#8d969c', seed = 5, ribs = 32) {
  return memo(`cl${color}${seed}${ribs}`, () => {
    const S = 512;
    const c = canvas(S);
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(S, S);
    const n = fbm(S, seed, 5, 4);
    const [r0, g0, b0] = hex(color);
    const bc = canvas(S), bctx = bc.getContext('2d')!, bi = bctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      const joint = y % 128 < 2 ? 0.7 : 1;
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        const ph = ((x / S) * ribs) % 1;
        const rib = ph < 0.18 ? 1 : ph < 0.28 ? 0.6 : ph > 0.9 ? 0.6 : 0.2;
        const v = (0.86 + (n[i] - 0.5) * 0.18 + rib * 0.1) * joint - (y / S) * 0.06;
        img.data[i * 4] = r0 * v; img.data[i * 4 + 1] = g0 * v; img.data[i * 4 + 2] = b0 * v; img.data[i * 4 + 3] = 255;
        const b = rib * 200 + 30;
        bi.data[i * 4] = bi.data[i * 4 + 1] = bi.data[i * 4 + 2] = joint < 1 ? 20 : b; bi.data[i * 4 + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    bctx.putImageData(bi, 0, 0);
    return { map: tex(c), bump: tex(bc, false) };
  });
}

/**
 * Window grid. `map` is the daytime facade (glass reflects dark, mullions light),
 * `emissive` holds the lit panes for night. Lit fraction varies per floor, like
 * a real plant where the control room and corridors stay on and stores do not.
 */
export function windows(opts: { cols: number; rows: number; wall: string; glass?: string; lit?: number; seed?: number; band?: boolean }) {
  const { cols, rows, wall, glass = '#1d2a33', lit = 0.45, seed = 1, band = false } = opts;
  return memo(`win${cols}${rows}${wall}${glass}${lit}${seed}${band}`, () => {
    const W = 512, H = 512;
    const c = canvas(W, H), e = canvas(W, H);
    const ctx = c.getContext('2d')!, ex = e.getContext('2d')!;
    const R = rng(seed);
    const n = fbm(256, seed, 4, 4);
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, W, H);
    // a touch of grime on the wall
    const gi = ctx.getImageData(0, 0, W, H);
    for (let i = 0; i < W * H; i++) {
      const v = 0.9 + (n[(i % W >> 1) + ((i / W / 2) | 0) * 256] - 0.5) * 0.18;
      gi.data[i * 4] *= v; gi.data[i * 4 + 1] *= v; gi.data[i * 4 + 2] *= v;
    }
    ctx.putImageData(gi, 0, 0);
    ex.fillStyle = '#000';
    ex.fillRect(0, 0, W, H);
    const cw = W / cols, rh = H / rows;
    for (let r = 0; r < rows; r++) {
      const floorLit = lit * (0.4 + R() * 1.2);
      for (let k = 0; k < cols; k++) {
        const x = k * cw, y = r * rh;
        const px = band ? 0 : cw * 0.18, py = rh * 0.28;
        const gw = band ? cw : cw - px * 2, gh = rh * 0.5;
        const sky = 0.75 + R() * 0.5;
        ctx.fillStyle = glass;
        ctx.globalAlpha = 1;
        ctx.fillRect(x + px, y + py, gw, gh);
        ctx.fillStyle = `rgba(150,175,195,${0.12 * sky})`;
        ctx.fillRect(x + px, y + py, gw, gh * 0.35);
        if (R() < floorLit) {
          const warm = R() < 0.7;
          const b = 0.55 + R() * 0.45;
          ex.fillStyle = warm ? `rgba(255,${180 + R() * 40},${110 + R() * 40},${b})` : `rgba(${200 + R() * 40},230,255,${b})`;
          ex.fillRect(x + px, y + py, gw, gh);
        }
      }
    }
    return { map: tex(c), emissive: tex(e) };
  });
}

export function asphalt(seed = 7) {
  return memo(`asp${seed}`, () => {
    const S = 256, c = canvas(S), ctx = c.getContext('2d')!, img = ctx.createImageData(S, S);
    const n = fbm(S, seed, 5, 8), f = fbm(S, seed + 3, 2, 128);
    for (let i = 0; i < S * S; i++) {
      const v = 58 + (n[i] - 0.5) * 30 + (f[i] - 0.5) * 30;
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v * 1.04; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return tex(c);
  });
}

/** Ground: grass, dry patches and bare earth blended by large-scale noise. */
export function ground(palette: { grass: string; dry: string; earth: string }, seed = 11) {
  return memo(`gr${palette.grass}${palette.dry}${palette.earth}${seed}`, () => {
    const S = 512, c = canvas(S), ctx = c.getContext('2d')!, img = ctx.createImageData(S, S);
    const big = fbm(S, seed, 5, 2), mid = fbm(S, seed + 5, 4, 16), fine = fbm(S, seed + 8, 2, 128);
    const g = hex(palette.grass), d = hex(palette.dry), e = hex(palette.earth);
    for (let i = 0; i < S * S; i++) {
      const t = THREE.MathUtils.smoothstep(big[i] + (mid[i] - 0.5) * 0.3, 0.45, 0.62);
      const u = THREE.MathUtils.smoothstep(mid[i], 0.66, 0.75);
      const v = 0.85 + (fine[i] - 0.5) * 0.35;
      for (let k = 0; k < 3; k++) img.data[i * 4 + k] = ((g[k] * (1 - t) + d[k] * t) * (1 - u) + e[k] * u) * v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return tex(c);
  });
}

/** Tangent-space normal map from noise, used for water ripples. */
export function waterNormal(seed = 21) {
  return memo(`wn${seed}`, () => {
    const S = 256, h = fbm(S, seed, 5, 8), c = canvas(S), ctx = c.getContext('2d')!, img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)];
      const dy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
      const v = new THREE.Vector3(-dx * 6, -dy * 6, 1).normalize();
      img.data[i * 4] = (v.x * 0.5 + 0.5) * 255; img.data[i * 4 + 1] = (v.y * 0.5 + 0.5) * 255; img.data[i * 4 + 2] = (v.z * 0.5 + 0.5) * 255; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return tex(c, false);
  });
}

/** Soft cumulus puff for steam sprites. */
export function puff(seed = 31) {
  return memo(`puff${seed}`, () => {
    const S = 128, c = canvas(S), ctx = c.getContext('2d')!, img = ctx.createImageData(S, S);
    const n = fbm(S, seed, 5, 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const d = Math.hypot(x - S / 2, y - S / 2) / (S / 2);
      const a = Math.max(0, 1 - d * d) * (0.45 + n[i] * 0.9);
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
      img.data[i * 4 + 3] = Math.min(255, a * a * 255);
    }
    ctx.putImageData(img, 0, 0);
    return tex(c, false, false);
  });
}

export function glow(inner = 'rgba(255,255,255,1)') {
  return memo(`glow${inner}`, () => {
    const S = 128, c = canvas(S), ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return tex(c, false, false);
  });
}

/** Aviation obstruction banding: red/white for chimneys, as ICAO marks them. */
export function bands(n: number, a = '#c7372c', b = '#ece8e0', from = 0) {
  return memo(`bands${n}${a}${b}${from}`, () => {
    const c = canvas(16, 512), ctx = c.getContext('2d')!;
    const base = concrete('#b8b2a6', { lifts: 12, seed: 4 }).map.image as HTMLCanvasElement;
    ctx.drawImage(base, 0, 0, 16, 512);
    const h = 512 * (1 - from) / n;
    for (let k = 0; k < n; k++) {
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = k % 2 ? b : a;
      ctx.fillRect(0, k * h, 16, h);
    }
    return tex(c);
  });
}

/** Fukushima Daiichi's reactor buildings were painted with a sky and clouds. */
export function skyMural(seed = 41) {
  return memo(`mural${seed}`, () => {
    const W = 512, H = 512, c = canvas(W, H), ctx = c.getContext('2d')!, img = ctx.createImageData(W, H);
    const n = fbm(W, seed, 6, 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const cloud = THREE.MathUtils.smoothstep(n[i] + (y / H) * 0.12, 0.52, 0.6);
      const sky = [118 + y * 0.12, 168 + y * 0.08, 206];
      for (let k = 0; k < 3; k++) img.data[i * 4 + k] = sky[k] * (1 - cloud) + 236 * cloud;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return tex(c);
  });
}

/** Dashed centre line for roads. */
export function roadLines() {
  return memo('road', () => {
    const c = canvas(64, 256), ctx = c.getContext('2d')!;
    ctx.drawImage(asphalt().image as HTMLCanvasElement, 0, 0, 64, 256);
    ctx.fillStyle = 'rgba(230,226,210,0.85)';
    ctx.fillRect(30, 0, 4, 120);
    ctx.fillStyle = 'rgba(230,226,210,0.6)';
    ctx.fillRect(2, 0, 2, 256);
    ctx.fillRect(60, 0, 2, 256);
    return tex(c);
  });
}
