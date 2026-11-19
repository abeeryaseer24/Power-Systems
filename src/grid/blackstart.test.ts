import { expect, it } from 'vitest';
import fs from 'node:fs';
import { RegionSim } from './region';

it('black start: a hydro unit forms an island, a line is closed and load picked up', () => {
  const s = new RegionSim(JSON.parse(fs.readFileSync('public/data/regions/dhaka.json', 'utf8')));
  s.goDark();
  s.advance(1);
  expect(s.served).toBe(0);
  const hydro = s.gens.findIndex((g, i) => s.canBlackStart(i) && g.def.kind === 'hydro');
  const gi = hydro >= 0 ? hydro : s.gens.findIndex((_, i) => s.canBlackStart(i));
  expect(s.startGen(gi)).toBe(true);
  s.advance(2);
  const bus = s.gens[gi].def.bus;
  expect(s.buses[bus].live).toBe(true);
  const br = s.branchesAt(bus)[0];
  s.closeBranch(br);
  s.advance(2);
  const other = s.branches[br].def.a === bus ? s.branches[br].def.b : s.branches[br].def.a;
  expect(s.buses[other].live).toBe(true);
  s.connectBus(bus, 0.1);
  s.connectBus(other, 0.1);
  s.advance(20);
  console.log('restored', Math.round(s.served), 'f', s.frequency.toFixed(2), s.gens[gi].def.name);
  expect(s.served).toBeGreaterThan(0);
  expect(s.frequency).toBeGreaterThan(48.5);
});
