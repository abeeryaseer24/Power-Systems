import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { loadIndex, useRegion, type RegionIndexEntry } from './atlas/useRegion';
import { HoverTip, Inspect } from './atlas/RegionPanels';
import FrequencyDial from '../components/FrequencyDial';
import Traces from '../components/Traces';
import SoundToggle from '../components/SoundToggle';
import { whatIfsFor } from '../grid/whatif';
import { mw, num } from '../lib/format';
import '../control.css';
import '../atlas.css';
import '../whatif.css';

export default function WhatIf() {
  const { id = 'dhaka' } = useParams();
  const nav = useNavigate();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [index, setIndex] = useState<RegionIndexEntry[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const pickedRef = useRef<string[]>([]);
  const [running, setRunning] = useState(false);
  const options = whatIfsFor(id);
  const r = useRegion(id, canvas, (s) => {
    for (const w of options) if (pickedRef.current.includes(w.id)) w.apply(s);
  });
  const { data, sim } = r;
  useEffect(() => {
    loadIndex().then(setIndex);
  }, []);
  useEffect(() => {
    setPicked([]);
    pickedRef.current = [];
    setRunning(false);
  }, [id]);
  useEffect(() => {
    r.speed.current = 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim]);
  const toggle = (wid: string) => setPicked((p) => (p.includes(wid) ? p.filter((x) => x !== wid) : [...p, wid]));
  const run = () => {
    pickedRef.current = picked;
    setRunning(picked.length > 0);
    r.restart();
  };
  const fMin = sim ? Math.min(...sim.trace.filter((t) => t.f > 0).map((t) => t.f), sim.f0) : 0;
  const vMin = sim ? Math.min(...sim.trace.map((t) => t.vMin), 1.2) : 0;

  return (
    <main id="main" className={`control region whatif ${r.cine ? 'is-cine' : ''}`}>
      <canvas ref={canvas} className="control-canvas" aria-label={data ? `Night map of ${data.city}` : 'Loading map'} />
      {!data && <div className="loading" role="status">{r.error || 'Loading the grid…'}</div>}
      <header className="hud-top">
        <Link to="/atlas" className="hud-back" aria-label="Back to the atlas">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
        </Link>
        <div className="hud-title">
          <span className="hud-shift">What if</span>
          <label className="wi-region">
            <span className="sr-only">Grid</span>
            <select value={id} onChange={(e) => nav(`/what-if/${e.target.value}`)}>
              {index.map((g) => <option key={g.id} value={g.id}>{g.city}</option>)}
            </select>
          </label>
        </div>
        <div className="hud-actions" style={{ marginLeft: 'auto' }}><SoundToggle /></div>
      </header>
      {data && sim && (
        <>
          <aside className="hud-left wi-left">
            <div className="wi-panel">
              <h2>Stack your scenarios</h2>
              <p className="hint">Pick one or more, then run them on the live {data.city} grid.</p>
              <ul className="wi-list">
                {options.map((w) => (
                  <li key={w.id}>
                    <label className={picked.includes(w.id) ? 'on' : ''}>
                      <input type="checkbox" checked={picked.includes(w.id)} onChange={() => toggle(w.id)} />
                      <span><b>{w.title}</b><em>{w.blurb}</em></span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="wi-cta">
                <button className="btn primary" onClick={run} disabled={!picked.length}>Run it</button>
                <button className="btn ghost" onClick={() => { setPicked([]); pickedRef.current = []; setRunning(false); r.restart(); }}>Reset</button>
              </div>
            </div>
          </aside>
          <aside className="hud-right">
            {r.pick ? (
              <Inspect sim={sim} pick={r.pick} onClose={() => r.setPick(null)} interactive />
            ) : (
              <div className="insp">
                <div className="insp-head"><div><h2>{running ? 'Your scenario' : 'Normal operation'}</h2><p>{running ? `${picked.length} change${picked.length > 1 ? 's' : ''} stacked, ${num(sim.t, 0)} s in` : 'Choose scenarios on the left'}</p></div></div>
                <FrequencyDial f={sim.frequency} rocof={sim.rocof} trace={sim.trace.slice(-240).map((p) => p.f)} f0={sim.f0} />
                <dl className="facts">
                  <div><dt>Demand served</dt><dd className={sim.served < sim.demand * 0.97 ? 'bad' : ''}>{num((100 * sim.served) / Math.max(1, sim.demand))} %</dd></div>
                  <div><dt>Peak demand lost</dt><dd className={sim.peakLost > 50 ? 'bad' : ''}>{mw(sim.peakLost)}</dd></div>
                  <div><dt>Lowest frequency</dt><dd>{fMin.toFixed(2)} Hz</dd></div>
                  <div><dt>Lowest voltage</dt><dd>{vMin.toFixed(2)} pu</dd></div>
                  <div><dt>Islands</dt><dd>{sim.islands.members.filter((m) => m.length > 1 && sim.buses[m[0]].live).length}</dd></div>
                  <div><dt>Plants tripped</dt><dd>{sim.gens.filter((g) => g.tripReason && g.tripReason !== 'out of service' && !g.tripReason.startsWith('not connected')).length}</dd></div>
                </dl>
                <p className="hint">{sim.served < sim.demand * 0.1 ? 'Total blackout. The grid could not survive this combination.' : sim.peakLost > 50 ? 'The grid survived, but only by cutting customers off.' : running ? 'The grid rode it out with no customers lost.' : ''}</p>
              </div>
            )}
          </aside>
          <section className="hud-bottom replay-bottom">
            <Traces trace={sim.trace} f0={sim.f0} tick={r.tick} />
          </section>
          <HoverTip sim={sim} hover={r.hover} />
          <div className="letterbox" aria-hidden={!r.cine}>
            <i className="lb-top" />
            <i className="lb-bottom" />
            {r.cine && (
              <div className={`cine cine-${r.cine.severity}`} role="alert">
                <h2>{r.cine.title}</h2>
                <p>{r.cine.detail}</p>
              </div>
            )}
          </div>
          <p className="osm-credit">© OpenStreetMap contributors</p>
        </>
      )}
    </main>
  );
}
