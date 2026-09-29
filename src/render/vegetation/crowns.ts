import * as THREE from 'three';
import { plantHash, type SpeciesId } from '../../shared/vegetation-species';
import { plantStemTemplate } from '../../shared/vegetation-trunks';
import { FOLIAGE_TILES, type FoliageTile } from './atlas';
import { KIND, MeshBuilder, card, tube } from './mesh-builder';
import { trunkPolyline, type Lod } from './palms';

const UP = new THREE.Vector3(0, 1, 0);
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const lerp = THREE.MathUtils.lerp;
const smooth = THREE.MathUtils.smoothstep;
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Tint each tile so the canopy sits in the bible's three values: lit #86BD4F, mid #5FA544, core #3F8A4A. */
const TILE_TINT: Record<string, [number, number, number]> = {
  'cluster-lime': [1.02, 1.02, .95], 'cluster-emerald': [1, 1, 1], 'cluster-guava': [.98, 1, .98], 'cluster-teal': [.92, 1, 1],
};

export interface ClumpSpec {
  at: THREE.Vector3;
  radii: THREE.Vector3;
  /** Weighted tile choice; heavier weights near the top pick the first entries more often. */
  tiles: [FoliageTile, number][];
  /** Card width in metres at LOD0. */
  size: number;
  /** Multiplier on the card count. */
  density?: number;
  /** Tile weights used below the crown's mid-height (darker leaves inside and under). */
  shaded?: [FoliageTile, number][];
  tint?: [number, number, number];
}

export interface CrownSpec {
  species: SpeciesId;
  center: THREE.Vector3;
  radii: THREE.Vector3;
  clumps: (variant: number, rand: (i: number) => number) => ClumpSpec[];
  /** Main limbs from the fork to every clump: thickness relative to the trunk top. */
  limb: number;
  /** Extra bark: prop roots (mangrove) or buttresses. */
  roots?: 'prop' | 'buttress';
  bark?: [number, number, number];
}

function pick(list: [FoliageTile, number][], r: number) {
  let total = 0; for (const [, w] of list) total += w;
  let at = r * total;
  for (const [name, w] of list) { at -= w; if (at <= 0) return name; }
  return list[0][0];
}

/** A clump is a skin of large painted sprig cards facing outward, with radial
 * cards on LOD0 breaking its outline. Normals follow the clump and crown volumes,
 * so light rolls over the whole mass instead of over each card. */
function clump(mb: MeshBuilder, c: ClumpSpec, crown: CrownSpec, lod: Lod, rand: (i: number) => number, seed: number) {
  const radius = Math.cbrt(c.radii.x * c.radii.y * c.radii.z);
  const size = c.size * [1, 1.55, 2.4][lod];
  const count = Math.max(lod === 2 ? 3 : 5, Math.round(29 * Math.pow(radius / size, 2) * (c.density ?? 1)));
  const p = new THREE.Vector3(), face = new THREE.Vector3(), up = new THREE.Vector3(), right = new THREE.Vector3();
  const nrm = new THREE.Vector3(), tmp = new THREE.Vector3();
  const tint = c.tint ?? [1, 1, 1];
  for (let k = 0; k < count; k++) {
    const y = 1 - 2 * (k + .5) / count, ring = Math.sqrt(1 - y * y), a = k * GOLDEN + seed * 1.7;
    const dir = v3(Math.cos(a) * ring, y, Math.sin(a) * ring);
    // Keep the underside airier: most of the lower cards are skipped so limbs show from below.
    if (y < -.35 && rand(k + 500) < .55) continue;
    const spike = lod === 0 && rand(k + 100) < .22;
    // Larger LOD cards overhang their skin, so seat them deeper to keep the crown's outline.
    const depth = (spike ? 1.05 : .8 + rand(k + 200) * .2) * [1, .94, .8][lod];
    p.set(c.at.x + dir.x * c.radii.x * depth, c.at.y + dir.y * c.radii.y * depth, c.at.z + dir.z * c.radii.z * depth);
    face.copy(dir).add(tmp.set(rand(k + 300) - .5, rand(k + 301) - .5, rand(k + 302) - .5).multiplyScalar(.5)).normalize();
    if (spike) {
      // Standing-out sprig: its tip points away from the clump and its plane runs radially.
      up.copy(dir).addScaledVector(UP, .25).normalize();
      face.crossVectors(up, tmp.set(dir.z, 0, -dir.x).normalize()).normalize();
    } else {
      up.copy(UP).addScaledVector(face, -UP.dot(face));
      if (up.lengthSq() < .01) up.set(1, 0, 0);
      up.normalize().applyAxisAngle(face, (rand(k + 400) - .5) * 2.4);
    }
    right.crossVectors(up, face).normalize();
    const high = smooth(p.y - crown.center.y, -crown.radii.y * .6, crown.radii.y * .9);
    const name = pick(high > .42 || !c.shaded ? c.tiles : c.shaded, rand(k + 600));
    const tile = FOLIAGE_TILES[name], tone = TILE_TINT[name] ?? [1, 1, 1];
    // Painted light: bright warm tops, cool shaded undersides, dark inside the mass.
    const inside = Math.hypot((p.x - crown.center.x) / crown.radii.x, (p.y - crown.center.y) / crown.radii.y, (p.z - crown.center.z) / crown.radii.z);
    const ao = lerp(.58, 1, smooth(inside, .35, 1));
    const k1 = lerp(.7, 1.12, high) * ao * (spike ? 1.06 : 1);
    const cr = tone[0] * tint[0] * k1 * lerp(.92, 1.06, high), cg = tone[1] * tint[1] * k1, cb = tone[2] * tint[2] * k1 * lerp(1.06, .9, high);
    const color = new THREE.Color(cr, cg, cb);
    const width = size * (.85 + rand(k + 700) * .4);
    const sway = .1 + .14 * high;
    card(mb, tile, p, right, up, {
      width, anchor: 'center', bow: width * .1, cup: width * .04, segmentsY: lod === 0 ? 2 : 1, color,
      sway, swayTip: sway * 1.4, kind: KIND.leaf,
      normal: q => {
        nrm.set((q.x - c.at.x) / c.radii.x, (q.y - c.at.y) / c.radii.y, (q.z - c.at.z) / c.radii.z).normalize().multiplyScalar(.55);
        tmp.set((q.x - crown.center.x) / crown.radii.x, (q.y - crown.center.y) / crown.radii.y, (q.z - crown.center.z) / crown.radii.z)
          .normalize().multiplyScalar(.35);
        return new THREE.Vector3().copy(nrm).add(tmp).addScaledVector(face, .12).normalize();
      },
    });
  }
}

function limb(mb: MeshBuilder, from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, sides: number, bark: THREE.Color, arch = .18) {
  const mid = from.clone().lerp(to, .5); mid.y += from.distanceTo(to) * arch;
  const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
  const steps = sides > 4 ? 4 : 2;
  const points = curve.getPoints(steps), radii = points.map((_, i) => lerp(r0, r1, i / steps));
  tube(mb, points, radii, { sides, kind: KIND.limb, swayBase: 0, swayTop: .06, uvScale: 1, color: () => bark });
}

export function buildCrownTree(spec: CrownSpec, variant: number, lod: Lod) {
  const mb = new MeshBuilder(lod);
  const species = spec.species;
  const seed = variant * 13 + species.length * 7 + 3;
  const rand = (i: number) => plantHash(seed, i);
  const bark = new THREE.Color(...(spec.bark ?? [.54, .38, .25]));
  const sections = plantStemTemplate(species, lod === 0 ? undefined : lod === 1 ? 4 : 3, variant);
  const { points, radii } = trunkPolyline(sections, lod === 0 ? 2 : 1);
  tube(mb, points, radii, { sides: [9, 7, 5][lod], kind: KIND.trunk, swayBase: 0, swayTop: .03, uvScale: 1,
    color: t => bark.clone().multiplyScalar(lerp(.7, 1.02, smooth(t, 0, .3))) });
  const fork = points[points.length - 1].clone(), topRadius = radii[radii.length - 1];
  const clumps = spec.clumps(variant, rand);
  const limbSides = lod === 0 ? 6 : lod === 1 ? 4 : 3;
  const size = (c: ClumpSpec) => Math.cbrt(c.radii.x * c.radii.y * c.radii.z);
  const biggest = Math.max(...clumps.map(size));
  // Primary limbs reach the larger clumps; smaller ones ride on foliage alone.
  clumps.forEach((c, i) => {
    if (size(c) < biggest * .6 || (lod === 2 && i % 2 === 1)) return;   // limbs only; every clump keeps its foliage
    const dir = c.at.clone().sub(fork), length = dir.length();
    const end = fork.clone().addScaledVector(dir.normalize(), Math.max(0, length - Math.min(c.radii.x, c.radii.y) * .25));
    const r0 = topRadius * spec.limb * Math.min(1, .55 + size(c) / biggest * .45);
    limb(mb, fork.clone().add(v3(0, -.05, 0)), end, r0, Math.max(.035, r0 * .3), limbSides, bark, .3);
  });
  if (spec.roots && lod < 2) {
    const n = spec.roots === 'prop' ? 7 : 5, sides = lod === 0 ? 5 : 4;
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 + rand(k + 900), reach = spec.roots === 'prop' ? 1.5 + rand(k + 901) * 1.2 : .9 + rand(k + 901) * .5;
      const start = spec.roots === 'prop' ? v3(Math.cos(a) * .18, 1.6 + rand(k + 902) * .3, Math.sin(a) * .18) : v3(Math.cos(a) * .2, .9, Math.sin(a) * .2);
      const end = v3(Math.cos(a) * reach, -.05, Math.sin(a) * reach);
      const root = new THREE.QuadraticBezierCurve3(start, v3(Math.cos(a) * reach * .55, start.y * .95, Math.sin(a) * reach * .55), end).getPoints(4);
      tube(mb, root, root.map((_, i) => lerp(spec.roots === 'prop' ? .09 : .16, .04, i / 4)),
        { sides, kind: KIND.limb, swayBase: 0, swayTop: 0, uvScale: 1, color: () => bark });
    }
  }
  clumps.forEach((c, i) => clump(mb, c, spec, lod, rand, seed + i));
  return mb.build();
}
