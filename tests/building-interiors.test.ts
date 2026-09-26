import { describe, expect, it } from 'vitest';
import { buildingRole, buildingRooms, roomVariant } from '../src/shared/building-interiors';
import { clearSpawn } from '../src/shared/collision';
import { KIT_PIECES, kitColliders } from '../src/shared/kit-collision';
import { createWorld } from '../src/shared/world';
import type { KitPlacement } from '../src/shared/types';

const world = createWorld(), pieces = world.pieces!;
const soft = new Set(['rug', 'wall_picture', 'potted_plant']);
const local = (building: KitPlacement, item: KitPlacement) => {
  const dx = item.x - building.x, dz = item.z - building.z, scale = building.scale ?? 1;
  return { x: (dx * Math.cos(building.yaw) - dz * Math.sin(building.yaw)) / scale,
    y: (item.y - building.y) / scale, z: (dx * Math.sin(building.yaw) + dz * Math.cos(building.yaw)) / scale };
};

describe('lived-in rooms preserve ordinary access', () => {
  it('varies coordinated room paint by stable lot and gives homes warm finished floors', () => {
    const houses = pieces.filter(piece => /^house_(small|tall)$/.test(piece.piece));
    expect(new Set(houses.map(roomVariant)).size).toBe(3);
    for (const house of houses) {
      const variant = roomVariant(house);
      expect(roomVariant({ ...house, id: 'unrelated-world-order' } as KitPlacement)).toBe(variant);
      const accents = pieces.filter(piece => piece.id.startsWith(`${house.id}:interior:`) &&
        ['rug', 'wall_picture'].includes(piece.piece));
      expect(accents.length).toBeGreaterThanOrEqual(2);
      for (const accent of accents) expect(accent.paintVariant, accent.id).toBe(variant);
      expect(house.interiorFloor, house.id).toBe(['clinic', 'workshop', 'fishmonger'].includes(buildingRole(house)) ? 'warm-tile' : 'wood');
    }
  });

  it('gives every room useful furniture supported by its actual floor, without burying pieces in walls or stairs', () => {
    let count = 0;
    for (const building of pieces) for (const room of buildingRooms(building)) {
      const items = pieces.filter(item => item !== building && item.id.startsWith(`${building.id}:interior:${room.id}:`));
      expect(items.length, `${building.id}/${room.id} needs a furnished corner and small accents`).toBeGreaterThanOrEqual(4);
      for (const item of items) {
        const position = local(building, item), definition = KIT_PIECES[item.piece];
        if (item.piece !== 'wall_picture') expect(position.y, `${item.id} floats above its floor`).toBeCloseTo(room.y, 4);
        const yaw = item.yaw - building.yaw, scale = (item.scale ?? 1) / (building.scale ?? 1);
        const hx = (Math.abs(Math.cos(yaw)) * definition.footprint[0] + Math.abs(Math.sin(yaw)) * definition.footprint[1]) * scale / 2;
        const hz = (Math.abs(Math.sin(yaw)) * definition.footprint[0] + Math.abs(Math.cos(yaw)) * definition.footprint[1]) * scale / 2;
        expect(position.x - hx, item.id).toBeGreaterThanOrEqual(room.bounds[0] - .02);
        expect(position.x + hx, item.id).toBeLessThanOrEqual(room.bounds[2] + .02);
        expect(position.z - hz, item.id).toBeGreaterThanOrEqual(room.bounds[1] - .02);
        expect(position.z + hz, item.id).toBeLessThanOrEqual(room.bounds[3] + .02);
        for (const solid of kitColliders(item)) for (const wall of world.colliders.filter(c => c.pieceId === building.id)) {
          const overlap = Math.min(solid.max.x, wall.max.x) - Math.max(solid.min.x, wall.min.x) > .02 &&
            Math.min(solid.max.y, wall.max.y) - Math.max(solid.min.y, wall.min.y) > .02 &&
            Math.min(solid.max.z, wall.max.z) - Math.max(solid.min.z, wall.min.z) > .02;
          expect(overlap, `${item.id} clips building solid ${wall.id}`).toBe(false);
        }
      }
      count++;
    }
    expect(count).toBeGreaterThanOrEqual(55);
  });

  it('keeps furniture fronts usable and soft room accents non-solid', () => {
    const blocked: string[] = [];
    for (const item of pieces) {
      const definition = KIT_PIECES[item.piece];
      if (soft.has(item.piece)) expect(kitColliders(item), item.id).toHaveLength(0);
      if (!definition.frontClearance) continue;
      const scale = item.scale ?? 1;
      const clear = [.33, .4, .5, .6].filter(distance => distance <= definition.frontClearance! + .06).some(distance => {
        const forward = definition.footprint[1] * scale / 2 + distance;
        return clearSpawn({ x: item.x + Math.sin(item.yaw) * forward, y: item.y,
          z: item.z + Math.cos(item.yaw) * forward }, world);
      });
      if (!clear) blocked.push(item.id);
    }
    expect(blocked, 'Furniture fronts need usable standing space').toEqual([]);
  });

  it('keeps homes, workshops and the clinic distinct upstairs', () => {
    for (const house of pieces.filter(piece => piece.piece === 'house_tall')) {
      const upper = pieces.filter(piece => piece.id.startsWith(`${house.id}:interior:upper-room:`)).map(piece => piece.piece);
      expect(upper, house.id).toContain('bed');
      expect(upper, house.id).toContain('rug');
      const role = buildingRole(house);
      if (role === 'clinic') expect(upper).toContain('shelf_pottery');
      else if (role === 'workshop') expect(upper).toContain('table');
      else expect(upper).toContain('wardrobe');
    }
  });

  it('uses different arrangements across repeated household roles and keeps park benches outdoors', () => {
    const houses = pieces.filter(piece => /^house_(small|tall)$/.test(piece.piece));
    const upperHomes = houses.filter(house => house.piece === 'house_tall' && buildingRole(house) === 'home');
    expect(new Set(upperHomes.map(roomVariant)).size, 'The home bedrooms need three distinct arrangements').toBe(3);
    for (const role of new Set(houses.map(buildingRole))) {
      const lots = houses.filter(house => buildingRole(house) === role);
      if (lots.length > 1) expect(new Set(lots.map(roomVariant)).size, `${role} repeats the same lot arrangement`).toBeGreaterThanOrEqual(2);
    }
    for (const house of houses) for (const room of buildingRooms(house)) {
      for (const bench of pieces.filter(piece => piece.piece === 'bench')) {
        const point = local(house, bench);
        const inside = Math.abs(point.y - room.y) < .1 && point.x > room.bounds[0] && point.x < room.bounds[2] &&
          point.z > room.bounds[1] && point.z < room.bounds[3];
        expect(inside, `${bench.id} is an oversized park bench inside ${house.id}`).toBe(false);
      }
    }
  });

  it('keeps room furniture from intersecting adjacent solid furniture', () => {
    const furniture = new Set(['table', 'chair', 'shelf_pottery', 'wardrobe', 'sofa', 'hammock', 'stove', 'bed', 'interior_counter', 'crate', 'barrel', 'bench']);
    const overlaps: string[] = [];
    for (const building of pieces) for (const room of buildingRooms(building)) {
      const items = pieces.filter(item => {
        if (!furniture.has(item.piece)) return false;
        const point = local(building, item);
        return Math.abs(point.y - room.y) < .02 && point.x > room.bounds[0] && point.x < room.bounds[2] &&
          point.z > room.bounds[1] && point.z < room.bounds[3];
      }).map(item => ({ item, solids: kitColliders(item) }));
      for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
        if (items[a].solids.some(left => items[b].solids.some(right =>
          Math.min(left.max.x, right.max.x) - Math.max(left.min.x, right.min.x) > .015 &&
          Math.min(left.max.y, right.max.y) - Math.max(left.min.y, right.min.y) > .015 &&
          Math.min(left.max.z, right.max.z) - Math.max(left.min.z, right.min.z) > .015)))
          overlaps.push(`${items[a].item.id} intersects ${items[b].item.id}`);
      }
    }
    expect(overlaps).toEqual([]);
  });

  it('keeps outdoor tree roots out of enterable rooms', () => {
    const plants = world.objects.filter(object => object.kind === 'tree' || object.kind === 'palm');
    for (const building of pieces) for (const room of buildingRooms(building)) {
      if (room.id !== 'ground-room') continue;
      for (const plant of plants) {
        const position = local(building, { ...plant.pos, id: plant.id, piece: '', yaw: 0 });
        const inside = position.x > room.bounds[0] && position.x < room.bounds[2] &&
          position.z > room.bounds[1] && position.z < room.bounds[3];
        expect(inside, `${plant.id} grows through ${building.id}`).toBe(false);
      }
    }
  });

  it('keeps soft potted plants clear of room walls, stairs and furniture', () => {
    for (const plant of pieces.filter(piece => piece.piece === 'potted_plant' && piece.id.includes(':interior:'))) {
      const size = plant.scale ?? 1, definition = KIT_PIECES.potted_plant;
      const radius = Math.max(...definition.footprint) * size / 2;
      const clipped = world.colliders.filter(solid =>
        Math.min(plant.x + radius, solid.max.x) - Math.max(plant.x - radius, solid.min.x) > .015 &&
        Math.min(plant.y + definition.height * size, solid.max.y) - Math.max(plant.y, solid.min.y) > .015 &&
        Math.min(plant.z + radius, solid.max.z) - Math.max(plant.z - radius, solid.min.z) > .015);
      expect(clipped.map(solid => solid.id), `${plant.id} clips a solid despite being decorative`).toEqual([]);
    }
  });

  it('hangs pictures clear of stair treads and tall furniture', () => {
    for (const picture of pieces.filter(piece => piece.piece === 'wall_picture')) {
      const definition = KIT_PIECES.wall_picture, scale = picture.scale ?? 1;
      const c = Math.abs(Math.cos(picture.yaw)), s = Math.abs(Math.sin(picture.yaw));
      const hx = (c * definition.footprint[0] + s * definition.footprint[1]) * scale / 2;
      const hz = (s * definition.footprint[0] + c * definition.footprint[1]) * scale / 2;
      for (const solid of world.colliders) {
        const overlap = Math.min(picture.x + hx, solid.max.x) - Math.max(picture.x - hx, solid.min.x) > .015 &&
          Math.min(picture.y + definition.height * scale, solid.max.y) - Math.max(picture.y, solid.min.y) > .015 &&
          Math.min(picture.z + hz, solid.max.z) - Math.max(picture.z - hz, solid.min.z) > .015;
        expect(overlap, `${picture.id} is buried in ${solid.id}`).toBe(false);
      }
    }
  });
});
