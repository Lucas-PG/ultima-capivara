import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
// @ts-expect-error Self-contained browser geometry probe.
import { measureGrip } from '../tools/qa/grip-measure.mjs';

afterEach(() => vi.unstubAllGlobals());

it('closes a cropped paw for containment while measuring only actual skin triangles', () => {
  const scene = new THREE.Scene(), holder = new THREE.Group(), group = new THREE.Group();
  scene.add(holder); holder.add(group);
  const geometry = new THREE.BoxGeometry(.02, .02, .02);
  // The +X face is missing, as at the end of a cropped wrist. UV splits remain.
  geometry.setIndex(Array.from(geometry.index!.array).slice(6));
  const target = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  target.name = 'arm_L'; group.add(target);
  const source = new THREE.BufferGeometry();
  source.setAttribute('position', new THREE.Float32BufferAttribute([.005, 0, 0], 3));
  source.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4));
  source.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
  const bone = new THREE.Bone(); bone.name = 'hand_R';
  const paw = new THREE.SkinnedMesh(source, new THREE.MeshBasicMaterial());
  paw.name = 'arm_R'; paw.add(bone); holder.add(paw); paw.bind(new THREE.Skeleton([bone]));
  const muzzle = new THREE.Object3D(); group.add(muzzle);
  vi.stubGlobal('window', { __vmProbe: { scene, holder, arms: { meshes: [paw, target] }, models: { pistol: { group, muzzle } } } });
  const read = () => measureGrip(['pistol', 'R', true]);
  expect(read().worst, 'uncapped winding misses a point inside the open wrist').toBe(10);
  geometry.userData.qaCloseContactBoundary = true;
  const otherCrop = geometry.clone();
  const sharedData = geometry.userData;
  const closed = read();
  expect(geometry.userData).not.toBe(sharedData);
  expect(otherCrop.userData.qaContactTriangleCount, 'closing one crop cannot mark another as already closed').toBeUndefined();
  expect(geometry.userData.qaContactTriangleCount).toBe(10);
  expect(geometry.index!.count).toBe(36);
  expect(closed.worst, 'closure restores real penetration').toBe(-10);
  expect(closed.nearestSurfaceDistance, 'the cap at 5 mm is never a contact surface').toBe(10);
  source.getAttribute('position').setXYZ(0, .0105, 0, 0);
  const outside = read();
  expect(outside.worst, 'outside the closed wrist is still outside').toBeCloseTo(10.012, 2);
  expect(outside.nearestSurfaceDistance, 'a 0.5 mm cap gap cannot invent skin contact').toBeCloseTo(10.012, 2);
  expect(geometry.index!.count, 'repeated reads do not add more caps').toBe(36);
  const closeOther = (window as unknown as { __qaCloseContactBoundary: (geometry: THREE.BufferGeometry) => void }).__qaCloseContactBoundary;
  closeOther(otherCrop);
  expect(otherCrop.index!.count).toBe(36);
  expect(otherCrop.userData.qaContactTriangleCount).toBe(10);
});
