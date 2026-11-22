// Generates the graph dataset for the cascade GNN (Phase B). Run with:
//   DATA=1 REGIONS=dhaka,london N=300 SEED=1 npx vitest run src/ai/cascade-data.test.ts
// For each sample: set an operating point (load level, UFLS and reserve behaviour), take a
// snapshot of the grid as a graph, apply a contingency, let the simulator play the cascade
// out for 90 s, and record what was lost - per bus and for the whole grid.
// Output: ml/data/cascade/<region>-<seed>.jsonl (one graph per line).
import { it } from 'vitest';
import fs from 'node:fs';
import { RegionSim, type RegionData } from '../grid/region';
import { mulberry32 } from '../grid/profiles';
import { snapshot } from './cascade';

const OUT = 'ml/data/cascade';

it.skipIf(!process.env.DATA)('generate cascade graphs', () => {
  fs.mkdirSync(OUT, { recursive: true });
  const ids = (process.env.REGIONS ?? '').split(',').filter(Boolean);
  const N = Number(process.env.N ?? 200), seed = Number(process.env.SEED ?? 1);
  for (const id of ids) {
    const data: RegionData = JSON.parse(fs.readFileSync(`public/data/regions/${id}.json`, 'utf8'));
    const rand = mulberry32(seed * 1000 + id.length * 17);
    const file = `${OUT}/${id}-${seed}.jsonl`;
    fs.writeFileSync(file, '');
    const t0 = Date.now();
    for (let k = 0; k < N; k++) {
      const s = new RegionSim(structuredClone(data), { loadScale: 0.75 + rand() * 0.45 });
      s.uflsWorks = 0.3 + rand() * 0.7;
      s.responseShare = 0.1 + rand() * 0.35;
      s.advance(4);
      const before = snapshot(s);
      const d0 = Math.max(1, s.demand), live0 = s.buses.map((b) => (b.live ? b.served : 0));
      // contingency: 1-4 of the most loaded lines (biased), sometimes a large plant, sometimes the external tie
      const lines = s.branches.map((b, i) => ({ b, i })).filter((y) => y.b.closed && !y.b.ext).sort((a, b) => b.b.loading - a.b.loading);
      const nLines = 1 + Math.floor(rand() ** 1.5 * 4);
      const tripped: number[] = [];
      for (let j = 0; j < nLines && lines.length; j++) {
        const pick = Math.floor(rand() ** 2.2 * Math.min(lines.length, 40));
        tripped.push(lines.splice(pick, 1)[0].i);
      }
      const genTrip: number[] = [];
      if (rand() < 0.35) {
        const on = s.gens.map((g, i) => ({ g, i })).filter((y) => y.g.online).sort((a, b) => b.g.p - a.g.p);
        if (on.length) genTrip.push(on[Math.floor(rand() ** 2 * Math.min(on.length, 6))].i);
      }
      const extTrip = rand() < 0.12;
      // mark the contingency on the snapshot: tripped edges and the buses of tripped plants
      const closedIdx = s.branches.map((b, i) => (b.closed && !b.ext ? i : -1)).filter((i) => i >= 0);
      const edgeTrip = closedIdx.map((i) => (tripped.includes(i) ? 1 : 0));
      const busTrip = new Array(s.buses.length).fill(0);
      genTrip.forEach((g) => { busTrip[s.gens[g].def.bus] += s.gens[g].p / 100; });
      tripped.forEach((i, j) => s.tripBranch(i, 'contingency', j > 0));
      genTrip.forEach((g) => s.tripGen(g, 'contingency'));
      if (extTrip) s.tripExt('contingency');
      s.advance(90);
      const lost = 1 - s.served / d0;
      const busLost = s.buses.map((b, i) => (live0[i] > 0.5 ? Math.min(1, Math.max(0, 1 - (b.live ? b.served : 0) / live0[i])) : 0));
      fs.appendFileSync(file, JSON.stringify({
        region: id, freq: data.freq, x: before.x, edges: before.edges, ea: before.ea, edgeTrip, busTrip, extTrip: extTrip ? 1 : 0,
        lost: +lost.toFixed(4), busLost: busLost.map((v) => +v.toFixed(3)), events: s.events.length,
      }) + '\n');
      if (k % 25 === 0) console.log(`${id} ${k}/${N}  lost ${(lost * 100).toFixed(1)} %  ${((Date.now() - t0) / (k + 1) / 1000).toFixed(2)} s/sample`);
    }
  }
}, 48 * 3600 * 1000);
