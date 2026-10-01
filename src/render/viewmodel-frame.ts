import * as THREE from 'three';
import type { WeaponId } from '../shared/types';
import { CORRIDOR as BAND } from './viewmodel-targets';

// Screen composition of the first-person view: where the muzzle, sight and paws
// sit on screen, the gun's angles against the view, how much of the screen the
// weapon and each arm cover, and whether anything is cut by the near plane.
// Screen positions are fractions of the frame from the top-left corner (the
// reticle is at 0.5, 0.5). Used by the framing tests and the QA tools.

export interface ScreenPoint { x: number; y: number }
export interface EdgeSpan { from: number; to: number }
export interface ArmFrame {
  coverage: number;
  wrist: ScreenPoint;
  /** Where the arm's silhouette meets the frame edges (fractions along that edge). */
  exits: { bottom?: EdgeSpan; left?: EdgeSpan; right?: EdgeSpan; top?: EdgeSpan };
  /** Camera-space elbow and wrist (metres): the elbow should hang below and behind the paw. */
  elbow: THREE.Vector3; wristView: THREE.Vector3;
  /** Elbow bend between the upper arm and the forearm (degrees, 180 = straight). */
  bend: number;
}
export interface FrameMetrics {
  muzzle: ScreenPoint; sight: ScreenPoint; grip: ScreenPoint;
  /** Bore direction against the view (degrees): yaw + = muzzle toward the left, pitch + = up, roll + = top leaning left. */
  yaw: number; pitch: number; roll: number;
  coverage: number; weaponCoverage: number;
  /** Share of the central band around the reticle (viewmodel-targets.ts CORRIDOR) covered. */
  corridor: number;
  /** Share of the small square right around the reticle (half-width 0.04 of the frame height) covered. */
  reticle: number;
  /** Silhouette bounds of everything drawn (fractions). */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  R: ArmFrame | null; L: ArmFrame | null;
  /** Closest visible vertex (metres from the eye) and triangles cut open by the near plane inside the view. */
  nearestVisible: number; nearCuts: number;
}

interface Probe {
  camera: THREE.PerspectiveCamera; holder: THREE.Object3D; weapon: WeaponId;
  models: Record<WeaponId, { group: THREE.Object3D; muzzle: THREE.Object3D; spec: { adsEye?: readonly number[] } }>;
  arms: { meshes: THREE.SkinnedMesh[]; right: { upper: { bone: THREE.Bone }; fore: { bone: THREE.Bone }; hand: { bone: THREE.Bone } };
    left: { upper: { bone: THREE.Bone }; fore: { bone: THREE.Bone }; hand: { bone: THREE.Bone } } } | null;
}

const CORRIDOR = { x0: BAND.x[0], x1: BAND.x[1], y0: BAND.y[0], y1: BAND.y[1] };

/** Measures the live viewmodel (call after WeaponView.update). `columns` sets the coverage raster resolution. */
export function measureFrame(view: unknown, columns = 192): FrameMetrics {
  const probe = view as Probe;
  const camera = probe.camera, model = probe.models[probe.weapon];
  camera.updateMatrixWorld(true);
  probe.holder.parent?.updateMatrixWorld(true);
  const toView = camera.matrixWorldInverse, projection = camera.projectionMatrix;
  const rows = Math.max(1, Math.round(columns / camera.aspect));
  const cellsWeapon = new Uint8Array(columns * rows), cellsR = new Uint8Array(columns * rows), cellsL = new Uint8Array(columns * rows);
  const near = camera.near, tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanX = tanY * camera.aspect;
  let nearestVisible = Infinity, nearCuts = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Matrix4();
  const screen = (p: THREE.Vector3) => {
    const q = p.clone().applyMatrix4(projection);
    return { x: (q.x + 1) / 2, y: (1 - q.y) / 2 };
  };
  const visible = (p: THREE.Vector3) => p.z < -near && Math.abs(p.x) <= -p.z * tanX && Math.abs(p.y) <= -p.z * tanY;
  // Rasterise one view-space triangle into a coverage grid (cell centres, both windings).
  const raster = (cells: Uint8Array, p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3) => {
    const s = [p0, p1, p2].map(p => { const q = screen(p); return [q.x * columns, q.y * rows]; });
    const minX = Math.max(0, Math.floor(Math.min(s[0][0], s[1][0], s[2][0]))), maxX = Math.min(columns - 1, Math.ceil(Math.max(s[0][0], s[1][0], s[2][0])));
    const minY = Math.max(0, Math.floor(Math.min(s[0][1], s[1][1], s[2][1]))), maxY = Math.min(rows - 1, Math.ceil(Math.max(s[0][1], s[1][1], s[2][1])));
    if (minX > maxX || minY > maxY) return;
    const edge = (u: number[], v: number[], x: number, y: number) => (v[0] - u[0]) * (y - u[1]) - (v[1] - u[1]) * (x - u[0]);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + .5, py = y + .5;
      const e0 = edge(s[0], s[1], px, py), e1 = edge(s[1], s[2], px, py), e2 = edge(s[2], s[0], px, py);
      if ((e0 >= 0 && e1 >= 0 && e2 >= 0) || (e0 <= 0 && e1 <= 0 && e2 <= 0)) cells[y * columns + x] = 1;
    }
  };
  // A triangle edge that crosses the near plane inside the view rectangle shows the mesh cut open.
  const cut = (p: THREE.Vector3, q: THREE.Vector3) => {
    if ((p.z + near) * (q.z + near) >= 0) return false;
    const t = (-near - p.z) / (q.z - p.z), x = p.x + (q.x - p.x) * t, y = p.y + (q.y - p.y) * t;
    return Math.abs(x) <= near * tanX && Math.abs(y) <= near * tanY;
  };
  const triangles = (mesh: THREE.Mesh, cells: Uint8Array) => {
    const geometry = mesh.geometry, position = geometry.getAttribute('position'), index = geometry.index;
    if (!position) return;
    m.multiplyMatrices(toView, mesh.matrixWorld);
    const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh ? mesh as THREE.SkinnedMesh : null;
    const count = index ? index.count : position.count;
    const vertex = (i: number, out: THREE.Vector3) => {
      const v = index ? index.getX(i) : i;
      if (skinned) skinned.getVertexPosition(v, out); else out.fromBufferAttribute(position, v);
      return out.applyMatrix4(m);
    };
    for (let i = 0; i + 2 < count; i += 3) {
      vertex(i, a); vertex(i + 1, b); vertex(i + 2, c);
      for (const p of [a, b, c]) if (visible(p)) nearestVisible = Math.min(nearestVisible, p.length());
      if (cut(a, b) || cut(b, c) || cut(c, a)) nearCuts++;
      if (a.z < -near && b.z < -near && c.z < -near) raster(cells, a, b, c);
    }
  };
  const shown = (object: THREE.Object3D) => { for (let o: THREE.Object3D | null = object; o; o = o.parent) if (!o.visible) return false; return true; };
  model.group.traverse(object => { if ((object as THREE.Mesh).isMesh && shown(object)) triangles(object as THREE.Mesh, cellsWeapon); });
  for (const mesh of probe.arms?.meshes ?? []) if (shown(mesh)) triangles(mesh, mesh.name.endsWith('R') ? cellsR : cellsL);

  const total = columns * rows;
  const count = (cells: Uint8Array) => cells.reduce((sum, v) => sum + v, 0) / total;
  let any = 0, corridor = 0, corridorCells = 0, reticle = 0, reticleCells = 0, minX = 1, maxX = 0, minY = 1, maxY = 0;
  const half = .04, halfX = half / camera.aspect;
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const i = y * columns + x, on = cellsWeapon[i] | cellsR[i] | cellsL[i];
    const fx = (x + .5) / columns, fy = (y + .5) / rows;
    const inCorridor = fx >= CORRIDOR.x0 && fx <= CORRIDOR.x1 && fy >= CORRIDOR.y0 && fy <= CORRIDOR.y1;
    if (inCorridor) { corridorCells++; corridor += on; }
    if (Math.abs(fx - .5) <= halfX && Math.abs(fy - .5) <= half) { reticleCells++; reticle += on; }
    if (!on) continue;
    any++; minX = Math.min(minX, x / columns); maxX = Math.max(maxX, (x + 1) / columns); minY = Math.min(minY, y / rows); maxY = Math.max(maxY, (y + 1) / rows);
  }
  const point = (object: THREE.Object3D, local?: THREE.Vector3) => screen((local ? object.localToWorld(local.clone()) : object.getWorldPosition(new THREE.Vector3())).applyMatrix4(toView));
  const root = model.group.children[0] ?? model.group;
  const sightNode = root.getObjectByName(`${probe.weapon}_sight`);
  const eye = model.spec.adsEye ? new THREE.Vector3(...model.spec.adsEye as [number, number, number]) : sightNode?.position.clone();
  const sight = eye ? point(sightNode?.parent ?? root, eye) : point(model.muzzle);
  // Bore and top of the gun in view space.
  const q = new THREE.Quaternion(); probe.holder.getWorldQuaternion(q);
  q.premultiply(new THREE.Quaternion().setFromRotationMatrix(toView));
  const bore = new THREE.Vector3(0, 0, -1).applyQuaternion(q), up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const deg = THREE.MathUtils.radToDeg;
  const arm = (side: 'R' | 'L', cells: Uint8Array): ArmFrame | null => {
    const mesh = probe.arms?.meshes.find(mesh => mesh.name.endsWith(side));
    if (!probe.arms || !mesh || !shown(mesh)) return null;
    const chain = side === 'R' ? probe.arms.right : probe.arms.left;
    const at = (bone: THREE.Bone) => bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(toView);
    const shoulder = at(chain.upper.bone), elbow = at(chain.fore.bone), wrist = at(chain.hand.bone);
    const bend = deg(shoulder.clone().sub(elbow).angleTo(wrist.clone().sub(elbow)));
    const span = (values: number[]): EdgeSpan | undefined => values.length ? { from: Math.min(...values), to: Math.max(...values) } : undefined;
    const bottom: number[] = [], top: number[] = [], left: number[] = [], right: number[] = [];
    for (let x = 0; x < columns; x++) { if (cells[(rows - 1) * columns + x]) bottom.push((x + .5) / columns); if (cells[x]) top.push((x + .5) / columns); }
    for (let y = 0; y < rows; y++) { if (cells[y * columns]) left.push((y + .5) / rows); if (cells[y * columns + columns - 1]) right.push((y + .5) / rows); }
    return { coverage: count(cells), wrist: screen(wrist), exits: { bottom: span(bottom), top: span(top), left: span(left), right: span(right) },
      elbow, wristView: wrist, bend };
  };
  return {
    muzzle: point(model.muzzle), sight, grip: point(probe.holder),
    yaw: deg(Math.atan2(-bore.x, -bore.z)), pitch: deg(Math.asin(THREE.MathUtils.clamp(bore.y, -1, 1))),
    roll: deg(Math.atan2(-up.x, up.y)),
    coverage: any / total, weaponCoverage: count(cellsWeapon), corridor: corridorCells ? corridor / corridorCells : 0,
    reticle: reticleCells ? reticle / reticleCells : 0,
    bounds: { minX, maxX, minY, maxY }, R: arm('R', cellsR), L: arm('L', cellsL),
    nearestVisible, nearCuts,
  };
}
