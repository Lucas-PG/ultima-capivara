import { describe, expect, it } from 'vitest';
import { colliderGrid } from '../src/shared/collider-grid';
import type { Collider, WorldSpec } from '../src/shared/types';

const box = (id: string, minX: number, minZ: number, maxX: number, maxZ: number): Collider =>
  ({ id, min: { x: minX, y: 0, z: minZ }, max: { x: maxX, y: 3, z: maxZ }, material: 'stone' });
const worldWith = (colliders: Collider[]): WorldSpec =>
  ({ version: 'grid-test', size: 260, objects: [], districts: [], spawns: [], loot: [], chests: [], colliders });

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
});
