import { expect, it } from 'vitest';
import { boxOverlapsCollider } from './shape-overlap';
import type { Collider } from '../src/shared/types';
const n = Math.SQRT1_2;
const diamond: Collider = { id: 'diamond', min: { x: -2, y: 0, z: -2 }, max: { x: 2, y: 3, z: 2 }, material: 'stone',
  hull: [[n, 0, n, 2 * n], [-n, 0, n, 2 * n], [n, 0, -n, 2 * n], [-n, 0, -n, 2 * n], [0, 1, 0, 3], [0, -1, 0, 0]] };
it('rejects a broadphase corner while retaining actual stone intersections', () => {
  expect(boxOverlapsCollider({ x: 1.5, y: 1, z: 1.5 }, { x: 1.8, y: 2, z: 1.8 }, diamond)).toBe(false);
  expect(boxOverlapsCollider({ x: -.2, y: 1, z: -.2 }, { x: .2, y: 2, z: .2 }, diamond)).toBe(true);
  expect(boxOverlapsCollider({ x: 1.85, y: 1, z: -.1 }, { x: 2.1, y: 2, z: .1 }, diamond)).toBe(true);
});
it('keeps a hull wholly enclosed by the query box during clipping', () => {
  expect(boxOverlapsCollider({ x: -3, y: -1, z: -3 }, { x: 3, y: 4, z: 3 }, diamond)).toBe(true);
});
