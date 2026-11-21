import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { cityIndex, type CityIndexEntry } from '../city/load';
import { num } from '../lib/format';
import '../plants.css';
import '../city.css';

export default function Cities() {
  const [cities, setCities] = useState<CityIndexEntry[] | null>(null);
  useEffect(() => { cityIndex().then(setCities); }, []);
  const proto = cities?.filter((c) => c.kind === 'prototype') ?? [];
  const real = cities?.filter((c) => c.kind === 'real') ?? [];
  return (
    <main id="main" className="page cy-index">
      <header className="cy-ihead">
        <p className="pv-kicker">City models</p>
        <h1>How a city runs on power</h1>
        <p>Each city runs the same models: a full day of demand built up from homes, offices, industry, hospitals and street lights; the metro simulated train by train on its DC overhead line; the mobile network, EV charging and water supply; and a whole-city blackout where every system fails on its own clock. Real cities are built from OpenStreetMap and official population counts. Meridia is a made-up test city where each model is built first.</p>
      </header>

      {real.length > 0 && (
        <section className="cy-group">
          <h2>Real cities</h2>
          <ol className="cy-cities">{real.map((c) => <Card key={c.id} c={c} />)}</ol>
        </section>
      )}
      <section className="cy-group">
        <h2>Prototype</h2>
        <ol className="cy-cities">{proto.map((c) => <Card key={c.id} c={c} />)}</ol>
      </section>
      {!cities && <p className="cy-hint">Loading…</p>}
    </main>
  );
}

function Card({ c }: { c: CityIndexEntry }) {
  return (
    <li className={`cy-city cy-city-${c.kind}`}>
      <Link to={`/city/${c.id}`} className="cy-city-main">
        <span className={`cy-badge cy-badge-${c.kind}`}>{c.kind === 'prototype' ? 'Prototype · fictional' : `Real city · ${c.country}`}</span>
        <span className="cy-name">{c.name}</span>
        <span className="cy-blurb">{c.blurb}</span>
        <span className="cy-stats">{num(c.population / 1e6, 2)} million people · {c.districts} substation areas · {c.lines ? `${c.lines} metro line${c.lines > 1 ? 's' : ''}` : 'no metro yet'}</span>
      </Link>
      <span className="cy-city-models">
        <Link to={`/city/${c.id}`}>City Day</Link>
        {c.lines > 0 && <Link to={`/city/${c.id}/metro`}>Metro</Link>}
        <Link to={`/city/${c.id}/telecom`}>Phones</Link>
        <Link to={`/city/${c.id}/ev`}>EVs</Link>
        <Link to={`/city/${c.id}/water`}>Water</Link>
        <Link to={`/city/${c.id}/blackout`} className="hot">Blackout</Link>
      </span>
    </li>
  );
}
