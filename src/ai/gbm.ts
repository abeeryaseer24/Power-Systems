// Evaluate gradient-boosted trees exported by ml/export.py. Each tree is five flat
// arrays: feature (-1 = leaf; <= -2 means "missing values go right" for feature -2-f),
// threshold, left child, right child, leaf value. The prediction is the sum of leaves.

export type Tree = [number[], number[], number[], number[], number[]];

export function predictTree(t: Tree, x: (number | null)[]) {
  const [feat, thr, left, right, val] = t;
  let i = 0;
  for (;;) {
    let f = feat[i];
    if (f === -1) return val[i];
    let missingRight = false;
    if (f <= -2) { f = -2 - f; missingRight = true; }
    const v = x[f];
    if (v === null || Number.isNaN(v)) i = missingRight ? right[i] : left[i];
    else i = v <= thr[i] ? left[i] : right[i];
  }
}

export function predict(trees: Tree[], x: (number | null)[]) {
  let s = 0;
  for (const t of trees) s += predictTree(t, x);
  return s;
}
