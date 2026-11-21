import { useMemo, useState } from 'react';
import { ascent, COMPARE, jetPowerGW, LV, propellantEnergy, siteLoad } from '../frontier/launch';
import { num } from '../lib/format';
import '../city.css';
import '../frontier.css';

export default function Launch() {
  const [asu, setAsu] = useState(40);
  const load = useMemo(() => siteLoad(asu), [asu]);
  const asc = useMemo(() => ascent(), []);
  const pe = propellantEnergy();
  const jet = jetPowerGW();
  const totalMWh = pe.loxMWh + pe.ch4MWh + pe.ln2MWh;
  const daysToMake = totalMWh / (asu * 24);
  const [sel, setSel] = useState(60);
  const a = asc[Math.min(asc.length - 1, sel)];
  const W = 1000, H = 120, maxMW = Math.max(...load.map((p) => p.mw)) * 1.1;
  const x = (t: number) => ((t + 48) / 54) * W;
  const pts = load.filter((_, i) => i % 5 === 0).map((p) => `${x(p.t).toFixed(1)},${(H - (p.mw / maxMW) * H).toFixed(1)}`).join(' ');
  const logx = (gw: number) => (Math.log10(gw) + 0.5) / (Math.log10(400) + 0.5);

  return (
    <main id="main" className="page fr-page">
      <header className="fr-head">
        <p className="pv-kicker">Frontier · Launch day</p>
        <h1>The power behind a launch</h1>
        <p>A heavy launcher burns 4,600 tonnes of liquid methane and liquid oxygen in a few minutes. Making and chilling that propellant is an industrial power load that runs for days before launch. The rocket itself, at liftoff, puts out more power than most national grids. Illustrative figures from public data for methane and oxygen launchers, not any one company's site.</p>
      </header>

      <section className="fr-stats">
        <div><span>Propellant</span><b>{num(LV.propellantT)} t</b><small>{Math.round(LV.loxShare * 100)} % liquid oxygen</small></div>
        <div><span>Energy to make it</span><b>{num(totalMWh / 1000, 1)} GWh</b><small>oxygen {num(pe.loxMWh)} MWh, methane {num(pe.ch4MWh)}, nitrogen {num(pe.ln2MWh)}</small></div>
        <div><span>At {asu} MW</span><b>{num(daysToMake, 1)} days</b><small>for the on-site plant to make one launch’s worth</small></div>
        <div><span>Jet power at liftoff</span><b>{num(jet)} GW</b><small>½ × thrust × exhaust speed</small></div>
      </section>

      <section className="fr-block">
        <h2>Site load, two days before to six hours after</h2>
        <svg viewBox={`0 0 ${W} ${H + 20}`} className="fr-chart" preserveAspectRatio="none">
          {[-48, -36, -24, -12, 0].map((t) => <g key={t} className="cy-axis"><line x1={x(t)} x2={x(t)} y1={0} y2={H} /><text x={x(t) + 3} y={H + 14}>{t === 0 ? 'T-0' : `T${t} h`}</text></g>)}
          <polyline points={`0,${H} ${pts} ${W},${H}`} className="fr-area" />
          <line x1={x(0)} x2={x(0)} y1={0} y2={H} className="fr-t0" />
        </svg>
        <p className="cy-hint">The air separation plant runs flat out for days, filling the tank farm. In the last 45 minutes, cryogenic pumps load the vehicle at several tonnes a second; at liftoff, deluge pumps flood the pad with water to soak up sound and heat. Peak {num(maxMW / 1.1)} MW: a small town.
          <label className="fr-in">Air separation plant <select value={asu} onChange={(e) => setAsu(Number(e.target.value))}>{[20, 40, 80].map((v) => <option key={v} value={v}>{v} MW</option>)}</select></label></p>
      </section>

      <section className="fr-block">
        <h2>Liftoff, against whole national grids</h2>
        <ul className="fr-bars">
          {[...COMPARE, { name: 'Launcher at liftoff (exhaust jet power)', gw: jet }].sort((p, q) => p.gw - q.gw).map((c) => (
            <li key={c.name} className={c.name.startsWith('Launcher') ? 'hot' : ''}><span>{c.name}</span><i style={{ width: `${logx(c.gw) * 100}%` }} /><b>{num(c.gw)} GW</b></li>
          ))}
        </ul>
        <p className="cy-hint">Log scale. The comparison is with electrical demand; the rocket’s power is the kinetic energy carried away by its exhaust each second. Almost none of it ends up in the vehicle at first: at liftoff it is barely moving.</p>
      </section>

      <section className="fr-block">
        <h2>The first {LV.burn} seconds: where the power goes</h2>
        <input type="range" min={0} max={asc.length - 1} value={sel} onChange={(e) => setSel(Number(e.target.value))} className="fr-range" aria-label="Seconds after liftoff" />
        <div className="fr-stats fr-small">
          <div><span>T+</span><b>{a.t} s</b></div>
          <div><span>Speed</span><b>{num(a.v * 3.6)} km/h</b></div>
          <div><span>Altitude</span><b>{num(a.h / 1000, 1)} km</b></div>
          <div><span>Power into the vehicle</span><b>{num(a.vehGW)} GW</b><small>thrust × speed: {Math.round((a.vehGW / a.jetGW) * 100)} % of jet power</small></div>
        </div>
        <p className="cy-hint">A simplified vertical ascent with drag and gravity, for scale. As the vehicle speeds up, more of the engines’ power goes into it rather than into the exhaust.</p>
      </section>
    </main>
  );
}
