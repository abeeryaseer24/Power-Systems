import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FALLOUT, N, STEP, landMask, proj, simulate, type FalloutDef, type FalloutRun } from '../fallout/model';
import { hills } from '../plants3d/common';
import { puff } from '../plants3d/textures';
import '../plants.css';
import '../fallout.css';

const BAND_COL = ['#efe29a', '#f2b24a', '#e6703a', '#c62f3b'];

export default function Fallout() {
  const { id = '' } = useParams();
  const d = FALLOUT[id];
  if (!d) {
    return (
      <main id="main" className="page fo-index">
        <h1>Fallout</h1>
        <ul>{Object.values(FALLOUT).map((f) => <li key={f.id}><Link to={`/fallout/${f.id}`}>{f.name}</Link></li>)}</ul>
      </main>
    );
  }
  return <Map key={d.id} d={d} />;
}

function fmt(d: FalloutDef, t: number) {
  const tz = d.id === 'fukushima' ? 9 : 4; // JST, Moscow summer time
  const x = new Date(d.date0.getTime() + (t + tz) * 3600e3);
  const mon = x.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  return `${x.getUTCDate()} ${mon} · ${String(x.getUTCHours()).padStart(2, '0')}:${String(x.getUTCMinutes()).padStart(2, '0')}`;
}

function Map({ d }: { d: FalloutDef }) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const run = useMemo<FalloutRun>(() => simulate(d), [d]);
  const [t, setT] = useState(0);
  const [play, setPlay] = useState(true);
  const api = useRef<{ set: (t: number) => void } | null>(null);

  useEffect(() => {
    const el = host.current!, lab = labels.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#081320');
    scene.fog = new THREE.Fog('#081320', d.half * 2.2, d.half * 4.5);
    const cam = new THREE.PerspectiveCamera(40, 1, 0.5, 5000);
    cam.position.set(d.half * 0.35, d.half * 1.15, d.half * 1.05);
    const controls = new OrbitControls(cam, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = 1.35;
    controls.minDistance = 20;
    controls.maxDistance = d.half * 3;
    scene.add(new THREE.HemisphereLight('#cfe0f0', '#1a1410', 1.1));
    const sun = new THREE.DirectionalLight('#fff1dc', 1.6);
    sun.position.set(-200, 300, 150);
    scene.add(sun);

    // terrain: Polesia is flat, the Abukuma highlands rise west of the Fukushima coast (x3 vertical)
    const land = landMask(d);
    const hY = (x: number, z: number) => {
      if (!land(x, z)) return -0.4;
      const base = d.id === 'fukushima' ? Math.min(1, Math.max(0, (-x - 2) / 30)) * 1.6 + Math.max(0, -x - 70) * 0.01 : 0.15;
      return base + Math.max(0, hills(x * 20, z * 20, d.id === 'fukushima' ? 0.5 : 0.08));
    };
    const S = 2 * d.half;
    const geo = new THREE.PlaneGeometry(S, S, 180, 180);
    geo.rotateX(-Math.PI / 2);
    const pa = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) pa.setY(i, hY(pa.getX(i), pa.getZ(i)));
    geo.computeVertexNormals();
    const cv = document.createElement('canvas');
    cv.width = cv.height = 2048;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.18 });
    scene.add(new THREE.Mesh(geo, mat));

    // base map drawn once into an offscreen canvas
    const base = document.createElement('canvas');
    base.width = base.height = 2048;
    const b = base.getContext('2d')!;
    const px = (x: number) => ((x + d.half) / S) * 2048;
    const L = 512, lc = document.createElement('canvas');
    lc.width = lc.height = L;
    const lx = lc.getContext('2d')!, img = lx.createImageData(L, L);
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
      const x = -d.half + ((i + 0.5) / L) * S, z = -d.half + ((j + 0.5) / L) * S;
      const k = (j * L + i) * 4;
      if (land(x, z)) {
        const n = hills(x * 40, z * 40, 1) * 10;
        img.data[k] = 46 + n; img.data[k + 1] = 58 + n; img.data[k + 2] = 46 + n * 0.5;
      } else { img.data[k] = 14; img.data[k + 1] = 34; img.data[k + 2] = 50; }
      img.data[k + 3] = 255;
    }
    lx.putImageData(img, 0, 0);
    b.imageSmoothingEnabled = true;
    b.drawImage(lc, 0, 0, 2048, 2048);
    b.strokeStyle = 'rgba(134,197,218,0.75)';
    b.lineCap = 'round';
    for (const r of d.rivers ?? []) {
      b.lineWidth = 7;
      b.beginPath();
      r.forEach(([la, lo], k) => { const [x, z] = proj(d, la, lo); if (k) b.lineTo(px(x), px(z)); else b.moveTo(px(x), px(z)); });
      b.stroke();
    }
    b.strokeStyle = 'rgba(236,230,216,0.07)';
    b.lineWidth = 2;
    for (let g = -d.half; g <= d.half; g += 50) { b.beginPath(); b.moveTo(px(g), 0); b.lineTo(px(g), 2048); b.moveTo(0, px(g)); b.lineTo(2048, px(g)); b.stroke(); }
    for (const p of d.places) {
      const [x, z] = proj(d, p.lat, p.lon);
      b.fillStyle = '#ece6d8';
      b.beginPath(); b.arc(px(x), px(z), p.big ? 9 : 6, 0, Math.PI * 2); b.fill();
    }
    b.fillStyle = '#ffb04d';
    b.beginPath(); b.arc(px(0), px(0), 12, 0, Math.PI * 2); b.fill();

    // dose overlay: one pixel per model cell, smoothed when scaled up
    const dose = document.createElement('canvas');
    dose.width = dose.height = N;
    const dc = dose.getContext('2d')!;
    const di = dc.createImageData(N, N);
    const cols = BAND_COL.map((c) => new THREE.Color(c));
    const ctx = cv.getContext('2d')!;

    // puffs
    const MAXP = 1200;
    const pg = new THREE.BufferGeometry();
    const ppos = new Float32Array(MAXP * 3), psize = new Float32Array(MAXP);
    pg.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
    pg.setAttribute('size', new THREE.BufferAttribute(psize, 1));
    const pm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { map: { value: puff() } },
      vertexShader: 'attribute float size; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = size * 600.0 / -mv.z; }',
      fragmentShader: 'uniform sampler2D map; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vec3(1.0,0.72,0.35)*t.a*0.35, t.a*0.35); }',
    });
    const pts = new THREE.Points(pg, pm);
    pts.frustumCulled = false;
    scene.add(pts);

    // evacuation rings
    const rings = d.zones.map((zn) => {
      const g = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 129 }, (_, k) => {
        const a = (k / 128) * Math.PI * 2;
        const x = Math.cos(a) * zn.r, z = Math.sin(a) * zn.r;
        return new THREE.Vector3(x, hY(x, z) + 0.6, z);
      }));
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#c9b8ff', transparent: true, opacity: 0.9 }));
      l.visible = false;
      scene.add(l);
      return l;
    });

    // labels
    const tags = [...d.places.map((p) => ({ text: p.name, big: p.big, pos: (() => { const [x, z] = proj(d, p.lat, p.lon); return new THREE.Vector3(x, hY(x, z) + 1, z); })() })),
      { text: d.id === 'chernobyl' ? 'ChNPP' : 'Daiichi', big: true, pos: new THREE.Vector3(0, 2, 0) },
      ...(d.offmap ?? []).map((o) => { const a = (o.bearing * Math.PI) / 180; const r = d.half * 0.95; return { text: `${o.name} ${o.km} km →`, big: false, pos: new THREE.Vector3(Math.sin(a) * r, 1, -Math.cos(a) * r) }; }),
      ...d.zones.map((zn) => ({ text: zn.label, big: false, zone: true, pos: new THREE.Vector3(zn.r * 0.72, 1, zn.r * 0.72) }))];
    const tagEls = tags.map((g) => {
      const e = document.createElement('div');
      e.className = `fo-tag ${g.big ? 'big' : ''} ${'zone' in g ? 'zone' : ''}`;
      e.textContent = g.text;
      lab.appendChild(e);
      return e;
    });

    let cur = 0, lastSi = -1;
    const soft = document.createElement('canvas');
    soft.width = soft.height = 512;
    const sc = soft.getContext('2d')!;
    const set = (tt: number) => {
      cur = tt;
      const si = Math.max(0, Math.min(run.snaps.length - 1, Math.floor(tt / run.snapEvery)));
      const g = run.snaps[si];
      if (si !== lastSi) {
      lastSi = si;
      for (let k = 0; k < N * N; k++) {
        const v = g[k] * run.scale;
        let band = -1;
        for (let q = 0; q < d.bands.length; q++) if (v >= d.bands[q][0]) band = q;
        const c = cols[Math.max(0, band)];
        di.data[k * 4] = c.r * 255; di.data[k * 4 + 1] = c.g * 255; di.data[k * 4 + 2] = c.b * 255;
        di.data[k * 4 + 3] = band < 0 ? Math.min(90, (v / d.bands[0][0]) * 90) : 150 + band * 25;
      }
      dc.putImageData(di, 0, 0);
      ctx.drawImage(base, 0, 0);
      sc.clearRect(0, 0, 512, 512);
      sc.filter = 'blur(2px)';
      sc.drawImage(dose, 0, 0, 512, 512);
      sc.filter = 'none';
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(soft, 0, 0, 2048, 2048);
      tex.needsUpdate = true;
      }
      const fr = run.puffs[Math.min(run.puffs.length - 1, Math.round(tt / STEP))];
      const n = Math.min(MAXP, fr.length / 3);
      for (let k = 0; k < n; k++) {
        const x = fr[k * 3], z = fr[k * 3 + 1], m = fr[k * 3 + 2];
        ppos[k * 3] = x; ppos[k * 3 + 1] = 4 + Math.min(6, k * 0); ppos[k * 3 + 2] = z;
        psize[k] = Math.min(9, 1.5 + Math.sqrt(m) * 2.2);
      }
      for (let k = n; k < MAXP; k++) psize[k] = 0;
      pg.setDrawRange(0, n);
      (pg.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (pg.attributes.size as THREE.BufferAttribute).needsUpdate = true;
      d.zones.forEach((zn, k) => { rings[k].visible = tt >= zn.t; });
    };
    api.current = { set };
    set(0);

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    };
    addEventListener('resize', resize);
    resize();
    let raf = 0;
    const v = new THREE.Vector3();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, cam);
      const w = el.clientWidth, h = el.clientHeight;
      tags.forEach((g, k) => {
        v.copy(g.pos).project(cam);
        const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && (!('zone' in g) || cur >= d.zones[k - (tags.length - d.zones.length)].t);
        tagEls[k].style.opacity = vis ? '1' : '0';
        tagEls[k].style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px)`;
      });
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      tagEls.forEach((e) => e.remove());
      geo.dispose(); mat.dispose(); tex.dispose(); pg.dispose(); pm.dispose();
    };
  }, [d, run]);

  useEffect(() => { api.current?.set(t); }, [t]);
  useEffect(() => {
    if (!play) return;
    let last = performance.now(), raf = 0;
    const loop = (now: number) => {
      const dt = Math.max(0, (now - last) / 1000);
      last = now;
      setT((x) => {
        const n = Math.min(d.hours, x + dt * 4); // 4 hours a second
        if (n >= d.hours) setPlay(false);
        return n;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [play, d]);

  const ev = [...d.events].reverse().find(([h]) => t >= h);
  return (
    <main id="main" className="fo-map">
      <div className="fo-canvas" ref={host} />
      <div className="fo-labels" ref={labels} aria-hidden="true" />
      <header className="fo-head">
        <Link to={`/plants/${d.id}`} className="pv-back">Back to the plant</Link>
        <h1>{d.name}</h1>
        <p>Where the fallout went, hour by hour</p>
      </header>
      <aside className="fo-legend">
        <h2>Cs-137 on the ground</h2>
        <p>kBq/m²</p>
        <ol>{d.bands.map(([, label], k) => <li key={label}><i style={{ background: BAND_COL[k] }} />{label}</li>)}</ol>
        <p className="fo-note">Modelled: a puff model driven by the reconstructed release and wind, scaled against the published contamination maps. The shapes are indicative, not measurements.</p>
      </aside>
      {ev && <p className="fo-ev" key={ev[1]}>{ev[1]}</p>}
      <nav className="fo-bar" aria-label="Time">
        <button onClick={() => { if (t >= d.hours) setT(0); setPlay(!play); }} aria-label={play ? 'Pause' : 'Play'}>{play ? '❚❚' : '▶'}</button>
        <strong>{fmt(d, t)}</strong>
        <input type="range" min={0} max={d.hours} step={0.5} value={t} onChange={(e) => { setPlay(false); setT(Number(e.target.value)); }} aria-label="Hours since the accident" />
        <span>+{Math.floor(t)} h</span>
      </nav>
    </main>
  );
}
