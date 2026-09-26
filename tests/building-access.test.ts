import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { KIT_PIECES } from '../src/shared/kit-collision';
import { terrainHeight } from '../src/shared/terrain';
import { walkableHeight } from '../src/shared/navigation';
import { createWorld } from '../src/shared/world';
import { buildingRooms } from '../src/shared/building-interiors';
import { buildingPoint } from '../src/shared/building-access';
import { floorRoute } from './helpers/floor-route';
import { walkTraversal } from './helpers/traversal-probe';

const world = createWorld();
const actor = new Simulation(world, { mode: 'deathmatch', capacity: 2, bots: false, difficulty: 'normal', duration: 300 },
  [{ id: 'probe', name: 'Probe', color: '#fff', ready: true, connected: true }], 'placed-access', 1).snapshot().actors[0];

describe('published building routes reach loot from real ground', () => {
  it('walks every published entrance route both ways without teleporting or jumping', () => {
    expect(world.buildingRoutes!.length).toBeGreaterThan(100);
    for (const route of world.buildingRoutes!) {
      const entrance = route.points[0];
      expect(Math.abs(entrance.y - terrainHeight(entrance.x, entrance.z)), route.id).toBeLessThanOrEqual(.45);
      for (const points of [route.points, [...route.points].reverse()]) {
        const result = walkTraversal(world, actor, points);
        expect(result.ok, JSON.stringify({ id: route.id, reason: result.reason, actual: result.actual, expected: result.expected })).toBe(true);
      }
    }
    for (const piece of world.pieces!) for (const floor of KIT_PIECES[piece.piece].traversal?.floors ?? [])
      expect(world.buildingRoutes!.some(route => route.pieceId === piece.id && route.floorId === floor.id), `${piece.id}/${floor.id} has no ground access`).toBe(true);
  });

  it('puts a useful pickup upstairs in every tall house and walks to it around the furniture', () => {
    const upstairs = world.loot.filter(loot => loot.y > walkableHeight(loot.x, loot.z, world) + .45);
    expect(upstairs.length).toBe(world.pieces!.filter(piece => piece.piece === 'house_tall').length);
    for (const loot of upstairs) {
      const route = floorRoute(world, loot);
      expect(route, loot.id).toBeDefined();
      expect(route!.floorId).toBe('upper-room');
      const points = [...route!.points, { x: loot.x, y: loot.y, z: loot.z }];
      const up = walkTraversal(world, actor, points);
      expect(up.ok, JSON.stringify({ id: loot.id, reason: up.reason, actual: up.actual, expected: up.expected })).toBe(true);
      const back = walkTraversal(world, up.actor, [...points].reverse());
      expect(back.ok, loot.id).toBe(true);
    }
  });

  it('lets players cross furnished house and hall rooms and return through their entrances', () => {
    for (const piece of world.pieces!) for (const floor of buildingRooms(piece)) {
      // The lighthouse follows its separately tested curved route around a
      // central structural column, rather than a straight room aisle.
      if (piece.piece === 'lighthouse') continue;
      const route = world.buildingRoutes!.find(route => route.pieceId === piece.id && route.floorId === floor.id)!;
      const point = buildingPoint(piece, [floor.id === 'upper-room' ? 1 : 0, floor.y, floor.bounds[3] - .6]);
      const points = [...route.points, point];
      for (const path of [points, [...points].reverse()]) {
        const result = walkTraversal(world, actor, path);
        expect(result.ok, JSON.stringify({ room: `${piece.id}/${floor.id}`, reason: result.reason, actual: result.actual, expected: result.expected })).toBe(true);
      }
    }
  });

  it('keeps every pier deck above the sand and every pile rooted in the seabed', () => {
    for (const piece of world.pieces!.filter(piece => piece.piece === 'dock_wood')) {
      const definition = KIT_PIECES.dock_wood, floor = definition.traversal!.floors[0];
      for (let x = floor.bounds[0] + .1; x < floor.bounds[2]; x += .5) for (let z = floor.bounds[1] + .1; z < floor.bounds[3]; z += .5) {
        const wx = piece.x + x * Math.cos(piece.yaw) + z * Math.sin(piece.yaw);
        const wz = piece.z + z * Math.cos(piece.yaw) - x * Math.sin(piece.yaw);
        expect(terrainHeight(wx, wz), `${piece.id} is buried at ${wx},${wz}`).toBeLessThanOrEqual(piece.y + floor.y + .015);
      }
      for (const pile of definition.colliders.filter(shape => shape.type === 'cylinder')) {
        const x = piece.x + pile.x * Math.cos(piece.yaw) + pile.z * Math.sin(piece.yaw);
        const z = piece.z + pile.z * Math.cos(piece.yaw) - pile.x * Math.sin(piece.yaw);
        expect(piece.y + pile.y - pile.height / 2, `${piece.id} has a floating pile`).toBeLessThanOrEqual(terrainHeight(x, z));
      }
    }
  });
});
