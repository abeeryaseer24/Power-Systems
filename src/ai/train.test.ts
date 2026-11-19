// Trains the blackout predictor. Run with:  TRAIN=1 npx vitest run src/ai/train.test.ts
// Generates random disturbances on the ten OSM regions, samples features every
// 2 s, labels each sample "collapse within the horizon", trains a small MLP with
// Adam, evaluates on held-out runs and writes public/data/predictor.json.
import { expect, it } from 'vitest';
import fs from 'node:fs';
import { RegionSim, type RegionData } from '../grid/region';
import { mulberry32 } from '../grid/profiles';
import { features, FEATURE_NAMES, predict, type PredictorModel } from './features';

const HORIZON = 60;
const RUNS = Number(process.env.RUNS ?? 360);

function disturb(s: RegionSim, rand: () => number): number {
  const kinds = ['plants', 'lines', 'ext', 'load', 'deficit'];
  const nEvents = 1 + Math.floor(rand() * 3);
  s.uflsWorks = 0.2 + rand() * 0.8;
  s.responseShare = 0.08 + rand() * 0.35;
  let first = Infinity;
  for (let e = 0; e < nEvents; e++) {
    const k = kinds[Math.floor(rand() * kinds.length)];
    const at = 10 + rand() * 40;
    first = Math.min(first, at);
    const size = rand();
    s.at(at, (x) => {
      if (k === 'plants') {
        const on = x.gens.map((g, i) => ({ g, i })).filter((y) => y.g.online).sort((a, b) => b.g.p - a.g.p);
        const n = 1 + Math.floor(size * 4);
        on.slice(0, n).forEach((y) => x.tripGen(y.i, 'random trip'));
      } else if (k === 'lines') {
        const br = x.branches.map((b, i) => ({ b, i })).filter((y) => y.b.closed && !y.b.ext).sort((a, b) => Math.abs(b.b.P) - Math.abs(a.b.P));
        br.slice(0, 1 + Math.floor(size * 6)).forEach((y, j) => x.tripBranch(y.i, 'random trip', j > 0));
      } else if (k === 'ext') {
        if (size > 0.5) x.tripExt('random separation');
        else x.ext.deficit += x.ext.MW * size * 0.2;
      } else if (k === 'load') {
        x.loadScale *= 1 + size * 0.35;
      } else {
        x.ext.deficit += x.ext.MW * size * 0.3;
      }
    });
  }
  return first;
}

function auc(scores: number[], labels: number[]) {
  const idx = scores.map((s, i) => [s, labels[i]]).sort((a, b) => a[0] - b[0]);
  let rank = 0;
  let sumPos = 0;
  let nPos = 0;
  idx.forEach(([, l], i) => {
    rank = i + 1;
    if (l) {
      sumPos += rank;
      nPos++;
    }
  });
  const nNeg = idx.length - nPos;
  return nPos && nNeg ? (sumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg) : 0.5;
}

it.skipIf(!process.env.TRAIN)('train the blackout predictor', () => {
  const ids = JSON.parse(fs.readFileSync('public/data/regions/index.json', 'utf8')).map((r: { id: string }) => r.id);
  const datas: Record<string, RegionData> = {};
  for (const id of ids) datas[id] = JSON.parse(fs.readFileSync(`public/data/regions/${id}.json`, 'utf8'));
  const rand = mulberry32(2024);
  const X: number[][] = [];
  const Y: number[] = [];
  const runOf: number[] = [];
  for (let run = 0; run < RUNS; run++) {
    const id = ids[run % ids.length];
    const s = new RegionSim(structuredClone(datas[id]));
    const firstAt = disturb(s, rand);
    const feats: number[][] = [];
    const served: number[] = [];
    for (let t = 0; t < 130; t += 2) {
      s.advance(2);
      feats.push(features(s));
      served.push(s.served / Math.max(1, s.demand));
    }
    const step = HORIZON / 2;
    for (let i = 0; i < feats.length; i++) {
      if (served[i] < 0.5) break; // already collapsed: nothing left to predict
      let y = 0;
      // before the first disturbance the grid gives no sign of what is coming: label as safe
      const tNow = (i + 1) * 2;
      if (tNow >= firstAt) for (let j = i + 1; j <= Math.min(served.length - 1, i + step); j++) if (served[j] < 0.5) y = 1;
      X.push(feats[i]);
      Y.push(y);
      runOf.push(run);
    }
    if (run % 40 === 0) console.log(`run ${run}/${RUNS}: ${X.length} samples, ${Y.filter(Boolean).length} positive`);
  }

  // normalise
  const d = FEATURE_NAMES.length;
  const mean = new Array(d).fill(0);
  const std = new Array(d).fill(0);
  X.forEach((x) => x.forEach((v, i) => (mean[i] += v / X.length)));
  X.forEach((x) => x.forEach((v, i) => (std[i] += (v - mean[i]) ** 2 / X.length)));
  for (let i = 0; i < d; i++) std[i] = Math.sqrt(std[i]) || 1;
  const Z = X.map((x) => x.map((v, i) => (v - mean[i]) / std[i]));

  // split by run so the test set holds unseen disturbances
  // hold out whole runs, spread over every region
  const test = (r: number) => Math.floor(r / 10) % 5 === 0;
  const trainIdx = Z.map((_, i) => i).filter((i) => !test(runOf[i]));
  const testIdx = Z.map((_, i) => i).filter((i) => test(runOf[i]));

  // MLP 12 -> 16 -> 8 -> 1
  const sizes = [d, 16, 8, 1];
  const wr = mulberry32(7);
  const layers = sizes.slice(1).map((n, l) => ({
    w: Array.from({ length: n }, () => Array.from({ length: sizes[l] }, () => (wr() * 2 - 1) * Math.sqrt(2 / sizes[l]))),
    b: new Array(n).fill(0),
  }));
  const m = layers.map((L) => ({ w: L.w.map((r) => r.map(() => 0)), b: L.b.map(() => 0) }));
  const v = layers.map((L) => ({ w: L.w.map((r) => r.map(() => 0)), b: L.b.map(() => 0) }));
  const pos = trainIdx.filter((i) => Y[i]).length;
  const wPos = Math.min(8, (trainIdx.length - pos) / Math.max(1, pos)); // class balance
  const lr = 0.01;
  let tstep = 0;
  for (let epoch = 0; epoch < 80; epoch++) {
    const order = [...trainIdx].sort(() => wr() - 0.5);
    for (let bStart = 0; bStart < order.length; bStart += 64) {
      const batch = order.slice(bStart, bStart + 64);
      const gw = layers.map((L) => L.w.map((r) => r.map(() => 0)));
      const gb = layers.map((L) => L.b.map(() => 0));
      for (const i of batch) {
        // forward
        const acts: number[][] = [Z[i]];
        let a = Z[i];
        layers.forEach((L, li) => {
          const z = L.b.map((bb, j) => bb + L.w[j].reduce((s2, w, k) => s2 + w * a[k], 0));
          a = li < layers.length - 1 ? z.map((q) => Math.max(0, q)) : z.map((q) => 1 / (1 + Math.exp(-q)));
          acts.push(a);
        });
        // backward (binary cross-entropy with class weight)
        const w8 = Y[i] ? wPos : 1;
        let delta = [(a[0] - Y[i]) * w8];
        for (let li = layers.length - 1; li >= 0; li--) {
          const inp = acts[li];
          const L = layers[li];
          for (let j = 0; j < L.w.length; j++) {
            gb[li][j] += delta[j];
            for (let k = 0; k < inp.length; k++) gw[li][j][k] += delta[j] * inp[k];
          }
          if (li > 0) {
            const prev = new Array(inp.length).fill(0);
            for (let k = 0; k < inp.length; k++) {
              let sum = 0;
              for (let j = 0; j < L.w.length; j++) sum += L.w[j][k] * delta[j];
              prev[k] = inp[k] > 0 ? sum : 0;
            }
            delta = prev;
          }
        }
      }
      tstep++;
      const b1 = 0.9;
      const b2 = 0.999;
      layers.forEach((L, li) => {
        for (let j = 0; j < L.w.length; j++) {
          for (let k = 0; k < L.w[j].length; k++) {
            const g = gw[li][j][k] / batch.length + 1e-4 * L.w[j][k];
            m[li].w[j][k] = b1 * m[li].w[j][k] + (1 - b1) * g;
            v[li].w[j][k] = b2 * v[li].w[j][k] + (1 - b2) * g * g;
            L.w[j][k] -= (lr * (m[li].w[j][k] / (1 - b1 ** tstep))) / (Math.sqrt(v[li].w[j][k] / (1 - b2 ** tstep)) + 1e-8);
          }
          const g = gb[li][j] / batch.length;
          m[li].b[j] = b1 * m[li].b[j] + (1 - b1) * g;
          v[li].b[j] = b2 * v[li].b[j] + (1 - b2) * g * g;
          L.b[j] -= (lr * (m[li].b[j] / (1 - b1 ** tstep))) / (Math.sqrt(v[li].b[j] / (1 - b2 ** tstep)) + 1e-8);
        }
      });
    }
  }

  const model: PredictorModel = {
    names: [...FEATURE_NAMES], mean, std, layers, horizon: HORIZON,
    metrics: { auc: 0, accuracy: 0, precision: 0, recall: 0, samples: X.length, runs: RUNS, positives: Y.filter(Boolean).length },
    trained: new Date().toISOString().slice(0, 10),
  };
  const scores = testIdx.map((i) => predict(model, X[i]));
  const labels = testIdx.map((i) => Y[i]);
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let correct = 0;
  scores.forEach((p, k) => {
    const yhat = p > 0.5 ? 1 : 0;
    if (yhat === labels[k]) correct++;
    if (yhat && labels[k]) tp++;
    if (yhat && !labels[k]) fp++;
    if (!yhat && labels[k]) fn++;
  });
  model.metrics.auc = +auc(scores, labels).toFixed(3);
  model.metrics.accuracy = +(correct / Math.max(1, scores.length)).toFixed(3);
  model.metrics.precision = +(tp / Math.max(1, tp + fp)).toFixed(3);
  model.metrics.recall = +(tp / Math.max(1, tp + fn)).toFixed(3);
  console.log('metrics', model.metrics);
  const round = (x: number) => Math.round(x * 1e5) / 1e5;
  model.layers = model.layers.map((L) => ({ w: L.w.map((r) => r.map(round)), b: L.b.map(round) }));
  model.mean = model.mean.map(round);
  model.std = model.std.map(round);
  fs.writeFileSync('public/data/predictor.json', JSON.stringify(model));
  expect(model.metrics.auc).toBeGreaterThan(0.7);
}, 3_600_000);
