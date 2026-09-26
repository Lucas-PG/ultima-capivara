import { describe, expect, it, vi } from 'vitest';
import { colliderGrid } from '../src/shared/collider-grid';
import { clearSpawn, hasLineOfSight, moveActor, raycastWorld } from '../src/shared/collision';
import { emptyInput } from '../src/shared/math';
import { terrainHeight } from '../src/shared/terrain';
import { Simulation } from '../src/simulation';
import type { Collider, WorldSpec } from '../src/shared/types';

const box = (id: string, minX: number, minZ: number, maxX: number, maxZ: number): Collider =>
  ({ id, min: { x: minX, y: 0, z: minZ }, max: { x: maxX, y: 3, z: maxZ }, material: 'stone' });
const worldWith = (colliders: Collider[]): WorldSpec =>
  ({ version: 'grid-test', size: 260, objects: [], districts: [],
    spawns: [{ x: 0, y: terrainHeight(0, -20), z: -20, yaw: 0, mode: 'both' }], loot: [], chests: [], colliders });
function fullScanWorld(colliders: Collider[]) {
  const world = worldWith(colliders);
  vi.spyOn(colliderGrid(world), 'queryIndices').mockImplementation((_x0, _z0, _x1, _z1, after = -1) =>
    world.colliders.map((_, index) => index).filter(index => index > after));
  return world;
}
const actor = () => new Simulation(worldWith([]), { mode: 'deathmatch', capacity: 2, bots: false, difficulty: 'normal', duration: 300 },
  [{ id: 'player', name: 'P', color: '#fff', ready: true, connected: true }], 'grid-movement', 1).snapshot().actors[0];

describe('shared collider broad phase', () => {
  it('returns each intersecting solid once in source order across cell boundaries', () => {
    const world = worldWith([box('east', 6, -2, 11, 2), box('wide', -12, -8, 18, 8),
      box('west', -9, -2, -5, 2), box('far', 60, 60, 62, 62)]);
    const grid = colliderGrid(world);
    expect(grid.query(-10, -4, 12, 4)).toEqual(world.colliders.slice(0, 3));
    expect(grid.query(-12, -8, -12, -8)).toEqual([world.colliders[1]]);
    expect(grid.queryIndices(-10, -4, 12, 4, 0)).toEqual([1, 2]);
    expect(colliderGrid(world)).toBe(grid);
  });

  it('rebuilds after added, removed or replaced world geometry', () => {
    const world = worldWith([box('first', -1, -1, 1, 1)]), grid = colliderGrid(world);
    expect(grid.query(0, 0, 0, 0).map(c => c.id)).toEqual(['first']);
    world.colliders.push(box('second', 0, 0, 2, 2));
    expect(grid.query(0, 0, 0, 0).map(c => c.id)).toEqual(['first', 'second']);
    world.colliders.pop();
    expect(grid.query(0, 0, 0, 0).map(c => c.id)).toEqual(['first']);
    world.colliders = [box('replacement', 20, 20, 22, 22)];
    expect(grid.query(0, 0, 0, 0)).toEqual([]);
    expect(grid.query(21, 21, 21, 21)).toEqual(world.colliders);
  });

  it('keeps separate worlds independent and excludes distant detail', () => {
    const solids = Array.from({ length: 1000 }, (_, i) => box(`remote-${i}`, 30 + i * 2, 30, 31 + i * 2, 31));
    const close = box('doorway', -1, -1, 1, 1), world = worldWith([...solids, close]);
    expect(colliderGrid(world).query(-.32, -.32, .32, .32)).toEqual([close]);
    expect(colliderGrid(worldWith([])).query(-.32, -.32, .32, .32)).toEqual([]);
  });

  it('preserves full-scan movement through steps, ceilings and pushes into another cell', () => {
    const scenes: Collider[][] = [
      [box('already-passed', 12.1, -25, 12.2, -15), box('large-solid', -20, -50, 12, 20), box('next-cell', 12.5, -25, 13, -15)],
      [box('left-wall', -2, -26, -.4, -14), box('right-wall', .4, -26, 2, -14),
        { ...box('step', -.4, -23, .4, -21), max: { x: .4, y: 2.5, z: -21 } },
        { ...box('ceiling', -2, -26, 2, -14), min: { x: -2, y: 3.7, z: -26 }, max: { x: 2, y: 5, z: -14 } }],
    ];
    for (const colliders of scenes) for (const x of [0, 8, 12.35]) {
      const world = worldWith(colliders), brute = fullScanWorld(colliders), actual = actor();
      actual.pos.x = x; actual.crouch = x === 0;
      const expected = structuredClone(actual);
      for (let seq = 1; seq <= 90; seq++) {
        const input = { ...emptyInput(), seq, moveX: Math.sin(seq * .09), moveZ: .7, jump: seq === 45, crouch: seq < 12 };
        moveActor(actual, input, world, 1 / 60, 1, 'deathmatch');
        moveActor(expected, input, brute, 1 / 60, 1, 'deathmatch');
        expect(actual).toEqual(expected);
      }
    }
  });

  it('preserves nearest-hit identity, visibility and spawn clearance against a full scan', () => {
    const colliders = [box('first-at-tie', 6, -22, 8, -18), box('second-at-tie', 6, -22, 8, -18),
      box('across-origin', -9, -23, -7, -17), box('remote', 100, 100, 105, 105)];
    const world = worldWith(colliders), brute = fullScanWorld(colliders);
    for (const x of [-12, 0, 6, 10]) for (const y of [2.3, 4, 8]) for (const angle of [0, .3, 1.2, Math.PI]) {
      const origin = { x, y, z: -20 }, direction = { x: Math.cos(angle), y: -.03, z: Math.sin(angle) };
      const end = { x: x + direction.x * 24, y: y + direction.y * 24, z: -20 + direction.z * 24 };
      expect(raycastWorld(origin, direction, 24, world)).toEqual(raycastWorld(origin, direction, 24, brute));
      expect(hasLineOfSight(origin, end, world)).toBe(hasLineOfSight(origin, end, brute));
      expect(clearSpawn(origin, world)).toBe(clearSpawn(origin, brute));
    }
  });
});
