import * as THREE from 'three';
import type { SpeciesId } from '../../shared/vegetation-species';
import type { FoliageTile } from './atlas';
import { buildCrownTree, type ClumpSpec, type CrownSpec } from './crowns';
import type { Lod } from './palms';

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
type Tiles = [FoliageTile, number][];
type Rand = (i: number) => number;

interface Ring { n: number; radius: number; y: number; radii: [number, number, number]; size: number; phase?: number; density?: number; tiles: Tiles; shaded?: Tiles; wobble?: number }

/** Clumps on a ring around the trunk axis; `wobble` lets variants shift every clump a little. */
function ring(r: Ring, rand: Rand, variant: number, salt: number): ClumpSpec[] {
  return Array.from({ length: r.n }, (_, k) => {
    const a = (k / r.n + (r.phase ?? 0) + variant * .13) * Math.PI * 2 + (rand(salt + k) - .5) * .5;
    const radius = r.radius * (.92 + rand(salt + 20 + k) * .16), w = r.wobble ?? .16;
    const s = 1 + (rand(salt + 40 + k) - .5) * w * 2;
    return { at: v3(Math.cos(a) * radius, r.y + (rand(salt + 60 + k) - .5) * .5, Math.sin(a) * radius),
      radii: v3(r.radii[0] * s, r.radii[1] * (1 + (rand(salt + 80 + k) - .5) * w), r.radii[2] * s),
      tiles: r.tiles, shaded: r.shaded, size: r.size, density: r.density };
  });
}
const one = (at: [number, number, number], radii: [number, number, number], size: number, tiles: Tiles, shaded?: Tiles, density?: number): ClumpSpec =>
  ({ at: v3(...at), radii: v3(...radii), size, tiles, shaded, density });

const LIGHT: Tiles = [['cluster-lime', .5], ['cluster-emerald', .35], ['cluster-guava', .15]];
const DARK: Tiles = [['cluster-emerald', .3], ['cluster-guava', .3], ['cluster-teal', .4]];
const BROAD: Tiles = [['cluster-emerald', .5], ['cluster-lime', .3], ['cluster-guava', .2]];

/** Mango: a dense, dark, top-heavy dome, the shade tree beside every house. */
const mango: CrownSpec = {
  species: 'mango', center: v3(0, 5, 0), radii: v3(3.5, 2.7, 3.5), limb: .5,
  clumps: (v, rand) => [
    one([0, 6.1, 0], [2.2, 1.7, 2.2], 1.25, LIGHT, DARK),
    ...ring({ n: 6, radius: 2.1, y: 5.2, radii: [1.8, 1.4, 1.8], size: 1.2, tiles: LIGHT, shaded: DARK }, rand, v, 100),
    ...ring({ n: 5, radius: 3.0, y: 4.1, radii: [1.5, 1.1, 1.5], size: 1.15, phase: .1, tiles: LIGHT, shaded: DARK }, rand, v, 200),
    ...ring({ n: 3, radius: 1.0, y: 6.6, radii: [1.0, .8, 1.0], size: 1.0, phase: .3, tiles: LIGHT }, rand, v, 300),
  ],
};

/** Almond (amendoeira): the tiered shore tree, one flat layer of leaves above another. */
const almond: CrownSpec = {
  species: 'almond', center: v3(0, 5.4, 0), radii: v3(3.4, 1.9, 3.4), limb: .5,
  clumps: (v, rand) => [
    ...ring({ n: 5, radius: 2.3, y: 4.4, radii: [1.8, .75, 1.8], size: 1.3, tiles: BROAD, shaded: DARK }, rand, v, 100),
    ...ring({ n: 4, radius: 1.6, y: 5.6, radii: [1.5, .65, 1.5], size: 1.25, phase: .12, tiles: BROAD, shaded: DARK }, rand, v, 200),
    one([0, 6.6, 0], [1.4, .65, 1.4], 1.2, LIGHT, DARK),
  ],
};

/** Jungle giant: a tall, narrower crown on a buttressed trunk. */
const jungle: CrownSpec = {
  species: 'jungle', center: v3(0, 6.3, 0), radii: v3(2.7, 2.7, 2.7), limb: .5, roots: 'buttress',
  clumps: (v, rand) => [
    one([0, 7.4, 0], [1.7, 1.6, 1.7], 1.2, LIGHT, DARK),
    ...ring({ n: 5, radius: 1.8, y: 6.4, radii: [1.55, 1.4, 1.55], size: 1.2, tiles: BROAD, shaded: DARK }, rand, v, 100),
    ...ring({ n: 4, radius: 2.3, y: 5.3, radii: [1.25, 1.0, 1.25], size: 1.15, phase: .1, tiles: BROAD, shaded: DARK }, rand, v, 200),
  ],
};

/** Cashew (cajueiro): low, wide and sprawling over the dunes. */
const cashew: CrownSpec = {
  species: 'cashew', center: v3(0, 2.9, 0), radii: v3(3.3, 1.6, 3.3), limb: .55,
  clumps: (v, rand) => [
    one([.3, 3.5, 0], [1.8, .95, 1.8], 1.15, LIGHT, DARK),
    ...ring({ n: 6, radius: 2.4, y: 2.6, radii: [1.6, .9, 1.6], size: 1.1, tiles: LIGHT, shaded: DARK, wobble: .22 }, rand, v, 100),
  ],
};

/** Flamboyant / monguba: a broad flat umbrella of feathery leaves and scarlet flowers. */
const umbrella: CrownSpec = {
  species: 'umbrella', center: v3(0, 7, 0), radii: v3(4.7, 1.4, 4.7), limb: .5,
  clumps: (v, rand) => {
    const tiles: Tiles = [['cluster-lime', .5], ['cluster-emerald', .15], ['cluster-flame', .35]];
    return [
      one([0, 7.5, 0], [2.3, .95, 2.3], 1.2, tiles, DARK),
      ...ring({ n: 6, radius: 3.0, y: 6.9, radii: [2.0, .85, 2.0], size: 1.25, tiles, shaded: DARK }, rand, v, 100),
      ...ring({ n: 6, radius: 4.3, y: 6.4, radii: [1.6, .7, 1.6], size: 1.2, phase: .08, tiles, shaded: DARK }, rand, v, 200),
    ];
  },
};

function ipe(species: 'ipe-yellow' | 'ipe-pink'): CrownSpec {
  const bloom: FoliageTile = species === 'ipe-yellow' ? 'cluster-ipe-yellow' : 'cluster-ipe-pink';
  const tiles: Tiles = [[bloom, .82], ['cluster-lime', .1], ['cluster-emerald', .08]], shaded: Tiles = [[bloom, .55], ['cluster-emerald', .45]];
  return { species, center: v3(0, 5.8, 0), radii: v3(3.1, 2.1, 3.1), limb: .5,
    clumps: (v, rand) => [
      one([0, 6.7, 0], [1.9, 1.2, 1.9], 1.15, tiles, shaded, .95),
      ...ring({ n: 5, radius: 1.8, y: 5.7, radii: [1.6, 1.1, 1.6], size: 1.1, tiles, shaded, density: .95 }, rand, v, 100),
      ...ring({ n: 4, radius: 2.7, y: 5.0, radii: [1.2, .9, 1.2], size: 1.05, phase: .1, tiles, shaded, density: .9 }, rand, v, 200),
    ] };
}

/** Mangrove: a compact crown lifted on arching prop roots. */
const mangrove: CrownSpec = {
  species: 'mangrove', center: v3(0, 3.8, 0), radii: v3(2.9, 1.9, 2.9), limb: .55, roots: 'prop',
  clumps: (v, rand) => {
    const tiles: Tiles = [['cluster-guava', .55], ['cluster-emerald', .3], ['cluster-teal', .15]];
    return [
      one([0, 4.6, 0], [1.8, 1.1, 1.8], 1.1, tiles, DARK),
      ...ring({ n: 5, radius: 1.8, y: 3.6, radii: [1.6, 1.1, 1.6], size: 1.1, tiles, shaded: DARK }, rand, v, 100),
      ...ring({ n: 3, radius: 2.6, y: 3.0, radii: [1.2, .8, 1.2], size: 1.05, phase: .1, tiles, shaded: DARK }, rand, v, 200),
    ];
  },
};

export const CROWNS: Partial<Record<SpeciesId, CrownSpec>> = {
  mango, almond, jungle, cashew, umbrella, mangrove, 'ipe-yellow': ipe('ipe-yellow'), 'ipe-pink': ipe('ipe-pink'),
};

export const broadleafBuilder = (species: SpeciesId) => (variant: number, lod: Lod) => buildCrownTree(CROWNS[species]!, variant, lod);
