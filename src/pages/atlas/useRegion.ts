import { useEffect, useRef, useState } from 'react';
import { loadRegion, RegionSim, type RegionData, type RegionEvent } from '../../grid/region';
import { RegionScene, type Hover } from '../../scene/RegionScene';
import { sfx } from '../../lib/sfx';

export interface RegionIndexEntry {
  id: string; city: string; country: string; scope: string; freq: number; center: [number, number];
  buses: number; branches: number; plants: number; genMW: number; demandMW: number;
}

export async function loadIndex(): Promise<RegionIndexEntry[]> {
  const r = await fetch('/data/regions/index.json');
  return r.ok ? r.json() : [];
}

/**
 * Loads a region, builds its scene on the canvas and runs a simulator against it.
 * `prepare` stages the simulator (events, setup) before the loop starts.
 */
export function useRegion(id: string, canvas: React.RefObject<HTMLCanvasElement | null>, prepare?: (s: RegionSim) => void) {
  const [data, setData] = useState<RegionData | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const sim = useRef<RegionSim | null>(null);
  const scene = useRef<RegionScene | null>(null);
  const speed = useRef(1);
  const seen = useRef(0);
  const [cine, setCine] = useState<RegionEvent | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [pick, setPick] = useState<Hover | null>(null);
  const [generation, setGeneration] = useState(0);
  const [loading, setLoading] = useState('Loading the grid…');
  /** Speed the simulator actually achieved, after the frame budget. */
  const achieved = useRef(1);

  useEffect(() => {
    let alive = true;
    setData(null);
    setLoading('Downloading the grid…');
    loadRegion(id, (f) => alive && setLoading(`Downloading the grid ${Math.round(f * 100)} %`)).then((d) => alive && setData(d)).catch((e) => alive && setError(String(e.message ?? e)));
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!data || !canvas.current) return;
    setLoading('Solving the first power flow…');
    let cancelled = false;
    let cleanup = () => {};
    // let the browser paint the status before the (blocking) first solve
    const timer = window.setTimeout(() => {
      if (cancelled || !canvas.current) return;
      cleanup = start(canvas.current);
    }, 30);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, generation]);

  function start(cv: HTMLCanvasElement) {
    if (!data) return () => {};
    // each region's JSON is shared: the simulator mutates loads during dispatch, so give it a copy
    const s = new RegionSim(structuredClone(data));
    prepare?.(s);
    sim.current = s;
    seen.current = 0;
    const sc = new RegionScene(cv, data);
    scene.current = sc;
    sc.attach(s);
    sc.onPick = (h) => setPick(h);
    let last = performance.now();
    let lastUi = 0;
    sc.onFrame = () => {
      const now = performance.now();
      const real = Math.min(0.2, (now - last) / 1000);
      last = now;
      if (speed.current > 0) {
        // frame budget: never spend more than ~8 ms simulating, so the map stays smooth
        const want = Math.min(speed.current * real, 6);
        const t0 = performance.now();
        let done = 0;
        while (done < want - 1e-9 && performance.now() - t0 < 8) {
          const chunk = Math.min(0.25, want - done);
          s.advance(chunk);
          done += chunk;
        }
        const ratio = want > 0 ? done / want : 1;
        achieved.current = achieved.current * 0.9 + speed.current * ratio * 0.1;
      }
      if (s.events.length > seen.current) {
        const fresh = s.events.slice(seen.current);
        seen.current = s.events.length;
        if (fresh.some((e) => /tripped|lost|blocked|Separated/i.test(e.title))) sfx.clunk(fresh.length > 2 ? 1.3 : 1);
        if (fresh.some((e) => e.severity === 'blackout')) {
          sfx.powerDown();
          sfx.klaxon(2);
        } else if (fresh.some((e) => e.severity === 'major')) sfx.klaxon(1);
        const big = fresh.find((e) => e.severity === 'blackout') ?? fresh.find((e) => e.severity === 'major');
        if (big) {
          setCine(big);
          sc.kick(big.severity === 'blackout' ? 1.3 : 0.6);
          window.setTimeout(() => setCine((c) => (c === big ? null : c)), 5500);
        }
      }
      if (now - lastUi > 120) {
        lastUi = now;
        setHover(sc.hover);
        sfx.setHum(s.frequency, Math.min(1, s.served / Math.max(1, s.demand)));
        setTick((t) => t + 1);
      }
    };
    const unlock = () => sfx.unlock();
    window.addEventListener('pointerdown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      sfx.quiet();
      sc.dispose();
      scene.current = null;
      sim.current = null;
    };
  }

  return {
    data, error, tick, sim: sim.current, scene: scene.current, speed, achieved, loading, cine, hover, pick, setPick,
    restart: () => setGeneration((g) => g + 1),
  };
}
