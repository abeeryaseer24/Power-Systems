// Interactive widgets for the Power Systems 101 course chapters.
import { useEffect, useMemo, useState } from 'react';
import { Plot, Slider } from '../learn/kit';

const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;

// ------------------------------------------------------------ 1. circuit
export function CircuitWidget() {
  const [V, setV] = useState(12);
  const [R, setR] = useState(6);
  const I = V / R;
  const P = V * I;
  const glow = Math.min(1, P / 60);
  return (
    <div className="widget">
      <div className="w-controls">
        <Slider label="Battery voltage" value={V} min={1.5} max={24} step={0.5} unit="V" onChange={setV} />
        <Slider label="Resistance of the bulb" value={R} min={1} max={40} step={1} unit="Ω" onChange={setR} />
      </div>
      <svg viewBox="0 0 520 220" className="cw-svg" role="img" aria-label={`Circuit: ${I.toFixed(2)} amps flowing`}>
        <rect x="60" y="40" width="400" height="140" rx="12" className="cw-wire" />
        <path d="M 60 110 L 60 110" />
        <g transform="translate(60 110)"><rect x="-18" y="-30" width="36" height="60" rx="6" className="cw-bat" /><text y="5" className="cw-t">{V} V</text></g>
        <g transform="translate(460 110)">
          <circle r="26" className="cw-bulb" style={{ fill: `rgba(255, ${170 + glow * 70}, ${60 + glow * 120}, ${0.15 + glow * 0.85})`, filter: `drop-shadow(0 0 ${glow * 30}px rgba(255,190,90,${glow}))` }} />
          <text y="5" className="cw-t">{R} Ω</text>
        </g>
        <rect x="60" y="40" width="400" height="140" rx="12" className="cw-flow" style={{ animationDuration: `${Math.max(0.15, 3 / I)}s` }} />
      </svg>
      <div className="w-read">
        <div><span>Current, I = V / R</span><strong>{I.toFixed(2)} A</strong></div>
        <div><span>Power, P = V × I</span><strong>{P.toFixed(1)} W</strong></div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ 2. AC and phasors
export function PhasorWidget() {
  const [phi, setPhi] = useState(30);
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      setT(now / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const w = 2 * Math.PI * 0.5; // slowed down: one turn every 2 s
  const a = w * t;
  const vx = Math.cos(a) * 70;
  const vy = -Math.sin(a) * 70;
  const ix = Math.cos(a - rad(phi)) * 50;
  const iy = -Math.sin(a - rad(phi)) * 50;
  const pts = (fn: (x: number) => number) => Array.from({ length: 121 }, (_, k) => `${k === 0 ? 'M' : 'L'}${200 + k * 2.6},${110 - fn(a - (k / 120) * 2 * Math.PI) }`).join(' ');
  const P = Math.cos(rad(phi));
  const Q = Math.sin(rad(phi));
  return (
    <div className="widget">
      <div className="w-controls">
        <Slider label="Current lags voltage by" value={phi} min={-60} max={90} step={1} unit="°" onChange={setPhi} />
      </div>
      <svg viewBox="0 0 520 220" className="cw-svg" role="img" aria-label="Rotating phasors and their waveforms">
        <circle cx="100" cy="110" r="74" className="ph-circle" />
        <line x1="100" y1="110" x2={100 + vx} y2={110 + vy} className="ph-v" />
        <line x1="100" y1="110" x2={100 + ix} y2={110 + iy} className="ph-i" />
        <line x1="200" x2="515" y1="110" y2="110" className="ph-axis" />
        <path d={pts((x) => Math.sin(x) * 70)} className="ph-v" />
        <path d={pts((x) => Math.sin(x - rad(phi)) * 50)} className="ph-i" />
        <text x="205" y="30" className="ph-l v">Voltage</text>
        <text x="280" y="30" className="ph-l i">Current</text>
      </svg>
      <div className="w-read">
        <div><span>Power factor, cos φ</span><strong>{P.toFixed(2)}</strong></div>
        <div><span>Real power, per unit</span><strong>{P.toFixed(2)}</strong></div>
        <div><span>Reactive power, per unit</span><strong>{Q.toFixed(2)}</strong></div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ 3. three-phase
export function ThreePhaseWidget() {
  const [unb, setUnb] = useState(0);
  const amps = [1, 1 + unb, 1 - unb * 0.6];
  const ph = [0, -120, 120];
  const sum = amps.reduce((acc, m, k) => [acc[0] + m * Math.cos(rad(ph[k])), acc[1] + m * Math.sin(rad(ph[k]))], [0, 0]);
  const In = Math.hypot(sum[0], sum[1]);
  const col = ['#ffb04d', '#86c5da', '#c9b8ff'];
  return (
    <div className="widget">
      <div className="w-controls">
        <Slider label="Load imbalance between phases" value={unb} min={0} max={0.8} step={0.02} unit="" fmt={(v) => `${Math.round(v * 100)} %`} onChange={setUnb} />
      </div>
      <svg viewBox="0 0 520 220" className="cw-svg" role="img" aria-label="Three phase currents and their sum">
        {amps.map((m, k) => (
          <line key={k} x1="130" y1="110" x2={130 + Math.cos(rad(ph[k])) * 70 * m} y2={110 - Math.sin(rad(ph[k])) * 70 * m} stroke={col[k]} strokeWidth="4" strokeLinecap="round" />
        ))}
        <line x1="130" y1="110" x2={130 + sum[0] * 70} y2={110 - sum[1] * 70} className="ph-n" />
        <text x="250" y="70" className="ph-l">Phases L1, L2, L3: 120° apart</text>
        <text x="250" y="100" className="ph-l">Neutral current is their sum</text>
        <text x="250" y="140" className="ph-big">{In < 0.01 ? 'Neutral: zero' : `Neutral: ${(In * 100).toFixed(0)} % of a phase`}</text>
      </svg>
    </div>
  );
}

// ------------------------------------------------------------ 4. transformer and losses
export function TransformerWidget() {
  const [kv, setKv] = useState(132);
  const P = 1000; // MW
  const R = 0.03 * 200; // ohms for 200 km of conductor
  const I = (P * 1e6) / (Math.sqrt(3) * kv * 1e3);
  const loss = 3 * I * I * R / 1e6;
  const ratio = kv / 11;
  return (
    <div className="widget">
      <div className="w-controls">
        <Slider label="Transmission voltage" value={kv} min={11} max={765} step={1} unit="kV" onChange={setKv} />
      </div>
      <svg viewBox="0 0 520 160" className="cw-svg" role="img" aria-label="Step-up transformer feeding a long line">
        <text x="40" y="40" className="ph-l">Generator 11 kV</text>
        <circle cx="160" cy="80" r="26" className="tr-coil" /><circle cx="190" cy="80" r="26" className="tr-coil" />
        <text x="175" y="130" className="ph-l" textAnchor="middle">1 : {ratio.toFixed(1)}</text>
        <line x1="216" y1="80" x2="500" y2="80" className="tr-line" style={{ strokeWidth: Math.max(1.5, Math.min(14, I / 900)) }} />
        <text x="360" y="60" className="ph-l" textAnchor="middle">200 km line carrying 1,000 MW</text>
      </svg>
      <div className="w-read">
        <div><span>Current in each wire</span><strong>{Math.round(I).toLocaleString('en-GB')} A</strong></div>
        <div><span>Heat lost in the line</span><strong className={loss > 100 ? 'bad' : ''}>{loss > P ? 'More than it carries' : `${Math.round(loss)} MW`}</strong></div>
        <div><span>Share lost</span><strong>{loss > P ? '—' : `${((loss / P) * 100).toFixed(1)} %`}</strong></div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ 5. generator
export function GeneratorWidget() {
  const [poles, setPoles] = useState(2);
  const [delta, setDelta] = useState(30);
  const rpm = (120 * 50) / poles;
  const curve: [number, number][] = Array.from({ length: 91 }, (_, k) => [k * 2, Math.sin(rad(k * 2))]);
  return (
    <div className="widget">
      <div className="w-controls">
        <Slider label="Number of poles" value={poles} min={2} max={40} step={2} unit="" onChange={setPoles} />
        <Slider label="Load angle, δ" value={delta} min={0} max={180} step={1} unit="°" onChange={setDelta} />
      </div>
      <Plot
        series={[{ pts: curve, cls: 's-main' }, { pts: [[delta, 0], [delta, Math.sin(rad(delta))]], cls: 's-bad' }]}
        xr={[0, 180]} yr={[0, 1.1]} xl="load angle δ, degrees" yl="P / Pmax" xt={[0, 30, 60, 90, 120, 150, 180]} yt={[0, 0.5, 1]} h={220}
        marks={[{ x: 90, cls: 'm-trip', label: 'Pull-out: 90°' }]}
      />
      <div className="w-read">
        <div><span>Speed for 50 Hz</span><strong>{Math.round(rpm).toLocaleString('en-GB')} rpm</strong></div>
        <div><span>Typical machine</span><strong>{poles <= 2 ? 'Steam turbine' : poles <= 4 ? 'Gas or nuclear' : 'Hydro turbine'}</strong></div>
        <div><span>Power, P = EV/X sin δ</span><strong className={delta > 90 ? 'bad' : ''}>{delta > 90 ? 'Unstable: pole slip' : `${Math.round(Math.sin(rad(delta)) * 100)} % of max`}</strong></div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ 6. transmission line
export function LineWidget() {
  const [km, setKm] = useState(200);
  const [load, setLoad] = useState(0.5);
  const kv = 400;
  const x = 0.3 * km; // ohm
  const zb = (kv * kv) / 100;
  const xpu = x / zb;
  const pmax = 100 / xpu; // MW
  const bpu = (3.8e-6 * km) * zb;
  const P = load * pmax * 0.8;
  // receiving-end voltage: Ferranti rise at light load, sag at heavy load (simplified)
  const vr = 1 + (bpu * xpu) / 2 * (1 - load * 1.6) - load * load * 0.12;
  return (
    <div className="widget">
      <div className="w-controls">
        <Slider label="Line length" value={km} min={20} max={800} step={10} unit="km" onChange={setKm} />
        <Slider label="Loading" value={load} min={0} max={1} step={0.02} unit="" fmt={(v) => `${Math.round(v * 100)} %`} onChange={setLoad} />
      </div>
      <div className="w-read">
        <div><span>Most a 400 kV line this long can carry</span><strong>{Math.round(pmax).toLocaleString('en-GB')} MW</strong></div>
        <div><span>Now carrying</span><strong>{Math.round(P).toLocaleString('en-GB')} MW</strong></div>
        <div><span>Voltage at the far end</span><strong className={vr > 1.08 || vr < 0.92 ? 'bad' : ''}>{vr.toFixed(3)} pu</strong></div>
      </div>
      <p className="hint">{vr > 1.03 ? 'Lightly loaded, the line’s own capacitance pushes the far-end voltage up: the Ferranti effect. Operators switch in reactors.' : vr < 0.97 ? 'Heavily loaded, reactive losses drag the voltage down. Operators switch in capacitors or raise generator voltage.' : 'Near its natural load, the line is in balance: it absorbs about as much reactive power as it produces.'}</p>
    </div>
  );
}

// ------------------------------------------------------------ 7. substation switching
export function SubstationWidget() {
  const [brk, setBrk] = useState(true);
  const [iso, setIso] = useState(true);
  const [earth, setEarth] = useState(false);
  const [msg, setMsg] = useState('Feeder in service. Take it out safely for maintenance.');
  const live = brk && iso && !earth;
  const tryIso = () => {
    if (brk && iso) setMsg('Arc flash! A disconnector cannot break load current. Open the circuit breaker first.');
    else {
      setIso(!iso);
      setMsg(iso ? 'Disconnector open: a visible gap isolates the feeder.' : 'Disconnector closed.');
    }
  };
  const tryEarth = () => {
    if (iso && !earth) setMsg('Interlock: earthing a live conductor would be a dead short. Open the disconnector first.');
    else {
      setEarth(!earth);
      setMsg(!earth ? 'Earthed. The feeder is now safe to work on.' : 'Earth removed.');
    }
  };
  const tryBrk = () => {
    if (!brk && earth) setMsg('Interlock: closing onto an earth would trip the whole busbar. Remove the earth first.');
    else {
      setBrk(!brk);
      setMsg(brk ? 'Breaker open: it interrupted the load current in its arc chamber.' : 'Breaker closed.');
    }
  };
  return (
    <div className="widget">
      <svg viewBox="0 0 520 200" className="cw-svg ss" role="img" aria-label="Substation feeder bay">
        <line x1="30" y1="40" x2="490" y2="40" className="ss-bus" />
        <text x="30" y="28" className="ph-l">Busbar, 132 kV</text>
        <line x1="260" y1="40" x2="260" y2="70" className={`ss-c ${brk && iso ? 'live' : ''}`} />
        <g onClick={tryIso} className="ss-dev" role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && tryIso()}>
          <line x1="260" y1="70" x2={iso ? 260 : 280} y2={iso ? 100 : 92} className={`ss-c ${live ? 'live' : ''}`} />
          <text x="290" y="88" className="ph-l">Disconnector</text>
        </g>
        <line x1="260" y1="100" x2="260" y2="115" className={`ss-c ${live ? 'live' : ''}`} />
        <g onClick={tryBrk} className="ss-dev" role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && tryBrk()}>
          <rect x="245" y="115" width="30" height="30" className={`ss-brk ${brk ? 'closed' : ''}`} />
          <text x="290" y="135" className="ph-l">Circuit breaker</text>
        </g>
        <line x1="260" y1="145" x2="260" y2="185" className={`ss-c ${live ? 'live' : ''}`} />
        <g onClick={tryEarth} className="ss-dev" role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && tryEarth()}>
          <line x1="260" y1="165" x2={earth ? 220 : 228} y2={earth ? 165 : 150} className="ss-c" />
          <path d="M 205 160 L 205 172 M 199 176 L 211 176 M 202 180 L 208 180" className="ss-c" />
          <text x="120" y="160" className="ph-l">Earth switch</text>
        </g>
        <text x="300" y="185" className="ph-l">To the feeder</text>
      </svg>
      <p className={`hint ${msg.startsWith('Arc') || msg.startsWith('Interlock') ? 'bad' : ''}`}>{msg}</p>
      <p className="hint">Click the devices. The safe order is breaker, then disconnector, then earth.</p>
    </div>
  );
}

// ------------------------------------------------------------ 8. distribution chain
export function DistributionWidget() {
  const [ac, setAc] = useState(0.3);
  const stages = [
    { v: '400 kV', what: 'Transmission' },
    { v: '132 kV', what: 'Sub-transmission' },
    { v: '33 kV', what: 'Primary distribution' },
    { v: '11 kV', what: 'Local feeders' },
    { v: '400/230 V', what: 'Your street' },
  ];
  const homes = 2000;
  const perHome = 0.6 + ac * 2.4; // kW after diversity
  const mw = (homes * perHome) / 1000;
  const lossPct = 2 + ac * 4;
  return (
    <div className="widget">
      <div className="w-controls">
        <Slider label="Homes running air conditioning" value={ac} min={0} max={1} step={0.05} unit="" fmt={(v) => `${Math.round(v * 100)} %`} onChange={setAc} />
      </div>
      <ol className="dist-chain">
        {stages.map((s, i) => (
          <li key={i}><b>{s.v}</b><span>{s.what}</span>{i < stages.length - 1 && <i aria-hidden="true" />}</li>
        ))}
      </ol>
      <div className="w-read">
        <div><span>An 11 kV feeder with 2,000 homes</span><strong>{mw.toFixed(1)} MW</strong></div>
        <div><span>Average per home, after diversity</span><strong>{perHome.toFixed(1)} kW</strong></div>
        <div><span>Lost on the way down</span><strong>{lossPct.toFixed(1)} %</strong></div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ 12. stability (single machine, infinite bus)
export function StabilityWidget() {
  const [clear, setClear] = useState(0.12);
  const [load, setLoad] = useState(0.7);
  const r = useMemo(() => {
    const H = 4;
    const f0 = 50;
    const Pm = load;
    const Pmax = 1.5;
    const Pfault = 0.3;
    let d = Math.asin(Pm / Pmax);
    let w = 0;
    const pts: [number, number][] = [];
    let unstable = false;
    for (let t = 0; t <= 3; t += 0.002) {
      const Pe = (t < clear ? Pfault : Pmax) * Math.sin(d);
      const acc = ((Pm - Pe) * Math.PI * f0) / H;
      w += acc * 0.002;
      d += w * 0.002;
      if (Math.round(t / 0.002) % 10 === 0) pts.push([t, deg(d)]);
      if (deg(d) > 180) {
        unstable = true;
        pts.push([t, 180]);
        break;
      }
    }
    return { pts, unstable };
  }, [clear, load]);
  return (
    <div className="widget">
      <div className="w-controls">
        <Slider label="Time to clear the fault" value={clear} min={0.04} max={0.4} step={0.01} unit="s" fmt={(v) => v.toFixed(2)} onChange={setClear} />
        <Slider label="Generator loading" value={load} min={0.2} max={1.2} step={0.05} unit="pu" fmt={(v) => v.toFixed(2)} onChange={setLoad} />
      </div>
      <Plot series={[{ pts: r.pts, cls: r.unstable ? 's-bad' : 's-main' }]} xr={[0, 3]} yr={[0, 180]} xl="seconds" yl="rotor angle, °" xt={[0, 0.5, 1, 1.5, 2, 2.5, 3]} yt={[0, 45, 90, 135, 180]} h={220} />
      <div className="w-read"><div><span>Outcome</span><strong className={r.unstable ? 'bad' : ''}>{r.unstable ? 'Loses synchronism: pole slip' : 'Swings, then settles'}</strong></div></div>
    </div>
  );
}

// ------------------------------------------------------------ 13. renewables
export function RenewablesWidget() {
  const [solar, setSolar] = useState(0.3);
  const [gfm, setGfm] = useState(false);
  const demand = (h: number) => 0.75 + 0.15 * Math.sin(((h - 9) / 24) * 2 * Math.PI) + (h > 17 && h < 21 ? 0.12 : 0);
  const sun = (h: number) => (h > 6 && h < 19 ? Math.sin(((h - 6) / 13) * Math.PI) : 0);
  const net: [number, number][] = Array.from({ length: 49 }, (_, k) => [k / 2, demand(k / 2) - solar * 1.2 * sun(k / 2)]);
  const dem: [number, number][] = Array.from({ length: 49 }, (_, k) => [k / 2, demand(k / 2)]);
  const inertia = 1 - solar * 0.7;
  const rocof = 0.12 / Math.max(0.15, inertia) * (gfm ? 0.45 : 1);
  return (
    <div className="widget">
      <div className="w-controls">
        <Slider label="Solar share at noon" value={solar} min={0} max={0.9} step={0.05} unit="" fmt={(v) => `${Math.round(v * 100)} %`} onChange={setSolar} />
        <label className="toggle"><input type="checkbox" checked={gfm} onChange={(e) => setGfm(e.target.checked)} /><span>Grid-forming batteries</span></label>
      </div>
      <Plot series={[{ pts: dem, cls: 's-dim' }, { pts: net, cls: 's-main' }]} xr={[0, 24]} yr={[0, 1.1]} xl="hour" yl="demand left for other plant" xt={[0, 6, 12, 18, 24]} yt={[0, 0.5, 1]} h={220} />
      <div className="w-read">
        <div><span>System inertia</span><strong>{Math.round(inertia * 100)} %</strong></div>
        <div><span>RoCoF after losing 1 GW</span><strong className={rocof > 0.5 ? 'bad' : ''}>{rocof.toFixed(2)} Hz/s</strong></div>
      </div>
      <p className="hint">The dip at midday and the steep evening climb is the “duck curve”. Grid-forming inverters act like a stiff voltage source and react within milliseconds, standing in for the inertia that solar displaces.</p>
    </div>
  );
}

