import { expect, it } from 'vitest';
import { predict, predictTree, type Tree } from './gbm';

// root: x0 <= 5 ? (x1 <= 2 ? 1 : 2) : 3 ; missing x0 goes right (encoded as -2 - 0 = -2)
const t: Tree = [[-2, 1, -1, -1, -1], [5, 2, 0, 0, 0], [1, 2, -1, -1, -1], [4, 3, -1, -1, -1], [0, 0, 1, 2, 3]];

it('walks splits, sends missing values the default way, and sums trees', () => {
  expect(predictTree(t, [4, 1])).toBe(1);
  expect(predictTree(t, [4, 9])).toBe(2);
  expect(predictTree(t, [6, 0])).toBe(3);
  expect(predictTree(t, [null, 0])).toBe(3); // missing goes right at the root
  expect(predictTree(t, [1, null])).toBe(1); // missing goes left at node 1
  expect(predict([t, t], [6, 0])).toBe(6);
});
