import { afterEach, expect, it, vi } from 'vitest';
// @ts-expect-error The optimizer installs unchanged inside a browser or the Node geometry fixture.
import { installGripSearch } from '../tools/qa/grip-search.mjs';

afterEach(() => vi.unstubAllGlobals());
it('solves coupled contact variables while preserving locked parameters and joint bounds', () => {
  const scope: Record<string, any> = {};
  vi.stubGlobal('window', scope); installGripSearch();
  const result = scope.__qaGripSimplex(([x, y, locked]: number[]) => (x + y - .7) ** 2 * 1000 + (x - y - .1) ** 2 + (locked - 3) ** 2,
    [0, 0, 3], { lo: [-.5, -.5, 0], hi: [.5, .5, 4], lock: [2], steps: [.1, .1, .2], maxEvals: 500, stopCost: 1e-10 });
  expect(result.parameters[0]).toBeCloseTo(.4, 4);
  expect(result.parameters[1]).toBeCloseTo(.3, 4);
  expect(result.parameters[2]).toBe(3);
  expect(result.evaluations).toBeLessThanOrEqual(500);
});
