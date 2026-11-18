import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { RegionSim, type RegionData } from './region';

const load = (id: string): RegionData => JSON.parse(fs.readFileSync(`public/data/regions/${id}.json`, 'utf8'));
const ids = fs.readdirSync('public/data/regions').filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => f.replace('.json', ''));

describe('real-region models', () => {
  for (const id of ids) {
    it(`${id}: opens in steady state with voltages in range`, () => {
      const s = new RegionSim(load(id));
      s.advance(20);
      expect(Math.abs(s.frequency - s.f0)).toBeLessThan(0.15);
      const live = s.buses.filter((b) => b.live && b.def.kv > 0);
      const vs = live.map((b) => b.V);
      expect(Math.min(...vs)).toBeGreaterThan(0.85);
      expect(Math.max(...vs)).toBeLessThan(1.12);
      expect(s.served / s.demand).toBeGreaterThan(0.97);
      expect(s.events.filter((e) => e.severity !== 'minor').length).toBe(0);
    });
  }
});
