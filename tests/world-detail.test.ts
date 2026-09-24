import { describe, expect, it } from 'vitest';
import { clearSpawn, hasLineOfSight } from '../src/shared/collision';
import { terrainHeight } from '../src/shared/terrain';
import { createWorld } from '../src/shared/world';
import { inArena } from '../src/shared/layout';

describe('crafted village and port', () => {
  const world = createWorld();
  const houses = world.objects.filter(object => object.detail?.startsWith('prop:house:'));
  const arenaHouses = houses.filter(({ pos }) => inArena(pos.x, pos.z));

  it('gives the played arena distinct furnished destinations and markets', () => {
    const roles = new Set(arenaHouses.map(object => object.detail!.split(':')[2]));
    expect(arenaHouses.length).toBeGreaterThanOrEqual(15);
    expect(roles).toEqual(new Set(['home', 'bakery', 'cafe', 'workshop', 'tailor', 'clinic', 'fisher', 'fishmonger', 'kiosk']));
    expect(world.objects.filter(object => object.detail?.startsWith('prop:stall:')).length).toBeGreaterThanOrEqual(3);
    expect(world.objects.filter(object => object.detail === 'prop:cart').length).toBeGreaterThanOrEqual(2);
  });

  it('keeps both doorways and the center aisle traversable in every arena house', () => {
    // The front and rear doors are combat routes. Large fixtures must leave a
    // player-width aisle between each threshold and the center of the room.
    for (const house of arenaHouses) {
      const { x, z } = house.pos, w = house.scale.x, d = house.scale.z;
      for (const [fromX, fromZ] of [[x - w * .18, z + d / 2 + 1.05], [x + w * .2, z - d / 2 - 1.05]]) {
        for (let step = 0; step <= 20; step++) {
          const px = fromX + (x - fromX) * step / 20;
          const pz = fromZ + (z - fromZ) * step / 20;
          expect(clearSpawn({ x: px, y: terrainHeight(px, pz), z: pz }, world),
            `${house.detail} at ${x}, ${z} blocks its door route at ${px}, ${pz}`).toBe(true);
        }
      }
    }
  });

  it('gives large furniture and street props matching gameplay cover', () => {
    for (const house of arenaHouses) {
      const { x, z } = house.pos, w = house.scale.x, d = house.scale.z;
      for (const [fx, fz] of [[x + w * .28, z + d * .11], [x - w * .33, z - d * .17]]) {
        const ground = terrainHeight(fx, fz);
        expect(world.colliders.some(collider => fx >= collider.min.x && fx <= collider.max.x &&
          fz >= collider.min.z && fz <= collider.max.z && collider.max.y > ground + .6 &&
          collider.min.y < ground + .2), `${house.detail} has visual furniture without cover`).toBe(true);
      }
    }
    for (const prop of world.objects.filter(object => object.detail === 'prop:plaza' ||
      object.detail === 'prop:planter' || object.detail === 'prop:bench' ||
      object.detail === 'prop:cart' || object.detail?.startsWith('prop:stall:'))) {
      expect(world.colliders.some(collider => prop.pos.x >= collider.min.x && prop.pos.x <= collider.max.x &&
        prop.pos.z >= collider.min.z && prop.pos.z <= collider.max.z &&
        collider.max.y >= prop.pos.y + .75), `${prop.detail} has no collider`).toBe(true);
    }
  });

  it('uses buildings and cover to break long opening sightlines', () => {
    const spawns = world.spawns.filter(spawn => spawn.mode === 'deathmatch');
    expect(spawns.length).toBeGreaterThanOrEqual(16);
    for (const spawn of spawns) {
      const hiddenFrom = spawns.filter(other => other !== spawn && !hasLineOfSight(
        { x: spawn.x, y: spawn.y + 1.62, z: spawn.z },
        { x: other.x, y: other.y + 1.62, z: other.z }, world));
      expect(hiddenFrom.length).toBeGreaterThanOrEqual(4);
    }
  });
});
