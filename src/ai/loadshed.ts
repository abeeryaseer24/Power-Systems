// Bangladesh load-shedding predictor, evaluated in the browser from the trees exported by
// ml/loadshed_final.py. live.json (updated daily by ml/loadshed_live.py) carries the feature
// vector for tonight and tomorrow, built in Python exactly as in training; the page only
// evaluates the trees, so changing an input re-runs the same model the backtest scored.

import { predict, type Tree } from './gbm';

export type ModelSet = { features: string[]; reg: Tree[][]; any: Tree[][]; sev: Tree[][]; importance: { f: string; v: number }[] };
export type Models = { regKind: 'blend'; severeMW: number; trainedTo: string; sets: { tonight: ModelSet; tomorrow: ModelSet } };
export type LiveDay = { date: string; pred: number; p_any: number; p_sev: number; persist: number | null; tmax: number | null; nldc?: number | null; x: (number | null)[] };
export type Live = {
  updated: string; last_report_id: number; new_reports: number; lastActual: string;
  tonight: LiveDay; tomorrow: LiveDay; zoneShares: Record<string, number>; recent: [string, number | null, number | null][];
};

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

export function run(_m: Models, set: ModelSet, x: (number | null)[]) {
  const base = x[set.features.indexOf('shed_l0')] ?? 0;
  // Tweedie trees give log-MW; the forecast is the mean of that model and persistence (last evening)
  const twd = mean(set.reg.map((t) => Math.exp(predict(t, x))));
  const mw = 0.5 * (twd + base);
  const pAny = mean(set.any.map((t) => sigmoid(predict(t, x))));
  const pSev = mean(set.sev.map((t) => sigmoid(predict(t, x))));
  return { mw, pAny, pSev };
}

/** Inputs a reader can change. Each sets one or more features; `delta` features move by the same amount. */
export type Knob = { id: string; label: string; unit: string; min: number; max: number; step: number; set: string[]; delta?: string[]; note: string };

export const KNOBS: Record<'tonight' | 'tomorrow', Knob[]> = {
  tonight: [
    { id: 'plan', label: 'NLDC’s planned shedding tonight', unit: 'MW', min: 0, max: 3500, step: 50, set: ['f_ls_total_mw'], note: 'from the morning report' },
    { id: 'yday', label: 'Shedding at last evening’s peak', unit: 'MW', min: 0, max: 3500, step: 50, set: ['shed_l0'], note: 'yesterday’s actual' },
    { id: 'gas', label: 'Plants out for gas shortage', unit: 'MW', min: 0, max: 7000, step: 100, set: ['f_out_gas_mw'], delta: ['f_fuel_short_mw'], note: 'from the plant table' },
    { id: 'oil', label: 'Plants out for oil shortage', unit: 'MW', min: 0, max: 3500, step: 50, set: ['f_out_liquid_mw'], delta: ['f_fuel_short_mw'], note: 'from the plant table' },
    { id: 'tmax', label: 'Hottest temperature today', unit: '°C', min: 15, max: 42, step: 0.5, set: ['tmax'], delta: ['tmax_chg'], note: 'four-city average, forecast' },
  ],
  tomorrow: [
    { id: 'yday', label: 'Shedding at last evening’s peak', unit: 'MW', min: 0, max: 3500, step: 50, set: ['shed_l0'], note: 'yesterday’s actual' },
    { id: 'tmax', label: 'Hottest temperature tomorrow', unit: '°C', min: 15, max: 42, step: 0.5, set: ['tmax'], delta: ['tmax_chg'], note: 'four-city average, forecast' },
  ],
};

export function applyKnobs(set: ModelSet, x0: (number | null)[], knobs: Knob[], values: Record<string, number>) {
  const x = [...x0];
  for (const k of knobs) {
    const v = values[k.id];
    if (v == null) continue;
    const i0 = set.features.indexOf(k.set[0]);
    if (i0 < 0) continue;
    const old = x0[i0] ?? 0;
    for (const f of k.set) { const i = set.features.indexOf(f); if (i >= 0) x[i] = v; }
    for (const f of k.delta ?? []) { const i = set.features.indexOf(f); if (i >= 0) x[i] = (x[i] ?? 0) + (v - old); }
  }
  // Last evening's shedding also enters through the features derived from it: keep them consistent,
  // computed exactly as ml/loadshed_long.py does from the last seven evenings.
  if (values.yday != null) {
    const F = (n: string) => set.features.indexOf(n);
    const get = (n: string) => x[F(n)];
    const put = (n: string, v: number) => { if (F(n) >= 0) x[F(n)] = v; };
    const old = x0[F('shed_l0')] ?? 0;
    const lags = [0, 1, 2, 3, 4, 5, 6].map((k) => get(`shed_l${k}`)).filter((v): v is number => v != null);
    if (lags.length) {
      put('shed_mean7', lags.reduce((s, v) => s + v, 0) / lags.length);
      put('shed_max7', Math.max(...lags));
      put('shed_days7', lags.filter((v) => v > 0).length / lags.length);
    }
    const m30 = get('shed_mean30'); if (m30 != null) put('shed_mean30', m30 + (values.yday - old) / 30);
    const d30 = get('shed_days30'); if (d30 != null) put('shed_days30', Math.min(1, Math.max(0, d30 + ((values.yday > 0 ? 1 : 0) - (old > 0 ? 1 : 0)) / 30)));
    const dem = get('eve_dem_l0');
    if (dem != null) {
      put('shed_ratio_l0', values.yday / dem);
      put('deficit_l0', values.yday); // evening-peak demand includes the shed load: demand - generation = shed
      put('eve_gen_l0', dem - values.yday);
    }
  }
  return x;
}

export function knobStart(set: ModelSet, x0: (number | null)[], knobs: Knob[]) {
  const out: Record<string, number> = {};
  for (const k of knobs) {
    const i = set.features.indexOf(k.set[0]);
    if (i >= 0 && x0[i] != null) out[k.id] = x0[i] as number;
  }
  return out;
}
