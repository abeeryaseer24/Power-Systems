import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { eventById, stageEvent, EVENTS, type BlackoutEvent } from '../grid/events';
import { EPISODES } from '../grid/documentaries';
import { buildReactor, plantById } from '../nuclear/plants';
import { loadIndex, useRegion } from './atlas/useRegion';
import CoreView from '../components/CoreView';
import { sfx } from '../lib/sfx';
import '../trailer.css';

type Shot =
  | { kind: 'title'; lines: string[]; hold: number; small?: string }
  | { kind: 'region'; ev: string; hold: number }
  | { kind: 'core'; plant: string; from: number; to: number; clock: string; caption: string; hold: number }
  | { kind: 'end'; hold: number };

// the replays with the most to show on a map
const DRAMATIC = ['bangladesh-2022', 'texas-2021', 'northeast-2003', 'india-2012', 'iberia-2025', 'italy-2003', 'sa-2016', 'venezuela-2019', 'turkey-2015', 'pakistan-2023', 'hokkaido-2018', 'srilanka-2020', 'central-asia-2022', 'brazil-2009'];
const CORES = [
  { plant: 'chernobyl', from: 36, to: 48, clock: '01:23:40', caption: 'Chernobyl. An electrical test at reactor four.' },
  { plant: 'fukushima', from: 3000, to: 3600 * 9, clock: '15:37', caption: 'Fukushima Daiichi. The wave takes every source of power.' },
  { plant: 'tmi', from: 5000, to: 9000, clock: '05:41', caption: 'Three Mile Island. A valve that said closed.' },
];
const OPENERS = [['Every grid on Earth', 'is balanced on a knife-edge.'], ['Supply must equal demand.', 'Every second. Everywhere.'], ['Fifty times a second', 'the whole grid turns as one.']];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function makeCut(available: Set<string>): Shot[] {
  const pool = DRAMATIC.filter((id) => eventById(id) && available.has(eventById(id)!.region));
  const a = pick(pool);
  const b = pick(pool.filter((x) => x !== a)) ?? a;
  const core = pick(CORES);
  const ea = eventById(a)!;
  const regions = available.size;
  return [
    { kind: 'title', lines: pick(OPENERS), hold: 4.5 },
    { kind: 'region', ev: a, hold: 11 },
    { kind: 'title', lines: [`${ea.people}.`, 'In the dark.'], hold: 3.5 },
    { kind: 'core', ...core, hold: 8 },
    { kind: 'title', lines: ['It happens more often', 'than you think.'], hold: 3.5 },
    { kind: 'region', ev: b, hold: 11 },
    { kind: 'title', lines: [`${EVENTS.length} blackouts.`, `${regions} real grids.`, `${EPISODES.filter((e) => e.plant).length} reactors.`], hold: 4.5 },
    { kind: 'end', hold: 999 },
  ];
}

/** One map shot: preloads while hidden, jumps to just before the trigger, then lets the event play. */
function RegionShot({ ev, active, hold }: { ev: BlackoutEvent; active: boolean; hold: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const r = useRegion(ev.region, canvas, (s) => stageEvent(s, ev, 'watch'));
  const [ready, setReady] = useState(false);
  const first = ev.steps[0]?.t ?? 10;
  const last = Math.min(ev.steps[ev.steps.length - 1]?.t ?? first + 10, first + 40);
  useEffect(() => {
    if (!r.sim || !r.scene) return;
    r.speed.current = 0;
    r.scene.autoOrbit = true;
    const s = r.sim;
    const target = Math.max(0, first - 3);
    let raf = 0;
    const jump = () => {
      const t0 = performance.now();
      while (s.t < target - 1e-6 && performance.now() - t0 < 24) s.advance(Math.min(0.5, target - s.t));
      if (s.t < target - 1e-6) raf = requestAnimationFrame(jump);
      else setReady(true);
    };
    jump();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.sim]);
  useEffect(() => {
    if (!ready) return;
    r.speed.current = active ? Math.min(20, Math.max(1.5, (last - first + 6) / Math.max(4, hold - 2))) : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ready]);
  const t = r.sim?.t ?? 0;
  const step = [...ev.steps].reverse().find((s) => s.t <= t);
  return (
    <div className={`tr-shot ${active ? 'on' : ''}`} aria-hidden={!active}>
      <canvas ref={canvas} className="tr-canvas" />
      {active && (
        <div className="tr-cap">
          <span className="tr-where">{ev.where}, {ev.date}</span>
          <span className="tr-clock" key={step?.clock ?? 'pre'}>{step ? step.clock : ev.time}</span>
          {step && <span className="tr-line" key={step.label}>{step.label}</span>}
        </div>
      )}
    </div>
  );
}

function CoreShot({ shot, active }: { shot: Extract<Shot, { kind: 'core' }>; active: boolean }) {
  const reactor = useMemo(() => {
    const r = buildReactor(plantById(shot.plant)!, 'watch');
    while (r.s.t < shot.from - 1e-6) r.advance(Math.min(shot.from - r.s.t, r.s.t < 60 ? 0.05 : 30));
    return r;
  }, [shot]);
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t0 = performance.now();
    let raf = 0;
    let boomed = reactor.s.destroyed;
    const rate = (shot.to - shot.from) / Math.max(1, shot.hold - 1.5);
    const frame = () => {
      const el = (performance.now() - t0) / 1000;
      const goal = Math.min(shot.to, shot.from + el * rate);
      const st = performance.now();
      while (reactor.s.t < goal - 1e-6 && performance.now() - st < 12) reactor.advance(Math.min(goal - reactor.s.t, reactor.s.n > 0.5 || rate < 5 ? 0.05 : 20));
      if (reactor.s.destroyed && !boomed) {
        boomed = true;
        sfx.boom();
      }
      setT(el);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active, reactor, shot]);
  return (
    <div className={`tr-shot ${active ? 'on' : ''}`} aria-hidden={!active}>
      <div className="tr-core"><CoreView r={reactor} t={t} /></div>
      {active && (
        <div className="tr-cap">
          <span className="tr-where">{shot.caption}</span>
          <span className="tr-clock">{shot.clock}</span>
        </div>
      )}
    </div>
  );
}

export default function Trailer() {
  const [available, setAvailable] = useState<Set<string> | null>(null);
  const [cut, setCut] = useState<Shot[] | null>(null);
  const [i, setI] = useState(-1);
  const [recording, setRecording] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  useEffect(() => {
    loadIndex().then((ix) => {
      const s = new Set(ix.map((x) => x.id));
      setAvailable(s);
      setCut(makeCut(s));
    });
    return () => sfx.quiet();
  }, []);
  const shot = cut && i >= 0 ? cut[i] : null;
  useEffect(() => {
    if (!cut || i < 0 || i >= cut.length - 1) return;
    const t = setTimeout(() => setI(i + 1), cut[i].hold * 1000);
    return () => clearTimeout(t);
  }, [i, cut]);
  useEffect(() => {
    if (!shot) return;
    sfx.setDrone(shot.kind === 'title' ? 0.3 : shot.kind === 'end' ? 0.15 : 0.7);
    if (shot.kind === 'end' && rec.current) setTimeout(() => rec.current?.stop(), 2500);
  }, [shot]);

  const play = () => {
    sfx.unlock();
    setI(0);
  };
  const again = () => {
    if (!available) return;
    setCut(makeCut(available));
    setI(-1);
  };
  const record = async () => {
    try {
      // the browser asks which tab to capture; nothing leaves this computer
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true, preferCurrentTab: true } as DisplayMediaStreamOptions);
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
      const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 });
      const parts: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size && parts.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const url = URL.createObjectURL(new Blob(parts, { type: 'video/webm' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'blackstart-trailer.webm';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        setRecording(false);
        rec.current = null;
      };
      rec.current = mr;
      mr.start(500);
      setRecording(true);
      play();
    } catch {
      setRecording(false);
    }
  };

  return (
    <main id="main" className="trailer">
      <div className="tr-stage">
        {cut?.map((s, k) => {
          // mount each shot a little before it plays so maps can load behind the previous card
          const near = i >= 0 ? k >= i && k <= i + 2 : k <= 1;
          if (!near) return null;
          if (s.kind === 'region') return <RegionShot key={`${k}-${s.ev}`} ev={eventById(s.ev)!} active={i === k} hold={s.hold} />;
          if (s.kind === 'core') return <CoreShot key={`${k}-${s.plant}`} shot={s} active={i === k} />;
          return null;
        })}
        {shot?.kind === 'title' && (
          <div className="tr-title" key={i}>
            {shot.lines.map((l, k) => <span key={k} style={{ animationDelay: `${0.25 + k * 0.6}s` }}>{l}</span>)}
          </div>
        )}
        {shot?.kind === 'end' && (
          <div className="tr-end">
            <svg viewBox="0 0 40 20" aria-hidden="true"><path d="M1 14 C 8 14, 10 4, 20 4 S 32 14, 39 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="20" cy="4" r="2.2" fill="var(--sodium)" /></svg>
            <h1>Blackstart</h1>
            <p>Can you keep the lights on?</p>
            {!recording && (
              <div className="tr-cta">
                <Link className="btn primary" to="/blackouts">Try to stop a blackout</Link>
                <button className="btn ghost" onClick={again}>Cut another trailer</button>
              </div>
            )}
          </div>
        )}
        {i < 0 && (
          <div className="tr-start">
            <span className="tr-kicker">Trailer generator</span>
            <h1>A different trailer every time</h1>
            <p>Two real blackouts, one reactor, cut together from the live simulations. Nothing is pre-rendered.</p>
            <div className="tr-cta">
              <button className="btn primary" onClick={play} disabled={!cut}>{cut ? 'Play' : 'Preparing…'}</button>
              <button className="btn ghost" onClick={record} disabled={!cut}>Record it</button>
              <button className="btn ghost" onClick={again} disabled={!cut}>Shuffle</button>
            </div>
            {cut && <p className="tr-list">This cut: {cut.filter((s) => s.kind === 'region').map((s) => eventById((s as { ev: string }).ev)!.title).join(', ')} and {(cut.find((s) => s.kind === 'core') as { caption: string }).caption.split('.')[0]}.</p>}
            <p className="hint">Record asks your browser to capture this tab and saves a WebM file to your computer. Turn sound on for the full effect.</p>
          </div>
        )}
      </div>
      <i className="tr-bar top" aria-hidden="true" />
      <i className="tr-bar bottom" aria-hidden="true" />
      <div className="tr-grain" aria-hidden="true" />
      {recording && <span className="tr-rec">● REC</span>}
    </main>
  );
}
