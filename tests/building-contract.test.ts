import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { KIT_PIECES } from '../src/shared/kit-collision';
import { FORTE } from '../src/shared/layout';
import { walkableHeight } from '../src/shared/navigation';
import { createWorld } from '../src/shared/world';
import { buildingPoint, routesToFloor } from './helpers/building-paths';
import { placedBuildingRoutes } from './helpers/placed-building-routes';
import { walkTraversal } from './helpers/traversal-probe';

// Further building repairs add their source-generated contracts to this same
// gate. Sealed landmarks are not declared accessible by inventing routes.
const TYPES = Object.keys(KIT_PIECES).filter(type => KIT_PIECES[type].traversal);
const world = createWorld();
const actor = new Simulation(world, { mode: 'deathmatch', capacity: 2, bots: false, difficulty: 'normal', duration: 300 },
  [{ id: 'probe', name: 'Probe', color: '#fff', ready: true, connected: true }], 'all-building-floors', 7).snapshot().actors[0];
const placedRoutes = placedBuildingRoutes(world, actor);

describe('authored building access contract', () => {
  it('connects every declared floor to a real entrance and a flush stair landing', () => {
    expect(TYPES).toContain('house_tall');
    for (const type of TYPES) {
      const definition = KIT_PIECES[type];
      expect(definition.traversal, `${type} has no generated access contract`).toBeDefined();
      const traversal = definition.traversal!;
      expect(traversal.entrances.length, type).toBeGreaterThan(0);
      expect(traversal.floors.length, type).toBeGreaterThanOrEqual(['house_tall', 'lighthouse'].includes(type) ? 2 : 1);
      const ids = [...traversal.entrances, ...traversal.floors].map(point => point.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const floor of traversal.floors) {
        expect(floor.bounds[2]).toBeGreaterThan(floor.bounds[0]);
        expect(floor.bounds[3]).toBeGreaterThan(floor.bounds[1]);
        expect(Number.isFinite(floor.y)).toBe(true);
        expect(routesToFloor(traversal, floor.id).length, `${type}/${floor.id} is disconnected`).toBeGreaterThan(0);
      }
      for (const route of traversal.routes) {
        expect(ids).toContain(route.from); expect(ids).toContain(route.to);
        expect(route.points.length, `${type}/${route.id}`).toBeGreaterThanOrEqual(2);
        expect(route.points.every(point => point.every(Number.isFinite))).toBe(true);
      }
      for (const stairs of traversal.stairs) {
        expect(stairs.colliderIndices.length, `${type}/${stairs.id} needs visible treads`).toBeGreaterThan(0);
        const treads = stairs.colliderIndices.map(index => definition.colliders[index]);
        expect(treads.every(Boolean), `${type}/${stairs.id} refers to missing geometry`).toBe(true);
        const target = traversal.floors.find(floor => floor.id === stairs.to)!;
        expect(target, `${type}/${stairs.id} needs a landing`).toBeDefined();
        const top = treads.reduce((a, b) => a.y + a.height / 2 > b.y + b.height / 2 ? a : b);
        expect(Math.abs(top.y + top.height / 2 - target.y), `${type}/${stairs.id} final riser`).toBeLessThanOrEqual(.45);
        const hx = top.type === 'box' ? (Math.abs(Math.cos(top.yaw ?? 0)) * top.width + Math.abs(Math.sin(top.yaw ?? 0)) * top.depth) / 2 : top.radius;
        const hz = top.type === 'box' ? (Math.abs(Math.sin(top.yaw ?? 0)) * top.width + Math.abs(Math.cos(top.yaw ?? 0)) * top.depth) / 2 : top.radius;
        const gapX = Math.max(target.bounds[0] - top.x - hx, top.x - hx - target.bounds[2], 0);
        const gapZ = Math.max(target.bounds[1] - top.z - hz, top.z - hz - target.bounds[3], 0);
        expect(Math.hypot(gapX, gapZ), `${type}/${stairs.id} unsupported gap at its landing`).toBeLessThanOrEqual(.035);
      }
    }
  });

  for (const piece of world.pieces!.filter(piece => TYPES.includes(piece.piece))) {
    it(`walks every floor up and down in placed ${piece.id} (${piece.piece})`, () => {
      const traversal = KIT_PIECES[piece.piece].traversal;
      expect(traversal, `${piece.piece} traversal metadata must ship with its mesh`).toBeDefined();
      if (!traversal) return;
      for (const floor of traversal.floors) {
        const route = placedRoutes.get(`${piece.id}/${floor.id}`);
        expect(route, `${piece.id}/${floor.id} has no walking route from a ground entrance`).toBeDefined();
        if (!route) continue;
        const up = walkTraversal(world, actor, route);
        expect(up.ok, JSON.stringify({ floor: floor.id, direction: 'up', reason: up.reason, actual: up.actual, expected: up.expected })).toBe(true);
        const down = walkTraversal(world, up.actor, [...route].reverse());
        expect(down.ok, JSON.stringify({ floor: floor.id, direction: 'down', reason: down.reason, actual: down.actual, expected: down.expected })).toBe(true);
      }
    });
  }

  it('climbs from the courtyard, walks the whole fort circuit in either direction, and returns to ground', () => {
    const stairs = world.pieces!.filter(piece => piece.piece === 'fort_stairs');
    expect(stairs).toHaveLength(2);
    const west = stairs.find(piece => piece.x < FORTE[0])!;
    const entry = routesToFloor(KIT_PIECES.fort_stairs.traversal!, 'left')[0].map(point => buildingPoint(west, point));
    entry[0].y = walkableHeight(entry[0].x, entry[0].z, world);
    const port = entry.at(-1)!;
    const wallPort = world.pieces!.filter(piece => piece.piece === 'fort_wall').flatMap(piece =>
      KIT_PIECES.fort_wall.traversal!.entrances.map(entrance => buildingPoint(piece, entrance.point)))
      .sort((a, b) => Math.hypot(a.x - port.x, a.z - port.z) - Math.hypot(b.x - port.x, b.z - port.z))[0];
    const corners = world.pieces!.filter(piece => piece.piece === 'fort_corner_walk')
      .sort((a, b) => (a.z < FORTE[1] ? a.x < FORTE[0] ? 0 : 1 : a.x > FORTE[0] ? 2 : 3) -
        (b.z < FORTE[1] ? b.x < FORTE[0] ? 0 : 1 : b.x > FORTE[0] ? 2 : 3));
    expect(corners).toHaveLength(4);
    const gallery = corners.flatMap(piece => routesToFloor(KIT_PIECES.fort_corner_walk.traversal!, 'front-wall')[0]
      .map(point => buildingPoint(piece, point)));
    const circuit = [...entry, wallPort, ...gallery, wallPort, ...[...entry].reverse()];
    for (const points of [circuit, [...circuit].reverse()]) {
      const result = walkTraversal(world, actor, points);
      expect(result.ok, JSON.stringify({ reason: result.reason, actual: result.actual, expected: result.expected })).toBe(true);
    }
  });
});
