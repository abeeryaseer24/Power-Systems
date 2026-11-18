import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Plot, Slider, Tex, swing } from './kit';
import { solve } from '../../grid/loadflow';

export interface Lesson {
  id: string;
  title: string;
  hook: string;
  body: () => ReactNode;
}

// ------------------------------------------------------------ 1. frequency

function FrequencyWidget() {
  const [H, setH] = useState(5);
  const [loss, setLoss] = useState(600);
  const [gov, setGov] = useState(1300);
  const [ffr, setFfr] = useState(0);
  const r = useMemo(() => swing({ H, S: 3200, load: 3000, loss, gov, Tg: 4, ffr }), [H, loss, gov, ffr]);
  return (
    <div className="widget">
      <div className="w-controls">
        <Slider label="System inertia H" value={H} min={1.5} max={8} step={0.5} unit="s" onChange={setH} />
        <Slider label="Generation lost" value={loss} min={100} max={1200} step={50} unit="MW" onChange={setLoss} />
        <Slider label="Governor response" value={gov} min={200} max={1600} step={50} unit="MW/Hz" onChange={setGov} />
        <Slider label="Battery fast response" value={ffr} min={0} max={500} step={25} unit="MW" onChange={setFfr} />
      </div>
      <Plot
        series={[{ pts: r.pts, cls: 's-main' }]}
        xr={[0, 60]} yr={[48, 50.3]} xl="seconds" yl="Hz" xt={[0, 10, 20, 30, 40, 50, 60]} yt={[48, 48.5, 49, 49.5, 50]}
        yfmt={(v) => v.toFixed(1)}
        marks={[{ y: 48.8, cls: 'm-trip', label: 'Load shedding starts, 48.8 Hz' }, { y: 49.8, cls: 'm-op', label: 'Operational limit' }]}
      />
      <div className="w-read">
        <div><span>Initial RoCoF</span><strong>{r.rocof0.toFixed(2)} Hz/s</strong></div>
        <div><span>Nadir</span><strong className={r.nadir < 48.8 ? 'bad' : ''}>{r.collapsed ? 'Collapse' : `${r.nadir.toFixed(2)} Hz`}</strong></div>
        <div><span>Settles at</span><strong>{r.collapsed ? '—' : `${r.settle.toFixed(2)} Hz`}</strong></div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ 2. power flow

function FlowWidget() {
  const [gen, setGen] = useState(800);
  const [xTop, setXTop] = useState(0.05);
  const [open, setOpen] = useState<string | null>(null);
  // buses: 0 gen (west), 1 north, 2 south, 3 load (east); lines: 0-1, 1-3, 0-2, 2-3, 1-2
  const lines = [
    { id: 'a', f: 0, t: 1, x: xTop, r: 500 },
    { id: 'b', f: 1, t: 3, x: xTop, r: 500 },
    { id: 'c', f: 0, t: 2, x: 0.05, r: 500 },
    { id: 'd', f: 2, t: 3, x: 0.05, r: 500 },
    { id: 'e', f: 1, t: 2, x: 0.08, r: 300 },
  ];
  const P = [gen, 0, 0, -gen];
  const live = lines.filter((l) => l.id !== open);
  // slack = bus 0
  const B = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const l of live) {
    const y = 1 / l.x;
    const i = l.f - 1;
    const j = l.t - 1;
    if (i >= 0) B[i][i] += y;
    if (j >= 0) B[j][j] += y;
    if (i >= 0 && j >= 0) {
      B[i][j] -= y;
      B[j][i] -= y;
    }
  }
  const th = [0, ...solve(B.map((r) => [...r]), P.slice(1).map((p) => p / 100))];
  const flow = (l: (typeof lines)[0]) => (l.id === open ? 0 : ((th[l.f] - th[l.t]) / l.x) * 100);
  const pos = [[60, 150], [260, 50], [260, 250], [460, 150]];
  return (
    <div className="widget">
      <div className="w-controls">
        <Slider label="Transfer west to east" value={gen} min={0} max={1200} step={20} unit="MW" onChange={setGen} />
        <Slider label="Reactance of the northern route" value={xTop} min={0.02} max={0.15} step={0.005} unit="pu" onChange={setXTop} fmt={(v) => v.toFixed(3)} />
        <p className="hint">Click a line to open its breaker.</p>
      </div>
      <svg viewBox="0 0 520 300" className="flow-svg" role="img" aria-label="Four-bus network showing how flow divides">
        {lines.map((l) => {
          const [x1, y1] = pos[l.f];
          const [x2, y2] = pos[l.t];
          const fl = flow(l);
          const load = Math.abs(fl) / l.r;
          const cls = l.id === open ? 'fl open' : load > 1 ? 'fl over' : load > 0.85 ? 'fl warm' : 'fl';
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI + (fl < 0 ? 180 : 0);
          return (
            <g key={l.id} className={cls} onClick={() => setOpen(open === l.id ? null : l.id)} role="button" tabIndex={0} aria-label={`Line ${l.id}, ${Math.round(Math.abs(fl))} MW. Press to toggle the breaker.`}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen(open === l.id ? null : l.id)}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} className="fl-hit" />
              <line x1={x1} y1={y1} x2={x2} y2={y2} className="fl-wire" />
              {l.id !== open && Math.abs(fl) > 1 && <path d="M-7,-6 L5,0 L-7,6" transform={`translate(${mx},${my}) rotate(${ang})`} className="fl-arrow" />}
              <text x={mx} y={my - 12} textAnchor="middle">{l.id === open ? 'open' : `${Math.round(Math.abs(fl))} MW`}</text>
              <text x={mx} y={my + 22} textAnchor="middle" className="fl-r">of {l.r}</text>
            </g>
          );
        })}
        {pos.map(([x, y], i) => (
          <g key={i}>
            <rect x={x - 9} y={y - 9} width={18} height={18} className={i === 0 ? 'bus gen' : i === 3 ? 'bus load' : 'bus'} />
            <text x={x} y={y + (i === 2 ? 34 : -18)} textAnchor="middle" className="bus-l">{['Generator', 'North', 'South', 'City'][i]}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ------------------------------------------------------------ 3. cascades

function CascadeWidget() {
  const [transfer, setTransfer] = useState(1500);
  const [t, setT] = useState(0);
  const [run, setRun] = useState(false);
  const state = useRef({ closed: [true, true, true], heat: [0, 0, 0], log: [] as string[] });
  const ratings = [700, 650, 600];
  const xs = [0.05, 0.05, 0.05];
  const raf = useRef(0);
  const reset = () => {
    state.current = { closed: [true, true, true], heat: [0, 0, 0], log: [] };
    setT(0);
    setRun(false);
  };
  const flows = () => {
    const st = state.current;
    const ysum = xs.reduce((a, x, i) => a + (st.closed[i] ? 1 / x : 0), 0);
    return xs.map((x, i) => (st.closed[i] && ysum ? (transfer * (1 / x)) / ysum : 0));
  };
  useEffect(() => {
    if (!run) return;
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      const dtReal = Math.min(0.1, (now - last) / 1000);
      last = now;
      const dt = dtReal * 40; // 40x real time
      const st = state.current;
      const f = flows();
      f.forEach((fl, i) => {
        if (!st.closed[i]) return;
        const L = fl / ratings[i];
        if (L > 1) st.heat[i] += ((L * L - 1) / 240) * dt;
        if (st.heat[i] >= 1 || L > 2.3) {
          st.closed[i] = false;
          st.log.push(`Line ${i + 1} tripped at ${Math.round(L * 100)} % loading`);
        }
      });
      setT((x) => x + dt);
      if (st.closed.some(Boolean)) raf.current = requestAnimationFrame(step);
      else {
        st.log.push('All three circuits are open. The city on the far side is islanded.');
        setRun(false);
      }
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, transfer]);
  const st = state.current;
  const f = flows();
  const curve: [number, number][] = [];
  for (let L = 1.02; L <= 2.3; L += 0.02) curve.push([L * 100, 240 / (L * L - 1) / 60]);
  return (
    <div className="widget">
      <div className="w-controls">
        <Slider label="Power crossing the corridor" value={transfer} min={600} max={1900} step={50} unit="MW" onChange={(v) => { setTransfer(v); }} />
        <div className="w-buttons">
          <button className="btn primary" onClick={() => {
            if (st.closed[0]) {
              st.closed[0] = false;
              st.log.push('A lightning strike trips line 1');
            }
            setRun(true);
          }} disabled={!st.closed[0]}>Trip line 1</button>
          <button className="btn ghost" onClick={reset}>Reset</button>
        </div>
      </div>
      <div className="cascade">
        {[0, 1, 2].map((i) => {
          const L = f[i] / ratings[i];
          return (
            <div key={i} className={`cc-line ${!st.closed[i] ? 'open' : L > 1 ? 'over' : L > 0.85 ? 'warm' : ''}`}>
              <span>Line {i + 1}</span>
              <div className="cc-bar"><i style={{ width: `${Math.min(150, L * 100) / 1.5}%` }} /><b style={{ left: `${100 / 1.5}%` }} /></div>
              <strong>{st.closed[i] ? `${Math.round(f[i])} of ${ratings[i]} MW` : 'Open'}</strong>
              <div className="cc-heat" aria-label="Conductor heat"><i style={{ width: `${Math.min(1, st.heat[i]) * 100}%` }} /></div>
            </div>
          );
        })}
        <p className="cc-time">{t > 0 ? `${Math.floor(t / 60)} min ${Math.floor(t % 60)} s after the fault` : 'Before the fault'}</p>
        <ol className="cc-log">{st.log.map((l, i) => <li key={i}>{l}</li>)}</ol>
      </div>
      <Plot
        series={[{ pts: curve, cls: 's-main' }]}
        xr={[100, 230]} yr={[0, 12]} xl="loading, % of rating" yl="minutes to trip" xt={[100, 125, 150, 175, 200, 225]} yt={[0, 3, 6, 9, 12]}
        h={220}
      />
    </div>
  );
}

// ------------------------------------------------------------ 4. merit order

const STACK = [
  { name: 'Wind', cap: 900, cost: 0, co2: 0, cls: 'k-wind', ren: 'wind' },
  { name: 'Solar', cap: 600, cost: 0, co2: 0, cls: 'k-solar', ren: 'solar' },
  { name: 'Nuclear', cap: 1200, cost: 11, co2: 0, cls: 'k-nuclear' },
  { name: 'Hydro', cap: 500, cost: 45, co2: 0, cls: 'k-hydro' },
  { name: 'Combined cycle gas', cap: 840, cost: 72, co2: 360, cls: 'k-ccgt' },
  { name: 'Coal', cap: 800, cost: 88, co2: 910, cls: 'k-coal' },
  { name: 'Imports', cap: 500, cost: 120, co2: 300, cls: 'k-link' },
  { name: 'Peaking gas', cap: 240, cost: 165, co2: 560, cls: 'k-ocgt' },
];

function MeritWidget() {
  const [demand, setDemand] = useState(2900);
  const [wind, setWind] = useState(0.4);
  const [sun, setSun] = useState(0.5);
  const blocks = STACK.map((s) => ({ ...s, avail: s.ren === 'wind' ? s.cap * wind : s.ren === 'solar' ? s.cap * sun : s.cap }));
  let acc = 0;
  let price = 0;
  let co2 = 0;
  let served = 0;
  let marginal = '';
  const placed = blocks.map((b) => {
    const x0 = acc;
    acc += b.avail;
    const used = Math.max(0, Math.min(b.avail, demand - x0));
    if (used > 0) {
      price = b.cost;
      marginal = b.name;
      co2 += used * b.co2;
      served += used;
    }
    return { ...b, x0, used };
  });
  const total = acc;
  const W = 640;
  const Hh = 240;
  const X = (mwv: number) => 40 + (mwv / 5600) * (W - 50);
  const Y = (c: number) => Hh - 30 - (c / 180) * (Hh - 50);
  return (
    <div className="widget">
      <div className="w-controls">
        <Slider label="Demand" value={demand} min={1500} max={5000} step={50} unit="MW" onChange={setDemand} />
        <Slider label="Wind" value={wind} min={0} max={1} step={0.05} unit="" fmt={(v) => `${Math.round(v * 100)} %`} onChange={setWind} />
        <Slider label="Sun" value={sun} min={0} max={1} step={0.05} unit="" fmt={(v) => `${Math.round(v * 100)} %`} onChange={setSun} />
      </div>
      <svg viewBox={`0 0 ${W} ${Hh}`} className="plot merit" role="img" aria-label="Merit order supply stack">
        <g className="axes">
          {[0, 50, 100, 150].map((c) => (
            <g key={c}><line x1={40} x2={W - 10} y1={Y(c)} y2={Y(c)} /><text x={34} y={Y(c) + 4} textAnchor="end">€{c}</text></g>
          ))}
          {[0, 1000, 2000, 3000, 4000, 5000].map((m) => <text key={m} x={X(m)} y={Hh - 10} textAnchor="middle">{m / 1000} GW</text>)}
        </g>
        {placed.map((b) => (
          <g key={b.name}>
            <rect x={X(b.x0)} width={Math.max(0, X(b.x0 + b.avail) - X(b.x0) - 1)} y={Y(Math.max(b.cost, 3))} height={Hh - 30 - Y(Math.max(b.cost, 3))} className={`mb ${b.cls} ${b.used > 0 ? 'used' : ''}`} />
          </g>
        ))}
        <line x1={X(demand)} x2={X(demand)} y1={14} y2={Hh - 30} className="m-demand" />
        <text x={X(demand) + 6} y={24} className="m-demand-l">Demand</text>
      </svg>
      <div className="w-read">
        <div><span>Clearing price</span><strong>{demand > total ? 'Shortage' : `€${price}/MWh`}</strong></div>
        <div><span>Marginal plant</span><strong>{demand > total ? 'None left' : marginal}</strong></div>
        <div><span>Carbon intensity</span><strong>{served ? Math.round(co2 / served) : 0} g/kWh</strong></div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ 5. black start

function BlackstartWidget() {
  const [units, setUnits] = useState(1);
  const [block, setBlock] = useState(25);
  const [steps, setSteps] = useState<{ t: number; dP: number }[]>([]);
  const S = 125 * units;
  const r = useMemo(() => swing({ H: 3.5, S: S / 0.9, load: Math.max(10, steps.reduce((a, s) => a + s.dP, 0)), loss: 0, gov: S / (0.03 * 50), Tg: 3, tEnd: Math.max(20, (steps.at(-1)?.t ?? 0) + 15), steps }), [S, steps]);
  const picked = steps.reduce((a, s) => a + s.dP, 0);
  const tNext = (steps.at(-1)?.t ?? 0) + 8;
  return (
    <div className="widget">
      <div className="w-controls">
        <Slider label="Hydro units running" value={units} min={1} max={4} step={1} unit="" onChange={(v) => { setUnits(v); setSteps([]); }} />
        <Slider label="Size of each load block" value={block} min={5} max={120} step={5} unit="MW" onChange={setBlock} />
        <div className="w-buttons">
          <button className="btn primary" onClick={() => setSteps([...steps, { t: steps.length ? tNext : 2, dP: block }])} disabled={r.collapsed || picked + block > S}>
            Reconnect a block
          </button>
          <button className="btn ghost" onClick={() => setSteps([])}>Start over</button>
        </div>
      </div>
      <Plot
        series={[{ pts: r.pts, cls: r.collapsed ? 's-bad' : 's-main' }]}
        xr={[0, Math.max(20, (steps.at(-1)?.t ?? 0) + 15)]} yr={[46, 50.5]} xl="seconds" yl="Hz"
        xt={[]} yt={[46, 47, 48, 49, 50]}
        marks={[{ y: 47.5, cls: 'm-trip', label: 'Generator protection trips at 47.5 Hz' }]}
      />
      <div className="w-read">
        <div><span>Island size</span><strong>{units * 125} MW of machines</strong></div>
        <div><span>Load picked up</span><strong>{picked} MW</strong></div>
        <div><span>Lowest frequency</span><strong className={r.collapsed ? 'bad' : ''}>{r.collapsed ? 'Collapsed' : `${r.nadir.toFixed(2)} Hz`}</strong></div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ text

export const LESSONS: Lesson[] = [
  {
    id: 'frequency',
    title: 'Fifty hertz is a balance sheet',
    hook: 'Why frequency falls when a power station trips, and what decides how far.',
    body: () => (
      <>
        <p>Every generator on an AC grid spins in lockstep. In Halvern that is 3,000 revolutions a minute for a two-pole machine, fifty cycles a second. Their speed is the grid's frequency, and it is the only thing every device on the network can measure at once.</p>
        <p>When generation and demand match exactly, frequency holds still. When a 600 MW unit trips, the remaining machines are suddenly asked for 600 MW more than their turbines are giving them. The difference comes out of the kinetic energy stored in their spinning rotors, and they slow down. The swing equation says how fast:</p>
        <Tex block>{String.raw`\frac{2H}{f_0}\,\frac{df}{dt} = \frac{P_m - P_e}{S}`}</Tex>
        <p><Tex>H</Tex> is the inertia constant: how many seconds a machine could supply its rated power from its stored kinetic energy alone. The initial rate of change of frequency, RoCoF, depends only on inertia and the size of the loss. Governors are what stop the fall. Each one opens its steam or water valves in proportion to the frequency error, with a lag of a few seconds.</p>
        <FrequencyWidget />
        <p>Halve the inertia and the same loss produces twice the RoCoF and a deeper nadir. This is the core problem of a grid running on wind and solar: inverters have no spinning mass, so the system gets lighter as they replace coal and gas. Fast battery response is the fix: it reacts in a fraction of a second, before the frequency has had time to fall far.</p>
        <p>Governors alone settle the frequency below 50 Hz, because droop control needs an error to produce a response. Automatic generation control then slowly raises setpoints over the next minutes to bring it back. In the control room, AGC is the integrator you see creeping on each plant's panel.</p>
      </>
    ),
  },
  {
    id: 'powerflow',
    title: 'Power goes where it wants',
    hook: 'Electricity divides across parallel routes by their impedance, not by anyone’s plan.',
    body: () => (
      <>
        <p>You can't route electricity the way you route trucks. When power leaves a generator, it splits across every available path to the load in inverse proportion to each path's impedance. For a transmission network, the DC load flow approximation captures this well:</p>
        <Tex block>{String.raw`P_{ij} = \frac{\theta_i - \theta_j}{X_{ij}}, \qquad \mathbf{P} = \mathbf{B}\,\boldsymbol{\theta}`}</Tex>
        <p>Each bus has a voltage angle <Tex>{String.raw`\theta`}</Tex>. Flow on a line is the angle difference across it divided by its reactance. Solve the linear system for the angles and every flow follows. This is exactly what the control room solves twenty times a second.</p>
        <FlowWidget />
        <p>Raise the reactance of the northern route and more power is pushed south. Open one line and its flow does not disappear; it jumps onto its neighbours at once. That is the first step of every cascading blackout.</p>
      </>
    ),
  },
  {
    id: 'cascade',
    title: 'How one line takes out a city',
    hook: 'Thermal limits, inverse-time protection and the domino effect.',
    body: () => (
      <>
        <p>A line's rating is a thermal limit. Current heats the conductor, the aluminium expands, and the line sags toward trees and the ground. A modest overload is tolerable for minutes, a big one for seconds. Protection follows an inverse-time curve, and this simulator models the conductor's heat as</p>
        <Tex block>{String.raw`\frac{dh}{dt} = \frac{L^2 - 1}{\tau}, \qquad \text{trip when } h \ge 1`}</Tex>
        <p>where <Tex>L</Tex> is loading as a fraction of rating and <Tex>{String.raw`\tau`}</Tex> is 240 seconds. Three circuits share a corridor below. Push power across it, then trip one.</p>
        <CascadeWidget />
        <p>Lose one circuit and the other two take its share. If that overloads them, the clock starts. The weakest trips first, the last one is left carrying everything, and it trips in seconds. Operators plan for this with the N−1 rule: the system must survive the loss of any single element without overloading anything else.</p>
      </>
    ),
  },
  {
    id: 'merit',
    title: 'Who gets to run',
    hook: 'The merit order, marginal pricing and why wind lowers prices.',
    body: () => (
      <>
        <p>Every plant has a short-run marginal cost: the fuel and carbon price of one more megawatt-hour. Wind and solar cost almost nothing at the margin, nuclear very little, then hydro, gas, coal and finally the peaking turbines that only run a few hours a year. Stack them from cheapest to dearest and the point where the stack meets demand sets the price for everyone.</p>
        <MeritWidget />
        <p>Turn the wind up and the whole stack shifts right, pushing an expensive plant out of the market and dropping the price. Turn it down on a winter evening with high demand, and the last megawatts come from the peakers at many times the average cost. The control room tracks this as your average cost per megawatt-hour.</p>
      </>
    ),
  },
  {
    id: 'blackstart',
    title: 'Restarting from nothing',
    hook: 'How operators rebuild a grid after a total blackout.',
    body: () => (
      <>
        <p>Most power stations need power to start. Coal mills, cooling pumps and gas compressors run on electricity from the grid. After a total blackout there is none, so restoration begins at a few plants that can start on their own: hydro stations, some gas turbines with diesel starters, and now batteries with grid-forming inverters.</p>
        <p>A single hydro unit forms a tiny island with very little inertia. Every block of demand reconnected to it is, to the machine, a sudden loss of generation of the same size. Too big a block and the frequency collapses before the governor can open the gates.</p>
        <BlackstartWidget />
        <p>Larger islands absorb larger blocks, which is why restoration snowballs: each plant synchronised makes the next pickup safer. Cold load pickup makes it harder in real life, since fridges, heaters and pumps that have been off all draw extra current when they come back. In the Black start shift you do this for all of Halvern.</p>
      </>
    ),
  },
];
