import { rng } from './math';
import { terrainHeight } from './terrain';
import { WORLD_VERSION, type ChestSpec, type Collider, type District, type LootSpawn, type MapObject, type SpawnPoint, type Vec3, type WeaponId, type WorldSpec } from './types';

const ground = (x: number, z: number) => terrainHeight(x, z);
const p = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export function createWorld(): WorldSpec {
  const random = rng(0x5eed1e5);
  const objects: MapObject[] = [];
  const colliders: Collider[] = [];
  const loot: LootSpawn[] = [];
  const chests: ChestSpec[] = [];
  const spawns: SpawnPoint[] = [];
  let sequence = 0;
  const id = (prefix: string) => `${prefix}-${++sequence}`;
  const districts: District[] = [
    { id: 'morro', name: 'Morro', x: -12, z: 92, radius: 33, color: '#b56949' },
    { id: 'praia', name: 'Praia', x: 57, z: -105, radius: 29, color: '#e9c47d' },
    { id: 'mangue', name: 'Mangue', x: -112, z: -80, radius: 29, color: '#617c56' },
    { id: 'cachoeira', name: 'Cachoeira', x: 101, z: -35, radius: 28, color: '#7db7bd' },
    { id: 'vila', name: 'Vila', x: -42, z: -12, radius: 38, color: '#e39973' },
    { id: 'centro', name: 'Centro', x: 59, z: -15, radius: 33, color: '#ac9aba' },
    { id: 'porto', name: 'Porto', x: -73, z: -65, radius: 36, color: '#638caf' },
    { id: 'fazenda', name: 'Fazenda', x: 67, z: 77, radius: 30, color: '#d7b671' },
    { id: 'posto', name: 'Posto', x: -5, z: -48, radius: 21, color: '#e6a34f' },
    { id: 'lagoa', name: 'Lagoa', x: -34, z: 45, radius: 26, color: '#77a5a0' },
  ];
  const obj = (kind: MapObject['kind'], x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, detail?: string, rotation?: number) => {
    objects.push({ id: id(kind), kind, pos: p(x, y, z), scale: p(sx, sy, sz), color, detail, rotation });
  };
  const solid = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, material: Collider['material'], detail?: string, kind: MapObject['kind'] = 'box') => {
    const key = id('solid');
    objects.push({ id: key, kind, pos: p(x, y, z), scale: p(sx, sy, sz), color, detail });
    colliders.push({ id: key, min: p(x - sx / 2, y - sy / 2, z - sz / 2), max: p(x + sx / 2, y + sy / 2, z + sz / 2), material });
  };
  const addRoof = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, detail: string, material: Collider['material'] = 'wood') => {
    obj('roof', x, y, z, sx, sy, sz, color, detail);
    const key = objects[objects.length - 1].id;
    const bands = Math.ceil(sy / .18);
    const addBand = (x0: number, x1: number, z0: number, z1: number, top: number) => {
      if (x1 <= x0 || z1 <= z0) return;
      colliders.push({ id: `${key}-step-${colliders.length}`, min: p(x0, y - .02, z0), max: p(x1, top, z1), material });
    };
    for (let i = 0; i < bands; i++) {
      const outerX = sx / 2 * (1 - i / bands), innerX = sx / 2 * (1 - (i + 1) / bands);
      const top = y + sy * (i + 1) / bands;
      if (detail === 'hip') {
        const outerZ = sz / 2 * (1 - i / bands), innerZ = sz / 2 * (1 - (i + 1) / bands);
        addBand(x - outerX, x - innerX, z - outerZ, z + outerZ, top);
        addBand(x + innerX, x + outerX, z - outerZ, z + outerZ, top);
        addBand(x - innerX, x + innerX, z - outerZ, z - innerZ, top);
        addBand(x - innerX, x + innerX, z + innerZ, z + outerZ, top);
      } else {
        addBand(x - outerX, x - innerX, z - sz / 2, z + sz / 2, top);
        addBand(x + innerX, x + outerX, z - sz / 2, z + sz / 2, top);
      }
    }
  };
  const level = (x: number, z: number, sx: number, sz: number, color: string, detail = 'path') => {
    // Roads follow the shared height field; the simulation still walks on terrain.
    const steps = Math.max(1, Math.ceil(Math.max(sx, sz) / 7));
    for (let i = 0; i < steps; i++) {
      const alongX = sx >= sz;
      const cx = x + (alongX ? (i + .5 - steps / 2) * sx / steps : 0);
      const cz = z + (alongX ? 0 : (i + .5 - steps / 2) * sz / steps);
      obj('box', cx, ground(cx, cz) + .025, cz, alongX ? sx / steps + .08 : sx, .035, alongX ? sz : sz / steps + .08, color, detail);
    }
  };
  const wallX = (x0: number, x1: number, z: number, base: number, height: number, openings: { at: number; width: number; sill: number; head: number }[], color: string, material: Collider['material']) => {
    let cursor = x0;
    for (const opening of openings.sort((a, b) => a.at - b.at)) {
      const left = opening.at - opening.width / 2;
      const right = opening.at + opening.width / 2;
      if (left > cursor) solid((cursor + left) / 2, base + height / 2, z, left - cursor, height, .24, color, material, 'wall');
      if (opening.sill > 0) solid(opening.at, base + opening.sill / 2, z, opening.width, opening.sill, .24, color, material, 'wall');
      if (opening.head < height) solid(opening.at, base + (opening.head + height) / 2, z, opening.width, height - opening.head, .24, color, material, 'wall');
      cursor = right;
    }
    if (cursor < x1) solid((cursor + x1) / 2, base + height / 2, z, x1 - cursor, height, .24, color, material, 'wall');
  };
  const wallZ = (z0: number, z1: number, x: number, base: number, height: number, openings: { at: number; width: number; sill: number; head: number }[], color: string, material: Collider['material']) => {
    let cursor = z0;
    for (const opening of openings.sort((a, b) => a.at - b.at)) {
      const left = opening.at - opening.width / 2;
      const right = opening.at + opening.width / 2;
      if (left > cursor) solid(x, base + height / 2, (cursor + left) / 2, .24, height, left - cursor, color, material, 'wall');
      if (opening.sill > 0) solid(x, base + opening.sill / 2, opening.at, .24, opening.sill, opening.width, color, material, 'wall');
      if (opening.head < height) solid(x, base + (opening.head + height) / 2, opening.at, .24, height - opening.head, opening.width, color, material, 'wall');
      cursor = right;
    }
    if (cursor < z1) solid(x, base + height / 2, (cursor + z1) / 2, .24, height, z1 - cursor, color, material, 'wall');
  };
  const door = (at: number, width = 2) => ({ at, width, sill: 0, head: 2.45 });
  const window = (at: number, width = 1.4) => ({ at, width, sill: .85, head: 2.2 });
  const windowTrimX = (x: number, z: number, y: number, width = 1.4) => {
    for (const dx of [-width / 2, width / 2]) obj('box', x + dx, y + 1.52, z, .095, 1.47, .3, '#efdfbc', 'window-frame');
    for (const yy of [.82, 2.22]) obj('box', x, y + yy, z, width + .15, .09, .3, '#efdfbc', 'window-frame');
    obj('box', x, y + 1.48, z, width + .04, .055, .3, '#9a7356', 'window-cross');
    for (const dx of [-width / 2 - .18, width / 2 + .18]) obj('box', x + dx, y + 1.53, z, .28, 1.28, .1, '#7e9279', 'shutter');
  };
  const doorTrimX = (x: number, z: number, y: number, width = 2) => {
    for (const dx of [-width / 2, width / 2]) obj('box', x + dx, y + 1.23, z, .1, 2.45, .3, '#e8d7b6', 'door-frame');
    obj('box', x, y + 2.46, z, width + .15, .1, .3, '#e8d7b6', 'door-frame');
  };
  const windowTrimZ = (x: number, z: number, y: number) => {
    for (const dz of [-.7, .7]) obj('box', x, y + 1.52, z + dz, .3, 1.47, .09, '#efdfbc', 'window-frame');
    for (const yy of [.82, 2.22]) obj('box', x, y + yy, z, .3, .09, 1.55, '#efdfbc', 'window-frame');
  };
  const chest = (x: number, z: number, y = ground(x, z)) => chests.push({ id: id('chest'), x, y: Math.max(y, ground(x, z)), z });
  const item = (x: number, z: number, kind: LootSpawn['kind'], weapon?: WeaponId, y = ground(x, z)) => loot.push({ id: id('loot'), x, y: Math.max(y, ground(x, z)), z, kind, weapon });
  const crate = (x: number, z: number, size = 1.25, y = ground(x, z)) => solid(x, y + size / 2, z, size, size, size, '#8c633e', 'wood', 'crate');
  const barrel = (x: number, z: number, y = ground(x, z)) => {
    obj('barrel', x, y + .55, z, .46, 1.1, .46, '#497b8b', 'rust');
    colliders.push({ id: id('barrel'), min: p(x - .42, y, z - .42), max: p(x + .42, y + 1.1, z + .42), material: 'metal' });
  };
  const house = (x: number, z: number, w: number, d: number, color: string, roof: string, material: Collider['material'] = 'stone') => {
    const y = ground(x, z);
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    obj('box', x, y + .04, z, w - .2, .08, d - .2, '#9b8469', 'floor');
    wallX(x0, x1, z1, y, 3, [door(x - w * .18), window(x + w * .25)], color, material);
    wallX(x0, x1, z0, y, 3, [door(x + w * .2), window(x - w * .24)], color, material);
    wallZ(z0, z1, x0, y, 3, [window(z)], color, material);
    wallZ(z0, z1, x1, y, 3, [window(z)], color, material);
    for (const zz of [z0, z1]) {
      windowTrimX(zz === z1 ? x + w * .25 : x - w * .24, zz, y);
      doorTrimX(zz === z1 ? x - w * .18 : x + w * .2, zz, y);
    }
    windowTrimZ(x0, z, y); windowTrimZ(x1, z, y);
    addRoof(x, y + 3.1, z, w + .65, 1.8, d + .65, roof, 'hip', material);
    obj('box', x, y + 2.8, z1 + .05, w + .4, .12, .15, '#efe2be', 'eave');
    for (const zz of [z0 - .27, z1 + .27]) obj('box', x, y + 3.12, zz, w + .7, .09, .09, '#533f3d', 'roof-edge');
    for (const xx of [x0 - .27, x1 + .27]) obj('box', xx, y + 3.12, z, .09, .09, d + .7, '#533f3d', 'roof-edge');
    solid(x + w * .25, y + .34, z, 1.6, .68, .8, '#527280', 'wood', 'sofa');
    solid(x - w * .26, y + .38, z - d * .18, 1.1, .76, .8, '#735139', 'wood', 'table');
    crate(x + w * .3, z - d * .25, .85, y);
    chest(x - w * .33, z + d * .2, y);
    item(x, z + .7, 'weapon', random() > .65 ? 'smg' : 'pistol', y);
    item(x + .4, z - .7, 'ammo', undefined, y);
  };
  const warehouse = (x: number, z: number, w: number, d: number, color: string) => {
    const y = ground(x, z), x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    obj('box', x, y + .06, z, w, .12, d, '#8e8b7c', 'floor');
    wallX(x0, x1, z1, y, 6, [{ at: x - w * .23, width: 4.4, sill: 0, head: 4.5 }, door(x + w * .31)], color, 'metal');
    wallX(x0, x1, z0, y, 6, [{ at: x + w * .18, width: 4.4, sill: 0, head: 4.5 }], color, 'metal');
    wallZ(z0, z1, x0, y, 6, [door(z), { at: z + d * .3, width: 1.7, sill: 3.7, head: 5 }], color, 'metal');
    wallZ(z0, z1, x1, y, 6, [door(z)], color, 'metal');
    addRoof(x, y + 6.08, z, w + .9, 1.5, d + .9, '#6d6c6d', 'gable', 'metal');
    for (const [cx, cz, paint] of [[x - 4, z - 2, '#416f94'], [x + 4, z - 2, '#b4533d'], [x + 3, z + 2, '#d1a748']] as const) {
      solid(cx, y + 1.25, cz, 5, 2.5, 2.3, paint, 'metal', 'container');
      obj('box', cx, y + 2.4, cz, 5.05, .07, 2.35, '#d2d5ce', 'container-rib');
    }
    for (const [cx, cz] of [[x - 7, z + 3], [x - 5.5, z + 3], [x + 7, z + 3]]) crate(cx, cz, 1.25, y);
    chest(x - w * .35, z + d * .35, y);
    chest(x + w * .34, z - d * .34, y);
    item(x, z, 'weapon', 'm4', y);
    item(x - 1, z + 3.8, 'armor', undefined, y);
  };
  const stairs = (x0: number, x1: number, z: number, y: number, rise: number, count: number, color: string) => {
    const step = (x1 - x0) / count;
    for (let i = 0; i < count; i++) {
      const x = x0 + (i + .5) * step;
      solid(x, y + (i + 1) * rise / 2, z, step + .02, (i + 1) * rise, 1.5, color, 'stone', 'stair');
    }
  };
  const tower = (x: number, z: number, color: string) => {
    const y = ground(x, z), w = 11, d = 10;
    for (let floor = 0; floor < 2; floor++) {
      const by = y + floor * 3.2;
      wallX(x - w / 2, x + w / 2, z + d / 2, by, 3.2, floor ? [window(x - 2), window(x + 2)] : [door(x), window(x + 3)], color, 'stone');
      wallX(x - w / 2, x + w / 2, z - d / 2, by, 3.2, floor ? [window(x - 2), window(x + 2)] : [door(x + 2)], color, 'stone');
      wallZ(z - d / 2, z + d / 2, x - w / 2, by, 3.2, floor ? [door(z + 2.1), window(z - 1.5)] : [window(z)], color, 'stone');
      wallZ(z - d / 2, z + d / 2, x + w / 2, by, 3.2, [window(z)], color, 'stone');
    }
    // The open exterior staircase connects the street to a balcony and upper doorway.
    stairs(x - 9.5, x - 5.5, z + 2.1, y, 3.2 / 12, 12, '#a49a89');
    solid(x - 5.3, y + 3.15, z + 2.1, 1.5, .17, 2.6, '#ad9e85', 'stone', 'balcony');
    solid(x, y + 3.24, z, 10.7, .13, 9.7, '#a49a89', 'stone', 'floor');
    addRoof(x, y + 6.5, z, 11.6, 1.5, 10.6, '#635566', 'hip', 'stone');
    crate(x + 2.5, z + 2.8, 1, y);
    chest(x + 3.7, z - 3.5, y);
    item(x - 1, z, 'weapon', 'dmr', y);
  };

  // A readable road network gives each district at least two land approaches.
  level(-47, -38, 7, 105, '#907657');
  level(-69, -51, 84, 7, '#8e755a');
  level(11, -15, 125, 7, '#8e755a');
  level(48, 28, 7, 114, '#907657');
  level(-9, 50, 7, 117, '#947e5d');
  level(-21, -89, 156, 6, '#947e5d');
  level(88, -57, 6, 88, '#92775c');
  level(-95, -93, 6, 48, '#6e6958', 'boardwalk');

  // Vila: close streets, colourful homes, a chapel, and a square with useful cover.
  for (const [x, z, w, d, c, r] of [
    [-78, 0, 9, 7, '#e0a071', '#98564c'], [-65, 0, 9, 7, '#b5bf9a', '#7c5557'],
    [-53, 0, 9, 7, '#e6c497', '#ad6b4e'], [-32, 0, 9, 7, '#a6bccc', '#76556a'],
    [-18, 0, 9, 7, '#d9a6a5', '#825065'], [-74, -24, 9, 7, '#cab695', '#955b4d'],
    [-61, -24, 9, 7, '#e3b284', '#9a5540'], [-29, -25, 9, 7, '#c4b3cc', '#635d77'],
    [-13, -23, 9, 7, '#bdc6a4', '#77634d'], [-80, 17, 8, 7, '#e6ba8a', '#975b47'],
    [-60, 17, 8, 7, '#b4c5c0', '#715866'], [-37, 19, 8, 7, '#efd1a6', '#a55e4b'],
  ] as const) house(x, z, w, d, c, r);
  tower(-8, 4, '#e5d3b2');
  obj('cone', -8, ground(-8, 4) + 9.2, 4, 1.2, 2.5, 1.2, '#b56853', 'steeple');
  obj('cylinder', -42, ground(-42, -11) + .5, -11, 2.5, 1, 2.5, '#9b8b74', 'fountain');
  obj('cylinder', -42, ground(-42, -11) + 1.12, -11, 1.7, .25, 1.7, '#82b7b7', 'water');
  for (const [x, z] of [[-49, -12], [-35, -12], [-44, -20], [-44, -3]]) crate(x, z);
  item(-42, -12, 'medkit');
  obj('sign', -47, ground(-47, -38) + 2.1, -35, 3.6, 2.4, .2, '#eccb8b', 'VILA / PORTO');

  // Porto: container yard, enterable warehouse, crane, piers, boats, fish market.
  warehouse(-76, -66, 25, 15, '#82949d');
  house(-42, -63, 9, 7, '#d3bfa0', '#685a61', 'wood');
  for (const [x, z, c] of [[-105, -46, '#a94f3c'], [-103, -55, '#497ca1'], [-105, -65, '#dfad55'], [-46, -80, '#4d896c']] as const)
    solid(x, ground(x, z) + 1.25, z, 5.5, 2.5, 2.6, c, 'metal', 'container');
  for (const x of [-111, -101, -91]) {
    for (const z of [-85, -93, -101, -109]) obj('box', x, ground(x, z) + .18, z, 2.6, .26, 8.1, '#8c6942', 'pier');
    for (const z of [-87, -106]) solid(x, ground(x, z) + .8, z, .26, 1.6, .26, '#6e5137', 'wood', 'post');
  }
  for (const [x, z] of [[-114, -113], [-95, -116], [-83, -105]]) obj('boat', x, .25, z, 5.2, 1.4, 2.2, '#f1cb80', 'fishing');
  solid(-111, ground(-111, -72) + 4.8, -72, .55, 9.6, .55, '#d39c54', 'metal', 'crane');
  obj('box', -106, ground(-111, -72) + 9.3, -72, 11, .45, .5, '#d39c54', 'crane-arm');
  for (const [x, z] of [[-52, -87], [-60, -85], [-90, -89]]) { barrel(x, z); crate(x + 1.7, z); }
  item(-99, -72, 'weapon', 'shotgun');
  item(-52, -91, 'armor');
  chest(-57, -89);
  obj('sign', -82, ground(-82, -39) + 2, -39, 4.2, 2.2, .2, '#e6ca8b', 'PORTO');

  // Posto: pumps, kiosk, canopy, tire stacks and a roadside truck.
  house(-5, -58, 10, 8, '#e9d3ad', '#ae694b');
  obj('box', -5, ground(-5, -41) + 4.35, -41, 20, .35, 12, '#e8c496', 'canopy');
  for (const x of [-13, 3]) for (const z of [-46, -36]) solid(x, ground(x, z) + 2.1, z, .34, 4.2, .34, '#b65543', 'metal', 'canopy-post');
  for (const x of [-9, -1]) {
    solid(x, ground(x, -41) + .85, -41, .9, 1.7, .7, '#d4583d', 'metal', 'pump');
    obj('box', x, ground(x, -41) + 1.25, -40.61, .54, .4, .05, '#b4d4ca', 'pump-glass');
  }
  obj('box', 11, ground(11, -48) + 1.1, -48, 5.5, 2.2, 2.3, '#86a6ab', 'truck');
  for (const x of [9.4, 12.7]) for (const z of [-49.1, -46.9]) obj('cylinder', x, ground(x, z) + .55, z, .65, .3, .65, '#343b3b', 'wheel');
  barrel(13, -39); crate(13, -42);
  item(1, -48, 'guarana');
  obj('sign', -16, ground(-16, -50) + 2.5, -50, 3.5, 2.7, .2, '#edca6c', 'POSTO');

  // Centro: taller blocks, open public market, roofline and traffic cover.
  for (const [x, z, c] of [[38, -38, '#b29a9a'], [61, -39, '#a4a8aa'], [84, -38, '#c1b29a'], [38, -4, '#d0b6a9'], [68, 1, '#aab6a0']] as const) tower(x, z, c);
  for (const [x, z, c] of [[52, -20, '#df845a'], [58, -20, '#739ab5'], [64, -20, '#dbc17a']] as const) {
    addRoof(x, ground(x, z) + 2.5, z, 5, 1, 4, c, 'market-awning');
    for (const dx of [-2, 2]) solid(x + dx, ground(x, z) + 1.3, z, .18, 2.6, .18, '#775d43', 'wood', 'market-post');
    crate(x, z + 1.5);
  }
  item(55, -10, 'helmet');
  obj('sign', 49, ground(49, -35) + 2.6, -35, 4, 2.6, .2, '#f1d19b', 'CENTRO');

  // Fazenda: barn, silo, orchard rows and low fences.
  warehouse(60, 77, 16, 12, '#945a4a');
  obj('cylinder', 83, ground(83, 73) + 4, 73, 2.4, 8, 2.4, '#b2b9b9', 'silo');
  obj('sphere', 83, ground(83, 73) + 8.3, 73, 2.4, 1, 2.4, '#c6ccca', 'silo-cap');
  for (const x of [43, 52, 61, 70, 79]) for (const z of [95, 103, 111]) {
    obj('tree', x + (random() - .5) * 1.7, ground(x, z), z, 2, 6, 2, '#708d4b', 'orchard');
  }
  for (const z of [54, 95]) for (let x = 37; x < 90; x += 3.2) obj('box', x, ground(x, z) + .6, z, 2.8, .12, .13, '#9e7950', 'fence');
  for (const x of [39, 89]) for (let z = 56; z < 95; z += 3.2) obj('box', x, ground(x, z) + .6, z, .13, .12, 2.8, '#9e7950', 'fence');
  item(77, 65, 'weapon', 'shotgun');
  chest(82, 84);

  // Morro: terraced favela, stairways, lookouts and a radio mast.
  for (const z of [73, 83, 93, 103, 113]) for (const x of [-38, -24, -10, 4]) {
    if (random() < .16) continue;
    house(x + (random() - .5), z, 6.4, 5.1, ['#d69674', '#e4bd8b', '#a7bbab', '#dcb0a6'][Math.floor(random() * 4)], '#975c4b', 'wood');
  }
  for (const x of [-32, -17, -2]) for (let z = 70; z < 111; z += 2.7) {
    const y0 = ground(x, z), y1 = ground(x, z + 2.7);
    obj('box', x, (y0 + y1) / 2 + .07, z + 1.35, 1.5, .14, 2.8, '#b2a18b', 'stair-path');
  }
  solid(11, ground(11, 105) + 7, 105, .45, 14, .45, '#b1b8b3', 'metal', 'radio-mast');
  obj('sphere', 11, ground(11, 105) + 14, 105, .55, .55, .55, '#e6ad6a', 'beacon');
  item(-8, 104, 'weapon', 'sniper');

  // Praia: small kiosks, parasols, surf boards and moored skiffs.
  for (const x of [30, 43, 56, 69, 82]) {
    addRoof(x, ground(x, -107) + 2.5, -107, 5.4, 1.4, 4.2, '#c49356', 'thatch');
    for (const dx of [-2.2, 2.2]) for (const dz of [-1.6, 1.6]) solid(x + dx, ground(x, -107) + 1.25, -107 + dz, .18, 2.5, .18, '#8b6842', 'wood', 'kiosk-post');
    crate(x, -107);
    obj('cone', x + 4.4, ground(x + 4.4, -119) + 2.1, -119, 1.8, .6, 1.8, ['#da8062', '#7aafaa', '#e5b96e'][Math.floor(random() * 3)], 'umbrella');
    obj('cylinder', x + 4.4, ground(x + 4.4, -119) + 1.05, -119, .07, 2.1, .07, '#80694a', 'umbrella-pole');
  }
  obj('boat', 77, .1, -123, 5, 1.5, 2, '#d0af72', 'canoe');
  item(55, -108, 'guarana');
  chest(35, -108);

  // Mangue and Lagoa: boardwalks, wet roots, reed islands and a raised shack.
  house(-112, -72, 9, 7, '#a9aa86', '#716952', 'wood');
  for (let z = -113; z <= -42; z += 4) obj('box', -117, ground(-117, z) + .12, z, 2.4, .22, 3.8, '#997850', 'boardwalk');
  for (let i = 0; i < 46; i++) {
    const x = -124 + random() * 37, z = -117 + random() * 76;
    if (x > -110 && z > -79 && z < -65) continue;
    obj('tree', x, ground(x, z), z, 1.2, 5 + random() * 4, 1.2, '#507b5a', 'mangrove');
  }
  for (const [x, z] of [[-57, 43], [-48, 35], [-25, 30], [-16, 47]]) obj('boat', x, ground(x, z) + .1, z, 4.5, 1, 1.9, '#a97c51', 'rowboat');
  for (let i = 0; i < 26; i++) {
    const x = -55 + random() * 48, z = 23 + random() * 43;
    obj('grass', x, ground(x, z), z, .8, 1.6, .8, '#94a967', 'reeds');
  }
  chest(-52, 55);
  item(-20, 49, 'acai');

  // Cachoeira: cliff ledges, broken stone bridge and observation hut.
  house(108, -33, 8, 7, '#b8b4a6', '#696d74');
  // The cascade needs a physical rock face, so its water sheet does not float
  // above the hill and players can land on the same ledge they see.
  solid(103, ground(103, -39) + 1.44, -39.96, 5.2, 2.88, 1.9, '#777f76', 'stone', 'cliff');
  obj('rock', 100.7, ground(100.7, -39) + .65, -39.1, 1.5, 1.3, 1.5, '#798577', 'cliff');
  obj('rock', 105.1, ground(105.1, -39) + .7, -39.1, 1.3, 1.4, 1.4, '#697568', 'cliff');
  obj('box', 103, ground(103, -39) + 1.5, -39, 3.2, 3, .22, '#87c2c7', 'waterfall');
  obj('box', 103, ground(103, -36.9) + .055, -36.9, 4.7, .07, 3.5, '#609b9b', 'water');
  for (const [x, z, size] of [[91, -48, 3.3], [108, -51, 4.4], [115, -26, 3.8], [97, -18, 2.8]] as const) {
    obj('rock', x, ground(x, z) + size * .28, z, size, size * .55, size, '#7f8583', 'cliff');
    colliders.push({ id: id('rock'), min: p(x - size * .42, ground(x, z), z - size * .42), max: p(x + size * .42, ground(x, z) + size * .5, z + size * .42), material: 'stone' });
  }
  for (const x of [89, 93, 97, 101]) obj('box', x, ground(x, -54) + .16, -54, 3.7, .3, 2, '#a49b83', 'bridge-stone');
  item(108, -34, 'weapon', 'dmr');

  // Shared vegetation and clutter are deterministic and stay off open roads and structures.
  const clear = (x: number, z: number, radius: number) => colliders.some(c => x > c.min.x - radius && x < c.max.x + radius && z > c.min.z - radius && z < c.max.z + radius);
  for (let i = 0; i < 310; i++) {
    const x = -123 + random() * 246, z = -123 + random() * 246;
    if (ground(x, z) < .3 || clear(x, z, 3.3)) continue;
    const nearRoad = (Math.abs(x + 47) < 5 && z < 20 && z > -90) || (Math.abs(z + 15) < 5 && x > -52 && x < 80) || (Math.abs(x - 48) < 5 && z > -30 && z < 90);
    if (nearRoad || districts.some(d => Math.hypot(x - d.x, z - d.z) < d.radius * .52)) continue;
    const kind = random() < .36 ? 'palm' : 'tree';
    const height = kind === 'palm' ? 6 + random() * 4 : 4 + random() * 4;
    obj(kind, x, ground(x, z), z, 1.4, height, 1.4, kind === 'palm' ? '#477348' : '#607b44', 'foliage', random() * Math.PI * 2);
  }
  for (let i = 0; i < 145; i++) {
    const x = -123 + random() * 246, z = -123 + random() * 246;
    if (ground(x, z) < .4 || clear(x, z, 1.4)) continue;
    const s = .35 + random() * 1.4;
    if (random() < .34) {
      obj('rock', x, ground(x, z) + s * .26, z, s, s * .55, s * .75, '#8b8b7f', 'field');
      if (s > 1.1) colliders.push({ id: id('rock'), min: p(x - s * .43, ground(x, z), z - s * .32), max: p(x + s * .43, ground(x, z) + s * .53, z + s * .32), material: 'stone' });
    } else obj('grass', x, ground(x, z), z, s, s * 1.1, s, '#a2a46b', 'tuft');
  }
  for (const [x, z] of [[-93, -28], [-65, -34], [-31, -38], [-8, -74], [18, -15], [48, -50], [50, 25], [70, 35], [-9, 37]]) {
    obj('lamp', x, ground(x, z), z, .16, 4.4, .16, '#c1ab78', 'street');
  }

  // Clear-ground spawn checks protect the opening seconds of both modes.
  const safe = (x: number, z: number) => ground(x, z) > .8 && !clear(x, z, 1.25);
  const dmCandidates: [number, number, number][] = [
    [-90, -34, 2.3], [-68, -35, 0], [-48, -39, -1], [-25, -40, -1.5], [5, -70, -.3],
    [8, -25, 2], [-18, -8, -2.2], [-49, 10, 0], [-88, -15, 1.2], [-94, -83, -.8],
    [-60, -92, .4], [-32, -74, 2.4], [-6, -89, -1.2], [-27, 11, 1], [-72, -45, 3],
    [-38, -52, -.7], [-97, -27, 2], [-13, -34, 1.1], [-58, -32, 1], [-39, -89, -2],
  ];
  for (const [x, z, yaw] of dmCandidates) if (safe(x, z)) spawns.push({ x, y: ground(x, z), z, mode: 'deathmatch', yaw });
  for (const d of districts) for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, radius = d.radius * .75;
    const x = Math.round(d.x + Math.cos(a) * radius), z = Math.round(d.z + Math.sin(a) * radius);
    if (safe(x, z)) spawns.push({ x, y: ground(x, z), z, mode: 'battle-royale', yaw: a + Math.PI });
  }
  for (let i = 0; i < 70; i++) {
    const x = Math.round(-117 + random() * 234), z = Math.round(-117 + random() * 234);
    if (!safe(x, z) || districts.some(d => Math.hypot(x - d.x, z - d.z) < d.radius * .45)) continue;
    item(x, z, random() < .22 ? 'weapon' : ['ammo', 'bandage', 'rapadura', 'armor', 'guarana'][Math.floor(random() * 5)] as LootSpawn['kind'], random() < .5 ? 'm4' : 'pistol');
  }
  return { version: WORLD_VERSION, size: 260, colliders, objects, spawns, loot, chests, districts };
}
