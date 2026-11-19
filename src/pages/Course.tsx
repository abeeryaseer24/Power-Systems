import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CHAPTERS, PARTS, chapterById, type Question } from './course/chapters';
import '../course.css';

const KEY = 'blackstart.course.v1';
const loadDone = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
};
const saveDone = (d: string[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* ignore */
  }
};

export default function Course() {
  const { id } = useParams();
  const [done, setDone] = useState<string[]>(loadDone);
  const ch = id ? chapterById(id) : undefined;
  if (!ch) {
    return (
      <main id="main" className="page course">
        <div className="page-head">
          <h1>Power Systems 101</h1>
          <p>From what voltage is to how a country keeps its lights on, in fifteen short chapters. Each one has something to play with and two questions to check yourself. No book needed.</p>
        </div>
        <p className="muted">{done.length} of {CHAPTERS.length} chapters complete</p>
        {PARTS.map((part) => (
          <section key={part} className="co-part">
            <h2>{part}</h2>
            <ol className="co-list">
              {CHAPTERS.filter((c) => c.part === part).map((c) => (
                <li key={c.id} className={done.includes(c.id) ? 'done' : ''}>
                  <Link to={`/course/${c.id}`}>
                    <span className="co-n">{CHAPTERS.indexOf(c) + 1}</span>
                    <span className="co-t">{c.title}</span>
                    <span className="co-h">{c.hook}</span>
                    <span className="co-m">{c.minutes} min{done.includes(c.id) ? ', done' : ''}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </main>
    );
  }
  const i = CHAPTERS.indexOf(ch);
  const prev = CHAPTERS[i - 1];
  const next = CHAPTERS[i + 1];
  const Body = ch.body;
  const markDone = () => {
    if (done.includes(ch.id)) return;
    const d = [...done, ch.id];
    setDone(d);
    saveDone(d);
  };
  return (
    <main id="main" className="page learn course">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/course">Power Systems 101</Link> <span aria-hidden="true">/</span> Chapter {i + 1} of {CHAPTERS.length}</nav>
      <article className="lesson prose">
        <span className="co-partlabel">{ch.part}</span>
        <h1>{ch.title}</h1>
        <p className="lede">{ch.hook}</p>
        <Body />
        <section className="co-quiz">
          <h2>Check yourself</h2>
          {ch.quiz.map((q, k) => <Quiz key={`${ch.id}-${k}`} q={q} onRight={k === ch.quiz.length - 1 ? markDone : undefined} />)}
        </section>
        {ch.try && <p><Link to={ch.try.to}>{ch.try.label}</Link></p>}
      </article>
      <nav className="lesson-nav" aria-label="Chapters">
        {prev ? <Link to={`/course/${prev.id}`} className="btn ghost">Previous: {prev.title}</Link> : <span />}
        {next ? <Link to={`/course/${next.id}`} className="btn primary" onClick={markDone}>Next: {next.title}</Link> : <Link to="/course" className="btn primary" onClick={markDone}>Finish the course</Link>}
      </nav>
    </main>
  );
}

function Quiz({ q, onRight }: { q: Question; onRight?: () => void }) {
  const [pick, setPick] = useState<number | null>(null);
  return (
    <div className="co-q">
      <p><b>{q.q}</b></p>
      <div className="co-opts">
        {q.options.map((o, k) => (
          <button key={k} className={`chip ${pick === k ? (k === q.answer ? 'right' : 'wrong') : ''}`} onClick={() => { setPick(k); if (k === q.answer) onRight?.(); }}>{o}</button>
        ))}
      </div>
      {pick !== null && <p className={`hint ${pick === q.answer ? '' : 'bad'}`}>{pick === q.answer ? 'Right. ' : 'Not quite. '}{q.why}</p>}
    </div>
  );
}
