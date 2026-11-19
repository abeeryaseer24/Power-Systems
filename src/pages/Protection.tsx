import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import '../protection.css';

// A 400 kV double-ended feed: source — A ——100 km—— B ——80 km—— C — source.
// Impedances in primary ohms. Apparent impedance ignores infeed from the far end,
// which is why real relays under-reach for resistive faults; the page says so.
const ZKM = { r: 0.03, x: 0.32 }; // ohm per km
const AB = 100;
const BC = 80;
const EXT = 60; // the lines beyond A and C, for backup reach
const L = AB + BC;
const T_RELAY = 20; // ms, relay operating time
const T_BREAKER = 50; // ms, breaker opening time
const ZONE_DELAY = [0, 300, 1000];

interface Relay { id: string; at: number; dir: 1 | -1; own: number; next: number; label: string }
const RELAYS: Relay[] = [
  { id: 'A', at: 0, dir: 1, own: AB, next: BC, label: 'A → B' },
  { id: 'B1', at: AB, dir: -1, own: AB, next: EXT, label: 'B → A' },
  { id: 'B2', at: AB, dir: 1, own: BC, next: EXT, label: 'B → C' },
  { id: 'C', at: L, dir: -1, own: BC, next: AB, label: 'C → B' },
];

type C = { r: number; x: number };
const zAt = (km: number): C => ({ r: ZKM.r * km, x: ZKM.x * km });
const add = (a: C, b: C): C => ({ r: a.r + b.r, x: a.x + b.x });
const reaches = (rl: Relay): C[] => [zAt(0.8 * rl.own), zAt(1.2 * rl.own), add(zAt(rl.own), zAt(1.2 * rl.next))];
/** Mho characteristic: a circle through the origin whose diameter is the reach. */
const inMho = (z: C, reach: C) => Math.hypot(z.r - reach.r / 2, z.x - reach.x / 2) < Math.hypot(reach.r, reach.x) / 2;
const zoneOf = (z: C | null, rl: Relay) => {
  if (!z) return 0;
  const rs = reaches(rl);
  for (let k = 0; k < 3; k++) if (inMho(z, rs[k])) return k + 1;
  return 0;
};
/** What a relay sees for a fault at `x` km from A with fault resistance `rf`; null if behind it. */
function seen(rl: Relay, x: number, rf: number): C | null {
  const d = (x - rl.at) * rl.dir;
  if (d <= 0) return null;
  return add(zAt(d), { r: rf, x: 0 });
}

interface Op { relay: Relay; zone: number; t: number; opened: boolean; note: string }
function sequence(x: number, rf: number, stuck: string | null, bf: boolean): { ops: Op[]; cleared: number | null } {
  type Ev = { rl: Relay; zone: number; t: number; bf?: boolean };
  const cand: Ev[] = RELAYS.map((rl) => ({ rl, zone: zoneOf(seen(rl, x, rf), rl) }))
    .filter((c) => c.zone > 0)
    .map((c) => ({ ...c, t: ZONE_DELAY[c.zone - 1] + T_RELAY + T_BREAKER }));
  // breaker-failure protection: if a tripped breaker is still carrying current after a short
  // wait, open every other breaker on the same busbar
  const st = cand.find((c) => c.rl.id === stuck);
  if (st && bf) for (const rl of RELAYS) if (rl.at === st.rl.at && rl.id !== st.rl.id) cand.push({ rl, zone: 0, t: st.t + 150, bf: true });
  cand.sort((a, b) => a.t - b.t);
  let left: number | null = null;
  let right: number | null = null;
  const ops: Op[] = [];
  for (const c of cand) {
    const side = c.rl.at < x ? 'left' : 'right';
    if ((side === 'left' && left !== null) || (side === 'right' && right !== null)) continue;
    if (stuck === c.rl.id) {
      ops.push({ relay: c.rl, zone: c.zone, t: c.t, opened: false, note: 'Relay trips, but the breaker is stuck' });
      continue;
    }
    const note = c.bf ? 'Breaker-failure protection opens it to isolate the stuck breaker' : c.zone === 1 ? 'Zone 1, instant trip' : `Zone ${c.zone}, backup after ${ZONE_DELAY[c.zone - 1]} ms`;
    ops.push({ relay: c.rl, zone: c.zone, t: c.t, opened: true, note });
    if (side === 'left') left = c.t;
    else right = c.t;
  }
  const cleared = left !== null && right !== null ? Math.max(left, right) : null;
  return { ops, cleared };
}

// R–X plot frame
const PX = { w: 520, h: 440, r0: -40, r1: 90, x0: -25, x1: 85 };
const sx = (r: number) => ((r - PX.r0) / (PX.r1 - PX.r0)) * PX.w;
const sy = (x: number) => PX.h - ((x - PX.x0) / (PX.x1 - PX.x0)) * PX.h;
const sk = (ohm: number) => (ohm / (PX.r1 - PX.r0)) * PX.w;

export default function Protection() {
  const [x, setX] = useState(62);
  const [rf, setRf] = useState(2);
  const [eye, setEye] = useState('A');
  const [stuck, setStuck] = useState<string | null>(null);
  const [bf, setBf] = useState(true);
  const [loadMW, setLoadMW] = useState(1200);
  const [qShare, setQShare] = useState(0.2);
  const [volt, setVolt] = useState(1);
  const [swing, setSwing] = useState<number | null>(null);
  const [psb, setPsb] = useState(false);
  const rl = RELAYS.find((r) => r.id === eye)!;
  const zf = seen(rl, x, rf);
  const zone = zoneOf(zf, rl);
  const { ops, cleared } = useMemo(() => sequence(x, rf, stuck, bf), [x, rf, stuck, bf]);

  // load as seen from A: Z = V² / S*, in ohms (load flows A → C)
  const V2 = (400 * volt) ** 2;
  const S2 = loadMW ** 2 * (1 + qShare ** 2);
  const zLoad: C = { r: (V2 * loadMW) / S2, x: (V2 * loadMW * qShare) / S2 };
  const loadZone = eye === 'A' ? zoneOf(zLoad, RELAYS[0]) : 0;

  // power swing between two equal sources: the locus is the perpendicular bisector of the total impedance
  const ZS = zAt(40);
  const ZT = add(add(ZS, zAt(L)), ZS);
  const swingZ = (d: number): C => {
    const c = 1 / Math.tan(d / 2);
    return { r: -ZS.r + 0.5 * ZT.r + 0.5 * c * ZT.x, x: -ZS.x + 0.5 * ZT.x - 0.5 * c * ZT.r };
  };
  useEffect(() => {
    if (swing === null) return;
    if (swing > Math.PI * 1.9) {
      const t = setTimeout(() => setSwing(null), 1200);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setSwing(swing + 0.035), 30);
    return () => clearTimeout(t);
  }, [swing]);
  const swingNow = swing !== null ? swingZ(swing) : null;
  const swingZone = swingNow && eye === 'A' ? zoneOf(swingNow, RELAYS[0]) : 0;
  const swingPath = useMemo(() => {
    const pts: string[] = [];
    for (let d = 0.35; d < Math.PI * 2 - 0.35; d += 0.05) {
      const z = swingZ(d);
      pts.push(`${sx(z.r).toFixed(1)},${sy(z.x).toFixed(1)}`);
    }
    return pts.join(' ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kmToPx = (km: number) => 60 + (km / L) * 880;
  const faultSide = x < AB ? 'AB' : 'BC';
  const opened = new Set(ops.filter((o) => o.opened).map((o) => o.relay.id));

  return (
    <main id="main" className="page protection">
      <div className="page-head">
        <h1>The relay’s eye</h1>
        <p>Every high-voltage line is watched by a distance relay at each end. It divides voltage by current and asks one question: is that impedance small enough to be a fault on my line? Put a fault anywhere and see what each relay sees.</p>
      </div>

      <section className="rl-line" aria-label="Line diagram">
        <svg viewBox="0 0 1000 170" className="rl-svg">
          <line x1="20" y1="80" x2="60" y2="80" className="rl-src" />
          <line x1="940" y1="80" x2="980" y2="80" className="rl-src" />
          <circle cx="16" cy="80" r="12" className="rl-gen" />
          <circle cx="984" cy="80" r="12" className="rl-gen" />
          <line x1={kmToPx(0)} y1="80" x2={kmToPx(AB)} y2="80" className={`rl-ln ${faultSide === 'AB' ? 'faulted' : ''}`} />
          <line x1={kmToPx(AB)} y1="80" x2={kmToPx(L)} y2="80" className={`rl-ln ${faultSide === 'BC' ? 'faulted' : ''}`} />
          {[['A', 0], ['B', AB], ['C', L]].map(([n, km]) => (
            <g key={n as string} transform={`translate(${kmToPx(km as number)} 80)`}>
              <rect x="-5" y="-34" width="10" height="68" className="rl-bus" />
              <text y="62" className="rl-busl">{n}</text>
            </g>
          ))}
          {RELAYS.map((r) => {
            const px = kmToPx(r.at) + r.dir * 26;
            const z = zoneOf(seen(r, x, rf), r);
            return (
              <g key={r.id} transform={`translate(${px} 80)`} className={`rl-brk ${opened.has(r.id) ? 'open' : ''} ${stuck === r.id ? 'stuck' : ''} ${eye === r.id ? 'eye' : ''}`}
                onClick={() => setEye(r.id)} role="button" aria-label={`Show what relay ${r.label} sees`}>
                <rect x="-9" y="-9" width="18" height="18" />
                <path d={`M ${r.dir * 12} -26 l ${r.dir * 14} 0 l ${-r.dir * 5} -5 M ${r.dir * 26} -26 l ${-r.dir * 5} 5`} className="rl-arrow" />
                <text y="-36" className="rl-rl">{r.label}</text>
                {z > 0 && <text y="34" className="rl-zl">Z{z}</text>}
              </g>
            );
          })}
          <g transform={`translate(${kmToPx(x)} 80)`} className="rl-fault">
            <path d="M -2 -40 L 8 -16 L -4 -12 L 6 12 L -10 -14 L 2 -18 Z" />
          </g>
          <text x={kmToPx(AB / 2)} y="140" className="rl-km">{AB} km</text>
          <text x={kmToPx(AB + BC / 2)} y="140" className="rl-km">{BC} km</text>
        </svg>
        <div className="w-controls">
          <label className="w-slider">Fault position <output>{x < AB ? `${x} km from A` : `${x - AB} km past B`}</output>
            <input type="range" min={2} max={L - 2} value={x} onChange={(e) => setX(Number(e.target.value))} /></label>
          <label className="w-slider">Fault resistance (arc, tree, tower footing) <output>{rf} Ω</output>
            <input type="range" min={0} max={40} value={rf} onChange={(e) => setRf(Number(e.target.value))} /></label>
          <label className="w-slider">Breaker that fails to open
            <select value={stuck ?? ''} onChange={(e) => setStuck(e.target.value || null)}>
              <option value="">None</option>
              {RELAYS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select></label>
          <label className="rl-check"><input type="checkbox" checked={bf} onChange={(e) => setBf(e.target.checked)} /> Breaker-failure protection</label>
        </div>
      </section>

      <div className="rl-grid">
        <section className="rl-rx" aria-label="Impedance plane">
          <h2>What relay {rl.label} sees</h2>
          <p className="hint">Resistance across, reactance up. Each circle is a zone. Click a breaker on the diagram to look through its relay.</p>
          <svg viewBox={`0 0 ${PX.w} ${PX.h}`} className="rl-svg">
            <line x1={sx(PX.r0)} y1={sy(0)} x2={sx(PX.r1)} y2={sy(0)} className="rl-axis" />
            <line x1={sx(0)} y1={sy(PX.x0)} x2={sx(0)} y2={sy(PX.x1)} className="rl-axis" />
            <text x={sx(PX.r1) - 6} y={sy(0) - 8} className="rl-axl" textAnchor="end">R, Ω</text>
            <text x={sx(0) + 8} y={sy(PX.x1) + 16} className="rl-axl">X, Ω</text>
            {reaches(rl).map((z, k) => (
              <circle key={k} cx={sx(z.r / 2)} cy={sy(z.x / 2)} r={sk(Math.hypot(z.r, z.x) / 2)} className={`rl-zone z${k + 1} ${zone === k + 1 ? 'hit' : ''}`} />
            )).reverse()}
            <line x1={sx(0)} y1={sy(0)} x2={sx(zAt(rl.own).r)} y2={sy(zAt(rl.own).x)} className="rl-own" />
            <text x={sx(zAt(rl.own).r) + 8} y={sy(zAt(rl.own).x)} className="rl-axl">own line</text>
            {eye === 'A' && (
              <>
                <polyline points={swingPath} className="rl-swingpath" />
                {zLoad.r < PX.r1 - 4 ? (
                  <>
                    <circle cx={sx(zLoad.r)} cy={sy(zLoad.x)} r="7" className={`rl-load ${loadZone ? 'in' : ''}`} />
                    <text x={sx(zLoad.r) + 10} y={sy(zLoad.x) + 4} className="rl-axl">load</text>
                  </>
                ) : (
                  <text x={PX.w - 8} y={sy(Math.min(PX.x1 - 5, zLoad.x * ((PX.r1 - 4) / zLoad.r)))} className="rl-axl rl-offplot" textAnchor="end">load, {Math.round(zLoad.r)} Ω →</text>
                )}
                {swingNow && <circle cx={sx(swingNow.r)} cy={sy(swingNow.x)} r="7" className="rl-swing" />}
              </>
            )}
            {zf && <g transform={`translate(${sx(zf.r)} ${sy(zf.x)})`} className="rl-zf"><circle r="8" /><text x="12" y="4">fault</text></g>}
          </svg>
          <p className="rl-verdict">
            {!zf ? 'The fault is behind this relay. It does not trip.' : zone === 1 ? 'Zone 1: inside 80 % of its own line. Trips at once.' : zone === 2 ? 'Zone 2: near the far end or just beyond it. Waits 300 ms in case the next relay clears it first.' : zone === 3 ? 'Zone 3: far backup. Waits a full second.' : 'Outside every zone. This relay does nothing.'}
          </p>
        </section>

        <section className="rl-seq" aria-label="Clearing sequence">
          <h2>What happens</h2>
          <ol>
            <li><b>0 ms</b> Fault {x < AB ? `on line A–B, ${x} km from A` : `on line B–C, ${x - AB} km from B`}.</li>
            {ops.map((o) => (
              <li key={o.relay.id} className={o.opened ? '' : 'bad'}><b>{o.t} ms</b> Breaker {o.relay.label}. {o.note}.</li>
            ))}
            <li className={cleared === null ? 'bad' : 'ok'}>{cleared === null ? 'The fault is still fed. Equipment is burning and the grid is losing stability.' : <><b>{cleared} ms</b> Fault cleared.</>}</li>
          </ol>
          {cleared !== null && cleared > 200 && <p className="hint">Slow clearance: the longer a fault stays on, the further generators swing apart. Breaker failure is how one fault becomes a wide outage.</p>}
        </section>
      </div>

      <section className="rl-encroach">
        <h2>When heavy load looks like a fault</h2>
        <p>Load also has an impedance: voltage squared divided by power. On a normal day it sits far out to the right of the circles. Push the power up, let the voltage sag and add reactive flow, and it walks into zone 3. That is how the Sammis–Star line tripped in the{' '}
          <Link to="/academy/northeast-2003">2003 Northeast blackout</Link>: no fault at all, just a heavily loaded line at low voltage.</p>
        <div className="w-controls">
          <label className="w-slider">Power on the line <output>{loadMW} MW</output><input type="range" min={200} max={4000} step={50} value={loadMW} onChange={(e) => { setEye('A'); setLoadMW(Number(e.target.value)); }} /></label>
          <label className="w-slider">Reactive power, share of real <output>{Math.round(qShare * 100)} %</output><input type="range" min={0} max={0.8} step={0.05} value={qShare} onChange={(e) => { setEye('A'); setQShare(Number(e.target.value)); }} /></label>
          <label className="w-slider">Voltage <output>{volt.toFixed(2)} pu</output><input type="range" min={0.7} max={1.05} step={0.01} value={volt} onChange={(e) => { setEye('A'); setVolt(Number(e.target.value)); }} /></label>
        </div>
        <p className={`rl-verdict ${loadZone ? 'bad' : ''}`}>{loadZone ? `The load point is inside zone ${loadZone}. Relay A would trip a healthy line.` : `Load impedance ${Math.round(Math.hypot(zLoad.r, zLoad.x))} Ω. Safely outside the zones.`}</p>
      </section>

      <section className="rl-encroach">
        <h2>Power swings</h2>
        <p>After a big disturbance, the generators at the two ends swing against each other. The impedance the relay sees sweeps across the plane along the dashed line. If it passes through the circles, the relay may trip a healthy line in the middle of the swing, which is how a grid tears apart. Power-swing blocking tells the relay to hold off when the impedance moves slowly rather than jumping.</p>
        <div className="w-buttons">
          <button className="btn" onClick={() => { setEye('A'); setSwing(0.35); }} disabled={swing !== null}>Start a swing</button>
          <label className="rl-check"><input type="checkbox" checked={psb} onChange={(e) => setPsb(e.target.checked)} /> Power-swing blocking</label>
        </div>
        <p className={`rl-verdict ${swingZone && !psb ? 'bad' : ''}`}>
          {swing === null ? 'Angle between the two ends: steady.' : `Angle ${Math.round((swing * 180) / Math.PI)}°. ${swingZone ? (psb ? `Inside zone ${swingZone}, but blocked: the line stays in.` : `Inside zone ${swingZone}: relay A trips a healthy line.`) : 'Outside the zones.'}`}
        </p>
      </section>

      <p className="hint rl-foot">Simplified: a single-phase picture with mho characteristics, ignoring infeed from the far end (which makes real relays under-reach on resistive faults) and fault type. Line constants are typical of a 400 kV double-bundle line.</p>
    </main>
  );
}
