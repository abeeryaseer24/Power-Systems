import { Link } from 'react-router-dom';
import { EVENTS } from '../grid/events';
import '../atlas.css';

const yearOf = (d: string) => Number(d.slice(-4));

export default function Blackouts() {
  const list = [...EVENTS].sort((a, b) => yearOf(a.date) - yearOf(b.date));
  return (
    <main id="main" className="page blackouts">
      <div className="page-head">
        <h1>The nights the lights went out</h1>
        <p>Twelve of the largest grid failures of the last fifty years, rebuilt on real network models from the investigation reports. Watch each one unfold second by second, or take the controls and try to stop it. The <Link to="/academy">case files</Link> explain why each one happened, and the <Link to="/documentary">documentaries</Link> tell the last minutes as a story.</p>
      </div>
      <ol className="bo-timeline">
        {list.map((e) => (
          <li key={e.id}>
            <span className="bo-year" aria-hidden="true">{yearOf(e.date)}</span>
            <Link to={`/blackouts/${e.id}`} className="bo-card">
              <span className="bo-when">{e.date}, {e.time}</span>
              <span className="bo-title">{e.title}</span>
              <span className="bo-hook">{e.hook}</span>
              <span className="bo-facts">
                <span><b>{e.people}</b> affected</span>
                <span><b>{e.duration}</b></span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
