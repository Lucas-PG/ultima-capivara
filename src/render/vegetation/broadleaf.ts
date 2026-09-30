import * as THREE from 'three';
import type { SpeciesId } from '../../shared/vegetation-species';
import type { FoliageTile } from './atlas';
import { buildCrownTree, type ClumpSpec, type CrownSpec } from './crowns';
import type { Lod } from './palms';

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
type Tiles = [FoliageTile, number][];
type Rand = (i: number) => number;

interface Ring { n: number; radius: number; y: number; radii: [number, number, number]; size: number; phase?: number; density?: number; tiles: Tiles; shaded?: Tiles; wobble?: number; lift?: number }

/** Clumps on a ring around the trunk axis; `wobble` lets variants shift every clump a little,
 * `lift` alternates clump heights so a tier does not read as a flat collar. */
function ring(r: Ring, rand: Rand, variant: number, salt: number): ClumpSpec[] {
  return Array.from({ length: r.n }, (_, k) => {
    const a = (k / r.n + (r.phase ?? 0) + variant * .13) * Math.PI * 2 + (rand(salt + k) - .5) * .5;
    const radius = r.radius * (.9 + rand(salt + 20 + k) * .2), w = r.wobble ?? .16;
    const s = 1 + (rand(salt + 40 + k) - .5) * w * 2;
    const lift = (r.lift ?? .25) * (k % 2 ? 1 : -1) + (rand(salt + 60 + k) - .5) * .4;
    return { at: v3(Math.cos(a) * radius, r.y + lift, Math.sin(a) * radius),
      radii: v3(r.radii[0] * s, r.radii[1] * (1 + (rand(salt + 80 + k) - .5) * w), r.radii[2] * s),
      tiles: r.tiles, shaded: r.shaded, size: r.size, density: r.density };
  });
}
const one = (at: [number, number, number], radii: [number, number, number], size: number, tiles: Tiles, shaded?: Tiles, density?: number): ClumpSpec =>
  ({ at: v3(...at), radii: v3(...radii), size, tiles, shaded, density });

const LIGHT: Tiles = [['cluster-lime', .5], ['cluster-emerald', .35], ['cluster-guava', .15]];
const DARK: Tiles = [['cluster-emerald', .3], ['cluster-guava', .3], ['cluster-teal', .4]];
const BROAD: Tiles = [['cluster-emerald', .5], ['cluster-lime', .3], ['cluster-guava', .2]];
const MANGO: Tiles = [['cluster-mango', .6], ['cluster-emerald', .25], ['cluster-lime', .15]];

/** Mango: a dense, dark, broad dome on a short heavy trunk, the shade tree beside every house.
 * Three tiers of masses with sky between them, not one ball. */
const mango: CrownSpec = {
  species: 'mango', center: v3(0, 5, 0), radii: v3(3.6, 2.6, 3.6), limb: .55, arch: .22,
  clumps: (v, rand) => [
    one([.2, 6.5, -.1], [1.9, 1.3, 1.9], 1.2, MANGO, DARK),
    ...ring({ n: 4, radius: 2.2, y: 5.5, radii: [1.55, 1.15, 1.55], size: 1.15, tiles: MANGO, shaded: DARK }, rand, v, 100),
    ...ring({ n: 5, radius: 3.2, y: 4.2, radii: [1.45, 1.0, 1.45], size: 1.1, phase: .1, tiles: MANGO, shaded: DARK, lift: .3 }, rand, v, 200),
  ],
};

/** Almond (amendoeira): the tiered shore tree, flat layers of leaves stacked like a pagoda. */
const almond: CrownSpec = {
  species: 'almond', center: v3(0, 5.4, 0), radii: v3(3.5, 1.9, 3.5), limb: .5, arch: .12,
  clumps: (v, rand) => [
    ...ring({ n: 5, radius: 2.6, y: 4.4, radii: [1.6, .55, 1.6], size: 1.25, tiles: BROAD, shaded: DARK, lift: .12 }, rand, v, 100),
    ...ring({ n: 4, radius: 1.7, y: 5.65, radii: [1.35, .5, 1.35], size: 1.2, phase: .12, tiles: BROAD, shaded: DARK, lift: .1 }, rand, v, 200),
    one([0, 6.7, 0], [1.3, .5, 1.3], 1.15, LIGHT, DARK),
  ],
};

/** Jungle giant: a tall buttressed trunk carrying a narrower crown in three offset tiers. */
const jungle: CrownSpec = {
  species: 'jungle', center: v3(0, 6.4, 0), radii: v3(2.8, 2.6, 2.8), limb: .5, arch: .35, roots: 'buttress',
  clumps: (v, rand) => [
    ...ring({ n: 4, radius: 2.3, y: 5.1, radii: [1.45, .95, 1.45], size: 1.15, tiles: BROAD, shaded: DARK }, rand, v, 100),
    ...ring({ n: 4, radius: 1.8, y: 6.6, radii: [1.4, 1.0, 1.4], size: 1.15, phase: .125, tiles: BROAD, shaded: DARK }, rand, v, 200),
    one([0, 8.0, 0], [1.5, 1.05, 1.5], 1.15, LIGHT, DARK),
  ],
};

/** Cashew (cajueiro): low, wide and sprawling over the dunes on a twisted leaning trunk. */
const cashew: CrownSpec = {
  species: 'cashew', center: v3(0, 2.9, 0), radii: v3(3.4, 1.5, 3.4), limb: .6, arch: .15,
  clumps: (v, rand) => [
    one([.4, 3.5, 0], [1.6, .9, 1.6], 1.1, LIGHT, DARK),
    ...ring({ n: 6, radius: 2.6, y: 2.6, radii: [1.4, .8, 1.4], size: 1.05, tiles: LIGHT, shaded: DARK, wobble: .24, lift: .2 }, rand, v, 100),
  ],
};

/** Flamboyant (flamboiã): a broad flat umbrella of feathery leaves and scarlet flowers. */
const umbrella: CrownSpec = {
  species: 'umbrella', center: v3(0, 7, 0), radii: v3(4.8, 1.3, 4.8), limb: .5, arch: .2,
  clumps: (v, rand) => {
    // A flaming umbrella: scarlet blooms over fine feathery leaves.
    const tiles: Tiles = [['cluster-flame', .58], ['flamboyant-leaves', .42]];
    const shaded: Tiles = [['flamboyant-leaves', .55], ['cluster-flame', .3], ['cluster-emerald', .15]];
    return [
      one([0, 7.5, 0], [2.2, .85, 2.2], 1.2, tiles, shaded),
      ...ring({ n: 6, radius: 3.1, y: 7.0, radii: [1.8, .7, 1.8], size: 1.2, tiles, shaded, lift: .12 }, rand, v, 100),
      ...ring({ n: 7, radius: 4.6, y: 6.4, radii: [1.3, .55, 1.3], size: 1.15, phase: .08, tiles, shaded, lift: .1 }, rand, v, 200),
    ];
  },
};

/** Ipê: a vase of bare limbs smothered in trumpet flowers. */
function ipe(species: 'ipe-yellow' | 'ipe-pink'): CrownSpec {
  const bloom: FoliageTile = species === 'ipe-yellow' ? 'cluster-ipe-yellow' : 'cluster-ipe-pink';
  // In bloom the ipe is nearly leafless: flowers over the whole crown, a little green deep inside.
  const tiles: Tiles = [[bloom, .92], ['cluster-lime', .08]], shaded: Tiles = [[bloom, .72], ['cluster-emerald', .28]];
  return { species, center: v3(0, 5.8, 0), radii: v3(3.1, 2.1, 3.1), limb: .5, arch: .35,
    clumps: (v, rand) => [
      one([0, 6.9, 0], [1.7, 1.1, 1.7], 1.1, tiles, shaded, .95),
      ...ring({ n: 4, radius: 1.9, y: 6.0, radii: [1.4, 1.0, 1.4], size: 1.05, tiles, shaded, density: .95 }, rand, v, 100),
      ...ring({ n: 4, radius: 2.8, y: 5.1, radii: [1.1, .8, 1.1], size: 1.0, phase: .1, tiles, shaded, density: .9 }, rand, v, 200),
    ] };
}

/** Mangrove: a compact glossy crown lifted on arching prop roots. */
const mangrove: CrownSpec = {
  species: 'mangrove', center: v3(0, 3.8, 0), radii: v3(2.9, 1.8, 2.9), limb: .55, arch: .2, roots: 'prop', bark: [.46, .36, .27],
  clumps: (v, rand) => {
    const tiles: Tiles = [['cluster-guava', .55], ['cluster-emerald', .3], ['cluster-teal', .15]];
    return [
      one([0, 4.6, 0], [1.7, 1.0, 1.7], 1.05, tiles, DARK),
      ...ring({ n: 5, radius: 1.9, y: 3.6, radii: [1.45, .95, 1.45], size: 1.05, tiles, shaded: DARK }, rand, v, 100),
    ];
  },
};

export const CROWNS: Partial<Record<SpeciesId, CrownSpec>> = {
  mango, almond, jungle, cashew, umbrella, mangrove, 'ipe-yellow': ipe('ipe-yellow'), 'ipe-pink': ipe('ipe-pink'),
};

export const broadleafBuilder = (species: SpeciesId) => (variant: number, lod: Lod) => buildCrownTree(CROWNS[species]!, variant, lod);
