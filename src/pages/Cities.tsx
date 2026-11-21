import { Link } from 'react-router-dom';
import { CITY, DISTRICTS, GRID_SUBS, LINES, polyLength } from '../city/meridia';
import { num } from '../lib/format';
import '../city.css';

const MODELS = [
  { to: '/city', no: '01', name: 'City Day', blurb: 'Twenty-four hours of demand, built up from homes, offices, industry, hospitals and street lights. Every lit window in the city is a number from the model.' },
  { to: '/city/metro', no: '02', name: 'Metro traction', blurb: 'Two elevated lines on 1500 V DC. Trains driven one by one, the overhead line solved every second: substations sharing load, braking trains feeding accelerating ones.' },
];

export default function Cities() {
  const km = LINES.reduce((a, l) => a + polyLength(l.path), 0) / 1000;
  return (
    <main id="main" className="page cy-index">
      <header className="cy-ihead">
        <p className="pv-kicker">Prototype cities</p>
        <h1>Meridia</h1>
        <p>A fictional coastal city on a subtropical bay, built to show how a modern city runs on electricity. The numbers are illustrative, calibrated to published figures for hot, dense cities. Each model is one system of the city, on its own page, sharing one clock and one grid.</p>
        <dl className="cy-facts">
          <div><dt>People</dt><dd>{num(CITY.population / 1e6, 2)} m</dd></div>
          <div><dt>Districts</dt><dd>{DISTRICTS.length}</dd></div>
          <div><dt>132/33 kV substations</dt><dd>{GRID_SUBS.length}</dd></div>
          <div><dt>Metro</dt><dd>{num(km, 1)} km</dd></div>
        </dl>
      </header>
      <ol className="cy-models">
        {MODELS.map((m) => (
          <li key={m.to}>
            <Link to={m.to}>
              <span className="cy-no">{m.no}</span>
              <span className="cy-name">{m.name}</span>
              <span className="cy-blurb">{m.blurb}</span>
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
