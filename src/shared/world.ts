import { rng } from './math';
import { terrainHeight } from './terrain';
import { ARENA, ARENA_CENTER, BRIDGES, CHURCH, FAROL, FORTE, HOUSES, MERCADAO, MORRO_LOTS, PLAZA, ROADS, inArena, riverDistance, riverSample, routeDistance } from './layout';
import { KIT_PIECES, kitColliders } from './kit-collision';
import { SIGN_ART } from './signage';
import { buildNavigation, walkableHeight, walkableSegment } from './navigation';
import { WORLD_VERSION, type ChestSpec, type Collider, type District, type KitPlacement, type LootSpawn, type MapObject, type SpawnPoint, type Vec3, type WeaponId, type WorldSpec } from './types';

const ground = terrainHeight;
const p = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export function createWorld(): WorldSpec {
  const random = rng(0x51a7cafe);
  const pieces: KitPlacement[] = [], objects: MapObject[] = [], colliders: Collider[] = [], walkways: Collider[] = [];
  const loot: LootSpawn[] = [], chests: ChestSpec[] = [], spawns: SpawnPoint[] = [], arenaBoundary: string[] = [];
  const districts: District[] = [
    { id: 'forte', name: 'Forte', x: 4, z: -99, radius: 25, color: '#c47c57' },
    { id: 'vila', name: 'Vila', x: -22, z: -18, radius: 32, color: '#e39973' },
    { id: 'centro', name: 'Centro', x: 29, z: -20, radius: 25, color: '#c59aaa' },
    { id: 'morro', name: 'Morro', x: -87, z: -53, radius: 29, color: '#c88465' },
    { id: 'cachoeira', name: 'Cachoeira', x: -104, z: -8, radius: 19, color: '#7db7bd' },
    { id: 'porto', name: 'Porto', x: 97, z: -9, radius: 25, color: '#638caf' },
    { id: 'praia', name: 'Praia', x: -26, z: 104, radius: 30, color: '#e9c47d' },
    { id: 'farol', name: 'Farol', x: 3, z: 113, radius: 14, color: '#d86c53' },
    { id: 'mangue', name: 'Mangue', x: 101, z: 52, radius: 22, color: '#617c56' },
    { id: 'fazenda', name: 'Fazenda', x: 62, z: 63, radius: 25, color: '#d7b671' },
    { id: 'posto', name: 'Posto', x: -22, z: 43, radius: 16, color: '#e6a34f' },
    { id: 'lagoa', name: 'Lagoa', x: -76, z: 11, radius: 15, color: '#77a5a0' },
  ];
  let sequence = 0;
  const id = (prefix: string) => `${prefix}-${++sequence}`;
  const obj = (kind: MapObject['kind'], x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, detail: string, rotation = 0) => {
    objects.push({ id: id(detail), kind, pos: p(x, y, z), scale: p(sx, sy, sz), color, detail, rotation });
  };
  const place = (piece: string, x: number, z: number, yaw = 0, scale = 1, y = ground(x, z), label = piece) => {
    const instance: KitPlacement = { id: id(`kit-${label}`), piece, x, y, z, yaw, ...(scale === 1 ? {} : { scale }) };
    pieces.push(instance);
    const shapes = kitColliders(instance);
    colliders.push(...shapes);
    if (piece === 'bridge_stone' || piece === 'dock_wood')
      walkways.push(...shapes.filter(c => c.max.y - c.min.y < .7 * scale && c.max.x - c.min.x > 2 && c.max.z - c.min.z > 2));
    return instance;
  };
  // Optional pieces are supplied by the same Blender manifest as the core kit.
  // A missing dressing piece is omitted, never replaced by invisible collision.
  const detail = (piece: string, x: number, z: number, yaw = 0, scale = 1, y = ground(x, z)) =>
    KIT_PIECES[piece] ? place(piece, x, z, yaw, scale, y) : null;
  const sign = (x: number, z: number, label: string) => {
    if (SIGN_ART.some(art => art.label === label)) obj('sign', x, ground(x, z) + 1.6, z, 3.8, 1.2, .16, '#eccb8b', label);
  };
  const roadAt = (x: number, z: number, margin = 0) => ROADS.some(([x0, z0, x1, z1]) =>
    x > x0 - margin && x < x1 + margin && z > z0 - margin && z < z1 + margin);
  const occupied = (x: number, z: number, margin: number) => colliders.some(c =>
    x > c.min.x - margin && x < c.max.x + margin && z > c.min.z - margin && z < c.max.z + margin);
  const pavement = (x: number, z: number, width: number, depth: number, color = '#d5c1a0') => {
    const y = ground(x, z);
    obj('box', x, y + .026, z, width, .035, depth, color, 'courtyard');
    // Broad stone courses and a double border keep the plaza legible at a distance.
    for (let xx = x - width / 2 + 1; xx < x + width / 2; xx += 2)
      obj('box', xx, y + .047, z, .035, .012, depth - .25, '#a69b85', 'paving-joint');
    for (let zz = z - depth / 2 + 1; zz < z + depth / 2; zz += 2)
      obj('box', x, y + .048, zz, width - .25, .012, .035, '#ac9f87', 'paving-joint');
    for (const side of [-1, 1]) {
      obj('box', x + side * (width / 2 - .18), y + .055, z, .22, .06, depth, '#f0dfbb', 'paving-trim');
      obj('box', x, y + .055, z + side * (depth / 2 - .18), width, .06, .22, '#f0dfbb', 'paving-trim');
    }
  };

  // Vila: narrow side streets open onto a church square and a covered market.
  for (const h of [...HOUSES, ...MORRO_LOTS]) {
    const y = ground(h.x, h.z);
    place(h.piece, h.x, h.z, h.yaw ?? 0, 1, y, h.role);
    // Furnish the wall bays, preserving the opposing doors and the tall-house stair.
    if (h.piece === 'house_tall') {
      detail('interior_counter', h.x + h.w / 2 - 1.7, h.z - h.d / 2 + .75, 0, 1, y + .11);
      detail('bed', h.x + h.w / 2 - 1.15, h.z + .8, 0, 1, y + .11);
    } else {
      detail('interior_counter', h.x - h.w / 2 + .75, h.z - .4, Math.PI / 2, 1, y + .11);
      if (['home', 'fisher', 'clinic'].includes(h.role)) detail('bed', h.x + h.w / 2 - 1.15, h.z + .5, 0, 1, y + .11);
      else detail('bench', h.x + h.w / 2 - .7, h.z + .1, Math.PI / 2, 1, y + .11);
    }
  }
  const shopNames = { bakery: 'PADARIA', cafe: 'CAFÉ DA VILA', tailor: 'ATELIÊ', fishmonger: 'PEIXE FRESCO', workshop: 'OFICINA', kiosk: 'ARMAZÉM', home: 'BOM DIA', fisher: 'PEIXE FRESCO', clinic: 'CAPIVARAS' };
  for (const [index, h] of [...HOUSES, ...MORRO_LOTS].entries()) {
    const y = ground(h.x, h.z);
    obj('box', h.x + h.w / 2 + .16, y + 1.75, h.z - .5, 1, 1, 1, '#FFFFFF', `prop:street-panel:${shopNames[h.role]}`, Math.PI / 2);
    if (index % 2 === 0) obj('box', h.x, y, h.z + h.d / 2 + 1.25, 1, 1, 1, '#FFFFFF', 'prop:street-laundry');
    if (index % 3 === 0) obj('box', h.x + h.w / 2 + 1.15, y, h.z + 1.1, 1, 1, 1,
      index % 2 ? '#BD765A' : '#65A29C', 'prop:street-bike', Math.PI / 2);
    for (const side of [-1, 1]) {
      const x = h.x + side * (h.w / 2 + .75), z = h.z + h.d / 2 + 1;
      if (!occupied(x, z, .6) && !roadAt(x, z, .5)) detail('planter', x, z, 0, .8);
    }
  }
  for (const [x, z, yaw] of [[-36, -38, Math.PI / 2], [20, -38, Math.PI / 2], [52, -38, Math.PI / 2],
    [4, -60, 0], [4, -3, 0], [-40, -4, 0], [44, 10, 0], [-30, 49, 0], [16, 33, Math.PI / 2],
    [82, -23, 0], [-30, 100, Math.PI / 2], [36, 100, Math.PI / 2], [-97, -55, 0]] as const)
    obj('box', x, ground(x, z), z, 1, 1, 1, '#FFFFFF', 'prop:street-lights', yaw);
  place('church', ...CHURCH);
  place('market_hall', ...MERCADAO);
  pavement(...PLAZA, 18, 17);
  pavement(...MERCADAO, 18, 14, '#cdb790');
  detail('fountain', PLAZA[0], PLAZA[1]);
  for (const [x, z] of [[-17, -24], [-3, -18], [-17, -17], [35, -10]] as const) detail('bench', x, z);
  for (const [x, z] of [[-19, -28], [-1, -28], [-19, -13], [-1, -13], [21, -10], [37, -10]] as const) detail('planter', x, z);
  for (const [x, z] of [[-19, -30], [-1, -30], [-19, -11], [1, -14], [20, -10], [39, -11]] as const) detail('lamp_post', x, z);
  for (const [x, z] of [[24, -23], [34, -23], [24, -16], [34, -16], [-34, 39]] as const) detail('market_stall', x, z);
  sign(-40, -41, 'VILA'); sign(39, -9, 'MERCADÃO'); sign(-21, 37, 'POSTO');
  // Three crossings have a continuous deck level with the banks.
  for (const [x, z] of BRIDGES) place('bridge_stone', x, z, 0, 1, 1.75);
  for (let x = -51; x < 57; x += 4) {
    if (BRIDGES.some(([bx]) => Math.abs(x - bx) < 6)) continue;
    const sample = riverSample(x, 10);
    for (const side of [-1, 1]) {
      const z = sample.z + side * (sample.width / 2 + 5.4);
      if (KIT_PIECES.river_wall) detail('river_wall', x, z, 0, .5, ground(x, z) - .12);
      else place('fort_wall', x, z, 0, .42, ground(x, z) - .2, 'river-wall');
    }
  }
  for (const [x, z] of [[-29, 7], [19, 13], [55, 25]] as const) {
    detail('boat', x, z, Math.PI / 2, .8, -.15);
    if (!KIT_PIECES.boat) obj('boat', x, .05, z, 4.2, 1.1, 1.7, '#e6c17d', 'fishing');
  }
  for (let x = -78; x <= 78; x += 7) {
    if (BRIDGES.some(([bx]) => Math.abs(bx - x) < 5)) continue;
    const river = riverSample(x, 10);
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      const xx = x + i * .55, z = river.z + side * (river.width / 2 + 2.8 + Math.sin(x + i) * .4), y = ground(xx, z);
      if (y < -.2 || occupied(xx, z, .35) || roadAt(xx, z, .5)) continue;
      obj('grass', xx, y, z, 1, 1.2 + i * .18, 1, '#709A63', 'reeds');
    }
  }
  // Entry markers sit beside open routes, so the warning has visible context.
  for (const [x, z, yaw] of [
    [-48, ARENA.minZ, 0], [-32, ARENA.minZ, 0], [-16, ARENA.minZ, 0], [21, ARENA.minZ, 0], [38, ARENA.minZ, 0], [54, ARENA.minZ, 0],
    [-49, ARENA.maxZ, 0], [-13, ARENA.maxZ, 0], [7, ARENA.maxZ, 0], [27, ARENA.maxZ, 0], [46, ARENA.maxZ, 0],
    [ARENA.minX, -49, Math.PI / 2], [ARENA.minX, -25, Math.PI / 2], [ARENA.minX, 18, Math.PI / 2], [ARENA.minX, 44, Math.PI / 2],
    [ARENA.maxX, -48, Math.PI / 2], [ARENA.maxX, -17, Math.PI / 2], [ARENA.maxX, 39, Math.PI / 2], [ARENA.maxX, 51, Math.PI / 2],
  ]) {
    if (occupied(x, z, 2.5)) continue;
    const piece = KIT_PIECES.fence ? 'fence' : 'fort_wall';
    const placed = place(piece, x, z, yaw, piece === 'fence' ? 1 : .5, ground(x, z), 'arena');
    arenaBoundary.push(placed.id);
  }

  // Forte: red-capped towers frame two open gates above a crescent beach.
  const [fx, fz] = FORTE, fortY = ground(fx, fz);
  for (const side of [-1, 1]) {
    for (const dx of [-8, 8]) place('fort_wall', fx + dx, fz + side * 12, 0, 1, fortY);
    for (const dz of [-8, 0, 8]) if (!(side === 1 && dz === 8)) place('fort_wall', fx + side * 12, fz + dz, Math.PI / 2, 1, fortY);
  }
  for (const dx of [-12, 12]) for (const dz of [-12, 12]) place('fort_tower', fx + dx, fz + dz, 0, 1, fortY);
  detail('fort_gate', fx, fz + 12, 0, 1, fortY);
  detail('fort_gate', fx, fz - 12, 0, 1, fortY);
  place('house_tall', fx, fz - 2, 0, 1, fortY);
  pavement(fx, fz + 5, 13, 10, '#c9b994');
  for (const [x, z, scale] of [[66, -111, .48], [58, -119, .36]] as const)
    detail('cliff_rock_low', x, z, 0, scale, ground(x, z) - .35);
  detail('boat', 48, -108, Math.PI / 2, 1.2, ground(48, -108) - .18);
  if (!KIT_PIECES.boat) obj('boat', 48, ground(48, -108) + .2, -108, 7.2, 2, 2.9, '#9c7660', 'wreck');
  for (const [x, z] of [[57, -116], [65, -102], [35, -116]] as const) {
    obj('cylinder', x, ground(x, z) + .045, z, 3.1, .07, 2.4, '#82b6ad', 'water');
    for (const dx of [-2, 2]) detail('cliff_rock_low', x + dx, z, 0, .28, ground(x + dx, z) - .3);
  }
  const rockLayer = (piece: string, x: number, z: number, yaw: number, bottom: number, height: number) => {
    const definition = KIT_PIECES[piece]; if (!definition) return;
    const scale = height / definition.height;
    if (routeDistance(x, z) < Math.min(...definition.footprint) * scale * .45 + 1.5) return;
    place(piece, x, z, yaw, scale, bottom);
  };
  if (KIT_PIECES.cliff_rock_tall && KIT_PIECES.cliff_ledge && KIT_PIECES.cliff_rock_low) {
    // Interlocking tall faces, projecting ledges and low toe boulders conceal
    // the heightfield skirt while the fort and its two approach ramps stay clear.
    for (const [index, [x, z, yaw]] of [
      [24, -109, Math.PI / 2], [24, -99, Math.PI / 2], [24, -88, Math.PI / 2],
      [-16, -109, -Math.PI / 2], [-16, -99, -Math.PI / 2], [-16, -88, -Math.PI / 2],
      [-7, -119, Math.PI], [4, -119, Math.PI], [15, -119, Math.PI], [-11, -79, 0], [19, -79, 0],
    ].entries()) {
      const ox = Math.sin(yaw), oz = Math.cos(yaw);
      const height = 10.2 + index % 4 * 1.05, twist = Math.sin(index * 2.7 + .4) * .22;
      rockLayer('cliff_rock_tall', x, z, yaw + twist, fortY - .38 - height, height);
      rockLayer('cliff_ledge', x + ox * 3.4 + Math.cos(index) * .8, z + oz * 3.4,
        yaw - twist * .7, 2.1 + index % 2 * 1.5, 4 + index % 3 * .65);
      rockLayer('cliff_rock_low', x + ox * (6.5 + index % 2 * .6), z + oz * (6.5 + index % 2 * .6),
        yaw - .24 + index % 3 * .21, -.1 + index % 2 * .2, 2.2 + index % 4 * .4);
    }
    // These skins finish below the supported summit road; their solids are
    // inside the steep headland face, leaving both gate approaches above them.
    place('cliff_rock_tall', 19, -79, .23, 12.1 / KIT_PIECES.cliff_rock_tall.height, fortY - 12.5);
    place('cliff_rock_tall', 25, -93, Math.PI / 2 - .24, 11.3 / KIT_PIECES.cliff_rock_tall.height, fortY - 11.7);
    for (const [x, z, scale] of [[28, -106, .95], [30, -97, .8], [23, -76, .85], [-20, -93, .9], [-9, -122, .8], [14, -122, .75]])
      detail('cliff_rock', x, z, 0, scale, ground(x, z) - 2.7 * scale);
    for (const [x, z, bottom, scale] of [[28, -101, .6, 1.85], [25, -91, 2.3, 1.5], [17, -77, 3, 1.6]])
      detail('cliff_rock', x, z, 0, scale, bottom);
  }
  for (const [x, z] of [[50, -96], [43, -110], [64, -111]] as const) {
    obj('cylinder', x, ground(x, z) + .045, z, 4.7, .05, 3.3, '#69B9AD', 'water');
    for (const [dx, dz, scale] of [[-2.2, -.9, .28], [1.9, -1, .33], [-1.7, 1.2, .22], [1.8, 1.1, .25]])
      detail('cliff_rock_low', x + dx, z + dz, Math.PI / 2, scale, ground(x + dx, z + dz) - .3);
  }
  for (const [x, z] of [[54, -92], [43, -104], [61, -113], [-29, 118], [32, 118], [119, -7], [119, 9]] as const) {
    for (let i = 0; i < 3; i++) {
      const xx = x + i * .42, zz = z + i * .35;
      obj('box', xx, ground(xx, zz) + .07, zz, 1.4 + i * .55, .14, .16 + i * .025, '#92704D', 'crate', -.45 + i * .57);
    }
    for (let i = 0; i < 8; i++) {
      const along = (i - 3.5) * .32;
      obj('box', x + 2.6 + along, ground(x + 2.6 + along, z) + .025, z, .018, .015, 2.5, '#C1AD7C', 'net-rope');
      obj('box', x + 2.6, ground(x + 2.6, z + along) + .035, z + along, 2.5, .015, .018, '#AD9766', 'net-rope');
    }
  }
  for (const [x, z] of [[38, -88], [45, -92], [56, -102], [69, -102], [55, -115], [33, -114],
    [-50, 112], [-39, 119], [-21, 115], [19, 116], [39, 112]])
    obj('grass', x, ground(x, z), z, 4.2, .38, 3.5, '#A7B876', 'dune-grass');
  sign(21, -82, 'FORTE');

  // Porto: an open warehouse court, stacked containers and piers out to sea.
  if (KIT_PIECES.warehouse) detail('warehouse', 100, -12);
  else place('market_hall', 100, -12, 0, 1, ground(100, -12), 'warehouse');
  for (const [x, z, yaw, stack] of [[90, -29, 0, 0], [103, -29, 0, 1], [113, -18, Math.PI / 2, 1],
    [90, 1, Math.PI / 2, 0], [113, 3, Math.PI / 2, 0], [101, 13, 0, 1]] as const) {
    const y = ground(x, z); place('container', x, z, yaw, 1, y);
    if (stack) place('container', x, z, yaw, 1, y + KIT_PIECES.container.height);
  }
  for (const z of [-22, -7, 9]) for (const x of [120, 130]) place('dock_wood', x, z, Math.PI / 2, 1, 1.08);
  detail('boat', 125, -15, Math.PI / 2, 1.1, -.05);
  detail('boat', 128, 2, Math.PI / 2, .9, -.05);
  for (const [x, z] of [[122, -14], [124, -13], [126, -14], [125, 3], [127, 4], [129, 3]])
    obj('box', x, .02, z, 1, 1, 1, '#DB8263', 'prop:street-buoy');
  detail('crane', 113, -29);
  sign(78, -28, 'PORTO');

  // Fazenda and Morro retain warm, recognisable silhouettes above the valley.
  if (KIT_PIECES.barn) detail('barn', 71, 57);
  else place('market_hall', 71, 57, 0, .85, ground(71, 57), 'barn');
  detail('windmill', 83, 48); detail('radio_mast', -104, -78);
  for (let x = 46; x <= 69; x += 3) {
    obj('box', x, ground(x, 70) + .025, 70, .8, .04, 8, '#b48d57', 'field-row');
    for (let z = 67; z <= 73; z += 2) obj('grass', x, ground(x, z), z, .7, .4, .7, '#b0cc5e', 'crop');
  }
  sign(49, 79, 'FAZENDA'); sign(-91, -33, 'MORRO');

  // Long southern beach and a lighthouse at the final cape.
  for (const x of [-45, -30, -14, 25, 40]) {
    if (KIT_PIECES.beach_kiosk) detail('beach_kiosk', x, 109);
    else place('house_small', x, 109, 0, .7, ground(x, 109), 'beach-kiosk');
    for (const dx of [-3, 3]) {
      obj('cone', x + dx, ground(x + dx, 117) + 2, 117, 2.8, .65, 2.8, dx < 0 ? '#e89a78' : '#83bcb1', 'umbrella');
      obj('cylinder', x + dx, ground(x + dx, 117) + 1, 117, .06, 2, .06, '#a8865e', 'umbrella-pole');
      obj('box', x + dx, ground(x + dx, 115), 115, 1, 1, 1, dx < 0 ? '#D68870' : '#71AAA2', 'prop:street-towel', dx * .09);
    }
  }
  if (KIT_PIECES.lighthouse) detail('lighthouse', ...FAROL);
  else place('fort_tower', ...FAROL, 0, 1.5);
  sign(-42, 92, 'PRAIA'); sign(13, 107, 'FAROL');

  // Water falls from the western ridge into the river's blue-green feeder pool.
  const cascadeX = -109, cascadeZ = -9, low = -.05, top = Math.max(9, ground(-114, -15));
  obj('box', cascadeX, (top + low) / 2, cascadeZ, 6, top - low, .22, '#87c2c7', 'waterfall', Math.PI / 2);
  detail('cliff_rock_tall', -112, -15, Math.PI / 2, 1.2, ground(-112, -15) - 4.5);
  detail('cliff_ledge', -112, -3, Math.PI / 2, 1.1, ground(-112, -3) - 2);
  sign(-86, -15, 'MIRANTE');
  // Boardwalks offer a dry second route around the estuary.
  for (const x of [91, 101, 111]) place('dock_wood', x, 52, Math.PI / 2, 1, .32);
  sign(90, 65, 'MANGUE');
  if (KIT_PIECES.cliff_rock_low && KIT_PIECES.cliff_rock_tall) {
    let formations = 0;
    for (let z = -116; z <= 116 && formations < 52; z += 8) for (let x = -116; x <= 116 && formations < 52; x += 8) {
      if (x > -38 && x < 43 && z < -68) continue;
      if (Math.hypot(x - 60, z + 86) < 9) continue;
      const y = ground(x, z), dx = ground(x + 2, z) - ground(x - 2, z), dz = ground(x, z + 2) - ground(x, z - 2);
      const slope = Math.hypot(dx, dz) / 4;
      if (y < 1 || slope < .8 || routeDistance(x, z) < 5.5 || roadAt(x, z, 4) || occupied(x, z, 2.4)) continue;
      const piece = slope > 1.25 ? 'cliff_rock_tall' : 'cliff_rock_low', height = slope > 1.25 ? 7 : 3.8;
      const yaw = Math.round(Math.atan2(-dx, -dz) / (Math.PI / 2)) * Math.PI / 2;
      rockLayer(piece, x, z, yaw, y - height * .7, height); formations++;
    }
  }

  // Offshore silhouettes supply a second and third landscape layer. They are
  // scenery beyond the ocean current, with no hidden collision in the sea.
  for (const [x, z, width, height, depth, color] of [
    [-164, -253, 112, 72, 91, '#648176'], [-117, -284, 74, 106, 69, '#6B827F'],
    [-72, -265, 89, 63, 72, '#728A80'], [-45, -323, 102, 116, 81, '#819598'],
    [21, -310, 97, 74, 88, '#8B9D99'], [62, -347, 72, 100, 72, '#8B9B9E'],
    [225, -151, 106, 59, 84, '#718A7D'], [277, -174, 87, 89, 66, '#809597'],
    [293, -117, 107, 49, 91, '#83988D'], [243, 184, 116, 51, 79, '#6D887B'],
    [288, 206, 78, 81, 68, '#839697'], [-219, 163, 91, 47, 69, '#6F8980'],
  ] as const) obj('rock', x, height / 2 - 8, z, width, height, depth, color, 'distant-island', .2);

  // Planting frames the facades while the doors retain a wide central aisle.
  for (const h of [...HOUSES, ...MORRO_LOTS]) {
    for (const side of [-1, 1]) {
      const flowers = KIT_PIECES.flower_bed;
      const x = h.x + side * (1.4 + (flowers?.footprint[0] ?? 2.4) / 2), z = h.z + h.d / 2 + 1.7;
      if (!roadAt(x, z, 1) && !occupied(x, z, .5)) detail('flower_bed', x, z);
    }
    if (h.role === 'home' || h.role === 'fisher') {
      const x = h.x - h.w / 2 - 2, z = h.z - 1;
      if (!roadAt(x, z, 1) && !occupied(x, z, .8)) detail('bush_cluster', x, z, 0, .85);
    }
  }
  for (const [x, z, yaw] of [[-20, -28, Math.PI / 2], [-20, -15, Math.PI / 2], [0, -28, Math.PI / 2],
    [0, -15, Math.PI / 2], [-17, -31, 0], [-3, -31, 0], [20, -11, 0], [38, -11, 0]] as const)
    if (!occupied(x, z, 1)) detail('hedge', x, z, yaw);
  for (let x = -48; x <= 52; x += 12) {
    const sample = riverSample(x, 10);
    for (const side of [-1, 1]) {
      const z = sample.z + side * (sample.width / 2 + 8.4);
      if (BRIDGES.some(([bx]) => Math.abs(x - bx) < 6) || occupied(x, z, 1.4) || roadAt(x, z, 1.2)) continue;
      detail('bench', x, z, side > 0 ? 0 : Math.PI);
      detail('planter', x + 2.3, z);
      detail('bush_cluster', x - 2.4, z, 0, .8);
    }
  }
  for (const [x, z] of [[23, -91], [29, -107], [40, -116], [66, -105], [-107, -28], [-114, -14],
    [-75, -77], [-64, -55], [-70, 71], [-52, 91], [15, 113], [80, 40]] as const) {
    if (occupied(x, z, 3) || routeDistance(x, z) < 4) continue;
    detail('cliff_rock_low', x, z, 0, .7, ground(x, z) - .6);
    detail('cliff_rock_low', x + 2.2, z + 1.5, Math.PI / 2, .4, ground(x + 2.2, z + 1.5) - .35);
    detail('bush_cluster', x - 1.5, z + 1.7, 0, 1.1);
    detail('flower_bed', x + 1.7, z - 1.9, 0, .7);
  }

  // Supplies sit in working groups beside routes, with a low side prop and
  // an occasional stack that breaks eye-level sightlines across open ground.
  let coverGroups = 0;
  const coverGroup = (x: number, z: number) => {
    if (occupied(x, z, 2.6) || roadAt(x, z, 2.4) || routeDistance(x, z) < 3) return false;
    const y = ground(x, z);
    if (Math.max(Math.abs(ground(x + 1.6, z + .6) - y), Math.abs(ground(x - .9, z + 1.4) - y)) > .2) return false;
    place('crate', x, z);
    place('crate', x + 1.4, z + .4, Math.PI / 2, .75);
    const side = KIT_PIECES.barrel ? 'barrel' : 'crate';
    place(side, x - .9, z + 1.4, 0, side === 'barrel' ? .9 : .65);
    if (coverGroups++ % 2 === 0) place('crate', x + .1, z, Math.PI / 2, .65, y + KIT_PIECES.crate.height);
    return true;
  };
  for (const [x, z] of [[-35, -18], [-25, -18], [17, -25], [43, -30], [-36, 48], [-4, 36], [19, 41],
    [52, 48], [-49, -48], [12, -49], [7, -88], [12, -105], [89, -6], [108, 20]] as const) coverGroup(x, z);
  for (let i = 0, placed = 0; i < 2200 && placed < 28; i++) {
    const x = Math.round(-111 + random() * 222), z = Math.round(-113 + random() * 226);
    const y = ground(x, z), route = routeDistance(x, z);
    if (y < .85 || route < 3 || route > 14) continue;
    if (Math.abs(ground(x + 1, z) - ground(x - 1, z)) > .4 || Math.abs(ground(x, z + 1) - ground(x, z - 1)) > .4) continue;
    if (coverGroup(x, z)) placed++;
  }
  // Plants are decorative, with no independently authored trunk boxes.
  const planted: PointLike[] = [];
  const blocksHeroView = (x: number, z: number) => [[-1, -10, -10, -40, 4.8], [60, -86, 4, -99, 4.2]].some(([ax, az, bx, bz, width]) => {
    const dx = bx - ax, dz = bz - az, t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz);
    return t >= 0 && t <= 1 && Math.hypot(x - ax - dx * t, z - az - dz * t) < width;
  });
  const paved = (x: number, z: number) => objects.some(o => o.detail === 'courtyard' &&
    Math.abs(x - o.pos.x) < o.scale.x / 2 + 1.4 && Math.abs(z - o.pos.z) < o.scale.z / 2 + 1.4);
  const tree = (x: number, z: number, height: number, kind: 'tree' | 'palm' = 'tree', species = 'foliage') => {
    obj(kind, x, ground(x, z) - .08, z, 1.1, height, 1.1, '#5FA544', species, random() * Math.PI * 2);
    planted.push({ x, z });
  };
  tree(-20, -21, 8.4, 'tree', 'ipe-yellow'); tree(47, -31, 8, 'tree', 'ipe-pink');
  tree(-63, -55, 9.2, 'tree', 'flamboyant'); tree(77, 78, 4.8, 'tree', 'banana'); tree(-60, 84, 5.2, 'tree', 'banana');
  // Low, broad crowns at the rock toes give the escarpment a living foreground.
  // They share the existing instanced foliage and replace part of the scatter.
  let shrubs = 0;
  for (const rock of pieces.filter(piece => piece.piece.startsWith('cliff_'))) {
    if (shrubs >= 54) break;
    const [width, depth] = KIT_PIECES[rock.piece].footprint, size = rock.scale ?? 1;
    for (const side of [-1, 1]) {
      const x = rock.x + side * (width * size / 2 + .7), z = rock.z + depth * size * .28, y = ground(x, z);
      if (y < .7 || occupied(x, z, .35) || roadAt(x, z, 1) || routeDistance(x, z) < 2.5 ||
        Math.abs(ground(x + 1, z) - y) > 1 || blocksHeroView(x, z)) continue;
      tree(x, z, 1.15 + random() * .55); shrubs++;
    }
  }
  for (const x of [45, 52, 59, 66, 73]) for (const z of [83, 89]) tree(x, z, 5.5, 'tree', 'orchard');
  for (let i = 0; i < 34; i++) {
    const x = 84 + random() * 35, z = 40 + random() * 29;
    if (occupied(x, z, 1) || routeDistance(x, z) < 2.5) continue;
    tree(x, z, 4.5 + random() * 3, 'tree', 'mangrove');
  }
  for (const [gx, gz] of [[-110, -85], [-88, -85], [-69, -88], [-45, -77], [-28, -79], [34, -65],
    [48, -77], [67, -65], [-111, -25], [-73, 39], [-69, 61], [80, 85], [29, 87], [73, 98], [-72, 96]]) {
    for (let i = 0; i < 10; i++) {
      const angle = i * 2.4, radius = 1.7 + Math.sqrt(i) * 2.1;
      const x = gx + Math.cos(angle) * radius, z = gz + Math.sin(angle) * radius, y = ground(x, z);
      if (y < .8 || occupied(x, z, 3) || roadAt(x, z, 2) || routeDistance(x, z) < 3 || paved(x, z) || blocksHeroView(x, z) ||
        planted.some(t => Math.hypot(t.x - x, t.z - z) < 3.4)) continue;
      tree(x, z, 7.3 + random() * 3.4, y < 1.4 ? 'palm' : 'tree');
    }
  }
  for (let i = 0; i < 7000 && planted.length < 360; i++) {
    const x = -123 + random() * 246, z = -122 + random() * 244, y = ground(x, z);
    if (y < .6 || occupied(x, z, 2.8) || roadAt(x, z, 2) || routeDistance(x, z) < 2.6 ||
      riverDistance(x, z) < 3 || paved(x, z) || blocksHeroView(x, z) || planted.some(t => (t.x - x) ** 2 + (t.z - z) ** 2 < 20)) continue;
    const palm = y < 2 || z > 94 || (x > 25 && z < -85) || random() < .12;
    tree(x, z, (palm ? 7 : 5.5) + random() * 3, palm ? 'palm' : 'tree');
  }
  for (let i = 0; i < 160; i++) {
    const x = -120 + random() * 240, z = -120 + random() * 240, y = ground(x, z);
    if (y < .3 || occupied(x, z, 1) || roadAt(x, z, .5) || routeDistance(x, z) < 1.5) continue;
    obj('grass', x, y, z, .5, .4, .5, '#9CC756', 'tuft');
  }
  for (const [x0, z0, x1, z1] of ROADS) {
    const horizontal = x1 - x0 > z1 - z0;
    for (let along = 9; along < (horizontal ? x1 - x0 : z1 - z0) - 4; along += 18) {
      const x = horizontal ? x0 + along : x1 + 1, z = horizontal ? z1 + 1 : z0 + along;
      if (occupied(x, z, .8)) continue;
      if (!detail('lamp_post', x, z)) obj('lamp', x, ground(x, z), z, .12, 4.2, .12, '#c1ab78', 'street');
    }
  }

  const world: WorldSpec = { version: WORLD_VERSION, size: 260, pieces, colliders, walkways, objects, spawns, loot, chests, districts, arenaBoundary };
  const graph = world.navigation = buildNavigation(world), seen = new Set<number>();
  let mainRoutes: number[] = [];
  for (let start = 0; start < graph.points.length; start++) {
    if (seen.has(start)) continue;
    const component = [start]; seen.add(start);
    for (let i = 0; i < component.length; i++) for (const next of graph.links[component[i]])
      if (!seen.has(next)) { seen.add(next); component.push(next); }
    if (component.length > mainRoutes.length) mainRoutes = component;
  }
  const clear = (x: number, z: number, radius = .75) => {
    const y = walkableHeight(x, z, world);
    if (y < .55 || Math.abs(x) > 120 || Math.abs(z) > 120) return false;
    if (Math.hypot(ground(x + .6, z) - ground(x - .6, z), ground(x, z + .6) - ground(x, z - .6)) / 1.2 > .6) return false;
    if (!colliders.every(c => y >= c.max.y - .015 || y + 1.8 <= c.min.y ||
      x + radius <= c.min.x || x - radius >= c.max.x || z + radius <= c.min.z || z - radius >= c.max.z)) return false;
    return mainRoutes.some(index => Math.hypot(graph.points[index].x - x, graph.points[index].z - z) < 10 &&
      walkableSegment(world, { x, z }, graph.points[index]));
  };
  const used: PointLike[] = [];
  const nearby = (x: number, z: number, maxRadius: number) => {
    for (let ring = 0; ring <= maxRadius; ring += 1.5) for (let k = 0; k < (ring ? 16 : 1); k++) {
      const a = k / 16 * Math.PI * 2, px = x + Math.cos(a) * ring, pz = z + Math.sin(a) * ring;
      if (!clear(px, pz) || used.some(o => Math.hypot(px - o.x, pz - o.z) < 1.5)) continue;
      used.push({ x: px, z: pz }); return p(px, walkableHeight(px, pz, world), pz);
    }
    return null;
  };
  const pickup = (x: number, z: number, kind: LootSpawn['kind'], weapon?: WeaponId) => {
    const pos = nearby(x, z, 10); if (pos) loot.push({ id: id('loot'), ...pos, kind, ...(kind === 'weapon' ? { weapon: weapon ?? 'pistol' } : {}) });
  };
  for (const h of [...HOUSES, ...MORRO_LOTS]) {
    pickup(h.x, h.z + 1.5, 'weapon', random() < .45 ? 'smg' : 'pistol');
    pickup(h.x, h.z - 1.5, 'ammo');
    const pos = nearby(h.x + 2.1, h.z + 1.1, 10); if (pos) chests.push({ id: id('chest'), ...pos });
  }
  for (const [x, z, weapon] of [[-7, -90, 'sniper'], [12, -92, 'dmr'], [28, -20, 'm4'], [24, -17, 'shotgun'],
    [-105, -76, 'sniper'], [65, 61, 'shotgun'], [102, -14, 'm4'], [12, 110, 'dmr']] as const) pickup(x, z, 'weapon', weapon);
  const kinds = ['ammo', 'bandage', 'armor', 'guarana', 'rapadura', 'medkit', 'helmet', 'acai'] as const;
  // Outdoor caches keep plane landings spread across the whole island. A
  // town-only loot pool would funnel bots onto the same few roof-free spots.
  for (let z = -102; z <= 104; z += 28) for (let x = -102; x <= 104; x += 28) {
    if (colliders.some(c => x > c.min.x - 3 && x < c.max.x + 3 && z > c.min.z - 3 && z < c.max.z + 3 && c.max.y > ground(x, z) + 2)) continue;
    pickup(x, z, 'ammo');
  }
  for (let i = 0; loot.length < 192 && i < 1800; i++) {
    const d = districts[i % districts.length], a = random() * Math.PI * 2, r = Math.sqrt(random()) * d.radius;
    pickup(d.x + Math.cos(a) * r, d.z + Math.sin(a) * r, kinds[i % kinds.length]);
  }
  for (let i = 0; chests.length < 58 && i < 600; i++) {
    const d = districts[i % districts.length], a = random() * Math.PI * 2, r = 5 + random() * d.radius * .6;
    const pos = nearby(d.x + Math.cos(a) * r, d.z + Math.sin(a) * r, 8);
    if (pos) chests.push({ id: id('chest'), ...pos });
  }
  for (let i = 0; spawns.length < 24 && i < 4000; i++) {
    const x = ARENA.minX + 7 + random() * (ARENA.maxX - ARENA.minX - 14);
    const z = ARENA.minZ + 7 + random() * (ARENA.maxZ - ARENA.minZ - 14);
    if (!clear(x, z, 1.3) || spawns.some(s => Math.hypot(s.x - x, s.z - z) < 13)) continue;
    spawns.push({ x, y: walkableHeight(x, z, world), z, mode: 'deathmatch', yaw: Math.atan2(-(ARENA_CENTER.x - x), -(ARENA_CENTER.z - z)) });
  }
  for (const d of districts) for (let i = 0; i < 5; i++) {
    const angle = i * Math.PI * 2 / 5, pos = nearby(d.x + Math.cos(angle) * d.radius * .6, d.z + Math.sin(angle) * d.radius * .6, 14);
    if (pos) spawns.push({ ...pos, mode: 'battle-royale', yaw: angle + Math.PI });
  }
  return world;
}
interface PointLike { x: number; z: number }
