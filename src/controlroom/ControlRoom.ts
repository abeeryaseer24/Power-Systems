import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { at, type Replay } from './timelines';

// A horseshoe of seven board sections around the operator's seat. Every
// instrument is drawn on canvas from the replay's curves, so the board is the
// accident as the operators saw it: alarms flashing, meters swinging, lights lying.

const SECTIONS = 7;
const SW = 512, SH = 480, BH = 150;
const R = 5.2;
const ang = (i: number) => (i - 3) * 0.34;

type Pal = { panel: string; panel2: string; ink: string; face: string; lit: string; litText: string; frame: string; floor: string; wall: string };
const PAL: Record<Replay['style'], Pal> = {
  us70s: { panel: '#c9c2ae', panel2: '#b8b19c', ink: '#1d1d1b', face: '#f1ede2', lit: '#ffd77a', litText: '#3a2a00', frame: '#5f5a4e', floor: '#5b5248', wall: '#d8d2c2' },
  rbmk: { panel: '#8fa39a', panel2: '#7d9188', ink: '#14201b', face: '#e9eee6', lit: '#ff8a5c', litText: '#3a0e00', frame: '#3e4a45', floor: '#4b4038', wall: '#b7c0b2' },
};

export class ControlRoom {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, 1, 0.05, 100);
  t = 0;
  playing = true;
  speedMul = 1;
  onEvent?: (i: number) => void;
  onTick?: (t: number) => void;
  private composer: EffectComposer;
  private board = document.createElement('canvas');
  private bench = document.createElement('canvas');
  private boardTex: THREE.CanvasTexture;
  private benchTex: THREE.CanvasTexture;
  private pal: Pal;
  private yaw = 0;
  private pitch = 0.12;
  private wantYaw = 0;
  private userUntil = 0;
  private drag: { x: number; y: number } | null = null;
  private evIdx = -1;
  private alarmLitAt: number[] = [];
  private ceiling: THREE.MeshStandardMaterial;
  private lamps: THREE.PointLight[] = [];
  private clock = new THREE.Clock();
  private raf = 0;
  private acc = 0;
  private dead = false;
  private trace: number[] = [];

  constructor(private host: HTMLElement, public rp: Replay) {
    this.pal = PAL[rp.style];
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.62;
    host.appendChild(this.renderer.domElement);
    this.board.width = SW * SECTIONS;
    this.board.height = SH;
    this.bench.width = SW * SECTIONS;
    this.bench.height = BH;
    this.boardTex = new THREE.CanvasTexture(this.board);
    this.benchTex = new THREE.CanvasTexture(this.bench);
    for (const t of [this.boardTex, this.benchTex]) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; }
    this.ceiling = new THREE.MeshStandardMaterial({ color: '#ddd', emissive: '#fff6e0', emissiveIntensity: 0.9 });
    this.buildRoom();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.3, 0.4, 0.95));
    this.composer.addPass(new OutputPass());
    // assign each alarm a lighting time from the events
    let k = 0;
    for (const e of rp.events) for (let i = 0; i < (e.alarms ?? 0); i++) this.alarmLitAt[k++] = e.t + i * 0.35;
    this.camera.position.set(0, 1.25, 0);
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.pd);
    addEventListener('pointermove', this.pm);
    addEventListener('pointerup', this.pu);
    addEventListener('resize', this.resize);
    this.resize();
    this.draw();
    this.loop();
  }

  // ---------------------------------------------------------------- room

  private buildRoom() {
    const p = this.pal;
    const boardM = new THREE.MeshStandardMaterial({ map: this.boardTex, emissiveMap: this.boardTex, emissive: '#ffffff', emissiveIntensity: 0.1, roughness: 0.55 });
    const benchM = new THREE.MeshStandardMaterial({ map: this.benchTex, emissiveMap: this.benchTex, emissive: '#ffffff', emissiveIntensity: 0.1, roughness: 0.5 });
    const frame = new THREE.MeshStandardMaterial({ color: p.frame, roughness: 0.6, metalness: 0.2 });
    const w = 2 * R * Math.tan(0.17) + 0.02;
    for (let i = 0; i < SECTIONS; i++) {
      const a = ang(i);
      const g = new THREE.Group();
      g.rotation.y = -a;
      this.scene.add(g);
      // vertical board: UVs pick this section's slice of the atlas
      const bg = new THREE.PlaneGeometry(w, 2.1);
      const uv = bg.attributes.uv as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / SECTIONS);
      const b = new THREE.Mesh(bg, boardM);
      b.position.set(0, 2.05, -R);
      g.add(b);
      // sloped benchboard
      const cg = new THREE.PlaneGeometry(w, 0.62);
      const cuv = cg.attributes.uv as THREE.BufferAttribute;
      for (let k = 0; k < cuv.count; k++) cuv.setX(k, (i + cuv.getX(k)) / SECTIONS);
      const c = new THREE.Mesh(cg, benchM);
      c.position.set(0, 0.92, -R + 0.42);
      c.rotation.x = -1.05;
      g.add(c);
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.78, 0.7), frame);
      base.position.set(0, 0.39, -R + 0.38);
      g.add(base);
      const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, 0.6), frame);
      top.position.set(0, 3.2, -R + 0.15);
      g.add(top);
    }
    // room shell
    const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshStandardMaterial({ color: p.floor, roughness: 0.8 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const walls = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 8.5, 3.6, 48, 1, true), new THREE.MeshStandardMaterial({ color: p.wall, roughness: 0.9, side: THREE.BackSide }));
    walls.position.y = 1.8;
    this.scene.add(walls);
    const ceil = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshStandardMaterial({ color: '#cfccc4', roughness: 0.9 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 3.6;
    this.scene.add(ceil);
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 2; z++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.3), this.ceiling);
      l.position.set(x * 1.6, 3.58, z * 1.4);
      this.scene.add(l);
    }
    this.scene.add(new THREE.HemisphereLight('#fff8ea', '#3a332c', 0.35));
    for (const [x, z] of [[-2.5, -2], [2.5, -2], [0, -3.5], [0, 1]]) {
      const pl = new THREE.PointLight('#fff2dc', 3.2, 12, 1.4);
      pl.position.set(x, 3.3, z);
      this.scene.add(pl);
      this.lamps.push(pl);
    }
    // the shift supervisor's desk behind the operators
    const desk = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.75, 0.9), new THREE.MeshStandardMaterial({ color: '#6e5a44', roughness: 0.7 }));
    desk.position.set(0, 0.375, 2.3);
    this.scene.add(desk);
    // operators at the board, backs to us
    const coat = new THREE.MeshStandardMaterial({ color: this.rp.style === 'rbmk' ? '#e8e8e2' : '#8aa0b8', roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: '#b98a6a', roughness: 0.7 });
    const trousers = new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.9 });
    for (const [i, off] of [[0.8, 0.25], [5.7, -0.2]] as const) {
      const a = ang(i);
      const g = new THREE.Group();
      g.position.set(Math.sin(a) * (R - 0.95), 0, -Math.cos(a) * (R - 0.95));
      g.rotation.y = -a + off;
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.6, 4, 10), coat);
      body.position.y = 1.25;
      const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.7, 4, 8), trousers);
      legs.position.y = 0.5;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), skin);
      head.position.y = 1.78;
      g.add(body, legs, head);
      if (this.rp.style === 'rbmk') {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 14), coat);
        cap.position.y = 1.88;
        g.add(cap);
      }
      this.scene.add(g);
    }
  }

  // ---------------------------------------------------------------- drawing

  private v(id: string) {
    const g = this.rp.gauges.find((x) => x.id === id);
    return g ? at(g.curve, this.t) : 0;
  }

  private draw() {
    const c = this.board.getContext('2d')!, b = this.bench.getContext('2d')!;
    const p = this.pal;
    for (let i = 0; i < SECTIONS; i++) {
      const x = i * SW;
      c.fillStyle = i % 2 ? p.panel : p.panel2;
      c.fillRect(x, 0, SW, SH);
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(x + SW - 3, 0, 3, SH);
      b.fillStyle = i % 2 ? p.panel2 : p.panel;
      b.fillRect(x, 0, SW, BH);
    }
    if (this.rp.style === 'us70s') this.drawTMI(c, b);
    else this.drawRBMK(c, b);
    // the board dims and flickers when the building is hit
    const blast = at(this.rp.extra.blast ?? [[0, 0]], this.t);
    if (blast > 0) {
      c.fillStyle = `rgba(0,0,0,${0.45 + Math.random() * 0.4})`;
      c.fillRect(0, 0, this.board.width, SH);
    }
    this.boardTex.needsUpdate = true;
    this.benchTex.needsUpdate = true;
  }

  private label(c: CanvasRenderingContext2D, text: string, x: number, y: number, size = 15, align: CanvasTextAlign = 'center') {
    c.fillStyle = this.pal.ink;
    c.font = `600 ${size}px "Atkinson Hyperlegible Next", Arial, sans-serif`;
    c.textAlign = align;
    c.fillText(text, x, y);
  }

  private plate(c: CanvasRenderingContext2D, text: string, x: number, y: number, w: number) {
    c.fillStyle = '#1a1a18';
    c.fillRect(x - w / 2, y - 14, w, 20);
    c.fillStyle = '#f4f1e8';
    c.font = '700 13px Arial, sans-serif';
    c.textAlign = 'center';
    c.fillText(text, x, y + 1);
  }

  private annunciators(c: CanvasRenderingContext2D, x: number, y: number, cols: number, rows: number, w: number, h: number, offset: number) {
    const p = this.pal;
    const cw = w / cols, rh = h / rows;
    c.fillStyle = '#222';
    c.fillRect(x - 4, y - 4, w + 8, h + 8);
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const n = offset + r * cols + k;
      const lit = this.alarmLitAt[n];
      const on = lit !== undefined && this.t >= lit;
      const flash = on && this.t - lit < 8 / Math.max(1, this.rp.speed(this.t) * 0.2) ? Math.floor(performance.now() / 280) % 2 === 0 : on;
      c.fillStyle = flash ? p.lit : '#d9d4c4';
      c.fillRect(x + k * cw + 2, y + r * rh + 2, cw - 4, rh - 4);
      c.fillStyle = flash ? p.litText : '#8d887a';
      c.font = '700 10px Arial, sans-serif';
      c.textAlign = 'center';
      const txt = this.rp.alarms[n % this.rp.alarms.length];
      const words = txt.split(' ');
      const mid = Math.ceil(words.length / 2);
      c.fillText(words.slice(0, mid).join(' '), x + k * cw + cw / 2, y + r * rh + rh / 2 - 1);
      c.fillText(words.slice(mid).join(' '), x + k * cw + cw / 2, y + r * rh + rh / 2 + 11);
    }
  }

  /** Edgewise vertical meter, the 1970s US standard. */
  private meter(c: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, h: number) {
    const g = this.rp.gauges.find((q) => q.id === id)!;
    const v = this.v(id);
    c.fillStyle = '#2a2925';
    c.fillRect(x - 6, y - 6, w + 12, h + 44);
    c.fillStyle = this.pal.face;
    c.fillRect(x, y, w, h);
    c.strokeStyle = this.pal.ink;
    c.lineWidth = 1;
    for (let k = 0; k <= 10; k++) {
      const yy = y + h - (h * k) / 10;
      c.beginPath(); c.moveTo(x + w * 0.55, yy); c.lineTo(x + w, yy); c.stroke();
      if (k % 2 === 0) { c.fillStyle = this.pal.ink; c.font = '600 11px Arial'; c.textAlign = 'right'; c.fillText(String(Math.round(g.min + ((g.max - g.min) * k) / 10)), x + w * 0.5, yy + 4); }
    }
    if (g.warn !== undefined) {
      const wy = y + h - (h * (g.warn - g.min)) / (g.max - g.min);
      c.fillStyle = 'rgba(200,40,30,0.35)';
      c.fillRect(x + w * 0.56, Math.min(wy, y + h), w * 0.44, 3);
    }
    const f = Math.max(0, Math.min(1.02, (v - g.min) / (g.max - g.min)));
    const py = y + h - h * f;
    c.fillStyle = '#c0261c';
    c.beginPath(); c.moveTo(x + w * 0.52, py); c.lineTo(x + w, py - 4); c.lineTo(x + w, py + 4); c.closePath(); c.fill();
    c.fillStyle = '#f4f1e8';
    c.font = '700 12px Arial';
    c.textAlign = 'center';
    c.fillText(g.label, x + w / 2, y + h + 16);
    c.fillText(g.unit, x + w / 2, y + h + 32);
  }

  private lamp(c: CanvasRenderingContext2D, x: number, y: number, on: boolean, color: string, text: string) {
    c.beginPath();
    c.arc(x, y, 15, 0, Math.PI * 2);
    c.fillStyle = on ? color : '#4a4741';
    c.fill();
    if (on) { c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.arc(x - 4, y - 4, 5, 0, Math.PI * 2); c.fill(); }
    this.label(c, text, x, y + 32, 12);
  }

  private chart(c: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, h: number) {
    const g = this.rp.gauges.find((q) => q.id === id)!;
    c.fillStyle = '#f6f3e6';
    c.fillRect(x, y, w, h);
    c.strokeStyle = 'rgba(80,120,90,0.35)';
    for (let k = 1; k < 8; k++) { c.beginPath(); c.moveTo(x + (w * k) / 8, y); c.lineTo(x + (w * k) / 8, y + h); c.stroke(); }
    c.strokeStyle = '#7a1f8a';
    c.lineWidth = 2;
    c.beginPath();
    this.trace.forEach((tv, k) => {
      const yy = y + h - (h * (tv - g.min)) / (g.max - g.min);
      const xx = x + (w * k) / 199;
      if (k) c.lineTo(xx, yy); else c.moveTo(xx, yy);
    });
    c.stroke();
    c.lineWidth = 1;
    this.plate(c, `${g.label} RECORDER`, x + w / 2, y - 12, w * 0.8);
  }

  private drawTMI(c: CanvasRenderingContext2D, b: CanvasRenderingContext2D) {
    const X = (i: number) => i * SW;
    this.annunciators(c, X(0) + 30, 40, 6, 5, 452, 200, 0);
    this.chart(c, 'rcs', X(0) + 60, 300, 390, 140);
    // reactor coolant pumps and aux feed
    this.plate(c, 'REACTOR COOLANT PUMPS', X(1) + 256, 40, 300);
    const pa = at(this.rp.extra.pumpsA, this.t), pb = at(this.rp.extra.pumpsB, this.t);
    [['1A', pa], ['1B', pa], ['2A', pb], ['2B', pb]].forEach(([n, on], k) => {
      this.lamp(c, X(1) + 90 + k * 110, 100, on === 1, '#e0362c', `RCP ${n} ON`);
      this.lamp(c, X(1) + 90 + k * 110, 175, on !== 1, '#3fb35a', 'OFF');
    });
    this.plate(c, 'EMERGENCY FEEDWATER', X(1) + 256, 260, 300);
    const open = this.t > 521;
    this.lamp(c, X(1) + 180, 320, open, '#e0362c', 'EF-V12A OPEN');
    this.lamp(c, X(1) + 330, 320, open, '#e0362c', 'EF-V12B OPEN');
    if (!open) this.label(c, '(a maintenance tag hid these lights)', X(1) + 256, 400, 13);
    this.annunciators(c, X(2) + 30, 40, 6, 9, 452, 390, 30);
    this.plate(c, 'NUCLEAR INSTRUMENTATION', X(3) + 256, 34, 320);
    this.meter(c, 'pwr', X(3) + 60, 70, 110, 300);
    this.meter(c, 'hpi', X(3) + 320, 70, 110, 300);
    this.plate(c, 'PRESSURIZER', X(4) + 256, 34, 260);
    this.meter(c, 'rcs', X(4) + 40, 70, 110, 300);
    this.meter(c, 'pzr', X(4) + 200, 70, 110, 300);
    const light = at(this.rp.extra.porvLight, this.t) > 0.5;
    this.lamp(c, X(4) + 420, 120, light, '#e0362c', 'RC-RV2 OPEN');
    this.lamp(c, X(4) + 420, 210, !light, '#3fb35a', 'CLOSED');
    this.label(c, 'PORV', X(4) + 420, 70, 16);
    const block = this.t > 8520;
    this.lamp(c, X(4) + 420, 320, !block, '#e0362c', 'RC-V2 BLOCK OPEN');
    this.plate(c, 'DRAIN TANK · CORE TEMP', X(5) + 256, 34, 320);
    this.meter(c, 'rcdt', X(5) + 60, 70, 110, 300);
    this.meter(c, 'cet', X(5) + 320, 70, 110, 300);
    this.annunciators(c, X(6) + 30, 40, 6, 5, 452, 200, 84);
    // the alarm printer, falling behind
    c.fillStyle = '#f8f6ee';
    c.fillRect(X(6) + 50, 280, 410, 170);
    c.font = '12px "Courier New", monospace';
    c.textAlign = 'left';
    c.fillStyle = '#333';
    const lag = Math.max(0, this.t - 300) * 0.45;
    const shown = this.alarmLitAt.map((tl, n) => [tl, n]).filter(([tl]) => tl <= this.t - lag).slice(-10);
    shown.forEach(([tl, n], k) => {
      const clk = this.rp.start + tl;
      const hh = String(Math.floor(clk / 3600)).padStart(2, '0'), mm = String(Math.floor((clk % 3600) / 60)).padStart(2, '0'), ss = String(Math.floor(clk % 60)).padStart(2, '0');
      c.fillText(`${hh}:${mm}:${ss}  ${this.rp.alarms[n % this.rp.alarms.length]}`, X(6) + 62, 300 + k * 15);
    });
    this.plate(c, 'ALARM PRINTER', X(6) + 256, 270, 200);
    // benchboard: switches and pushbuttons
    for (let i = 0; i < SECTIONS; i++) {
      for (let k = 0; k < 9; k++) {
        const x = i * SW + 40 + k * 52;
        b.fillStyle = '#2b2a27';
        b.fillRect(x, 40, 30, 48);
        b.fillStyle = k % 3 === 0 ? '#c0261c' : '#d8d2c0';
        b.fillRect(x + 8, 52, 14, 24);
      }
    }
    b.fillStyle = '#1d1d1b';
    b.font = '700 18px Arial';
    b.textAlign = 'center';
    b.fillText('HPI THROTTLE', 3 * SW + 256, 125);
    b.fillText('PORV BLOCK VALVE', 4 * SW + 256, 125);
  }

  private drawRBMK(c: CanvasRenderingContext2D, b: CanvasRenderingContext2D) {
    const X = (i: number) => i * SW;
    const rods = at(this.rp.extra.rods, this.t);
    const az5 = at(this.rp.extra.az5, this.t) > 0.5;
    // rod position dials: 211 control rods on the wall, needles at depth
    const dials = (x0: number, n: number, seed: number) => {
      for (let k = 0; k < n; k++) {
        const col = k % 10, row = Math.floor(k / 10);
        const cx = x0 + 40 + col * 46, cy = 50 + row * 46;
        c.fillStyle = '#f2f0e6';
        c.beginPath(); c.arc(cx, cy, 19, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#2a2a28'; c.lineWidth = 1.5; c.stroke();
        const jitter = ((k * 7919 + seed) % 100) / 100;
        const depth = Math.min(1, rods + (jitter - 0.5) * 0.1 + (az5 ? 0 : 0));
        const a = -Math.PI * 0.75 + depth * Math.PI * 1.5;
        c.strokeStyle = '#111'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * 15, cy + Math.sin(a) * 15); c.stroke();
      }
    };
    dials(X(1), 90, 3);
    dials(X(2), 60, 11);
    this.plate(c, 'УКАЗАТЕЛИ ПОЛОЖЕНИЯ СТЕРЖНЕЙ · ROD POSITIONS', X(1) + 512, 470, 520);
    // SKALA printout on section 2
    c.fillStyle = '#f7f5ec';
    c.fillRect(X(2) + 40, 340, 430, 110);
    c.fillStyle = '#333';
    c.font = '13px "Courier New", monospace';
    c.textAlign = 'left';
    const orm = this.v('orm');
    c.fillText(`СКАЛА  ${this.clock2()}`, X(2) + 52, 360);
    c.fillText(`ОЗР = ${orm.toFixed(1)} СТЕРЖ.   (НОРМА ≥ 15)`, X(2) + 52, 382);
    c.fillText(`N = ${Math.min(9999, this.v('pwr')).toFixed(0)} МВт`, X(2) + 52, 404);
    if (orm < 15) { c.fillStyle = '#b3261e'; c.fillText('ОЗР НИЖЕ ДОПУСТИМОГО', X(2) + 52, 430); }
    // core mimic: 1,661 channels as a disc of lamps
    const cx = X(3) + 256, cy = 210, rr = 165;
    c.fillStyle = '#20302a';
    c.beginPath(); c.arc(cx, cy, rr + 12, 0, Math.PI * 2); c.fill();
    const pw = this.v('pwr');
    const hot = Math.min(1, pw / 3200);
    for (let i = -24; i <= 24; i++) for (let j = -24; j <= 24; j++) {
      const x = i * 6.8, y = j * 6.8;
      if (x * x + y * y > rr * rr) continue;
      const r = Math.hypot(x, y) / rr;
      // power peaks in the bottom of the core first: draw a radial + noise field
      const f = hot * (1 - r * 0.6) + (((i * 31 + j * 17) % 13) / 13) * 0.08;
      c.fillStyle = f > 0.6 ? '#ff5a3a' : f > 0.25 ? '#ffb04d' : f > 0.05 ? '#9fd38a' : '#3d5a4c';
      c.fillRect(cx + x - 2, cy + y - 2, 4, 4);
    }
    this.plate(c, 'КАРТОГРАММА АКТИВНОЙ ЗОНЫ · CORE MAP', cx, 420, 380);
    // nixie readout of thermal power
    const txt = pw > 9999 ? '----' : String(Math.round(pw)).padStart(4, '0');
    c.fillStyle = '#120a06';
    c.fillRect(X(3) + 150, 438, 212, 38);
    c.font = '700 34px "Courier New", monospace';
    c.textAlign = 'center';
    c.fillStyle = pw > 1600 ? '#ff4a2a' : '#ff9a3c';
    c.fillText(txt + ' MW', X(3) + 256, 470);
    // annunciators + ORM
    this.annunciators(c, X(4) + 30, 40, 5, 6, 452, 230, 0);
    this.dialGauge(c, 'orm', X(4) + 140, 380);
    this.dialGauge(c, 'drum', X(4) + 370, 380);
    // eight main circulation pumps
    this.plate(c, 'ГЦН · MAIN CIRCULATION PUMPS', X(5) + 256, 34, 360);
    for (let k = 0; k < 8; k++) {
      const extra = k >= 6 ? this.t > 3780 + (k - 6) * 240 : true;
      const coast = k < 4 && this.t > 4984;
      this.lamp(c, X(5) + 60 + (k % 4) * 128, 90 + Math.floor(k / 4) * 90, extra && !coast, '#e0362c', `ГЦН-${k + 1}`);
    }
    this.dialGauge(c, 'flow', X(5) + 256, 360);
    this.plate(c, 'ТГ-8 · TURBINE 8', X(6) + 256, 34, 260);
    this.lamp(c, X(6) + 160, 100, this.t < 4984, '#e0362c', 'СТОП-КЛАПАНЫ ОТКР.');
    this.lamp(c, X(6) + 350, 100, this.t >= 4984, '#3fb35a', 'ЗАКРЫТЫ');
    this.annunciators(c, X(6) + 30, 200, 5, 4, 452, 240, 30);
    // section 0: the SIUR's console; AZ-5 on the bench
    this.plate(c, 'СИУР · SENIOR REACTOR CONTROL ENGINEER', X(0) + 256, 34, 440);
    dials(X(0), 40, 23);
    for (let i = 0; i < SECTIONS; i++) for (let k = 0; k < 10; k++) {
      const x = i * SW + 30 + k * 46;
      b.fillStyle = '#2a302c';
      b.fillRect(x, 36, 30, 30);
      b.fillStyle = '#c9cfc6';
      b.beginPath(); b.arc(x + 15, 51, 9, 0, Math.PI * 2); b.fill();
    }
    b.fillStyle = '#2a302c';
    b.fillRect(X(0) + 150, 74, 210, 70);
    b.fillStyle = az5 ? '#ff3b26' : '#8a1c14';
    b.beginPath(); b.arc(X(0) + 255, 109, 28, 0, Math.PI * 2); b.fill();
    b.fillStyle = '#fff';
    b.font = '800 16px Arial';
    b.textAlign = 'center';
    b.fillText('АЗ-5', X(0) + 255, 115);
  }

  private dialGauge(c: CanvasRenderingContext2D, id: string, cx: number, cy: number) {
    const g = this.rp.gauges.find((q) => q.id === id)!;
    const v = this.v(id);
    c.fillStyle = '#f1efe6';
    c.beginPath(); c.arc(cx, cy, 62, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#222'; c.lineWidth = 3; c.stroke();
    c.lineWidth = 1;
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI * 0.75 + (k / 10) * Math.PI * 1.5;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * 50, cy + Math.sin(a) * 50); c.lineTo(cx + Math.cos(a) * 58, cy + Math.sin(a) * 58); c.stroke();
    }
    if (g.warn !== undefined) {
      const a = Math.PI * 0.75 + ((g.warn - g.min) / (g.max - g.min)) * Math.PI * 1.5;
      c.strokeStyle = '#c0261c'; c.lineWidth = 4;
      c.beginPath(); c.arc(cx, cy, 54, id === 'orm' ? Math.PI * 0.75 : a, id === 'orm' ? a : Math.PI * 2.25); c.stroke();
      c.lineWidth = 1;
    }
    const f = Math.max(0, Math.min(1.03, (v - g.min) / (g.max - g.min)));
    const a = Math.PI * 0.75 + f * Math.PI * 1.5;
    c.strokeStyle = '#111'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * 48, cy + Math.sin(a) * 48); c.stroke();
    c.lineWidth = 1;
    c.fillStyle = '#111';
    c.font = '700 11px Arial';
    c.textAlign = 'center';
    c.fillText(g.unit, cx, cy + 30);
    this.plate(c, g.label.split(' · ')[1] ?? g.label, cx, cy + 86, 200);
  }

  clock2() {
    const s = this.rp.start + this.t;
    return `${String(Math.floor(s / 3600) % 24).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  }

  // ---------------------------------------------------------------- control

  seek(t: number) {
    this.t = Math.max(0, Math.min(this.rp.end, t));
    this.trace = [];
    this.evIdx = -1;
    this.checkEvent(true);
  }

  private checkEvent(force = false) {
    let k = -1;
    this.rp.events.forEach((e, i) => { if (this.t >= e.t) k = i; });
    if (k !== this.evIdx || force) {
      this.evIdx = k;
      const e = this.rp.events[k];
      if (e?.look !== undefined && performance.now() > this.userUntil) this.wantYaw = -ang(e.look);
      this.onEvent?.(k);
    }
  }

  private pd = (e: PointerEvent) => { this.drag = { x: e.clientX, y: e.clientY }; };
  private pm = (e: PointerEvent) => {
    if (!this.drag) return;
    this.yaw += (e.clientX - this.drag.x) * 0.004;
    this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - this.drag.y) * 0.003, -0.6, 0.5);
    this.wantYaw = this.yaw;
    this.userUntil = performance.now() + 8000;
    this.drag = { x: e.clientX, y: e.clientY };
  };
  private pu = () => { this.drag = null; };

  private resize = () => {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 80 : 62;
    this.camera.updateProjectionMatrix();
  };

  private loop = () => {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, this.clock.getDelta());
    if (this.playing && this.t < this.rp.end) {
      this.t = Math.min(this.rp.end, this.t + dt * this.rp.speed(this.t) * this.speedMul);
      this.checkEvent();
    }
    this.yaw += (this.wantYaw - this.yaw) * Math.min(1, dt * 2.2);
    const blast = at(this.rp.extra.blast ?? [[0, 0]], this.t);
    const shake = blast > 0 ? Math.max(0, 1 - (this.t - 5028) / 5) * 0.03 : 0;
    this.camera.rotation.set(this.pitch + (Math.random() - 0.5) * shake, this.yaw + (Math.random() - 0.5) * shake, 0, 'YXZ');
    // lights: steady, or failing after the explosion
    const flick = blast > 0 ? (Math.random() < 0.3 ? 0 : 0.15) : 1;
    this.ceiling.emissiveIntensity = 0.9 * flick;
    for (const l of this.lamps) l.intensity = 3.2 * flick;
    this.acc += dt;
    if (this.acc > 1 / 15) {
      this.acc = 0;
      const g = this.rp.gauges[0];
      if (this.playing) { this.trace.push(at(this.rp.gauges.find((q) => q.id === 'rcs')?.curve ?? g.curve, this.t)); if (this.trace.length > 200) this.trace.shift(); }
      this.draw();
      this.onTick?.(this.t);
    }
    this.composer.render();
  };

  dispose() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    removeEventListener('pointermove', this.pm);
    removeEventListener('pointerup', this.pu);
    removeEventListener('resize', this.resize);
    this.renderer.domElement.removeEventListener('pointerdown', this.pd);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mm = m.material as THREE.Material | undefined;
      mm?.dispose?.();
    });
    this.boardTex.dispose();
    this.benchTex.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
