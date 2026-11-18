import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadIndex, type RegionIndexEntry } from './atlas/useRegion';
import { EVENTS } from '../grid/events';
import { num } from '../lib/format';
import '../atlas.css';

const W = 1000;
const H = 500;
const X = (lon: number) => ((lon + 180) / 360) * W;
const Y = (lat: number) => ((90 - lat) / 180) * H;

export default function Atlas() {
  const [index, setIndex] = useState<RegionIndexEntry[]>([]);
  const [land, setLand] = useState<[number, number][][]>([]);
  const [hot, setHot] = useState<string | null>(null);
  useEffect(() => {
    loadIndex().then(setIndex);
    fetch('/data/world.json').then((r) => r.json()).then(setLand).catch(() => {});
  }, []);
  const totals = index.reduce((a, r) => ({ buses: a.buses + r.buses, branches: a.branches + r.branches, gw: a.gw + r.genMW / 1000 }), { buses: 0, branches: 0, gw: 0 });
  return (
    <main id="main" className="page atlas">
      <div className="page-head">
        <h1>The atlas of real grids</h1>
        <p>Ten transmission systems rebuilt from OpenStreetMap, from the national grid of Bangladesh to the 345 kV ring around New York. Each one runs live: AC power flow, frequency, protection and all.</p>
      </div>
      <figure className="worldmap">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="World map of the modelled grids">
          <defs>
            <pattern id="dots" width="5" height="5" patternUnits="userSpaceOnUse">
              <circle cx="2.5" cy="2.5" r="1" className="wm-dot" />
            </pattern>
            <radialGradient id="glow">
              <stop offset="0" stopColor="#ffb04d" stopOpacity="0.9" />
              <stop offset="1" stopColor="#ffb04d" stopOpacity="0" />
            </radialGradient>
          </defs>
          {land.map((p, i) => (
            <path key={i} d={`M${p.map(([lo, la]) => `${X(lo).toFixed(1)},${Y(la).toFixed(1)}`).join('L')}Z`} fill="url(#dots)" className="wm-land" />
          ))}
          {index.map((r) => (
            <Link key={r.id} to={`/atlas/${r.id}`} onMouseEnter={() => setHot(r.id)} onMouseLeave={() => setHot(null)} onFocus={() => setHot(r.id)} onBlur={() => setHot(null)} aria-label={`${r.city}, ${r.country}`}>
              <g transform={`translate(${X(r.center[1])} ${Y(r.center[0])})`} className={`wm-city ${hot === r.id ? 'on' : ''}`}>
                <circle r={hot === r.id ? 26 : 16} fill="url(#glow)" className="wm-halo" />
                <circle r="3.2" className="wm-core" />
                <text x="8" y="-8" className="wm-label">{r.city}</text>
              </g>
            </Link>
          ))}
        </svg>
      </figure>
      <div className="atlas-totals" aria-label="Totals">
        <div><strong>{index.length}</strong><span>grids modelled</span></div>
        <div><strong>{num(totals.buses)}</strong><span>substations and junctions</span></div>
        <div><strong>{num(totals.branches)}</strong><span>transmission branches</span></div>
        <div><strong>{num(totals.gw)} GW</strong><span>of mapped power stations</span></div>
        <div><strong>{EVENTS.length}</strong><span>historical blackouts to replay</span></div>
      </div>
      <ol className="region-list">
        {index.map((r) => {
          const evs = EVENTS.filter((e) => e.region === r.id);
          return (
            <li key={r.id} onMouseEnter={() => setHot(r.id)} onMouseLeave={() => setHot(null)}>
              <Link to={`/atlas/${r.id}`} className="rl-main">
                <span className="rl-city">{r.city}</span>
                <span className="rl-scope">{r.scope}</span>
              </Link>
              <span className="rl-stat"><b>{r.buses}</b> buses</span>
              <span className="rl-stat"><b>{r.branches}</b> branches</span>
              <span className="rl-stat"><b>{num(r.genMW / 1000, 1)}</b> GW mapped</span>
              <span className="rl-stat"><b>{r.freq}</b> Hz</span>
              <span className="rl-events">
                {evs.map((e) => (
                  <Link key={e.id} to={`/blackouts/${e.id}`} className="rl-ev">{e.date.slice(-4)}</Link>
                ))}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="muted small">Network data © OpenStreetMap contributors, ODbL. Line impedances and ratings are estimated from voltage level and route length; see each region for its assumptions.</p>
    </main>
  );
}
