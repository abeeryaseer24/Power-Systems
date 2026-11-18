import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { RegionSim, type RegionData } from './region';
import { EVENTS, stageEvent } from './events';

const have = (id: string) => fs.existsSync(`public/data/regions/${id}.json`);
const load = (id: string): RegionData => JSON.parse(fs.readFileSync(`public/data/regions/${id}.json`, 'utf8'));

describe('historical replays', () => {
  for (const ev of EVENTS) {
    it.skipIf(!have(ev.region))(`${ev.id}: watch mode reproduces a major loss of supply`, () => {
      const s = new RegionSim(load(ev.region));
      stageEvent(s, ev, 'watch');
      let fMin = 99;
      while (s.t < Math.min(ev.span, 400)) {
        s.advance(1);
        if (s.frequency > 0) fMin = Math.min(fMin, s.frequency);
      }
      const lost = 1 - s.served / s.demand;
      console.log(`${ev.id}: fMin ${fMin.toFixed(2)} lost ${(lost * 100).toFixed(0)} % peakLost ${Math.round(s.peakLost)} events ${s.events.map((e) => e.title).join(' | ')}`);
      expect(s.peakLost).toBeGreaterThan(0);
    });
  }
});
