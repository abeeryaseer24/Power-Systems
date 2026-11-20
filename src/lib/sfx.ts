// Synthesised sound effects: no audio files, everything is built from
// oscillators and filtered noise. One shared context and one mute switch.

type Listener = (muted: boolean) => void;

class Sfx {
  private ctx?: AudioContext;
  private master?: GainNode;
  private noiseBuf?: AudioBuffer;
  private drone?: { oscs: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode };
  private hum?: { oscs: OscillatorNode[]; gain: GainNode };
  muted = false;
  private listeners = new Set<Listener>();

  constructor() {
    try {
      this.muted = localStorage.getItem('blackstart.muted') === '1';
    } catch {
      /* storage unavailable */
    }
  }

  /** Call from a user gesture (a click) so the browser allows audio. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem('blackstart.muted', m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
    this.listeners.forEach((l) => l(m));
  }
  onMute(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** The shared context, master bus and noise buffer, once unlocked. */
  audio() {
    return this.ready();
  }

  private ready() {
    return this.ctx && this.master && this.noiseBuf ? { ctx: this.ctx, out: this.master, noise: this.noiseBuf } : null;
  }

  private noise(start: number, dur: number, f: number, q: number, gain: number, type: BiquadFilterType = 'bandpass') {
    const r = this.ready();
    if (!r) return;
    const src = r.ctx.createBufferSource();
    src.buffer = r.noise;
    const flt = r.ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    flt.Q.value = q;
    const g = r.ctx.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(flt).connect(g).connect(r.out);
    src.start(start);
    src.stop(start + dur + 0.05);
  }

  private tone(start: number, dur: number, f0: number, f1: number, type: OscillatorType, gain: number) {
    const r = this.ready();
    if (!r) return;
    const o = r.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, start);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), start + dur);
    const g = r.ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(r.out);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  /** Circuit breaker opening: a hard mechanical clack with an arc hiss. */
  clunk(strength = 1) {
    const r = this.ready();
    if (!r) return;
    const t = r.ctx.currentTime;
    this.noise(t, 0.08, 900, 1.2, 0.5 * strength);
    this.tone(t, 0.18, 140, 55, 'sine', 0.5 * strength);
    this.noise(t + 0.02, 0.35, 4200, 0.8, 0.12 * strength, 'highpass');
  }

  /** Two-tone control-room alarm. */
  klaxon(times = 2) {
    const r = this.ready();
    if (!r) return;
    const t = r.ctx.currentTime;
    for (let i = 0; i < times * 2; i++) this.tone(t + i * 0.28, 0.26, i % 2 ? 660 : 880, i % 2 ? 660 : 880, 'square', 0.06);
  }

  /** The sound of a region going dark: everything spins down. */
  powerDown() {
    const r = this.ready();
    if (!r) return;
    const t = r.ctx.currentTime;
    this.tone(t, 3.2, 220, 18, 'sawtooth', 0.12);
    this.tone(t, 3.6, 110, 12, 'sine', 0.3);
    this.noise(t, 1.2, 300, 0.7, 0.25, 'lowpass');
  }

  /** Low cinematic impact. */
  boom() {
    const r = this.ready();
    if (!r) return;
    const t = r.ctx.currentTime;
    this.tone(t, 2.4, 70, 28, 'sine', 0.7);
    this.noise(t, 1.4, 180, 0.6, 0.45, 'lowpass');
    this.noise(t, 0.12, 2500, 0.8, 0.12);
  }

  /** One typewriter key. */
  tick() {
    const r = this.ready();
    if (!r) return;
    const t = r.ctx.currentTime;
    this.noise(t, 0.03, 3000 + Math.random() * 1500, 2, 0.12);
  }

  /** Documentary drone: intensity 0 (off) .. 1 (full tension). */
  setDrone(intensity: number) {
    const r = this.ready();
    if (!r) return;
    const t = r.ctx.currentTime;
    if (!this.drone) {
      const gain = r.ctx.createGain();
      gain.gain.value = 0;
      const filter = r.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 300;
      gain.connect(filter).connect(r.out);
      const oscs = [55, 55.4, 82.5, 110.6].map((f, i) => {
        const o = r.ctx.createOscillator();
        o.type = i < 2 ? 'sawtooth' : 'triangle';
        o.frequency.value = f;
        const g = r.ctx.createGain();
        g.gain.value = [0.18, 0.18, 0.1, 0.05][i];
        o.connect(g).connect(gain);
        o.start();
        return o;
      });
      this.drone = { oscs, gain, filter };
    }
    this.drone.gain.gain.setTargetAtTime(intensity * 0.35, t, 1.2);
    this.drone.filter.frequency.setTargetAtTime(220 + intensity * 900, t, 1.5);
    this.drone.oscs[1].frequency.setTargetAtTime(55.4 + intensity * 1.6, t, 1);
  }

  /** Transformer hum at twice grid frequency; f = 0 silences it. */
  setHum(f: number, load = 0.5) {
    const r = this.ready();
    if (!r) return;
    const t = r.ctx.currentTime;
    if (!this.hum) {
      const gain = r.ctx.createGain();
      gain.gain.value = 0;
      const lp = r.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      gain.connect(lp).connect(r.out);
      const oscs = [1, 2, 3].map((h, i) => {
        const o = r.ctx.createOscillator();
        o.type = i ? 'triangle' : 'sine';
        o.frequency.value = 100 * h;
        const g = r.ctx.createGain();
        g.gain.value = [0.5, 0.18, 0.07][i];
        o.connect(g).connect(gain);
        o.start();
        return o;
      });
      this.hum = { oscs, gain };
    }
    const alive = f > 1;
    this.hum.oscs.forEach((o, i) => o.frequency.setTargetAtTime(2 * (alive ? f : 50) * (i + 1), t, 0.05));
    this.hum.gain.gain.setTargetAtTime(alive ? 0.03 + 0.05 * load : 0, t, alive ? 0.4 : 0.1);
  }

  /** Stop continuous sounds (drone, hum) when leaving a page. */
  quiet() {
    const r = this.ready();
    if (!r) return;
    const t = r.ctx.currentTime;
    this.drone?.gain.gain.setTargetAtTime(0, t, 0.3);
    this.hum?.gain.gain.setTargetAtTime(0, t, 0.2);
  }
}

export const sfx = new Sfx();
