import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The same self-contained function runs in Playwright's page.evaluate. Its
// analytical fixtures here guard millimetres, signed contact, and hidden parts.
// @ts-expect-error The browser QA tool is plain JavaScript.
import { measureGrip } from '../tools/qa/grip-measure.mjs';

function probe(point: [number, number, number], scale = 1) {
  const scene = new THREE.Scene(), holder = new THREE.Group(), group = new THREE.Group();
  holder.scale.setScalar(scale); holder.add(group); scene.add(holder);
  const solid = new THREE.Mesh<THREE.BufferGeometry>(new THREE.BoxGeometry(.02, .02, .02), new THREE.MeshBasicMaterial());
  solid.name = 'pistol_grip'; group.add(solid);
  const muzzle = new THREE.Object3D(); group.add(muzzle);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(point, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
  const hand = new THREE.Bone(); hand.name = 'hand_R';
  const paw = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  paw.name = 'arm_R'; paw.add(hand); holder.add(paw); paw.bind(new THREE.Skeleton([hand]));
  vi.stubGlobal('window', { __vmProbe: { scene, holder, arms: { meshes: [paw] }, models: { pistol: { group, muzzle } } } });
  return { read: (options = {}) => measureGrip(['pistol', 'R', false, options]), solid, group, scene, paw };
}

afterEach(() => vi.unstubAllGlobals());

describe('signed skin contact probe', () => {
  it('distinguishes a half-millimetre gap from half-millimetre penetration', () => {
    expect(probe([.0105, 0, 0]).read().worst).toBe(.5);
    expect(probe([.0095, 0, 0]).read().worst).toBe(-.5);
  });

  it('reports a floating paw as a positive gap instead of accepting nonpenetration', () => {
    const result = probe([.025, 0, 0]).read();
    expect(result.worst).toBe(15);
    expect(result.summary.hand.min).toBeGreaterThan(1.5);
  });

  it('measures diagonal distances to edges in three dimensions', () => {
    expect(probe([.013, .014, 0]).read().worst).toBe(5);
  });

  it('preserves physical millimetres when the weapon and paw are scaled together', () => {
    expect(probe([.011, 0, 0], 1.3).read().worst).toBe(1.3);
  });

  it('ignores geometry hidden by a parent, even when the mesh itself is visible', () => {
    const fixture = probe([.0105, 0, 0]);
    const hidden = new THREE.Group(); hidden.visible = false;
    hidden.add(new THREE.Mesh(new THREE.BoxGeometry(.022, .022, .022), new THREE.MeshBasicMaterial()));
    fixture.group.add(hidden);
    expect(fixture.read().worst).toBe(.5);
  });

  it('uses the posed skin rather than the undeformed vertex', () => {
    const fixture = probe([.02, 0, 0]);
    fixture.paw.skeleton.bones[0].position.x = -.0095;
    expect(fixture.read().worst).toBe(.5);
  });

  it('cannot count a lateral trigger touch as contact with its pulling face', () => {
    const fixture = probe([.0105, 0, 0]);
    expect(fixture.read().worst).toBe(.5);
    expect(fixture.read({ normal: [0, 0, -1] }).worst).toBeCloseTo(10.012, 2);
    expect(probe([0, 0, -.0105]).read({ normal: [0, 0, -1] }).worst).toBe(.5);
    expect(probe([0, 0, -.0095]).read({ normal: [0, 0, -1] }).worst).toBe(-.5);
  });

  it('detects penetration when an overlapping part has the nearest outward-facing surface', () => {
    const fixture = probe([.008, 0, 0]);
    const overlap = new THREE.Mesh(new THREE.BoxGeometry(.02, .02, .02), new THREE.MeshBasicMaterial());
    overlap.position.x = .019; fixture.group.add(overlap);
    // The second box is 1 mm away, but the point is already 2 mm inside the first.
    expect(fixture.read().worst).toBe(-2);
    fixture.paw.skeleton.bones[0].position.x = .0009;
    // A 0.1 mm nearby gap must not hide the remaining 1.1 mm penetration either.
    expect(fixture.read().worst).toBe(-1.1);
  });

  it('uses canonical bind-palm regions without replacing the real posed skin', () => {
    const fixture = probe([.0105, 0, 0]);
    Object.assign(fixture.paw, { bindPalmPosition: (_index: number, out: THREE.Vector3) => out.set(0, -.02, -.03) });
    expect(fixture.read({ region: 'palm' }).worst).toBe(.5);
    fixture.paw.skeleton.bones[0].position.x = .003;
    expect(fixture.read({ region: 'palm' }).worst).toBe(3.5);
  });

  it('separates overlapping closed solids merged into one arsenal body mesh', () => {
    const fixture = probe([.0089, 0, 0]);
    const overlap = new THREE.BoxGeometry(.02, .02, .02).translate(.019, 0, 0);
    fixture.solid.geometry = mergeGeometries([fixture.solid.geometry, overlap]);
    expect(fixture.read().worst).toBe(-1.1);
    expect(fixture.solid.geometry.userData.qaSolidTopology.count).toBe(2);
  });
});
