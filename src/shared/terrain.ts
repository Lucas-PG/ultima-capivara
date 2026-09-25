// Shared height field: the simulation, bots, audio occlusion and the renderer
// all read this, so it must stay pure and deterministic. It is the legacy (v1)
// island: rolling ground, six hills, the Lagoa pond, a squircle coast, and the
// ground levelled under every lot from layout.ts. Like legacy it is baked once
// into a 2 m grid and sampled with the same triangle interpolation.
import { AREAS, HILLS, HOUSES, LAKE, MORRO_COLS, MORRO_Z, ROADS, type Rect } from './layout';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => { const k = Math.min(1, Math.max(0, t)); return k * k * (3 - 2 * k); };

function hash2(i: number, j: number) {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x: number, z: number) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash2(i, j), hash2(i + 1, j), u), lerp(hash2(i, j + 1), hash2(i + 1, j + 1), u), v) * 2 - 1;
}
export function fbm(x: number, z: number) {
  return vnoise(x, z) * .6 + vnoise(x * 2.1 + 5.2, z * 2.1 + 1.3) * .28 + vnoise(x * 4.3 + 9.1, z * 4.3 + 3.7) * .12;
}

function rawHeight(x: number, z: number) {
  const rr = Math.max(Math.abs(x), Math.abs(z)) * .65 + Math.hypot(x, z) * .35;
  const mask = 1 - ease((rr - 116) / 26);
  let h = 3 + fbm(x / 46, z / 46) * 2.6 + fbm(x / 13 + 40, z / 13 + 40) * .45;
  for (const [hx, hz, r, hh] of HILLS) {
    const d = Math.hypot(x - hx, z - hz);
    if (d < r) h += hh * (.5 + .5 * Math.cos(Math.PI * d / r));
  }
  const ld = Math.hypot(x - LAKE[0], z - LAKE[1]);
  if (ld < LAKE[2] * 1.7) h = lerp(h, -1.2, 1 - ease((ld - LAKE[2] * .55) / LAKE[2]));
  return lerp(-3.5, h, mask);
}

interface Pad { x0: number; z0: number; x1: number; z1: number; m: number; y: number }
const pad = ([x0, z0, x1, z1]: Rect, m: number, y: number | null): Pad =>
  ({ x0, z0, x1, z1, m, y: y ?? Math.max(.8, rawHeight((x0 + x1) / 2, (z0 + z1) / 2)) });
// Larger pads first: where two pads both claim a point, the smaller (more
// specific) one wins, so a house stays flat inside a district area.
const PADS: Pad[] = [
  ...HOUSES.map(h => pad([h.x - h.w / 2 - .5, h.z - h.d / 2 - .5, h.x + h.w / 2 + .5, h.z + h.d / 2 + .5], 3, null)),
  ...MORRO_COLS.map(x => ({ ...pad([x - 4, MORRO_Z[0], x + 4, MORRO_Z[1]], 2, null), y: Math.max(.8, rawHeight(x, 92)) })),
  ...AREAS.map(a => pad(a.rect, a.margin, a.y)),
].sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0));

const HN = 151, HS = 2, HO = 150;
const HM = new Float32Array(HN * HN);
for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
  const x = i * HS - HO, z = j * HS - HO;
  // Each point follows its strongest pad: flat inside rect + margin, easing
  // back to the natural ground over 8 m (terraces meet as short steps).
  let weight = 0, target = 0;
  for (const p of PADS) {
    const d = Math.hypot(Math.max(p.x0 - x, 0, x - p.x1), Math.max(p.z0 - z, 0, z - p.z1));
    if (d >= p.m + 8) continue;
    const w = d === 0 ? 2 : 1 - ease((d - p.m) / 8); // inside a lot beats a neighbour's margin
    if (w >= weight) { weight = w; target = p.y; }
  }
  HM[j * HN + i] = lerp(rawHeight(x, z), target, Math.min(1, weight));
}
// Lot pads may touch a road and create a visible step in the asphalt. Level
// each road across its width, averaging a short run along its centre line.
const PADDED_HEIGHTS = HM.slice();
for (const [x0, z0, x1, z1] of ROADS) {
  const horizontal = x1 - x0 > z1 - z0;
  const center = horizontal ? (z0 + z1) / 2 : (x0 + x1) / 2;
  const cross = Math.round((center + HO) / HS);
  for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
    const x = i * HS - HO, z = j * HS - HO;
    const distance = Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
    if (distance >= 2) continue;
    let total = 0, count = 0;
    for (let along = -2; along <= 2; along++) for (let across = -1; across <= 1; across++) {
      const si = horizontal ? i + along : cross + across;
      const sj = horizontal ? cross + across : j + along;
      if (si < 0 || si >= HN || sj < 0 || sj >= HN) continue;
      total += PADDED_HEIGHTS[sj * HN + si]; count++;
    }
    HM[j * HN + i] = lerp(PADDED_HEIGHTS[j * HN + i], total / count, 1 - ease(distance / 2));
  }
}

export function terrainHeight(x: number, z: number): number {
  let fx = (x + HO) / HS, fz = (z + HO) / HS;
  fx = fx < 0 ? 0 : fx > HN - 1.001 ? HN - 1.001 : fx;
  fz = fz < 0 ? 0 : fz > HN - 1.001 ? HN - 1.001 : fz;
  const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * HN + i;
  const a = HM[k], b = HM[k + 1], c = HM[k + HN], d = HM[k + HN + 1];
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

// Broad, discrete colour regions keep the island readable from the ground and
// the plane. The renderer paints these values directly into terrain vertices.
export const WORLD_PALETTE = {
  grass: '#6FAE45', grassLight: '#8CC453', dryGrass: '#B0CC5E',
  earth: '#C99A62', rock: '#BBAE98', rockTop: '#A89F92',
  sand: '#F2D9A0', sandLight: '#F8E6BA', sandWet: '#D9B77A', mud: '#5F8F86',
  road: '#6A6470', curb: '#CFC4B0',
  foliageLight: '#86BD4F', foliageMid: '#5FA544', foliageCore: '#3F8A4A',
  palmMid: '#5F9E3E', palmLight: '#9CC756', palmTrunk: '#A8865E', palmRing: '#8A6A48',
  trunk: '#8A5E3C', tuft: '#9CC756', tuftTip: '#D8D98A',
} as const;

// The painted beach boundary wanders independently of the rectangular pad
// that keeps its kiosks level. Positive values are inside the sandy region.
export function beachDistance(x: number, z: number): number {
  const left = 24 + fbm(z / 12 + 11, 2) * 5;
  const right = 74 + fbm(z / 12 + 29, 2) * 5;
  const sea = -132 + fbm(x / 12 + 17, 4) * 5;
  const inland = -104 + fbm(x / 12 + 37, 4) * 5;
  return Math.min(x - left, right - x, z - sea, inland - z);
}

export function terrainColor(x: number, z: number, y: number, slope: number,
  includeRoads = true, includeBeach = true, includeWet = true): string {
  const road = (margin: number) => ROADS.some(([x0, z0, x1, z1]) =>
    x > x0 - margin && x < x1 + margin && z > z0 - margin && z < z1 + margin);
  if (includeRoads && road(0)) return WORLD_PALETTE.road;
  if (includeRoads && road(.4)) return WORLD_PALETTE.curb;
  if (y < -.2) return WORLD_PALETTE.mud;
  const beach = includeBeach && beachDistance(x, z) > 0;
  const coast = Math.max(Math.abs(x), Math.abs(z)) * .65 + Math.hypot(x, z) * .35 > 112;
  const lakeEdge = Math.hypot(x - LAKE[0], z - LAKE[1]) < LAKE[2] * 1.8;
  if (slope > .6 && !beach && (coast || lakeEdge)) return WORLD_PALETTE.rock;
  if (beach || y < .8) {
    const wetWidth = 3 + fbm(x / 12 + 51, z / 12 - 7) * 3;
    const nearWater = includeWet && (terrainHeight(x + wetWidth, z) < .1 || terrainHeight(x - wetWidth, z) < .1 ||
      terrainHeight(x, z + wetWidth) < .1 || terrainHeight(x, z - wetWidth) < .1);
    if (nearWater) return WORLD_PALETTE.sandWet;
    const warpedX = x + fbm(x / 12 + 41, z / 12 + 9) * 4;
    const warpedZ = z + fbm(x / 12 - 7, z / 12 + 33) * 4;
    const patch = fbm(warpedX / 24 + 3, warpedZ / 24 - 8);
    return patch > 0 ? WORLD_PALETTE.sandLight : WORLD_PALETTE.sand;
  }
  const lotEdge = slope > .6 && PADS.some(p => x > p.x0 - 10 && x < p.x1 + 10 && z > p.z0 - 10 && z < p.z1 + 10);
  if (slope > 1.1 && !lotEdge) return WORLD_PALETTE.rock;
  if (slope > .6) {
    if (!lotEdge) return y > 2 && fbm(x / 28 + 13, z / 28 - 2) > .1 ? WORLD_PALETTE.earth : WORLD_PALETTE.rock;
  }
  const patch = fbm(x / 36 + 7, z / 36 + 3);
  const dryness = fbm(x / 48 - 4, z / 48 + 9);
  if (dryness > .24) return WORLD_PALETTE.dryGrass;
  return patch > 0 ? WORLD_PALETTE.grassLight : WORLD_PALETTE.grass;
}
