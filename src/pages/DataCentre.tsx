import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { CityData } from '../city/types';
import { DEFAULT_DC, dcDay, dcOutage, type DcOpts } from '../city/datacentre';
import { cityLoad, temperature, type Season } from '../city/demand';
import { num } from '../lib/format';
import '../city.css';

// Model 07: a data centre or AI campus on the city's grid.
export default function DataCentre() {
  const { id = 'meridia' } = useParams();
  const [city, setCity] = useState<CityData | null>(null);
  const [o, setO] = useState<DcOpts>(DEFAULT_DC);
  const [season, setSeason] = useState<Season>('summer');
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => { import('../city/load').then(({ loadCity }) => loadCity(id).then(setCity)); }, [id]);
  const inp = { season, day: 'weekday' as const, heat: 0 };
  const day = useMemo(() => (city ? dcDay(city, o, inp) : []), [city, o, season]); // eslint-disable-line react-hooks/exhaustive-deps
  const out = useMemo(() => (city ? dcOutage(o, temperature(city, 15, inp)) : null), [city, o, season]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!playing) return;
    let last = performance.now(), raf = 0;
    const loop = (now: number) => { const dt = (now - last) / 1000; last = now; setT((v) => (v + dt * 5 > 300 ? 0 : v + dt * 5)); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  const set = (p: Partial<DcOpts>) => setO((v) => ({ ...v, ...p }));
  if (!city || !out) return <main className="bo-page"><div className="cy-busy soft" role="status"><span>Loading</span></div></main>;

  // the city at its evening peak, for scale
  let cityPeak = 0;
  for (let m = 0; m < 1440; m += 15) { const l = cityLoad(city, m / 60, inp); cityPeak = Math.max(cityPeak, (l.res + l.com + l.ind + l.inst + l.light) * 1.06); }
  const peakDc = Math.max(...day.map((d) => d.total));
  const avgDc = day.reduce((a, d) => a + d.total, 0) / day.length;
  const perPerson = cityPeak / city.population; // MW per person at peak
  const water = day.reduce((a, d) => a + d.waterM3h, 0) / 12; // m³ per day (5-min samples)
  const s = out.secs[Math.floor(t)];
  const steps = out.steps.filter((x) => x.t <= t);
  const W = 1000, H = 110;
  const max = Math.max(...day.map((d) => d.total)) * 1.1;
  const area = (f: (d: (typeof day)[0]) => number) => day.map((d, i) => `${(i / (day.length - 1)) * W},${H - (f(d) / max) * H}`).join(' ');

  return (
    <main id="main" className="dc-page">
      <header className="bo-head">
        <Link to={`/city/${id}`} className="pv-back">Back to the city</Link>
        <p className="cy-kicker">{city.name} · <span className={`cy-badge cy-badge-${city.kind}`}>{city.kind === 'prototype' ? 'Prototype city' : 'Real city'}</span></p>
        <h1>Data centre</h1>
        <p className="bo-sub">Servers run all day and night, and every watt they use becomes heat that has to be pumped out. In a hot city that cooling costs a quarter or more on top. An AI campus can draw as much as a whole district.</p>
      </header>

      <section className="dc-scale">
        <div><span>Peak draw</span><b>{num(peakDc)} MW</b><small>{Math.round((peakDc / cityPeak) * 100)} % of {city.name}’s evening peak</small></div>
        <div><span>Same as</span><b>{num(peakDc / perPerson / 1000)}k</b><small>people’s share of the peak</small></div>
        <div><span>PUE today</span><b>{num(Math.min(...day.map((d) => d.pue)), 2)}–{num(Math.max(...day.map((d) => d.pue)), 2)}</b><small>total power ÷ IT power</small></div>
        <div><span>Energy</span><b>{num((avgDc * 24) / 1000, 2)} GWh</b><small>a day, flat as a factory</small></div>
        <div><span>Water</span><b>{num(water)} m³</b><small>a day for cooling, ≈ {num((water * 1000) / 150)} people’s use</small></div>
      </section>

      <section className="dc-day">
        <h2>A day in {city.climate[season].label.toLowerCase()}</h2>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <polygon points={`0,${H} ${area((d) => d.total)} ${W},${H}`} fill="#86c5da" opacity={0.85} />
          <polygon points={`0,${H} ${area((d) => d.it)} ${W},${H}`} fill="#c9b8ff" opacity={0.9} />
        </svg>
        <p className="cy-hint"><i className="dc-k" style={{ background: '#c9b8ff' }} />IT load <i className="dc-k" style={{ background: '#86c5da' }} />cooling and losses on top, swelling in the afternoon heat. Peak {num(max / 1.1)} MW.</p>
      </section>

      <section className="dc-out">
        <h2>The first five minutes of a grid failure</h2>
        <div className="dc-chain">
          {[
            ['Grid', false],
            ['UPS', s.gens === 0 && s.ups > 0],
            [`${out.sets} generators`, s.gens > 0],
            ['Chillers', s.chill > 0],
            ['Servers', true],
          ].map(([l, on], i) => <span key={i} className={on ? 'on' : ''}>{l as string}</span>)}
        </div>
        <dl className="cy-rows dc-rows">
          <div><dt>Time since the grid failed</dt><dd>{Math.floor(t)} s</dd></div>
          <div><dt>UPS battery</dt><dd>{Math.round(s.ups * 100)} %</dd></div>
          <div><dt>Server inlet air</dt><dd className={s.inlet > 32 ? 'bad' : s.inlet > 27 ? 'warn' : 'ok'}>{num(s.inlet, 1)} °C</dd></div>
          <div><dt>IT running</dt><dd>{num(s.it, 1)} MW</dd></div>
        </dl>
        <div className="hp-steps">{steps.slice().reverse().slice(0, 3).map((x, i) => <article key={x.title} className={`cy-ev ${i === 0 ? 'cy-ev-peak' : ''}`}><h3><span>{x.t} s</span>{x.title}</h3>{i === 0 && <p>{x.body}</p>}</article>)}</div>
      </section>

      <footer className="hp-bar">
        <button className="cy-play" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
        <input type="range" min={0} max={300} value={t} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }} aria-label="Seconds since the grid failed" />
        <label>IT load <select value={o.itMW} onChange={(e) => set({ itMW: Number(e.target.value) })}>{[12, 48, 120, 300].map((v) => <option key={v} value={v}>{v} MW{v >= 120 ? ' (AI campus)' : ''}</option>)}</select></label>
        <label>AI training share <select value={o.aiShare} onChange={(e) => set({ aiShare: Number(e.target.value) })}>{[0, 0.3, 0.6, 0.9].map((v) => <option key={v} value={v}>{Math.round(v * 100)} %</option>)}</select></label>
        <label>Cooling <select value={o.liquid ? 1 : 0} onChange={(e) => set({ liquid: e.target.value === '1' })}><option value={0}>Air, evaporative</option><option value={1}>Direct liquid</option></select></label>
        <label>Chilled-water tank <select value={o.tesMin} onChange={(e) => set({ tesMin: Number(e.target.value) })}>{[0, 4, 8, 15].map((v) => <option key={v} value={v}>{v ? `${v} min` : 'none'}</option>)}</select></label>
        <label>Season <select value={season} onChange={(e) => setSeason(e.target.value as Season)}>{(['summer', 'monsoon', 'winter'] as const).map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
      </footer>
    </main>
  );
}
