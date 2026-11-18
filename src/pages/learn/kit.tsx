import katex from 'katex';
import 'katex/dist/katex.min.css';

export function Tex({ children, block }: { children: string; block?: boolean }) {
  const html = katex.renderToString(children, { displayMode: !!block, throwOnError: false });
  return block ? <div className="tex" dangerouslySetInnerHTML={{ __html: html }} /> : <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Slider({ label, value, min, max, step, unit, onChange, fmt }: {
  label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void; fmt?: (v: number) => string;
}) {
  return (
    <label className="w-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <output>{fmt ? fmt(value) : value} {unit}</output>
    </label>
  );
}

export interface Series {
  pts: [number, number][];
  cls: string;
  label?: string;
}

/** Minimal line plot with labelled axes. */
export function Plot({ series, xr, yr, xl, yl, marks = [], w = 640, h = 260, xfmt = (v) => String(v), yfmt = (v) => String(v), xt, yt }: {
  series: Series[]; xr: [number, number]; yr: [number, number]; xl: string; yl: string;
  marks?: { y?: number; x?: number; cls: string; label: string }[];
  w?: number; h?: number; xfmt?: (v: number) => string; yfmt?: (v: number) => string; xt: number[]; yt: number[];
}) {
  const pl = 52;
  const pb = 34;
  const X = (x: number) => pl + ((x - xr[0]) / (xr[1] - xr[0])) * (w - pl - 10);
  const Y = (y: number) => 10 + (1 - (y - yr[0]) / (yr[1] - yr[0])) * (h - pb - 10);
  const clampY = (y: number) => Math.max(yr[0], Math.min(yr[1], y));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="plot" role="img" aria-label={`${yl} against ${xl}`}>
      <g className="axes">
        {yt.map((y) => (
          <g key={y}>
            <line x1={pl} x2={w - 10} y1={Y(y)} y2={Y(y)} />
            <text x={pl - 8} y={Y(y) + 4} textAnchor="end">{yfmt(y)}</text>
          </g>
        ))}
        {xt.map((x) => <text key={x} x={X(x)} y={h - pb + 18} textAnchor="middle">{xfmt(x)}</text>)}
        <text x={w - 10} y={h - 2} textAnchor="end" className="ax-l">{xl}</text>
        <text x={pl} y={10} className="ax-l" dy="-1">{''}</text>
      </g>
      {marks.map((m, i) =>
        m.y !== undefined ? (
          <g key={i} className={m.cls}>
            <line x1={pl} x2={w - 10} y1={Y(m.y)} y2={Y(m.y)} />
            <text x={w - 12} y={Y(m.y) - 5} textAnchor="end">{m.label}</text>
          </g>
        ) : (
          <g key={i} className={m.cls}>
            <line x1={X(m.x!)} x2={X(m.x!)} y1={10} y2={h - pb} />
            <text x={X(m.x!) + 5} y={22}>{m.label}</text>
          </g>
        ),
      )}
      {series.map((s, i) => (
        <path key={i} className={s.cls} d={`M${s.pts.map(([x, y]) => `${X(x).toFixed(1)},${Y(clampY(y)).toFixed(1)}`).join(' L')}`} />
      ))}
      <text x={14} y={(h - pb) / 2} className="ax-l" transform={`rotate(-90 14 ${(h - pb) / 2})`} textAnchor="middle">{yl}</text>
    </svg>
  );
}

/** Single-bus frequency response: aggregated swing equation with lagged governors. */
export function swing(opts: {
  H: number; S: number; load: number; loss: number; gov: number; Tg: number; ffr?: number; tEnd?: number; steps?: { t: number; dP: number }[];
}) {
  const { H, S, load, gov, Tg, ffr = 0, tEnd = 60 } = opts;
  const f0 = 50;
  let f = f0;
  let pg = 0;
  let pb = 0;
  const pts: [number, number][] = [];
  let nadir = f0;
  let rocof0 = 0;
  const dt = 0.02;
  const events = opts.steps ?? [{ t: 1, dP: opts.loss }];
  let lost = 0;
  let collapsed = false;
  for (let t = 0; t <= tEnd; t += dt) {
    lost = events.filter((e) => t >= e.t).reduce((a, e) => a + e.dP, 0);
    const df = f - f0;
    const target = Math.max(-gov * 2, Math.min(gov * 2, -gov * df));
    pg += (target - pg) * (1 - Math.exp(-dt / Tg));
    const fTarget = ffr > 0 ? Math.max(0, Math.min(ffr, -ffr * (df + 0.05) / 0.45)) : 0;
    pb += (fTarget - pb) * (1 - Math.exp(-dt / 0.3));
    const damp = load * 1.5 * (df / f0);
    const rocof = (f0 * (pg + pb - lost - damp)) / (2 * H * S);
    if (Math.abs(t - 1.02) < dt / 2) rocof0 = rocof;
    f += rocof * dt;
    if (f < 47.5) collapsed = true;
    if (collapsed) f = Math.max(0, f - 2 * dt);
    nadir = Math.min(nadir, f);
    if (Math.round(t / dt) % 5 === 0) pts.push([t, f]);
  }
  return { pts, nadir, rocof0, settle: f, collapsed };
}
