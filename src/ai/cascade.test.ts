// The browser GNN must give the same answers as the trained PyTorch model on the samples the
// export recorded. Needs the local training data (ml/data, not in git), so it skips without it.
import { expect, it } from 'vitest';
import fs from 'node:fs';
import { loadGnn, predictCascade, type GnnSpec } from './cascade';

const SPEC = 'public/data/cascade/gnn.json';

it.skipIf(!fs.existsSync(SPEC) || !fs.existsSync('ml/data/cascade/dhaka-4.jsonl'))('browser GNN matches PyTorch', () => {
  const spec: GnnSpec & { check: { file: string; samples: { lost: number; bus: number[] }[] } } = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
  const net = loadGnn(spec);
  const lines = fs.readFileSync(`ml/data/cascade/${spec.check.file}`, 'utf8').split('\n').slice(0, spec.check.samples.length);
  lines.forEach((line, i) => {
    const r = JSON.parse(line);
    const p = predictCascade(net, { x: r.x, edges: r.edges, ea: r.ea }, r.edgeTrip, r.busTrip, r.extTrip, r.freq);
    const want = spec.check.samples[i];
    expect(Math.abs(p.lost - want.lost)).toBeLessThan(0.01);
    const err = want.bus.reduce((a, v, k) => Math.max(a, Math.abs(v - p.busLoss[k])), 0);
    expect(err).toBeLessThan(0.02);
  });
});
