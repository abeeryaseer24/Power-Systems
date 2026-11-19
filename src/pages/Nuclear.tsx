import { Link, useParams } from 'react-router-dom';
import { PLANTS, plantById } from '../nuclear/plants';
import ReactorRoom from '../nuclear/ReactorRoom';
import '../nuclear.css';

export default function Nuclear() {
  const { id } = useParams();
  if (id) {
    const p = plantById(id);
    if (!p) return <main id="main" className="page"><h1>Unknown plant</h1><Link to="/nuclear">All plants</Link></main>;
    return <PlantPage id={p.id} />;
  }
  return (
    <main id="main" className="page nuclear">
      <div className="page-head">
        <h1>Inside the reactor</h1>
        <p>How a nuclear plant turns fission into 50 hertz, why three of them failed, and how a new one will join the Bangladesh grid. Every plant runs on a live reactor model you can operate.</p>
      </div>
      <figure className="nuc-hero" aria-hidden="true">
        <svg viewBox="0 0 900 200">
          <g className="nh-flow">
            <text x="60" y="40">Fission</text><text x="250" y="40">Heat</text><text x="440" y="40">Steam</text><text x="630" y="40">Rotation</text><text x="800" y="40">50 Hz</text>
            <path d="M 110 34 L 230 34 M 300 34 L 420 34 M 500 34 L 610 34 M 710 34 L 785 34" />
          </g>
          <circle cx="80" cy="120" r="34" className="nh-core" />
          <path d="M 120 120 C 180 70, 220 170, 280 120 S 380 70, 440 120" className="nh-pipe" />
          <rect x="450" y="90" width="90" height="60" rx="20" className="nh-sg" />
          <path d="M 560 120 L 640 95 L 640 145 Z" className="nh-turb" />
          <circle cx="700" cy="120" r="26" className="nh-gen" />
          <path d="M 730 120 C 760 100, 780 140, 810 120 S 850 100, 880 120" className="nh-wave" />
        </svg>
      </figure>
      <ol className="plant-list">
        {PLANTS.map((p) => (
          <li key={p.id}>
            <Link to={`/nuclear/${p.id}`} className={`pl-card pl-${p.id}`}>
              <span className="pl-when">{p.when}</span>
              <span className="pl-name">{p.name}</span>
              <span className="pl-type">{p.type}</span>
              <span className="pl-hook">{p.hook}</span>
            </Link>
          </li>
        ))}
      </ol>
      <Link to="/reactor-startup" className="inst-link">
        <span className="pl-when">Minigame</span>
        <span className="pl-name">Bring Rooppur to full power</span>
        <span className="pl-hook">From cold shutdown to 1,200 MW: withdraw rods, watch the period, block the source range, synchronise the generator.</span>
      </Link>
      <Link to="/nuclear/instrumentation" className="inst-link">
        <span className="pl-when">Electronics</span>
        <span className="pl-name">Instrumentation and control</span>
        <span className="pl-hook">Neutron detectors across ten decades, two-out-of-four trip logic, and synchronising a generator to the grid.</span>
      </Link>
    </main>
  );
}

function PlantPage({ id }: { id: string }) {
  const p = plantById(id)!;
  return (
    <main id="main" className="page nuclear plant">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/nuclear">Nuclear</Link> <span aria-hidden="true">/</span> {p.name}</nav>
      <header className="plant-head">
        <h1>{p.name}</h1>
        <p className="lede">{p.place}. {p.type}.</p>
      </header>
      <ReactorRoom plant={p} />
      <div className="plant-body">
        <article className="prose">
          <h2>How it works</h2>
          {p.design.map((t, i) => <p key={i}>{t}</p>)}
          <h2>{p.id === 'rooppur' ? 'On the grid' : 'What happened'}</h2>
          {p.story.map((t, i) => <p key={i}>{t}</p>)}
          <h2>{p.id === 'rooppur' ? 'Why it matters' : 'What changed afterwards'}</h2>
          <ul>{p.lessons.map((t, i) => <li key={i}>{t}</li>)}</ul>
          <h2>Sources</h2>
          <ul className="sources">{p.sources.map((t, i) => <li key={i}>{t}</li>)}</ul>
          {p.region && <p><Link to={`/atlas/${p.region}`}>See the grid it connects to</Link></p>}
        </article>
        <aside className="plant-facts">
          <dl>
            {p.facts.map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
            <div><dt>Status</dt><dd>{p.status}</dd></div>
          </dl>
        </aside>
      </div>
    </main>
  );
}
