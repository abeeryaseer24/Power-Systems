import { Link, useParams } from 'react-router-dom';
import { LESSONS } from './learn/lessons';

export default function Learn() {
  const { topic } = useParams();
  const i = LESSONS.findIndex((l) => l.id === topic);
  if (i < 0) {
    return (
      <main id="main" className="page learn">
        <div className="page-head">
          <h1>How grids stay up</h1>
          <p>Five short lessons on the physics behind the control room, each with something to push and see what breaks. Read them in order or jump to the one you need.</p>
        </div>
        <ol className="lesson-list">
          {LESSONS.map((l, k) => (
            <li key={l.id}>
              <Link to={`/learn/${l.id}`}>
                <span className="ll-n">{k + 1}</span>
                <span className="ll-t">{l.title}</span>
                <span className="ll-h">{l.hook}</span>
              </Link>
            </li>
          ))}
        </ol>
      </main>
    );
  }
  const l = LESSONS[i];
  const next = LESSONS[i + 1];
  const prev = LESSONS[i - 1];
  const Body = l.body;
  return (
    <main id="main" className="page learn">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/learn">Learn</Link> <span aria-hidden="true">/</span> Lesson {i + 1} of {LESSONS.length}</nav>
      <article className="lesson prose">
        <h1>{l.title}</h1>
        <p className="lede">{l.hook}</p>
        <Body />
      </article>
      <nav className="lesson-nav" aria-label="Lessons">
        {prev ? <Link to={`/learn/${prev.id}`} className="btn ghost">Previous: {prev.title}</Link> : <span />}
        {next ? <Link to={`/learn/${next.id}`} className="btn primary">Next: {next.title}</Link> : <Link to="/shifts" className="btn primary">Try it in the control room</Link>}
      </nav>
    </main>
  );
}
