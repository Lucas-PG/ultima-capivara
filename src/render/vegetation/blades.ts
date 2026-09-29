import * as THREE from 'three';
import { KIND, MeshBuilder, type TileUv } from './mesh-builder';

const UP = new THREE.Vector3(0, 1, 0);
const lerp = THREE.MathUtils.lerp;
const smooth = THREE.MathUtils.smoothstep;

export interface BladeSpec {
  tile: TileUv;
  root: THREE.Vector3;
  /** Heading of the blade in the horizontal plane (radians). */
  azimuth: number;
  /** Launch angle above horizontal; gravity then bends the blade down by `droop`. */
  elevation: number;
  length: number;
  droop: number;
  roll: number;
  twist: number;
  /** Width of each half in metres. */
  halfWidth: number;
  /** Angle the outer edges hang below the midrib (radians): a shallow inverted V. */
  fold: number;
  tint: THREE.Color;
  segments: number;
  /** u of the midrib, and of the outer edge of the left and right half. */
  uMid: number;
  uLeft: number;
  uRight: number;
  /** Multiplier on wind sway. */
  sway?: number;
  /** Painted occlusion: brightness at the root and at the tip. */
  shade?: [number, number];
}

/** A curved blade folded along its midrib: coconut frond, banana or heliconia leaf.
 * The upper face is the front face; normals lean toward the sky so a plume of blades reads as one form. */
export function bladePair(mb: MeshBuilder, s: BladeSpec) {
  const hdir = new THREE.Vector3(Math.cos(s.azimuth), 0, Math.sin(s.azimuth));
  const side0 = new THREE.Vector3(-Math.sin(s.azimuth), 0, Math.cos(s.azimuth));
  const c = Math.cos(s.elevation), sn = Math.sin(s.elevation);
  const path = (t: number) => new THREE.Vector3().copy(s.root).addScaledVector(hdir, s.length * c * t)
    .addScaledVector(UP, s.length * (sn * t - s.droop * t * t));
  const rows: { p: THREE.Vector3; t: THREE.Vector3; n: THREE.Vector3; side: THREE.Vector3; v: number; s: number }[] = [];
  for (let i = 0; i <= s.segments; i++) {
    const u = i / s.segments;
    const p = path(u), tangent = path(Math.min(1, u + .02)).sub(path(Math.max(0, u - .02))).normalize();
    const side = side0.clone().applyAxisAngle(tangent, s.roll + s.twist * u);
    const n = new THREE.Vector3().crossVectors(side, tangent).normalize();
    rows.push({ p, t: tangent, n, side, v: lerp(s.tile.v0, s.tile.v1, u), s: u });
  }
  const [shadeRoot, shadeTip] = s.shade ?? [.68, 1.06];
  for (const sign of [-1, 1]) {
    const first = mb.vertexCount;
    const uOuter = sign < 0 ? s.uLeft : s.uRight;
    for (const row of rows) {
      const outward = row.side.clone().multiplyScalar(sign * Math.cos(s.fold)).addScaledVector(row.n, -Math.sin(s.fold));
      const outer = row.p.clone().addScaledVector(outward, s.halfWidth);
      const face = new THREE.Vector3().crossVectors(row.t, outward).multiplyScalar(-sign).normalize();
      if (face.dot(row.n) < 0) face.negate();
      face.multiplyScalar(.7).addScaledVector(UP, .3).normalize();
      const color = s.tint.clone().multiplyScalar(lerp(shadeRoot, shadeTip, smooth(row.s, 0, .55)));
      const sway = Math.pow(row.s, 1.25) * (s.sway ?? 1);
      mb.vertex(row.p, face, s.uMid, row.v, color, sway * .7, KIND.leaf);
      mb.vertex(outer, face, uOuter, row.v, color, sway, KIND.leaf);
    }
    for (let i = 0; i < s.segments; i++) {
      const a = first + i * 2, b = a + 1, cc = a + 2, d = a + 3;
      // The front face is the upper (adaxial) side on both halves.
      if (sign > 0) { mb.triangle(a, b, d); mb.triangle(a, d, cc); } else { mb.triangle(a, d, b); mb.triangle(a, cc, d); }
    }
  }
}

export interface GrassBladeSpec {
  root: THREE.Vector3;
  azimuth: number;
  height: number;
  /** How far the tip leans out, as a fraction of the height. */
  lean: number;
  width: number;
  base: THREE.Color;
  tip: THREE.Color;
  segments: number;
  sway?: number;
}

/** One flat coloured blade that tapers to a point and arcs outward. No atlas involved. */
export function grassBlade(mb: MeshBuilder, s: GrassBladeSpec) {
  const hdir = new THREE.Vector3(Math.cos(s.azimuth), 0, Math.sin(s.azimuth));
  const side = new THREE.Vector3(-Math.sin(s.azimuth), 0, Math.cos(s.azimuth));
  const point = (t: number) => new THREE.Vector3().copy(s.root).addScaledVector(hdir, s.height * s.lean * t * t).addScaledVector(UP, s.height * t);
  const first = mb.vertexCount;
  for (let i = 0; i <= s.segments; i++) {
    const t = i / s.segments, p = point(t), tangent = point(Math.min(1, t + .03)).sub(point(Math.max(0, t - .03))).normalize();
    const w = s.width * (1 - Math.pow(t, 1.6)) * .5;
    const n = new THREE.Vector3().crossVectors(side, tangent).normalize().multiplyScalar(.6).addScaledVector(UP, .4).normalize();
    const color = s.base.clone().lerp(s.tip, Math.pow(t, .8));
    const sway = Math.pow(t, 1.3) * (s.sway ?? 1);
    mb.vertex(p.clone().addScaledVector(side, -w), n, 0, 0, color, sway, KIND.solid);
    mb.vertex(p.clone().addScaledVector(side, w), n, 0, 0, color, sway, KIND.solid);
  }
  for (let i = 0; i < s.segments; i++) {
    const a = first + i * 2, b = a + 1, c = a + 2, d = a + 3;
    mb.triangle(a, b, d); mb.triangle(a, d, c);
  }
}
