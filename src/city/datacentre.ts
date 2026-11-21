// A data centre on the city grid: IT load, cooling overhead that rises with
// the outdoor temperature (PUE), water for evaporative cooling, and what
// happens in the first minutes after the grid fails.
//
// Assumptions (on the page): AI training runs flat out around the clock;
// cloud and inference follow the daily traffic curve; air-cooled halls have a
// PUE of 1.12 plus 0.012 per °C above 15 °C, liquid cooling 1.06 plus 0.005;
// evaporative cooling uses about 1.8 L of water per kWh of IT; lithium UPS for
// 6 minutes; diesel sets of 2.5 MW (N+1) start in about 12 s; chillers need
// 4 minutes to restart; a chilled-water tank buys some of that time.

import type { CityData } from './types';
import { temperature, type DayInputs } from './demand';

export type DcOpts = { itMW: number; aiShare: number; liquid: boolean; tesMin: number };
export const DEFAULT_DC: DcOpts = { itMW: 48, aiShare: 0.6, liquid: false, tesMin: 8 };

const CLOUD = [0.58, 0.54, 0.52, 0.5, 0.5, 0.52, 0.58, 0.66, 0.72, 0.76, 0.78, 0.8, 0.8, 0.8, 0.8, 0.8, 0.82, 0.85, 0.88, 0.92, 0.95, 0.94, 0.86, 0.7];
const cloud = (h: number) => { const x = ((h % 24) + 24) % 24, i = Math.floor(x), f = x - i; return CLOUD[i] + (CLOUD[(i + 1) % 24] - CLOUD[i]) * f; };

export const pue = (T: number, liquid: boolean) => (liquid ? 1.06 + 0.005 * Math.max(0, T - 15) : 1.12 + 0.012 * Math.max(0, T - 15));

export function dcDay(c: CityData, o: DcOpts, inp: DayInputs) {
  const mins: { it: number; cool: number; total: number; pue: number; T: number; waterM3h: number }[] = [];
  for (let m = 0; m < 1440; m += 5) {
    const h = m / 60, T = temperature(c, h, inp);
    const it = o.itMW * (o.aiShare * 0.95 + (1 - o.aiShare) * cloud(h));
    const p = pue(T, o.liquid);
    const total = it * p;
    mins.push({ it, cool: total - it, total, pue: p, T, waterM3h: (it * 1000 * (o.liquid ? 0.4 : 1.8) * (0.6 + 0.02 * T)) / 1000 });
  }
  return mins;
}

export type DcStep = { t: number; title: string; body: string };

/** The first five minutes after the mains fail, second by second. */
export function dcOutage(o: DcOpts, T: number) {
  const it = o.itMW * 0.9, total = it * pue(T, o.liquid);
  const sets = Math.ceil(total / 2.5) + 1;
  const secs: { t: number; ups: number; gens: number; chill: number; inlet: number; it: number }[] = [];
  const steps: DcStep[] = [];
  let inlet = 24, ups = 1;
  for (let t = 0; t <= 300; t++) {
    const gens = t >= 12 ? sets : 0;
    if (gens === 0) ups = Math.max(0, ups - 1 / (6 * 60));
    const chill = t >= 12 + 240 ? 1 : 0; // compressors restart 4 min after power returns to them
    const tes = t < 12 + o.tesMin * 60; // chilled-water tank still cold
    // inlet air warms when neither chillers nor stored cold are available (about 1 °C a minute at this density)
    if (!chill && !tes) inlet += (o.liquid ? 0.4 : 1.1) / 60;
    else inlet = Math.max(24, inlet - 0.5 / 60);
    const throttle = inlet > 32 ? Math.max(0.5, 1 - (inlet - 32) * 0.1) : 1;
    secs.push({ t, ups, gens, chill, inlet, it: it * throttle });
  }
  steps.push({ t: 0, title: 'Grid lost', body: `Both 132 kV feeds go dead. ${Math.round(it)} MW of servers keep running without a flicker: the UPS batteries took over within a quarter of a cycle.` });
  steps.push({ t: 1, title: `${sets} generators crank`, body: `Sized N+1: ${sets - 1} sets of 2.5 MW carry ${Math.round(total)} MW of IT and cooling, one spare.` });
  steps.push({ t: 12, title: 'Generators on the bus', body: 'The sets are synchronised and the UPS hands the load over. Its batteries start recharging.' });
  steps.push({ t: 13, title: 'Chillers restarting', body: `Compressors have to wait about four minutes before they can restart. ${o.tesMin ? `The chilled-water tank covers ${o.tesMin} minutes of cooling.` : 'There is no chilled-water tank: hall temperatures start to climb.'}` });
  const hot = secs.find((s) => s.inlet > 32);
  if (hot) steps.push({ t: hot.t, title: 'Servers throttle', body: 'Inlet air passes 32 °C. Servers cut their clock speed to protect themselves; AI training jobs slow down.' });
  steps.push({ t: 252, title: 'Cooling back', body: 'Chillers are running again on generator power. The halls cool back towards 24 °C.' });
  return { secs, steps, sets, total };
}
