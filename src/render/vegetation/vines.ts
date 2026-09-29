import * as THREE from 'three';
import { plantHash } from '../../shared/vegetation-species';
import { FOLIAGE_TILES, type FoliageTile } from './atlas';
import { clump } from './crowns';
import { KIND, MeshBuilder, card } from './mesh-builder';
import type { Lod } from './palms';

const lerp = THREE.MathUtils.lerp;
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

interface VineStyle { width: number; trails: FoliageTile[]; top: [FoliageTile, number][] }
const STYLES: VineStyle[] = [
  { width: 2.2, trails: ['trail-magenta', 'trail-magenta', 'trail-pink'], top: [['bougainvillea-mound', .55], ['cluster-bougainvillea', .35], ['cluster-emerald', .1]] },
  { width: 1.7, trails: ['trail-pink', 'trail-magenta'], top: [['bougainvillea-mound', .65], ['cluster-bougainvillea', .35]] },
  { width: 2.0, trails: ['trail-coral', 'trail-coral', 'trail-leafy'], top: [['cluster-flame', .5], ['cluster-lime', .3], ['cluster-emerald', .2]] },
  { width: 2.6, trails: ['trail-magenta', 'trail-leafy', 'trail-pink', 'trail-magenta'], top: [['bougainvillea-mound', .45], ['cluster-bougainvillea', .35], ['cluster-emerald', .2]] },
];

/** Bougainvillea spilling over a wall top. Template space: the wall's outer face is the plane
 * z = 0 with the plant on +z, the origin sits on the wall top edge and the trails hang 2 m down. */
export function buildVine(variant: number, lod: Lod) {
  const mb = new MeshBuilder(lod), seed = variant * 47 + 13, rand = (i: number) => plantHash(seed, i);
  const style = STYLES[variant % STYLES.length], half = style.width / 2;
  const trails = [7, 4, 3][lod] + (variant === 3 ? 1 : 0);
  for (let k = 0; k < trails; k++) {
    const name = style.trails[k % style.trails.length], tile = FOLIAGE_TILES[name];
    const spread = lerp(-1, 1, trails === 1 ? .5 : k / (trails - 1)) + (rand(k) - .5) * .25;
    const drop = 2 * (.7 + rand(k + 10) * .4) * (1 - Math.abs(spread) * .3);
    const width = Math.min(.8, drop * tile.aspect * 1.35);
    // The trails stay inside the style width, so a drape placed flush with a corner never overhangs it.
    const x = THREE.MathUtils.clamp(spread * (half - width / 2), -half + width / 2, half - width / 2);
    // Trails hang down from the top edge and swing slightly off the wall toward their tips.
    const tilt = (4 + rand(k + 20) * 8) * Math.PI / 180, up = v3((rand(k + 30) - .5) * .12, Math.cos(tilt), -Math.sin(tilt)).normalize();
    const right = new THREE.Vector3(1, 0, 0), face = new THREE.Vector3().crossVectors(right, up).normalize();
    const shade = lerp(.86, 1.06, rand(k + 40));
    card(mb, tile, v3(x, -.08 - rand(k + 50) * .12, .05 + rand(k + 60) * .12), right, up, {
      width, height: drop, anchor: 'root', bow: .05, segmentsY: lod === 0 ? 3 : 2, color: new THREE.Color(shade, shade, shade),
      sway: .02, swayTip: .16, kind: KIND.leaf, flip: rand(k + 70) < .5,
      normal: () => face.clone().multiplyScalar(.8).add(v3(0, .5, 0)).normalize(),
    });
  }
  // A rolling mass of leaves and bracts along the top of the wall.
  clump(mb, { at: v3(0, -.2, .34), radii: v3(half * .8, .24, .28), tiles: style.top, size: .46, spikes: .15, density: 1.2 },
    { center: v3(0, -.4, .2), radii: v3(half, .8, .5) }, lod, rand, seed);
  return mb.build();
}
