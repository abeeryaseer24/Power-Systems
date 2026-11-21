import { useMemo, useState } from 'react';
import { DEFAULT_MARS, marsRun, type MarsOpts } from '../frontier/space';
import { num } from '../lib/format';
import '../city.css';
import '../frontier.css';

export default function Mars() {
  const [o, setO] = useState<MarsOpts>(DEFAULT_MARS);
  const run = useMemo(() => marsRun(o), [o]);
  const [sol, setSol] = useState(16);
  const p = run.pts[Math.min(run.pts.length - 1, Math.round((sol / 60) * (run.pts.length - 1)))];
  const W = 1000, H = 130;
  const x = (s: number) => (s / 60) * W;
  const soc = run.pts.map((q) => `${x(q.sol).toFixed(1)},${(H - q.soc * H).toFixed(1)}`).join(' ');
  const tau = run.pts.map((q) => `${x(q.sol).toFixed(1)},${(H - (q.tau / 5) * H).toFixed(1)}`).join(' ');
  const set = (q: Partial<MarsOpts>) => setO((v) => ({ ...v, ...q }));
  return (
    <main id="main" className="page fr-page fr-mars">
      <header className="fr-head">
        <p className="pv-kicker">Frontier · Mars microgrid</p>
        <h1>Riding out a dust storm</h1>
        <p>Six people, a habitat, a greenhouse and a plant making oxygen and rocket fuel from the air. On Mars, sunlight is weaker, the day is 24 h 40 min, and a global dust storm can cut solar power by nine-tenths for weeks. Watch what the base has to switch off, and when nuclear power changes the answer. Simplified, from public figures.</p>
      </header>
      <section className="fr-stats">
        <div><span>Sol {Math.floor(p.sol)}</span><b>τ {num(p.tau, 1)}</b><small>dust optical depth</small></div>
        <div><span>Generation</span><b>{num(p.gen)} kW</b><small>at {String(Math.floor((p.sol % 1) * 24)).padStart(2, '0')}:00 local</small></div>
        <div><span>Battery</span><b>{Math.round(p.soc * 100)} %</b><small>of {num(o.batteryKWh)} kWh</small></div>
        <div><span>Switched off</span><b>{num(run.shedH)} h</b><small>of science or fuel production over 60 sols</small></div>
        <div className={run.lifeLost ? 'bad' : ''}><span>Life support</span><b>{run.lifeLost ? 'at risk' : 'never lost'}</b><small>{run.lifeLost ? 'the battery ran flat in the dark' : 'kept running throughout'}</small></div>
      </section>
      <section className="fr-block">
        <h2>Sixty sols</h2>
        <svg viewBox={`0 0 ${W} ${H + 18}`} className="fr-chart" preserveAspectRatio="none">
          {[0, 10, 20, 30, 40, 50].map((s) => <g key={s} className="cy-axis"><line x1={x(s)} x2={x(s)} y1={0} y2={H} /><text x={x(s) + 3} y={H + 13}>sol {s}</text></g>)}
          <polyline points={tau} className="fr-tau" />
          <polyline points={soc} className="fr-soc" />
          <line x1={x(sol)} x2={x(sol)} y1={0} y2={H} className="cy-head" />
        </svg>
        <input type="range" min={0} max={60} step={0.25} value={sol} onChange={(e) => setSol(Number(e.target.value))} className="fr-range" aria-label="Sol" />
        <p className="cy-hint"><i className="dc-k" style={{ background: '#ff8a5c' }} />dust optical depth (0 to 5) <i className="dc-k" style={{ background: '#86c5da' }} />battery charge. Each dip is a Martian night. The propellant plant is switched off first, then science; life support never.</p>
      </section>
      <footer className="hp-bar fr-bar">
        <label>Solar arrays <select value={o.solarM2} onChange={(e) => set({ solarM2: Number(e.target.value) })}>{[800, 1500, 3000].map((v) => <option key={v} value={v}>{num(v)} m²</option>)}</select></label>
        <label>Battery <select value={o.batteryKWh} onChange={(e) => set({ batteryKWh: Number(e.target.value) })}>{[300, 600, 1500].map((v) => <option key={v} value={v}>{num(v)} kWh</option>)}</select></label>
        <label>Fission reactors (10 kWe) <select value={o.reactors} onChange={(e) => set({ reactors: Number(e.target.value) })}>{[0, 1, 2, 4].map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
        <label className="hp-check"><input type="checkbox" checked={o.isru} onChange={(e) => set({ isru: e.target.checked })} /> Run the propellant plant</label>
      </footer>
    </main>
  );
}
