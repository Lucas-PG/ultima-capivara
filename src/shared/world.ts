import { rng } from './math';
import { terrainHeight } from './terrain';
import { ARENA, ARENA_CENTER, CHURCH, FAROL, FORTE, HOUSES, MERCADAO, MORRO_LOTS, PLAZA, ROADS, TOWERS } from './layout';
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
    { id: 'morro', name: 'Morro', x: -10, z: 92, radius: 34, color: '#b56949' },
    { id: 'praia', name: 'Praia', x: 49, z: -113, radius: 27, color: '#e9c47d' },
    { id: 'mangue', name: 'Mangue', x: -114, z: -78, radius: 22, color: '#617c56' },
    { id: 'cachoeira', name: 'Cachoeira', x: 102, z: -22, radius: 26, color: '#7db7bd' },
    { id: 'vila', name: 'Vila', x: -55, z: 46, radius: 38, color: '#e39973' },
    { id: 'centro', name: 'Centro', x: 54, z: -36, radius: 30, color: '#ac9aba' },
    { id: 'porto', name: 'Porto', x: -70, z: -70, radius: 36, color: '#638caf' },
    { id: 'fazenda', name: 'Fazenda', x: 62, z: 67, radius: 26, color: '#d7b671' },
    { id: 'posto', name: 'Posto', x: -10, z: -24, radius: 17, color: '#e6a34f' },
    { id: 'lagoa', name: 'Lagoa', x: -34, z: 6, radius: 20, color: '#77a5a0' },
    { id: 'forte', name: 'Forte', x: -28, z: -108, radius: 16, color: '#c2402e' },
    { id: 'farol', name: 'Farol', x: 110, z: 70, radius: 14, color: '#d8392b' },
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
  const item = (x: number, z: number, kind: LootSpawn['kind'], weapon?: WeaponId, y = ground(x, z)) =>
    loot.push({ id: id('loot'), x, y: Math.max(y, ground(x, z)), z, kind, ...(kind === 'weapon' && weapon ? { weapon } : {}) });
  const crate = (x: number, z: number, size = 1.25, y = ground(x, z)) => solid(x, y + size / 2, z, size, size, size, '#8c633e', 'wood', 'crate');
  const barrel = (x: number, z: number, y = ground(x, z)) => {
    obj('barrel', x, y + .55, z, .46, 1.1, .46, '#497b8b', 'rust');
    colliders.push({ id: id('barrel'), min: p(x - .42, y, z - .42), max: p(x + .42, y + 1.1, z + .42), material: 'metal' });
  };
  const streetDetail = (x: number, z: number, kind: string, color: string) => {
    const y = ground(x, z);
    obj('box', x, y, z, 1, 0, 1, color, `prop:${kind}`);
    const [sx, sy, sz] = kind.startsWith('stall:') ? [2.45, .9, 1.16] :
      kind === 'bench' ? [2.08, .8, .82] : kind === 'cart' ? [1.82, 1.1, 1.1] : [1.34, .8, 1.34];
    colliders.push({ id: id('street-fixture'), min: p(x - sx / 2, y, z - sz / 2),
      max: p(x + sx / 2, y + sy, z + sz / 2), material: 'wood' });
  };
  const house = (x: number, z: number, w: number, d: number, color: string, roof: string, material: Collider['material'] = 'stone', role = 'home', stocked = true) => {
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
    // A single marker supplies the renderer with the building's full room and
    // frontage design. The main furniture has matching simulation colliders.
    obj('box', x, y, z, w, 0, d, color, `prop:house:${role}`);
    const fixture = (fx: number, fz: number, sx: number, sy: number, sz: number) =>
      colliders.push({ id: id('fixture'), min: p(fx - sx / 2, y, fz - sz / 2), max: p(fx + sx / 2, y + sy, fz + sz / 2), material: 'wood' });
    const bed = role === 'home' || role === 'fisher' || role === 'clinic';
    fixture(x + w * .28, z + d * .11, bed ? 1.6 : 1.36, bed ? .75 : 1.03, bed ? 1.9 : 1.43);
    fixture(x - w * .33, z - d * .17, .88, role === 'workshop' ? 1.04 : .94, 1.86);
    if (role === 'bakery') fixture(x + w / 2 - .83, z - d * .24, 1.28, 2.24, 1.86);
    if (role === 'cafe') fixture(x - w * .12, z - d * .12, .94, .8, .94);
    if (!stocked) return;
    chest(x - w * .34, z + d * .28, y);
    // Small casinhas are full of furniture, so their pickups wait by the doors.
    const small = w < 6.5;
    item(small ? x - w * .18 : x, small ? z + d / 2 - .7 : z + .7, 'weapon', random() > .65 ? 'smg' : 'pistol', y);
    item(small ? x + w * .2 : x + .4, small ? z - d / 2 + .7 : z - .7, 'ammo', undefined, y);
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

  // ---- Island plan: legacy layout (layout.ts) built with the detailed v2 kit ----
  const onRoad = (x: number, z: number, m = 0) => ROADS.some(([x0, z0, x1, z1]) => x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m);
  const clear = (x: number, z: number, radius: number) => colliders.some(c => x > c.min.x - radius && x < c.max.x + radius && z > c.min.z - radius && z < c.max.z + radius);
  const rectClear = (x0: number, z0: number, x1: number, z1: number, m: number) =>
    !colliders.some(c => x0 - m < c.max.x && x1 + m > c.min.x && z0 - m < c.max.z && z1 + m > c.min.z);
  const rectRoad = (x0: number, z0: number, x1: number, z1: number, m: number) =>
    ROADS.some(([rx0, rz0, rx1, rz1]) => x0 - m < rx1 && x1 + m > rx0 && z0 - m < rz1 && z1 + m > rz0);
  const baseFor = (x0: number, z0: number, x1: number, z1: number) =>
    Math.min(ground(x0, z0), ground(x1, z0), ground(x0, z1), ground(x1, z1), ground((x0 + x1) / 2, (z0 + z1) / 2)) - .06;
  // Legacy findSpot(): free, dry, fairly flat ground away from roads.
  const findSpot = (w: number, d: number, m: number, road = false, area?: readonly [number, number, number, number], maxRelief = 1.3) => {
    for (let k = 0; k < 60; k++) {
      const x = area ? area[0] + random() * (area[2] - area[0]) : -116 + random() * 232;
      const z = area ? area[1] + random() * (area[3] - area[1]) : -116 + random() * 232;
      const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
      if (!rectClear(x0, z0, x1, z1, m) || (!road && rectRoad(x0, z0, x1, z1, 1))) continue;
      const hs = [ground(x0, z0), ground(x1, z0), ground(x0, z1), ground(x1, z1)];
      if (Math.min(...hs) < .7 || Math.max(...hs) - Math.min(...hs) > maxRelief) continue;
      return { x, z, x0, x1, z0, z1, y: baseFor(x0, z0, x1, z1) };
    }
    return null;
  };
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  const sign = (x: number, z: number, label: string) => obj('sign', x, ground(x, z) + 2.3, z, 3.8, 2.5, .2, '#eccb8b', label);

  // Houses on their own levelled lots.
  const palette = [
    ['#d89473', '#98564c'], ['#f0c794', '#9e5a45'], ['#a6c5be', '#715866'], ['#efd1a6', '#a55e4b'], ['#c4b3cc', '#635d77'],
    ['#cab695', '#955b4d'], ['#e3b284', '#9a5540'], ['#d9a6a5', '#825065'], ['#bdc6a4', '#77634d'], ['#e6ba8a', '#975b47'],
  ] as const;
  HOUSES.forEach((h, i) => { const [c, r] = palette[i % palette.length]; house(h.x, h.z, h.w, h.d, c, r, h.material, h.role); });

  // Vila: the two legacy rows plus Lucas's plaza (fountain, stalls, bunting) and the church tower.
  {
    const [px, pz] = PLAZA, y = ground(px, pz);
    obj('box', px, y + .02, pz, 18, .035, 17, '#bfa987', 'courtyard');
    obj('box', px, y, pz, 18, 0, 17, '#bfa987', 'prop:plaza');
    colliders.push({ id: id('fountain'), min: p(px - 2.25, y, pz - 2.25), max: p(px + 2.25, y + 1.25, pz + 2.25), material: 'stone' });
    for (const [dx, dz, kind] of [[5, 11, 'planter'], [8, -6, 'bench'], [-6, -5, 'cart'], [-1, -7.5, 'stall:produce']] as const)
      streetDetail(px + dx, pz + dz, kind, '#dba876');
    for (const [dx, dz] of [[-7, -1], [7, -1], [-2, -7], [-2, 7]]) crate(px + dx, pz + dz);
    item(px - 3, pz, 'medkit');
    const [cx, cz] = CHURCH;
    tower(cx, cz, '#e5d3b2');
    obj('cone', cx, ground(cx, cz) + 9.2, cz, 1.2, 2.5, 1.2, '#b56853', 'steeple');
    for (const [x, z] of [[-104, 45], [-60, 45]] as const) obj('box', x, ground(x, z), z, 3.2, 0, 14, '#d6bd92', 'prop:alley');
    sign(-106, 39, 'VILA');
  }

  // Centro: four two-storey blocks around the east road and a covered market.
  {
    for (const [i, [x, z]] of TOWERS.entries()) tower(x, z, ['#b29a9a', '#a4a8aa', '#c1b29a', '#d0b6a9'][i % 4]);
    // Mercadão: an open market hall under a big red roof, stalls in two rows
    // and the best loot density on the island.
    {
      const [mx, mz] = MERCADAO, y = ground(mx, mz), w = 16, d = 13;
      obj('box', mx, y + .06, mz, w, .12, d, '#c9b38a', 'floor');
      for (let i = 0; i <= 4; i++) for (const zz of [mz - d / 2, mz + d / 2]) solid(mx - w / 2 + i * w / 4, y + 2.3, zz, .45, 4.6, .45, '#c2402e', 'stone', 'market-post');
      for (const xx of [mx - w / 2, mx + w / 2]) solid(xx, y + 2.3, mz, .45, 4.6, .45, '#c2402e', 'stone', 'market-post');
      for (const xx of [mx - w / 2, mx + w / 2]) for (const zz of [mz - d / 2 + 2.2, mz + d / 2 - 2.2]) solid(xx, y + .55, zz, .3, 1.1, 3, '#e8d5b0', 'stone', 'ruin');
      addRoof(mx, y + 4.6, mz, w + 1.4, 2.4, d + 1.4, '#d8492f', 'gable', 'metal');
      for (const [dx, dz, kind] of [[-5, -3, 'stall:produce'], [0, -3, 'stall:fish'], [5, -3, 'stall:produce'], [-5, 3, 'stall:fish'], [0, 3, 'stall:produce'], [5, 3, 'stall:fish']] as const)
        streetDetail(mx + dx, mz + dz, kind, '#dba876');
      chest(mx - 6.6, mz, y); chest(mx + 6.6, mz, y); chest(mx, mz - 5.4, y);
      for (const [dx, kind, weapon] of [[-4.5, 'weapon', 'm4'], [-2.5, 'armor', undefined], [-.5, 'weapon', 'smg'], [1.5, 'helmet', undefined],
        [3.5, 'weapon', 'shotgun'], [5.5, 'medkit', undefined]] as const) item(mx + dx, mz, kind, weapon, y);
      for (const dx of [-6, 6]) item(mx + dx, mz + 5, 'ammo', undefined, y);
      // Keep this freestanding board beside the approach, outside the roof eave.
      const signX = mx - w / 2 + 2.7, signZ = mz + d / 2 + 3.5;
      obj('sign', signX, ground(signX, signZ) + 1.6, signZ, 3.4, 1.29, .2, '#eccb8b', 'MERCADÃO');
    }
    for (const [x, z, kind] of [[52, -30, 'bench'], [36, -42, 'planter'], [72, -42, 'planter'], [58, -44, 'cart'], [88, -28, 'bench']] as const) streetDetail(x, z, kind, '#d6b070');
    for (const [x, z] of [[46, -44], [70, -44], [60, -60]] as const) item(x, z, 'weapon', 'm4');
    sign(28, -30, 'CENTRO');
  }

  // Porto: warehouse, container yard (legacy positions), fish houses, harbour, piers and boats.
  {
    warehouse(-70, -60, 25, 15, '#82949d');
    house(-44, -72, 9, 7, '#d3bfa0', '#685a61', 'wood', 'fisher');
    house(-54, -90, 8, 7, '#a8c1b8', '#80595b', 'wood', 'fishmonger');
    house(-92, -84, 8, 7, '#dbbc90', '#865c50', 'wood', 'workshop');
    const containerColors = ['#a94f3c', '#497ca1', '#dfad55', '#4d896c', '#c96a34'];
    for (const [x, z, along, c, stack] of [[-104, -78, 'z', 0, 1], [-86, -76, 'x', 1, 0], [-40, -84, 'z', 2, 1], [-40, -60, 'z', 3, 0],
      [-100, -50, 'z', 4, 0], [-45, -46, 'x', 0, 1], [-80, -30, 'x', 1, 0], [-68, -98, 'x', 2, 0], [-92, -38, 'z', 3, 1],
      [-54, -36, 'x', 4, 0], [-102, -66, 'z', 0, 0]] as const) {
      const [sx, sz] = along === 'x' ? [6.1, 2.44] : [2.44, 6.1], y = baseFor(x - sx / 2, z - sz / 2, x + sx / 2, z + sz / 2);
      solid(x, y + 1.3, z, sx, 2.6, sz, containerColors[c], 'metal', 'container');
      if (stack) solid(x, y + 3.9, z, sx, 2.6, sz, containerColors[(c + 2) % 5], 'metal', 'container');
    }
    for (const [x, z, kind] of [[-52, -102, 'stall:fish'], [-60, -102, 'stall:fish'], [-38, -96, 'cart'], [-58, -46, 'planter']] as const)
      streetDetail(x, z, kind, '#7db8b4');
    obj('box', -76, ground(-76, -104), -104, 26, 0, 12, '#9bb7ad', 'prop:harbor');
    // Piers reach past the shoreline into open water.
    for (const x of [-88, -76, -64]) {
      for (const z of [-114, -122, -130]) obj('box', x, .32, z, 2.6, .26, 8.1, '#8c6942', 'pier');
      for (const z of [-117, -127]) solid(x, -.2, z, .26, 2.4, .26, '#6e5137', 'wood', 'post');
    }
    for (const [x, z] of [[-82, -134], [-70, -137], [-94, -128]]) obj('boat', x, .25, z, 5.2, 1.4, 2.2, '#f1cb80', 'fishing');
    solid(-100, ground(-100, -100) + 4.8, -100, .55, 9.6, .55, '#d39c54', 'metal', 'crane');
    obj('box', -95, ground(-100, -100) + 9.3, -100, 11, .45, .5, '#d39c54', 'crane-arm');
    for (const [x, z] of [[-48, -104], [-58, -108], [-90, -106]]) { barrel(x, z); crate(x + 1.7, z); }
    item(-99, -72, 'weapon', 'shotgun');
    item(-60, -104, 'armor');
    chest(-66, -106);
    sign(-104, -32, 'PORTO');
  }

  // Posto: kiosk, forecourt canopy and pumps by the west road, truck at the kerb.
  {
    const cx = -12, cz = -28, y = ground(cx, cz);
    house(cx, -15, 10, 8, '#e9d3ad', '#ae694b', 'stone', 'kiosk');
    obj('box', cx, y, cz, 19, 0, 10, '#ecc491', 'prop:forecourt');
    obj('box', cx, y + 4.35, cz, 20, .35, 12, '#e8c496', 'canopy');
    for (const x of [cx - 8, cx + 8]) for (const z of [cz - 5, cz + 5]) solid(x, ground(x, z) + 2.1, z, .34, 4.2, .34, '#b65543', 'metal', 'canopy-post');
    for (const x of [cx - 4, cx + 4]) {
      solid(x, ground(x, cz) + .85, cz, .9, 1.7, .7, '#d4583d', 'metal', 'pump');
      obj('box', x, ground(x, cz) + 1.25, cz + .39, .54, .4, .05, '#b4d4ca', 'pump-glass');
    }
    obj('box', 3, ground(3, -22) + 1.1, -22, 5.5, 2.2, 2.3, '#86a6ab', 'truck');
    colliders.push({ id: id('truck'), min: p(.25, ground(3, -22), -23.15), max: p(5.75, ground(3, -22) + 2.2, -20.85), material: 'metal' });
    for (const x of [1.4, 4.7]) for (const z of [-23.1, -20.9]) obj('cylinder', x, ground(x, z) + .25, z, .65, .5, .65, '#343b3b', 'wheel');
    for (const [x, z, kind] of [[-22, -18, 'planter'], [-2, -12, 'bench'], [-22, -12, 'cart']] as const) streetDetail(x, z, kind, '#d6b070');
    barrel(4, -32); crate(4, -35);
    item(cx, cz + 2, 'guarana');
    sign(-24, -35, 'POSTO');
  }

  // Fazenda: barn, silo, orchard south of the farm road, fences with a road gap.
  {
    warehouse(62, 57, 16, 12, '#945a4a');
    obj('cylinder', 77, ground(77, 53) + 4, 53, 2.4, 8, 2.4, '#b2b9b9', 'silo');
    obj('sphere', 77, ground(77, 53) + 8.3, 53, 2.4, 1, 2.4, '#c6ccca', 'silo-cap');
    colliders.push({ id: id('silo'), min: p(74.6, ground(77, 53), 50.6), max: p(79.4, ground(77, 53) + 8, 55.4), material: 'metal' });
    for (const x of [48, 55, 62, 69, 76]) for (const z of [78, 84]) obj('tree', x + (random() - .5) * 1.4, ground(x, z), z, 2, 6, 2, '#708d4b', 'orchard');
    for (const z of [48, 86]) for (let x = 45.6; x < 80; x += 3.2) obj('box', x, ground(x, z) + .6, z, 2.8, .12, .13, '#9e7950', 'fence');
    for (const x of [44, 80]) for (let z = 49.6; z < 86; z += 3.2) if (z < 64 || z > 74) obj('box', x, ground(x, z) + .6, z, .13, .12, 2.8, '#9e7950', 'fence');
    for (let i = 0; i < 8; i++) {
      const s = findSpot(1.4, 1.2, 1, false, [46, 64, 78, 76]);
      if (s) solid(s.x, s.y + .6, s.z, 1.4, 1.2, 1.2, '#d8b45a', 'wood', 'hay');
    }
    item(72, 62, 'weapon', 'shotgun');
    chest(50, 62);
    sign(40, 64, 'FAZENDA');
  }

  // Morro: terraced casinhas on the south hill, a radio mast at the top.
  {
    const walls = ['#d69674', '#e4bd8b', '#a7bbab', '#dcb0a6', '#b5653e', '#efd1a6'];
    for (const lot of MORRO_LOTS) house(lot.x, lot.z, 5.2, 4.4, pick(walls), '#975c4b', 'wood', 'home', random() < .4);
    solid(16, ground(16, 100) + 7, 100, .45, 14, .45, '#b1b8b3', 'metal', 'radio-mast');
    obj('sphere', 16, ground(16, 100) + 14, 100, .55, .55, .55, '#e6ad6a', 'beacon');
    item(12, 96, 'weapon', 'sniper');
    sign(-40, 66, 'MORRO');
  }

  // Praia: thatched kiosks and parasols on the levelled north beach.
  {
    for (const x of [32, 44, 56, 68]) {
      addRoof(x, ground(x, -110) + 2.5, -110, 5.4, 1.4, 4.2, '#c49356', 'thatch');
      for (const dx of [-2.2, 2.2]) for (const dz of [-1.6, 1.6]) solid(x + dx, ground(x, -110) + 1.25, -110 + dz, .18, 2.5, .18, '#8b6842', 'wood', 'kiosk-post');
      crate(x, -110);
      obj('cone', x + 4.4, ground(x + 4.4, -119) + 2.1, -119, 1.8, .6, 1.8, pick(['#da8062', '#7aafaa', '#e5b96e']), 'umbrella');
      obj('cylinder', x + 4.4, ground(x + 4.4, -119) + 1.05, -119, .07, 2.1, .07, '#80694a', 'umbrella-pole');
    }
    obj('boat', 82, .1, -128, 5, 1.5, 2, '#d0af72', 'canoe');
    item(50, -112, 'guarana');
    chest(38, -108);
    sign(22, -104, 'PRAIA');
  }

  // Mangue: shallow water, mangroves and a boardwalk to the stilt shack.
  {
    for (let z = -98; z <= -58; z += 4) obj('box', -110, Math.max(ground(-110, z), -.05) + .12, z, 2.4, .22, 3.8, '#997850', 'boardwalk');
    for (let i = 0; i < 46; i++) {
      const x = -125 + random() * 21, z = -100 + random() * 42;
      if (Math.abs(x + 110) < 2.2) continue;
      obj('tree', x, ground(x, z), z, 1.2, 5 + random() * 4, 1.2, '#507b5a', 'mangrove');
    }
    item(-106, -57, 'bandage');
  }

  // Lagoa: rowboats on the pond, reeds on the shallow rim.
  {
    for (const [x, z] of [[-38, 3], [-29, 9], [-33, -2], [-40, 10]]) obj('boat', x, Math.max(ground(x, z), -.05) + .1, z, 4.5, 1, 1.9, '#a97c51', 'rowboat');
    for (let i = 0; i < 60; i++) {
      const x = -58 + random() * 48, z = -18 + random() * 48, y = ground(x, z);
      if (y < -.35 || y > .95) continue;
      obj('grass', x, y, z, .8, 1.6, .8, '#94a967', 'reeds');
    }
    chest(-54, 8);
    item(-16, 10, 'acai');
  }

  // Cachoeira: the cascade drops off the hill's south face into a real pool.
  {
    // A rock face on the steep south slope; the cascade spills into a basin below.
    const x = 100, top = ground(x, -19) + .4, low = ground(x, -13.5), height = Math.max(2.4, top - low);
    solid(x, low + height / 2, -16.6, 5.2, height, 1.9, '#777f76', 'stone', 'cliff');
    solid(x - 2.3, low + .65, -15.3, 1.5, 1.3, 1.5, '#798577', 'stone', 'cliff', 'rock');
    solid(x + 2.1, low + .7, -15.3, 1.3, 1.4, 1.4, '#697568', 'stone', 'cliff', 'rock');
    obj('box', x, low + height / 2, -15.6, 3.2, height, .22, '#87c2c7', 'waterfall');
    obj('box', x, low + .055, -13, 4.7, .07, 3.5, '#609b9b', 'water');
    for (const bx of [93, 97, 103, 107]) obj('box', bx, ground(bx, -9) + .16, -9, 3.7, .3, 2, '#a49b83', 'bridge-stone');
    for (const [rx, rz, size] of [[91, -24, 3.3], [110, -20, 4.4], [115, -40, 3.8], [94, -40, 2.8]] as const) {
      obj('rock', rx, ground(rx, rz) + size * .28, rz, size, size * .55, size, '#7f8583', 'cliff');
      colliders.push({ id: id('rock'), min: p(rx - size * .42, ground(rx, rz), rz - size * .42), max: p(rx + size * .42, ground(rx, rz) + size * .5, rz + size * .42), material: 'stone' });
    }
    item(108, -30, 'weapon', 'dmr');
    sign(88, -8, 'CACHOEIRA');
  }

  // Forte: stone walls with a gate, four red-capped corner towers and a keep
  // on the north headland. Long sightlines, sniper loot.
  {
    const [fx, fz] = FORTE, y = ground(fx, fz), half = 11, h = 4.4, stone = '#b8ad97';
    wallX(fx - half, fx + half, fz + half, y, h, [door(fx, 3.4)], stone, 'stone');
    wallX(fx - half, fx + half, fz - half, y, h, [door(fx + 5, 2)], stone, 'stone');
    wallZ(fz - half, fz + half, fx - half, y, h, [window(fz - 4), window(fz + 4)], stone, 'stone');
    wallZ(fz - half, fz + half, fx + half, y, h, [door(fz, 2.4)], stone, 'stone');
    for (let t = -half + 1; t < half; t += 2.2) for (const [mx, mz, sx, sz] of [[fx + t, fz - half, .9, .5], [fx + t, fz + half, .9, .5], [fx - half, fz + t, .5, .9], [fx + half, fz + t, .5, .9]] as const)
      if (Math.abs(t) > 2 || (mz === fz - half || mx === fx - half)) obj('box', mx, y + h + .3, mz, sx, .6, sz, stone, 'merlon');
    for (const [cx, cz] of [[fx - half, fz - half], [fx + half, fz - half], [fx - half, fz + half], [fx + half, fz + half]]) {
      solid(cx, y + 3.6, cz, 4, 7.2, 4, '#a89c86', 'stone', 'fort-tower');
      obj('cone', cx, y + 8.4, cz, 2.8, 2.4, 2.8, '#c2402e', 'steeple');
    }
    tower(fx, fz - 1, '#cbbd9f');
    solid(fx + 4, y + 9.5, fz + 3, .16, 6, .16, '#6e5137', 'wood', 'post');
    obj('box', fx + 5, y + 11.6, fz + 3, 1.9, 1.1, .05, '#d8392b', 'flag');
    item(fx - 6, fz + 6, 'weapon', 'sniper'); item(fx + 6, fz + 6, 'weapon', 'dmr');
    item(fx - 6, fz - 7, 'armor'); item(fx + 7, fz - 7, 'helmet'); item(fx, fz + 8, 'ammo');
    chest(fx - 8.5, fz + 8.5, y); chest(fx + 8.5, fz - 8.5, y);
    sign(fx, fz + half + 4, 'FORTE');
  }

  // Farol: a red-and-white lighthouse on the south-east hill with the keeper's hut.
  {
    const [lx, lz] = FAROL, y = ground(lx, lz);
    solid(lx, y + .6, lz, 6, 1.2, 6, '#c9c0a8', 'stone', 'plinth');
    for (let i = 0; i < 6; i++) obj('cylinder', lx, y + 2.3 + i * 2.2, lz, 2.3 - i * .12, 2.2, 2.3 - i * .12, i % 2 ? '#f4efe4' : '#d8392b', 'lighthouse');
    colliders.push({ id: id('farol'), min: p(lx - 1.2, y, lz - 1.2), max: p(lx + 1.2, y + 15.4, lz + 1.2), material: 'stone' });
    obj('box', lx, y + 14.5, lz, 3.8, .2, 3.8, '#3a3f44', 'balcony');
    obj('cylinder', lx, y + 15.4, lz, 1.4, 1.6, 1.4, '#ffe9a8', 'lamp-glass');
    obj('cone', lx, y + 16.8, lz, 1.9, 1.3, 1.9, '#d8392b', 'steeple');
    item(lx + 4, lz - 3, 'weapon', 'dmr'); item(lx - 4, lz - 3, 'armor');
    chest(lx + 3.5, lz + 3.5, y);
    sign(lx - 6, lz - 7, 'FAROL');
  }

  // Legacy cover scattered across the island: sandbags, barriers, fences, cars, ruins, crates.
  const sandbags = () => {
    const along = random() < .5, s = findSpot(along ? 3.2 : .7, along ? .7 : 3.2, 1.5);
    if (s) solid(s.x, s.y + .55, s.z, s.x1 - s.x0, 1.1, s.z1 - s.z0, '#a8966c', 'earth', 'sandbag');
  };
  const barrier = () => {
    const along = random() < .5, s = findSpot(along ? 3 : .6, along ? .6 : 3, 1.2, random() < .4);
    if (s) solid(s.x, s.y + .43, s.z, s.x1 - s.x0, .85, s.z1 - s.z0, '#d9d3c4', 'stone', 'barrier');
  };
  const fence = () => {
    const along = random() < .5, s = findSpot(along ? 4 : .12, along ? .12 : 4, 1);
    if (s) solid(s.x, s.y + .65, s.z, s.x1 - s.x0, 1.3, s.z1 - s.z0, '#9e7950', 'wood', 'fence');
  };
  const carColors = ['#d23b2c', '#2f6fbe', '#efe8d6', '#3f8a3c', '#e8b52f'];
  const car = (roadSide: boolean) => {
    let s: ReturnType<typeof findSpot> = null, along = random() < .5;
    if (roadSide) {
      const [x0, z0, x1, z1] = pick(ROADS), horizontal = x1 - x0 > z1 - z0; along = horizontal;
      for (let k = 0; k < 20 && !s; k++) {
        const x = horizontal ? x0 + 5 + random() * (x1 - x0 - 10) : x0 + 1.2 + random() * (x1 - x0 - 2.4);
        const z = horizontal ? z0 + 1.2 + random() * (z1 - z0 - 2.4) : z0 + 5 + random() * (z1 - z0 - 10);
        const w = along ? 4.3 : 1.9, d = along ? 1.9 : 4.3;
        const heights = [ground(x - w / 2, z - d / 2), ground(x + w / 2, z - d / 2),
          ground(x - w / 2, z + d / 2), ground(x + w / 2, z + d / 2)];
        if (rectClear(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 1.5) && Math.max(...heights) - Math.min(...heights) <= .35)
          s = { x, z, x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y: baseFor(x - w / 2, z - d / 2, x + w / 2, z + d / 2) };
      }
    } else s = findSpot(along ? 4.3 : 1.9, along ? 1.9 : 4.3, 1.5, false, undefined, .35);
    if (!s) return;
    const w = s.x1 - s.x0, d = s.z1 - s.z0, paint = pick(carColors);
    solid(s.x, s.y + .73, s.z, w, .78, d, paint, 'metal', 'car');
    obj('box', s.x + (along ? .2 : 0), s.y + 1.42, s.z + (along ? 0 : .2), along ? 2.2 : 1.6, .6, along ? 1.6 : 2.2, '#2a2f36', 'car-cabin');
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      const wx = s.x + (along ? a * w * .32 : b * w * .5), wz = s.z + (along ? b * d * .5 : a * d * .32);
      obj('cylinder', wx, ground(wx, wz) + .23, wz, .6, .46, .6, '#262a2b', 'wheel');
    }
  };
  const ruin = () => {
    const s = findSpot(6, .3, 2); if (!s) return;
    const a = 1.8 + random() * 1.2, ha = 1.3 + random() * 1.3, hb = 1 + random() * 1.2, paint = pick(['#e8d5b0', '#d9a07a', '#c9c0a8']);
    solid(s.x0 + a / 2, s.y + ha / 2, s.z, a, ha, .3, paint, 'stone', 'ruin');
    solid((s.x0 + a + 1.2 + s.x1) / 2, s.y + hb / 2, s.z, s.x1 - s.x0 - a - 1.2, hb, .3, paint, 'stone', 'ruin');
    solid(s.x0 + a + .6, s.y + .25, s.z, 1.2, .5, .3, paint, 'stone', 'ruin');
  };
  const crates = () => {
    const s = findSpot(2.6, 1.3, 1.5); if (!s) return;
    crate(s.x0 + .6, s.z, 1.2, s.y); crate(s.x1 - .6, s.z, 1.2, s.y);
    if (random() < .5) crate(s.x0 + .9, s.z, 1.1, s.y + 1.2);
  };
  for (let i = 0; i < 34; i++) sandbags();
  for (let i = 0; i < 22; i++) barrier();
  for (let i = 0; i < 24; i++) fence();
  for (let i = 0; i < 10; i++) car(true);
  for (let i = 0; i < 8; i++) car(false);
  for (let i = 0; i < 14; i++) ruin();
  for (let i = 0; i < 24; i++) crates();

  // Trees (legacy density, v2 models): spaced out, off roads and lots; palms by the shore.
  const planted: { x: number; z: number }[] = [];
  const nearPickup = (x: number, z: number, radius: number) =>
    loot.some(point => Math.hypot(point.x - x, point.z - z) < radius) ||
    chests.some(point => Math.hypot(point.x - x, point.z - z) < radius);
  for (let tries = 0; planted.length < 380 && tries < 9000; tries++) {
    const x = -120 + random() * 240, z = -120 + random() * 240, y = ground(x, z);
    if (y < .9 || clear(x, z, 2.5) || nearPickup(x, z, 1.2) || onRoad(x, z, 2) ||
      planted.some(t => (t.x - x) ** 2 + (t.z - z) ** 2 < 14)) continue;
    planted.push({ x, z });
    const kind = y < 2.2 || random() < .18 ? 'palm' : 'tree', scale = .75 + random() * .75;
    const height = (kind === 'palm' ? 7 + random() * 3 : 5 + random() * 3) * scale;
    obj(kind, x, y - .1, z, 1.4 * scale, height, 1.4 * scale, kind === 'palm' ? '#477348' : '#58793f', 'foliage', random() * Math.PI * 2);
    colliders.push({ id: id('trunk'), min: p(x - .22 * scale, y - .5, z - .22 * scale), max: p(x + .22 * scale, y + 3 * scale, z + .22 * scale), material: 'wood' });
  }
  for (let i = 0, n = 0; i < 260 && n < 70; i++) {
    const x = -118 + random() * 236, z = -118 + random() * 236, y = ground(x, z);
    if (y < .5 || clear(x, z, 2.5) || nearPickup(x, z, 2.5) || onRoad(x, z, 1.5)) continue;
    const sx = 1 + random() * 1.6, sy = .7 + random() * 1.1, sz = 1 + random() * 1.4; n++;
    obj('rock', x, y + sy * .3, z, sx, sy, sz, '#8b8b7f', 'field', random() * Math.PI);
    colliders.push({ id: id('rock'), min: p(x - sx * .62, y - .5, z - sz * .62), max: p(x + sx * .62, y + sy * 1.1, z + sz * .62), material: 'stone' });
  }
  for (let i = 0; i < 145; i++) {
    const x = -123 + random() * 246, z = -123 + random() * 246;
    if (ground(x, z) < .4 || clear(x, z, 1.4) || onRoad(x, z, .5)) continue;
    const s = .35 + random() * 1.1;
    obj('grass', x, ground(x, z), z, s, s * 1.1, s, '#a2a46b', 'tuft');
  }
  for (const [x0, z0, x1, z1] of ROADS) {
    const horizontal = x1 - x0 > z1 - z0;
    for (let t = 12; t < (horizontal ? x1 - x0 : z1 - z0) - 6; t += 26) {
      const x = horizontal ? x0 + t : x1 + 1.2, z = horizontal ? z1 + 1.2 : z0 + t;
      if (!clear(x, z, 1)) obj('lamp', x, ground(x, z), z, .16, 4.4, .16, '#c1ab78', 'street');
    }
  }

  // Spawns: Correria points spread over the arena, battle royale rings around districts.
  const safe = (x: number, z: number) => ground(x, z) > .8 && !clear(x, z, 1.25);
  const dm: { x: number; z: number }[] = [];
  for (let i = 0; i < 600 && dm.length < 24; i++) {
    const x = ARENA.minX + 6 + random() * (ARENA.maxX - ARENA.minX - 12), z = ARENA.minZ + 6 + random() * (ARENA.maxZ - ARENA.minZ - 12);
    if (!safe(x, z) || dm.some(s => Math.hypot(s.x - x, s.z - z) < 12)) continue;
    dm.push({ x, z });
    spawns.push({ x, y: ground(x, z), z, mode: 'deathmatch', yaw: Math.atan2(-(ARENA_CENTER.x - x), -(ARENA_CENTER.z - z)) });
  }
  for (const d of districts) for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, radius = d.radius * .75;
    const x = Math.round(d.x + Math.cos(a) * radius), z = Math.round(d.z + Math.sin(a) * radius);
    if (safe(x, z)) spawns.push({ x, y: ground(x, z), z, mode: 'battle-royale', yaw: a + Math.PI });
  }
  for (let i = 0, n = 0; i < 400 && n < 80; i++) {
    const x = Math.round(-115 + random() * 230), z = Math.round(-115 + random() * 230);
    if (!safe(x, z) || districts.some(d => Math.hypot(x - d.x, z - d.z) < d.radius * .45)) continue;
    n++;
    const kind = random() < .22 ? 'weapon' : pick(['ammo', 'bandage', 'rapadura', 'armor', 'guarana'] as const);
    item(x, z, kind, pick(['m4', 'pistol', 'smg'] as const));
  }
  return { version: WORLD_VERSION, size: 260, colliders, objects, spawns, loot, chests, districts };
}
