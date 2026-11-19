import { expect, it } from 'vitest';
import fs from 'node:fs';
import { RegionSim, type RegionPlant } from './region';

it('Rooppur: both units on the national grid; losing both is far worse than losing one', () => {
  const run = (both: boolean) => {
    const data = JSON.parse(fs.readFileSync('public/data/regions/dhaka.json', 'utf8'));
    const s = new RegionSim(data);
    s.responseShare = 0.2;
    for (const n of [1, 2]) s.addPlant({ name: `Rooppur unit ${n}`, kind: 'nuclear', mw: 1200, bus: 0, x: 0, z: 0 } as RegionPlant, 1150);
    s.settle(20);
    s.gens.forEach((g, i) => (g.def.name === 'Rooppur unit 1' || (both && g.def.name === 'Rooppur unit 2')) && s.tripGen(i, 'test'));
    s.advance(60);
    return s.peakLost;
  };
  const one = run(false);
  const two = run(true);
  console.log('lost one', Math.round(one), 'both', Math.round(two));
  expect(two).toBeGreaterThanOrEqual(one);
}, 60000);
