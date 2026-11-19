import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { loadIndex, useRegion, type RegionIndexEntry } from './atlas/useRegion';
import { HoverTip } from './atlas/RegionPanels';
import FrequencyDial from '../components/FrequencyDial';
import SoundToggle from '../components/SoundToggle';
import { mw, num } from '../lib/format';
import { sfx } from '../lib/sfx';
import '../control.css';
import '../atlas.css';
import '../whatif.css';
import '../blackstart.css';

const SPEEDS = [0, 1, 4, 16];
const LABEL = ['Pause', '1×', '4×', '16×'];
const PAR = 20 * 60; // seconds of simulated time to beat for 90 % restored

export default function BlackStart() {
  const { id = 'dhaka' } = useParams();
  const nav = useNavigate();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [index, setIndex] = useState<RegionIndexEntry[]>([]);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [started, setStarted] = useState(false);
  const [won, setWon] = useState<number | null>(null);
  const r = useRegion(id, canvas, (s) => s.goDark());
  const { data, sim } = r;
  useEffect(() => {
    loadIndex().then(setIndex);
  }, []);
  useEffect(() => {
    r.speed.current = 0;
    setSpeedIdx(0);
    setStarted(false);
    setWon(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim]);
  const setSpeed = (i: number) => {
    setSpeedIdx(i);
    r.speed.current = SPEEDS[i];
  };
  const restored = sim ? sim.served / Math.max(1, sim.buses.reduce((a, b) => a + b.def.load * sim.loadScale, 0)) : 0;
  useEffect(() => {
    if (sim && started && won === null && restored >= 0.9) {
      setWon(sim.t);
      setSpeed(0);
      sfx.klaxon(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored]);

  const capable = sim ? sim.gens.map((g, i) => ({ g, i })).filter((x) => sim.canBlackStart(x.i) && !x.g.tripReason).sort((a, b) => b.g.def.mw - a.g.def.mw).slice(0, 8) : [];
  const pick = r.pick;
  const liveIsland = sim ? sim.buses.filter((b) => b.live).length : 0;

  return (
    <main id="main" className="control region whatif blackstart">
      <canvas ref={canvas} className="control-canvas" aria-label={data ? `${data.city} in total darkness` : 'Loading map'} />
      {!sim && <div className="loading" role="status">{r.error || r.loading}</div>}
      <header className="hud-top">
        <Link to="/" className="hud-back" aria-label="Home">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
        </Link>
        <div className="hud-title">
          <span className="hud-shift">Black start</span>
          <label className="wi-region">
            <span className="sr-only">Grid</span>
            <select value={id} onChange={(e) => nav(`/black-start/${e.target.value}`)}>
              {index.map((g) => <option key={g.id} value={g.id}>{g.city}</option>)}
            </select>
          </label>
        </div>
        <div className="speed" role="radiogroup" aria-label="Speed">
          {LABEL.map((l, i) => (
            <button key={l} role="radio" aria-checked={speedIdx === i} className={speedIdx === i ? 'on' : ''} onClick={() => setSpeed(i)} disabled={!started}>{l}</button>
          ))}
        </div>
        {sim && (
          <div className="hud-kpis">
            <div><span>Restored</span><strong className={restored < 0.5 ? 'bad' : ''}>{num(restored * 100)} %</strong></div>
            <div><span>Clock</span><strong>{Math.floor(sim.t / 60)} min {String(Math.floor(sim.t % 60)).padStart(2, '0')}</strong></div>
            <div><span>Par for 90 %</span><strong>{PAR / 60} min</strong></div>
          </div>
        )}
        <div className="hud-actions"><SoundToggle /></div>
      </header>
      {data && sim && (
        <>
          <aside className="hud-left wi-left">
            <div className="wi-panel">
              <h2>Restore {data.city}</h2>
              <ol className="bs-steps">
                <li className={sim.gens.some((g) => g.online) ? 'done' : ''}>Start a plant that can run without outside power.</li>
                <li className={liveIsland > 1 ? 'done' : ''}>Click a line next to it and close the breaker to energise the next substation.</li>
                <li className={sim.served > 1 ? 'done' : ''}>Click a live substation and pick up demand in small blocks. Watch the frequency.</li>
                <li className={sim.gens.filter((g) => g.online).length > 2 ? 'done' : ''}>Start bigger plants once their substation is live, and keep going.</li>
              </ol>
              <h3>Black-start capable</h3>
              <ul className="bs-plants">
                {capable.map(({ g, i }) => (
                  <li key={i}>
                    <span><b>{g.def.name}</b><em>{g.def.kind}, {num(g.def.mw)} MW</em></span>
                    <button className="btn ghost small" disabled={g.online} onClick={() => { sim.startGen(i); setStarted(true); setSpeed(speedIdx || 1); r.scene?.focus(g.def.x, g.def.z, data.extent * 0.25); sfx.clunk(); }}>{g.online ? 'Running' : 'Start'}</button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
          <aside className="hud-right">
            <div className="insp">
              <FrequencyDial f={sim.frequency} rocof={sim.rocof} trace={sim.trace.slice(-240).map((p) => p.f)} f0={sim.f0} />
              {!pick && <p className="hint">Click a substation, line or power station on the map.</p>}
              {pick?.kind === 'branch' && (() => {
                const br = sim.branches[pick.index];
                const liveEnd = sim.buses[br.def.a].live || sim.buses[br.def.b].live;
                return (
                  <div className="bs-act">
                    <h2>{sim.branchName(pick.index)}</h2>
                    <p className="hint">{br.def.kv} kV, {num(br.def.km)} km. {br.closed ? `Carrying ${num(Math.abs(br.P))} MW.` : liveEnd ? 'One end is live. Closing it energises the other end.' : 'Neither end is live yet.'}</p>
                    <button className="btn primary wide" onClick={() => { if (br.closed) sim.tripBranch(pick.index, 'opened by you', true); else sim.closeBranch(pick.index); sfx.clunk(); }}>{br.closed ? 'Open breaker' : 'Close breaker'}</button>
                  </div>
                );
              })()}
              {pick?.kind === 'bus' && (() => {
                const b = sim.buses[pick.index];
                return (
                  <div className="bs-act">
                    <h2>{b.def.name}</h2>
                    <p className="hint">{b.live ? `Live at ${b.V.toFixed(2)} pu. ${num(b.connected * 100)} % of its ${mw(b.def.load * sim.loadScale)} reconnected.` : 'Dead. Energise it through a line first.'}</p>
                    <div className="row2">
                      <button className="btn primary" disabled={!b.live || b.connected >= 1} onClick={() => { sim.connectBus(pick.index, 0.1); sfx.clunk(0.7); }}>Pick up 10 %</button>
                      <button className="btn ghost" disabled={!b.live || b.connected <= 0} onClick={() => sim.connectBus(pick.index, -0.1)}>Drop 10 %</button>
                    </div>
                  </div>
                );
              })()}
              {pick?.kind === 'plant' && (() => {
                const g = sim.gens[pick.index];
                const can = !g.online && (sim.buses[g.def.bus].live || sim.canBlackStart(pick.index)) && !g.tripReason;
                return (
                  <div className="bs-act">
                    <h2>{g.def.name}</h2>
                    <p className="hint">{g.def.kind}, {num(g.def.mw)} MW. {g.online ? `Running at ${num(g.p)} MW.` : g.tripReason ? `Unavailable: ${g.tripReason}.` : sim.buses[g.def.bus].live ? 'Its substation is live: it can synchronise.' : sim.canBlackStart(pick.index) ? 'Can black start.' : 'Needs a live substation before it can start.'}</p>
                    <button className="btn primary wide" disabled={!can} onClick={() => { sim.startGen(pick.index); setStarted(true); if (!speedIdx) setSpeed(1); sfx.clunk(); }}>Start</button>
                  </div>
                );
              })()}
            </div>
          </aside>
          <HoverTip sim={sim} hover={r.hover} />
          {!started && (
            <div className="overlay brief" role="dialog" aria-modal="true" aria-labelledby="bs-title">
              <div className="brief-card">
                <span className="brief-meta">Campaign</span>
                <h1 id="bs-title">{data.city} is dark</h1>
                <p>Every generator has tripped and every breaker is open. There is no grid to lean on. You have to build it back from a single plant that can start on its own.</p>
                <p>Get 90 % of demand back on supply. Beat {PAR / 60} minutes and you have done better than most real restorations manage in hours.</p>
                <div className="brief-cta"><button className="btn primary" onClick={() => { sfx.unlock(); setStarted(true); setSpeed(1); }} autoFocus>Begin</button></div>
              </div>
            </div>
          )}
          {won !== null && (
            <div className="overlay brief" role="dialog" aria-modal="true" aria-labelledby="bs-won">
              <div className="brief-card">
                <span className="brief-meta">Restored</span>
                <h1 id="bs-won">{data.city} has power</h1>
                <p>90 % of demand back on supply in {Math.floor(won / 60)} minutes {Math.floor(won % 60)} seconds{won <= PAR ? ', under par.' : '.'}</p>
                <div className="brief-cta"><button className="btn primary" onClick={() => r.restart()}>Try again</button><Link className="btn ghost" to="/black-start">Another city</Link></div>
              </div>
            </div>
          )}
          <p className="osm-credit">© OpenStreetMap contributors</p>
        </>
      )}
    </main>
  );
}
