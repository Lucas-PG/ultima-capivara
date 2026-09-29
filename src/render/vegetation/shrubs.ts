import * as THREE from 'three';
import { plantHash } from '../../shared/vegetation-species';
import { FOLIAGE_TILES, type FoliageTile } from './atlas';
import { clump, type ClumpSpec, type CrownVolume } from './crowns';
import { KIND, MeshBuilder, card, tube } from './mesh-builder';
import type { Lod } from './palms';

const lerp = THREE.MathUtils.lerp;
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = new THREE.Vector3(0, 1, 0);
const hex = (c: string) => new THREE.Color(c);
type Tiles = [FoliageTile, number][];

const WILD: Tiles = [['cluster-guava', .45], ['cluster-emerald', .35], ['cluster-teal', .2]];
const GARDEN: Tiles = [['cluster-lime', .45], ['cluster-emerald', .4], ['cluster-guava', .15]];
const SHADE: Tiles = [['cluster-emerald', .35], ['cluster-guava', .3], ['cluster-teal', .35]];
const HIBISCUS: Tiles = [['cluster-hibiscus', .5], ['cluster-emerald', .3], ['hibiscus', .2]];
const BOUGAINVILLEA: Tiles = [['cluster-bougainvillea', .45], ['bougainvillea-mound', .35], ['cluster-emerald', .2]];
const CROTON: Tiles = [['croton', .35], ['cluster-lime', .35], ['cluster-emerald', .3]];

export type ShrubStyle = 'shrub' | 'hibiscus' | 'bougainvillea';
const SHRUB_TILES: Record<ShrubStyle, Tiles[]> = {
  shrub: [WILD, GARDEN, [['cluster-guava', .5], ['cluster-teal', .3], ['cluster-lime', .2]]],
  hibiscus: [HIBISCUS, [['cluster-hibiscus', .4], ['cluster-lime', .35], ['hibiscus', .25]]],
  bougainvillea: [BOUGAINVILLEA, [['bougainvillea-mound', .45], ['cluster-bougainvillea', .35], ['cluster-lime', .2]]],
};

/** A few woody stems under a bush, visible where the leaves lift off the ground. */
function stems(mb: MeshBuilder, tops: THREE.Vector3[], lod: Lod) {
  if (lod > 0) return;
  const bark = hex('#6f5236');
  for (const top of tops) tube(mb, [v3(top.x * .15, 0, top.z * .15), top.clone().multiplyScalar(.5).setY(top.y * .45), top],
    [.045, .032, .02], { sides: 4, kind: KIND.limb, swayBase: 0, swayTop: .05, uvScale: 1, color: () => bark });
}

/** A leafy mound that reaches the ground: garden bush, cliff-foot scrub, flowering bush. */
export function buildShrub(style: ShrubStyle, variant: number, lod: Lod) {
  const mb = new MeshBuilder(lod), seed = variant * 17 + style.length * 5 + 2, rand = (i: number) => plantHash(seed, i);
  const tiles = SHRUB_TILES[style][variant % SHRUB_TILES[style].length];
  const tall = style === 'shrub' ? 1 : 1.12;
  const volume: CrownVolume = { center: v3(0, .7 * tall, 0), radii: v3(1.05, .8 * tall, 1.05) };
  const clumps: ClumpSpec[] = [{ at: v3(0, .72 * tall, 0), radii: v3(.9, .68 * tall, .9), tiles, shaded: SHADE, size: .66, solidBottom: true, spikes: .3 }];
  const n = 3 + (variant % 2);
  for (let k = 0; k < n; k++) {
    const a = (k / n + variant * .11) * Math.PI * 2 + rand(k) * .6, r = .6 + rand(k + 9) * .2;
    clumps.push({ at: v3(Math.cos(a) * r, .45 + rand(k + 20) * .14, Math.sin(a) * r), radii: v3(.56, .46, .56), tiles, shaded: SHADE, size: .6, solidBottom: true, spikes: .3 });
  }
  stems(mb, clumps.slice(0, 3).map(c => v3(c.at.x * .8, c.at.y * .9, c.at.z * .8)), lod);
  clumps.forEach((c, i) => clump(mb, c, volume, lod, rand, seed + i));
  return mb.build();
}

/** Undergrowth patch: several overlapping bushes over a 3.6 x 2.6 m oval (the footprint of the
 * kit's `bush_cluster`), wild green, garden green with croton, hibiscus or bougainvillea. */
export function buildThicket(variant: number, lod: Lod) {
  const mb = new MeshBuilder(lod), seed = variant * 23 + 7, rand = (i: number) => plantHash(seed, i);
  const tiles = [WILD, CROTON, HIBISCUS, BOUGAINVILLEA][variant];
  const volume: CrownVolume = { center: v3(0, .55, 0), radii: v3(1.9, .75, 1.4) };
  const mounds: [number, number, number, number][] = variant % 2
    ? [[-.95, .15, 1, .72], [.7, -.25, .95, .7], [.25, .5, .75, .6]]
    : [[-1.05, .1, .85, .66], [0, -.25, 1.0, .74], [1.05, .15, .8, .62], [.1, .6, .65, .55]];
  const clumps: ClumpSpec[] = mounds.map(([x, z, r, h], i) => ({
    at: v3(x, h * .78, z), radii: v3(r * (.95 + rand(i) * .15), h, r * .82), tiles, shaded: SHADE, size: .62, solidBottom: true, spikes: .32,
  }));
  stems(mb, clumps.map(c => v3(c.at.x * .9, c.at.y * .8, c.at.z * .9)), lod);
  clumps.forEach((c, i) => clump(mb, c, volume, lod, rand, seed + i));
  return mb.build();
}

/** Clipped garden hedge, 4 x 1.5 m and 1.15 m tall: leaf cards over a rounded box. */
export function buildHedge(variant: number, lod: Lod) {
  const mb = new MeshBuilder(lod), seed = variant * 29 + 11, rand = (i: number) => plantHash(seed, i);
  const half = v3(1.95, .56, .7), center = v3(0, .58, 0), spacing = [.42, .66, 1.05][lod];
  const tiles: Tiles = variant ? [['cluster-emerald', .5], ['cluster-lime', .5]] : [['cluster-guava', .45], ['cluster-emerald', .4], ['hibiscus', .15]];
  const p = new THREE.Vector3(), n = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  let k = 0;
  // Faces: top, the two long sides and the two ends. Card normals bend toward the rounded corners.
  const faces: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
    [v3(0, 1, 0), v3(1, 0, 0), v3(0, 0, 1)], [v3(0, 0, 1), v3(1, 0, 0), v3(0, 1, 0)], [v3(0, 0, -1), v3(1, 0, 0), v3(0, 1, 0)],
    [v3(1, 0, 0), v3(0, 0, 1), v3(0, 1, 0)], [v3(-1, 0, 0), v3(0, 0, 1), v3(0, 1, 0)],
  ];
  for (const [normal, a, b] of faces) {
    const ea = Math.abs(a.dot(half)), eb = Math.abs(b.dot(half)), en = Math.abs(normal.dot(half));
    const na = Math.max(1, Math.round(ea * 2 / spacing)), nb = Math.max(1, Math.round(eb * 2 / spacing));
    for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++, k++) {
      const fa = ((i + .5) / na * 2 - 1) * ea * .92 + (rand(k) - .5) * spacing * .4;
      const fb = ((j + .5) / nb * 2 - 1) * eb * .92 + (rand(k + 1000) - .5) * spacing * .4;
      if (normal.y === 0 && b.y === 1 && fb < -eb * .75 && rand(k + 2000) < .5) continue;
      // Larger far cards sit deeper so the clipped silhouette holds at every LOD.
      p.copy(center).addScaledVector(normal, en * ([.9, .8, .74][lod] + rand(k + 3000) * .12)).addScaledVector(a, fa).addScaledVector(b, fb);
      if (p.y < .12) continue;
      const face = normal.clone().add(v3(rand(k + 4000) - .5, rand(k + 4001) - .5, rand(k + 4002) - .5).multiplyScalar(.45)).normalize();
      up.copy(Math.abs(face.y) > .8 ? a : UP).addScaledVector(face, -(Math.abs(face.y) > .8 ? a : UP).dot(face)).normalize().applyAxisAngle(face, (rand(k + 5000) - .5) * 2);
      right.crossVectors(up, face).normalize();
      const high = THREE.MathUtils.smoothstep(p.y, .1, 1.15);
      const shade = lerp(.66, 1.1, high), name = tiles[Math.floor(rand(k + 6000) * tiles.length)][0];
      const rounded = new THREE.Vector3((p.x - center.x) / half.x, (p.y - center.y) / half.y, (p.z - center.z) / half.z).normalize();
      n.copy(normal).multiplyScalar(.55).addScaledVector(rounded, .45).normalize();
      const nn = n.clone();
      card(mb, FOLIAGE_TILES[name], p, right, up, { width: Math.min([.85, .9, 1.05][lod], spacing * (1.45 + rand(k + 7000) * .35)), anchor: 'center', bow: .05, segmentsY: 1,
        color: new THREE.Color(shade * .97, shade, shade * .95), sway: .05, swayTip: .09, kind: KIND.leaf, normal: () => nn });
    }
  }
  return mb.build();
}

/** Cróton: a fan of glossy variegated yellow, orange and red leaves. */
export function buildCroton(variant: number, lod: Lod) {
  const mb = new MeshBuilder(lod), seed = variant * 31 + 3, rand = (i: number) => plantHash(seed, i);
  const tile = FOLIAGE_TILES.croton, cards = [5, 4, 3][lod];
  for (let k = 0; k < cards; k++) {
    const a = k / cards * Math.PI + variant * .6 + rand(k) * .3, tilt = k >= 3 ? (18 + rand(k + 5) * 12) * Math.PI / 180 : rand(k + 5) * .12;
    const out = v3(Math.cos(a + Math.PI / 2), 0, Math.sin(a + Math.PI / 2));
    const right = v3(Math.cos(a), 0, Math.sin(a)), up = UP.clone().applyAxisAngle(right, tilt * (k % 2 ? 1 : -1));
    const face = new THREE.Vector3().crossVectors(right, up).normalize();
    const width = (k >= 3 ? .85 : 1.05) * (.92 + rand(k + 9) * .16);
    card(mb, tile, out.clone().multiplyScalar(.04), right, up, { width, anchor: 'root', bow: .06, cup: .04, segmentsY: lod === 0 ? 2 : 1,
      color: new THREE.Color(1.02, 1.0, .96), sway: .06, swayTip: .22, kind: KIND.leaf, flip: k % 2 === 1,
      normal: () => face.clone().multiplyScalar(.45).addScaledVector(UP, .55).normalize() });
  }
  return mb.build();
}

// ---------------------------------------------------------------- planters and flower beds

/** Upright accent cards (a heliconia spike, a strelitzia, a croton) standing out of a planting. */
function accent(mb: MeshBuilder, tile: FoliageTile, at: THREE.Vector3, width: number, rand: (i: number) => number, salt: number, cards = 2) {
  for (let c = 0; c < cards; c++) {
    const a = c / cards * Math.PI + rand(salt + c) * .5, right = v3(Math.cos(a), 0, Math.sin(a));
    const up = UP.clone().applyAxisAngle(right, (rand(salt + c + 5) - .5) * .3), face = new THREE.Vector3().crossVectors(right, up).normalize();
    card(mb, FOLIAGE_TILES[tile], at, right, up, { width: width * (.9 + rand(salt + c + 9) * .2), anchor: 'root', bow: .04, segmentsY: 2,
      color: new THREE.Color(1.02, 1.02, 1), sway: .04, swayTip: .22, kind: KIND.leaf, flip: c % 2 === 1,
      normal: () => face.clone().multiplyScalar(.45).addScaledVector(UP, .55).normalize() });
  }
}

/** Trails spilling over a rim and hanging down its outside, facing outward. */
function spill(mb: MeshBuilder, tiles: FoliageTile[], points: { at: THREE.Vector3; out: THREE.Vector3 }[], drop: number, rand: (i: number) => number, salt: number, segments = 2) {
  points.forEach(({ at, out }, k) => {
    const tile = FOLIAGE_TILES[tiles[k % tiles.length]], d = drop * (.75 + rand(salt + k) * .45);
    const right = new THREE.Vector3(-out.z, 0, out.x), up = v3(0, 1, 0).addScaledVector(out, -.12).normalize();
    const face = new THREE.Vector3().crossVectors(right, up).normalize();
    card(mb, tile, at, right, up, { width: Math.min(.42, d * tile.aspect * 1.3), height: d, anchor: 'root', bow: .03, segmentsY: segments,
      color: new THREE.Color(1, 1, 1), sway: .02, swayTip: .14, kind: KIND.leaf, flip: rand(salt + k + 7) < .5,
      normal: () => face.clone().multiplyScalar(.8).add(v3(0, .5, 0)).normalize() });
  });
}

const POTS: { mound: Tiles; trails: FoliageTile[]; accent?: FoliageTile }[] = [
  { mound: [['bougainvillea-mound', .55], ['cluster-bougainvillea', .45]], trails: ['trail-magenta', 'trail-pink'] },
  { mound: [['croton', .45], ['cluster-lime', .35], ['cluster-emerald', .2]], trails: ['trail-leafy'], accent: 'strelitzia' },
  { mound: [['hibiscus', .45], ['cluster-hibiscus', .35], ['cluster-emerald', .2]], trails: [], accent: 'heliconia' },
  { mound: [['cluster-emerald', .45], ['cluster-lime', .35], ['impatiens', .2]], trails: ['trail-leafy', 'trail-coral'], accent: 'bromeliad' },
];

/** Planting for the kit's round planter (rim radius 0.76 m, rim top 0.9 m at scale 1): a dense mound
 * over the soil, trails over the rim, sometimes a tall accent. Template origin is the planter base. */
export function buildPot(variant: number, lod: Lod) {
  const mb = new MeshBuilder(lod), seed = variant * 53 + 19, rand = (i: number) => plantHash(seed, i), style = POTS[variant % POTS.length];
  const volume: CrownVolume = { center: v3(0, 1.15, 0), radii: v3(.8, .45, .8) };
  clump(mb, { at: v3(0, 1.14, 0), radii: v3(.74, .36, .74), tiles: style.mound, shaded: SHADE, size: .42, solidBottom: true, spikes: .3, density: 1.1 }, volume, lod, rand, seed);
  if (style.trails.length) {
    // The far template keeps four single-quad trails so the pot's outline does not shrink.
    const n = [6, 4, 4][lod];
    spill(mb, style.trails, Array.from({ length: n }, (_, k) => {
      const a = (k / n + rand(k + 30) * .12) * Math.PI * 2, out = v3(Math.cos(a), 0, Math.sin(a));
      return { at: out.clone().multiplyScalar(.74).setY(.98), out };
    }), .55, rand, 40, lod === 2 ? 1 : 2);
  }
  if (style.accent) accent(mb, style.accent, v3(0, 1.1, 0), style.accent === 'bromeliad' ? .6 : .8, rand, 60, lod === 2 ? 1 : 2);
  return mb.build();
}

const BEDS: { mound: Tiles; accents: FoliageTile[] }[] = [
  { mound: [['impatiens', .5], ['croton', .25], ['cluster-emerald', .25]], accents: ['heliconia', 'bromeliad'] },
  { mound: [['hibiscus', .4], ['cluster-hibiscus', .3], ['impatiens', .3]], accents: ['strelitzia'] },
  { mound: [['bougainvillea-mound', .45], ['impatiens', .3], ['cluster-lime', .25]], accents: ['bromeliad', 'croton'] },
  { mound: [['croton', .4], ['impatiens', .35], ['cluster-emerald', .25]], accents: ['heliconia', 'strelitzia'] },
];

/** Planting for the kit's flower bed (3 x 1.5 m soil at 0.16 m): a low flowering mass that fills
 * the bed edge to edge, with a few taller accents. Template origin is the bed centre on the ground. */
export function buildBed(variant: number, lod: Lod) {
  const mb = new MeshBuilder(lod), seed = variant * 59 + 23, rand = (i: number) => plantHash(seed, i), style = BEDS[variant % BEDS.length];
  const volume: CrownVolume = { center: v3(0, .45, 0), radii: v3(1.55, .45, .75) };
  for (const x of [-.95, 0, .95]) clump(mb, { at: v3(x, .36, 0), radii: v3(.66, .3, .7), tiles: style.mound, shaded: SHADE, size: .38, solidBottom: true, spikes: .25, density: 1.05 },
    volume, lod, rand, seed + Math.round(x * 10));
  // A skirt of leaves along the bed's rim, so no bare soil or mound shows at the edges.
  if (lod < 2) {
    const edge: { at: THREE.Vector3; out: THREE.Vector3 }[] = [];
    for (let i = 0; i < 7; i++) for (const side of [-1, 1]) edge.push({ at: v3(-1.3 + i * .43, .24, side * .66), out: v3(0, 0, side) });
    for (const side of [-1, 1]) for (const z of [-.3, .3]) edge.push({ at: v3(side * 1.44, .24, z), out: v3(side, 0, 0) });
    edge.forEach(({ at, out }, k) => {
      const right = new THREE.Vector3(-out.z, 0, out.x), up = UP.clone().addScaledVector(out, .35).normalize(), face = new THREE.Vector3().crossVectors(right, up).normalize();
      const name = style.mound[k % style.mound.length][0], shade = lerp(.82, 1, rand(k + 90));
      card(mb, FOLIAGE_TILES[name], at, right, up, { width: .52 + rand(k + 91) * .12, anchor: 'center', bow: .03, segmentsY: 1,
        color: new THREE.Color(shade, shade, shade * .96), sway: .03, swayTip: .08, kind: KIND.leaf, flip: k % 2 === 1,
        normal: () => face.clone().multiplyScalar(.6).addScaledVector(UP, .4).normalize() });
    });
  }
  if (lod < 2) style.accents.forEach((tile, k) => {
    const x = (k - (style.accents.length - 1) / 2) * 1.3 + (rand(k + 70) - .5) * .3;
    accent(mb, tile, v3(x, .3, (rand(k + 71) - .5) * .4), tile === 'bromeliad' || tile === 'croton' ? .6 : .82, rand, 80 + k * 5, lod === 0 ? 2 : 1);
  });
  return mb.build();
}
