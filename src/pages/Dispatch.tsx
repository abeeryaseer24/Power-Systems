import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import '../plants.css';
import '../city.css';
import '../forecast.css';
import '../surrogate.css';
import '../dispatch.css';

type Run = Record<'cc' | 'oc' | 'oil' | 'dis' | 'ch' | 'imp' | 'curt' | 'bk' | 'uns' | 'soc' | 'cost', number[]> & { total: number };
type Day = { seed: number; demand: number[]; roof: number[]; wind: number[]; usol: number[]; price: number[]; temp: number[]; runs: Record<string, Run> };
type Res = { cost_M: number; gap_pct: number; gap_p90_k: number; decide_ms: number | null; unserved_MWh: number; curtailed_MWh: number; backstop_MWh: number; ocgt_MWh: number; battery_cycles: number; import_MWh: number; beats_mpc_days: number; loses_mpc_days: number; saving_vs_mpc_k?: [number, number, number] };
type Who = 'rule' | 'ppo' | 'ppo_bc' | 'mpc' | 'mpc_value' | 'perfect';
type Spec = { results: Record<Who, Res> & { learning_curve: number[]; train_s: number; curve_bc: number[]; train_s_bc: number }; days: Day[]; fleet: Record<string, number> };

const WHO = [
  { id: 'rule', name: 'Operator rule', note: 'fixed if-then rules a person could write down' },
  { id: 'ppo', name: 'RL from scratch', note: 'trial and error on simulated days only' },
  { id: 'ppo_bc', name: 'RL agent', note: 'copies hindsight first, then trial and error' },
  { id: 'mpc', name: 'Forecast optimiser', note: 'solves a 4-hour plan every half hour (MPC)' },
  { id: 'mpc_value', name: 'Optimiser + learned value', note: 'the same, told what stored energy is worth' },
  { id: 'perfect', name: 'Perfect foresight', note: 'knows the whole day in advance: the floor' },
] as const;
const OURS = new Set(['ppo_bc', 'mpc_value']);

const LAYERS = [
  { k: 'ren', label: 'Wind and solar farms', c: '#86c5da' },
  { k: 'cc', label: 'Combined-cycle gas', c: '#c9a26b' },
  { k: 'oc', label: 'Open-cycle gas', c: '#ffb04d' },
  { k: 'oil', label: 'Oil', c: '#ff7a3d' },
  { k: 'dis', label: 'Battery discharging', c: '#c9b8ff' },
  { k: 'imp', label: 'Import from Victoria', c: '#8b9ab0' },
] as const;

const fmtK = (x: number) => `${x < 0 ? '−' : ''}$${Math.abs(x).toFixed(1)} k`;
const money = (x: number) => (Math.abs(x) >= 1e6 ? `$${(x / 1e6).toFixed(2)} M` : `$${Math.round(x / 1e3)} k`);
const hhmm = (t: number) => `${String(Math.floor(t / 2)).padStart(2, '0')}:${t % 2 ? '30' : '00'}`;

export default function Dispatch() {
  const [spec, setSpec] = useState<Spec | null>(null);
  const [di, setDi] = useState(5);
  const [who, setWho] = useState<Who>('ppo_bc');
  useEffect(() => { fetch('/data/dispatch/sa.json').then((r) => r.json()).then(setSpec).catch(() => {}); }, []);
  const day = spec?.days[di];

  return (
    <main id="main" className="page fc-page dp-page">
      <header className="fr-head fc-head">
        <p className="pv-kicker">Real grids · Machine learning</p>
        <h1>Who runs the grid best?</h1>
        <p>South Australia runs on wind and rooftop solar most days, with gas, big batteries and one link to Victoria behind them. Every half hour someone has to decide how much gas to keep running, when to charge the batteries and what to send over the link, using forecasts that are always a little wrong. Six dispatchers face the same days: a rulebook, two reinforcement-learning agents, an optimiser that re-plans every half hour, the same optimiser with a learned sense of what stored energy is worth, and a perfect-foresight benchmark no real operator can match.</p>
      </header>

      {!spec && <p className="cy-hint">Loading the test days…</p>}
      {spec && day && (
        <>
          <div className="dp-days" role="tablist" aria-label="Test day">
            {spec.days.map((d, i) => {
              const ren = d.wind.reduce((a, b) => a + b, 0) / 48, tmax = Math.max(...d.temp);
              return (
                <button key={d.seed} role="tab" aria-selected={i === di} className={i === di ? 'on' : ''} onClick={() => setDi(i)}>
                  <b>{Math.round(tmax)}°</b><span>wind {(ren / 1000).toFixed(1)} GW</span>
                </button>
              );
            })}
          </div>
          <p className="dp-dayline">Days run from the windiest and sunniest to the tightest. On this one, demand peaks at {Math.round(Math.max(...day.demand))} MW, rooftop solar reaches {Math.round(Math.max(...day.roof))} MW, wind averages {Math.round(day.wind.reduce((a, b) => a + b, 0) / 48)} MW and the Victorian price ranges from ${Math.min(...day.price)} to ${Math.max(...day.price)}/MWh.</p>

          <section className="dp-board">
            <div className="dp-who" role="tablist" aria-label="Dispatcher">
              {WHO.map((w) => (
                <button key={w.id} role="tab" aria-selected={who === w.id} className={who === w.id ? 'on' : ''} onClick={() => setWho(w.id)}>
                  <span>{w.name}</span><b>{money(day.runs[w.id].total)}</b><small>{w.note}</small>
                </button>
              ))}
            </div>
            <Stack day={day} run={day.runs[who]} />
            <Soc day={day} who={who} be={spec.fleet.be} />
          </section>

          <Results spec={spec} />
        </>
      )}

      <section className="fc-block fc-notes">
        <h2>The model, and where it stops</h2>
        <ul>
          <li>The grid is South Australia as one node. It has 2.7 GW of wind, 450 MW of solar farms and 2.4 GW of rooftop solar. Gas is 1.3 GW of combined-cycle plant (ramp-limited) and 2.1 GW of open-cycle plant, plus 181 MW of oil. There is a 600 MW / 750 MWh battery fleet, and the Heywood link carries 650 MW in and 500 MW out at the Victorian price. At least 300 MW of synchronous machines must stay online for system strength, as AEMO requires.</li>
          <li>Every dispatcher sets only the combined-cycle target, the battery and the link, before the half hour starts, from the same forecasts. The real values then arrive and the same balancing rule applies to all four. Open-cycle gas and oil cover shortfalls; wind and solar farms are curtailed on surpluses. The rooftop-solar backstop ($600/MWh) and unserved energy ($15,000/MWh) are the last resorts.</li>
          <li>Days are synthetic, calibrated to published South Australian ranges, not replayed from AEMO data. Forecast errors grow with lead time (demand about 35 MW, renewables about 90 MW, half an hour ahead). The 100 test days were never used in training or for choosing checkpoints; that was done on 100 separate validation days. Intervals come from a paired bootstrap over the test days.</li>
          <li>There is no transmission inside the state, no unit commitment and no ancillary-service market. The aim is to compare decision methods under uncertainty on equal terms, not to reproduce dispatch in the National Electricity Market.</li>
        </ul>
        <p className="fc-p">See also: <Link to="/surrogate">the learned load flow</Link> and <Link to="/forecast">the demand forecaster</Link>.</p>
      </section>
    </main>
  );
}

function Stack({ day, run }: { day: Day; run: Run }) {
  const W = 960, H = 300, top = 3600, bot = -1400;
  const y = (v: number) => ((top - v) / (top - bot)) * H;
  const x = (t: number) => (t / 47) * W;
  const series = useMemo(() => {
    const ren = day.wind.map((w, t) => w + day.usol[t] - run.curt[t]);
    const vals: Record<string, number[]> = { ren, cc: run.cc, oc: run.oc, oil: run.oil, dis: run.dis, imp: run.imp.map((v) => Math.max(0, v)) };
    const acc = new Array(48).fill(0);
    return LAYERS.map((l) => {
      const lo = [...acc];
      vals[l.k].forEach((v, t) => { acc[t] += v; });
      const hi = [...acc];
      const d = hi.map((v, t) => `${t ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join('') + lo.map((_, i) => { const t = 47 - i; return `L${x(t).toFixed(1)},${y(lo[t]).toFixed(1)}`; }).join('') + 'Z';
      return { ...l, d };
    });
  }, [day, run]);
  const below = (vals: number[], off: number[]) => vals.map((v, t) => `${t ? 'L' : 'M'}${x(t).toFixed(1)},${y(-(off[t] + v)).toFixed(1)}`).join('') + off.map((_, i) => { const t = 47 - i; return `L${x(t).toFixed(1)},${y(-off[t]).toFixed(1)}`; }).join('') + 'Z';
  const zero = new Array(48).fill(0);
  const exp = run.imp.map((v) => Math.max(0, -v));
  const opDemand = day.demand.map((d, t) => d - day.roof[t]);
  const line = (v: number[]) => v.map((a, t) => `${t ? 'L' : 'M'}${x(t).toFixed(1)},${y(a).toFixed(1)}`).join('');
  return (
    <figure className="dp-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Generation by source over the day">
        {[3000, 2000, 1000, 0, -1000].map((g) => <line key={g} x1={0} x2={W} y1={y(g)} y2={y(g)} className={g === 0 ? 'dp-zero' : 'dp-grid'} />)}
        {series.map((s) => <path key={s.k} d={s.d} fill={s.c} opacity={0.9} />)}
        <path d={below(run.ch, zero)} fill="#c9b8ff" opacity={0.45} />
        <path d={below(exp, run.ch)} fill="#8b9ab0" opacity={0.45} />
        <path d={below(run.curt, run.ch.map((c, t) => c + exp[t]))} className="dp-curt" />
        <path d={line(opDemand)} className="dp-demand" />
        <path d={line(day.demand)} className="dp-under" />
      </svg>
      <div className="dp-axis">{[0, 12, 24, 36, 47].map((t) => <span key={t}>{hhmm(t)}</span>)}</div>
      <figcaption>
        <ul className="fc-legend">
          {LAYERS.map((l) => <li key={l.k}><i style={{ background: l.c, height: 10 }} />{l.label}</li>)}
          <li><i className="k-curt" />Curtailed</li>
          <li><i style={{ background: 'var(--porcelain)' }} />Grid demand (after rooftop solar)</li>
          <li><i className="k-under" />Total demand</li>
          <li className="fc-scale">Below zero: battery charging, export, curtailment</li>
        </ul>
      </figcaption>
    </figure>
  );
}

function Soc({ day, who, be }: { day: Day; who: string; be: number }) {
  const W = 960, H = 110;
  const x = (t: number) => (t / 47) * W, y = (v: number) => H - (v / be) * (H - 8) - 4;
  return (
    <figure className="dp-chart dp-soc">
      <figcaption className="dp-cap">Battery charge, all four dispatchers</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Battery state of charge over the day">
        {WHO.map((w) => (
          <path key={w.id} d={day.runs[w.id].soc.map((v, t) => `${t ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join('')} className={`dp-socl s-${w.id}${who === w.id ? ' on' : ''}`} />
        ))}
      </svg>
      <ul className="fc-legend">{WHO.map((w) => <li key={w.id}><i className={`k-${w.id}`} />{w.name}</li>)}</ul>
    </figure>
  );
}

function Results({ spec }: { spec: Spec }) {
  const r = spec.results, lc = r.learning_curve, lb = r.curve_bc ?? [];
  const lo = Math.min(...lc, ...lb, r.perfect.cost_M * 1e6), hi = Math.max(...lc.slice(0, 5));
  const n = Math.max(lc.length, lb.length);
  const W = 600, H = 150;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * (H - 10) - 5;
  return (
    <section className="fc-block">
      <h2>Over 100 days it never trained on</h2>
      <dl className="fc-scores">
        {WHO.map((w) => (
          <div key={w.id} className={OURS.has(w.id) ? 'ours' : ''}>
            <dt>{w.name}</dt><dd>${r[w.id].cost_M.toFixed(3)} M</dd>
            <small>{w.id === 'perfect' ? 'per day, the floor' : `per day, ${r[w.id].gap_pct.toFixed(1)} % more than the floor`}</small>
          </div>
        ))}
      </dl>
      <div className="sg-table dp-table" role="table">
        <div className="sg-tr sg-th" role="row"><span>Per day, on average</span>{WHO.map((w) => <span key={w.id}>{w.name}</span>)}</div>
        {([
          ['Wind and solar curtailed', (x: Res) => `${Math.round(x.curtailed_MWh).toLocaleString('en-GB')} MWh`],
          ['Rooftop backstop used', (x: Res) => `${x.backstop_MWh.toFixed(1)} MWh`],
          ['Unserved energy', (x: Res) => `${x.unserved_MWh.toFixed(1)} MWh`],
          ['Battery cycles', (x: Res) => x.battery_cycles.toFixed(2)],
          ['Net import from Victoria', (x: Res) => `${Math.round(x.import_MWh).toLocaleString('en-GB')} MWh`],
          ['Extra cost on a bad day (worst 10 %)', (x: Res) => `$${Math.round(x.gap_p90_k)} k`],
          ['Open-cycle gas started', (x: Res) => `${Math.round(x.ocgt_MWh).toLocaleString('en-GB')} MWh`],
          ['Days cheaper than the optimiser', (x: Res) => `${x.beats_mpc_days} / 100`],
          ['Time per half-hour decision', (x: Res) => (x.decide_ms == null ? '—' : x.decide_ms < 1 ? `${Math.round(x.decide_ms * 1000)} µs` : `${x.decide_ms.toFixed(1)} ms`)],
        ] as [string, (x: Res) => string][]).map(([label, f]) => (
          <div key={label} className="sg-tr" role="row"><span>{label}</span>{WHO.map((w) => <span key={w.id} className={OURS.has(w.id) ? 'dp-ours' : ''}>{label.startsWith('Time') && w.id === 'perfect' ? 'plans the day once' : f(r[w.id])}</span>)}</div>
        ))}
      </div>
      <figure className="dp-learn">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Learning curve">
          <line x1={0} x2={W} y1={y(r.mpc.cost_M * 1e6)} y2={y(r.mpc.cost_M * 1e6)} className="dp-ref" />
          <line x1={0} x2={W} y1={y(r.perfect.cost_M * 1e6)} y2={y(r.perfect.cost_M * 1e6)} className="dp-ref p" />
          <path d={lc.map((v, i) => `${i ? 'L' : 'M'}${((i / (n - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join('')} className="dp-lc scratch" />
          <path d={lb.map((v, i) => `${i ? 'L' : 'M'}${((i / (n - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join('')} className="dp-lc" />
        </svg>
        <figcaption className="dp-cap">How the agents learned: mean cost per day while training, on new simulated days each round (256 a round), including their exploration noise. Training days are harder on average than the test days. Grey: from scratch ({lc.length} rounds, {Math.round(r.train_s / 60)} min). Orange: after copying hindsight ({lb.length} rounds, {Math.round(r.train_s_bc / 60)} min). Dashed lines: the forecast optimiser and perfect foresight on the test days.</figcaption>
      </figure>
      <h3 className="dp-h3">What the learning bought</h3>
      <ul className="dp-find">
        <li><b>Copying hindsight first is what makes RL work here.</b> From scratch, the agent stalls at {r.ppo.gap_pct.toFixed(0)} % above the floor. Warm-started by copying the perfect-foresight decisions, from forecasts alone, and then fine-tuned by trial and error, it reaches {r.ppo_bc.gap_pct.toFixed(1)} %.</li>
        {r.ppo_bc.saving_vs_mpc_k && <li><b>The RL agent ties the optimiser.</b> It costs {fmtK(-r.ppo_bc.saving_vs_mpc_k[0])} a day more on average, with a 95 % interval of {fmtK(-r.ppo_bc.saving_vs_mpc_k[2])} to {fmtK(-r.ppo_bc.saving_vs_mpc_k[1])}, so the difference could go either way. It wins on {r.ppo_bc.beats_mpc_days} of the 100 days and decides {Math.round((r.mpc.decide_ms ?? 0) / (r.ppo_bc.decide_ms ?? 1))}× faster, without solving anything.</li>}
        {r.mpc_value.saving_vs_mpc_k && <li><b>Machine learning inside the optimiser wins.</b> The optimiser only looks 4 hours ahead, so it values energy left in the battery at a fixed price. Told instead what that energy will be worth, by a model trained on hindsight from 4,000 days, it saves {fmtK(r.mpc_value.saving_vs_mpc_k[0])} a day (95 % interval {fmtK(r.mpc_value.saving_vs_mpc_k[1])} to {fmtK(r.mpc_value.saving_vs_mpc_k[2])}). It is better on {r.mpc_value.beats_mpc_days} days and worse on {r.mpc_value.loses_mpc_days}. A small gain, but a real one.</li>}
        <li><b>A negative result.</b> An agent that learned corrections on top of the optimiser’s decisions (RL-MPC) never beat the optimiser it started from in 130 training rounds.</li>
        <li><b>Most of the remaining gap is forecast error.</b> Perfect foresight barely starts open-cycle gas ({Math.round(r.perfect.ocgt_MWh)} MWh a day). The forecast-driven dispatchers need {Math.round(r.mpc.ocgt_MWh)}–{Math.round(r.ppo_bc.ocgt_MWh)} MWh to cover what the forecasts missed. Better forecasts would be worth more than a better dispatcher.</li>
      </ul>
    </section>
  );
}
