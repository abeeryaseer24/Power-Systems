// Ask the worker for a day run; fall back to this thread if workers are unavailable.
import type { CityEngine, EngineRuns } from './engine';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { ok: (r: EngineRuns) => void; fail: (e: Error) => void }>();

function getWorker() {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<{ id: number; r?: EngineRuns; error?: string }>) => {
      const p = pending.get(ev.data.id);
      if (!p) return;
      pending.delete(ev.data.id);
      if (ev.data.r) p.ok(ev.data.r);
      else p.fail(new Error(ev.data.error ?? 'worker failed'));
    };
    return worker;
  } catch {
    return null;
  }
}

/** Re-run the engine's day with its current inputs and outages, and adopt the result. */
export async function rerunDay(e: CityEngine, h = e.ready ? e.hour : 8) {
  const w = getWorker();
  let r: EngineRuns;
  if (w) {
    const id = ++seq;
    r = await new Promise<EngineRuns>((ok, fail) => {
      pending.set(id, { ok, fail });
      w.postMessage({ id, cityId: e.city.id, opts: e.opts, trips: [...e.trips] });
    }).catch(() => e.computeRuns());
  } else r = e.computeRuns();
  e.adopt(r, h);
}
