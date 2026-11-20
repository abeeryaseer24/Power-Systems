import * as THREE from 'three';
import { sfx } from '../lib/sfx';

// A positional soundscape for the plants, synthesised on the shared sfx
// context: no audio files. Each layer's loudness follows the distance from
// the listener to its nearest sources and what the plant is doing.

type Layer = { gain: GainNode; src: AudioScheduledSourceNode[] };

export type SoundState = { steam: number; output: number; dump: number; spill: number; night: number; height: number };

export class Soundscape {
  private layers: Record<string, Layer> = {};
  private ok = false;
  private nextChirp = 0;
  private raining = false;
  private ctx?: AudioContext;
  private out?: AudioNode;

  constructor(private sources: { hum: THREE.Vector3[]; towers: THREE.Vector3[]; halls: THREE.Vector3[]; spill: THREE.Vector3[] }) {}

  /** Build the graph on the first user gesture. */
  start() {
    if (this.ok) return;
    sfx.unlock();
    const a = sfx.audio();
    if (!a) return;
    this.ok = true;
    this.ctx = a.ctx;
    this.out = a.out;
    const { ctx, out, noise } = a;
    const noiseSrc = (type: BiquadFilterType, f: number, q = 0.7) => {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      s.playbackRate.value = 0.8 + Math.random() * 0.4;
      const fl = ctx.createBiquadFilter();
      fl.type = type;
      fl.frequency.value = f;
      fl.Q.value = q;
      s.connect(fl);
      s.start();
      return { s, fl };
    };
    const layer = (name: string, nodes: { node: AudioNode; src: AudioScheduledSourceNode }[]) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(out);
      nodes.forEach((n) => n.node.connect(g));
      this.layers[name] = { gain: g, src: nodes.map((n) => n.src) };
    };
    // transformer hum: magnetostriction at twice mains frequency and its harmonics
    const hum = [100, 200, 300, 400].map((f, k) => {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = [0.5, 0.3, 0.14, 0.06][k];
      o.connect(g);
      o.start();
      return { node: g, src: o };
    });
    layer('hum', hum);
    const rain = noiseSrc('bandpass', 2200, 0.5);
    const rain2 = noiseSrc('highpass', 5000, 0.5);
    layer('rain', [{ node: rain.fl, src: rain.s }, { node: rain2.fl, src: rain2.s }]);
    const rumble = noiseSrc('lowpass', 140, 1);
    const rot = ctx.createOscillator();
    rot.frequency.value = 50; // 3000 rpm turbine-generator
    const rg = ctx.createGain();
    rg.gain.value = 0.25;
    rot.connect(rg);
    rot.start();
    layer('rumble', [{ node: rumble.fl, src: rumble.s }, { node: rg, src: rot }]);
    const wind = noiseSrc('lowpass', 380, 0.8);
    layer('wind', [{ node: wind.fl, src: wind.s }]);
    const roar = noiseSrc('bandpass', 900, 0.4);
    layer('dump', [{ node: roar.fl, src: roar.s }]);
    const water = noiseSrc('lowpass', 700, 0.5);
    layer('spill', [{ node: water.fl, src: water.s }]);
    const shower = noiseSrc('highpass', 1800, 0.4);
    const patter = noiseSrc('bandpass', 4200, 0.8);
    layer('weather', [{ node: shower.fl, src: shower.s }, { node: patter.fl, src: patter.s }]);
    if (this.raining) this.set('weather', 0.28);
  }

  private near(list: THREE.Vector3[], p: THREE.Vector3, ref: number) {
    let g = 0;
    for (const s of list) {
      const d2 = s.distanceToSquared(p);
      g += 1 / (1 + d2 / (ref * ref));
    }
    return Math.min(1, g);
  }

  private set(name: string, v: number) {
    const l = this.layers[name];
    if (l && this.ctx) l.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.25);
  }

  update(p: THREE.Vector3, s: SoundState) {
    if (!this.ok || !this.ctx) return;
    this.set('hum', 0.22 * this.near(this.sources.hum, p, 22));
    this.set('rain', 0.5 * s.steam * this.near(this.sources.towers, p, 90));
    this.set('rumble', 0.45 * (0.2 + 0.8 * s.output) * this.near(this.sources.halls, p, 60));
    this.set('wind', 0.05 + Math.min(0.2, s.height / 1500));
    this.set('dump', 0.7 * s.dump * this.near(this.sources.halls, p, 260));
    this.set('spill', 0.8 * s.spill * this.near(this.sources.spill, p, 600));
    // crickets on a warm night
    const now = this.ctx.currentTime;
    if (!this.raining && s.night > 0.6 && s.height < 120 && now > this.nextChirp) {
      this.nextChirp = now + 0.6 + Math.random() * 1.8;
      this.chirp();
    }
  }

  private chirp() {
    const ctx = this.ctx!, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.value = 4300 + Math.random() * 400;
    const g = ctx.createGain();
    g.gain.value = 0;
    for (let k = 0; k < 3; k++) {
      g.gain.setValueAtTime(0.012, t + k * 0.06);
      g.gain.setValueAtTime(0, t + k * 0.06 + 0.03);
    }
    o.connect(g).connect(this.out!);
    o.start(t);
    o.stop(t + 0.25);
  }

  setRain(on: boolean) {
    this.raining = on;
    this.set('weather', on ? 0.28 : 0);
  }

  step() {
    if (!this.ok || !this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const a = sfx.audio();
    if (!a) return;
    const s = ctx.createBufferSource();
    s.buffer = a.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 600 + Math.random() * 300;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    s.connect(f).connect(g).connect(this.out!);
    s.start(t, Math.random());
    s.stop(t + 0.1);
  }

  stop() {
    for (const l of Object.values(this.layers)) {
      l.src.forEach((s) => { try { s.stop(); } catch { /* already stopped */ } });
      l.gain.disconnect();
    }
    this.layers = {};
    this.ok = false;
  }
}
