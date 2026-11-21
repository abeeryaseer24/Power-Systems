// Runs whole simulated days off the main thread, so the page stays smooth
// while every train, mast, tank and charger is recomputed.
import { CityEngine, type CityOpts } from './engine';
import { loadCity } from './load';

let eng: CityEngine | null = null;
let busy: Promise<void> = Promise.resolve();

type Req = { id: number; cityId: string; opts: CityOpts; trips: [string, [number, number]][] };

self.onmessage = (ev: MessageEvent<Req>) => {
  // one job at a time, in order
  busy = busy.then(async () => {
    const { id, cityId, opts, trips } = ev.data;
    try {
      if (!eng || eng.city.id !== cityId) eng = new CityEngine(await loadCity(cityId), opts, { deferred: true });
      eng.opts = { ...opts };
      eng.trips = new Map(trips);
      const r = eng.computeRuns();
      (self as unknown as Worker).postMessage({ id, r });
    } catch (err) {
      (self as unknown as Worker).postMessage({ id, error: String(err) });
    }
  });
};
