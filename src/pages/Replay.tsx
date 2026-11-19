import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useRegion } from './atlas/useRegion';
import { HoverTip, Inspect, SystemStats } from './atlas/RegionPanels';
import FrequencyDial from '../components/FrequencyDial';
import Traces from '../components/Traces';
import SoundToggle from '../components/SoundToggle';
import CoPilot from '../components/CoPilot';
import Weather, { EVENT_WEATHER } from '../components/Weather';
import { markDone } from '../lib/career';
import { eventById, stageEvent, type BlackoutEvent } from '../grid/events';
import { mw, num } from '../lib/format';
import '../control.css';
import '../atlas.css';

const SPEEDS = [0, 0.25, 1, 4, 16, 60];
const SPEED_LABEL = ['Pause', '¼×', '1×', '4×', '16×', '60×'];

export default function Replay() {
  const { id = '' } = useParams();
  const ev = eventById(id);
  if (!ev) return <main id="main" className="page"><h1>Unknown event</h1><Link to="/blackouts">All blackouts</Link></main>;
  return <ReplayView key={ev.id} ev={ev} />;
}

function ReplayView({ ev }: { ev: BlackoutEvent }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<'watch' | 'control' | null>(null);
  const modeRef = useRef<'watch' | 'control'>('watch');
  const r = useRegion(ev.region, canvas, (s) => stageEvent(s, ev, modeRef.current));
  const { data, sim } = r;
  const [speedIdx, setSpeedIdx] = useState(0);
  const [about, setAbout] = useState(false);
  const setSpeed = (i: number) => {
    setSpeedIdx(i);
    r.speed.current = SPEEDS[i];
  };
  useEffect(() => {
    r.speed.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim]);
  const start = (m: 'watch' | 'control') => {
    modeRef.current = m;
    setMode(m);
    r.restart();
    window.setTimeout(() => setSpeed(ev.span > 600 ? 4 : 2), 50);
  };
  const t = sim?.t ?? 0;
  const done = sim ? t >= ev.span : false;
  useEffect(() => {
    if (done && speedIdx) setSpeed(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);
  useEffect(() => {
    if (!done || !sim || !mode) return;
    if (mode === 'watch') markDone(`watch:${ev.id}`);
    else if (sim.served > sim.demand * 0.9) markDone(`save:${ev.id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);
  const marks = useMemo(() => ev.steps.map((s) => ({ t: s.t, label: s.label })), [ev]);
  const nextStep = ev.steps.find((s) => s.t > t);
  const lastStep = [...ev.steps].reverse().find((s) => s.t <= t);
  const averted = new Set(sim?.log.filter((l) => l.text.startsWith('Averted: ')).map((l) => l.text.slice(9)) ?? []);

  return (
    <main id="main" className={`control region replay ${r.cine ? 'is-cine' : ''}`}>
      <canvas ref={canvas} className="control-canvas" aria-label={`Map of ${ev.where} during the replay`} />
      {EVENT_WEATHER[ev.id] && sim && <Weather kind={EVENT_WEATHER[ev.id]} />}
      {!sim && <div className="loading" role="status">{r.error || r.loading}</div>}
      {data && sim && (
        <>
          <header className="hud-top">
            <Link to="/blackouts" className="hud-back" aria-label="Back to all blackouts">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
            </Link>
            <div className="hud-title">
              <span className="hud-shift">{ev.date}, {ev.where}</span>
              <span className="hud-clock">{lastStep ? lastStep.clock : `T−${Math.max(0, Math.ceil((ev.steps[0]?.t ?? 0) - t))} s`}</span>
            </div>
            <div className="speed" role="radiogroup" aria-label="Replay speed">
              {SPEED_LABEL.map((l, i) => (
                <button key={l} role="radio" aria-checked={speedIdx === i} className={speedIdx === i ? 'on' : ''} onClick={() => setSpeed(i)} disabled={!mode}>
                  {i === 0 ? <svg viewBox="0 0 16 16" aria-label="Pause"><rect x="4" y="3" width="3" height="10" fill="currentColor" /><rect x="9" y="3" width="3" height="10" fill="currentColor" /></svg> : l}
                </button>
              ))}
            </div>
            <div className="hud-kpis">
              <div><span>Elapsed</span><strong>{num(t, 1)} s</strong></div>
              {SPEEDS[speedIdx] > 1 && r.achieved.current < SPEEDS[speedIdx] * 0.8 && <div><span>Achieved</span><strong>{num(r.achieved.current, 1)}×</strong></div>}
              <div><span>Peak demand lost</span><strong className={sim.peakLost > 50 ? 'bad' : ''}>{mw(sim.peakLost)}</strong></div>
              <div><span>Mode</span><strong>{mode === 'control' ? 'You have control' : 'Watching history'}</strong></div>
            </div>
            <div className="hud-actions">
              <SoundToggle />
              <button className="btn ghost small" onClick={() => setAbout(true)}>What happened</button>
            </div>
          </header>

          <aside className="hud-left">
            <FrequencyDial f={sim.frequency} rocof={sim.rocof} trace={sim.trace.slice(-240).map((p) => p.f)} f0={sim.f0} />
          </aside>

          <aside className="hud-right">
            {r.pick ? (
              <Inspect sim={sim} pick={r.pick} onClose={() => r.setPick(null)} interactive={mode === 'control'} />
            ) : (
              <div className="insp">
                <div className="insp-head"><div><h2>{ev.title}</h2><p>{ev.time}</p></div></div>
                <ol className="steps">
                  {ev.steps.map((s, i) => (
                    <li key={i} className={`${s.t <= t ? 'past' : ''} ${s === nextStep ? 'next' : ''} ${averted.has(s.label) ? 'averted' : ''} k-${s.kind}`}>
                      <time>{s.clock}</time>
                      <span>{s.label}</span>
                      {averted.has(s.label) && <em>Averted</em>}
                    </li>
                  ))}
                </ol>
                <SystemStats sim={sim} />
                {mode === 'control' && (
                  <>
                    <CoPilot sim={sim} tick={r.tick} />
                    <h3>Your levers</h3>
                    <div className="stress">
                      <button className="btn ghost" onClick={() => sim.shedLoad(0.05)}>Shed 5 % of demand now</button>
                      <button className="btn ghost" onClick={() => sim.setExt(sim.ext.sched + 200)} disabled={!sim.ext.online}>Ask for 200 MW more import</button>
                      <button className="btn ghost" onClick={() => {
                        const g = sim.gens.map((g, i) => ({ g, i })).filter((x) => !x.g.online && !x.g.tripReason && sim.buses[x.g.def.bus].live).sort((a, b) => b.g.def.mw - a.g.def.mw)[0];
                        if (g) sim.startGen(g.i);
                      }}>Start the largest reserve plant</button>
                      <button className="btn ghost" onClick={() => sim.restoreLoad(0.1)}>Restore 10 % of shed demand</button>
                    </div>
                    <p className="hint">Click any line to open or close it, any plant to start or trip it.</p>
                  </>
                )}
              </div>
            )}
          </aside>

          <section className="hud-bottom replay-bottom">
            <Traces trace={sim.trace} f0={sim.f0} tick={r.tick} marks={marks} />
          </section>

          <HoverTip sim={sim} hover={r.hover} />

          <div className="letterbox" aria-hidden={!r.cine}>
            <i className="lb-top" />
            <i className="lb-bottom" />
            {r.cine && (
              <div className={`cine cine-${r.cine.severity}`} role="alert">
                <span className="cine-time">{lastStep?.clock ?? ''}</span>
                <h2>{r.cine.title}</h2>
                <p>{r.cine.detail}</p>
              </div>
            )}
          </div>

          {!mode && (
            <div className="overlay brief" role="dialog" aria-modal="true" aria-labelledby="ev-title">
              <div className="brief-card">
                <span className="brief-meta">{ev.date}, {ev.time}, {ev.where}</span>
                <h1 id="ev-title">{ev.title}</h1>
                <p className="ev-hook">{ev.hook}</p>
                {ev.summary.slice(0, 2).map((p, i) => <p key={i}>{p}</p>)}
                <div className="ev-facts">
                  <div><span>People affected</span><strong>{ev.people}</strong></div>
                  <div><span>Duration</span><strong>{ev.duration}</strong></div>
                </div>
                <div className="brief-cta">
                  <button className="btn primary" onClick={() => start('watch')} autoFocus>Watch it happen</button>
                  <button className="btn ghost" onClick={() => start('control')}>Take control and try to stop it</button>
                </div>
                <p className="hint">Reconstruction on a reduced OpenStreetMap model ({data.scope}). Timings and magnitudes are approximate.</p>
              </div>
            </div>
          )}

          {mode && done && (
            <div className="overlay brief" role="dialog" aria-modal="true" aria-labelledby="end-title">
              <div className="brief-card">
                <span className="brief-meta">{mode === 'control' ? 'Your attempt' : 'Replay complete'}</span>
                <h1 id="end-title">{sim.served > sim.demand * 0.9 ? 'The lights stayed on' : sim.served < sim.demand * 0.1 ? 'Total blackout' : 'Partial blackout'}</h1>
                <div className="ev-facts">
                  <div><span>Peak demand lost</span><strong>{mw(sim.peakLost)}</strong></div>
                  <div><span>Served at the end</span><strong>{num((100 * sim.served) / Math.max(1, sim.demand))} %</strong></div>
                  <div><span>Historically</span><strong>{ev.people}</strong></div>
                </div>
                <div className="brief-cta">
                  <button className="btn primary" onClick={() => start(mode === 'control' ? 'control' : 'control')}>{mode === 'control' ? 'Try again' : 'Now try to stop it'}</button>
                  <button className="btn ghost" onClick={() => setAbout(true)}>What happened</button>
                  <Link className="btn ghost" to="/blackouts">All blackouts</Link>
                </div>
              </div>
            </div>
          )}

          {about && (
            <div className="overlay brief" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={(e) => e.target === e.currentTarget && setAbout(false)}>
              <div className="brief-card about-ev">
                <span className="brief-meta">{ev.date}, {ev.time}</span>
                <h1 id="about-title">{ev.title}</h1>
                {ev.summary.map((p, i) => <p key={i}>{p}</p>)}
                <h2>Causes</h2>
                <ul>{ev.causes.map((c, i) => <li key={i}>{c}</li>)}</ul>
                <h2>What changed afterwards</h2>
                <ul>{ev.lessons.map((c, i) => <li key={i}>{c}</li>)}</ul>
                <h2>Sources</h2>
                <ul className="sources">{ev.sources.map((c, i) => <li key={i}>{c}</li>)}</ul>
                <div className="brief-cta"><button className="btn primary" onClick={() => setAbout(false)} autoFocus>Back to the replay</button><Link className="btn ghost" to={`/academy/${ev.id}`}>Read the full case file</Link></div>
              </div>
            </div>
          )}
          <p className="osm-credit">© OpenStreetMap contributors</p>
        </>
      )}
    </main>
  );
}
