import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/shared/world';
import { navigationWaypoint } from '../src/shared/navigation';

// Bots stood ~1 m from a hillside node in Morro for whole matches: from their
// exact spot the next node was not in straight view, so navigation kept
// handing back the node they were already on. Standing at a node must advance.
describe('navigation progress', () => {
  const world = createWorld();
  it('a walker standing at its start node is sent along the path, not back to the node', () => {
    const from = { x: -111.3, y: 22.5, z: -75.3 }, door = { x: -105, y: 22.57, z: -69 };
    const next = navigationWaypoint(world, from, door)!;
    expect(next).not.toBeNull();
    expect(Math.hypot(next.x - from.x, next.z - from.z)).toBeGreaterThan(2);
  });
});
