import * as THREE from 'three';
import { plantStemTemplate } from '../../shared/vegetation-trunks';
import { plantHash } from '../../shared/vegetation-species';
import { FOLIAGE_TILES } from './atlas';
import { bladePair } from './blades';
import { KIND, MeshBuilder, tube } from './mesh-builder';

export type Lod = 0 | 1 | 2;
const DEG = Math.PI / 180;
const rgb = (r: number, g: number, b: number) => new THREE.Color(r, g, b);
const lerp = THREE.MathUtils.lerp;
const smooth = THREE.MathUtils.smoothstep;

/** Points along a template trunk, resampled linearly inside each collision section
 * so every vertex stays exactly on the shared centreline. */
export function trunkPolyline(sections: ReturnType<typeof plantStemTemplate>, rowsPerSection: number) {
  const points: THREE.Vector3[] = [], radii: number[] = [];
  sections.forEach((s, i) => {
    for (let r = i === 0 ? 0 : 1; r <= rowsPerSection; r++) {
      const t = r / rowsPerSection;
      points.push(new THREE.Vector3(lerp(s.a.x, s.b.x, t), lerp(s.a.y, s.b.y, t), lerp(s.a.z, s.b.z, t)));
      radii.push(lerp(s.radiusBottom, s.radiusTop, t));
    }
  });
  return { points, radii };
}

/** Icosphere fruit, flat coloured. Cheap enough to hang a bunch under the crown. */
export function fruit(mb: MeshBuilder, center: THREE.Vector3, radius: number, color: THREE.Color, scale = new THREE.Vector3(1, 1, 1), detail = 0) {
  const g = new THREE.IcosahedronGeometry(radius, detail), pos = g.getAttribute('position');   // polyhedra are already non-indexed
  const first = mb.vertexCount, n = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i); n.copy(p).normalize(); p.multiply(scale).add(center);
    // Painted light on the fruit itself: lit crown, darker underside.
    const shade = lerp(.72, 1.08, n.y * .5 + .5);
    mb.vertex(p, n, 0, 0, { r: color.r * shade, g: color.g * shade, b: color.b * shade }, .05, KIND.solid);
  }
  for (let i = 0; i < pos.count; i += 3) mb.triangle(first + i, first + i + 1, first + i + 2);
  g.dispose();
}

interface PalmStyle {
  /** Living fronds per LOD. */
  fronds: readonly [number, number, number];
  bark: THREE.Color;
  /** Launch angle of the youngest and the oldest living frond, degrees. */
  elevation: [number, number];
  length: [number, number];
  droop: [number, number];
  /** Half-blade width as a fraction of the frond length. */
  wing: number;
  trunkRows: number;
}

const STYLES = {
  coconut: { fronds: [19, 13, 9], bark: rgb(.7, .58, .44), elevation: [66, -6], length: [3.5, 4.9], droop: [.24, .9], wing: .27, trunkRows: 3 },
  // Royal palms: a straight smooth grey column under a green crownshaft and stiffer, more upright plumes.
  royal: { fronds: [15, 11, 8], bark: rgb(.82, .79, .72), elevation: [74, 8], length: [3.6, 4.8], droop: [.2, .7], wing: .2, trunkRows: 2 },
} as const satisfies Record<string, PalmStyle>;

const WING_SEGMENTS = [8, 5, 3] as const;
const TRUNK_SIDES = [10, 7, 5] as const;

export function buildPalm(species: keyof typeof STYLES, variant: number, lod: Lod) {
  const style: PalmStyle = STYLES[species], mb = new MeshBuilder(lod);
  const sections = plantStemTemplate(species, lod === 0 ? undefined : lod === 1 ? 6 : 4, variant);
  const { points, radii } = trunkPolyline(sections, Math.max(1, style.trunkRows - lod));
  // Darker, weathered foot; the painted rings come from the shader (KIND.palmTrunk).
  tube(mb, points, radii, {
    sides: TRUNK_SIDES[lod], kind: KIND.palmTrunk, swayBase: 0, swayTop: .05, uvScale: 1,
    color: (t, angle) => style.bark.clone().multiplyScalar(lerp(.74, 1.04, smooth(t, 0, .3)) * (.95 + .05 * Math.cos(angle * 3))),
  });
  const top = points[points.length - 1].clone(), topRadius = radii[radii.length - 1];
  const seed = variant * 31 + (species === 'royal' ? 91 : 5);
  if (species === 'royal') {
    // Smooth green crownshaft where the fronds sheath the top of the trunk.
    const shaft = [top.clone().add(new THREE.Vector3(0, -1.1, 0)), top.clone().add(new THREE.Vector3(0, .6, 0))];
    tube(mb, shaft, [topRadius * 1.08, topRadius * .8], { sides: TRUNK_SIDES[lod], kind: KIND.limb, swayBase: .04, swayTop: .05, uvScale: 1, color: () => rgb(.5, .66, .3) });
    top.y += .55;
  } else if (lod < 2) {
    // Fibrous boot of old frond bases: a short dark swelling the fronds spring from.
    const boot = [top.clone().add(new THREE.Vector3(0, -.55, 0)), top.clone().add(new THREE.Vector3(0, -.05, 0)), top.clone().add(new THREE.Vector3(0, .32, 0))];
    tube(mb, boot, [topRadius * 1.05, topRadius * 1.5, topRadius * .7], { sides: TRUNK_SIDES[lod], kind: KIND.limb, swayBase: .03, swayTop: .06, uvScale: 1,
      color: t => rgb(.46, .36, .24).multiplyScalar(lerp(.8, 1.05, t)) });
  }
  const n: number = style.fronds[lod];
  const young = FOLIAGE_TILES[lod === 2 ? 'frond-far' : 'frond'], old = FOLIAGE_TILES[lod === 2 ? 'frond-far' : 'frond-old'];
  for (let k = 0; k < n; k++) {
    const age = k / (n - 1);                                               // 0 young, upright .. 1 old, drooping
    const jitter = (a: number) => plantHash(seed + k, a) - .5;
    const length = lerp(style.length[0], style.length[1], Math.pow(Math.sin(age * Math.PI * .5 + .35), 1.5)) * (1 + jitter(2) * .14);
    const droop = lerp(style.droop[0], style.droop[1], Math.pow(age, 1.2)) + jitter(3) * .1;
    const tile = age > .84 && lod < 2 ? old : young;
    bladePair(mb, {
      tile, root: top.clone().add(new THREE.Vector3(0, .12 - age * .3, 0)), azimuth: k * 137.508 * DEG + variant * .7,
      elevation: lerp(style.elevation[0], style.elevation[1], Math.pow(age, .9)) * DEG + jitter(1) * 8 * DEG,
      length, droop, roll: jitter(4) * 18 * DEG, twist: jitter(5) * 30 * DEG,
      halfWidth: length * style.wing * (1 + jitter(6) * .12), fold: (14 + 18 * smooth(droop, .3, .9)) * DEG,
      tint: tile === old ? rgb(.92, .94, .86) : rgb(lerp(.94, .88, age), lerp(1.02, .97, age), lerp(.96, .9, age)),
      segments: WING_SEGMENTS[lod], uMid: (tile.u0 + tile.u1) / 2, uLeft: tile.u0, uRight: tile.u1,
      shade: [.62, 1.08],
    });
  }
  if (lod < 2 && species === 'coconut') {
    // Dead fronds hanging against the trunk are the signature of an old coconut palm.
    for (let k = 0; k < 2 - lod; k++) bladePair(mb, {
      tile: old, root: top.clone().add(new THREE.Vector3(0, -.25, 0)), azimuth: (k * 190 + 40 + variant * 50) * DEG, elevation: -62 * DEG, length: 2.6, droop: .08,
      roll: 0, twist: .2, halfWidth: 2.6 * .17, fold: 48 * DEG, tint: rgb(.82, .62, .36), segments: WING_SEGMENTS[lod],
      uMid: (old.u0 + old.u1) / 2, uLeft: old.u0, uRight: old.u1, sway: .5, shade: [.55, .9],
    });
    // Two bunches of coconuts tucked under the fronds: green, ripening to ochre.
    const bunches = lod === 0 ? 2 : 1;
    for (let b = 0; b < bunches; b++) {
      const a = b * 2.6 + variant * 1.3, at = top.clone().add(new THREE.Vector3(Math.cos(a) * topRadius * 1.5, -.42, Math.sin(a) * topRadius * 1.5));
      for (let k = 0; k < (lod === 0 ? 5 : 3); k++) {
        const ka = k * 2.4 + b, r = .13 + plantHash(seed + b, k) * .06;
        fruit(mb, at.clone().add(new THREE.Vector3(Math.cos(ka) * r, -plantHash(seed + b, k + 9) * .2, Math.sin(ka) * r)), .17,
          (k + b) % 3 === 0 ? rgb(.66, .52, .26) : rgb(.52, .64, .24), new THREE.Vector3(1, 1.12, 1), lod === 0 ? 1 : 0);
      }
    }
  }
  return mb.build();
}

export const buildCoconut = (variant: number, lod: Lod) => buildPalm('coconut', variant, lod);
export const buildRoyal = (variant: number, lod: Lod) => buildPalm('royal', variant, lod);
