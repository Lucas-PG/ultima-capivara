import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { KIT_PIECES } from '../src/shared/kit-collision';
import { createWorld } from '../src/shared/world';
import { walkableHeight } from '../src/shared/navigation';
import type { KitPlacement, Vec3 } from '../src/shared/types';
import { walkTraversal } from './helpers/traversal-probe';

const world = createWorld();
const actor = new Simulation(world, { mode: 'deathmatch', capacity: 2, bots: false, difficulty: 'normal', duration: 300 },
  [{ id: 'probe', name: 'Probe', color: '#fff', ready: true, connected: true }], 'building-traversal', 7).snapshot().actors[0];
const localPoint = (piece: KitPlacement, point: Vec3): Vec3 => {
  const scale = piece.scale ?? 1, c = Math.cos(piece.yaw), s = Math.sin(piece.yaw);
  return { x: piece.x + (point.x * c + point.z * s) * scale, y: piece.y + point.y * scale,
    z: piece.z + (point.z * c - point.x * s) * scale };
};

describe('every building floor is reachable by ordinary walking', () => {
  it('walks through the actual ground-floor aisle of every single-level house', () => {
    for (const piece of world.pieces!.filter(piece => piece.piece === 'house_small')) {
      const floor = KIT_PIECES[piece.piece].colliders.find(c => c.type === 'box' && c.height < .2 && c.width > 3 && c.depth > 3)!;
      if (floor.type !== 'box') throw new Error(`Missing room floor ${piece.id}`);
      const top = floor.y + floor.height / 2;
      const route = [-floor.depth / 2 - .7, 0, floor.depth / 2 + .7]
        .map(z => localPoint(piece, { x: 0, y: top, z }));
      // The entrance and exit stand on the lot, just outside the floor slab.
      for (const point of [route[0], route.at(-1)!]) point.y = walkableHeight(point.x, point.z, world);
      const result = walkTraversal(world, actor, route);
      expect(result.ok, JSON.stringify({ piece: piece.id, reason: result.reason, actual: result.actual, expected: result.expected })).toBe(true);
    }
  });

  for (const piece of world.pieces!.filter(piece =>
    ['church', 'market_hall', 'warehouse', 'beach_kiosk', 'bridge_stone'].includes(piece.piece))) {
    it(`enters, crosses and returns from the walking deck in ${piece.id} (${piece.piece})`, () => {
      const floor = KIT_PIECES[piece.piece].colliders[0];
      if (floor.type !== 'box') throw new Error(`Missing deck in ${piece.id}`);
      const top = floor.y + floor.height / 2;
      const results = [-1, 1].map(side => {
        const route = [side * (floor.depth / 2 + .7), side * (floor.depth / 2 - .7), 0, -side * (floor.depth / 2 - .7)]
          .map(z => localPoint(piece, { x: floor.x, y: top, z: floor.z + z }));
        route[0].y = walkableHeight(route[0].x, route[0].z, world);
        const across = walkTraversal(world, actor, route);
        if (!across.ok) return across;
        return walkTraversal(world, across.actor, [...route].reverse());
      });
      expect(results.some(result => result.ok), JSON.stringify(results.map(({ actual, expected, reason }) =>
        ({ piece: piece.id, actual, expected, reason })))).toBe(true);
    });
  }

});
