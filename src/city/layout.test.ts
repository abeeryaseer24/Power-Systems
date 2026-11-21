import { expect, it } from 'vitest';
import { generate } from './layout';
it('city fabric is a sensible size', () => {
  const t0 = performance.now();
  const { buildings, streets } = generate();
  const by: Record<string, number> = {};
  for (const b of buildings) by[b.district] = (by[b.district] ?? 0) + 1;
  if (process.env.FULL) console.log({ n: buildings.length, streets: streets.length, ms: performance.now() - t0, by, tallest: Math.max(...buildings.map((b) => b.h)) });
  expect(buildings.length).toBeGreaterThan(8000);
  expect(buildings.length).toBeLessThan(45000);
});
