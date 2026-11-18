import { useEffect, useRef } from 'react';
import type { GridSim } from '../grid/engine';
import { clock } from '../lib/format';

/** Whole-shift view: forecast demand, what was served, and the frequency record. */
export default function Timeline({ sim, tick, forecast }: { sim: GridSim; tick: number; forecast: { t: number; d: number }[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (c.width !== W * dpr) {
      c.width = W * dpr;
      c.height = H * dpr;
    }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const t0 = sim.startT / 3600;
    const t1 = sim.endT / 3600;
    const padL = 44;
    const padR = 10;
    const chartH = H - 34;
    const fBand = 12;
    const X = (t: number) => padL + ((t - t0) / (t1 - t0)) * (W - padL - padR);
    const maxD = Math.max(1000, ...forecast.map((p) => p.d), ...sim.history.map((h) => h.demand)) * 1.08;
    const Y = (v: number) => 8 + (1 - v / maxD) * (chartH - 8);

    g.font = '12px "Atkinson Hyperlegible Next", sans-serif';
    g.fillStyle = '#8b9ab0';
    g.strokeStyle = 'rgba(134,197,218,0.1)';
    g.lineWidth = 1;
    const stepMW = maxD > 3000 ? 1000 : 500;
    for (let v = 0; v <= maxD; v += stepMW) {
      g.beginPath();
      g.moveTo(padL, Y(v));
      g.lineTo(W - padR, Y(v));
      g.stroke();
      g.fillText(`${v / 1000} GW`, 4, Y(v) + 4);
    }
    const span = t1 - t0;
    const hs = span > 12 ? 3 : span > 6 ? 2 : 1;
    for (let h = Math.ceil(t0); h <= t1; h += hs) {
      g.fillText(clock(h), X(h) - 14, H - 4);
    }

    // forecast
    g.setLineDash([4, 5]);
    g.strokeStyle = 'rgba(236,230,216,0.45)';
    g.beginPath();
    forecast.forEach((p, i) => (i ? g.lineTo(X(p.t), Y(p.d)) : g.moveTo(X(p.t), Y(p.d))));
    g.stroke();
    g.setLineDash([]);

    const hist = sim.history;
    if (hist.length > 1) {
      // served, filled
      const grd = g.createLinearGradient(0, 0, 0, chartH);
      grd.addColorStop(0, 'rgba(255,176,77,0.45)');
      grd.addColorStop(1, 'rgba(255,176,77,0.04)');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(X(hist[0].t), Y(0));
      hist.forEach((h) => g.lineTo(X(h.t), Y(h.served)));
      g.lineTo(X(hist[hist.length - 1].t), Y(0));
      g.fill();
      g.strokeStyle = '#ffb04d';
      g.lineWidth = 1.6;
      g.beginPath();
      hist.forEach((h, i) => (i ? g.lineTo(X(h.t), Y(h.served)) : g.moveTo(X(h.t), Y(h.served))));
      g.stroke();
      // unserved gap
      g.strokeStyle = '#ff5b4f';
      g.lineWidth = 1.2;
      g.beginPath();
      hist.forEach((h, i) => (i ? g.lineTo(X(h.t), Y(h.demand)) : g.moveTo(X(h.t), Y(h.demand))));
      g.globalAlpha = 0.7;
      g.stroke();
      g.globalAlpha = 1;
      // frequency strip
      const fy = chartH + 2;
      hist.forEach((h, i) => {
        if (i === 0) return;
        const x0 = X(hist[i - 1].t);
        const x1 = X(h.t);
        const worst = h.fMin <= 0 ? 0 : Math.max(Math.abs(h.fMin - 50), Math.abs(h.fMax - 50));
        g.fillStyle = h.fMin <= 0 ? '#2a3448' : worst < 0.2 ? '#4f8fa6' : worst < 0.5 ? '#ffb04d' : '#ff5b4f';
        g.fillRect(x0, fy, Math.max(1, x1 - x0 + 0.5), fBand - 4);
      });
    }
    // now
    const xn = X(sim.hour);
    g.strokeStyle = '#ece6d8';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(xn, 4);
    g.lineTo(xn, chartH + fBand - 2);
    g.stroke();
    g.fillStyle = '#ece6d8';
    g.beginPath();
    g.arc(xn, 4, 3, 0, Math.PI * 2);
    g.fill();
  }, [sim, tick, forecast]);
  return <canvas ref={ref} className="timeline" aria-label="Demand forecast, demand served and frequency over the shift" />;
}
