import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CityScene } from '../scene/CityScene';

gsap.registerPlugin(ScrollTrigger);

// Scroll beats: [start, end] of progress where each caption is visible.
const BEATS: { at: [number, number]; time?: string; text: string }[] = [
  { at: [0, 0.11], time: '02:13', text: 'Twenty-two minutes ago a fault on the Eastgate line cascaded across the grid. Halvern, 1.4 million people, is dark.' },
  { at: [0.12, 0.27], time: '02:21', text: 'Glen Dam keeps its own power. One hydro unit spins up with no grid to lean on and becomes the heartbeat of a new one.' },
  { at: [0.28, 0.45], time: '02:48', text: 'Operators close breakers one at a time, building a live path from the dam toward the city.' },
  { at: [0.46, 0.78], time: '04:05', text: 'Every district they reconnect drags the frequency down. Every plant they synchronise pulls it back toward 50 hertz.' },
];

const PICKUPS = [0.44, 0.52, 0.58, 0.62, 0.66, 0.71, 0.76];
const SYNCS = [0.56, 0.6, 0.64, 0.7, 0.84];
const LOAD = [420, 560, 380, 330, 400, 520, 160];

function narrative(p: number) {
  if (p < 0.12) return { f: 0, load: 0 };
  let f = 50;
  for (const k of PICKUPS) {
    const x = (p - k) / 0.018;
    if (x > 0) f -= 0.42 * x * Math.exp(1 - x);
  }
  for (const k of SYNCS) {
    const x = (p - k) / 0.02;
    if (x > 0) f += 0.12 * x * Math.exp(1 - x);
  }
  const load = PICKUPS.reduce((a, k, i) => a + LOAD[i] * Math.max(0, Math.min(1, (p - k) / 0.05)), 0);
  return { f, load };
}

export default function Landing() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const beats = useRef<(HTMLDivElement | null)[]>([]);
  const freq = useRef<HTMLSpanElement>(null);
  const load = useRef<HTMLSpanElement>(null);
  const cue = useRef<HTMLDivElement>(null);
  const [finale, setFinale] = useState(false);

  useEffect(() => {
    const scene = new CityScene(canvas.current!, 'hero');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const apply = (p: number) => {
      scene.setHeroProgress(p);
      BEATS.forEach((b, i) => {
        const el = beats.current[i];
        if (!el) return;
        const [a, z] = b.at;
        const fade = 0.025;
        const o = Math.max(0, Math.min(1, Math.min((p - a) / fade, (z - p) / fade)));
        el.style.opacity = String(o);
        el.style.transform = `translateY(${(1 - o) * 14}px)`;
        el.style.visibility = o > 0 ? 'visible' : 'hidden';
      });
      const n = narrative(p);
      if (freq.current) freq.current.textContent = n.f ? n.f.toFixed(2) : '0.00';
      if (freq.current) freq.current.dataset.dead = n.f ? 'false' : 'true';
      if (load.current) load.current.textContent = Math.round(n.load).toLocaleString('en-GB');
      if (cue.current) cue.current.style.opacity = String(Math.max(0, 1 - p * 25));
      setFinale(p > 0.8);
    };
    if (reduce) {
      apply(1);
      return () => scene.dispose();
    }
    const st = ScrollTrigger.create({
      trigger: track.current!,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.6,
      onUpdate: (self) => apply(self.progress),
    });
    apply(0);
    return () => {
      st.kill();
      scene.dispose();
    };
  }, []);

  return (
    <main id="main" className="landing">
      <canvas ref={canvas} className="hero-canvas" aria-label="Aerial view of Halvern at night as its power grid is restored" />
      <div className="hero-vignette" aria-hidden="true" />
      <div className="hero-readout" aria-hidden="true">
        <div>
          <span className="ro-label">System frequency</span>
          <span className="ro-value"><span ref={freq} data-dead="true">0.00</span> Hz</span>
        </div>
        <div>
          <span className="ro-label">Demand restored</span>
          <span className="ro-value"><span ref={load}>0</span> MW</span>
        </div>
      </div>
      <div ref={track} className="hero-track">
        <div className="hero-sticky">
          {BEATS.map((b, i) => (
            <div key={i} ref={(el) => { beats.current[i] = el; }} className="beat">
              {b.time && <span className="beat-time">{b.time}</span>}
              <p>{b.text}</p>
            </div>
          ))}
          <div ref={cue} className="scroll-cue" aria-hidden="true">
            <span>Scroll to restore power</span>
            <i />
          </div>
          <div className={`finale ${finale ? 'on' : ''}`}>
            <h1 className="title" aria-label="Blackstart">
              {'Blackstart'.split('').map((ch, i) => (
                <span key={i} style={{ ['--i' as string]: i }}>{ch}</span>
              ))}
            </h1>
            <p className="finale-sub">
              Run the power grid of a city through a heatwave, a storm and a total blackout. Keep it at 50 hertz.
            </p>
            <div className="finale-cta">
              <Link to="/shifts" className="btn primary">Take the control room</Link>
              <Link to="/learn" className="btn ghost">How grids stay up</Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
