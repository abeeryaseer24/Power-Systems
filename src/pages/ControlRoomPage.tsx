import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { REPLAYS, type Replay } from '../controlroom/timelines';
import type { ControlRoom } from '../controlroom/ControlRoom';
import '../plants.css';
import '../controlroom.css';

export default function ControlRoomPage() {
  const { id = '' } = useParams();
  const rp = REPLAYS[id];
  if (!rp) {
    return (
      <main id="main" className="page cr-index">
        <p className="pv-kicker">Control rooms</p>
        <h1>Sit at the desk</h1>
        <p>Replay two accidents from the operators’ chairs, instrument by instrument.</p>
        <ul>
          {Object.values(REPLAYS).map((r) => (
            <li key={r.id}><Link to={`/control-room/${r.id}`}><strong>{r.plant}</strong><span>{r.date} · {r.title}</span></Link></li>
          ))}
        </ul>
      </main>
    );
  }
  return <Room key={rp.id} rp={rp} />;
}

function Room({ rp }: { rp: Replay }) {
  const host = useRef<HTMLDivElement>(null);
  const eng = useRef<ControlRoom | null>(null);
  const [t, setT] = useState(0);
  const [ev, setEv] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [mul, setMul] = useState(1);
  const [ready, setReady] = useState(false);
  const blasted = rp.extra.blast && t >= 5028;

  useEffect(() => {
    let e: ControlRoom | null = null, alive = true;
    import('../controlroom/ControlRoom').then(({ ControlRoom }) => {
      if (!alive || !host.current) return;
      e = new ControlRoom(host.current, rp);
      e.onTick = setT;
      e.onEvent = setEv;
      eng.current = e;
      setReady(true);
    });
    return () => { alive = false; e?.dispose(); eng.current = null; };
  }, [rp]);

  useEffect(() => { if (eng.current) eng.current.playing = playing; }, [playing, ready]);
  useEffect(() => { if (eng.current) eng.current.speedMul = mul; }, [mul, ready]);

  const clock = eng.current?.clock2() ?? '';
  const e = rp.events[Math.max(0, ev)];
  const next = rp.events.find((x) => x.t > t + 0.01);
  const done = t >= rp.end;

  return (
    <main id="main" className={`cr-room ${blasted ? 'is-blast' : ''}`}>
      <div className="cr-canvas" ref={host} />
      {!ready && <div className="pv-loading" role="status"><span>Taking the chair</span><small>{rp.plant}</small></div>}
      <header className="cr-head">
        <Link to={`/plants/${rp.id}`} className="pv-back">Back to the plant</Link>
        <h1>{rp.plant}</h1>
        <p>{rp.date} · {rp.title}</p>
      </header>
      <div className="cr-clock" aria-live="off">{clock}</div>
      <section className="cr-caption" aria-live="polite">
        <p key={ev} className={e?.big ? 'big' : ''}>{e?.text}</p>
      </section>
      {blasted && <div className="cr-flash" aria-hidden="true" />}
      {done && (
        <div className="cr-end">
          <p>{rp.id === 'tmi' ? 'About half of the core melted. Almost no radiation escaped: the containment held.' : 'The explosion destroyed the reactor and the building. 31 people died in the following weeks.'}</p>
          <Link to={`/documentary`}>Watch the documentary</Link>
        </div>
      )}
      <nav className="cr-bar" aria-label="Replay controls">
        <button onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
        <input type="range" min={0} max={rp.end} step={1} value={t} onChange={(x) => eng.current?.seek(Number(x.target.value))} aria-label="Time" />
        <button onClick={() => next && eng.current?.seek(next.t)} disabled={!next}>Next event</button>
        <div className="pv-seg" role="group" aria-label="Speed">
          {[0.5, 1, 4].map((v) => <button key={v} className={mul === v ? 'on' : ''} onClick={() => setMul(v)}>×{v}</button>)}
        </div>
      </nav>
      <p className="cr-hint">Drag to look around. The view follows the panel that matters unless you take over.</p>
    </main>
  );
}
