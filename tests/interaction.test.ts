import { describe, expect, it } from 'vitest';
import { closestInteraction } from '../src/shared/interaction';
import { hasLineOfSight, raycastWorld } from '../src/shared/collision';
import { terrainHeight } from '../src/shared/terrain';
import { createWorld } from '../src/shared/world';
import type { ActorState, LootState, Vec3, WorldSpec } from '../src/shared/types';

const world = (): WorldSpec => ({ version: 'test', size: 256, objects: [], districts: [], spawns: [], loot: [], chests: [], colliders: [] });
const actor = () => ({ alive: true, stage: 'ground', crouch: false, pos: { x: 0, y: 100, z: 0 } }) as ActorState;
const loot = (id: string, x: number, z = 0): LootState => ({ id, x, y: 100, z, kind: 'armor', active: true, rarity: 0, respawnAt: 0 });

describe('interaction selection', () => {
  it('preserves stable nearest ties, skips inactive loot and opened chests', () => {
    const map = world(), me = actor(), result = { id: '', name: '' };
    map.chests.push({ id: 'chest', x: -1, y: 100, z: 0 });
    const snapshot = { loot: [loot('first', 1), loot('second', 0, 1)], openedChests: [] as string[] };
    expect(closestInteraction(map, snapshot, me, result)?.id).toBe('first');
    snapshot.loot[0].active = false;
    expect(closestInteraction(map, snapshot, me, result)?.id).toBe('second');
    snapshot.loot[1].active = false;
    expect(closestInteraction(map, snapshot, me, result)).toEqual({ id: 'chest', name: 'Abrir caixa de suprimentos' });
    snapshot.openedChests.push('chest');
    expect(closestInteraction(map, snapshot, me, result)).toBeNull();
  });

  it('requires a live grounded actor and includes exactly three metres in 3D', () => {
    const map = world(), me = actor(), result = { id: '', name: '' };
    const snapshot = { loot: [loot('edge', 3)], openedChests: [] };
    expect(closestInteraction(map, snapshot, me, result)?.id).toBe('edge');
    snapshot.loot[0].y += .01;
    expect(closestInteraction(map, snapshot, me, result)).toBeNull();
    snapshot.loot[0].y -= .01;
    me.alive = false;
    expect(closestInteraction(map, snapshot, me, result)).toBeNull();
    me.alive = true; me.stage = 'falling';
    expect(closestInteraction(map, snapshot, me, result)).toBeNull();
    expect(closestInteraction(map, snapshot, null, result)).toBeNull();
    expect(closestInteraction(map, null, actor(), result)).toBeNull();
  });

  it('selects a farther visible item instead of a nearer item behind a wall', () => {
    const map = world(), me = actor(), result = { id: '', name: '' };
    map.colliders.push({ id: 'wall', min: { x: .8, y: 99, z: -.3 }, max: { x: 1.2, y: 103, z: .3 }, material: 'stone' });
    const snapshot = { loot: [loot('hidden', 1.3), loot('visible', 0, 2)], openedChests: [] };
    expect(closestInteraction(map, snapshot, me, result)?.id).toBe('visible');
  });

  it('reuses caller storage and refreshes weapon rarity and consumable labels', () => {
    const map = world(), me = actor(), result = { id: '', name: '' }, item = loot('item', 1);
    item.kind = 'weapon'; item.weapon = 'pistol'; item.rarity = 2;
    const snapshot = { loot: [item], openedChests: [] };
    expect(closestInteraction(map, snapshot, me, result)).toBe(result);
    expect(result.name).toBe('Pistola épica');
    item.rarity = 99;
    expect(closestInteraction(map, snapshot, me, result)).toBe(result);
    expect(result.name).toBe('Pistola comum');
    item.weapon = undefined; item.kind = 'medkit';
    expect(closestInteraction(map, snapshot, me, result)?.name).toBe('Kit médico');
  });
});

describe('allocation-free line of sight', () => {
  it('preserves endpoint tolerance, parallel slabs and rays starting inside geometry', () => {
    const map = world(), a = { x: 0, y: 100, z: 0 };
    map.colliders.push({ id: 'wall', min: { x: 1, y: 99, z: -.1 }, max: { x: 2, y: 101, z: .1 }, material: 'stone' });
    expect(hasLineOfSight(a, { x: 1.04, y: 100, z: 0 }, map)).toBe(true);
    expect(hasLineOfSight(a, { x: 1.06, y: 100, z: 0 }, map)).toBe(false);
    expect(hasLineOfSight(a, { x: 0, y: 100, z: 5 }, map)).toBe(true);
    expect(hasLineOfSight({ x: 1.5, y: 100, z: 0 }, { x: 3, y: 100, z: 0 }, map)).toBe(false);
    expect(hasLineOfSight(a, a, map)).toBe(true);
    expect(hasLineOfSight(a, { ...a, x: .01 }, map)).toBe(true);
  });

  it('still blocks sight through terrain', () => {
    const a = { x: 0, y: terrainHeight(0, 0) - 1, z: 0 }, b = { x: 4, y: terrainHeight(4, 0) - 1, z: 0 };
    expect(hasLineOfSight(a, b, world())).toBe(false);
    a.y = b.y = 100;
    expect(hasLineOfSight(a, b, world())).toBe(true);
  });

  it('matches the existing full raycast across seeded world rays', () => {
    const map = createWorld();
    let seed = 37;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const point = (): Vec3 => { const x = random() * 240 - 120, z = random() * 240 - 120; return { x, y: terrainHeight(x, z) + random() * 5, z }; };
    for (let i = 0; i < 250; i++) {
      const a = point(), b = point(), distance = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      const direction = { x: (b.x - a.x) / distance, y: (b.y - a.y) / distance, z: (b.z - a.z) / distance };
      expect(hasLineOfSight(a, b, map)).toBe(!raycastWorld(a, direction, distance - .05, map));
    }
  });
});
