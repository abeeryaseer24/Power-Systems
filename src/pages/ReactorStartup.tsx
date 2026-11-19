import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Reactor, SPECS, BETA } from '../nuclear/reactor';
import SoundToggle from '../components/SoundToggle';
import { sfx } from '../lib/sfx';
import { markDone } from '../lib/career';
import { num } from '../lib/format';
import '../nuclear.css';
import '../startup.css';

type Phase = 'approach' | 'block' | 'heat' | 'sync' | 'load' | 'done' | 'tripped';

const PHASES: { id: Phase; title: string; goal: string }[] = [
  { id: 'approach', title: 'Approach criticality', goal: 'Withdraw the rods until the reactor is critical. Keep the period longer than 30 seconds.' },
  { id: 'block', title: 'Block the source range', goal: 'Above 10⁻⁵ of rated power the source-range counters saturate. Block them before 10⁻⁴ or they trip the reactor.' },
  { id: 'heat', title: 'Raise power to 12 %', goal: 'Bring power up through the intermediate range into the power range.' },
  { id: 'sync', title: 'Synchronise the generator', goal: 'Match the turbine-generator to the grid and close the breaker as the synchroscope passes twelve o’clock.' },
  { id: 'load', title: 'Load to full power', goal: 'Raise power to 100 % without tripping on overpower (118 %) or a short period.' },
];

function makeReactor() {
  // critical with rods 45 % in, then start from fully inserted at source level
  const r = new Reactor(SPECS.rooppur, { power: 1e-8, rods: 0.45 });
  r.s.rods = r.s.rodTarget = 0.95;
  r.s.turbineOnline = false;
  r.s.Pe = 0;
  r.s.speed = 0;
  return r;
}

export default function ReactorStartup() {
  const rRef = useRef<Reactor>(makeReactor());
  const [, setT] = useState(0);
  const [phase, setPhase] = useState<Phase>('approach');
  const [srBlocked, setSrBlocked] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [rodMove, setRodMove] = useState(0);
  const [turbFreq, setTurbFreq] = useState(49.6);
  const [msg, setMsg] = useState('');
  const angle = useRef(0);
  const started = useRef(performance.now());
  const [elapsed, setElapsed] = useState(0);
  const tripRef = useRef('');

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const r = rRef.current;
      if (phase === 'done' || phase === 'tripped') return;
      if (rodMove) r.s.rodTarget = Math.max(0, Math.min(1, r.s.rods + rodMove * 0.0006 * dt * 60 * speed * 0.1));
      else r.s.rodTarget = r.s.rods;
      r.advance(dt * speed);
      // the source range trips if left unblocked at high count rate
      if (!srBlocked && r.s.n > 1e-4 && !r.s.scram) r.scram('source range high flux: counters saturated');
      if (r.s.scram && !tripRef.current) {
        tripRef.current = r.s.log[r.s.log.length - 1]?.text ?? 'reactor trip';
        setPhase('tripped');
        sfx.clunk(1.4);
        sfx.klaxon(2);
      }
      if (!r.s.turbineOnline) angle.current = (angle.current + (turbFreq - 50) * 360 * dt) % 360;
      setElapsed((now - started.current) / 1000);
      setT((x) => x + 1);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, srBlocked, speed, rodMove, turbFreq]);

  const r = rRef.current;
  const s = r.s;
  const rho = r.rho / BETA;
  const period = r.period;
  // phase progression
  useEffect(() => {
    if (phase === 'approach' && s.n > 2e-6 && period > 0 && Number.isFinite(period)) setPhase('block');
    if (phase === 'block' && srBlocked) setPhase('heat');
    if (phase === 'heat' && s.n > 0.12) setPhase('sync');
    if (phase === 'load' && s.Pe > 0.95 * r.spec.Pe0) {
      setPhase('done');
      markDone('reactor-startup');
      sfx.klaxon(1);
    }
  });

  const a = ((angle.current % 360) + 540) % 360 - 180;
  const closeBreaker = () => {
    const slip = Math.abs(turbFreq - 50);
    if (Math.abs(a) < 12 && slip < 0.15) {
      r.s.turbineOnline = true;
      setPhase('load');
      setMsg('Breaker closed in phase. The generator picks up load smoothly.');
      sfx.clunk();
    } else {
      setMsg(`Out of phase by ${Math.abs(a).toFixed(0)}°: the surge trips the generator protection. Try again.`);
      sfx.clunk(1.3);
    }
  };
  const restart = () => {
    rRef.current = makeReactor();
    tripRef.current = '';
    setSrBlocked(false);
    setPhase('approach');
    setMsg('');
    setTurbFreq(49.6);
    started.current = performance.now();
  };
  const range = s.n < 1e-5 ? 'Source range' : s.n < 1e-2 ? 'Intermediate range' : 'Power range';
  const cps = s.n * 1e11;
  const idx = PHASES.findIndex((p) => p.id === phase);
  const logPos = Math.max(0, Math.min(1, (Math.log10(Math.max(1e-9, s.n)) + 9) / 9.1));

  return (
    <main id="main" className="page startup">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/nuclear">Nuclear</Link> <span aria-hidden="true">/</span> Reactor startup</nav>
      <header className="su-head">
        <h1>Bring Rooppur to full power</h1>
        <p className="lede">A VVER-1200 sits in cold shutdown with its rods fully inserted. Take it from a few neutrons a second to 1,200 MW on the Bangladesh grid without tripping.</p>
      </header>
      <ol className="su-phases">
        {PHASES.map((p, i) => (
          <li key={p.id} className={i < idx || phase === 'done' ? 'done' : i === idx ? 'now' : ''}><b>{p.title}</b>{i === idx && phase !== 'tripped' && <span>{p.goal}</span>}</li>
        ))}
      </ol>

      <section className="su-board">
        <div className="su-meter">
          <span className="su-k">Neutron power, log scale</span>
          <div className="su-log"><i style={{ height: `${logPos * 100}%` }} />{[-8, -6, -4, -2, 0].map((e) => <b key={e} style={{ bottom: `${((e + 9) / 9.1) * 100}%` }}>{e === 0 ? '100 %' : `10${'⁻' + '⁰¹²³⁴⁵⁶⁷⁸⁹'[Math.abs(e)]}`}</b>)}</div>
          <strong>{s.n >= 0.01 ? `${num(s.n * 100, 1)} %` : s.n.toExponential(1)}</strong>
          <em>{range}{range === 'Source range' ? `, ${num(cps)} counts/s` : ''}</em>
        </div>
        <div className="su-gauges">
          <div className={`su-g ${period > 0 && period < 30 ? 'bad' : ''}`}><span>Reactor period</span><strong>{Number.isFinite(period) && Math.abs(period) < 5000 ? `${num(period, Math.abs(period) < 100 ? 1 : 0)} s` : 'Steady'}</strong></div>
          <div className="su-g"><span>Reactivity</span><strong>{rho >= 0 ? '+' : '−'}${Math.abs(rho).toFixed(3)}</strong></div>
          <div className="su-g"><span>Rods inserted</span><strong>{num(s.rods * 100, 1)} %</strong></div>
          <div className="su-g"><span>Coolant</span><strong>{num(s.Tc)} °C</strong></div>
          <div className="su-g"><span>Pressure</span><strong>{s.p.toFixed(1)} MPa</strong></div>
          <div className="su-g"><span>Generator</span><strong>{num(s.Pe)} MW</strong></div>
        </div>
        <div className="su-controls">
          <span className="su-k">Control rods</span>
          <div className="row2">
            <button className="btn ghost" onPointerDown={() => setRodMove(-1)} onPointerUp={() => setRodMove(0)} onPointerLeave={() => setRodMove(0)} disabled={phase === 'tripped' || phase === 'done'}>Hold to withdraw</button>
            <button className="btn ghost" onPointerDown={() => setRodMove(1)} onPointerUp={() => setRodMove(0)} onPointerLeave={() => setRodMove(0)} disabled={phase === 'tripped' || phase === 'done'}>Hold to insert</button>
          </div>
          <button className={`chip ${srBlocked ? 'on' : ''}`} onClick={() => { setSrBlocked(true); sfx.clunk(0.6); }} disabled={srBlocked || s.n < 1e-6}>Block source range</button>
          <div className="su-speed">
            <span>Time</span>
            {[1, 5, 20].map((v) => <button key={v} className={`chip ${speed === v ? 'on' : ''}`} onClick={() => setSpeed(v)}>{v}×</button>)}
          </div>
          <SoundToggle />
        </div>
      </section>

      {phase === 'sync' && (
        <section className="su-sync">
          <h2>Synchronise to the grid</h2>
          <div className="sync">
            <svg viewBox="0 0 200 200" className="sync-dial" role="img" aria-label={`Synchroscope, ${a.toFixed(0)} degrees`}>
              <circle cx="100" cy="100" r="86" className="sd-face" />
              <path d="M 100 14 L 100 30" className="sd-mark" />
              <line x1="100" y1="100" x2={100 + 72 * Math.sin((a * Math.PI) / 180)} y2={100 - 72 * Math.cos((a * Math.PI) / 180)} className={`sd-needle ${Math.abs(a) < 12 ? 'ok' : ''}`} />
              <circle cx="100" cy="100" r="6" className="sd-hub" />
            </svg>
            <div className="sync-read">
              <label className="w-slider"><span>Turbine speed</span><input type="range" min={49.4} max={50.6} step={0.01} value={turbFreq} onChange={(e) => setTurbFreq(Number(e.target.value))} /><output>{turbFreq.toFixed(2)} Hz</output></label>
              <div><span>Slip</span><strong>{(turbFreq - 50).toFixed(2)} Hz</strong></div>
              <div><span>Phase</span><strong>{a.toFixed(0)}°</strong></div>
              <button className="btn primary" onClick={closeBreaker}>Close the generator breaker</button>
              {msg && <p className={`hint ${msg.startsWith('Breaker') ? '' : 'bad'}`}>{msg}</p>}
            </div>
          </div>
        </section>
      )}

      {(phase === 'tripped' || phase === 'done') && (
        <section className={`su-end ${phase}`}>
          <h2>{phase === 'done' ? 'Rooppur is at full power' : 'Reactor trip'}</h2>
          <p>{phase === 'done' ? `1,200 MW on the Bangladesh grid in ${Math.round(elapsed / 60)} minutes of your time.` : `${tripRef.current}. The rods dropped in ${r.spec.scramTime} seconds and the reactor is shut down.`}</p>
          <button className="btn primary" onClick={restart}>{phase === 'done' ? 'Run it again' : 'Start over'}</button>
        </section>
      )}

      <section className="prose su-notes">
        <h2>What you are doing</h2>
        <p>Below critical, neutrons from a startup source are multiplied by the fuel; each rod withdrawal raises the count rate and brings the reactor closer to critical. Once critical, power rises exponentially with a period set by the reactivity. A one-dollar insertion would make the reactor prompt critical, which is why operators watch the period, not the power.</p>
        <p>Detectors hand over across ten decades of power: pulse counters at the bottom, compensated ion chambers in the middle, current-mode chambers at power. Operators block the source range once the intermediate range is on scale.</p>
        <p>Above about 12 % the plant makes enough steam to roll the turbine. The generator must match grid frequency and phase before its breaker closes, then it picks up load as rods come out further.</p>
        <p><Link to="/nuclear/instrumentation">More on the instrumentation</Link></p>
      </section>
    </main>
  );
}
