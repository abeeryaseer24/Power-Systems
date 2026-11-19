import { useCallback, useEffect, useRef, useState } from 'react';
import type { Reactor } from './reactor';
import { BETA } from './reactor';
import { buildReactor, type NuclearPlant } from './plants';
import { num } from '../lib/format';
import { sfx } from '../lib/sfx';
import SoundToggle from '../components/SoundToggle';

const ALARMS = [
  'High neutron flux', 'Short reactor period', 'High pressure', 'Low pressure', 'Low coolant flow', 'Low water level',
  'Core uncovered', 'High fuel temperature', 'Relief valve open', 'Turbine tripped', 'Loss of offsite power', 'Station blackout',
  'DC power lost', 'Hydrogen generation', 'Fuel damage',
];
const SPEEDS = [0, 1, 10, 60, 600];
const SPEED_LABEL = ['Pause', '1×', '10×', '60×', '600×'];

function hms(t: number) {
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h} h ` : ''}${String(m).padStart(h ? 2 : 1, '0')} min ${String(s % 60).padStart(2, '0')} s`;
}

function heat(T: number) {
  // fuel colour: dull red at operating temperature to white at melting
  const x = Math.max(0, Math.min(1, (T - 300) / 2400));
  const r = Math.round(120 + 135 * Math.min(1, x * 1.6));
  const g = Math.round(40 + 200 * Math.max(0, x - 0.3));
  const b = Math.round(30 + 200 * Math.max(0, x - 0.7));
  return `rgb(${r},${g},${b})`;
}

export default function ReactorRoom({ plant }: { plant: NuclearPlant }) {
  const [mode, setMode] = useState<'watch' | 'control' | null>(null);
  const rRef = useRef<Reactor>(buildReactor(plant, 'watch'));
  const [, setTick] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const speed = useRef(0);
  const [acked, setAcked] = useState<Set<string>>(new Set());
  const trendRef = useRef<HTMLCanvasElement>(null);

  const start = (m: 'watch' | 'control') => {
    sfx.unlock();
    rRef.current = buildReactor(plant, m);
    setMode(m);
    setAcked(new Set());
    const i = SPEEDS.indexOf(plant.speed);
    setSpeedIdx(i < 0 ? 1 : i);
    speed.current = plant.speed;
  };
  const setSpeed = (i: number) => {
    setSpeedIdx(i);
    speed.current = SPEEDS[i];
  };

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let ui = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const r = rRef.current;
      if (speed.current > 0 && r.s.t < plant.span) r.advance(Math.min(dt * speed.current, 120));
      if (now - ui > 100) {
        ui = now;
        setTick((t) => t + 1);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [plant]);

  const r = rRef.current;
  const s = r.s;
  const sp = r.spec;
  const act = useCallback((fn: (r: Reactor) => void) => fn(rRef.current), []);

  useEffect(() => {
    const c = trendRef.current;
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
    const tr = r.trend;
    if (tr.length < 2) return;
    const t0 = tr[0].t;
    const t1 = Math.max(t0 + 10, tr[tr.length - 1].t);
    const X = (t: number) => 40 + ((t - t0) / (t1 - t0)) * (W - 48);
    const series = [
      { name: 'Power (log)', color: '#ffb04d', y: (p: (typeof tr)[0]) => Math.max(0, Math.min(1, (Math.log10(Math.max(1e-4, p.n * 100)) + 2) / 6)) },
      { name: 'Fuel temperature', color: '#ff5b4f', y: (p: (typeof tr)[0]) => Math.min(1, p.Tf / 3000) },
      { name: 'Water level', color: '#86c5da', y: (p: (typeof tr)[0]) => p.level },
      { name: 'Pressure', color: '#c9b8ff', y: (p: (typeof tr)[0]) => Math.min(1, p.p / (sp.p0 * 1.3)) },
    ];
    g.font = '12px "Atkinson Hyperlegible Next", sans-serif';
    series.forEach((se, k) => {
      g.strokeStyle = se.color;
      g.lineWidth = 1.5;
      g.beginPath();
      tr.forEach((p, i) => {
        const y = 8 + (1 - se.y(p)) * (H - 26);
        if (i) g.lineTo(X(p.t), y);
        else g.moveTo(X(p.t), y);
      });
      g.stroke();
      g.fillStyle = se.color;
      g.fillText(se.name, 44 + k * 140, H - 4);
    });
  });

  const alarms = [...s.alarms];
  const alarmCount = useRef(0);
  const scrammed = useRef(false);
  useEffect(() => {
    if (s.alarms.size > alarmCount.current) sfx.klaxon(1);
    alarmCount.current = s.alarms.size;
    if (s.scram && !scrammed.current) sfx.clunk(1.4);
    scrammed.current = s.scram;
    if (s.destroyed) sfx.boom();
  });
  const unacked = alarms.filter((a) => !acked.has(a));
  const isPWR = sp.type === 'pwr' || sp.type === 'vver';
  const rhoDollars = r.rho / BETA;
  const coverY = 330 - 220 * r.level;
  const rodLen = 210 * s.rods;
  const flowAnim = s.flow > 0.06 ? `${Math.max(0.3, 2.2 / s.flow)}s` : '0s';
  const turbineSpin = s.speed > 0.05 ? `${Math.max(0.15, 0.8 / s.speed)}s` : '0s';
  const nextStep = plant.steps.find((st) => st.t > s.t);
  const past = plant.steps.filter((st) => st.t <= s.t);
  const ended = s.t >= plant.span;

  return (
    <div className="rroom">
      <div className="rr-top">
        <div className="rr-clock">
          <span>{plant.scenarioTitle}</span>
          <strong>{past.length ? past[past.length - 1].clock : 'Before the event'}</strong>
          <em>T+{hms(s.t)}</em>
        </div>
        <div className="speed" role="radiogroup" aria-label="Simulation speed">
          {SPEED_LABEL.map((l, i) => (
            <button key={l} role="radio" aria-checked={speedIdx === i} className={speedIdx === i ? 'on' : ''} onClick={() => setSpeed(i)} disabled={!mode}>
              {i === 0 ? <svg viewBox="0 0 16 16" aria-label="Pause"><rect x="4" y="3" width="3" height="10" fill="currentColor" /><rect x="9" y="3" width="3" height="10" fill="currentColor" /></svg> : l}
            </button>
          ))}
        </div>
        <SoundToggle />
        <button className="btn ghost small" onClick={() => start(mode ?? 'watch')} disabled={!mode}>Restart</button>
      </div>

      <div className="rr-grid">
        <figure className={`rr-schematic t-${sp.type} ${s.destroyed ? 'boom' : ''}`}>
          <svg viewBox="0 0 900 420" role="img" aria-label={`Live schematic of ${sp.name}`}>
            <defs>
              <linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a86b8" /><stop offset="1" stopColor="#173f63" /></linearGradient>
            </defs>
            {/* containment */}
            <path d="M 30 400 L 30 120 Q 30 30 150 30 Q 270 30 270 120 L 270 400 Z" className="sch-contain" />
            {/* passive / isolation condenser */}
            {sp.passive > 0 && (
              <g className={`sch-passive ${s.passiveOn && (s.dcPower || sp.type === 'vver') ? 'on' : ''}`}>
                <rect x="190" y="44" width="70" height="40" rx="6" />
                <text x="225" y="68">{sp.type === 'bwr' ? 'Isolation condenser' : 'Passive cooling'}</text>
                <path d="M 190 64 L 150 64 L 150 100" className="pipe" />
              </g>
            )}
            {/* vessel */}
            <rect x="70" y="100" width="160" height="250" rx="40" className="sch-vessel" />
            <clipPath id="vclip"><rect x="74" y="104" width="152" height="242" rx="36" /></clipPath>
            <g clipPath="url(#vclip)">
              <rect x="70" y="100" width="160" height="250" className="sch-steam" />
              <rect x="70" y={coverY} width="160" height={360 - coverY} fill="url(#water)" className="sch-water" />
              {s.void > 0.02 && Array.from({ length: Math.round(s.void * 30) }).map((_, i) => (
                <circle key={i} cx={85 + ((i * 37) % 130)} cy={330 - ((i * 53) % 200)} r={2 + (i % 3)} className="sch-bubble" style={{ animationDelay: `${(i % 7) * 0.2}s` }} />
              ))}
            </g>
            {/* core */}
            {Array.from({ length: 7 }).map((_, i) => (
              <rect key={i} x={92 + i * 17} y={210} width={11} height={110} rx="2" fill={s.damage > 0.5 && i % 2 ? '#3a2015' : heat(s.Tf)} className="sch-fuel" style={{ transform: s.damage > 0.3 ? `translateY(${s.damage * (10 + (i % 3) * 8)}px)` : undefined }} />
            ))}
            {s.damage > 0.2 && <ellipse cx="150" cy="335" rx={30 + s.damage * 40} ry={6 + s.damage * 6} className="sch-corium" />}
            {/* control rods */}
            {Array.from({ length: 6 }).map((_, i) => (
              <rect key={i} x={100 + i * 17} y={110} width={4} height={Math.max(2, rodLen)} className="sch-rod" />
            ))}
            <text x="150" y="95" className="sch-label">{sp.type === 'rbmk' ? 'Graphite core' : 'Reactor vessel'}</text>
            {/* primary loop / steam line */}
            <path d="M 230 160 L 330 160" className="pipe hot" style={{ animationDuration: flowAnim }} />
            <path d="M 330 300 L 230 300" className="pipe cold" style={{ animationDuration: flowAnim }} />
            {isPWR ? (
              <g>
                <rect x="330" y="120" width="70" height="210" rx="30" className="sch-sg" />
                <text x="365" y="345" className="sch-label">Steam generator</text>
                <rect x="290" y="40" width="34" height="80" rx="14" className="sch-przr" />
                <text x="307" y="34" className="sch-label">Pressuriser</text>
                <path d="M 307 120 L 307 160" className="pipe" />
                <g className={`valve ${s.porvOpen ? 'open' : ''}`} transform="translate(307 30)">
                  <path d="M -10 -14 L 10 -6 L 10 -22 Z M 10 -14 L 30 -6 L 30 -22 Z" />
                </g>
                <circle cx="352" cy="22" r="7" className={`lamp ${s.porvIndicatedOpen ? 'on' : ''}`} />
                <text x="364" y="26" className="sch-tiny">PORV {s.porvIndicatedOpen ? 'OPEN' : 'CLOSED'} (indicated)</text>
                {s.porvStuck && <text x="364" y="42" className="sch-tiny bad">Actual: {s.porvOpen && s.blockValve ? 'open, leaking' : 'isolated'}</text>}
                <path d="M 400 150 L 520 150" className="pipe steam" style={{ animationDuration: s.turbineOnline ? '0.8s' : '0s' }} />
              </g>
            ) : (
              <g>
                {sp.type === 'rbmk' && <rect x="330" y="110" width="110" height="40" rx="18" className="sch-sg" />}
                {sp.type === 'rbmk' && <text x="385" y="104" className="sch-label">Steam separator</text>}
                <path d="M 230 130 L 520 130 L 520 150" className="pipe steam" style={{ animationDuration: s.turbineOnline ? '0.8s' : '0s' }} />
              </g>
            )}
            {/* pumps */}
            <g transform="translate(300 300)" className={`pump ${s.flow > 0.2 ? 'on' : ''}`}>
              <circle r="16" />
              <path d="M -9 0 L 9 0 M 0 -9 L 0 9" style={{ animationDuration: flowAnim }} />
            </g>
            <text x="300" y="334" className="sch-label">Main pumps ({s.pumpOn.filter(Boolean).length}/{sp.pumps})</text>
            {/* turbine and generator */}
            <path d="M 520 120 L 620 100 L 620 220 L 520 200 Z" className="sch-turbine" />
            <g transform="translate(570 160)"><g className="blades" style={{ animationDuration: turbineSpin }}><path d="M -18 0 L 18 0 M 0 -18 L 0 18 M -13 -13 L 13 13 M -13 13 L 13 -13" /></g></g>
            <text x="570" y="240" className="sch-label">Turbine</text>
            <path d="M 620 160 L 660 160" className="shaft" />
            <circle cx="700" cy="160" r="40" className={`sch-gen ${s.turbineOnline ? 'on' : ''}`} />
            <text x="700" y="166" className="sch-gen-t">G</text>
            <text x="700" y="225" className="sch-label">{num(s.Pe)} MW</text>
            {/* breaker and grid */}
            <path d="M 740 160 L 780 160" className="wire" />
            <path d={s.turbineOnline ? 'M 780 160 L 810 160' : 'M 780 160 L 806 146'} className="wire breaker" />
            <path d="M 812 160 L 870 160" className={`wire ${s.offsite ? 'live' : ''}`} />
            <text x="840" y="146" className="sch-label">Grid</text>
            {!s.offsite && <text x="840" y="182" className="sch-tiny bad">Lost</text>}
            {/* condenser and feedwater */}
            <rect x="520" y="270" width="110" height="50" rx="8" className="sch-cond" />
            <text x="575" y="300" className="sch-label">Condenser</text>
            <path d="M 520 300 L 420 300 L 420 330 L 330 330" className={`pipe ${s.feed ? 'cold' : 'dead'}`} style={{ animationDuration: s.feed ? '1.6s' : '0s' }} />
            <text x="470" y="290" className="sch-tiny">Feedwater {s.feed ? 'on' : 'lost'}</text>
            {/* emergency power */}
            <g transform="translate(680 290)">
              <rect width="90" height="34" rx="6" className={`sch-box ${s.diesels ? 'on' : ''}`} />
              <text x="45" y="21" className="sch-label">Diesels</text>
              <rect y="44" width="90" height="34" rx="6" className={`sch-box ${s.dcPower ? 'on' : 'bad'}`} />
              <text x="45" y="65" className="sch-label">DC batteries</text>
              <rect x="100" width="90" height="34" rx="6" className={`sch-box ${s.hpi > 0.05 && r.acPower ? 'on' : ''}`} />
              <text x="145" y="21" className="sch-label">HP injection</text>
              {s.fireInjection && (<><rect x="100" y="44" width="90" height="34" rx="6" className="sch-box on" /><text x="145" y="65" className="sch-label">Fire engines</text></>)}
            </g>
            {s.destroyed && <text x="450" y="210" className="sch-boom">Core destroyed</text>}
          </svg>
        </figure>

        <section className="rr-side">
          <div className="annun" role="list" aria-label="Annunciator panel">
            {ALARMS.map((a) => (
              <span key={a} role="listitem" className={`ann ${s.alarms.has(a) ? (acked.has(a) ? 'lit' : 'flash') : ''}`}>{a}</span>
            ))}
          </div>
          <button className="btn ghost small" onClick={() => setAcked(new Set(alarms))} disabled={!unacked.length}>Acknowledge alarms</button>
          <dl className="rr-gauges">
            <div><dt>Fission power</dt><dd className={s.n > 1.1 ? 'bad' : ''}>{s.n >= 0.01 ? `${num(s.n * 100, s.n < 0.1 ? 1 : 0)} %` : `${(s.n * 100).toExponential(1)} %`}</dd></div>
            <div><dt>Reactivity</dt><dd className={rhoDollars > 0.5 ? 'bad' : ''}>{rhoDollars >= 0 ? '+' : '−'}${Math.abs(rhoDollars).toFixed(2)}</dd></div>
            <div><dt>Period</dt><dd>{Number.isFinite(r.period) && Math.abs(r.period) < 1e4 ? `${num(r.period, Math.abs(r.period) < 10 ? 2 : 0)} s` : 'Steady'}</dd></div>
            <div><dt>Decay heat</dt><dd>{num(r.decay)} MW</dd></div>
            <div><dt>Fuel</dt><dd className={s.Tf > 1200 ? 'bad' : ''}>{num(s.Tf)} °C</dd></div>
            <div><dt>Coolant</dt><dd>{num(s.Tc)} °C</dd></div>
            <div><dt>Pressure</dt><dd>{s.p.toFixed(1)} MPa</dd></div>
            <div><dt>Core covered</dt><dd className={r.level < 0.9 ? 'bad' : ''}>{num(r.level * 100)} %</dd></div>
            <div><dt>Hydrogen</dt><dd className={s.h2 > 5 ? 'bad' : ''}>{num(s.h2)} kg</dd></div>
            <div><dt>Core damage</dt><dd className={s.damage > 0.01 ? 'bad' : ''}>{num(s.damage * 100)} %</dd></div>
          </dl>
          {mode === 'control' && (
            <div className="rr-controls">
              <button className="scram" onClick={() => act((x) => x.scram('manual scram'))} disabled={s.scram}>{sp.type === 'rbmk' ? 'AZ-5' : 'SCRAM'}</button>
              <label className="w-slider">
                <span>Control rods inserted</span>
                <input type="range" min={0} max={1} step={0.01} value={s.rodTarget} onChange={(e) => act((x) => { x.s.rodTarget = Number(e.target.value); })} disabled={s.scram} />
                <output>{num(s.rodTarget * 100)} %</output>
              </label>
              <div className="rr-toggles">
                <button className={`chip ${s.pumpOn.every(Boolean) ? 'on' : ''}`} onClick={() => act((x) => x.s.pumpOn.fill(!x.s.pumpOn.every(Boolean)))}>Main pumps</button>
                <button className={`chip ${s.feed ? 'on' : ''}`} onClick={() => act((x) => { x.s.feed = !x.s.feed; })}>Feedwater</button>
                {isPWR && <button className={`chip ${s.hpi > 0.5 ? 'on' : ''}`} onClick={() => act((x) => { x.s.hpi = x.s.hpi > 0.5 ? 0.1 : 1; })}>Full HP injection</button>}
                {isPWR && <button className={`chip ${!s.blockValve ? 'on' : ''}`} onClick={() => act((x) => { x.s.blockValve = !x.s.blockValve; })}>Close PORV block valve</button>}
                {sp.passive > 0 && <button className={`chip ${s.passiveOn ? 'on' : ''}`} onClick={() => act((x) => { if (x.s.dcPower || x.spec.type === 'vver') x.s.passiveOn = !x.s.passiveOn; })} disabled={!s.dcPower && sp.type !== 'vver'}>{sp.type === 'bwr' ? 'Isolation condenser' : 'Passive cooling'}</button>}
                {!s.offsite && <button className={`chip ${s.diesels ? 'on' : ''}`} onClick={() => act((x) => { if (x.s.dcPower) x.s.diesels = true; })} disabled={!s.dcPower || s.diesels}>Start diesels</button>}
                {sp.type === 'bwr' && <button className={`chip ${s.fireInjection ? 'on' : ''}`} onClick={() => act((x) => { x.s.depress = true; x.s.fireInjection = true; x.note('Reactor depressurised; fire engine injection started.'); })} disabled={s.fireInjection}>Vent and inject with fire engines</button>}
              </div>
            </div>
          )}
          {mode === 'watch' && nextStep && (
            <p className="rr-next"><b>Next, {nextStep.clock}.</b> {nextStep.label}</p>
          )}
        </section>
      </div>

      <div className="rr-bottom">
        <canvas ref={trendRef} className="rr-trend" aria-label="Trends of power, fuel temperature, water level and pressure" />
        <ol className="rr-log" aria-live="polite">
          {s.log.slice(-5).reverse().map((l, i) => (
            <li key={`${l.t}-${i}`} className={`log-${l.level}`}><time>T+{hms(l.t)}</time><span>{l.text}</span></li>
          ))}
        </ol>
      </div>

      {!mode && (
        <div className="rr-overlay">
          <div className="brief-card">
            <span className="brief-meta">{plant.when}</span>
            <h2>{plant.scenarioTitle}</h2>
            <p>{plant.hook}</p>
            <div className="brief-cta">
              <button className="btn primary" onClick={() => start('watch')}>{plant.id === 'rooppur' ? 'Run the scenario' : 'Watch history unfold'}</button>
              <button className="btn ghost" onClick={() => start('control')}>{plant.id === 'rooppur' ? 'Operate it yourself' : 'Take the controls'}</button>
            </div>
            <p className="hint">A lumped teaching model: right mechanisms and orders of magnitude, not a licensing code.</p>
          </div>
        </div>
      )}
      {mode && ended && (
        <div className="rr-overlay">
          <div className="brief-card">
            <span className="brief-meta">After {hms(s.t)}</span>
            <h2>{s.destroyed ? 'The reactor was destroyed' : s.damage > 0.05 ? `${num(s.damage * 100)} % of the core melted` : 'The core survived'}</h2>
            <p>{s.destroyed ? 'A prompt critical excursion released the energy of the core in seconds.' : s.damage > 0.05 ? `Decay heat outran cooling. ${num(s.h2)} kg of hydrogen was produced by the hot cladding.` : 'Fuel stayed below the temperature where cladding fails.'}</p>
            <div className="brief-cta">
              <button className="btn primary" onClick={() => start('control')}>{mode === 'control' ? 'Try again' : 'Now try to save it'}</button>
              <button className="btn ghost" onClick={() => start('watch')}>Watch history again</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
