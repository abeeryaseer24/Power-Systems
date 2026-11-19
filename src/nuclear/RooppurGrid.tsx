import { useState } from 'react';
import { loadRegion, RegionSim, type RegionPlant, type RegionTrace } from '../grid/region';
import Traces from '../components/Traces';
import { mw, num } from '../lib/format';
import { Slider } from '../pages/learn/kit';

type Trip = 'one' | 'both';

/** Rooppur's two units on the national grid model, and what their loss does. */
export default function RooppurGrid() {
  const [reserve, setReserve] = useState(0.25);
  const [trip, setTrip] = useState<Trip>('one');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ trace: RegionTrace[]; fMin: number; lost: number; demand: number; collapsed: boolean } | null>(null);

  const run = async () => {
    setBusy(true);
    const data = await loadRegion('dhaka');
    const s = new RegionSim(data);
    s.responseShare = reserve;
    const [lat0, lon0] = data.center;
    const x = (89.05 - lon0) * 111.32 * Math.cos((lat0 * Math.PI) / 180);
    const z = -(24.07 - lat0) * 110.57;
    const bus = data.buses.reduce((bi, b, i) => (Math.hypot(b.x - x, b.z - z) < Math.hypot(data.buses[bi].x - x, data.buses[bi].z - z) ? i : bi), 0);
    for (const n of [1, 2]) {
      const def: RegionPlant = { name: `Rooppur unit ${n}`, kind: 'nuclear', mw: 1200, bus, x, z };
      s.addPlant(def, 1150);
    }
    s.settle(20);
    s.at(5, (sim) => {
      sim.gens.forEach((g, i) => {
        if (g.def.name === 'Rooppur unit 1' || (trip === 'both' && g.def.name === 'Rooppur unit 2')) sim.tripGen(i, trip === 'both' ? 'common-cause trip of both units' : 'reactor trip');
      });
    });
    await new Promise<void>((resolve) => {
      const chunk = () => {
        const t0 = performance.now();
        while (s.t < 70 && performance.now() - t0 < 12) s.advance(0.5);
        if (s.t < 70) setTimeout(chunk, 0);
        else resolve();
      };
      chunk();
    });
    const live = s.trace.filter((t) => t.f > 0);
    setRes({ trace: s.trace, fMin: live.length ? Math.min(...live.map((t) => t.f)) : 0, lost: s.peakLost, demand: s.demand, collapsed: s.served < s.demand * 0.5 });
    setBusy(false);
  };

  return (
    <section className="rp-grid">
      <h2>Rooppur on the Bangladesh grid</h2>
      <p>Each Rooppur unit will produce about 1,150 MW, more than one tenth of Bangladesh’s evening demand. Here both units run on the national 230/400 kV model. Choose how much of the fleet holds fast frequency reserve, trip a unit, and see whether the grid holds.</p>
      <div className="widget">
        <div className="w-controls">
          <Slider label="Share of plants providing fast reserve" value={reserve} min={0.05} max={0.5} step={0.01} unit="" fmt={(v) => `${Math.round(v * 100)} %`} onChange={setReserve} />
          <div className="w-buttons">
            <button className={`chip ${trip === 'one' ? 'on' : ''}`} onClick={() => setTrip('one')}>Trip one unit</button>
            <button className={`chip ${trip === 'both' ? 'on' : ''}`} onClick={() => setTrip('both')}>Trip both units</button>
            <button className="btn primary small" onClick={run} disabled={busy}>{busy ? 'Running…' : 'Run it'}</button>
          </div>
        </div>
        {res && (
          <>
            <div className="rp-trace"><Traces trace={res.trace} f0={50} tick={res.trace.length} marks={[{ t: 5, label: 'Trip' }]} /></div>
            <div className="w-read">
              <div><span>Lowest frequency</span><strong className={res.fMin < 49 ? 'bad' : ''}>{res.collapsed ? 'Collapse' : `${res.fMin.toFixed(2)} Hz`}</strong></div>
              <div><span>Demand cut by relays</span><strong className={res.lost > 50 ? 'bad' : ''}>{mw(res.lost)}</strong></div>
              <div><span>Share of demand</span><strong>{num((100 * res.lost) / Math.max(1, res.demand))} %</strong></div>
            </div>
            <p className="hint">{res.collapsed ? 'The grid collapsed. Bangladesh would need far more fast reserve, or batteries, to survive this loss.' : res.lost > 50 ? 'The grid survived only by cutting customers off. More fast reserve would avoid it.' : 'The grid rode through the loss without cutting anyone off.'}</p>
          </>
        )}
      </div>
      <p className="hint">The largest single unit sets the reserve a grid must hold. Rooppur roughly doubles Bangladesh’s largest single loss, which is why its connection came with new 400 kV lines and new reserve requirements.</p>
    </section>
  );
}
