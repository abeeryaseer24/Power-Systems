// Tomorrow's national demand for Great Britain, forecast in the browser with the model
// trained by ml/forecast.py and exported by ml/export.py. The features are built exactly
// as in training: demand lags from Elexon (initial national demand outturn), weather from
// the Open-Meteo forecast for ten cities, embedded solar and wind capacity, and the calendar.

import { predict, type Tree } from './gbm';

export type GbModel = {
  features: string[];
  models: { q10: Tree[]; q50: Tree[]; q90: Tree[] };
  solarCapacityMW: number;
  windCapacityMW: number;
  cities: { name: string; lat: number; lon: number; w: number }[];
  trainedTo: string;
  holidays: string[];
  calibrationMW?: number; // conformal widening of the 10-90 % range
};

export type HalfHour = { t: number; sp: number; q10: number; q50: number; q90: number; neso: number | null; outturn: number | null };

const ELEXON = 'https://data.elexon.co.uk/bmrs/api/v1';
const VARS = ['temperature_2m', 'relative_humidity_2m', 'wind_speed_10m', 'cloud_cover', 'shortwave_radiation'] as const;
const HH = 30 * 60 * 1000;

const londonParts = (t: number) => {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) + Number(p.minute) / 60 };
};
/** UTC time of local midnight on a London date, by searching the two possible offsets. */
const londonMidnight = (date: string) => {
  for (const off of [0, 1]) {
    const t = Date.parse(`${date}T00:00:00Z`) - off * 3600e3;
    if (londonParts(t).date === date && londonParts(t).hour === 0) return t;
  }
  return Date.parse(`${date}T00:00:00Z`);
};
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

/** Half-hourly national demand outturn from Elexon, keyed by UTC start time. */
async function outturn(from: string, to: string) {
  const j = await json<{ data: { startTime: string; initialDemandOutturn: number }[] }>(`${ELEXON}/demand/outturn?settlementDateFrom=${from}&settlementDateTo=${to}&format=json`);
  const m = new Map<number, number>();
  for (const r of j.data) m.set(Date.parse(r.startTime), r.initialDemandOutturn);
  return m;
}

/** NESO's own day-ahead forecast (via Elexon) for a window. */
async function nesoForecast(fromT: number, toT: number) {
  const j = await json<{ data: { startTime: string; nationalDemand: number }[] }>(`${ELEXON}/forecast/demand/day-ahead?from=${new Date(fromT).toISOString()}&to=${new Date(toT).toISOString()}&format=json`);
  const m = new Map<number, number>();
  for (const r of j.data) m.set(Date.parse(r.startTime), r.nationalDemand);
  return m;
}

/** Population-weighted hourly weather forecast, interpolated to half hours. */
async function weather(model: GbModel, fromT: number, toT: number) {
  const lat = model.cities.map((c) => c.lat).join(','), lon = model.cities.map((c) => c.lon).join(',');
  const res = await json<{ hourly: Record<string, (number | null)[]> & { time: string[] } }[] | { hourly: Record<string, (number | null)[]> & { time: string[] } }>(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=${VARS.join(',')}&past_days=2&forecast_days=3&timezone=UTC`,
  );
  const list = Array.isArray(res) ? res : [res];
  const wsum = model.cities.reduce((a, c) => a + c.w, 0);
  const times = list[0].hourly.time.map((s) => Date.parse(`${s}:00Z`));
  const hourly = new Map<number, Record<string, number>>();
  times.forEach((t, i) => {
    const row: Record<string, number> = {};
    for (const v of VARS) row[v] = list.reduce((a, cityRes, k) => a + ((cityRes.hourly[v][i] ?? 0) * model.cities[k].w) / wsum, 0);
    hourly.set(t, row);
  });
  const at = (t: number) => {
    const h0 = Math.floor(t / 3600e3) * 3600e3, f = (t - h0) / 3600e3;
    const a = hourly.get(h0), b = hourly.get(h0 + 3600e3) ?? a;
    if (!a || !b) return null;
    const o: Record<string, number> = {};
    for (const v of VARS) o[v] = a[v] + (b[v] - a[v]) * f;
    return o;
  };
  const out = new Map<number, Record<string, number>>();
  for (let t = fromT - 2 * 86400e3; t <= toT; t += HH) { const w = at(t); if (w) out.set(t, w); }
  return out;
}

/** Forecast every half hour of tomorrow (London time). */
export async function forecastTomorrow(model: GbModel, now = Date.now()) {
  const today = londonParts(now).date, D = addDays(today, 1);
  const t0 = londonMidnight(D), t1 = londonMidnight(addDays(D, 1));
  const [hist, neso, wx] = await Promise.all([outturn(addDays(D, -8), today), nesoForecast(t0, t1 - HH), weather(model, t0, t1)]);
  const hol = new Set(model.holidays);
  // daily means for the D-2 mean and the D-1 morning
  const dayMean = (date: string) => { const a = londonMidnight(date), b = londonMidnight(addDays(date, 1)); let s = 0, n = 0; for (let t = a; t < b; t += HH) { const v = hist.get(t); if (v != null) { s += v; n++; } } return n > 30 ? s / n : null; };
  const morning = (date: string) => { const a = londonMidnight(date); let s = 0, n = 0; for (let k = 0; k < 16; k++) { const v = hist.get(a + k * HH); if (v != null) { s += v; n++; } } return n >= 12 ? s / n : null; };
  const mean_d2 = dayMean(addDays(D, -2)), morning_d1 = morning(addDays(D, -1));
  const dmeanTemp = (() => { let s = 0, n = 0; for (let t = t0; t < t1; t += HH) { const w = wx.get(t); if (w) { s += w.temperature_2m; n++; } } return n ? s / n : null; })();
  const doy = Math.floor((Date.parse(`${D}T12:00:00Z`) - Date.parse(`${D.slice(0, 4)}-01-01T00:00:00Z`)) / 86400e3) + 1;
  const dow = (new Date(`${D}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0, as in pandas
  const m = Number(D.slice(5, 7)), dd = Number(D.slice(8, 10));
  const out: HalfHour[] = [];
  let sp = 1;
  const missing = new Set<string>();
  for (let t = t0; t < t1; t += HH, sp++) {
    const lp = londonParts(t);
    const w = wx.get(t), wlag = wx.get(t - 48 * HH);
    if (!w) missing.add('weather');
    const lag = (k: number) => { const v = hist.get(t - k * HH); if (v == null) missing.add('recent demand'); return v ?? null; };
    const temp = w?.temperature_2m ?? null;
    const x: Record<string, number | null> = {
      hour: lp.hour, dow, doy_s: Math.sin((2 * Math.PI * doy) / 365.25), doy_c: Math.cos((2 * Math.PI * doy) / 365.25),
      holiday: hol.has(D) ? 1 : 0, xmas: (m === 12 && dd >= 22) || (m === 1 && dd <= 3) ? 1 : 0,
      bst: londonParts(t).hour !== new Date(t).getUTCHours() + new Date(t).getUTCMinutes() / 60 ? 1 : 0,
      lag_d2: lag(96), lag_d7: lag(336), mean_d2, morning_d1,
      temperature_2m: temp, relative_humidity_2m: w?.relative_humidity_2m ?? null, wind_speed_10m: w?.wind_speed_10m ?? null,
      cloud_cover: w?.cloud_cover ?? null, shortwave_radiation: w?.shortwave_radiation ?? null,
      temp_dmean: dmeanTemp, hdd: dmeanTemp == null ? null : Math.max(0, 15.5 - dmeanTemp), cdd: dmeanTemp == null ? null : Math.max(0, dmeanTemp - 20),
      temp_lag24: wlag?.temperature_2m ?? null,
      solar_mw: w ? (model.solarCapacityMW * w.shortwave_radiation) / 1000 : null,
      wind_mw: w ? model.windCapacityMW * (Math.min(25, Math.max(0, w.wind_speed_10m)) / 25) ** 3 : null,
      EMBEDDED_SOLAR_CAPACITY: model.solarCapacityMW, year: Number(D.slice(0, 4)) + doy / 366,
    };
    const vec = model.features.map((f) => x[f] ?? null);
    const q50 = predict(model.models.q50, vec);
    const Q = model.calibrationMW ?? 0;
    const q10 = Math.min(q50, predict(model.models.q10, vec)) - Q, q90 = Math.max(q50, predict(model.models.q90, vec)) + Q;
    out.push({ t, sp, q10, q50, q90, neso: neso.get(t) ?? null, outturn: hist.get(t) ?? null });
  }
  return { date: D, halfHours: out, missing: [...missing], issued: now };
}
