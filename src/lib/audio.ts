// Transformer hum at twice the grid frequency (magnetostriction), so you can
// hear the frequency sag. Plus alarm tones for protection operations.

export class GridAudio {
  private ctx?: AudioContext;
  private master?: GainNode;
  private hum: OscillatorNode[] = [];
  private humGain?: GainNode;
  muted = false;

  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    this.humGain.connect(lp).connect(this.master);
    [1, 2, 3, 5].forEach((h, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = 100 * h;
      const g = ctx.createGain();
      g.gain.value = [0.5, 0.22, 0.1, 0.04][i];
      o.connect(g).connect(this.humGain!);
      o.start();
      this.hum.push(o);
    });
  }

  /** f = grid frequency (0 when dead), load = 0..1 */
  update(f: number, load: number) {
    if (!this.ctx || !this.humGain) return;
    const t = this.ctx.currentTime;
    const alive = f > 1;
    this.hum.forEach((o, i) => o.frequency.setTargetAtTime(2 * (alive ? f : 50) * [1, 2, 3, 5][i], t, 0.05));
    this.humGain.gain.setTargetAtTime(alive ? 0.05 + 0.07 * load : 0, t, alive ? 0.3 : 0.08);
  }

  alarm(kind: 'major' | 'minor' | 'blackout') {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const tones = kind === 'blackout' ? [440, 330, 220] : kind === 'major' ? [880, 660, 880, 660] : [740];
    tones.forEach((fr, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = fr;
      const s = t0 + i * (kind === 'blackout' ? 0.45 : 0.22);
      const d = kind === 'blackout' ? 0.42 : 0.18;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.07, s + 0.01);
      g.gain.setValueAtTime(0.07, s + d - 0.03);
      g.gain.linearRampToValueAtTime(0, s + d);
      o.connect(g).connect(this.master!);
      o.start(s);
      o.stop(s + d + 0.02);
    });
  }

  click() {
    if (!this.ctx || !this.master) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    o.frequency.value = 1800;
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.06);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  dispose() {
    this.hum.forEach((o) => o.stop());
    this.ctx?.close();
    this.ctx = undefined;
  }
}
