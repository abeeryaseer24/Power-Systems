import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Slider } from './learn/kit';
import '../nuclear.css';

export default function Instrumentation() {
  return (
    <main id="main" className="page nuclear inst">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/nuclear">Nuclear</Link> <span aria-hidden="true">/</span> Instrumentation and control</nav>
      <article className="lesson prose">
        <h1>The electronics that keep a reactor honest</h1>
        <p className="lede">A reactor is controlled through its instruments. Three pieces of electrical engineering decide whether it starts up, stays safe and joins the grid cleanly.</p>

        <h2>Seeing neutrons across ten decades</h2>
        <p>Between a shut-down core and full power, the neutron population changes by a factor of about ten billion. No single detector covers that range, so reactors use three overlapping sets: pulse-counting proportional counters at the bottom, compensated ion chambers in the middle, and current-mode ion chambers at power. The protection system hands over from one range to the next as power rises.</p>
        <Detectors />

        <h2>Two out of four</h2>
        <p>Each trip parameter is measured by four independent channels, each in its own room with its own power supply. The reactor trips when any two agree. One failed channel can neither trip the plant on its own nor stop a real trip, and one channel can be taken out for testing while the other three vote two out of three.</p>
        <Voting />

        <h2>Joining the grid</h2>
        <p>Before the generator breaker closes, the machine must match the grid in voltage, frequency and phase angle. Close it out of phase and the grid wrenches the rotor into step in a fraction of a second, with currents several times rated and a torque that can crack a shaft. Operators watch a synchroscope, whose pointer turns at the slip frequency, and close as it passes twelve o’clock slowly.</p>
        <Synchroscope />
      </article>
    </main>
  );
}

function Detectors() {
  const [logP, setLogP] = useState(-6);
  const P = Math.pow(10, logP);
  const ranges = [
    { name: 'Source range', note: 'BF₃ proportional counters, pulses', lo: -9, hi: -4, cls: 'sr' },
    { name: 'Intermediate range', note: 'Compensated ion chambers, current', lo: -8, hi: -1.5, cls: 'ir' },
    { name: 'Power range', note: 'Uncompensated ion chambers, current', lo: -2.3, hi: 0.08, cls: 'pr' },
  ];
  const X = (l: number) => ((l + 9.5) / 10) * 100;
  return (
    <div className="widget">
      <div className="w-controls">
        <Slider label="Reactor power" value={logP} min={-9.3} max={0.08} step={0.01} unit="" fmt={(v) => (v > -2 ? `${(Math.pow(10, v) * 100).toFixed(v > -1 ? 0 : 1)} %` : `10^${v.toFixed(1)} of rated`)} onChange={setLogP} />
      </div>
      <div className="det">
        {ranges.map((r) => {
          const on = logP >= r.lo && logP <= r.hi;
          return (
            <div key={r.name} className={`det-row ${on ? 'on' : ''}`}>
              <span className="det-name">{r.name}<em>{r.note}</em></span>
              <div className="det-track">
                <i className={`det-band ${r.cls}`} style={{ left: `${X(r.lo)}%`, width: `${X(r.hi) - X(r.lo)}%` }} />
                <b style={{ left: `${X(logP)}%` }} />
              </div>
            </div>
          );
        })}
        <div className="det-axis">{[-9, -7, -5, -3, -1, 0].map((l) => <span key={l} style={{ left: `${X(l)}%` }}>{l === 0 ? '100 %' : `10${l < 0 ? '⁻' : ''}${String(Math.abs(l)).split('').map((d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]).join('')}`}</span>)}</div>
      </div>
      <p className="hint">{P < 1e-5 ? 'Only the source range sees anything. Its high voltage is removed once the intermediate range is on scale, or the counters would be damaged.' : P < 1e-2 ? 'The intermediate range carries the reactor through ten thousand-fold power increases. Its period meter is what the operators watch during startup.' : 'The power range drives the overpower trip at 109–118 % and feeds the automatic rod control.'}</p>
    </div>
  );
}

function Voting() {
  const [process, setProcess] = useState(15.5);
  const [failed, setFailed] = useState<number | null>(null);
  const [bypass, setBypass] = useState<number | null>(null);
  const set = 16.4;
  const chans = [0, 1, 2, 3].map((i) => {
    const reading = failed === i ? 0 : process + (i - 1.5) * 0.03;
    return { i, reading, tripped: bypass !== i && reading > set, bypassed: bypass === i };
  });
  const active = chans.filter((c) => !c.bypassed);
  const votes = active.filter((c) => c.tripped).length;
  const need = 2;
  const trip = votes >= need;
  return (
    <div className="widget">
      <div className="w-controls">
        <Slider label="Reactor pressure" value={process} min={15} max={17} step={0.05} unit="MPa" fmt={(v) => v.toFixed(2)} onChange={setProcess} />
        <div className="w-buttons">
          <button className={`chip ${failed === 1 ? 'on' : ''}`} onClick={() => setFailed(failed === 1 ? null : 1)}>Fail channel B low</button>
          <button className={`chip ${bypass === 2 ? 'on' : ''}`} onClick={() => setBypass(bypass === 2 ? null : 2)}>Bypass channel C for test</button>
        </div>
      </div>
      <div className="vote">
        {chans.map((c) => (
          <div key={c.i} className={`vch ${c.tripped ? 'tr' : ''} ${c.bypassed ? 'by' : ''} ${failed === c.i ? 'fail' : ''}`}>
            <span className="vch-n">Channel {'ABCD'[c.i]}</span>
            <strong>{c.reading.toFixed(2)}</strong>
            <em>{c.bypassed ? 'Bypassed' : c.tripped ? 'Trip' : failed === c.i ? 'Failed low' : 'Normal'}</em>
          </div>
        ))}
        <div className={`vlogic ${trip ? 'tr' : ''}`}>
          <span>{votes} of {active.length} voting trip</span>
          <strong>{trip ? 'Reactor trip breakers open' : 'No trip'}</strong>
          <em>Setpoint {set} MPa, logic {need} out of {active.length}</em>
        </div>
      </div>
    </div>
  );
}

function Synchroscope() {
  const [fGen, setFGen] = useState(50.4);
  const [vGen, setVGen] = useState(0.97);
  const [result, setResult] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const angle = useRef(0);
  const [, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!closed) angle.current = (angle.current + (fGen - 50) * 360 * dt) % 360;
      setT((x) => x + 1);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fGen, closed]);
  const a = ((angle.current % 360) + 540) % 360 - 180;
  const close = () => {
    const slip = Math.abs(fGen - 50);
    const dv = Math.abs(vGen - 1);
    const ang = Math.abs(a);
    const surge = Math.sqrt(dv * dv + (2 * Math.sin((ang * Math.PI) / 360)) ** 2) / 0.2; // per-unit current, x'' = 0.2
    setClosed(true);
    if (ang < 10 && slip < 0.15 && dv < 0.05) setResult(`Clean synchronisation. Inrush ${surge.toFixed(2)} pu, the machine picks up load smoothly.`);
    else setResult(`Out of phase by ${ang.toFixed(0)}°. A surge of about ${surge.toFixed(1)} times rated current hammers the stator windings and the shaft.`);
  };
  return (
    <div className="widget">
      <div className="w-controls">
        <Slider label="Generator frequency" value={fGen} min={49.5} max={50.5} step={0.01} unit="Hz" fmt={(v) => v.toFixed(2)} onChange={(v) => { setFGen(v); setClosed(false); setResult(null); }} />
        <Slider label="Generator voltage" value={vGen} min={0.9} max={1.1} step={0.005} unit="pu" fmt={(v) => v.toFixed(3)} onChange={(v) => { setVGen(v); setClosed(false); setResult(null); }} />
      </div>
      <div className="sync">
        <svg viewBox="0 0 200 200" className="sync-dial" role="img" aria-label={`Synchroscope, phase difference ${a.toFixed(0)} degrees`}>
          <circle cx="100" cy="100" r="86" className="sd-face" />
          <path d="M 100 14 L 100 30" className="sd-mark" />
          <text x="40" y="190" className="sd-t">Slow</text><text x="160" y="190" className="sd-t">Fast</text>
          <line x1="100" y1="100" x2={100 + 72 * Math.sin((a * Math.PI) / 180)} y2={100 - 72 * Math.cos((a * Math.PI) / 180)} className={`sd-needle ${Math.abs(a) < 10 ? 'ok' : ''}`} />
          <circle cx="100" cy="100" r="6" className="sd-hub" />
        </svg>
        <div className="sync-read">
          <div><span>Slip</span><strong>{(fGen - 50 >= 0 ? '+' : '−') + Math.abs(fGen - 50).toFixed(2)} Hz</strong></div>
          <div><span>Voltage difference</span><strong>{((vGen - 1) * 100).toFixed(1)} %</strong></div>
          <div><span>Phase angle</span><strong>{a.toFixed(0)}°</strong></div>
          <button className="btn primary" onClick={close} disabled={closed}>Close the generator breaker</button>
          {result && <p className={`hint ${result.startsWith('Clean') ? '' : 'bad'}`}>{result}</p>}
        </div>
      </div>
    </div>
  );
}
