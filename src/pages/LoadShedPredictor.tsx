import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { num } from '../lib/format';
import { KNOBS, applyKnobs, knobStart, run, type Live, type Models } from '../ai/loadshed';
import '../plants.css';
import '../city.css';
import '../forecast.css';
import '../loadshed.css';

const ZONES = ['rangpur', 'mymensingh', 'sylhet', 'rajshahi', 'dhaka', 'cumilla', 'khulna', 'barishal', 'chattogram'];
const ZONE_NAME: Record<string, string> = { dhaka: 'Dhaka', chattogram: 'Chattogram', cumilla: 'Cumilla', mymensingh: 'Mymensingh', sylhet: 'Sylhet', khulna: 'Khulna', barishal: 'Barishal', rajshahi: 'Rajshahi', rangpur: 'Rangpur' };
const fmtDay = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const pct = (x: number) => `${Math.round(x * 100)} %`;

function verdict(p: number, mw: number) {
  if (p < 0.2) return { word: 'Unlikely', cls: 'calm' };
  if (p < 0.5) return { word: 'Possible', cls: 'maybe' };
  if (mw > 1000) return { word: 'Heavy', cls: 'heavy' };
  return { word: 'Likely', cls: 'likely' };
}

function heat(v: number) {
  if (v <= 0.5) return 'rgba(134, 197, 218, 0.08)';
  const t = Math.min(1, Math.sqrt(v / 800));
  return `rgba(255, ${Math.round(176 - 85 * t)}, ${Math.round(77 + 2 * t)}, ${0.25 + 0.7 * t})`;
}

export default function LoadShedPredictor() {
  const [models, setModels] = useState<Models | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [err, setErr] = useState('');
  const [which, setWhich] = useState<'tonight' | 'tomorrow'>('tonight');
  const [vals, setVals] = useState<Record<string, Record<string, number>>>({});
  useEffect(() => {
    Promise.all([fetch('/data/loadshed/models.json').then((r) => r.json()), fetch('/data/loadshed/live.json').then((r) => r.json())])
      .then(([m, l]) => { setModels(m); setLive(l); })
      .catch((e) => setErr(String(e)));
  }, []);

  const start = useMemo(() => {
    if (!models || !live) return null;
    return { tonight: knobStart(models.sets.tonight, live.tonight.x, KNOBS.tonight), tomorrow: knobStart(models.sets.tomorrow, live.tomorrow.x, KNOBS.tomorrow) };
  }, [models, live]);

  const res = useMemo(() => {
    if (!models || !live || !start) return null;
    const out = {} as Record<'tonight' | 'tomorrow', { mw: number; pAny: number; pSev: number; changed: boolean }>;
    for (const w of ['tonight', 'tomorrow'] as const) {
      const v = { ...start[w], ...(vals[w] ?? {}) };
      const changed = Object.keys(vals[w] ?? {}).some((k) => vals[w][k] !== start[w][k]);
      const x = changed ? applyKnobs(models.sets[w], live[w].x, KNOBS[w], v) : live[w].x;
      out[w] = { ...run(models, models.sets[w], x), changed };
    }
    return out;
  }, [models, live, start, vals]);

  if (err) return <main id="main" className="page fc-page"><p className="cy-hint warn">The forecast could not be loaded: {err}</p></main>;
  if (!models || !live || !res || !start) return <main id="main" className="page fc-page"><p className="cy-hint">Reading the latest NLDC report…</p></main>;

  const day = live[which];
  const r = res[which];
  const v = verdict(r.pAny, r.mw);
  const knobs = KNOBS[which];
  const cur = { ...start[which], ...(vals[which] ?? {}) };
  const set = (id: string, x: number) => setVals((o) => ({ ...o, [which]: { ...(o[which] ?? {}), [id]: x } }));
  const reset = () => setVals((o) => ({ ...o, [which]: {} }));
  const updated = new Date(live.updated);
  const recentMax = Math.max(500, ...live.recent.map((x) => Math.max(x[1] ?? 0, x[2] ?? 0)));

  return (
    <main id="main" className="page fc-page ls-page">
      <header className="fr-head fc-head">
        <p className="pv-kicker">Real grids · Machine learning · Bangladesh</p>
        <h1>Load shedding: tonight and tomorrow</h1>
        <p>A forecast for Bangladesh’s national grid at the evening peak, remade every day from the National Load Dispatch Centre’s morning report. It learned from 11½ years of PGCB records and was tested on days it never saw. Change any input below and the same model answers again.</p>
      </header>

      <div className="pv-seg fc-seg ls-which">
        <button className={which === 'tonight' ? 'on' : ''} onClick={() => setWhich('tonight')}>Tonight · {fmtDay(live.tonight.date)}</button>
        <button className={which === 'tomorrow' ? 'on' : ''} onClick={() => setWhich('tomorrow')}>Tomorrow · {fmtDay(live.tomorrow.date)}</button>
      </div>

      <section className={`fc-block ls-verdict ${v.cls}`}>
        <div className="ls-big">
          <span>Load shedding at the evening peak</span>
          <b>{v.word}</b>
          <em>{pct(r.pAny)} chance{r.changed ? ' with your inputs' : ''}</em>
        </div>
        <dl className="fc-scores fc-small">
          <div className="ours"><dt>Expected</dt><dd>{num(r.mw)} MW</dd><small>national, at the evening peak</small></div>
          <div><dt>Chance above {num(models.severeMW)} MW</dt><dd>{pct(r.pSev)}</dd><small>a severe evening</small></div>
          {which === 'tonight' && <div><dt>NLDC’s plan</dt><dd>{day.nldc == null ? '—' : `${num(day.nldc)} MW`}</dd><small>in this morning’s report</small></div>}
          <div><dt>Last evening</dt><dd>{day.persist == null ? '—' : `${num(day.persist)} MW`}</dd><small>actual, {new Date(`${live.lastActual}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</small></div>
        </dl>
      </section>

      <section className="fc-block">
        <h2>Where it would fall</h2>
        <div className="ls-day-grid">
          <div className="ls-map">
            {ZONES.map((z, i) => {
              const mw = r.mw * (live.zoneShares[z] ?? 0);
              return <div key={z} style={{ gridColumn: (i % 3) + 1, gridRow: Math.floor(i / 3) + 1, background: heat(mw) }}><span>{ZONE_NAME[z]}</span><b>{num(mw)}</b></div>;
            })}
          </div>
          <p className="fc-p">The national figure is split by each zone’s share of the shedding over the last seven evenings. That is a rule of thumb, not a zone model: NLDC reallocates shedding between zones day to day.</p>
        </div>
      </section>

      <section className="fc-block">
        <h2>Change the inputs</h2>
        <p className="fc-p">Each slider starts at the value in the latest report or forecast. Move one and the model runs again in your browser; nothing else changes.</p>
        <div className="ls-knobs">
          {knobs.map((k) => (
            <label key={k.id}>
              <span>{k.label}<small>{k.note}</small></span>
              <input type="range" min={k.min} max={k.max} step={k.step} value={cur[k.id] ?? k.min} onChange={(e) => set(k.id, Number(e.target.value))} />
              <b>{k.unit === '°C' ? (cur[k.id] ?? 0).toFixed(1) : num(cur[k.id] ?? 0)} {k.unit}</b>
            </label>
          ))}
        </div>
        {r.changed && <button className="btn ghost ls-reset" onClick={reset}>Back to the report’s values</button>}
      </section>

      <section className="fc-block">
        <h2>The last six weeks</h2>
        <div className="fc-chart">
          <svg viewBox="0 0 1000 170" preserveAspectRatio="none" className="ls-recent">
            {live.recent.map(([d, a, p], i) => {
              const bw = 1000 / live.recent.length;
              const h = ((a ?? 0) / recentMax) * 150;
              return (
                <g key={d}>
                  <rect x={i * bw + 1} y={160 - h} width={bw - 2} height={h} className="ls-rbar" />
                  {p != null && p > 0 && <rect x={i * bw + bw * 0.2} y={160 - (p / recentMax) * 150 - 1.5} width={bw * 0.6} height={3} className="ls-rplan" />}
                </g>
              );
            })}
          </svg>
          <ul className="fc-legend"><li><i style={{ background: 'var(--sodium)' }} />shed at the evening peak</li><li><i style={{ background: 'var(--glaze)' }} />NLDC’s plan</li><li className="fc-scale">top {num(recentMax)} MW</li></ul>
        </div>
      </section>

      <section className="fc-block fc-notes">
        <h2>How far to trust it</h2>
        <ul>
          <li>Tested on {'2018–2026'} without ever seeing the test days: see <Link to="/load-shedding/study">the study</Link>. Its biggest advantage over NLDC’s own plan is on <em>whether</em> there will be shedding; on the megawatts it is only modestly better than assuming tonight will be like last night.</li>
          <li>It knows yesterday’s grid, NLDC’s plan for today, the plant-by-plant fuel shortages, the temperature forecast and the calendar. It does not know about a plant that trips this afternoon or an LNG cargo that arrives late, which is what moves shedding most from one day to the next.</li>
          <li>Updated {updated.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} from report {live.last_report_id}; models trained on data to {models.trainedTo}. If the newest report is missing, the forecast is for the day after the last one available.</li>
        </ul>
        <p className="cy-hint">Data: PGCB / NLDC daily reports; PGCB hourly record 2015–2026 (Rafi &amp; Shekh, Mendeley Data, CC BY 4.0); Open-Meteo temperature. Code: <code>ml/loadshed_final.py</code>, <code>ml/loadshed_live.py</code>.</p>
      </section>
    </main>
  );
}
