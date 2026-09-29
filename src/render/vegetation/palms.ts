import * as THREE from 'three';
import { plantStemTemplate } from '../../shared/vegetation-trunks';
import { plantHash } from '../../shared/vegetation-species';
import { FOLIAGE_TILES } from './atlas';
import { KIND, MeshBuilder, tube } from './mesh-builder';

export type Lod = 0 | 1 | 2;
const DEG = Math.PI / 180;
const rgb = (r: number, g: number, b: number) => new THREE.Color(r, g, b);
const lerp = THREE.MathUtils.lerp;
const smooth = THREE.MathUtils.smoothstep;
const UP = new THREE.Vector3(0, 1, 0);

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

interface FrondSpec {
  azimuth: number; elevation: number; length: number; droop: number; roll: number; twist: number;
  tint: THREE.Color; wing: number; tile: 'frond' | 'frond-solid';
}

/** Two half-blades along a ballistic arc: the rachis rises at `elevation`, then gravity bends it down.
 * The blades hang below the rachis in a shallow inverted V, like a real frond. */
function frond(mb: MeshBuilder, top: THREE.Vector3, spec: FrondSpec, segments: number) {
  const tile = FOLIAGE_TILES[spec.tile];
  const hdir = new THREE.Vector3(Math.cos(spec.azimuth), 0, Math.sin(spec.azimuth));
  const side0 = new THREE.Vector3(-Math.sin(spec.azimuth), 0, Math.cos(spec.azimuth));
  const c = Math.cos(spec.elevation), s = Math.sin(spec.elevation);
  const halfWidth = spec.length * tile.aspect * spec.wing;
  const path = (t: number) => new THREE.Vector3().copy(top).addScaledVector(hdir, spec.length * c * t)
    .addScaledVector(UP, spec.length * (s * t - spec.droop * t * t));
  const rows: { p: THREE.Vector3; t: THREE.Vector3; n: THREE.Vector3; side: THREE.Vector3; v: number; s: number }[] = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const p = path(u), tangent = path(Math.min(1, u + .02)).sub(path(Math.max(0, u - .02))).normalize();
    // Frame: side stays horizontal, N is the upper (adaxial) face; twist rolls both about the tangent.
    const roll = spec.roll + spec.twist * u;
    const side = side0.clone().applyAxisAngle(tangent, roll);
    const n = new THREE.Vector3().crossVectors(side, tangent).normalize();
    if (n.y < -.2 && u < .05) n.negate();
    rows.push({ p, t: tangent, n, side, v: lerp(tile.v0, tile.v1, u), s: u });
  }
  for (const sign of [-1, 1]) {
    const first = mb.vertexCount;
    const phi = (18 + 22 * smooth(spec.droop, .3, .8)) * DEG;
    for (const row of rows) {
      const outward = row.side.clone().multiplyScalar(sign * Math.cos(phi)).addScaledVector(row.n, -Math.sin(phi));
      const outer = row.p.clone().addScaledVector(outward, halfWidth);
      // Adaxial normal of this half-blade, softened toward the crown's up so lighting reads as one plume.
      const nf = new THREE.Vector3().crossVectors(row.t, outward).multiplyScalar(-sign).normalize();
      if (nf.dot(row.n) < 0) nf.negate();
      nf.multiplyScalar(.7).addScaledVector(UP, .3).normalize();
      // Fronds darken toward the crown where they overlap and brighten to the tips.
      const light = lerp(.68, 1.06, smooth(row.s, 0, .55));
      const color = spec.tint.clone().multiplyScalar(light);
      const sway = Math.pow(row.s, 1.25);
      // The tile has its rachis on the left (u0) and leaflets sweeping toward the tip. Both blades
      // sample it the same way: rachis edge at u0, outer edge at u1. Only the winding differs.
      mb.vertex(row.p, nf, tile.u0, row.v, color, sway * .7, KIND.leaf);
      mb.vertex(outer, nf, tile.u1, row.v, color, sway, KIND.leaf);
    }
    for (let i = 0; i < segments; i++) {
      const a = first + i * 2, b = a + 1, cc = a + 2, d = a + 3;
      // Front face is the adaxial (upper) side on both blades.
      if (sign > 0) { mb.triangle(a, b, d); mb.triangle(a, d, cc); } else { mb.triangle(a, d, b); mb.triangle(a, cc, d); }
    }
  }
}

/** Icosphere fruit, flat coloured. Cheap enough to hang five under the crown. */
function fruit(mb: MeshBuilder, center: THREE.Vector3, radius: number, color: THREE.Color) {
  const g = new THREE.IcosahedronGeometry(radius, 0), pos = g.getAttribute('position');   // polyhedra are already non-indexed
  const first = mb.vertexCount, n = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i); n.copy(p).normalize(); p.add(center);
    mb.vertex(p, n, 0, 0, color, .05, KIND.solid);
  }
  for (let i = 0; i < pos.count; i += 3) mb.triangle(first + i, first + i + 1, first + i + 2);
  g.dispose();
}

const FRONDS = [16, 12, 9] as const;
const WING_SEGMENTS = [7, 4, 2] as const;
const TRUNK_ROWS = [3, 2, 1] as const;
const TRUNK_SIDES = [9, 7, 5] as const;

export function buildCoconut(variant: number, lod: Lod) {
  const mb = new MeshBuilder(lod);
  const sections = plantStemTemplate('coconut', lod === 0 ? 12 : lod === 1 ? 7 : 5, variant);
  const { points, radii } = trunkPolyline(sections, TRUNK_ROWS[lod]);
  const bark = rgb(.66, .53, .38);
  tube(mb, points, radii, {
    sides: TRUNK_SIDES[lod], kind: KIND.trunk, swayBase: 0, swayTop: .05, uvScale: 1,
    color: t => { const k = lerp(.78, 1.02, smooth(t, 0, .25)); return bark.clone().multiplyScalar(k); },
  });
  const top = points[points.length - 1].clone();
  const n: number = FRONDS[lod];
  const seed = variant * 31 + 5;
  for (let k = 0; k < n; k++) {
    const age = k / (n - 1);                                               // 0 young, upright .. 1 old, drooping
    const jitter = (a: number) => plantHash(seed + k, a) - .5;
    const spec: FrondSpec = {
      azimuth: k * 137.508 * DEG + variant * .7,
      elevation: lerp(70, 6, Math.pow(age, .85)) * DEG + jitter(1) * 9 * DEG,
      length: lerp(2.5, 4.0, Math.pow(age, .8)) * (1 + jitter(2) * .14),
      droop: lerp(.3, .78, age) + jitter(3) * .1,
      roll: jitter(4) * 22 * DEG, twist: jitter(5) * 26 * DEG,
      tint: rgb(lerp(1.06, .93, age), lerp(1.1, .98, age), lerp(.86, .78, age)),
      wing: 1.7, tile: lod === 2 ? 'frond-solid' : 'frond',
    };
    frond(mb, top, spec, WING_SEGMENTS[lod]);
  }
  if (lod < 2) {
    // Two dead fronds hanging straight down are the signature of an old coconut palm.
    for (let k = 0; k < 2; k++) frond(mb, top, {
      azimuth: (k * 190 + 40 + variant * 50) * DEG, elevation: -38 * DEG, length: 2.3, droop: .2, roll: 0, twist: .15,
      tint: rgb(1.0, .84, .5), wing: 1.2, tile: 'frond',
    }, WING_SEGMENTS[lod]);
  }
  if (lod === 0) {
    for (let k = 0; k < 6; k++) {
      const a = k * 2.4 + variant, r = .3 + plantHash(seed, k) * .12;
      fruit(mb, new THREE.Vector3(top.x + Math.cos(a) * r, top.y - .38 - plantHash(seed, k + 9) * .12, top.z + Math.sin(a) * r),
        .19, k % 3 === 0 ? rgb(.62, .5, .27) : rgb(.58, .68, .28));
    }
  }
  return mb.build();
}
