import { useEffect, useRef } from 'react';
import type { RegionTrace } from '../grid/region';

/** Frequency, lowest voltage and demand served over the replay, stacked as three strips. */
export default function Traces({ trace, f0, tick, marks = [] }: { trace: RegionTrace[]; f0: number; tick: number; marks?: { t: number; label: string }[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (c.width !== W * dpr || c.height !== H * dpr) {
      c.width = W * dpr;
      c.height = H * dpr;
    }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (trace.length < 2) return;
    const t0 = trace[0].t;
    const t1 = Math.max(t0 + 30, trace[trace.length - 1].t);
    const pl = 64;
    const X = (t: number) => pl + ((t - t0) / (t1 - t0)) * (W - pl - 8);
    const rows = [
      { label: 'Frequency', unit: 'Hz', lo: f0 - 2.5, hi: f0 + 1, ref: f0, get: (p: RegionTrace) => p.f, color: '#ece6d8', fmt: (v: number) => v.toFixed(2) },
      { label: 'Lowest voltage', unit: 'pu', lo: 0.6, hi: 1.25, ref: 1, get: (p: RegionTrace) => p.vMin, color: '#c9b8ff', fmt: (v: number) => v.toFixed(2) },
      { label: 'Demand served', unit: '%', lo: 0, hi: 105, ref: 100, get: (p: RegionTrace) => (p.demand ? (100 * p.served) / p.demand : 0), color: '#ffb04d', fmt: (v: number) => v.toFixed(0) },
    ];
    const rh = (H - 6) / rows.length;
    g.font = '12px "Atkinson Hyperlegible Next", sans-serif';
    rows.forEach((r, k) => {
      const y0 = k * rh + 4;
      const Y = (v: number) => y0 + (1 - (Math.max(r.lo, Math.min(r.hi, v)) - r.lo) / (r.hi - r.lo)) * (rh - 8);
      g.strokeStyle = 'rgba(134,197,218,0.12)';
      g.setLineDash([3, 4]);
      g.beginPath();
      g.moveTo(pl, Y(r.ref));
      g.lineTo(W - 8, Y(r.ref));
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#8b9ab0';
      g.fillText(r.label, 4, y0 + 12);
      const last = r.get(trace[trace.length - 1]);
      g.fillStyle = r.color;
      g.font = '600 15px "Big Shoulders Display", sans-serif';
      g.fillText(`${r.fmt(last)} ${r.unit}`, 4, y0 + 30);
      g.font = '12px "Atkinson Hyperlegible Next", sans-serif';
      g.strokeStyle = r.color;
      g.lineWidth = 1.5;
      g.beginPath();
      let pen = false;
      for (const p of trace) {
        const v = r.get(p);
        if (k === 0 && v <= 0) {
          pen = false;
          continue;
        }
        if (!pen) g.moveTo(X(p.t), Y(v));
        else g.lineTo(X(p.t), Y(v));
        pen = true;
      }
      g.stroke();
    });
    g.strokeStyle = 'rgba(255,91,79,0.5)';
    for (const m of marks) {
      if (m.t < t0 || m.t > t1) continue;
      g.beginPath();
      g.moveTo(X(m.t), 2);
      g.lineTo(X(m.t), H - 2);
      g.stroke();
    }
  }, [trace, f0, tick, marks]);
  return <canvas ref={ref} className="traces" aria-label="Frequency, lowest voltage and demand served over time" />;
}
