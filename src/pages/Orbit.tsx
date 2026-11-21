import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_ORBIT, eclipseFraction, orbitRun, type OrbitOpts } from '../frontier/space';
import { num } from '../lib/format';
import '../city.css';
import '../frontier.css';

export default function Orbit() {
  const [o, setO] = useState<OrbitOpts>(DEFAULT_ORBIT);
  const run = useMemo(() => orbitRun(o), [o]);
  const [k, setK] = useState(0);
  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (now: number) => { const dt = (now - last) / 1000; last = now; setK((v) => (v + dt * 12) % run.pts.length); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [run]);
  const p = run.pts[Math.floor(k)];
  const f = eclipseFraction(o.beta);
  const phase = (p.t % run.period) / run.period;
  // diagram: sun to the left, shadow to the right; the station goes round
  const ang = phase * Math.PI * 2 + Math.PI; // phase 0.5 = behind the Earth
  const cx = 230, cy = 170, R0 = 90, Ro = 130 * (1 - Math.abs(o.beta) / 200);
  const W = 1000, H = 120;
  const x = (t: number) => (t / (run.period * 3)) * W;
  const socPts = run.pts.map((q) => `${x(q.t).toFixed(1)},${(H - q.soc * H).toFixed(1)}`).join(' ');
  const set = (q: Partial<OrbitOpts>) => setO((v) => ({ ...v, ...q }));
  return (
    <main id="main" className="page fr-page">
      <header className="fr-head">
        <p className="pv-kicker">Frontier · Grid in orbit</p>
        <h1>Sixteen sunsets a day</h1>
        <p>A space station is a small island grid with no neighbours. Its solar arrays charge batteries for 55 minutes, and the batteries carry everything through 36 minutes of darkness, sixteen times a day. Simplified, from public figures for a station at 420 km.</p>
      </header>
      <section className="fr-orbit">
        <svg viewBox="0 0 460 340" className="fr-diagram" role="img" aria-label="Orbit diagram">
          <defs><linearGradient id="sunray" x1="0" x2="1"><stop offset="0" stopColor="#ffb04d" stopOpacity="0.35" /><stop offset="1" stopColor="#ffb04d" stopOpacity="0" /></linearGradient></defs>
          <rect x={0} y={0} width={140} height={340} fill="url(#sunray)" />
          <text x={12} y={24} className="fr-lab">Sun</text>
          <rect x={cx} y={cy - R0} width={240} height={R0 * 2} className="fr-shadow" />
          <ellipse cx={cx} cy={cy} rx={Ro} ry={Ro * (0.3 + Math.abs(o.beta) / 110)} className="fr-path" />
          <circle cx={cx} cy={cy} r={R0} className="fr-earth" />
          <circle cx={cx + Math.cos(ang) * Ro} cy={cy + Math.sin(ang) * Ro * (0.3 + Math.abs(o.beta) / 110)} r={7} className={`fr-iss ${p.sun ? 'sun' : 'dark'}`} />
        </svg>
        <dl className="cy-rows fr-rows">
          <div><dt>Orbit</dt><dd>{num(run.period, 1)} min</dd></div>
          <div><dt>In shadow</dt><dd>{f > 0 ? `${num(run.eclipseMin)} min per orbit` : 'never (sun-synchronous season)'}</dd></div>
          <div><dt>Now</dt><dd className={p.sun ? 'ok' : 'warn'}>{p.sun ? 'in sunlight' : 'in Earth’s shadow'}</dd></div>
          <div><dt>Arrays</dt><dd>{num(p.gen)} kW</dd></div>
          <div><dt>Station load</dt><dd>{num(p.load)} kW</dd></div>
          <div><dt>Battery</dt><dd className={p.soc < 0.4 ? 'bad' : ''}>{Math.round(p.soc * 100)} %</dd></div>
        </dl>
      </section>
      <section className="fr-block">
        <h2>Battery charge over three orbits</h2>
        <svg viewBox={`0 0 ${W} ${H}`} className="fr-chart" preserveAspectRatio="none">
          {run.pts.filter((q, i) => !q.sun && (i === 0 || run.pts[i - 1].sun)).map((q, i) => <rect key={i} x={x(q.t)} y={0} width={x(run.eclipseMin)} height={H} className="fr-night" />)}
          <line x1={0} x2={W} y1={H * 0.65} y2={H * 0.65} className="fr-min" />
          <polyline points={socPts} className="fr-soc" />
          <line x1={x(p.t)} x2={x(p.t)} y1={0} y2={H} className="cy-head" />
        </svg>
        <p className="cy-hint">Shaded: Earth’s shadow. Dashed: 35 % depth of discharge, which flight controllers do not go below. If the load is too high or the arrays degrade, equipment has to be switched off before the next sunset.</p>
      </section>
      <footer className="hp-bar fr-bar">
        <label>Beta angle <select value={o.beta} onChange={(e) => set({ beta: Number(e.target.value) })}>{[0, 30, 52, 65, 75].map((v) => <option key={v} value={v}>{v}°</option>)}</select></label>
        <label>Station load <select value={o.loadKW} onChange={(e) => set({ loadKW: Number(e.target.value) })}>{[60, 90, 120].map((v) => <option key={v} value={v}>{v} kW</option>)}</select></label>
        <label>Array health <select value={o.arrays} onChange={(e) => set({ arrays: Number(e.target.value) })}>{[1, 0.8, 0.6].map((v) => <option key={v} value={v}>{Math.round(v * 100)} %</option>)}</select></label>
      </footer>
    </main>
  );
}
