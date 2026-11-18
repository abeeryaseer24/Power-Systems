import type { GridSim, PlantState, UnitStatus } from '../grid/engine';
import { UFLS_BLOCK } from '../grid/engine';
import { BUSES, KIND_LABEL } from '../grid/network';
import { duration, mw, num } from '../lib/format';

export type Selection = { kind: 'plant' | 'line' | 'district'; id: string } | null;

const STATUS: Record<UnitStatus, string> = {
  off: 'Off',
  starting: 'Starting',
  waiting: 'Needs live grid',
  online: 'Online',
  stopping: 'Running down',
  tripped: 'Tripped',
};

interface Props {
  sim: GridSim;
  sel: Selection;
  onSelect: (s: Selection) => void;
  act: (fn: (s: GridSim) => void) => void;
}

export default function Inspector({ sim, sel, onSelect, act }: Props) {
  if (sel?.kind === 'plant') return <PlantPanel sim={sim} p={sim.plant(sel.id)} onBack={() => onSelect(null)} act={act} />;
  if (sel?.kind === 'line') return <LinePanel sim={sim} id={sel.id} onBack={() => onSelect(null)} act={act} />;
  if (sel?.kind === 'district') return <DistrictPanel sim={sim} id={sel.id} onBack={() => onSelect(null)} act={act} />;
  return <SystemPanel sim={sim} onSelect={onSelect} act={act} />;
}

function Head({ title, sub, onBack }: { title: string; sub: string; onBack?: () => void }) {
  return (
    <div className="insp-head">
      {onBack && (
        <button className="insp-back" onClick={onBack} aria-label="Back to system overview">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
        </button>
      )}
      <div>
        <h2>{title}</h2>
        <p>{sub}</p>
      </div>
    </div>
  );
}

function Bar({ value, max, tone = 'glaze', marks = [] }: { value: number; max: number; tone?: string; marks?: number[] }) {
  const pct = Math.max(0, Math.min(1, value / Math.max(1e-9, max))) * 100;
  return (
    <div className={`bar bar-${tone}`}>
      <i style={{ width: `${pct}%` }} />
      {marks.map((m, k) => <b key={k} style={{ left: `${(m / max) * 100}%` }} />)}
    </div>
  );
}

function SystemPanel({ sim, onSelect, act }: { sim: GridSim; onSelect: (s: Selection) => void; act: Props['act'] }) {
  const demand = sim.districts.reduce((a, d) => a + d.demand, 0);
  const served = sim.districts.reduce((a, d) => a + d.served, 0);
  const reserve = sim.reserve();
  const need = sim.largestInfeed();
  const order: string[] = ['kestrel', 'ridgeway', 'harbour', 'airport', 'glen', 'saltmarsh', 'sunfield', 'bess', 'westmark'];
  const maxOut = 1200;
  return (
    <div className="insp">
      <Head title="System" sub={`${sim.islands.members.length > 1 ? `${sim.islands.members.length} islands` : 'One synchronous system'}`} />
      <div className="kv-grid">
        <div><span>Demand</span><strong>{mw(demand)}</strong></div>
        <div><span>Served</span><strong className={served < demand - 5 ? 'bad' : ''}>{mw(served)}</strong></div>
        <div><span>Spinning reserve</span><strong className={reserve < need ? 'bad' : ''}>{mw(reserve)}</strong></div>
        <div><span>Largest single loss</span><strong>{mw(need)}</strong></div>
      </div>
      <p className="hint">{reserve < need ? 'Reserve is below the largest single loss. If that unit trips, frequency will fall far enough to shed load.' : 'Reserve covers the largest single loss.'}</p>
      <h3>Generation</h3>
      <ul className="gen-list">
        {order.map((id) => {
          const p = sim.plant(id);
          const on = p.units.filter((u) => u.status === 'online').length;
          const starting = p.units.some((u) => u.status === 'starting' || u.status === 'waiting');
          const tripped = p.units.some((u) => u.status === 'tripped');
          return (
            <li key={id}>
              <button onClick={() => onSelect({ kind: 'plant', id })}>
                <span className={`kind-dot k-${p.def.kind}`} aria-hidden="true" />
                <span className="gen-name">{p.def.name}</span>
                <span className="gen-mw">{num(p.output)}</span>
                <Bar value={Math.abs(p.output)} max={maxOut} tone={p.output < 0 ? 'arc' : 'sodium'} />
                <span className="gen-meta">
                  {p.def.kind === 'wind' || p.def.kind === 'solar'
                    ? `${num(p.available)} MW available`
                    : `${on}/${p.def.units} online${starting ? ', starting' : ''}${tripped ? ', tripped' : ''}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <button className="btn ghost wide" onClick={() => act((s) => s.suggestDispatch())}>Suggest dispatch for the next 15 minutes</button>
    </div>
  );
}

function PlantPanel({ sim, p, onBack, act }: { sim: GridSim; p: PlantState; onBack: () => void; act: Props['act'] }) {
  const d = p.def;
  const cap = d.unitMax * d.units;
  const isRen = d.kind === 'wind' || d.kind === 'solar';
  const isStore = d.kind === 'battery' || d.kind === 'hydro';
  const canUnits = !isRen && d.kind !== 'battery' && d.kind !== 'link';
  const lo = isRen ? 0 : Math.min(0, d.unitMin * d.units);
  const live = sim.energized[d.bus];
  const price = sim.costOf(p);
  return (
    <div className="insp">
      <Head title={d.name} sub={`${KIND_LABEL[d.kind]} at ${BUSES[d.bus].name}`} onBack={onBack} />
      <div className="big-read">
        <strong>{num(p.output)}</strong>
        <span>MW of {num(cap)}</span>
      </div>
      <Bar value={Math.abs(p.output)} max={cap} tone={p.output < 0 ? 'arc' : 'sodium'} marks={[p.setpoint + p.agcOffset].filter((x) => x > 0)} />
      {!live && <p className="hint bad">This substation is dead. Inverter plant waits for voltage; machines need a live grid to synchronise{d.blackStart ? ', except Glen Dam, which can black start' : ''}.</p>}

      {canUnits && (
        <>
          <h3>Units</h3>
          <ul className="units">
            {p.units.map((u, i) => (
              <li key={i} className={`u-${u.status}${u.unavailable ? ' u-out' : ''}`}>
                <span>Unit {i + 1}</span>
                <span>
                  {u.unavailable ? 'Out for repair' : STATUS[u.status]}
                  {u.status === 'starting' && ` · ${duration(u.startLeft)}`}
                </span>
                <span>{u.status === 'online' || u.status === 'stopping' ? mw(u.p) : ''}</span>
              </li>
            ))}
          </ul>
          <div className="row2">
            <button className="btn ghost" onClick={() => act((s) => s.startUnit(d.id))} disabled={!p.units.some((u) => (u.status === 'off' || u.status === 'tripped') && !u.unavailable) || d.startTime > 24 * 3600}>
              Start a unit
            </button>
            <button className="btn ghost" onClick={() => act((s) => s.stopUnit(d.id))} disabled={!p.units.some((u) => u.status !== 'off' && u.status !== 'tripped' && u.status !== 'stopping')}>
              Stop a unit
            </button>
          </div>
          <p className="hint">
            {d.startTime > 24 * 3600 ? 'A reactor restart takes more than a day. These units cannot be started during a shift.' : `Start-up takes ${duration(d.startTime)}. Units then ramp at ${d.ramp} MW a minute.`}
          </p>
        </>
      )}

      <h3>{isRen ? 'Output cap' : d.kind === 'battery' ? 'Charge or discharge' : d.kind === 'link' ? 'Import or export' : 'Dispatch setpoint'}</h3>
      <div className="slider">
        <input
          type="range"
          min={lo}
          max={cap}
          step={5}
          value={Math.round(p.setpoint)}
          aria-label="Setpoint in megawatts"
          onChange={(e) => {
            const v = Number(e.target.value);
            act((s) => s.setSetpoint(d.id, v));
          }}
        />
        <output>{num(p.setpoint)} MW</output>
      </div>
      {isRen && <p className="hint">{num(p.available)} MW available from the {d.kind === 'wind' ? `wind at ${sim.wind.toFixed(1)} m/s` : 'sun right now'}. Lower the cap to curtail.</p>}
      {d.kind === 'battery' && <p className="hint">Negative charges the battery. Fast frequency response adds up to ±{d.unitMax} MW on top within half a second.</p>}
      {d.kind === 'link' && <p className="hint">Negative exports to Westmark. Import price now €{num(price)}/MWh. The converter needs at least 300 MW of machines online to run.</p>}
      {d.agc !== undefined || ['coal', 'ccgt', 'ocgt', 'hydro'].includes(d.kind) ? (
        <label className="toggle">
          <input type="checkbox" checked={p.agc} onChange={(e) => act((s) => s.setAgc(d.id, e.target.checked))} />
          <span>Follow automatic generation control</span>
          {p.agc && <em>{p.agcOffset >= 0 ? '+' : '−'}{num(Math.abs(p.agcOffset))} MW</em>}
        </label>
      ) : null}

      {isStore && (
        <>
          <h3>{d.kind === 'battery' ? 'State of charge' : 'Upper reservoir'}</h3>
          <Bar value={p.stored} max={d.energy ?? 1} tone="glaze" />
          <p className="hint">{num(p.stored)} of {num(d.energy ?? 0)} MWh{p.output > 1 ? `, about ${duration((p.stored / p.output) * 3600)} at this output` : ''}.</p>
        </>
      )}
      <dl className="facts">
        <div><dt>Marginal cost</dt><dd>€{num(price)}/MWh</dd></div>
        <div><dt>Carbon</dt><dd>{d.co2} kg/MWh</dd></div>
        <div><dt>Inertia</dt><dd>{d.H ? `H = ${d.H} s` : 'None (inverter)'}</dd></div>
        <div><dt>Droop</dt><dd>{d.droop ? `${d.droop * 100} %` : 'No primary response'}</dd></div>
      </dl>
    </div>
  );
}

function LinePanel({ sim, id, onBack, act }: { sim: GridSim; id: string; onBack: () => void; act: Props['act'] }) {
  const l = sim.line(id);
  const from = BUSES[l.def.from].name;
  const to = BUSES[l.def.to].name;
  const dir = l.flow >= 0 ? `${from} to ${to}` : `${to} to ${from}`;
  const ttt = l.loading > 1 ? ((1 - l.heat) * 240) / (l.loading * l.loading - 1) : Infinity;
  const tone = l.loading > 1 ? 'trip' : l.loading > 0.9 ? 'sodium' : 'glaze';
  return (
    <div className="insp">
      <Head title={l.def.name} sub={`275 kV overhead line, x = ${l.def.x} pu`} onBack={onBack} />
      <div className="big-read">
        <strong>{num(Math.abs(l.flow))}</strong>
        <span>MW, {Math.abs(l.flow) > 1 ? dir : 'no flow'}</span>
      </div>
      <Bar value={l.loading} max={1.5} tone={tone} marks={[1]} />
      <div className="kv-grid">
        <div><span>Loading</span><strong className={l.loading > 1 ? 'bad' : ''}>{num(l.loading * 100)} %</strong></div>
        <div><span>Rating now</span><strong>{mw(l.rating)}</strong></div>
        <div><span>Conductor heat</span><strong className={l.heat > 0.6 ? 'bad' : ''}>{num(l.heat * 100)} %</strong></div>
        <div><span>Time to trip</span><strong>{Number.isFinite(ttt) ? duration(ttt) : 'Not overloaded'}</strong></div>
      </div>
      <p className="hint">
        {l.rating < l.def.rating - 1
          ? `Hot air has cut this line's rating from ${l.def.rating} MW to ${Math.round(l.rating)} MW.`
          : 'Power divides between parallel paths in inverse proportion to their reactance. You cannot steer it directly: move generation or open lines.'}
      </p>
      <button className={`btn ${l.closed ? 'ghost' : 'primary'} wide`} onClick={() => act((s) => s.toggleLine(id))}>
        {l.closed ? 'Open breaker' : 'Close breaker'}
      </button>
      {l.reclosing > 0 && <p className="hint">Auto-reclose in {l.reclosing.toFixed(1)} s.</p>}
      {l.tripped && !l.closed && l.reclosing <= 0 && <p className="hint bad">Tripped by protection. Check flows before you close it again.</p>}
    </div>
  );
}

function DistrictPanel({ sim, id, onBack, act }: { sim: GridSim; id: string; onBack: () => void; act: Props['act'] }) {
  const d = sim.district(id);
  const live = sim.energized[d.def.bus];
  const shed = d.uflsStage * UFLS_BLOCK;
  return (
    <div className="insp">
      <Head title={d.def.name} sub={`${d.def.kind[0].toUpperCase()}${d.def.kind.slice(1)} district, fed from ${BUSES[d.def.bus].name}`} onBack={onBack} />
      <div className="big-read">
        <strong>{num(d.served)}</strong>
        <span>of {mw(d.demand)} served</span>
      </div>
      <Bar value={d.served} max={Math.max(1, d.demand)} tone={d.served < d.demand - 2 ? 'trip' : 'sodium'} />
      {!live && <p className="hint bad">No supply: the substation is dead.</p>}
      <h3>Feeders connected</h3>
      <div className="slider">
        <input
          type="range" min={0} max={1} step={0.1} value={d.connected} aria-label="Fraction of feeders connected"
          onChange={(e) => {
            const v = Number(e.target.value);
            act((s) => s.setConnected(id, v));
          }}
        />
        <output>{Math.round(d.connected * 100)} %</output>
      </div>
      <p className="hint">Each 10 % step picks up about {mw(d.demand * 0.1)} at once. During a black start, small steps keep the frequency up.</p>
      {d.uflsStage > 0 && (
        <>
          <h3>Shed by under-frequency relays</h3>
          <p className="hint bad">{Math.round(shed * 100)} % of this district was cut automatically.</p>
          <button className="btn primary wide" onClick={() => act((s) => s.restoreUfls(id))}>Restore one block</button>
        </>
      )}
      <dl className="facts">
        <div><dt>Rooftop solar</dt><dd>{mw(d.rooftop)}{d.rooftopTripped > 0.05 ? ', partly tripped' : ''}</dd></div>
        <div><dt>Air conditioning</dt><dd>{d.def.cooling} MW per °C above 21</dd></div>
        <div><dt>Heating</dt><dd>{d.def.heating} MW per °C below 14</dd></div>
        <div><dt>Surge</dt><dd>{d.surge > 1 ? mw(d.surge) : 'None'}</dd></div>
      </dl>
    </div>
  );
}
