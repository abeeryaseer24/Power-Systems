import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { num } from '../lib/format';
import '../plants.css';
import '../city.css';
import '../forecast.css';
import '../loadshed.css';

type Boot = [number, number, number];
type Res = {
  test_days: number; from: string; to: string; days_with_shed: number; days_severe: number; severe_mw: number;
  MAE_MW: Record<'pred' | 'nldc' | 'persist' | 'mean7' | 'avg2' | 'blend', number>;
  vs_nldc: Boot; avg2_vs_nldc: Boot; blend_vs_nldc: Boot; blend_vs_avg2: Boot;
  surge_days: number; MAE_surge: Record<string, number>; MAE_calm: Record<string, number>;
  any: Record<string, number>; severe?: Record<string, number>;
  zones: { zone: string; mean_actual: number; mae_model: number; mae_persist: number; mae_nldc?: number; days: number }[];
};
type Now = { date: string; pred: number; persist: number; p_any: number; p_severe: number; nldc: number; f_eve_peak_dem: number; f_eve_peak_gen: number; f_tmax_c: number; zones: Record<string, number> };
type Data = {
  results: Res; monthly: { month: string; actual: number; model: number; nldc: number; persist: number }[];
  days: [string, number, number, number, number, number, number, number][]; // date, actual, model, nldc, yesterday, blend, p_any, p_severe
  zoneDays: (string | number)[][]; zones: string[]; importance: { f: string; v: number }[]; nowcast: Now[]; history: [string, number | null][];
};
type Day = { date: string; actual: number | null; model?: number; nldc?: number; persist?: number; blend?: number; pAny?: number; pSev?: number; zA?: number[]; zP?: number[] };

const ZONE_NAME: Record<string, string> = { dhaka: 'Dhaka', chattogram: 'Chattogram', cumilla: 'Cumilla', mymensingh: 'Mymensingh', sylhet: 'Sylhet', khulna: 'Khulna', barishal: 'Barishal', rajshahi: 'Rajshahi', rangpur: 'Rangpur' };
/** Rough geography of the nine NLDC zones on a 4 x 4 grid (column, row). */
const ZONE_AT: Record<string, [number, number]> = { rangpur: [1, 1], mymensingh: [2, 1], sylhet: [3, 1], rajshahi: [1, 2], dhaka: [2, 2], cumilla: [3, 2], khulna: [1, 3], barishal: [2, 3], chattogram: [3, 3] };
const FEATURE: Record<string, string> = {
  ls_total_mw_d1: 'Yesterday’s evening-peak shed', ls_mean7: 'Last week’s average shed', ls_max7: 'Last week’s worst shed', f_ls_total_mw: 'NLDC’s planned shed today',
  f_ls_hourly_max_mw: 'NLDC’s worst planned hour', f_margin: 'NLDC’s forecast margin', f_margin_adj: 'Margin, corrected by yesterday’s missed promise',
  gen_promise_miss_d1: 'Generation promised but not delivered yesterday', dem_fc_err_d1: 'Yesterday’s demand forecast error', shortfall_d1: 'Yesterday’s evening shortfall',
  day_short_d1: 'Yesterday’s midday shortfall', energy_unserved_gwh_d1: 'Energy not served yesterday', unserved_mean7: 'Energy not served, last week',
  gas_mmcfd_d1: 'Gas delivered to plants yesterday', gas_mmcfd_d2: 'Gas delivered two days ago', energy_unserved_gwh_d2: 'Energy not served two days ago', ls_total_mw_d2: 'Shed two evenings ago', ls_total_mw_d7: 'Shed a week ago',
  eve_peak_dem_d7: 'Evening demand a week ago', eve_peak_gen_d7: 'Evening generation a week ago', day_peak_dem_d1: 'Yesterday’s midday demand', day_peak_gen_d1: 'Yesterday’s midday generation', f_day_peak_dem: 'Forecast midday demand', f_energy_gwh: 'Forecast energy', weekend: 'Weekend', dow: 'Day of the week', ramadan: 'Ramadan', eid: 'Eid holiday', gas_trend7: 'Gas supply against its weekly average', f_tmax_c: 'Forecast temperature', tmax_c_d1: 'Yesterday’s temperature',
  f_eve_peak_dem: 'Forecast evening demand', f_eve_peak_gen: 'Forecast evening generation', f_out_gas_mw: 'Plants out for gas shortage', f_out_liquid_mw: 'Plants out for oil shortage',
  f_out_coal_mw: 'Plants out for coal shortage', f_out_maint_mw: 'Plants out for maintenance', f_fuel_short_mw: 'Plants out for any fuel shortage', f_eff_hfo_mw: 'Oil-fired capacity available',
  f_eff_gas_mw: 'Gas-fired capacity available', f_eff_coal_mw: 'Coal capacity available', f_eff_import_mw: 'Imports available', doy_s: 'Time of year', doy_c: 'Time of year',
  mix_hfo_gwh_d1: 'Oil-fired energy yesterday', mix_gas_gwh_d1: 'Gas-fired energy yesterday', mix_coal_gwh_d1: 'Coal energy yesterday', mix_import_gwh_d1: 'Imports yesterday',
  cost_tk_kwh_d1: 'Yesterday’s production cost', eve_peak_dem_d1: 'Yesterday’s evening demand', eve_peak_gen_d1: 'Yesterday’s evening generation', min_gen_d1: 'Yesterday’s minimum generation',
  f_out_gas_chg: 'Change in plants out for gas', f_out_liquid_chg: 'Change in plants out for oil', f_out_other_mw: 'Plants out, other reasons', f_out_maint_chg: 'Change in plants out for maintenance',
};
const label = (f: string) => FEATURE[f] ?? (f.startsWith('ls_') && f.endsWith('_d1') ? `Yesterday’s shed in ${ZONE_NAME[f.slice(3, -3)] ?? f}` : f.startsWith('share_') ? `${ZONE_NAME[f.slice(6, -3)] ?? f}’s share of yesterday’s shed` : f);
const fmtDate = (s: string, o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) => new Date(`${s}T12:00:00Z`).toLocaleDateString('en-GB', o);
const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Shed (MW) to a colour: night for none, sodium for moderate, trip red for severe. */
function heat(v: number | null | undefined) {
  if (v == null) return 'var(--ls-none)';
  if (v <= 0) return 'var(--ls-zero)';
  const t = Math.min(1, Math.sqrt(v / 2500));
  const a = [255, 210, 140], b = [255, 176, 77], c = [255, 91, 79];
  const mix = (p: number[], q: number[], u: number) => p.map((x, i) => Math.round(x + (q[i] - x) * u));
  const rgb = t < 0.5 ? mix(a, b, t * 2) : mix(b, c, (t - 0.5) * 2);
  return `rgba(${rgb.join(',')},${0.25 + 0.75 * t})`;
}

export default function LoadShed() {
  const [data, setData] = useState<Data | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [zoneView, setZoneView] = useState<'actual' | 'model'>('actual');
  useEffect(() => { fetch('/data/loadshed/bd_backtest.json').then((r) => r.json()).then(setData).catch(() => {}); }, []);

  const days = useMemo(() => {
    if (!data) return [] as Day[];
    const z = new Map(data.zoneDays.map((r) => [r[0] as string, r.slice(1) as number[]]));
    const out: Day[] = data.history.map(([date, actual]) => ({ date, actual }));
    for (const [date, actual, model, nldc, persist, blend, pAny, pSev] of data.days) {
      const zr = z.get(date);
      out.push({ date, actual, model, nldc, persist, blend, pAny, pSev, zA: zr?.slice(0, 9), zP: zr?.slice(9) });
    }
    return out;
  }, [data]);
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const sel = pick ? byDate.get(pick) : [...days].reverse().find((d) => (d.actual ?? 0) > 1500 && d.model != null);

  if (!data) return <main id="main" className="page fc-page"><p className="cy-hint">Loading two years of NLDC reports…</p></main>;
  const r = data.results;
  const now = data.nowcast[0];
  const missed = data.days.filter((d) => d[1] > 0 && d[3] <= 0).length;
  const shedDays = data.days.filter((d) => d[1] > 0).length;

  return (
    <main id="main" className="page fc-page ls-page">
      <header className="fr-head fc-head">
        <p className="pv-kicker">Real grids · Machine learning · Bangladesh</p>
        <h1>Who saw the shedding coming?</h1>
        <p>Every morning Bangladesh’s National Load Dispatch Centre publishes yesterday’s figures and its plan for today, load shedding included. We parsed {num(days.length)} consecutive daily reports, {fmtDate(days[0].date)} to {fmtDate(days[days.length - 1].date)}, and asked how well today’s evening-peak load shedding can be predicted from what is known at 11 in the morning. The official plan foresaw shedding on only {missed ? Math.round((100 * (shedDays - missed)) / shedDays) : 0} % of the test days on which it happened.</p>
      </header>

      {now && (
        <section className="fc-block ls-now">
          <h2>{fmtDate(now.date, { weekday: 'long', day: 'numeric', month: 'long' })}, the latest report</h2>
          <dl className="fc-scores fc-small">
            <div className="ours"><dt>Chance of any shedding</dt><dd>{pct(now.p_any)}</dd><small>at the evening peak, from the classifier</small></div>
            <div className="ours"><dt>Expected shed</dt><dd>{num(now.pred)} MW</dd><small>the model’s correction to NLDC’s plan</small></div>
            <div><dt>NLDC’s plan</dt><dd>{num(now.nldc)} MW</dd><small>published that morning</small></div>
            <div><dt>Yesterday</dt><dd>{num(now.persist)} MW</dd><small>what was actually shed the evening before</small></div>
            <div><dt>Forecast margin</dt><dd>{num(now.f_eve_peak_gen - now.f_eve_peak_dem)} MW</dd><small>{num(now.f_eve_peak_gen)} MW available for {num(now.f_eve_peak_dem)} MW of demand, {now.f_tmax_c.toFixed(0)} °C</small></div>
          </dl>
          <p className="cy-hint">The page shows the newest report in the dataset; it is rebuilt when new reports are parsed, not live.</p>
        </section>
      )}

      <section className="fc-block">
        <h2>Two years, one square a day</h2>
        <p className="fc-p">Each square is one evening peak, coloured by the load actually shed. A ring marks days on which NLDC’s morning plan included shedding; a filled square without a ring is shedding the plan did not foresee. Pick any day from {fmtDate(r.from)} onwards to see what each forecaster said.</p>
        <Calendar days={days} pick={sel?.date ?? null} onPick={setPick} />
        <ul className="fc-legend ls-legend">
          <li><i style={{ background: 'var(--ls-zero)' }} />no shedding</li>
          <li><i style={{ background: heat(200) }} />200 MW</li>
          <li><i style={{ background: heat(1000) }} />1,000 MW</li>
          <li><i style={{ background: heat(2500) }} />2,500 MW +</li>
          <li><i className="ls-ring-key" />in NLDC’s plan</li>
          <li className="fc-scale">train before {fmtDate(r.from)} · test after</li>
        </ul>
      </section>

      {sel && sel.model != null && (
        <section className="fc-block ls-day">
          <h2>{fmtDate(sel.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h2>
          <div className="ls-day-grid">
            <ul className="ls-bars">
              {([['What happened', sel.actual ?? 0, 'out'], ['This model', sel.model!, 'ours'], ['Average of all three', sel.blend!, 'blend'], ['NLDC’s plan', sel.nldc!, 'neso'], ['Same as yesterday', sel.persist!, 'pers']] as [string, number, string][]).map(([k, v, c]) => {
                const max = Math.max(500, sel.actual ?? 0, sel.model!, sel.nldc!, sel.persist!);
                return <li key={k} className={c}><span>{k}</span><i style={{ width: `${(v / max) * 100}%` }} /><b>{num(v)} MW</b></li>;
              })}
            </ul>
            <div>
              <div className="pv-seg fc-seg">
                <button className={zoneView === 'actual' ? 'on' : ''} onClick={() => setZoneView('actual')}>What happened</button>
                <button className={zoneView === 'model' ? 'on' : ''} onClick={() => setZoneView('model')}>Model</button>
              </div>
              <ZoneMap zones={data.zones} values={(zoneView === 'actual' ? sel.zA : sel.zP) ?? []} />
            </div>
          </div>
          <p className="cy-hint">Chance of any shedding: {pct(sel.pAny ?? 0)}; of more than {num(r.severe_mw)} MW: {pct(sel.pSev ?? 0)}.</p>
        </section>
      )}

      <section className="fc-block">
        <h2>Who saw it coming?</h2>
        <p className="fc-p">On {num(r.test_days)} test days the evening peak saw shedding on {num(r.days_with_shed)}. The question here is the simplest one a household asks: will there be load shedding tonight at all?</p>
        <div className="ls-called">
          {([['NLDC’s plan', 'nldc'], ['Same as yesterday', 'persist'], ['This model', 'model']] as [string, string][]).map(([k, c]) => (
            <div key={c} className={c === 'model' ? 'ours' : ''}>
              <h3>{k}</h3>
              <p><b>{pct(r.any[`hit_${c}`])}</b> of shedding evenings called</p>
              <p><b>{pct(r.any[`false_${c}`])}</b> of quiet evenings false alarms</p>
              <p className="ls-auc">ranking skill (AUC) {r.any[`auc_${c}`].toFixed(2)}</p>
            </div>
          ))}
        </div>
        <p className="fc-p">NLDC almost never cries wolf, but it plans for shedding on barely a third of the evenings that get it. Simply assuming tonight will be like last night catches nine in ten, and the model does no better than that: on this question, yesterday is already the best predictor.</p>
      </section>

      <section className="fc-block">
        <h2>How many megawatts?</h2>
        <dl className="fc-scores">
          <div><dt>NLDC’s plan</dt><dd>{num(r.MAE_MW.nldc)} MW</dd><small>mean absolute error</small></div>
          <div><dt>Same as yesterday</dt><dd>{num(r.MAE_MW.persist)} MW</dd><small>persistence</small></div>
          <div className="ours"><dt>This model</dt><dd>{num(r.MAE_MW.pred)} MW</dd><small>{num(-r.vs_nldc[0])} MW better than NLDC; 95 % CI from {num(-r.vs_nldc[1])} MW better to {num(r.vs_nldc[2], 1)} MW worse{r.vs_nldc[2] > 0 ? ', so not significant' : ''}</small></div>
          <div><dt>NLDC + yesterday, averaged</dt><dd>{num(r.MAE_MW.avg2)} MW</dd><small>no learning; {num(-r.avg2_vs_nldc[0])} MW better than NLDC (CI {num(-r.avg2_vs_nldc[2])}–{num(-r.avg2_vs_nldc[1])})</small></div>
          <div className="ours"><dt>All three averaged</dt><dd>{num(r.MAE_MW.blend)} MW</dd><small>{pct(-r.blend_vs_nldc[0] / r.MAE_MW.nldc)} below NLDC (CI {num(-r.blend_vs_nldc[2])}–{num(-r.blend_vs_nldc[1])} MW)</small></div>
        </dl>
        <MonthBars m={data.monthly} />
        <p className="fc-p">The 2026 surge is where every forecaster struggles: in months averaging more than 500 MW of shedding ({num(r.surge_days)} days), errors run to {num(r.MAE_surge.nldc)} MW for NLDC and {num(r.MAE_surge.blend)} MW for the three-way average. In the calm months they are {num(r.MAE_calm.nldc)} and {num(r.MAE_calm.blend)} MW. The model was never trained on shedding that deep when it first met it, which is why it learns a correction to NLDC’s number rather than the number itself: trees cannot predict beyond what they have seen, but a correction can ride on a plan that does.</p>
      </section>

      <section className="fc-block">
        <h2>Zone by zone</h2>
        <ul className="ls-zones">
          {r.zones.map((z) => (
            <li key={z.zone}><span>{ZONE_NAME[z.zone]}</span><em>{num(z.mean_actual)} MW average · shed on {z.days} days</em><b>model {num(z.mae_model)} MW</b><b>yesterday {num(z.mae_persist)} MW</b>{z.mae_nldc != null && <b>NLDC {num(z.mae_nldc)} MW</b>}</li>
          ))}
        </ul>
        <p className="cy-hint">Mean absolute error of each forecaster per zone over the test days. Zones with little shedding are easy for everyone.</p>
      </section>

      <section className="fc-block">
        <h2>What the model leans on</h2>
        <ul className="fc-imp">{data.importance.slice(0, 10).map((x) => <li key={x.f}><span>{label(x.f)}</span><i style={{ width: `${(x.v / data.importance[0].v) * 100}%` }} /><b>{Math.round(x.v * 100)} %</b></li>)}</ul>
        <p className="cy-hint">Share of the training-loss improvement per input (LightGBM gain), summed over the monthly retrains of the national model.</p>
      </section>

      <section className="fc-block fc-notes">
        <h2>Method and limits</h2>
        <ul>
          <li>Data: PGCB’s daily operation reports (NLDC), parsed from their spreadsheets: the system summary (evening-peak load shed and demand per zone), the generation curve, and the next-day forecast sheet with its plant-by-plant availability and the reason each plant is short (gas, oil, coal, maintenance).</li>
          <li>Information set: the report for day D is issued at about 11:00 on D+1, together with the plan for D+1. So the model for day D sees actuals up to D−1, NLDC’s plan for D and the calendar, exactly what NLDC itself knew.</li>
          <li>Target: load shed at the evening-peak hour (substation end, MW), national and for each of the nine zones.</li>
          <li>Protocol: retrained at the start of every month on all earlier days, tested on that month; {num(r.test_days)} test days from {fmtDate(r.from)} to {fmtDate(r.to)}. Intervals are a moving-block bootstrap with 7-day blocks.</li>
          <li>Model: gradient-boosted trees with a Huber loss, predicting the correction to NLDC’s planned shed; separate classifiers for any shedding and for more than {num(r.severe_mw)} MW. A direct model of the megawatts did worse (274 MW), because it could not extrapolate to the 2026 surge.</li>
          <li>Result: learning adds little. Averaging NLDC’s plan with yesterday’s outcome, which needs no model at all, cuts the error by about a tenth; the model’s extra contribution on top is not significant. That is a finding, not a failure: day-to-day shedding is driven by fuel deliveries and plant trips that the morning report does not foresee.</li>
          <li>NLDC’s planned figure is a schedule, not necessarily its best guess; utilities may also under-report shedding. Two years is short, and most of the deep shedding falls in one season.</li>
        </ul>
        <p className="cy-hint">Code: <code>ml/fetch_pgcb.py</code>, <code>ml/parse_pgcb.py</code>, <code>ml/loadshed.py</code>. Use the forecast on <Link to="/load-shedding">tonight’s predictor</Link>, plan a night of shedding yourself in <Link to="/dhaka-tonight">Dhaka tonight</Link>, or see the <Link to="/forecast">GB demand forecast</Link>.</p>
      </section>
    </main>
  );
}

function Calendar({ days, pick, onPick }: { days: Day[]; pick: string | null; onPick: (d: string) => void }) {
  // columns are weeks (Saturday first, the Bangladesh working week), rows are weekdays
  const first = new Date(`${days[0].date}T12:00:00Z`);
  const offset = (first.getUTCDay() + 1) % 7;
  const cells = days.map((d, i) => ({ d, col: Math.floor((i + offset) / 7), row: (i + offset) % 7 }));
  const cols = cells[cells.length - 1].col + 1;
  const S = 13;
  const months = cells.filter((c) => c.d.date.endsWith('-01'));
  return (
    <div className="ls-cal-wrap">
      <svg className="ls-cal" viewBox={`0 0 ${cols * S + 4} ${7 * S + 22}`} style={{ minWidth: cols * 9 }}>
        {months.map((c) => <text key={c.d.date} x={c.col * S + 2} y={10} className="ls-month">{c.d.date.slice(5, 7) === '01' ? c.d.date.slice(0, 4) : fmtDate(c.d.date, { month: 'short' })}</text>)}
        {cells.map(({ d, col, row }) => (
          <g key={d.date} transform={`translate(${col * S + 2},${row * S + 16})`} onClick={() => d.model != null && onPick(d.date)} className={d.model != null ? 'ls-pickable' : 'ls-train'}>
            <rect width={S - 2} height={S - 2} rx={1.5} fill={heat(d.actual)} />
            {(d.nldc ?? 0) > 0 && <rect x={0.75} y={0.75} width={S - 3.5} height={S - 3.5} rx={1.5} className="ls-ring" />}
            {pick === d.date && <rect x={-1.5} y={-1.5} width={S + 1} height={S + 1} rx={2.5} className="ls-sel" />}
            <title>{`${fmtDate(d.date)}: ${d.actual == null ? 'no report' : `${num(d.actual)} MW shed`}${d.nldc != null ? `, NLDC planned ${num(d.nldc)} MW` : ''}`}</title>
          </g>
        ))}
      </svg>
    </div>
  );
}

function ZoneMap({ zones, values }: { zones: string[]; values: number[] }) {
  return (
    <div className="ls-map">
      {zones.map((z, i) => {
        const [c, rw] = ZONE_AT[z];
        const v = values[i] ?? 0;
        return <div key={z} style={{ gridColumn: c, gridRow: rw, background: heat(v * 3) }}><span>{ZONE_NAME[z]}</span><b>{num(v)}</b></div>;
      })}
    </div>
  );
}

function MonthBars({ m }: { m: Data['monthly'] }) {
  const W = 1000, H = 160;
  const max = Math.max(...m.map((x) => Math.max(x.model, x.nldc, x.persist))) * 1.1;
  const bw = W / m.length;
  return (
    <div className="fc-chart">
      <svg viewBox={`0 0 ${W} ${H + 18}`} preserveAspectRatio="none" className="ls-months">
        {m.map((x, i) => (
          <g key={x.month}>
            <rect x={i * bw + bw * 0.1} y={H - (x.nldc / max) * H} width={bw * 0.26} height={(x.nldc / max) * H} className="fc-bar-neso" />
            <rect x={i * bw + bw * 0.37} y={H - (x.persist / max) * H} width={bw * 0.26} height={(x.persist / max) * H} className="ls-bar-pers" />
            <rect x={i * bw + bw * 0.64} y={H - (x.model / max) * H} width={bw * 0.26} height={(x.model / max) * H} className="fc-bar-ours" />
            {i % 3 === 0 && <text x={i * bw + 2} y={H + 14} className="cy-axis-t">{x.month}</text>}
          </g>
        ))}
      </svg>
      <ul className="fc-legend"><li><i className="k-neso" />NLDC</li><li><i className="ls-k-pers" />Same as yesterday</li><li><i className="k-ours" />This model</li><li className="fc-scale">monthly mean absolute error; top {num(max)} MW</li></ul>
    </div>
  );
}
