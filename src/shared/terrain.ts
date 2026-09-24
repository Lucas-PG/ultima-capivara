// Shared height field: the simulation, bots, audio occlusion and the renderer
// all read this, so it must stay pure and deterministic. It is the legacy (v1)
// island: rolling ground, six hills, the Lagoa pond, a squircle coast, and the
// ground levelled under every lot from layout.ts. Like legacy it is baked once
// into a 2 m grid and sampled with the same triangle interpolation.
import { AREAS, HILLS, HOUSES, LAKE, MORRO_COLS, MORRO_Z, type Rect } from './layout';

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

export function terrainHeight(x: number, z: number): number {
  let fx = (x + HO) / HS, fz = (z + HO) / HS;
  fx = fx < 0 ? 0 : fx > HN - 1.001 ? HN - 1.001 : fx;
  fz = fz < 0 ? 0 : fz > HN - 1.001 ? HN - 1.001 : fz;
  const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * HN + i;
  const a = HM[k], b = HM[k + 1], c = HM[k + HN], d = HM[k + HN + 1];
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}
