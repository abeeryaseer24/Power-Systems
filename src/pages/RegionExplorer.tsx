import { useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useRegion } from './atlas/useRegion';
import { HoverTip, Inspect, SystemStats } from './atlas/RegionPanels';
import FrequencyDial from '../components/FrequencyDial';
import { eventsFor } from '../grid/events';
import { clock } from '../lib/format';
import '../control.css';
import '../atlas.css';

export default function RegionExplorer() {
  const { id = 'dhaka' } = useParams();
  const canvas = useRef<HTMLCanvasElement>(null);
  const r = useRegion(id, canvas);
  const { data, sim } = r;
  const evs = eventsFor(id);
  const stress = (fn: () => void) => {
    fn();
    r.setPick(null);
  };
  return (
    <main id="main" className={`control region ${r.cine ? 'is-cine' : ''}`}>
      <canvas ref={canvas} className="control-canvas" aria-label={data ? `Night map of the ${data.city} transmission grid` : 'Loading map'} />
      {!data && <div className="loading" role="status">{r.error || 'Loading the grid…'}</div>}
      {data && sim && (
        <>
          <header className="hud-top">
            <Link to="/atlas" className="hud-back" aria-label="Back to the atlas">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
            </Link>
            <div className="hud-title">
              <span className="hud-shift">{data.country}</span>
              <span className="hud-clock">{data.city}</span>
            </div>
            <p className="region-scope">{data.scope}. {data.buses.length} buses, {data.branches.length} branches, {data.plants.length} power stations.</p>
          </header>
          <aside className="hud-left">
            <FrequencyDial f={sim.frequency} rocof={sim.rocof} trace={sim.trace.slice(-240).map((p) => p.f)} f0={sim.f0} />
          </aside>
          <aside className="hud-right">
            {r.pick ? (
              <Inspect sim={sim} pick={r.pick} onClose={() => r.setPick(null)} interactive />
            ) : (
              <div className="insp">
                <div className="insp-head"><div><h2>Live system</h2><p>Click a substation, line or power station to inspect it.</p></div></div>
                <SystemStats sim={sim} />
                <h3>Break something</h3>
                <div className="stress">
                  <button className="btn ghost" onClick={() => stress(() => {
                    const g = sim.gens.map((g, i) => ({ g, i })).filter((x) => x.g.online).sort((a, b) => b.g.p - a.g.p)[0];
                    if (g) sim.tripGen(g.i, 'tripped by you');
                  })}>Trip the largest plant</button>
                  <button className="btn ghost" onClick={() => stress(() => {
                    const b = sim.branches.map((b, i) => ({ b, i })).filter((x) => x.b.closed && !x.b.ext).sort((a, b) => Math.abs(b.b.P) - Math.abs(a.b.P))[0];
                    if (b) sim.tripBranch(b.i, 'opened by you');
                  })}>Open the busiest line</button>
                  <button className="btn ghost" onClick={() => stress(() => sim.tripExt('disconnected by you'))}>Cut the link to {data.ext.name.split(' (')[0]}</button>
                  <button className="btn ghost" onClick={() => stress(() => { sim.loadScale *= 1.15; })}>Add 15 % demand</button>
                  <button className="btn primary" onClick={r.restart}>Reset the grid</button>
                </div>
                {evs.length > 0 && (
                  <>
                    <h3>Blackouts here</h3>
                    <ul className="ev-mini">
                      {evs.map((e) => (
                        <li key={e.id}><Link to={`/blackouts/${e.id}`}><b>{e.date}</b><span>{e.title}</span></Link></li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </aside>
          <HoverTip sim={sim} hover={r.hover} />
          <div className="letterbox" aria-hidden={!r.cine}>
            <i className="lb-top" />
            <i className="lb-bottom" />
            {r.cine && (
              <div className={`cine cine-${r.cine.severity}`} role="alert">
                <span className="cine-time">T+{clock(r.cine.t / 3600, true).slice(3)}</span>
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
