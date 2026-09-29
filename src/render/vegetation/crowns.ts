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
  'cluster-lime': [1.0, 1.0, .93], 'cluster-emerald': [.98, 1, .98], 'cluster-guava': [.96, 1, .97], 'cluster-teal': [.9, .98, 1],
  'cluster-mango': [.96, 1, .96],
};

export interface ClumpSpec {
  at: THREE.Vector3;
  radii: THREE.Vector3;
  /** Weighted tile choice for the lit, upper part of the crown. */
  tiles: [FoliageTile, number][];
  /** Card width in metres at LOD0. */
  size: number;
  /** Multiplier on the card count. */
  density?: number;
  /** Tile weights used below the crown's mid-height (darker leaves inside and under). */
  shaded?: [FoliageTile, number][];
  tint?: [number, number, number];
  /** Keep every card down to the ground instead of leaving the underside airy (shrubs). */
  solidBottom?: boolean;
  /** Share of cards that stand out radially and break the outline (LOD0 only). */
  spikes?: number;
}

/** The volume a clump's light and occlusion are painted against. */
export type CrownVolume = Pick<CrownSpec, 'center' | 'radii'>;

export interface CrownSpec {
  species: SpeciesId;
  center: THREE.Vector3;
  radii: THREE.Vector3;
  clumps: (variant: number, rand: (i: number) => number) => ClumpSpec[];
  /** Main limbs from the fork to every clump: thickness relative to the trunk top. */
  limb: number;
  /** How much the limbs arch upward between fork and clump (fraction of their length). */
  arch?: number;
  /** Primary limbs the trunk splits into at the fork (default 3). */
  limbs?: number;
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
 * so light rolls over the whole mass instead of over each card. Every clump is
 * painted lit on top and shadowed underneath, so a crown reads as separate masses. */
export function clump(mb: MeshBuilder, c: ClumpSpec, crown: CrownVolume, lod: Lod, rand: (i: number) => number, seed: number) {
  const radius = Math.cbrt(c.radii.x * c.radii.y * c.radii.z);
  // Far templates use fewer, larger cards. On small clumps (bushes) the cards may not outgrow the
  // clump, or a bush would get taller with distance: there the far template simply thins out.
  const want = c.size * [1, 1.5, 2.2][lod], cap = radius < 1.05 ? Math.max(c.size * 1.2, radius * 1.25) : Infinity;
  const size = Math.min(want, cap), sparse = want > cap ? (cap / want) ** 2 : 1;
  const count = Math.max(lod === 2 ? 3 : 5, Math.round(29 * Math.pow(radius / size, 2) * (c.density ?? 1) * sparse));
  const p = new THREE.Vector3(), face = new THREE.Vector3(), up = new THREE.Vector3(), right = new THREE.Vector3();
  const nrm = new THREE.Vector3(), tmp = new THREE.Vector3();
  const tint = c.tint ?? [1, 1, 1];
  for (let k = 0; k < count; k++) {
    const y = 1 - 2 * (k + .5) / count, ring = Math.sqrt(1 - y * y), a = k * GOLDEN + seed * 1.7;
    const dir = v3(Math.cos(a) * ring, y, Math.sin(a) * ring);
    // Keep the underside airier: most of the lower cards are skipped so limbs show from below.
    if (y < -.35 && rand(k + 500) < (c.solidBottom ? 0 : .55)) continue;
    const spike = lod === 0 && rand(k + 100) < (c.spikes ?? .22);
    // Larger LOD cards overhang their skin, so seat them deeper to keep the crown's outline.
    const depth = (spike ? 1.05 : .8 + rand(k + 200) * .2) * [1, .94, .78][lod];
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
    // Height in the whole crown picks lit or shaded tiles; height in the clump paints its own light.
    const high = smooth(p.y - crown.center.y, -crown.radii.y * .6, crown.radii.y * .9);
    const own = smooth(dir.y, -.75, .8);
    // Far templates have few cards: pick tiles on a low-discrepancy sequence so every tile keeps its
    // share (a flamboyant stays red at 100 m), near ones pick freely.
    const name = pick(high > .42 || !c.shaded ? c.tiles : c.shaded, lod === 2 ? (k * .6180339 + seed * .1) % 1 : rand(k + 600));
    const tile = FOLIAGE_TILES[name], tone = TILE_TINT[name] ?? [1, 1, 1];
    // Painted light: bright warm tops, cool shaded undersides, dark inside the mass.
    const inside = Math.hypot((p.x - crown.center.x) / crown.radii.x, (p.y - crown.center.y) / crown.radii.y, (p.z - crown.center.z) / crown.radii.z);
    const ao = lerp(.6, 1, smooth(inside, .35, 1));
    const light = lerp(.58, 1.14, high * .45 + own * .55);
    const k1 = light * ao * (spike ? 1.05 : 1);
    const cr = tone[0] * tint[0] * k1 * lerp(.9, 1.06, own), cg = tone[1] * tint[1] * k1, cb = tone[2] * tint[2] * k1 * lerp(1.1, .9, own);
    const color = new THREE.Color(cr, cg, cb);
    const width = size * (.85 + rand(k + 700) * .4);
    const sway = .1 + .14 * high;
    card(mb, tile, p, right, up, {
      width, anchor: 'center', bow: width * .1, cup: width * .04, segmentsY: lod === 0 ? 2 : 1, color,
      sway, swayTip: sway * 1.4, kind: KIND.leaf,
      normal: q => {
        nrm.set((q.x - c.at.x) / c.radii.x, (q.y - c.at.y) / c.radii.y, (q.z - c.at.z) / c.radii.z).normalize().multiplyScalar(.6);
        tmp.set((q.x - crown.center.x) / crown.radii.x, (q.y - crown.center.y) / crown.radii.y, (q.z - crown.center.z) / crown.radii.z)
          .normalize().multiplyScalar(.3);
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
  tube(mb, points, radii, { sides, kind: KIND.limb, swayBase: 0, swayTop: .06, uvScale: 1,
    color: t => bark.clone().multiplyScalar(lerp(.9, 1.06, t)), cap: true });
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
    color: (t, angle) => bark.clone().multiplyScalar(lerp(.7, 1.02, smooth(t, 0, .3)) * (.94 + .06 * Math.cos(angle * 2 + t * 5))) });
  const fork = points[points.length - 1].clone(), topRadius = radii[radii.length - 1];
  const clumps = spec.clumps(variant, rand);
  const limbSides = lod === 0 ? 6 : lod === 1 ? 4 : 3;
  const size = (c: ClumpSpec) => Math.cbrt(c.radii.x * c.radii.y * c.radii.z);
  const biggest = Math.max(...clumps.map(size));
  const into = (from: THREE.Vector3, c: ClumpSpec) => {
    const dir = c.at.clone().sub(from), length = dir.length();
    return from.clone().addScaledVector(dir.normalize(), Math.max(0, length - Math.min(c.radii.x, c.radii.y) * .35));
  };
  // Branching reads between the masses: the trunk splits into a few primary limbs, each
  // splitting again into one secondary limb per clump. Clumps over the trunk hang on a leader.
  const groups = spec.limbs ?? 3, turn = rand(950) * Math.PI * 2;
  const primaries: { end: THREE.Vector3; clumps: ClumpSpec[] }[] = Array.from({ length: groups }, () => ({ end: fork.clone(), clumps: [] }));
  const leader: ClumpSpec[] = [];
  for (const c of clumps) {
    if (Math.hypot(c.at.x - fork.x, c.at.z - fork.z) < .9) { leader.push(c); continue; }
    const a = (Math.atan2(c.at.z - fork.z, c.at.x - fork.x) - turn + Math.PI * 4) % (Math.PI * 2);
    primaries[Math.floor(a / (Math.PI * 2) * groups) % groups].clumps.push(c);
  }
  const primaryRadius = topRadius * spec.limb * 1.3, base = fork.clone().add(v3(0, -.1, 0));
  for (const group of primaries) {
    if (!group.clumps.length) continue;
    const mean = group.clumps.reduce((m, c) => m.add(c.at), new THREE.Vector3()).divideScalar(group.clumps.length);
    group.end.lerp(mean, .42).setY(lerp(fork.y, mean.y, .5));
    limb(mb, base, group.end, primaryRadius, primaryRadius * .72, limbSides, bark, spec.arch ?? .3);
    if (lod === 2) continue;
    for (const c of group.clumps) {
      const r0 = primaryRadius * .68 * Math.min(1, .6 + size(c) / biggest * .4);
      limb(mb, group.end, into(group.end, c), r0, Math.max(.03, r0 * .35), limbSides, bark, (spec.arch ?? .3) * .6);
    }
  }
  for (const c of leader) limb(mb, base, into(base, c), primaryRadius * 1.05, Math.max(.035, primaryRadius * .4), limbSides, bark, .05);
  // Prop roots are the mangrove's silhouette, so even the far template keeps a few; buttresses fade.
  if (spec.roots && (lod < 2 || spec.roots === 'prop')) {
    const n = spec.roots === 'prop' ? [9, 7, 5][lod] : 5, sides = [5, 4, 3][lod];
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 + rand(k + 900), reach = spec.roots === 'prop' ? 1.4 + rand(k + 901) * 1.3 : .9 + rand(k + 901) * .5;
      const start = spec.roots === 'prop' ? v3(Math.cos(a) * .18, 1.1 + rand(k + 902) * .7, Math.sin(a) * .18) : v3(Math.cos(a) * .2, .9, Math.sin(a) * .2);
      const end = v3(Math.cos(a) * reach, -.05, Math.sin(a) * reach);
      const root = new THREE.QuadraticBezierCurve3(start, v3(Math.cos(a) * reach * .6, start.y * 1.02, Math.sin(a) * reach * .6), end).getPoints(4);
      tube(mb, root, root.map((_, i) => lerp(spec.roots === 'prop' ? .085 : .16, .045, i / 4)),
        { sides, kind: KIND.limb, swayBase: 0, swayTop: 0, uvScale: 1, color: t => bark.clone().multiplyScalar(lerp(1.02, .78, t)) });
    }
  }
  clumps.forEach((c, i) => clump(mb, c, spec, lod, rand, seed + i));
  return mb.build();
}
