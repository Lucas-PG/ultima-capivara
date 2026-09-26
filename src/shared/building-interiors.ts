import { KIT_PIECES } from './kit-collision';
import { HOUSES, MORRO_LOTS, type HouseRole } from './layout';
import { rng } from './math';
import type { KitPlacement } from './types';

export interface RoomFloor { id: string; y: number; bounds: [number, number, number, number] }

// Room levels come from the same slabs that Blender renders and movement uses.
// Galleries and stair landings stay circulation space, not furniture bays.
export function buildingRooms(building: KitPlacement): RoomFloor[] {
  const definition = KIT_PIECES[building.piece];
  if (!definition) return [];
  if (definition.traversal) return definition.traversal.floors.filter(floor => floor.id.endsWith('-room'));
  if (!/^(house_|church$|market_hall$|warehouse$|beach_kiosk$)/.test(building.piece)) return [];
  const slab = definition.colliders.find(shape => shape.type === 'box' && shape.height < .5 && shape.width > 3 && shape.depth > 3);
  if (!slab || slab.type !== 'box') return [];
  return [{ id: 'ground-room', y: slab.y + slab.height / 2,
    bounds: [slab.x - slab.width / 2, slab.z - slab.depth / 2, slab.x + slab.width / 2, slab.z + slab.depth / 2] }];
}

export function buildingRole(building: KitPlacement): HouseRole | 'barracks' {
  return [...HOUSES, ...MORRO_LOTS].find(lot => lot.x === building.x && lot.z === building.z)?.role ?? 'barracks';
}

// Lot coordinates remain stable when unrelated world pieces are added. Do not
// consume the gameplay random sequence or derive a room from its generated ID.
export function roomVariant(building: Pick<KitPlacement, 'x' | 'z'>): 0 | 1 | 2 {
  const seed = Math.imul(Math.round(building.x * 10), 73856093) ^ Math.imul(Math.round(building.z * 10), 19349663) ^ 17;
  return Math.floor(rng(seed)() * 3) as 0 | 1 | 2;
}

export function groundRoomPoint(building: Pick<KitPlacement, 'x' | 'z' | 'piece'>, x: number, z: number, yaw = 0) {
  const variant = roomVariant(building);
  if (variant === 1) return { x, z: -z, yaw: Math.PI - yaw };
  if (variant === 2 && building.piece === 'house_small') return { x: -x, z, yaw: -yaw };
  return { x, z, yaw };
}

export function interiorPlacements(building: KitPlacement): KitPlacement[] {
  const rooms = buildingRooms(building), result: KitPlacement[] = [], scale = building.scale ?? 1;
  const variant = roomVariant(building);
  const cosine = Math.cos(building.yaw), sine = Math.sin(building.yaw);
  const add = (room: RoomFloor, piece: string, x: number, z: number, yaw = 0, size = 1, lift = 0) => {
    if (!KIT_PIECES[piece]) return;
    if (room.id === 'ground-room' && /^house_(small|tall)$/.test(building.piece))
      ({ x, z, yaw } = groundRoomPoint(building, x, z, yaw));
    result.push({ id: `${building.id}:interior:${room.id}:${piece}-${result.length}`, piece,
      x: building.x + (x * cosine + z * sine) * scale, y: building.y + (room.y + lift) * scale,
      z: building.z + (z * cosine - x * sine) * scale, yaw: building.yaw + yaw, scale: scale * size,
      ...(['rug', 'wall_picture'].includes(piece) ? { paintVariant: roomVariant(building) } : {}) });
  };
  for (const room of rooms) {
    const role = buildingRole(building);
    if (room.id === 'upper-room') {
      // The entire z=2.4..3.34 turn and the x=1 circulation aisle stay clear.
      const bedZ = [.65, -1.65, -.5][variant], workZ = variant === 1 ? -1.65 : variant === 2 ? .05 : -.15;
      add(room, 'bed', 2.75, bedZ, variant === 1 ? Math.PI : 0);
      add(room, role === 'clinic' ? 'shelf_pottery' : role === 'workshop' ? 'crate' : 'wardrobe', -.85, variant === 1 ? 1.8 : -2.65, variant === 1 ? Math.PI : 0);
      add(room, 'rug', .05, variant === 1 ? -.95 : .3, variant === 2 ? Math.PI / 2 : 0, .7);
      if (['tailor', 'workshop', 'clinic', 'barracks'].includes(role)) {
        add(room, 'table', -.65, workZ, Math.PI / 2);
        add(room, 'chair', -.65, workZ + 1.85, Math.PI);
      } else add(room, 'potted_plant', -.95, variant === 1 ? -2.55 : 1.7);
      const seatZ = variant === 0 ? -2.25 : 1.65;
      add(room, 'chair', 2.7, seatZ, -Math.PI / 2);
      add(room, 'rug', 2.7, seatZ, Math.PI / 2, .45);
      add(room, 'wall_picture', 3.69, variant === 2 ? -2.5 : bedZ,
        -Math.PI / 2, variant === 1 ? .85 : 1, 1.35);
    } else if (building.piece === 'house_small') {
      // Existing beds, counters and seats already occupy the long wall bays.
      // These role-specific appliances and storage fill the two end bays.
      const domestic = ['home', 'clinic', 'fisher'].includes(role);
      if (domestic) {
        add(room, role === 'clinic' ? 'shelf_pottery' : role === 'home' && variant > 0 ? 'chair' : 'stove', 2.6, -2.15);
        add(room, 'chair', -1.2, -.4, -Math.PI / 2);
        add(room, variant === 1 ? 'potted_plant' : 'rug', variant === 1 ? -2.75 : 2.35,
          variant === 1 ? -2.5 : 2.4, 0, variant === 1 ? 1 : .35);
      } else {
        add(room, ['bakery', 'cafe'].includes(role) ? 'stove' : 'crate', -2.65, -2.5, Math.PI / 2, ['bakery', 'cafe'].includes(role) ? 1 : .6);
        add(room, 'chair', 2.65, -1.75);
        add(room, 'chair', 2.65, 1.95, Math.PI);
      }
      add(room, 'wall_picture', -3.29, 1.8, Math.PI / 2, 1, 1.35);
      add(room, 'rug', 0, .15, 0, .65);
    } else if (building.piece === 'house_tall') {
      if (role === 'barracks') {
        add(room, 'interior_counter', 2.3, -2.75);
        add(room, 'table', 2.65, .1, -Math.PI / 2);
        add(room, 'chair', 1.2, .1, Math.PI / 2);
      }
      add(room, 'wall_picture', 3.69, -.6, -Math.PI / 2, 1, role === 'tailor' ? 2.3 : 1.4);
      add(room, 'potted_plant', 3.3, 2.55);
      add(room, 'chair', 1.85, -1.3, Math.PI);
      add(room, 'rug', 1.65, .55, Math.PI / 2, .65);
    } else if (building.piece === 'church') {
      for (const side of [-1, 1]) for (const x of [2.2, 3.1]) for (const z of [-2.8, 0, 2.8])
        add(room, 'chair', side * x, z, Math.PI);
      add(room, 'table', 2.8, -6.5);
      add(room, 'rug', 0, -5.7, 0, 1.1);
      add(room, 'potted_plant', -3.8, -6.6);
      add(room, 'wall_picture', 4.79, -5.6, -Math.PI / 2, 1.5, 1.4);
      add(room, 'chair', .95, -6.5, Math.PI / 2);
      add(room, 'rug', -2.65, -5, Math.PI / 2, .5);
    } else if (building.piece === 'market_hall' || building.piece === 'warehouse') {
      const [x0, z0, x1, z1] = room.bounds;
      for (const side of [-1, 1]) {
        const x = side < 0 ? x0 + 1.4 : x1 - 1.4;
        for (const z of [z0 + 1.3, z1 - 1.3]) {
          add(room, 'crate', x, z);
          add(room, 'barrel', x - side * 1.6, z, 0, .8);
        }
        add(room, building.piece === 'warehouse' ? 'table' : 'shelf_pottery', x, 0, -side * Math.PI / 2);
        add(room, 'chair', x - side * (building.piece === 'warehouse' ? 1.6 : 1.35), 0, side * Math.PI / 2);
      }
    } else if (building.piece === 'beach_kiosk') {
      add(room, 'stove', -1.8, -1.4);
      add(room, 'shelf_pottery', 1.9, -1.45, -Math.PI / 2);
      add(room, 'chair', -1.9, 1.2, Math.PI / 2);
      add(room, 'rug', .1, .3, 0, .55);
    } else if (building.piece === 'lighthouse') {
      add(room, 'table', -.75, 1.25, Math.PI / 2, .6);
      add(room, 'wall_picture', -2.16, .25, Math.PI / 2, .75, .6);
      add(room, 'rug', -.8, 1.25, Math.PI / 2, .4);
      add(room, 'potted_plant', -1.55, 1.2, 0, .6);
    }
  }
  return result;
}
