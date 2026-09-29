import { AREAS, BAY, BRIDGE_PLANS, HILLS, HOUSES, MORRO_LOTS, NAV_ROUTES, PORTO_QUAY_X, PORTO_QUAY_Z, QUAY_DEPTH, QUAY_FACE, QUAYS, ROADS, ROW_LOTS, riverSample, type Rect } from './layout';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
function hash2(x: number, z: number) {
  let h = Math.imul(x + 71, 374761393) ^ Math.imul(z + 13, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x: number, z: number) {
  const i = Math.floor(x), j = Math.floor(z), u = ease(x - i), v = ease(z - j);
  return lerp(lerp(hash2(i, j), hash2(i + 1, j), u), lerp(hash2(i, j + 1), hash2(i + 1, j + 1), u), v) * 2 - 1;
}
export function fbm(x: number, z: number) {
  return vnoise(x, z) * .6 + vnoise(x * 2.1 + 5.2, z * 2.1 + 1.3) * .28 + vnoise(x * 4.3 + 9.1, z * 4.3 + 3.7) * .12;
}
function rawHeight(x: number, z: number) {
  const radial = Math.max(Math.abs(x), Math.abs(z)) * .68 + Math.hypot(x, z) * .32;
  const shore = 117 + fbm(x / 34 + 12, z / 34 - 4) * 7;
  const mask = 1 - ease((radial - shore) / 15);
  let h = 3 + fbm(x / 48, z / 48) * 2.3 + fbm(x / 15 + 40, z / 15 + 40) * .32;
  for (const [hx, hz, radius, height] of HILLS) {
    const d = Math.hypot(x - hx, z - hz);
    if (d < radius) h += height * (.5 + .5 * Math.cos(Math.PI * d / radius));
  }
  // A curved sand beach curls below the fort's east cliff.
  const beach = Math.hypot((x - 31) / 1.35, z + 102);
  if (x > 23 && beach < 35) h = lerp(h, .95, 1 - ease((beach - 23) / 12));
  return lerp(-3.8, h, mask);
}
interface Pad { rect: Rect; margin: number; y: number; fixed?: boolean }
const pads: Pad[] = [
  ...AREAS.map(a => ({ ...a, y: a.y ?? Math.max(.85, rawHeight((a.rect[0] + a.rect[2]) / 2, (a.rect[1] + a.rect[3]) / 2)) })),
  ...[...HOUSES, ...MORRO_LOTS, ...ROW_LOTS].map(h => ({ rect: [h.x - h.w / 2 - 1.5, h.z - h.d / 2 - 1.5, h.x + h.w / 2 + 1.5, h.z + h.d / 2 + 1.5] as Rect,
    margin: 1.3, y: Math.max(.85, rawHeight(h.x, h.z)) })),
];
const housePads = pads.slice(AREAS.length);
for (const p of housePads) {
  const x = (p.rect[0] + p.rect[2]) / 2, z = (p.rect[1] + p.rect[3]) / 2;
  const area = AREAS.find(a => x >= a.rect[0] && x <= a.rect[2] && z >= a.rect[1] && z <= a.rect[3]);
  if (area?.y != null) p.y = area.y;
}
const structuralPads = [...pads.filter(p => p.fixed), ...housePads];
// The field below visits every 2 m sample: bucket each influence by 8 m cell
// (keeping list order, so ties resolve exactly as a full scan would).
function buckets<T>(items: readonly T[], reach: (item: T) => Rect) {
  const CELL = 8, cells = new Map<number, T[]>();
  for (const item of items) {
    const [x0, z0, x1, z1] = reach(item);
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
        const key = cx * 4096 + cz, list = cells.get(key);
        if (list) list.push(item); else cells.set(key, [item]);
      }
  }
  const none: T[] = [];
  return (x: number, z: number) => cells.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL)) ?? none;
}
const grow = (rect: Rect, by: number): Rect => [rect[0] - by, rect[1] - by, rect[2] + by, rect[3] + by];
// A pad pulls the ground within its margin plus a 7 m blend; a structural pad within 3 m.
const padsAt = buckets(pads, p => grow(p.rect, p.margin + 7.01));
const structuralPadsAt = buckets(structuralPads, p => grow(p.rect, 3.01));
function paddedHeight(x: number, z: number) {
  let height = rawHeight(x, z), weight = 0, target = height;
  for (const p of padsAt(x, z)) {
    const [x0, z0, x1, z1] = p.rect;
    const d = Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
    const w = d === 0 ? 2 : 1 - ease((d - p.margin) / 7);
    if (w > 0 && w >= weight) { weight = w; target = p.y; }
  }
  height = lerp(height, target, Math.min(1, weight));
  return height;
}
/** Signed distance to the harbour basin (negative inside), with rounded corners. */
export function bayDistance(x: number, z: number) {
  const [x0, z0, x1, z1] = BAY, radius = 8;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2 - radius, hz = (z1 - z0) / 2 - radius;
  const qx = Math.abs(x - cx) - hx, qz = Math.abs(z - cz) - hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - radius;
}
/** 1 on a walled stretch of one bank of the river, fading to natural banks past its ends. */
export function quayWeight(x: number, side: -1 | 1) {
  return Math.max(0, ...QUAYS[side].map(([x0, x1]) => ease((x - x0 + 2) / 3) * ease((x1 + 2 - x) / 3)));
}
/** Half the length of a bridge deck: its ends rest on the banks at this distance from the channel centre. */
export const BRIDGE_REACH = 8;
// A 2 m field shared by collision, bots, map painting and the terrain mesh.
const SIDE = 151, STEP = 2, ORIGIN = 150;
const heights = new Float32Array(SIDE * SIDE);
const routes = NAV_ROUTES.flatMap(route => route.slice(1).map((b, i) => {
  const a = route[i];
  return { ax: a[0], az: a[1], bx: b[0], bz: b[1], ay: paddedHeight(...a), by: paddedHeight(...b) };
}));
// Only a route within 5 m grades the ground.
const routesAt = buckets(routes, r => grow([Math.min(r.ax, r.bx), Math.min(r.az, r.bz), Math.max(r.ax, r.bx), Math.max(r.az, r.bz)], 5.01));
for (let j = 0; j < SIDE; j++) for (let i = 0; i < SIDE; i++) {
  const x = i * STEP - ORIGIN, z = j * STEP - ORIGIN;
  let h = paddedHeight(x, z), best = Infinity, pathY = h;
  for (const r of routesAt(x, z)) {
    const dx = r.bx - r.ax, dz = r.bz - r.az;
    const t = Math.max(0, Math.min(1, ((x - r.ax) * dx + (z - r.az) * dz) / (dx * dx + dz * dz)));
    const distance = Math.hypot(x - r.ax - dx * t, z - r.az - dz * t);
    if (distance < best) { best = distance; pathY = lerp(r.ay, r.by, t); }
  }
  if (best < 5) h = lerp(h, pathY, 1 - ease((best - 2) / 3));
  // Hill paths can approach a terrace but cannot cut through a house floor.
  // The extra apron also keeps both doorway thresholds level with the room.
  let terraceWeight = 0, terraceY = h;
  for (const p of structuralPadsAt(x, z)) {
    const [x0, z0, x1, z1] = p.rect;
    const distance = Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
    const weight = distance === 0 ? 2 : 1 - ease(distance / 3);
    if (weight > 0 && weight >= terraceWeight) { terraceWeight = weight; terraceY = p.y; }
  }
  h = lerp(h, terraceY, Math.min(1, terraceWeight));
  // Carve last so neither town pads nor roads can dam the river. The town
  // reach drops straight to its bed at the quay walls; elsewhere the banks
  // shelve naturally into the channel.
  const river = riverSample(x, z), bank = river.distance - river.width / 2;
  const quay = quayWeight(x, z < river.z ? -1 : 1);
  // Outside the quays, bridge abutments keep their banks: the channel narrows
  // under each deck instead of leaving the deck ends above a sloping bank.
  const bridge = BRIDGE_PLANS.some(plan => Math.abs(x - plan.x) < 4.5);
  const natural = bank < 4.5 && !(bridge && river.distance > BRIDGE_REACH - 2.5) ? lerp(-1.2, h, ease((bank + 1) / 5.5)) : h;
  // A vertical step cannot live on a 2 m grid: it sits mid-way under the 5 m
  // deep quay stones, so neither a lip nor a dip shows on either side of them.
  // Bridge abutments keep their land right up to the water face.
  const walled = bank < (bridge ? QUAY_FACE : QUAY_FACE + QUAY_DEPTH / 2 - .1) ? -1.4 : h;
  h = lerp(natural, walled, quay);
  // The harbour basin: a straight quay face on the north side (PORTO_QUAY_X),
  // shelving elsewhere. Beside the quay the bed matches the walled river, so
  // the town's own quay stones and stairs stand on it; it deepens seaward.
  const basin = bayDistance(x, z), bed = lerp(-1.4, -2.8, ease((z - PORTO_QUAY_Z - 6) / 16));
  if (x > PORTO_QUAY_X[0] && x < PORTO_QUAY_X[1] && z < PORTO_QUAY_Z + 4) { if (basin < QUAY_DEPTH / 2 - .1) h = Math.min(h, bed); }
  else if (basin < 7) h = lerp(bed, h, ease(basin / 7));
  heights[j * SIDE + i] = h;
}
export function terrainHeight(x: number, z: number): number {
  const fx = Math.max(0, Math.min(SIDE - 1.001, (x + ORIGIN) / STEP));
  const fz = Math.max(0, Math.min(SIDE - 1.001, (z + ORIGIN) / STEP));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * SIDE + i;
  const a = heights[k], b = heights[k + 1], c = heights[k + SIDE], d = heights[k + SIDE + 1];
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}
export const WORLD_PALETTE = {
  grass: '#88A65C', grassLight: '#AEC47C', dryGrass: '#BBBC79',
  earth: '#B89162', rock: '#A99D88', rockTop: '#948E80',
  sand: '#DFC58F', sandLight: '#EBD8A5', sandWet: '#C2A778', mud: '#527F77',
  road: '#C1AF8D', curb: '#BCAA88',
  foliageLight: '#86BD4F', foliageMid: '#5FA544', foliageCore: '#3F8A4A',
  palmMid: '#5F9E3E', palmLight: '#9CC756', palmTrunk: '#A8865E', palmRing: '#8A6A48',
  trunk: '#8A5E3C', tuft: '#9CC756', tuftTip: '#D8D98A',
} as const;
export function beachDistance(x: number, z: number): number {
  const south = Math.min(x + 59, 54 - x, z - 91 - fbm(x / 23, 8) * 3, 126 - z);
  const crescent = Math.min(x - 23, 36 - Math.hypot((x - 34) / 1.3, z + 101));
  return Math.max(south, crescent);
}
// The walking route continues across the beach, but its paving fades into
// the painted sand. Steep terrace faces keep their exposed stone instead of
// stretching a road rectangle down the cut. Both paving and curb fade together.
export function roadPaintWeight(x: number, z: number, y: number, slope = 0): number {
  const coastal = 1 - ease((beachDistance(x, z) + 1) / 3) * (1 - ease((y - 2.5) / .75));
  // Paving never runs down under the water onto a river or harbour bed.
  return coastal * (1 - ease((slope - .85) / .5)) * ease((y - .15) / .45);
}
export function terrainColor(x: number, z: number, y: number, slope: number,
  includeRoads = true, includeBeach = true, includeWet = true): string {
  const road = (margin: number) => ROADS.some(([x0, z0, x1, z1]) =>
    x > x0 - margin && x < x1 + margin && z > z0 - margin && z < z1 + margin);
  if (y < -.2) return WORLD_PALETTE.mud;
  const paved = includeRoads && y > .3 && roadPaintWeight(x, z, y, slope) >= .5;
  if (paved && road(0)) return WORLD_PALETTE.road;
  if (paved && road(.4)) return WORLD_PALETTE.curb;
  const beach = includeBeach && beachDistance(x, z) > 0 && y < 3;
  if (slope > .8 && !beach) return WORLD_PALETTE.rock;
  if (beach || y < .8) {
    const width = 2.5 + fbm(x / 12 + 51, z / 12 - 7) * 2;
    const wet = includeWet && (terrainHeight(x + width, z) < .1 || terrainHeight(x - width, z) < .1 ||
      terrainHeight(x, z + width) < .1 || terrainHeight(x, z - width) < .1);
    if (wet) return WORLD_PALETTE.sandWet;
    return fbm(x / 24 + 3, z / 24 - 8) > 0 ? WORLD_PALETTE.sandLight : WORLD_PALETTE.sand;
  }
  if (slope > .55) return WORLD_PALETTE.earth;
  if (fbm(x / 48 - 4, z / 48 + 9) > .28) return WORLD_PALETTE.dryGrass;
  return fbm(x / 36 + 7, z / 36 + 3) > 0 ? WORLD_PALETTE.grassLight : WORLD_PALETTE.grass;
}
