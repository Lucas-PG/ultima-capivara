import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { correctWorldPalmWeights } from '../src/render/world-palm-weights';
import { realGeometryAsset } from './helpers/real-viewmodel';

let asset: Awaited<ReturnType<typeof realGeometryAsset>>;
beforeAll(async () => { asset = await realGeometryAsset('models/capybara/capybara.glb'); asset.scene.updateMatrixWorld(true); }, 60_000);

function worldVertex(mesh: THREE.SkinnedMesh, vertex: number) {
  return mesh.getVertexPosition(vertex, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
}

for (let level = 0; level < 3; level++) describe(`world palm LOD${level}`, () => {
  let original: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  beforeAll(() => {
    original = (asset.scene.getObjectByName(`Capybara_LOD${level}`) as THREE.SkinnedMesh).geometry.getAttribute('skinWeight');
  });
  it('preserves the actual bind surface, normalized influences, and every digit weight', () => {
    const mesh = asset.scene.getObjectByName(`Capybara_LOD${level}`) as THREE.SkinnedMesh;
    const indices = mesh.geometry.getAttribute('skinIndex');
    const position = mesh.geometry.getAttribute('position'), normal = mesh.geometry.getAttribute('normal');
    const before = Array.from({ length: position.count }, (_, vertex) => worldVertex(mesh, vertex));
    const changed = correctWorldPalmWeights(mesh);
    expect(changed).toBeGreaterThan(0);
    expect(mesh.geometry.getAttribute('position')).toBe(position);
    expect(mesh.geometry.getAttribute('normal')).toBe(normal);
    expect(mesh.geometry.getAttribute('skinIndex')).toBe(indices);
    const weights = mesh.geometry.getAttribute('skinWeight');
    let bindError = 0, weightError = 0, digitError = 0, digits = 0;
    for (let vertex = 0; vertex < position.count; vertex++) {
      bindError = Math.max(bindError, worldVertex(mesh, vertex).distanceTo(before[vertex]));
      let total = 0, digit = false;
      for (let slot = 0; slot < 4; slot++) {
        total += weights.getComponent(vertex, slot);
        if (original.getComponent(vertex, slot) > 0 && /^paw_(index|middle|ring|thumb)/.test(mesh.skeleton.bones[indices.getComponent(vertex, slot)].name)) digit = true;
      }
      weightError = Math.max(weightError, Math.abs(total - 1));
      if (digit) {
        digits++;
        for (let slot = 0; slot < 4; slot++) digitError = Math.max(digitError, Math.abs(weights.getComponent(vertex, slot) - original.getComponent(vertex, slot)));
      }
    }
    expect(digits).toBeGreaterThan(0);
    expect(bindError, 'bind skin position error in metres').toBeLessThan(1e-6);
    expect(weightError).toBeLessThan(1e-6);
    expect(digitError).toBeLessThan(1e-7);
    const once = Array.from(weights.array);
    correctWorldPalmWeights(mesh);
    const twice = mesh.geometry.getAttribute('skinWeight');
    const repeatError = once.reduce((maximum, weight, i) => Math.max(maximum, Math.abs(weight - twice.array[i])), 0);
    expect(repeatError, 'repeat correction is idempotent').toBeLessThan(1e-7);
  });

  for (const side of ['L', 'R'] as const) it(`keeps distal ${side} palm skin on the fixed paw when the elbow rotates`, () => {
    const mesh = asset.scene.getObjectByName(`Capybara_LOD${level}`) as THREE.SkinnedMesh;
    correctWorldPalmWeights(mesh);
    const corrected = mesh.geometry.getAttribute('skinWeight'), indices = mesh.geometry.getAttribute('skinIndex');
    const bones = mesh.skeleton.bones, pawIndex = bones.findIndex(bone => bone.name === `paw_${side}`);
    const paw = bones[pawIndex], fore = bones.find(bone => bone.name === `forearm_${side}`)!;
    const foreIds = new Set(bones.flatMap((bone, i) => bone.name === `forearm_${side}` || bone.name === `forearm_twist_${side}` ? [i] : []));
    const toPaw = new THREE.Matrix4().multiplyMatrices(mesh.skeleton.boneInverses[pawIndex], mesh.bindMatrix);
    const point = new THREE.Vector3(), vertices: number[] = [];
    for (let vertex = 0; vertex < original.count; vertex++) {
      point.fromBufferAttribute(mesh.geometry.getAttribute('position'), vertex).applyMatrix4(toPaw);
      if (point.y < .012) continue;
      let pawWeight = 0, foreWeight = 0;
      for (let slot = 0; slot < 4; slot++) {
        const bone = indices.getComponent(vertex, slot), weight = original.getComponent(vertex, slot);
        if (bone === pawIndex) pawWeight += weight;
        if (foreIds.has(bone)) foreWeight += weight;
      }
      if (pawWeight > 0 && foreWeight > 0) vertices.push(vertex);
    }
    expect(vertices.length, 'actual distal palm vertices with leaked forearm weights').toBeGreaterThan(10);
    const before = vertices.map(vertex => worldVertex(mesh, vertex));
    const pawWorld = paw.matrixWorld.clone(), pawLocal = paw.matrix.clone(), foreRotation = fore.quaternion.clone();
    let fixedError = 0, leakedError = 0;
    try {
      for (const angle of [-.6, .6]) {
        fore.quaternion.copy(foreRotation).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle));
        fore.updateMatrixWorld(true);
        new THREE.Matrix4().copy(paw.parent!.matrixWorld).invert().multiply(pawWorld).decompose(paw.position, paw.quaternion, paw.scale);
        asset.scene.updateMatrixWorld(true);
        for (let i = 0; i < vertices.length; i++) fixedError = Math.max(fixedError, worldVertex(mesh, vertices[i]).distanceTo(before[i]));
        mesh.geometry.setAttribute('skinWeight', original);
        for (let i = 0; i < vertices.length; i++) leakedError = Math.max(leakedError, worldVertex(mesh, vertices[i]).distanceTo(before[i]));
        mesh.geometry.setAttribute('skinWeight', corrected);
      }
    } finally {
      fore.quaternion.copy(foreRotation);
      pawLocal.decompose(paw.position, paw.quaternion, paw.scale);
      asset.scene.updateMatrixWorld(true);
      mesh.geometry.setAttribute('skinWeight', corrected);
    }
    expect(leakedError, 'original GLB weights visibly pull the anchored palm away').toBeGreaterThan(.005);
    expect(fixedError, 'corrected palm remains on its fixed paw in metres').toBeLessThan(1e-6);
  });
});
