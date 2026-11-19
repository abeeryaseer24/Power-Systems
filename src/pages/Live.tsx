import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { markDone } from '../lib/career';
import '../live.css';

// Public, keyless, CORS-enabled feeds for Great Britain.
const ELEXON = 'https://data.elexon.co.uk/bmrs/api/v1';
const CARBON = 'https://api.carbonintensity.org.uk/intensity';

interface FreqPt { t: number; f: number }
interface Fuel { fuelType: string; currentUsage: number; currentPercentage: number }
interface DemandPt { startTime: string; demand: number }

const FUEL: Record<string, { label: string; color: string; group?: string }> = {
  CCGT: { label: 'Gas (combined cycle)', color: '#ffb04d' },
  OCGT: { label: 'Gas (peakers)', color: '#ff8a3c' },
  NUCLEAR: { label: 'Nuclear', color: '#c9b8ff' },
  WIND: { label: 'Wind', color: '#86c5da' },
  BIOMASS: { label: 'Biomass', color: '#9ccf7f' },
  NPSHYD: { label: 'Hydro', color: '#4f8fc0' },
  PS: { label: 'Pumped storage', color: '#3d6f99' },
  COAL: { label: 'Coal', color: '#8b6b5a' },
  OIL: { label: 'Oil', color: '#ff5b4f' },
  OTHER: { label: 'Other', color: '#8b9ab0' },
};
const isInter = (k: string) => k.startsWith('INT');

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** A half-dial from 49.5 to 50.5 Hz with the operating band marked. */
function Gauge({ f, rocof }: { f: number; rocof: number }) {
  const ang = (x: number) => Math.PI * (1 - (Math.max(49.5, Math.min(50.5, x)) - 49.5));
  const pt = (x: number, r: number) => [120 + r * Math.cos(ang(x)), 130 - r * Math.sin(ang(x))];
  const arc = (a: number, b: number, r: number) => {
    const [x0, y0] = pt(a, r);
    const [x1, y1] = pt(b, r);
    return `M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`;
  };
  const [nx, ny] = pt(f, 92);
  return (
    <svg viewBox="0 0 240 170" className="lv-gauge" role="img" aria-label={`Frequency ${f.toFixed(3)} hertz`}>
      <path d={arc(49.5, 50.5, 100)} className="lv-g-track" />
      <path d={arc(49.8, 50.2, 100)} className="lv-g-band" />
      {[49.5, 49.75, 50, 50.25, 50.5].map((x) => { const [a, b] = pt(x, 108); const [c, d] = pt(x, 116); return <line key={x} x1={a} y1={b} x2={c} y2={d} className="lv-g-tick" />; })}
      <text x="14" y="160" className="lv-ax">49.5</text>
      <text x="226" y="160" className="lv-ax" textAnchor="end">50.5</text>
      <line x1="120" y1="130" x2={nx} y2={ny} className="lv-g-needle" />
      <circle cx="120" cy="130" r="6" className="lv-g-hub" />
      <text x="120" y="112" className="lv-g-rocof" textAnchor="middle">{rocof >= 0 ? '+' : ''}{(rocof * 1000).toFixed(1)} mHz/s</text>
    </svg>
  );
}

export default function Live() {
  useEffect(() => markDone('visit:live'), []);
  const [freq, setFreq] = useState<FreqPt[]>([]);
  const [fuel, setFuel] = useState<Fuel[]>([]);
  const [demand, setDemand] = useState<DemandPt[]>([]);
  const [ci, setCi] = useState<{ actual: number | null; forecast: number; index: string } | null>(null);
  const [err, setErr] = useState('');
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let alive = true;
    const loadFreq = async () => {
      const to = new Date();
      const from = new Date(to.getTime() - 60 * 60 * 1000);
      const j = await getJSON<{ data: { measurementTime: string; frequency: number }[] }>(`${ELEXON}/system/frequency?from=${from.toISOString()}&to=${to.toISOString()}&format=json`);
      if (alive) setFreq(j.data.map((d) => ({ t: Date.parse(d.measurementTime), f: d.frequency })).sort((a, b) => a.t - b.t));
    };
    const loadRest = async () => {
      const [fu, de, c] = await Promise.all([
        getJSON<Fuel[]>(`${ELEXON}/generation/outturn/current?format=json`),
        getJSON<DemandPt[]>(`${ELEXON}/demand/outturn/summary?format=json`),
        getJSON<{ data: { intensity: { actual: number | null; forecast: number; index: string } }[] }>(CARBON),
      ]);
      if (!alive) return;
      setFuel(fu);
      setDemand(de);
      setCi(c.data[0]?.intensity ?? null);
    };
    const all = () => Promise.all([loadFreq(), loadRest()]).then(() => alive && (setUpdated(new Date()), setErr(''))).catch((e) => alive && setErr(String(e.message ?? e)));
    all();
    const a = setInterval(() => loadFreq().then(() => alive && setUpdated(new Date())).catch(() => {}), 15000);
    const b = setInterval(() => loadRest().catch(() => {}), 5 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(a);
      clearInterval(b);
    };
  }, []);

  const fNow = freq.length ? freq[freq.length - 1].f : 50;
  const rocof = freq.length > 1 ? (freq[freq.length - 1].f - freq[freq.length - 2].f) / 15 : 0;
  const fMin = freq.length ? Math.min(...freq.map((p) => p.f)) : 50;
  const fMax = freq.length ? Math.max(...freq.map((p) => p.f)) : 50;

  // generation mix, interconnectors grouped
  const home = fuel.filter((x) => !isInter(x.fuelType) && x.currentUsage > 0).sort((a, b) => b.currentUsage - a.currentUsage);
  const imports = fuel.filter((x) => isInter(x.fuelType)).reduce((a, x) => a + x.currentUsage, 0);
  const total = home.reduce((a, x) => a + x.currentUsage, 0) + Math.max(0, imports);
  const lowCarbon = home.filter((x) => ['NUCLEAR', 'WIND', 'NPSHYD', 'BIOMASS', 'PS'].includes(x.fuelType)).reduce((a, x) => a + x.currentUsage, 0);

  // frequency chart, last hour
  const W = 860;
  const H = 220;
  const t0 = freq.length ? freq[0].t : 0;
  const t1 = freq.length ? freq[freq.length - 1].t : 1;
  const fx = (t: number) => 40 + ((t - t0) / Math.max(1, t1 - t0)) * (W - 50);
  const fy = (f: number) => 10 + ((50.25 - Math.max(49.75, Math.min(50.25, f))) / 0.5) * (H - 30);
  const fPath = freq.map((p, i) => `${i ? 'L' : 'M'}${fx(p.t).toFixed(1)},${fy(p.f).toFixed(1)}`).join(' ');

  // demand, last two days
  const dem = demand.slice(-576);
  const dMax = Math.max(1, ...dem.map((d) => d.demand)) * 1.05;
  const dMin = Math.min(...dem.map((d) => d.demand), dMax) * 0.9;
  const dx = (i: number) => 40 + (i / Math.max(1, dem.length - 1)) * (W - 50);
  const dy = (v: number) => 10 + (1 - (v - dMin) / Math.max(1, dMax - dMin)) * (H - 30);
  const dPath = dem.map((d, i) => `${i ? 'L' : 'M'}${dx(i).toFixed(1)},${dy(d.demand).toFixed(1)}`).join(' ');

  return (
    <main id="main" className="page live">
      <div className="page-head">
        <h1>Great Britain, right now</h1>
        <p>Everything else in this project is a model. This page is not: it reads the real British grid as it runs, every fifteen seconds. <span className="lv-dot" aria-hidden="true" /> {updated ? `Updated ${updated.toLocaleTimeString()}` : 'Connecting…'}</p>
        {err && <p className="hint bad">The live feed could not be reached ({err}). It may be down for maintenance; try again shortly.</p>}
      </div>

      <section className="lv-top">
        <div className="lv-dial">
          <Gauge f={fNow} rocof={rocof} />
        </div>
        <div className="lv-kpis">
          <div><span>Frequency</span><strong>{fNow.toFixed(3)} Hz</strong><em>last hour {fMin.toFixed(3)} to {fMax.toFixed(3)}</em></div>
          <div><span>Generation</span><strong>{(total / 1000).toFixed(1)} GW</strong><em>{imports >= 0 ? `${(imports / 1000).toFixed(1)} GW imported` : `${(-imports / 1000).toFixed(1)} GW exported`}</em></div>
          <div><span>Low carbon</span><strong>{total ? Math.round((lowCarbon / total) * 100) : 0} %</strong><em>nuclear, wind, hydro, biomass, storage</em></div>
          <div><span>Carbon intensity</span><strong>{ci ? `${ci.actual ?? ci.forecast} g` : '…'}</strong><em>CO₂ per kWh, {ci?.index ?? ''}</em></div>
        </div>
      </section>

      <section className="lv-panel">
        <h2>Frequency, last hour</h2>
        <p className="hint">The statutory band is 49.5 to 50.5 Hz; operators aim to stay within 49.8 to 50.2. Every wiggle is the whole country’s supply and demand drifting apart and being pulled back.</p>
        <svg viewBox={`0 0 ${W} ${H}`} className="lv-svg" role="img" aria-label="Frequency over the last hour">
          <rect x="40" y={fy(50.2)} width={W - 50} height={fy(49.8) - fy(50.2)} className="lv-band" />
          {[49.8, 49.9, 50, 50.1, 50.2].map((f) => (
            <g key={f}><line x1="40" x2={W - 10} y1={fy(f)} y2={fy(f)} className={f === 50 ? 'lv-mid' : 'lv-grid'} /><text x="34" y={fy(f) + 4} className="lv-ax" textAnchor="end">{f.toFixed(1)}</text></g>
          ))}
          <path d={fPath} className="lv-f" />
          {freq.length > 0 && <circle cx={fx(t1)} cy={fy(fNow)} r="4" className="lv-now" />}
        </svg>
      </section>

      <section className="lv-panel">
        <h2>Where the power is coming from</h2>
        <div className="lv-mix" role="img" aria-label="Generation mix">
          {home.map((x) => (
            <i key={x.fuelType} style={{ flexGrow: x.currentUsage, background: FUEL[x.fuelType]?.color ?? '#8b9ab0' }} title={`${FUEL[x.fuelType]?.label ?? x.fuelType}: ${x.currentUsage} MW`} />
          ))}
          {imports > 0 && <i style={{ flexGrow: imports, background: 'repeating-linear-gradient(45deg, #ece6d8 0 4px, #8b9ab0 4px 8px)' }} title={`Imports: ${imports} MW`} />}
        </div>
        <ul className="lv-legend">
          {home.map((x) => (
            <li key={x.fuelType}><i style={{ background: FUEL[x.fuelType]?.color ?? '#8b9ab0' }} />{FUEL[x.fuelType]?.label ?? x.fuelType}<b>{(x.currentUsage / 1000).toFixed(1)} GW</b></li>
          ))}
          <li><i className="lv-int" />Interconnectors<b>{(imports / 1000).toFixed(1)} GW</b></li>
        </ul>
      </section>

      <section className="lv-panel">
        <h2>Demand, last two days</h2>
        <p className="hint">Transmission demand: what the national grid delivers, not counting rooftop solar and small generators inside the distribution networks, which is why sunny middays dip.</p>
        <svg viewBox={`0 0 ${W} ${H}`} className="lv-svg" role="img" aria-label="Demand over two days">
          {[0.25, 0.5, 0.75].map((k) => { const v = dMin + k * (dMax - dMin); return <g key={k}><line x1="40" x2={W - 10} y1={dy(v)} y2={dy(v)} className="lv-grid" /><text x="34" y={dy(v) + 4} className="lv-ax" textAnchor="end">{Math.round(v / 1000)} GW</text></g>; })}
          <path d={dPath} className="lv-d" />
        </svg>
      </section>

      <p className="hint lv-foot">Data: Elexon Insights Solution (BMRS) and the National Energy System Operator’s Carbon Intensity API, used under their open licences. Compare with the <Link to="/academy/gb-2019">9 August 2019 event</Link>, when frequency fell to 48.8 Hz.</p>
    </main>
  );
}
