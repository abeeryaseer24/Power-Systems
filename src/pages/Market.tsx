import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import '../market.css';

// A stylised 25 GW system. Marginal cost = fuel price × heat rate + carbon price × emission factor + O&M.
interface Fleet { id: string; name: string; mw: number; color: string; zone: 'N' | 'S'; cost: (p: Prices) => number; avail?: (h: number, p: Prices) => number }
interface Prices { gas: number; coal: number; carbon: number; wind: number }

const solarShape = (h: number) => Math.max(0, Math.sin(((h - 6) / 12) * Math.PI));
const FLEET: Fleet[] = [
  { id: 'solar', name: 'Solar', mw: 5000, color: '#ffd27a', zone: 'S', cost: () => 0, avail: (h) => solarShape(h) * 0.85 },
  { id: 'wind', name: 'Wind', mw: 6000, color: '#86c5da', zone: 'N', cost: () => 0, avail: (_h, p) => p.wind },
  { id: 'hydro', name: 'Hydro (run of river)', mw: 1500, color: '#4f8fc0', zone: 'N', cost: () => 3 },
  { id: 'nuclear', name: 'Nuclear', mw: 2400, color: '#c9b8ff', zone: 'N', cost: () => 12 },
  { id: 'coal', name: 'Coal', mw: 4500, color: '#8b6b5a', zone: 'N', cost: (p) => p.coal * 9.5 + p.carbon * 0.9 + 4 },
  { id: 'ccgt', name: 'Gas combined cycle', mw: 9000, color: '#ffb04d', zone: 'S', cost: (p) => p.gas * 6.8 + p.carbon * 0.36 + 3 },
  { id: 'ocgt', name: 'Gas peakers', mw: 3500, color: '#ff8a3c', zone: 'S', cost: (p) => p.gas * 10.5 + p.carbon * 0.55 + 5 },
  { id: 'oil', name: 'Oil and diesel', mw: 1000, color: '#ff5b4f', zone: 'S', cost: (p) => 160 + p.carbon * 0.75 },
];
const CAP = 3000; // price cap, $/MWh: unserved energy
// demand through the day, MW (winter weekday shape)
const DEMAND = [14.2, 13.6, 13.2, 13.0, 13.2, 14.0, 15.8, 17.6, 18.4, 18.6, 18.5, 18.3, 18.0, 17.8, 17.7, 17.9, 18.8, 20.4, 21.6, 21.2, 20.0, 18.4, 16.6, 15.2].map((g) => g * 1000);

interface Block { f: Fleet; mw: number; cost: number }
function stack(h: number, p: Prices, zone?: 'N' | 'S'): Block[] {
  return FLEET.filter((f) => !zone || f.zone === zone)
    .map((f) => ({ f, mw: f.mw * (f.avail ? f.avail(h, p) : 0.92), cost: f.cost(p) }))
    .filter((b) => b.mw > 1)
    .sort((a, b) => a.cost - b.cost);
}
function clear(blocks: Block[], demand: number) {
  let left = demand;
  let price = 0;
  const run = new Map<string, number>();
  for (const b of blocks) {
    if (left <= 0) break;
    const take = Math.min(b.mw, left);
    run.set(b.f.id, take);
    left -= take;
    price = b.cost;
  }
  return { price: left > 0 ? CAP : price, short: Math.max(0, left), run };
}

const money = (x: number) => (x >= 1000 ? `$${(x / 1000).toFixed(1)}k` : `$${Math.round(x)}`);

export default function Market() {
  const [hour, setHour] = useState(18);
  const [p, setP] = useState<Prices>({ gas: 9, coal: 3, carbon: 30, wind: 0.35 });
  const [tie, setTie] = useState(4000);
  const [northShare, setNorthShare] = useState(0.3);
  const set = (k: keyof Prices) => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: Number(e.target.value) });

  const blocks = useMemo(() => stack(hour, p), [hour, p]);
  const demand = DEMAND[hour];
  const res = clear(blocks, demand);
  const day = useMemo(() => DEMAND.map((d, h) => clear(stack(h, p), d)), [p]);
  const totalMW = blocks.reduce((a, b) => a + b.mw, 0);
  const maxCost = Math.max(200, ...blocks.map((b) => b.cost)) * 1.1;

  // merit-order chart frame
  const W = 860;
  const H = 300;
  const xs = (mw: number) => (mw / Math.max(totalMW, demand * 1.05)) * W;
  const ys = (c: number) => H - (Math.min(c, maxCost) / maxCost) * H;
  let acc = 0;

  // two-zone market: north has the cheap plant, south has most of the load
  const twoZone = useMemo(() => {
    const dN = demand * northShare;
    const dS = demand - dN;
    const bN = stack(hour, p, 'N');
    const bS = stack(hour, p, 'S');
    // export from N as long as N's next block is cheaper than S's, up to the tie limit
    let lo = 0;
    let hi = Math.min(tie, Math.max(0, bN.reduce((a, b) => a + b.mw, 0) - dN));
    const priceAt = (flow: number) => ({ n: clear(bN, dN + flow).price, s: clear(bS, Math.max(0, dS - flow)).price });
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      const q = priceAt(mid);
      if (q.n < q.s) lo = mid;
      else hi = mid;
    }
    const flow = lo;
    const q = priceAt(flow);
    const congested = flow >= tie - 1 && q.s > q.n + 0.5;
    return { flow, pn: q.n, ps: q.s, congested, rent: congested ? (q.s - q.n) * flow : 0 };
  }, [hour, p, tie, northShare, demand]);

  const dayMax = Math.max(...day.map((d) => d.price), 100);
  return (
    <main id="main" className="page market">
      <div className="page-head">
        <h1>The price of a megawatt</h1>
        <p>Every half hour, power stations offer their output at the cost of making one more megawatt-hour. The market stacks the offers from cheapest to dearest and runs down the stack until demand is met. The last plant needed sets the price for everyone.</p>
      </div>

      <section className="mk-panel">
        <div className="mk-head">
          <h2>The merit order at {String(hour).padStart(2, '0')}:00</h2>
          <div className="mk-read">
            <div><span>Demand</span><strong>{(demand / 1000).toFixed(1)} GW</strong></div>
            <div><span>Clearing price</span><strong className={res.price >= CAP ? 'hot' : ''}>{money(res.price)}/MWh</strong></div>
            <div><span>Price setter</span><strong>{res.short > 0 ? 'Nobody: load is shed' : blocks.find((b) => b.cost === res.price)?.f.name}</strong></div>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H + 40}`} className="mk-svg" role="img" aria-label="Merit order stack">
          {blocks.map((b) => {
            const x0 = xs(acc);
            acc += b.mw;
            const ran = res.run.get(b.f.id) ?? 0;
            return (
              <g key={b.f.id}>
                <rect x={x0} y={ys(b.cost)} width={Math.max(1, xs(b.mw) - 2)} height={H - ys(b.cost) + 2} fill={b.f.color} opacity={ran > 0 ? 0.95 : 0.25} />
                {xs(b.mw) > 60 && <text x={x0 + 6} y={Math.min(H - 8, ys(b.cost) - 6)} className="mk-bl">{b.f.name}</text>}
              </g>
            );
          })}
          <line x1={xs(demand)} y1="0" x2={xs(demand)} y2={H} className="mk-demand" />
          <text x={xs(demand) + 6} y="16" className="mk-dl">demand</text>
          <line x1="0" y1={ys(Math.min(res.price, maxCost))} x2={W} y2={ys(Math.min(res.price, maxCost))} className="mk-price" />
          <line x1="0" y1={H} x2={W} y2={H} className="mk-axis" />
          {[0, 5, 10, 15, 20, 25].filter((g) => g * 1000 < Math.max(totalMW, demand * 1.05)).map((g) => <text key={g} x={xs(g * 1000)} y={H + 18} className="mk-ax">{g} GW</text>)}
          <text x={W} y={H + 34} className="mk-ax" textAnchor="end">Capacity, cheapest first →</text>
        </svg>
        <div className="w-controls">
          <label className="w-slider">Hour of day <output>{String(hour).padStart(2, '0')}:00</output><input type="range" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))} /></label>
          <label className="w-slider">Gas price <output>${p.gas}/GJ</output><input type="range" min={2} max={40} value={p.gas} onChange={set('gas')} /></label>
          <label className="w-slider">Carbon price <output>${p.carbon}/t CO₂</output><input type="range" min={0} max={200} step={5} value={p.carbon} onChange={set('carbon')} /></label>
          <label className="w-slider">Wind blowing <output>{Math.round(p.wind * 100)} %</output><input type="range" min={0} max={0.95} step={0.05} value={p.wind} onChange={set('wind')} /></label>
        </div>
        <p className="hint">Try the evening peak with no wind and gas at $35: that is roughly Europe in 2022. Then push the carbon price up and watch coal and gas swap places.</p>
      </section>

      <section className="mk-panel">
        <h2>The price through the day</h2>
        <svg viewBox="0 0 860 180" className="mk-svg" role="img" aria-label="Hourly prices">
          {day.map((d, h) => {
            const bh = (Math.min(d.price, dayMax) / dayMax) * 150;
            return (
              <g key={h} onClick={() => setHour(h)} className="mk-bar">
                <rect x={h * 35.8 + 2} y={160 - bh} width="31" height={bh} className={`${h === hour ? 'on' : ''} ${d.price >= CAP ? 'cap' : ''}`} />
                {h % 3 === 0 && <text x={h * 35.8 + 17} y="176" className="mk-ax" textAnchor="middle">{String(h).padStart(2, '0')}</text>}
              </g>
            );
          })}
        </svg>
        <p className="hint">Midday solar pushes the price toward zero; the evening peak, when the sun has set, is set by the gas peakers or worse. Bars at the cap mean demand outran supply and load had to be shed, as in <Link to="/academy/texas-2021">Texas in 2021</Link>, when prices sat at $9,000/MWh for days.</p>
      </section>

      <section className="mk-panel">
        <h2>When the wires run out</h2>
        <p className="mk-p">Split the system in two. The north has the wind, hydro, nuclear and coal. The south has the gas and most of the people. As long as the line between them has room, there is one price. When it fills up, the south must turn on its own expensive plant, and the two prices come apart. The difference, times the flow, is the congestion rent.</p>
        <div className="w-controls">
          <label className="w-slider">North–south transfer limit <output>{(tie / 1000).toFixed(1)} GW</output><input type="range" min={0} max={12000} step={250} value={tie} onChange={(e) => setTie(Number(e.target.value))} /></label>
          <label className="w-slider">Share of demand in the north <output>{Math.round(northShare * 100)} %</output><input type="range" min={0.1} max={0.6} step={0.05} value={northShare} onChange={(e) => setNorthShare(Number(e.target.value))} /></label>
        </div>
        <svg viewBox="0 0 860 170" className="mk-svg" role="img" aria-label="Two-zone prices">
          <rect x="40" y="30" width="250" height="110" rx="14" className="mk-zone" />
          <rect x="570" y="30" width="250" height="110" rx="14" className="mk-zone" />
          <text x="60" y="62" className="mk-zl">North</text>
          <text x="590" y="62" className="mk-zl">South</text>
          <text x="60" y="112" className="mk-zp">{money(twoZone.pn)}</text>
          <text x="590" y="112" className={`mk-zp ${twoZone.ps >= CAP ? 'hot' : ''}`}>{money(twoZone.ps)}</text>
          <line x1="290" y1="85" x2="570" y2="85" className={`mk-tie ${twoZone.congested ? 'full' : ''}`} />
          <text x="430" y="72" className="mk-ax" textAnchor="middle">{(twoZone.flow / 1000).toFixed(1)} GW →</text>
          <text x="430" y="108" className="mk-ax" textAnchor="middle">{twoZone.congested ? 'line full: prices split' : 'room to spare: one price'}</text>
        </svg>
        <p className={`mk-verdict ${twoZone.congested ? 'hot' : ''}`}>{twoZone.congested ? `Congestion rent ${money(twoZone.rent)} every hour, paid by southern consumers to whoever holds the transmission rights.` : 'The line has room. Both zones pay the same price.'}</p>
      </section>

      <p className="hint mk-foot">Stylised: a single energy-only auction with no start-up costs, ramp limits, reserves or bidding strategy. Real markets add all of these, and many (Bangladesh among them) use a single buyer instead of an auction.</p>
    </main>
  );
}
