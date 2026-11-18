import type { RegionSim } from '../../grid/region';
import type { Hover } from '../../scene/RegionScene';
import { KIND_COLOR } from '../../scene/RegionScene';
import { mw, num } from '../../lib/format';

const KIND_NAME: Record<string, string> = {
  nuclear: 'Nuclear', coal: 'Coal', gas: 'Gas', oil: 'Oil', hydro: 'Hydro', wind: 'Wind', solar: 'Solar', bio: 'Biomass',
};

export function HoverTip({ sim, hover }: { sim: RegionSim; hover: Hover | null }) {
  if (!hover) return null;
  let title = '';
  let line = '';
  if (hover.kind === 'plant') {
    const g = sim.gens[hover.index];
    title = g.def.name;
    line = `${KIND_NAME[g.def.kind]}, ${num(g.p)} of ${num(g.def.mw)} MW${g.def.est ? ' (capacity estimated)' : ''}`;
  } else if (hover.kind === 'bus') {
    const b = sim.buses[hover.index];
    title = b.def.name;
    line = `${b.def.kv} kV, ${b.V.toFixed(3)} pu, ${num(b.served)} MW served`;
  } else {
    const br = sim.branches[hover.index];
    title = sim.branchName(hover.index);
    line = br.closed ? `${num(Math.abs(br.P))} MW, ${num(br.loading * 100)} % of rating` : 'Open';
  }
  return (
    <div className="hover-tip" style={{ transform: `translate(${hover.x + 14}px, ${hover.y + 14}px)` }} role="tooltip">
      <strong>{title}</strong>
      <span>{line}</span>
    </div>
  );
}

export function Inspect({ sim, pick, onClose, interactive }: { sim: RegionSim; pick: Hover; onClose: () => void; interactive: boolean }) {
  if (pick.kind === 'plant') {
    const g = sim.gens[pick.index];
    const i = pick.index;
    return (
      <div className="rinsp">
        <Head title={g.def.name} sub={`${KIND_NAME[g.def.kind]} at ${sim.data.buses[g.def.bus]?.name ?? 'substation'}`} onClose={onClose} color={KIND_COLOR[g.def.kind]} />
        <div className="big-read"><strong>{num(g.p)}</strong><span>MW of {num(g.def.mw)}{g.def.est ? ', capacity estimated' : ''}</span></div>
        <p className="hint">{g.online ? 'Synchronised and generating.' : g.tripReason ? `Tripped: ${g.tripReason}.` : 'Not committed: held in reserve.'}</p>
        {interactive && (
          <div className="row2">
            <button className="btn ghost" onClick={() => sim.startGen(i)} disabled={g.online}>Start</button>
            <button className="btn ghost" onClick={() => sim.tripGen(i, 'tripped by you')} disabled={!g.online}>Trip</button>
          </div>
        )}
      </div>
    );
  }
  if (pick.kind === 'bus') {
    const b = sim.buses[pick.index];
    const near = { x: b.def.x, z: b.def.z, r: Math.max(8, sim.data.extent / 30) };
    return (
      <div className="rinsp">
        <Head title={b.def.name} sub={`${b.def.kv} kV substation`} onClose={onClose} />
        <div className="big-read"><strong>{b.V.toFixed(3)}</strong><span>pu voltage{b.live ? '' : ', dead'}</span></div>
        <dl className="facts">
          <div><dt>Demand</dt><dd>{mw(b.demand)}</dd></div>
          <div><dt>Served</dt><dd>{mw(b.served)}</dd></div>
          <div><dt>Frequency</dt><dd>{b.f > 0 ? `${b.f.toFixed(3)} Hz` : 'Dead'}</dd></div>
          <div><dt>Shed</dt><dd>{num(b.shed * 100)} %</dd></div>
        </dl>
        {interactive && (
          <div className="row2">
            <button className="btn ghost" onClick={() => sim.shedLoad(0.1, near)}>Shed 10 % here</button>
            <button className="btn ghost" onClick={() => sim.restoreLoad(0.1)}>Restore 10 %</button>
          </div>
        )}
      </div>
    );
  }
  const br = sim.branches[pick.index];
  return (
    <div className="rinsp">
      <Head title={sim.branchName(pick.index)} sub={`${br.def.kv} kV, ${br.def.circuits} circuit${br.def.circuits > 1 ? 's' : ''}, ${num(br.def.km)} km`} onClose={onClose} />
      <div className="big-read"><strong>{num(Math.abs(br.P))}</strong><span>MW, {num(br.loading * 100)} % of {num(br.def.mva)} MVA</span></div>
      <dl className="facts">
        <div><dt>Reactive</dt><dd>{num(br.Q)} Mvar</dd></div>
        <div><dt>Conductor heat</dt><dd>{num(br.heat * 100)} %</dd></div>
        <div><dt>Reactance</dt><dd>{br.def.x.toFixed(4)} pu</dd></div>
        <div><dt>Charging</dt><dd>{br.def.bc.toFixed(3)} pu</dd></div>
      </dl>
      {br.tripped && <p className="hint bad">Tripped: {br.tripped}.</p>}
      {interactive && (
        <button className={`btn ${br.closed ? 'ghost' : 'primary'} wide`} onClick={() => (br.closed ? sim.tripBranch(pick.index, 'opened by you') : sim.closeBranch(pick.index))}>
          {br.closed ? 'Open breaker' : 'Close breaker'}
        </button>
      )}
    </div>
  );
}

function Head({ title, sub, onClose, color }: { title: string; sub: string; onClose: () => void; color?: string }) {
  return (
    <div className="insp-head">
      {color && <span className="kind-dot" style={{ background: color, marginTop: 10 }} aria-hidden="true" />}
      <div style={{ flex: 1 }}>
        <h2>{title}</h2>
        <p>{sub}</p>
      </div>
      <button className="insp-back" onClick={onClose} aria-label="Close">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
      </button>
    </div>
  );
}

export function SystemStats({ sim }: { sim: RegionSim }) {
  const online = sim.gens.filter((g) => g.online);
  const gen = online.reduce((a, g) => a + g.p, 0);
  const vs = sim.buses.filter((b) => b.live && b.def.kv > 0).map((b) => b.V);
  return (
    <div className="kv-grid">
      <div><span>Demand</span><strong>{mw(sim.demand)}</strong></div>
      <div><span>Served</span><strong className={sim.served < sim.demand * 0.98 ? 'bad' : ''}>{num((100 * sim.served) / Math.max(1, sim.demand))} %</strong></div>
      <div><span>Local generation</span><strong>{mw(gen)}</strong></div>
      <div><span>{sim.ext.hvdc ? 'HVDC import' : 'Net import'}</span><strong>{mw(sim.ext.online ? sim.ext.p : 0)}</strong></div>
      <div><span>Voltage range</span><strong>{vs.length ? `${Math.min(...vs).toFixed(2)}–${Math.max(...vs).toFixed(2)}` : '—'}</strong></div>
      <div><span>Islands</span><strong>{sim.islands.members.filter((m) => m.length > 1 && sim.buses[m[0]].live).length}</strong></div>
    </div>
  );
}
