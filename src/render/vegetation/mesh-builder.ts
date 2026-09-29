import * as THREE from 'three';

/** How a vertex is shaded. The values are stored in the `aux.y` attribute. */
export const KIND = {
  /** Collision trunk: plain bark, no atlas. Rendered from `plantTrunkSections`. */
  trunk: 0,
  /** Painted atlas leaf card with alpha. */
  leaf: 1,
  /** Flat colour, no atlas (fruit, far crown lumps). */
  solid: 2,
  /** Non-collision bark: limbs, roots, stems. */
  limb: 4,
  /** Collision trunk of a palm: bark with painted growth rings. */
  palmTrunk: 5,
} as const;

/** Vertex kinds that belong to a trunk a collider would be built from (`plantTrunkSections`). */
export const TRUNK_KINDS: readonly number[] = [KIND.trunk, KIND.palmTrunk];

/** Every template geometry shares this layout, which is what BatchedMesh requires. */
export class MeshBuilder {
  readonly position: number[] = [];
  readonly normal: number[] = [];
  readonly uv: number[] = [];
  readonly color: number[] = [];
  /** x: wind sway weight, y: KIND, z: LOD id of this template. */
  readonly aux: number[] = [];
  readonly index: number[] = [];
  constructor(readonly lod = 0) {}

  get vertexCount() { return this.position.length / 3; }
  get triangleCount() { return this.index.length / 3; }

  vertex(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, c: THREE.Color | { r: number; g: number; b: number },
    sway: number, kind: number) {
    this.position.push(p.x, p.y, p.z);
    this.normal.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.color.push(c.r, c.g, c.b);
    this.aux.push(sway, kind, this.lod);
    return this.vertexCount - 1;
  }

  triangle(a: number, b: number, c: number) { this.index.push(a, b, c); }
  quad(a: number, b: number, c: number, d: number) { this.index.push(a, b, c, a, c, d); }

  append(other: MeshBuilder) {
    const offset = this.vertexCount;
    for (const key of ['position', 'normal', 'uv', 'color', 'aux'] as const) this[key].push(...other[key]);
    for (const i of other.index) this.index.push(i + offset);
  }

  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
    geometry.setAttribute('aux', new THREE.Float32BufferAttribute(this.aux, 3));
    geometry.setIndex(this.index);
    geometry.computeBoundingSphere();
    return geometry;
  }
}

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();

export interface TubeOptions {
  sides: number;
  color: (t: number, angle: number) => THREE.Color | { r: number; g: number; b: number };
  kind: number;
  /** Wind weight at the base and at the top (interpolated along the path). */
  swayBase?: number;
  swayTop?: number;
  /** Radius modulation along the path, for rings and swellings. */
  bump?: (t: number) => number;
  cap?: boolean;
  /** Metres of trunk per unit of v. */
  uvScale?: number;
}

/** A tapered tube along a polyline with parallel-transport frames. */
export function tube(mb: MeshBuilder, points: THREE.Vector3[], radii: number[], o: TubeOptions) {
  const n = points.length, sides = o.sides, first = mb.vertexCount;
  const tangent = new THREE.Vector3(), frameX = new THREE.Vector3(), frameY = new THREE.Vector3();
  const lengths = [0];
  for (let i = 1; i < n; i++) lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]));
  const total = lengths[n - 1] || 1;
  tangent.subVectors(points[1], points[0]).normalize();
  frameX.set(Math.abs(tangent.y) < .95 ? 0 : 1, Math.abs(tangent.y) < .95 ? 1 : 0, 0).cross(tangent).normalize();
  frameY.crossVectors(tangent, frameX).normalize();
  const uvScale = o.uvScale ?? 1;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    tangent.subVectors(points[Math.min(n - 1, i + 1)], points[Math.max(0, i - 1)]).normalize();
    // Parallel transport: keep the frame as close as possible to the previous one.
    frameX.addScaledVector(tangent, -frameX.dot(tangent)).normalize();
    frameY.crossVectors(tangent, frameX).normalize();
    const radius = radii[i] * (o.bump ? o.bump(t) : 1);
    for (let s = 0; s <= sides; s++) {
      const angle = s / sides * Math.PI * 2, c = Math.cos(angle), sn = Math.sin(angle);
      tmpA.copy(frameX).multiplyScalar(c).addScaledVector(frameY, sn);            // outward normal
      tmpB.copy(points[i]).addScaledVector(tmpA, radius);
      const sway = (o.swayBase ?? 0) + ((o.swayTop ?? 0) - (o.swayBase ?? 0)) * t;
      mb.vertex(tmpB, tmpA, s / sides, lengths[i] * uvScale, o.color(t, angle), sway, o.kind);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let s = 0; s < sides; s++) {
    const a = first + i * (sides + 1) + s, b = a + 1, c = a + sides + 1, d = c + 1;
    mb.triangle(a, c, b); mb.triangle(b, c, d);
  }
  if (o.cap) {
    // Close the top with a fan so limbs read as solid from below.
    const top = mb.vertexCount, i = n - 1;
    tangent.subVectors(points[i], points[i - 1]).normalize();
    mb.vertex(points[i], tangent, .5, total * uvScale, o.color(1, 0), o.swayTop ?? 0, o.kind);
    for (let s = 0; s < sides; s++) mb.triangle(top, first + i * (sides + 1) + s + 1, first + i * (sides + 1) + s);
  }
  return total;
}

export interface CardOptions {
  /** Where the card's local origin lies inside its rect: 'center' or the tile root. */
  anchor?: 'center' | 'root';
  width: number;
  /** Height defaults to width / aspect of the tile. */
  height?: number;
  /** Bow along the card's up axis (metres at the middle). */
  bow?: number;
  /** Cup across the card (metres at the edges). */
  cup?: number;
  segmentsY?: number;
  segmentsX?: number;
  color: THREE.Color | { r: number; g: number; b: number };
  /** Normal for each vertex, given its position; the card's own normal is passed too. */
  normal: (position: THREE.Vector3, face: THREE.Vector3) => THREE.Vector3;
  sway?: number;
  swayTip?: number;
  kind?: number;
  /** Mirror the tile in u. */
  flip?: boolean;
}

export interface TileUv {
  u0: number; v0: number; u1: number; v1: number; aspect: number; root: readonly [number, number];
  /** Mean sRGB colour of the tile's painted pixels. */
  mean?: readonly [number, number, number];
}

/** A bent, textured card. `right` and `up` span its plane; `face` is right x up. */
export function card(mb: MeshBuilder, tile: TileUv, origin: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3, o: CardOptions) {
  const width = o.width, height = o.height ?? width / tile.aspect;
  const sx = o.segmentsX ?? 1, sy = o.segmentsY ?? 1, first = mb.vertexCount;
  const face = tmpC.crossVectors(right, up).normalize().clone();
  const anchor = o.anchor ?? 'center';
  const ax = anchor === 'root' ? tile.root[0] : .5, ay = anchor === 'root' ? tile.root[1] : .5;
  const p = new THREE.Vector3();
  for (let j = 0; j <= sy; j++) for (let i = 0; i <= sx; i++) {
    const fx = i / sx, fy = j / sy;                         // 0..1 across, 0 at the bottom
    const lx = (fx - ax) * width, ly = (fy - (1 - ay)) * height;
    const bow = (o.bow ?? 0) * (1 - Math.pow(2 * fy - 1, 2));
    const cup = (o.cup ?? 0) * Math.pow(2 * fx - 1, 2);
    p.copy(origin).addScaledVector(right, lx).addScaledVector(up, ly).addScaledVector(face, bow + cup);
    const n = o.normal(p, face);
    const u = o.flip ? 1 - fx : fx;
    const uu = tile.u0 + (tile.u1 - tile.u0) * u, vv = tile.v0 + (tile.v1 - tile.v0) * fy;
    mb.vertex(p, n, uu, vv, o.color, (o.sway ?? 0) + ((o.swayTip ?? o.sway ?? 0) - (o.sway ?? 0)) * fy, o.kind ?? KIND.leaf);
  }
  for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) {
    const a = first + j * (sx + 1) + i, b = a + 1, c = a + sx + 1, d = c + 1;
    mb.triangle(a, b, d); mb.triangle(a, d, c);
  }
}
