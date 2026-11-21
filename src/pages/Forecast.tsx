import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GbModel, HalfHour } from '../ai/gbforecast';
import { num } from '../lib/format';
import '../plants.css';
import '../city.css';
import '../forecast.css';

type Backtest = {
  results: { test_half_hours: number; from: string; to: string; MAPE: Record<string, number>; MAE_MW: Record<string, number>; pinball_MW: Record<string, number>; coverage_10_90: number; blend_MAPE: number; calibration?: { coverage_raw: number; coverage_calibrated: number } };
  monthly: { month: string; neso: number; model: number; naive_d7: number }[];
  byPeriod: { hh: number; neso: number; model: number }[];
  importance: { f: string; v: number }[];
  samples: Record<string, number[][]>;
};

const LABEL: Record<string, string> = {
  lag_d7: 'Same half hour a week earlier', lag_d2: 'Same half hour two days earlier', hour: 'Time of day', dow: 'Day of the week',
  doy_s: 'Time of year', doy_c: 'Time of year', morning_d1: 'Yesterday morning', temp_dmean: 'Day’s mean temperature', mean_d2: 'Mean demand two days earlier',
  EMBEDDED_SOLAR_CAPACITY: 'Installed rooftop solar', solar_mw: 'Expected rooftop solar', temperature_2m: 'Temperature', hdd: 'Heating degree days', year: 'Long-term trend',
  shortwave_radiation: 'Sunshine', wind_mw: 'Expected embedded wind', temp_lag24: 'Yesterday’s temperature', holiday: 'Bank holiday', xmas: 'Christmas period', cloud_cover: 'Cloud', wind_speed_10m: 'Wind', bst: 'Clock change', relative_humidity_2m: 'Humidity', cdd: 'Cooling degree days',
};

export default function Forecast() {
  const [bt, setBt] = useState<Backtest | null>(null);
  const [live, setLive] = useState<{ date: string; halfHours: HalfHour[]; missing: string[] } | null>(null);
  const [err, setErr] = useState('');
  const [sample, setSample] = useState('winter');
  useEffect(() => {
    fetch('/data/forecast/gb_backtest.json').then((r) => r.json()).then(setBt).catch(() => {});
    (async () => {
      try {
        const [model, { forecastTomorrow }] = await Promise.all([fetch('/data/forecast/gb_model.json').then((r) => r.json() as Promise<GbModel>), import('../ai/gbforecast')]);
        setLive(await forecastTomorrow(model));
      } catch (e) { setErr(String(e)); }
    })();
  }, []);

  return (
    <main id="main" className="page fc-page">
      <header className="fr-head fc-head">
        <p className="pv-kicker">Real grids · Machine learning</p>
        <h1>Tomorrow’s demand, forecast</h1>
        <p>A gradient-boosted model forecasts every half hour of tomorrow’s electricity demand in Great Britain, with a range, right here in your browser. It learns from eight years of half-hourly national demand, weather and the calendar. It is scored the way the grid operator is scored: the day before, using only weather forecasts, against what actually happened, alongside NESO’s own published forecast.</p>
      </header>

      <section className="fc-block">
        <h2>Tomorrow{live ? `, ${new Date(`${live.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}` : ''}</h2>
        {err && <p className="cy-hint warn">The live forecast could not be made: {err}. The data services may be unavailable for a moment.</p>}
        {!live && !err && <p className="cy-hint">Fetching recent demand from Elexon and tomorrow’s weather for ten cities…</p>}
        {live && <DayChart hh={live.halfHours} />}
        {live && live.missing.length > 0 && <p className="cy-hint warn">Some inputs were missing ({live.missing.join(', ')}); the model fills the gaps the way it was trained to, but this forecast is less reliable.</p>}
        {live && <LiveStats hh={live.halfHours} />}
      </section>

      {bt && (
        <>
          <section className="fc-block">
            <h2>How good is it? An honest backtest</h2>
            <p className="fc-p">Every month from {bt.results.from.slice(0, 7)} to {bt.results.to.slice(0, 7)} the model was retrained on all earlier data and then forecast that month a day ahead, with the weather forecast that was available at the time. {num(bt.results.test_half_hours)} half hours in all.</p>
            <dl className="fc-scores">
              <div><dt>NESO day-ahead</dt><dd>{bt.results.MAPE.neso.toFixed(2)} %</dd><small>the grid operator’s own forecast</small></div>
              <div className="ours"><dt>This model</dt><dd>{bt.results.MAPE.point.toFixed(2)} %</dd><small>mean absolute percentage error</small></div>
              <div><dt>Both averaged</dt><dd>{bt.results.blend_MAPE.toFixed(2)} %</dd><small>a simple ensemble</small></div>
              <div><dt>Same as last week</dt><dd>{bt.results.MAPE.lag_d7.toFixed(2)} %</dd><small>the naive baseline</small></div>
              <div><dt>10–90 % range</dt><dd>{Math.round((bt.results.calibration?.coverage_calibrated ?? bt.results.coverage_10_90) * 100)} %</dd><small>of outcomes fell inside, after calibration (target 80 %; {Math.round((bt.results.calibration?.coverage_raw ?? bt.results.coverage_10_90) * 100)} % before)</small></div>
            </dl>
            <Monthly m={bt.monthly} />
          </section>
          <section className="fc-block">
            <h2>A week of forecasts</h2>
            <div className="pv-seg fc-seg">{Object.keys(bt.samples).map((k) => <button key={k} className={sample === k ? 'on' : ''} onClick={() => setSample(k)}>{k === 'winter' ? 'January 2025' : k === 'summer' ? 'July 2025' : 'Christmas 2024'}</button>)}</div>
            <Week rows={bt.samples[sample]} />
          </section>
          <section className="fc-block">
            <h2>What the model leans on</h2>
            <ul className="fc-imp">{bt.importance.slice(0, 10).map((x) => <li key={x.f}><span>{LABEL[x.f] ?? x.f}</span><i style={{ width: `${(x.v / bt.importance[0].v) * 100}%` }} /><b>{Math.round(x.v * 100)} %</b></li>)}</ul>
            <p className="cy-hint">Share of the improvement in the training loss that each input accounts for (LightGBM gain).</p>
          </section>
        </>
      )}

      <section className="fc-block fc-notes">
        <h2>Method and limits</h2>
        <ul>
          <li>Target: national demand (ND), half-hourly, from NESO’s historic demand data. NESO’s published outturn matches it to within about 60 MW.</li>
          <li>Inputs known at 09:00 the day before: demand at the same half hour two and seven days earlier, the mean of two days earlier and yesterday’s early morning; the calendar and bank holidays; weather for ten cities weighted by population; installed embedded solar and wind multiplied by the forecast sunshine and wind.</li>
          <li>Training uses ERA5 reanalysis weather; the test period uses the forecast issued a day earlier, so forecast errors in the weather are part of the test, as they are for NESO.</li>
          <li>Three models are trained: the median, and the 10 % and 90 % quantiles, which give the range. Because they learn from observed weather but run on forecast weather, their range comes out too narrow; it is widened by conformal calibration, using only the forecast errors of earlier months. They run in your browser from exported trees.</li>
          <li>Result: on its own the model is less accurate than NESO, which has inputs it does not. Averaged with NESO’s forecast it beats NESO alone, because the two make partly different errors.</li>
          <li>The live forecast uses Elexon’s initial demand outturn, which is revised later; NESO has inputs this model does not, such as metered embedded generation and its own weather forecasts.</li>
        </ul>
        <p className="cy-hint">Data: NESO Data Portal and Elexon Insights (NESO Open Data Licence), Open-Meteo (CC BY 4.0), GOV.UK bank holidays (OGL). Training code in <code>ml/forecast.py</code>. See also the <Link to="/predictor">blackout risk predictor</Link>.</p>
      </section>
    </main>
  );
}

const W = 1000, H = 200;
function DayChart({ hh }: { hh: HalfHour[] }) {
  const vals = hh.flatMap((h) => [h.q10, h.q90, h.neso ?? h.q50]);
  const lo = Math.min(...vals) * 0.96, hi = Math.max(...vals) * 1.03;
  const x = (i: number) => (i / (hh.length - 1)) * W, y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const band = `${hh.map((h, i) => `${x(i)},${y(h.q90)}`).join(' ')} ${hh.map((h, i) => `${x(hh.length - 1 - i)},${y(hh[hh.length - 1 - i].q10)}`).join(' ')}`;
  const line = (f: (h: HalfHour) => number | null) => hh.map((h, i) => (f(h) == null ? null : `${x(i)},${y(f(h)!)}`)).filter(Boolean).join(' ');
  return (
    <div className="fc-chart">
      <svg viewBox={`0 0 ${W} ${H + 20}`} preserveAspectRatio="none">
        {[0, 6, 12, 18].map((h) => <g key={h} className="cy-axis"><line x1={x(h * 2)} x2={x(h * 2)} y1={0} y2={H} /><text x={x(h * 2) + 3} y={H + 14}>{String(h).padStart(2, '0')}:00</text></g>)}
        <polygon points={band} className="fc-band" />
        <polyline points={line((h) => h.neso)} className="fc-neso" />
        <polyline points={line((h) => h.q50)} className="fc-ours" />
      </svg>
      <ul className="fc-legend">
        <li><i className="k-ours" />This model, median</li>
        <li><i className="k-band" />10–90 % range</li>
        <li><i className="k-neso" />NESO day-ahead</li>
        <li className="fc-scale">{num(lo, 0)}–{num(hi, 0)} MW</li>
      </ul>
    </div>
  );
}

function LiveStats({ hh }: { hh: HalfHour[] }) {
  const pk = hh.reduce((a, h) => (h.q50 > a.q50 ? h : a), hh[0]);
  const nesoPk = Math.max(...hh.map((h) => h.neso ?? 0));
  const diff = hh.filter((h) => h.neso != null).map((h) => Math.abs(h.q50 - h.neso!) / h.neso!);
  const time = (t: number) => new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
  return (
    <dl className="fc-scores fc-small">
      <div className="ours"><dt>Peak</dt><dd>{num(pk.q50)} MW</dd><small>at {time(pk.t)}, likely {num(pk.q10)}–{num(pk.q90)}</small></div>
      {diff.length >= 40 ? (
        <>
          <div><dt>NESO’s peak</dt><dd>{num(nesoPk)} MW</dd><small>its published day-ahead forecast</small></div>
          <div><dt>Disagreement</dt><dd>{(100 * diff.reduce((a, b) => a + b, 0) / diff.length).toFixed(1)} %</dd><small>mean gap between the two forecasts</small></div>
        </>
      ) : <div><dt>NESO’s forecast</dt><dd>later</dd><small>NESO publishes its day-ahead forecast for tomorrow at about 09:45; until then only the next few hours are available</small></div>}
      <div><dt>Energy</dt><dd>{num(hh.reduce((a, h) => a + h.q50 / 2, 0) / 1000, 0)} GWh</dd><small>over the day</small></div>
    </dl>
  );
}

function Monthly({ m }: { m: Backtest['monthly'] }) {
  const max = Math.max(...m.map((r) => Math.max(r.model, r.neso))) * 1.15;
  const bw = W / m.length;
  return (
    <div className="fc-chart">
      <svg viewBox={`0 0 ${W} 150`} preserveAspectRatio="none">
        {m.map((r, i) => (
          <g key={r.month}>
            <rect x={i * bw + bw * 0.12} y={150 - (r.neso / max) * 140} width={bw * 0.36} height={(r.neso / max) * 140} className="fc-bar-neso" />
            <rect x={i * bw + bw * 0.52} y={150 - (r.model / max) * 140} width={bw * 0.36} height={(r.model / max) * 140} className="fc-bar-ours" />
          </g>
        ))}
      </svg>
      <ul className="fc-legend"><li><i className="k-neso" />NESO</li><li><i className="k-ours" />This model</li><li className="fc-scale">monthly MAPE, {m[0]?.month} to {m[m.length - 1]?.month}; top of chart {max.toFixed(1)} %</li></ul>
    </div>
  );
}

function Week({ rows }: { rows: number[][] }) {
  const pts = useMemo(() => {
    if (!rows?.length) return null;
    const all = rows.flatMap((r) => [r[0], r[1], r[2], r[3], r[4]]);
    const lo = Math.min(...all) * 0.97, hi = Math.max(...all) * 1.02;
    const x = (i: number) => (i / (rows.length - 1)) * W, y = (v: number) => 180 - ((v - lo) / (hi - lo)) * 180;
    const line = (k: number) => rows.map((r, i) => `${x(i)},${y(r[k])}`).join(' ');
    const band = `${rows.map((r, i) => `${x(i)},${y(r[4])}`).join(' ')} ${rows.map((_, i) => `${x(rows.length - 1 - i)},${y(rows[rows.length - 1 - i][3])}`).join(' ')}`;
    return { band, out: line(0), neso: line(1), ours: line(2), lo, hi };
  }, [rows]);
  if (!pts) return null;
  return (
    <div className="fc-chart">
      <svg viewBox={`0 0 ${W} 190`} preserveAspectRatio="none">
        <polygon points={pts.band} className="fc-band" />
        <polyline points={pts.out} className="fc-out" />
        <polyline points={pts.neso} className="fc-neso" />
        <polyline points={pts.ours} className="fc-ours" />
      </svg>
      <ul className="fc-legend"><li><i className="k-out" />What happened</li><li><i className="k-ours" />This model</li><li><i className="k-neso" />NESO</li><li><i className="k-band" />10–90 %</li><li className="fc-scale">{num(pts.lo, 0)}–{num(pts.hi, 0)} MW</li></ul>
    </div>
  );
}
