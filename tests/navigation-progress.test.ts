import { describe, expect, it } from 'vitest';
import { navigationWaypoint, walkableSegment } from '../src/shared/navigation';
import { terrainHeight } from '../src/shared/terrain';
import type { WorldSpec } from '../src/shared/types';

// The original Morro sample now lies inside a visible stone shell. Reproduce
// the same progress condition with an explicit clear approach to a linked node:
// the exact walker position cannot see the next link through the narrow gate.
describe('navigation progress', () => {
  it('a walker standing at its start node is sent along the path, not back to the node', () => {
    const point = (x: number, z: number) => ({ x, y: terrainHeight(x, z), z });
    const from = point(0, -.8), start = point(0, 0), nextLink = point(3, 0), destination = point(3, 3);
    const world: WorldSpec = { version: 'node-progress', size: 260, objects: [], districts: [], loot: [], chests: [], spawns: [],
      colliders: [[-2, -.36], [.36, 2.5]].map(([z0, z1], index) => ({ id: `gate-${index}`, material: 'stone',
        min: { x: 1, y: start.y - 1, z: z0 }, max: { x: 1.2, y: start.y + 3, z: z1 } })),
      navigation: { points: [start, nextLink, destination], links: [[1], [0, 2], [1]] } };
    expect(walkableSegment(world, from, from)).toBe(true);
    expect(walkableSegment(world, from, start)).toBe(true);
    expect(walkableSegment(world, start, nextLink)).toBe(true);
    expect(walkableSegment(world, from, nextLink)).toBe(false);
    expect(walkableSegment(world, from, destination)).toBe(false);
    const next = navigationWaypoint(world, from, destination);
    expect(next).not.toBeNull();
    expect(Math.hypot(next!.x - from.x, next!.z - from.z)).toBeGreaterThan(2);
    expect(next).toEqual(nextLink);
  });
});
