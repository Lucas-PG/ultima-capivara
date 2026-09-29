import { BECOS, FRONTAGE_HOUSES, FRONTAGE_RUNS, HOUSE_BODY, LOT_RECTS, MARKET_RECT, PLAZA_RECT, ROADS, ROSARIO_RECT, ROW_LOTS, ROW_SIZE, STREETS, routeDistance, type FrontageRun, type HouseLot, type Rect, type RowLot } from './layout';
import type { KitPlacement, MapObject } from './types';

// The lived-in layer of the town, placed from the same lots and streets the
// houses stand on: pots and goods at the doors, shop signs, cables strung
// across the streets carrying lanterns, bulbs or festa pennants, laundry over
// the becos, bar tables on the squares. Deterministic: every choice hashes
// its position, never the gameplay random sequence.
export interface StreetLifeApi {
  detail(piece: string, x: number, z: number, yaw?: number, scale?: number, y?: number): KitPlacement | null;
  marker(kind: MapObject['kind'], x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, detail: string, rotation?: number): void;
  occupied(x: number, z: number, margin: number): boolean;
  ground(x: number, z: number): number;
}

const hash = (x: number, z: number, salt = 0) => {
  let h = Math.imul(Math.round(x * 10) + salt * 7919, 73856093) ^ Math.imul(Math.round(z * 10) - salt * 104729, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
// Eaves height of each street front, and where along it (local x) the
// openings leave wall free for a pot, a barrel or a bike.
const EAVES: Record<string, number> = {
  row_terrea: 4.4, row_sobrado: 7.3, row_loja: 7.3, row_alto: 10.2,
  house_small: 3.2, house_medium: 3.2, house_tall: 6.4, sobrado: 6.4, house_laje: 3.2, house_laje_b: 3.2, house_varanda: 3.1,
};
const FREE_WALL: Record<string, readonly number[]> = {
  row_terrea: [-.7, 1.4, 3.0], row_sobrado: [-.1, 2.6, -2.8], row_loja: [0, -3.75, 3.75], row_alto: [-.1, 2.5, -2.55],
};
const SHOP_SIGNS = ['FARMÁCIA', 'BAR DO ZÉ', 'SORVETES', 'BARBEARIA', 'AÇAÍ', 'PASTÉIS', 'CACHAÇA', 'SAPATARIA', 'ARMAZÉM', 'PADARIA'];
const WALL_ADVERTS = ['SORVETES', 'AÇAÍ', 'CAPIVARAS', 'CACHAÇA', 'PASTÉIS', 'BOM DIA', 'CAFÉ DA VILA'];
const inside = (rects: readonly Rect[], x: number, z: number, margin: number) =>
  rects.some(([x0, z0, x1, z1]) => x > x0 - margin && x < x1 + margin && z > z0 - margin && z < z1 + margin);
interface Front { x: number; z: number; yaw: number; width: number; depth: number; piece: string; row: boolean }
const fronts: Front[] = [
  ...ROW_LOTS.map((lot: RowLot) => ({ x: lot.x, z: lot.z, yaw: lot.yaw, width: ROW_SIZE[lot.piece][0], depth: ROW_SIZE[lot.piece][1], piece: lot.piece, row: true })),
  ...FRONTAGE_HOUSES.map((lot: HouseLot) => ({ x: lot.x, z: lot.z, yaw: lot.yaw ?? 0, width: HOUSE_BODY[lot.piece][0], depth: HOUSE_BODY[lot.piece][1], piece: lot.piece, row: false })),
];
const local = (front: Front, x: number, z: number) => {
  const c = Math.cos(front.yaw), s = Math.sin(front.yaw);
  return { x: front.x + x * c + z * s, z: front.z + z * c - x * s };
};
/** The nearest building wall (front, side or back) across a street edge:
 * `outward` -1 looks toward lower coordinates, +1 toward higher ones. */
function wallBeyond(along: number, edge: number, outward: -1 | 1, alongX: boolean) {
  let best: number | undefined;
  for (const [x0, z0, x1, z1] of LOT_RECTS) {
    const [a0, a1, near] = alongX ? [x0, x1, outward < 0 ? z1 : z0] : [z0, z1, outward < 0 ? x1 : x0];
    if (along <= a0 + .4 || along >= a1 - .4 || (near - edge) * outward < -.6 || (near - edge) * outward > 2.5) continue;
    if (best === undefined || (near - best) * outward < 0) best = near;
  }
  return best;
}
/** Which front (if any) has its street face on this line at this point. */
function frontAt(x: number, z: number, faceYaw: number) {
  return fronts.find(front => {
    if (Math.abs(Math.sin(front.yaw - faceYaw)) > .01 || Math.cos(front.yaw - faceYaw) < 0) return false;
    const c = Math.cos(front.yaw), s = Math.sin(front.yaw), dx = x - front.x, dz = z - front.z;
    const along = dx * c - dz * s, out = dx * s + dz * c;
    return Math.abs(along) < front.width / 2 - .4 && Math.abs(out - front.depth / 2) < .7;
  });
}

export function dressStreets(api: StreetLifeApi) {
  const { detail, marker, occupied, ground } = api;
  const squares: readonly Rect[] = [PLAZA_RECT, MARKET_RECT, ROSARIO_RECT];
  // Door life: pots beside the doors, goods outside the shops, a sign over
  // each shop, a bike against a wall now and then.
  let shop = 0, advert = 0;
  for (const front of fronts) {
    const spots = front.row ? FREE_WALL[front.piece] : [-front.width / 2 + .6, front.width / 2 - .6];
    spots.forEach((spot, index) => {
      const roll = hash(front.x + spot, front.z, index);
      const at = local(front, spot, front.depth / 2 + .5);
      if (occupied(at.x, at.z, .05)) return;
      if (front.piece === 'row_loja' && index === 0) {
        // Between the two shop arches: produce in crates and sacks.
        const goods = local(front, 0, front.depth / 2 + .75);
        if (roll < .5) { detail('crate', goods.x, goods.z, front.yaw + .1, .8); detail('vaso_flor', local(front, .8, front.depth / 2 + .45).x, local(front, .8, front.depth / 2 + .45).z); }
        else detail('sacos', goods.x, goods.z, front.yaw);
        return;
      }
      if (roll < .38) detail('vaso', at.x, at.z, front.yaw + roll * 6);
      else if (roll < .58) detail('vaso_alto', at.x, at.z, front.yaw);
      else if (roll < .72) detail('vaso_flor', at.x, at.z, front.yaw);
      else if (roll < .8 && front.row) detail('barrel', at.x, at.z, 0, .85);
      else if (roll < .86) marker('box', at.x, ground(at.x, at.z), at.z, 1, 1, 1, index % 2 ? '#BD765A' : '#65A29C', 'prop:street-bike', front.yaw + Math.PI / 2);
    });
    if (front.piece === 'row_loja') {
      const side = hash(front.x, front.z, 9) < .5 ? -1 : 1, sign = local(front, side * (front.width / 2 - .55), front.depth / 2 + .55);
      marker('box', sign.x, ground(front.x, front.z) + 3.25, sign.z, 1, 1, 1, '#FFFFFF', `prop:street-shop:${SHOP_SIGNS[shop++ % SHOP_SIGNS.length]}`, front.yaw);
    }
    // A terrace's blank end wall that faces a street or square (not a beco) carries a painted advert.
    if (front.row) for (const side of [-1, 1]) {
      const out = local(front, side * (front.width / 2 + .6), 0);
      if (!inside(ROADS, out.x, out.z, .2) || inside(BECOS, out.x, out.z, .1) || inside(LOT_RECTS, out.x, out.z, .1)) continue;
      const at = local(front, side * (front.width / 2 + .06), -front.depth * .12), tall = EAVES[front.piece] > 5;
      marker('box', at.x, ground(front.x, front.z) + (tall ? 3.4 : 2.3), at.z, tall ? 2 : 1.6, tall ? 2 : 1.6, 1, '#FFFFFF',
        `prop:street-panel:${WALL_ADVERTS[advert++ % WALL_ADVERTS.length]}`, front.yaw + side * Math.PI / 2);
    }
  }

  // Cables across the streets, anchored to the facades on both sides, below
  // the lower of the two eaves. Squares stay open to the sky.
  let cable = 0;
  for (const street of STREETS) {
    if (squares.includes(street)) continue;
    const [x0, z0, x1, z1] = street, alongX = x1 - x0 > z1 - z0;
    const length = alongX ? x1 - x0 : z1 - z0;
    for (let t = 4; t < length - 3; t += 8.5 + hash(x0 + t, z0, 3) * 3) {
      // Walls on both sides (the nearest across each kerb), at least one of them a facade.
      const along = (alongX ? x0 : z0) + t;
      const low = wallBeyond(along, alongX ? z0 : x0, -1, alongX), high = wallBeyond(along, alongX ? z1 : x1, 1, alongX);
      if (low === undefined || high === undefined) continue;
      const a = alongX ? frontAt(along, low, 0) : frontAt(low, along, Math.PI / 2);
      const b = alongX ? frontAt(along, high, Math.PI) : frontAt(high, along, -Math.PI / 2);
      if (!a && !b) continue;
      const x = alongX ? along : (low + high) / 2, z = alongX ? (low + high) / 2 : along;
      const height = Math.max(3.5, Math.min(a ? EAVES[a.piece] : 5.8, b ? EAVES[b.piece] : 5.8) - .55);
      const variant = ['flags', 'lantern', 'flags', 'bulbs', 'lantern', 'flags'][cable++ % 6];
      marker('box', x, ground(x, z) + Math.min(height, 6.2), z, high - low, 1, 1, '#FFFFFF', `prop:street-wire:${variant}`, alongX ? -Math.PI / 2 : 0);
    }
  }

  // Squares, quays and the harbour yard: authored groups, each skipped if
  // anything already stands there.
  const put = (piece: string, x: number, z: number, yaw = 0, scale = 1) => { if (!occupied(x, z, .3)) detail(piece, x, z, yaw, scale); };
  // The café terrace on the praça, either side of the café door, and a coconut cart by the bridge.
  for (const z of [-25, -15]) put('mesa_bar', 2.5, z, .2);
  put('carrinho_coco', -2.2, -3.6, Math.PI * .9);
  // Largo do Rosário: a bar table at the corner and a cart by the chapel steps.
  put('mesa_bar', -27.2, 30.2, .5); put('carrinho_coco', -14.5, 31, -.3);
  // The feira keeps its produce in sacks and crates behind the stalls.
  for (const [x, z] of [[27.5, -12.5], [37.5, -12.5], [27.5, 4], [37.5, 4]] as const) put(hash(x, z) < .5 ? 'sacos' : 'crate', x, z, z < 0 ? 0 : Math.PI, hash(x, z) < .5 ? 1 : .85);
  // Nets drying on the quays beside the landing stairs, the harbour yard's cargo.
  for (const [x, z, yaw] of [[-20, -1.5, .1], [14, 1.5, -.1], [29, 25.5, .4], [46, 27.5, .3]] as const) put('rede_pesca', x, z, yaw);
  for (const [piece, x, z, yaw] of [['sacos', 91, -6, 0], ['sacos', 93.2, -6.2, .2], ['rede_pesca', 113.5, -6.5, .2], ['crate', 88.6, -9, .3],
    ['crate', 89.2, -7.8, 1.1], ['barrel', 110, -10, 0], ['barrel', 111, -10.6, 0], ['rede_pesca', 96, -5.5, -.3], ['sacos', 116.5, -21, 0]] as const)
    put(piece, x, z, yaw, piece === 'crate' ? .85 : 1);

  // Becos: laundry strung wall to wall over the alley, a barrel at its end.
  for (const [u0, v0, u1, v1] of BECOS) {
    const narrowX = u1 - u0 < v1 - v0, span = narrowX ? u1 - u0 : v1 - v0, run = narrowX ? v1 - v0 : u1 - u0;
    for (const [share, height] of [[.3, 4.1], [.7, 5.3]] as const) {
      const x = narrowX ? (u0 + u1) / 2 : u0 + run * share, z = narrowX ? v0 + run * share : (v0 + v1) / 2;
      if (hash(x, z, 5) < .25) continue;
      marker('box', x, ground(x, z) + height, z, span, 1, 1, '#FFFFFF', 'prop:street-line', narrowX ? 0 : -Math.PI / 2);
    }
    const end = narrowX ? { x: (u0 + u1) / 2 + .7, z: v0 + run * .85 } : { x: u0 + run * .85, z: (v0 + v1) / 2 + .7 };
    if (!occupied(end.x, end.z, .6)) detail(hash(end.x, end.z, 2) < .5 ? 'barrel' : 'crate', end.x, end.z, .3, .85);
  }
}

// Quintais: the yards behind a street front, walled at chest height with
// whitewashed muros (3 m pieces), a gate here and there, bougainvillea over
// the lane side, laundry drying inside. Only open, level ground is walled,
// never a street, a route, a beco, a lot or anything already standing; the
// ground behind every enterable house stays open so its back door leads
// straight out to the lane. Called once the island's structures stand.
export function wallYards(api: StreetLifeApi) {
  for (const run of FRONTAGE_RUNS) if (run.yards) wallRun(api, run);
}
const YARD = 6.3, MURO = 3;
// The open ground behind every enterable house, out through the yard line and
// on across the lane beyond, whichever run's yards would reach it.
const BACKDOORS: readonly Rect[] = FRONTAGE_RUNS.flatMap(run => run.doors.map(door => {
  const along = run.street === 'n' || run.street === 's', outward = run.street === 's' || run.street === 'e' ? 1 : -1;
  const [v0, v1] = [run.back + outward * 1, run.back - outward * (YARD + 5)].sort((a, b) => a - b);
  return (along ? [door - 3.6, v0, door + 3.6, v1] : [v0, door - 3.6, v1, door + 3.6]) as Rect;
}));
const FRONT_YAW: Record<FrontageRun['street'], number> = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };
function wallRun(api: StreetLifeApi, run: FrontageRun) {
  const { detail, marker, occupied, ground } = api;
  const along = run.street === 'n' || run.street === 's', outward = run.street === 's' || run.street === 'e' ? 1 : -1;
  const world = (u: number, v: number) => along ? { x: u, z: v } : { x: v, z: u };
  const far = run.back - outward * YARD;
  const [u0, u1] = [Math.min(run.from, run.to), Math.max(run.from, run.to)];
  // A column of the yard is free when every sample across it is open, level ground.
  const free = (u: number) => {
    if (run.becos.some(([a, b]) => u > a - 1 && u < b + 1)) return false;
    const reference = ground(world(u, run.back - outward * .5).x, world(u, run.back - outward * .5).z);
    for (let d = .5; d <= YARD + .35; d += .9) {
      const { x, z } = world(u, run.back - outward * d);
      const y = ground(x, z);
      if (y < .6 || Math.abs(y - reference) > .9 || inside(LOT_RECTS, x, z, .3) || inside(ROADS, x, z, .6) || inside(BACKDOORS, x, z, .3) ||
        routeDistance(x, z) < 2.4 || occupied(x, z, .15)) return false;
    }
    return true;
  };
  let start: number | undefined;
  for (let u = u0 + .5; u <= u1 + .01; u += .5) {
    const open = u <= u1 - .49 && free(u);
    if (open && start === undefined) start = u - .5;
    if ((!open || u > u1 - .49) && start !== undefined) {
      const end = open ? u1 : u - .5;
      if (end - start >= 2 * MURO) yard(start, end);
      start = undefined;
    }
  }
  function yard(a: number, b: number) {
    const count = Math.floor((b - a) / MURO), first = a + (b - a - count * MURO) / 2, last = first + count * MURO;
    const place = (piece: string, u: number, v: number, dir: readonly [number, number], y?: number) => {
      // dir is the piece's local +x in (u, v); its yaw follows from the world axis.
      const { x, z } = world(u, v), dx = along ? dir[0] : dir[1], dz = along ? dir[1] : dir[0];
      detail(piece, x, z, Math.atan2(-dz, dx), 1, y ?? ground(x, z) - .04);
    };
    // Along the lane: +z of every piece faces away from the houses, so its
    // local +x (and each piece's end pillar) runs this way along the yard.
    const laneDir: [number, number] = [along ? -outward : outward, 0], plus = laneDir[0] > 0;
    for (let k = 0; k < count; k++) {
      const u = first + (k + .5) * MURO, roll = hash(u, far, 11), { x, z } = world(u, far);
      const piece = (roll < .3 && k % 3 === 1) || (count < 4 && k === 1) ? 'muro_portao' : roll > .7 ? 'muro_flor' : 'muro';
      // A wall piece on a slope sits on its lowest corner, never hovering.
      const ends = [-1.4, 1.4].map(offset => { const p = world(u + offset, far); return ground(p.x, p.z); });
      place(piece, u, far, laneDir, Math.min(ground(x, z), ...ends) - .04);
    }
    const bare = plus ? first : last, bareAt = world(bare, far);
    detail('muro_pilar', bareAt.x, bareAt.z, 0, 1, ground(bareAt.x, bareAt.z) - .04);
    // Side walls from the far corners back to the houses, pillars toward the houses.
    for (const u of [first, last]) for (let k = 0; k < 2; k++) {
      const v = far + outward * (k + .5) * MURO, { x, z } = world(u, v);
      const ends = [-1.4, 1.4].map(offset => { const p = world(u, v + offset); return ground(p.x, p.z); });
      place('muro', u, v, [0, outward], Math.min(ground(x, z), ...ends) - .04);
    }
    // Laundry drying across the yard, one frame every 12 m.
    for (let u = first + 3.4; u <= last - 3.2; u += 12) {
      const v = (run.back + far) / 2, { x, z } = world(u, v);
      const ends = [-2.8, 2.8].map(offset => world(u + offset, v));
      if (ends.some(p => occupied(p.x, p.z, .3)) || hash(u, v, 13) < .2) continue;
      marker('box', x, ground(x, z), z, 1, 1, 1, '#FFFFFF', 'prop:street-laundry', along ? 0 : -Math.PI / 2);
    }
  }
}
