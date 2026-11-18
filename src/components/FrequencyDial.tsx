const LO = 48.5;
const HI = 51.5;
const SWEEP = 240;
const R = 92;
const CX = 110;
const CY = 112;

const ang = (f: number) => -SWEEP / 2 + ((Math.max(LO, Math.min(HI, f)) - LO) / (HI - LO)) * SWEEP;
const pt = (deg: number, r: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
};
function arc(f0: number, f1: number, r: number) {
  const [x0, y0] = pt(ang(f0), r);
  const [x1, y1] = pt(ang(f1), r);
  const large = ang(f1) - ang(f0) > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

export function freqState(f: number) {
  if (f <= 0) return 'dead';
  if (f < 48.8 || f > 51) return 'trip';
  if (f < 49.5 || f > 50.5) return 'alarm';
  if (f < 49.8 || f > 50.2) return 'warn';
  return 'ok';
}

export default function FrequencyDial({ f, rocof, trace }: { f: number; rocof: number; trace: number[] }) {
  const state = freqState(f);
  const ticks: number[] = [];
  for (let x = LO; x <= HI + 1e-6; x += 0.1) ticks.push(Math.round(x * 10) / 10);
  const needle = ang(f > 0 ? f : LO);
  const [nx, ny] = pt(needle, R - 14);
  const w = 200;
  const h = 46;
  const lo = 49.0;
  const hi = 51.0;
  const path = trace
    .map((v, i) => {
      const x = (i / Math.max(1, trace.length - 1)) * w;
      const y = v > 0 ? h - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * h : h;
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const y50 = h / 2;
  return (
    <div className={`dial dial-${state}`} role="group" aria-label="System frequency">
      <svg viewBox="0 0 220 190" className="dial-svg" aria-hidden="true">
        <path d={arc(LO, HI, R)} className="dial-track" />
        <path d={arc(49.5, 50.5, R)} className="dial-stat" />
        <path d={arc(49.8, 50.2, R)} className="dial-op" />
        <path d={arc(LO, 48.8, R)} className="dial-ufls" />
        <path d={arc(51, HI, R)} className="dial-ufls" />
        {ticks.map((t) => {
          const major = Math.abs(t * 2 - Math.round(t * 2)) < 1e-6;
          const [x0, y0] = pt(ang(t), R + 6);
          const [x1, y1] = pt(ang(t), R + (major ? 15 : 10));
          return <line key={t} x1={x0} y1={y0} x2={x1} y2={y1} className={major ? 'tick major' : 'tick'} />;
        })}
        {[49, 50, 51].map((t) => {
          const [x, y] = pt(ang(t), R + 27);
          return (
            <text key={t} x={x} y={y + 4} className="dial-num">
              {t}
            </text>
          );
        })}
        <line x1={CX} y1={CY} x2={nx} y2={ny} className="needle" style={{ opacity: f > 0 ? 1 : 0.15 }} />
        <circle cx={CX} cy={CY} r={5} className="hub" />
      </svg>
      <div className="dial-read">
        <span className="dial-value">{f > 0 ? f.toFixed(3) : '0.000'}</span>
        <span className="dial-unit">Hz</span>
      </div>
      <div className="dial-rocof">
        {f > 0 ? `${rocof >= 0 ? '+' : '−'}${Math.abs(rocof).toFixed(3)} Hz/s` : 'No synchronous machines online'}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="trace" preserveAspectRatio="none" aria-hidden="true">
        <rect x="0" y={h - ((50.2 - lo) / (hi - lo)) * h} width={w} height={(0.4 / (hi - lo)) * h} className="trace-band" />
        <line x1="0" x2={w} y1={y50} y2={y50} className="trace-mid" />
        <path d={path} className="trace-line" />
      </svg>
      <div className="trace-cap">
        <span>Last 2 minutes</span>
        <span>49–51 Hz</span>
      </div>
    </div>
  );
}
