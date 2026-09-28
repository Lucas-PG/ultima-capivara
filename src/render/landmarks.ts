import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LandmarkKind } from '../shared/landmarks';

// District landmarks the plan always named but the kit never shipped: the
// Porto crane, the Fazenda windmill and barn, and the Morro radio mast. Each
// is a tall, readable silhouette for navigation, built as a few merged,
// vertex-coloured meshes (one draw each plus any moving part).

type Part = THREE.BufferGeometry;
const tint = (geometry: Part, color: string) => {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  for (const name of Object.keys(flat.attributes)) if (name !== 'position' && name !== 'normal') flat.deleteAttribute(name);
  const c = new THREE.Color(color), colors = new Float32Array(flat.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return flat;
};
const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string, rx = 0, ry = 0, rz = 0) => {
  const g = new THREE.BoxGeometry(w, h, d); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return tint(g, color);
};
const beam = (from: THREE.Vector3, to: THREE.Vector3, radius: number, color: string, sides = 6) => {
  const dir = to.clone().sub(from), g = new THREE.CylinderGeometry(radius, radius, dir.length(), sides);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2); return tint(g, color);
};
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const mesh = (parts: Part[], material: THREE.Material) => {
  const merged = mergeGeometries(parts); parts.forEach(p => p.dispose());
  const result = new THREE.Mesh(merged, material); result.castShadow = true; result.receiveShadow = true; return result;
};

// A four-legged lattice tower between two heights, braced on every face.
function lattice(parts: Part[], half0: number, half1: number, y0: number, y1: number, color: string, bays: number, radius = .09) {
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const at = (t: number, c: number[]) => { const h = half0 + (half1 - half0) * t; return V(c[0] * h, y0 + (y1 - y0) * t, c[1] * h); };
  for (const c of corners) parts.push(beam(at(0, c), at(1, c), radius * 1.3, color));
  for (let b = 0; b < bays; b++) {
    const t0 = b / bays, t1 = (b + 1) / bays;
    for (let i = 0; i < 4; i++) {
      const a = corners[i], n = corners[(i + 1) % 4];
      parts.push(beam(at(t1, a), at(t1, n), radius, color));
      parts.push(beam(at(t0, a), at(t1, n), radius * .8, color));
    }
  }
}

export function buildLandmark(kind: LandmarkKind, material: THREE.Material): { group: THREE.Group; spinner?: THREE.Object3D } {
  const group = new THREE.Group(), parts: Part[] = [];
  let spinner: THREE.Object3D | undefined;
  if (kind === 'crane') {
    // Harbour gantry crane: yellow legs, a cab and a long boom out over the water.
    const yellow = '#f2b134', rust = '#b5523a', cab = '#2f6f7a';
    for (const x of [-2.6, 2.6]) for (const z of [-2.6, 2.6]) parts.push(box(.5, 11, .5, x, 5.5, z, yellow));
    for (const y of [3.5, 7.5, 11]) { parts.push(box(5.7, .45, .45, 0, y, -2.6, yellow)); parts.push(box(5.7, .45, .45, 0, y, 2.6, yellow)); parts.push(box(.45, .45, 5.7, -2.6, y, 0, yellow)); parts.push(box(.45, .45, 5.7, 2.6, y, 0, yellow)); }
    for (const x of [-2.6, 2.6]) { parts.push(beam(V(x, .3, -2.6), V(x, 7.5, 2.6), .14, rust)); parts.push(beam(V(x, .3, 2.6), V(x, 7.5, -2.6), .14, rust)); }
    parts.push(box(3.2, 2.4, 3, 0, 12.6, 0, cab)); parts.push(box(3.4, .3, 3.2, 0, 13.95, 0, rust));
    parts.push(box(1.2, 1.2, 22, 0, 13.4, 7, yellow));
    parts.push(beam(V(0, 17, 0), V(0, 13.8, 17.5), .12, '#3b3b3b')); parts.push(beam(V(0, 17, 0), V(0, 13.8, -3.5), .12, '#3b3b3b'));
    parts.push(box(.9, 3.6, .9, 0, 15.2, 0, yellow));
    parts.push(box(2.4, 1.4, 1.6, 0, 13.4, -4.4, '#6b6b6b'));
    parts.push(beam(V(0, 12.8, 15.5), V(0, 6.5, 15.5), .06, '#3b3b3b'));
    parts.push(box(1.4, .8, 1.4, 0, 6.2, 15.5, rust));
  } else if (kind === 'windmill') {
    // Whitewashed farm windmill with a red cap; the sails turn.
    const tower = new THREE.CylinderGeometry(1.8, 2.8, 10, 16); tower.translate(0, 5, 0); parts.push(tint(tower, '#f1e7d2'));
    const cap = new THREE.ConeGeometry(2.4, 2.6, 16); cap.translate(0, 11.3, 0); parts.push(tint(cap, '#c8553d'));
    parts.push(box(1.5, 2.2, .3, 0, 1.1, 2.62, '#7a4d2e'));
    for (const y of [4, 7]) parts.push(box(1, 1, .2, 0, y, 2.2 - (y - 4) * .1, '#4b6f7a'));
    const hub = new THREE.Group(); hub.position.set(0, 10.2, 2.35); spinner = hub; group.add(hub);
    const sails: Part[] = [];
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2;
      const arm = box(.28, 6.2, .18, 0, 3.2, 0, '#8a5a35'); arm.rotateZ(a); sails.push(arm);
      const cloth = box(1.3, 4.4, .06, .75, 3.9, .08, '#fff4dd'); cloth.rotateZ(a); sails.push(cloth);
    }
    const hubCap = new THREE.SphereGeometry(.45, 12, 8); sails.push(tint(hubCap, '#c8553d'));
    hub.add(mesh(sails, material));
  } else if (kind === 'barn') {
    // Red barn with white trim and a hay door; walls are solid, as its colliders say.
    const red = '#b8412f', trim = '#f4ead4';
    parts.push(box(10, 5, 8, 0, 2.5, 0, red));
    const roof = new THREE.CylinderGeometry(5.6, 5.6, 8.4, 3, 1, false); roof.rotateX(Math.PI / 2); roof.rotateZ(Math.PI / 2); roof.scale(1, .55, 1); roof.translate(0, 5.2, 0);
    parts.push(tint(roof, '#5b4636'));
    for (const z of [-4.02, 4.02]) {
      parts.push(box(3.4, 3.8, .1, 0, 1.9, z, '#8d2f22'));
      parts.push(box(.22, 3.8, .14, -1.7, 1.9, z, trim)); parts.push(box(.22, 3.8, .14, 1.7, 1.9, z, trim)); parts.push(box(3.6, .22, .14, 0, 3.8, z, trim));
      parts.push(beam(V(-1.6, .1, z), V(1.6, 3.7, z), .1, trim)); parts.push(beam(V(1.6, .1, z), V(-1.6, 3.7, z), .1, trim));
      parts.push(box(1.4, 1.2, .1, 0, 6, z, '#2b2b2b'));
    }
    for (const x of [-5.02, 5.02]) parts.push(box(.1, .22, 8, x, 5, 0, trim));
    for (const [x, z] of [[6.3, 2.5], [6.6, .6], [6.1, -1.4]]) parts.push(tint(new THREE.CylinderGeometry(.75, .75, 1.3, 12).rotateZ(Math.PI / 2).translate(x, .75, z), '#e2c25c'));
  } else if (kind === 'redentora') {
    // Soapstone plinth; the statue itself is the sculpted GLB added by the scene.
    const stone = '#d9cfbd', joint = '#bfb29c';
    parts.push(box(8, 1, 8, 0, .5, 0, stone)); parts.push(box(8.3, .12, 8.3, 0, .06, 0, joint));
    parts.push(box(6.2, .8, 6.2, 0, 1.4, 0, stone)); parts.push(box(6.4, .1, 6.4, 0, 1.02, 0, joint));
    for (const [x, z] of [[-3.7, -3.7], [3.7, -3.7], [-3.7, 3.7], [3.7, 3.7]]) parts.push(tint(new THREE.CylinderGeometry(.35, .4, .5, 10).translate(x, 1.25, z), joint));
  } else {
    // Morro radio mast: a tapering red-and-white lattice with warning lights.
    lattice(parts, 1.4, .35, 0, 9, '#d8d0c4', 5);
    lattice(parts, .35, .15, 9, 17, '#c8412f', 5, .07);
    parts.push(box(2.2, .25, 2.2, 0, 9, 0, '#8a8a8a'));
    for (const y of [9.3, 17.1]) parts.push(tint(new THREE.SphereGeometry(.22, 10, 8).translate(0, y + .2, 0), '#ff4b2b'));
    parts.push(box(1.6, 1.8, 1.4, 2.4, .9, 0, '#e9e0cf')); parts.push(box(1.8, .15, 1.6, 2.4, 1.85, 0, '#6f6f6f'));
  }
  group.add(mesh(parts, material));
  return { group, spinner };
}
