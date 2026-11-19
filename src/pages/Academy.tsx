import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EVENTS, eventById, stageEvent } from '../grid/events';
import { CASES, CAUSE_LABEL, caseById, type CauseKind } from '../grid/cases';
import { loadRegion, RegionSim, type RegionTrace } from '../grid/region';
import { LESSONS } from './learn/lessons';
import Traces from '../components/Traces';
import Anatomy from '../components/Anatomy';
import { episodeById } from '../grid/documentaries';
import '../atlas.css';
import '../academy.css';
import '../documentary.css';

const KINDS: CauseKind[] = ['trigger', 'weather', 'protection', 'people', 'planning', 'design'];

export default function Academy() {
  const { id } = useParams();
  if (id) return <CasePage id={id} />;
  const counts = KINDS.map((k) => ({ k, n: CASES.reduce((a, c) => a + c.causes.filter((x) => x.kind === k).length, 0) }));
  return (
    <main id="main" className="page academy">
      <div className="page-head">
        <h1>Case files</h1>
        <p>Why each blackout happened, step by step: the state of the grid beforehand, the sequence, the physics behind each step and the root causes the investigators found.</p>
      </div>
      <div className="cause-bar" aria-label="Root causes across all the blackouts">
        {counts.map(({ k, n }) => (
          <div key={k} className={`cb cb-${k}`} style={{ flexGrow: n }}>
            <strong>{n}</strong>
            <span>{CAUSE_LABEL[k]}</span>
          </div>
        ))}
      </div>
      <p className="muted small">Root causes counted across all the case files. Almost every blackout needs several at once.</p>
      <ol className="case-list">
        {EVENTS.map((e) => {
          const c = caseById(e.id);
          if (!c) return null;
          return (
            <li key={e.id}>
              <Link to={`/academy/${e.id}`} className="case-card">
                <span className="bo-when">{e.date}</span>
                <span className="cc-title">{e.title}</span>
                <span className="cc-verdict">{c.verdict}</span>
                <span className="cc-kinds">
                  {[...new Set(c.causes.map((x) => x.kind))].map((k) => <i key={k} className={`ck ck-${k}`}>{CAUSE_LABEL[k]}</i>)}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </main>
  );
}

function useReplayTrace(evId: string) {
  const [trace, setTrace] = useState<RegionTrace[]>([]);
  const [f0, setF0] = useState(50);
  const [state, setState] = useState<'loading' | 'running' | 'done' | 'error'>('loading');
  useEffect(() => {
    const ev = eventById(evId);
    if (!ev) return;
    let alive = true;
    loadRegion(ev.region)
      .then((data) => {
        if (!alive) return;
        const s = new RegionSim(data);
        stageEvent(s, ev, 'watch');
        setF0(s.f0);
        setState('running');
        const end = Math.min(ev.span, 420);
        // run in small chunks so the page stays responsive
        const chunk = () => {
          if (!alive) return;
          const t0 = performance.now();
          while (s.t < end && performance.now() - t0 < 12) s.advance(0.5);
          setTrace([...s.trace]);
          if (s.t < end) setTimeout(chunk, 0);
          else setState('done');
        };
        chunk();
      })
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, [evId]);
  return { trace, f0, state };
}

function CasePage({ id }: { id: string }) {
  const ev = eventById(id);
  const c = caseById(id);
  const sim = useReplayTrace(id);
  if (!ev || !c) return <main id="main" className="page"><h1>Unknown case</h1><Link to="/academy">All case files</Link></main>;
  const marks = ev.steps.map((s) => ({ t: s.t, label: s.label }));
  return (
    <main id="main" className="page academy case">
      <nav className="crumbs" aria-label="Breadcrumb"><Link to="/academy">Case files</Link> <span aria-hidden="true">/</span> {ev.where}, {ev.date.slice(-4)}</nav>
      <header className="case-head">
        <span className="bo-when">{ev.date}, {ev.time}</span>
        <h1>{ev.title}</h1>
        <p className="case-verdict">{c.verdict}</p>
        <dl className="case-numbers">
          {c.numbers.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <div className="brief-cta">
          <Link className="btn primary" to={`/blackouts/${ev.id}`}>Replay it on the map</Link>
          <Link className="btn ghost" to={`/atlas/${ev.region}`}>Explore this grid</Link>
        </div>
      </header>

      <section className="case-sec">
        <h2>Before</h2>
        <div className="prose">{c.before.map((p, i) => <p key={i}>{p}</p>)}</div>
      </section>

      <section className="case-sec">
        <h2>The sequence</h2>
        <ol className="case-seq">
          {c.sequence.map((s, i) => (
            <li key={i}><time>{s.time}</time><p>{s.text}</p></li>
          ))}
        </ol>
      </section>

      <Explainer id={id} />

      <section className="case-sec">
        <h2>In the simulator</h2>
        <p className="muted">The same sequence run through this project’s grid engine, on a reduced OpenStreetMap model. Red lines mark the reconstructed steps. {sim.state === 'running' ? 'Running…' : sim.state === 'error' ? 'The grid model could not be loaded.' : ''}</p>
        <div className="case-trace">
          <Traces trace={sim.trace} f0={sim.f0} tick={sim.trace.length} marks={marks} />
        </div>
      </section>

      <section className="case-sec">
        <h2>The physics</h2>
        <div className="mech-grid">
          {c.mechanisms.map((m, i) => {
            const lesson = LESSONS.find((l) => l.id === m.lesson);
            return (
              <article key={i} className="mech">
                <h3>{m.title}</h3>
                <p>{m.body}</p>
                {lesson && <Link to={`/learn/${lesson.id}`}>Lesson: {lesson.title}</Link>}
              </article>
            );
          })}
        </div>
      </section>

      <section className="case-sec">
        <h2>Root causes</h2>
        <ul className="causes">
          {c.causes.map((x, i) => (
            <li key={i} className={`ck-row ck-${x.kind}`}><i className={`ck ck-${x.kind}`}>{CAUSE_LABEL[x.kind]}</i><span>{x.text}</span></li>
          ))}
        </ul>
      </section>

      <section className="case-sec two">
        <div>
          <h2>Afterwards</h2>
          <div className="prose">{c.aftermath.map((p, i) => <p key={i}>{p}</p>)}</div>
        </div>
        <div>
          <h2>Could it happen again?</h2>
          <div className="prose"><p>{c.again}</p></div>
        </div>
      </section>

      <section className="case-sec">
        <h2>Sources</h2>
        <ul className="sources">{ev.sources.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </section>
    </main>
  );
}

function Explainer({ id }: { id: string }) {
  const ep = episodeById(id);
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(false);
  useEffect(() => {
    if (!auto || !ep) return;
    if (i >= ep.scenes.length - 1) {
      setAuto(false);
      return;
    }
    const t = setTimeout(() => setI(i + 1), 2600);
    return () => clearTimeout(t);
  }, [auto, i, ep]);
  if (!ep) return null;
  const sc = ep.scenes[i];
  return (
    <section className="case-sec">
      <h2>What failed, step by step</h2>
      <div className="explainer">
        <Anatomy ep={ep} upto={i} />
        <div className="ex-text" key={i}>
          <span className="ex-clock">{sc.clock}</span>
          <h3>{sc.title}</h3>
          {sc.body && <p>{sc.body}</p>}
          <div className="ex-ctl">
            <button className="btn ghost small" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>Previous</button>
            <span>{i + 1} / {ep.scenes.length}</span>
            <button className="btn ghost small" onClick={() => setI(Math.min(ep.scenes.length - 1, i + 1))} disabled={i === ep.scenes.length - 1}>Next</button>
            <button className="btn primary small" onClick={() => { if (i >= ep.scenes.length - 1) setI(0); setAuto(!auto); }}>{auto ? 'Pause' : 'Play'}</button>
            <Link to={`/documentary/${id}`}>Watch the documentary</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
