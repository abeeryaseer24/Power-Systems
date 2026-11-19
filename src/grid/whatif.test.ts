import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { RegionSim } from './region';
import { WHAT_IFS } from './whatif';

describe('what-if scenarios', () => {
  for (const w of WHAT_IFS) {
    it(`${w.id} runs on ${w.regions?.[0] ?? 'dhaka'}`, () => {
      const s = new RegionSim(JSON.parse(fs.readFileSync(`public/data/regions/${w.regions?.[0] ?? 'dhaka'}.json`, 'utf8')));
      w.apply(s);
      s.advance(90);
      console.log(`${w.id}: served ${((100 * s.served) / s.demand).toFixed(0)} % peakLost ${Math.round(s.peakLost)}`);
      expect(Number.isFinite(s.served)).toBe(true);
    }, 30000);
  }
});
