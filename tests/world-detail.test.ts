import { describe, expect, it } from 'vitest';
import { clearSpawn, hasLineOfSight } from '../src/shared/collision';
import { WORLD_PALETTE, terrainColor, terrainHeight } from '../src/shared/terrain';
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

  it('keeps parked vehicle wheels on the terrain and inside their chassis', () => {
    const vehicles = world.objects.filter(object => object.detail === 'car' || object.detail === 'truck');
    expect(vehicles.length).toBeGreaterThanOrEqual(18);
    for (const vehicle of vehicles) {
      const wheels = world.objects.filter(object => object.detail === 'wheel' &&
        Math.abs(object.pos.x - vehicle.pos.x) < 3.5 && Math.abs(object.pos.z - vehicle.pos.z) < 3.5);
      expect(wheels, `${vehicle.detail} at ${vehicle.pos.x}, ${vehicle.pos.z} needs four wheels`).toHaveLength(4);
      for (const wheel of wheels) {
        const bottom = wheel.pos.y - wheel.scale.y / 2;
        const top = wheel.pos.y + wheel.scale.y / 2;
        expect(Math.abs(bottom - terrainHeight(wheel.pos.x, wheel.pos.z)),
          `wheel at ${wheel.pos.x}, ${wheel.pos.z} must touch the terrain`).toBeLessThan(.02);
        expect(top, `wheel at ${wheel.pos.x}, ${wheel.pos.z} must overlap its chassis`)
          .toBeGreaterThan(vehicle.pos.y - vehicle.scale.y / 2);
      }
    }
  });

  it('makes every visible rock usable as hard cover', () => {
    for (const rock of world.objects.filter(object => object.kind === 'rock')) {
      expect(world.colliders.some(collider => collider.material === 'stone' &&
        collider.min.x <= rock.pos.x && collider.max.x >= rock.pos.x &&
        collider.min.z <= rock.pos.z && collider.max.z >= rock.pos.z &&
        collider.min.y < rock.pos.y && collider.max.y > rock.pos.y),
      `rock at ${rock.pos.x}, ${rock.pos.z} has no collision`).toBe(true);
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

describe('terrain colour regions', () => {
  it('keeps dry land bright while preserving road and shore readability', () => {
    const brightness = (hex: string) => {
      const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    for (const color of [WORLD_PALETTE.grass, WORLD_PALETTE.grassLight, WORLD_PALETTE.dryGrass]) {
      expect(brightness(color), `${color} should read as sunlit ground`).toBeGreaterThan(145);
    }
    expect(terrainColor(20, 0, 5, 0)).toBe(WORLD_PALETTE.road);
    expect([WORLD_PALETTE.sand, WORLD_PALETTE.sandLight]).toContain(terrainColor(49, -113, 1, 0));
    expect(terrainColor(-34, 6, -1, 0)).toBe(WORLD_PALETTE.mud);
    expect(terrainColor(49, -128, terrainHeight(49, -128), 0)).toBe(WORLD_PALETTE.sandWet);
    expect(terrainColor(30, -120, terrainHeight(30, -120), 0)).toBe(WORLD_PALETTE.sand);
    expect(terrainColor(62, -120, terrainHeight(62, -120), 0)).toBe(WORLD_PALETTE.sandLight);
    expect([WORLD_PALETTE.grass, WORLD_PALETTE.grassLight, WORLD_PALETTE.dryGrass])
      .toContain(terrainColor(22.6, -124.93, terrainHeight(22.6, -124.93), 0));
    expect(terrainColor(-110, -90, 4, .8)).toBe(WORLD_PALETTE.rock);
    expect(terrainColor(-50, 6, 4, .8)).toBe(WORLD_PALETTE.rock);
    expect(brightness(WORLD_PALETTE.road)).toBeLessThan(brightness(WORLD_PALETTE.grass) - 45);
  });

  it('keeps the playable island mostly green with small yellow-green dry patches', () => {
    let land = 0, grass = 0, dry = 0;
    for (let z = -120; z <= 120; z += 4) for (let x = -120; x <= 120; x += 4) {
      const y = terrainHeight(x, z);
      if (y < .5) continue;
      const slope = Math.hypot(terrainHeight(x + 2, z) - terrainHeight(x - 2, z),
        terrainHeight(x, z + 2) - terrainHeight(x, z - 2)) / 4;
      const color = terrainColor(x, z, y, slope);
      land++;
      if ([WORLD_PALETTE.grass, WORLD_PALETTE.grassLight, WORLD_PALETTE.dryGrass].some(value => value === color)) grass++;
      if (color === WORLD_PALETTE.dryGrass) dry++;
    }
    expect(grass / land).toBeGreaterThanOrEqual(.75);
    expect(dry / land).toBeLessThanOrEqual(.15);
  });
});
