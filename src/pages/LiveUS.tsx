import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { markDone } from '../lib/career';
import '../live.css';

// Hourly data from the U.S. EIA, fetched through /api/eia so the key stays on the server.
const AREAS: [string, string][] = [
  ['ERCO', 'ERCOT (Texas)'], ['CISO', 'California ISO'], ['PJM', 'PJM (Mid-Atlantic)'], ['MISO', 'MISO (Midwest)'],
  ['NYIS', 'New York ISO'], ['ISNE', 'ISO New England'], ['SWPP', 'Southwest Power Pool'], ['BPAT', 'Bonneville (Northwest)'],
];
const FUEL_COLOR: Record<string, string> = {
  NG: '#ffb04d', COL: '#8b6b5a', NUC: '#c9b8ff', WND: '#86c5da', SUN: '#ffd27a', WAT: '#4f8fc0', OIL: '#ff5b4f', OTH: '#8b9ab0', BAT: '#7cf0b4', PS: '#3d6f99', SNB: '#e6c45a',
};
interface Row { period: string; type: string; name: string; value: number | null }

async function get(respondent: string, kind: 'region' | 'fuel') {
  const r = await fetch(`/api/eia?respondent=${respondent}&kind=${kind}`);
  if (!(r.headers.get('content-type') ?? '').includes('json')) throw new Error('the data proxy is not running here');
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return (j.rows ?? []) as Row[];
}
const toDate = (p: string) => new Date(`${p.length === 13 ? p + ':00' : p}Z`);

export default function LiveUS() {
  useEffect(() => markDone('visit:live'), []);
  const [area, setArea] = useState('ERCO');
  const [region, setRegion] = useState<Row[]>([]);
  const [fuel, setFuel] = useState<Row[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr('');
    Promise.all([get(area, 'region'), get(area, 'fuel')])
      .then(([r, f]) => alive && (setRegion(r), setFuel(f)))
      .catch((e) => alive && setErr(String(e.message ?? e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [area]);

  const series = (t: string) => region.filter((r) => r.type === t && r.value !== null).map((r) => ({ t: toDate(r.period).getTime(), v: r.value! })).sort((a, b) => a.t - b.t);
  const D = series('D');
  const DF = series('DF');
  const NG = series('NG');
  const TI = series('TI');
  const latest = D[D.length - 1];
  const lastHour = fuel.length ? fuel.reduce((a, r) => (r.period > a ? r.period : a), fuel[0].period) : '';
  const mix = fuel.filter((r) => r.period === lastHour && (r.value ?? 0) > 0).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const mixTotal = mix.reduce((a, r) => a + (r.value ?? 0), 0);
  const clean = mix.filter((r) => ['NUC', 'WND', 'SUN', 'WAT'].includes(r.type)).reduce((a, r) => a + (r.value ?? 0), 0);

  const W = 860;
  const H = 240;
  const all = [...D, ...DF];
  const t0 = all.length ? Math.min(...all.map((p) => p.t)) : 0;
  const t1 = all.length ? Math.max(...all.map((p) => p.t)) : 1;
  const vMax = all.length ? Math.max(...all.map((p) => p.v)) * 1.05 : 1;
  const vMin = all.length ? Math.min(...all.map((p) => p.v)) * 0.9 : 0;
  const X = (t: number) => 50 + ((t - t0) / Math.max(1, t1 - t0)) * (W - 60);
  const Y = (v: number) => 10 + (1 - (v - vMin) / Math.max(1, vMax - vMin)) * (H - 34);
  const line = (s: { t: number; v: number }[]) => s.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
  const days = all.length ? Array.from({ length: Math.floor((t1 - t0) / 864e5) + 1 }, (_, k) => t0 + k * 864e5) : [];

  return (
    <main id="main" className="page live">
      <nav className="lv-tabs" aria-label="Country"><Link to="/live">Great Britain</Link><Link to="/live/us" className="on">United States</Link></nav>
      <div className="page-head">
        <h1>The United States, hour by hour</h1>
        <p>Demand, forecast and generation mix for the big American grid operators, from the U.S. Energy Information Administration. Hourly data, usually an hour or two behind real time.</p>
        <label className="lv-pick">Grid operator
          <select value={area} onChange={(e) => setArea(e.target.value)}>
            {AREAS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        {err && <p className="hint bad">{err.includes('not configured') ? 'The EIA key is not set on the server yet.' : `The EIA feed could not be reached (${err}).`} {location.hostname === 'localhost' ? 'This feed only works on the deployed site, where the key lives.' : ''}</p>}
        {loading && !err && <p className="hint">Fetching from EIA…</p>}
      </div>

      {latest && (
        <section className="lv-top lv-top-us">
          <div className="lv-kpis">
            <div><span>Demand</span><strong>{(latest.v / 1000).toFixed(1)} GW</strong><em>{new Date(latest.t).toUTCString().slice(17, 22)} UTC, {new Date(latest.t).toUTCString().slice(5, 11)}</em></div>
            <div><span>Peak in this window</span><strong>{(Math.max(...D.map((p) => p.v)) / 1000).toFixed(1)} GW</strong><em>last {Math.round((t1 - t0) / 864e5)} days</em></div>
            <div><span>Net interchange</span><strong>{TI.length ? `${(TI[TI.length - 1].v / 1000).toFixed(1)} GW` : '…'}</strong><em>{TI.length && TI[TI.length - 1].v < 0 ? 'importing' : 'exporting'}</em></div>
            <div><span>Clean share</span><strong>{mixTotal ? Math.round((clean / mixTotal) * 100) : 0} %</strong><em>nuclear, wind, solar, hydro</em></div>
          </div>
        </section>
      )}

      {D.length > 0 && (
        <section className="lv-panel">
          <h2>Demand against the day-ahead forecast</h2>
          <p className="hint">The dashed line is what the operator expected the day before. When the solid line runs above it, operators are calling on reserves.</p>
          <svg viewBox={`0 0 ${W} ${H}`} className="lv-svg" role="img" aria-label="Demand and forecast">
            {[0.25, 0.5, 0.75].map((k) => { const v = vMin + k * (vMax - vMin); return <g key={k}><line x1="50" x2={W - 10} y1={Y(v)} y2={Y(v)} className="lv-grid" /><text x="44" y={Y(v) + 4} className="lv-ax" textAnchor="end">{Math.round(v / 1000)} GW</text></g>; })}
            {days.map((d) => <text key={d} x={X(d)} y={H - 6} className="lv-ax">{new Date(d).toUTCString().slice(5, 11)}</text>)}
            <path d={line(DF)} className="lv-fc" />
            <path d={line(D)} className="lv-d" />
            {NG.length > 0 && <path d={line(NG)} className="lv-ng" />}
          </svg>
          <ul className="lv-legend lv-legend-inline">
            <li><i style={{ background: 'var(--glaze, #86c5da)' }} />Demand</li>
            <li><i className="lv-dash" />Day-ahead forecast</li>
            <li><i style={{ background: 'rgba(255,176,77,0.7)' }} />Net generation</li>
          </ul>
        </section>
      )}

      {mix.length > 0 && (
        <section className="lv-panel">
          <h2>Generation mix, {toDate(lastHour).toUTCString().slice(5, 22)} UTC</h2>
          <div className="lv-mix" role="img" aria-label="Generation mix">
            {mix.map((r) => <i key={r.type} style={{ flexGrow: r.value ?? 0, background: FUEL_COLOR[r.type] ?? '#8b9ab0' }} title={`${r.name}: ${r.value} MW`} />)}
          </div>
          <ul className="lv-legend">
            {mix.map((r) => <li key={r.type}><i style={{ background: FUEL_COLOR[r.type] ?? '#8b9ab0' }} />{r.name}<b>{((r.value ?? 0) / 1000).toFixed(1)} GW</b></li>)}
          </ul>
        </section>
      )}

      <p className="hint lv-foot">Data: U.S. Energy Information Administration, Hourly Electric Grid Monitor (EIA-930), public domain. Compare with the <Link to="/academy/texas-2021">Texas 2021 case file</Link>.</p>
    </main>
  );
}
