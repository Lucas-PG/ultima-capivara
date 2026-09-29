import { BECOS, FRONTAGE_HOUSES, HOUSE_BODY, LOT_RECTS, MARKET_RECT, PLAZA_RECT, ROSARIO_RECT, ROW_LOTS, ROW_SIZE, STREETS, type HouseLot, type Rect, type RowLot } from './layout';
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
  let shop = 0;
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
