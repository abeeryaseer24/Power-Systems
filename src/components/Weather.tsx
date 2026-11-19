import { useEffect, useRef } from 'react';
import '../weather.css';

export type WeatherKind = 'storm' | 'rain' | 'snow' | 'heat';

/**
 * A light 2D weather layer drawn over a map: rain streaks with lightning for storms, drifting snow for
 * cold snaps, rising shimmer for heatwaves. Purely visual; respects reduced-motion by drawing one frame.
 */
export default function Weather({ kind, intensity = 1 }: { kind: WeatherKind; intensity?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    const N = Math.round((kind === 'snow' ? 260 : kind === 'heat' ? 70 : 420) * intensity);
    const P = Array.from({ length: N }, () => ({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.7, p: Math.random() * Math.PI * 2 }));
    let raf = 0;
    let last = performance.now();
    let nextBolt = performance.now() + 2500 + Math.random() * 4000;
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, h);
      if (kind === 'storm' || kind === 'rain') {
        const wind = kind === 'storm' ? 0.35 : 0.12;
        ctx.strokeStyle = 'rgba(190, 215, 235, 0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const d of P) {
          d.y += dt * (1.6 + d.z * 1.6);
          d.x += dt * wind * d.z;
          if (d.y > 1.05) { d.y = -0.05; d.x = Math.random() * 1.2 - 0.1; }
          if (d.x > 1.05) d.x -= 1.1;
          const x = d.x * w;
          const y = d.y * h;
          const len = 10 + 16 * d.z;
          ctx.moveTo(x, y);
          ctx.lineTo(x - wind * len * 0.6, y - len);
        }
        ctx.stroke();
        if (kind === 'storm' && now > nextBolt && !still) {
          nextBolt = now + 3000 + Math.random() * 7000;
          const el = flash.current;
          if (el) {
            el.classList.remove('on');
            void el.offsetWidth;
            el.classList.add('on');
          }
          // a forked bolt from the top edge
          let x = w * (0.15 + Math.random() * 0.7);
          let y = 0;
          ctx.strokeStyle = 'rgba(235, 240, 255, 0.9)';
          ctx.lineWidth = 2;
          ctx.shadowColor = '#c9b8ff';
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.moveTo(x, y);
          while (y < h * (0.35 + Math.random() * 0.3)) {
            x += (Math.random() - 0.5) * 40;
            y += 12 + Math.random() * 24;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      } else if (kind === 'snow') {
        ctx.fillStyle = 'rgba(205, 228, 255, 0.85)';
        ctx.shadowColor = 'rgba(150, 200, 255, 0.9)';
        ctx.shadowBlur = 6;
        for (const d of P) {
          d.y += dt * (0.05 + d.z * 0.08);
          d.p += dt * (0.6 + d.z);
          d.x += dt * 0.02 * Math.sin(d.p);
          if (d.y > 1.02) { d.y = -0.02; d.x = Math.random(); }
          ctx.globalAlpha = 0.35 + 0.6 * d.z;
          ctx.beginPath();
          ctx.arc(d.x * w, d.y * h, 0.8 + 2 * d.z, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      } else {
        // heat: faint rising wisps
        for (const d of P) {
          d.y -= dt * (0.02 + d.z * 0.03);
          d.p += dt * 2;
          if (d.y < -0.05) { d.y = 1.05; d.x = Math.random(); }
          const x = (d.x + 0.01 * Math.sin(d.p)) * w;
          const y = d.y * h;
          const g = ctx.createRadialGradient(x, y, 0, x, y, 30 + 50 * d.z);
          g.addColorStop(0, 'rgba(255, 150, 70, 0.06)');
          g.addColorStop(1, 'rgba(255, 150, 70, 0)');
          ctx.fillStyle = g;
          ctx.fillRect(x - 80, y - 80, 160, 160);
        }
      }
      if (!still) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [kind, intensity]);
  return (
    <div className={`wx wx-${kind}`} aria-hidden="true">
      <canvas ref={canvas} className="wx-canvas" />
      <div ref={flash} className="wx-flash" />
    </div>
  );
}

/** Replays where the weather was part of the story. */
export const EVENT_WEATHER: Record<string, WeatherKind> = {
  'texas-2021': 'snow', 'texas-2011': 'snow', 'sa-2016': 'storm', 'brazil-2009': 'storm',
  'gb-2019': 'storm', 'newyork-1977': 'storm', 'northeast-2003': 'heat', 'moscow-2005': 'heat', 'india-2012': 'heat',
};
/** What-if modifiers that change the sky. */
export const WHATIF_WEATHER: Record<string, WeatherKind> = { heatwave: 'heat', storm: 'storm', flood: 'rain' };
