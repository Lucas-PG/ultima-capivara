import { triggerInGuard } from './trigger-guard.mjs';

// Run inside the character review page. Exposes the actual posed world paw to
// the same signed skin probe used for first person, without moving either mesh.
export function installThirdPersonGripProbe(input) {
  const { weaponId, triggerIndices, contactIndices } = typeof input === 'string' ? { weaponId: input } : input;
  const review = window.capyReview, { avatar, renderer } = review;
  const source = avatar.body.getObjectByName('Capybara_LOD0');
  if (!source?.isSkinnedMesh) throw new Error('Missing visible world-character skin');
  const weapon = avatar.weapon, scene = renderer.scene;
  scene.updateMatrixWorld(true);
  const sourceIndex = source.geometry.index;
  const skinIndex = source.geometry.attributes.skinIndex, skinWeight = source.geometry.attributes.skinWeight;
  const V3 = weapon.position.constructor, M4 = weapon.matrixWorld.constructor, Q = weapon.quaternion.constructor;
  const canonical = name => /^paw_[LR]$/.test(name) ? name.replace(/^paw/, 'hand') : name.replace(/^paw_/, '');
  for (const mesh of window.__tpProbeMeshes ?? []) mesh.geometry.dispose();
  const meshes = ['R', 'L'].map(side => {
    const bind = name => source.skeleton.boneInverses[source.skeleton.bones.findIndex(bone => bone.name === name)].clone().invert();
    const wristBind = bind(`paw_${side}`), wristOrigin = new V3().setFromMatrixPosition(wristBind);
    const forward = new V3(0, 1, 0).applyQuaternion(new Q().setFromRotationMatrix(new M4().extractRotation(wristBind))).normalize();
    const across = new V3().setFromMatrixPosition(bind(`paw_ring1_${side}`)).sub(new V3().setFromMatrixPosition(bind(`paw_index1_${side}`))).normalize();
    const palm = new V3().crossVectors(forward, across).multiplyScalar(side === 'R' ? 1 : -1).normalize();
    const rest = new M4().makeBasis(forward, palm, new V3().crossVectors(forward, palm));
    const canonicalRest = new M4().makeBasis(new V3(0, 0, -1), new V3(0, -1, 0), new V3(-1, 0, 0)).multiply(rest.invert());
    const indices = [], originalToLocal = new Map();
    for (let i = 0; i < skinIndex.count; i++) {
      let largest = -1, bone = 0;
      for (let j = 0; j < 4; j++) if (skinWeight.getComponent(i, j) > largest) {
        largest = skinWeight.getComponent(i, j); bone = skinIndex.getComponent(i, j);
      }
      const name = source.skeleton.bones[bone].name;
      if (name === `paw_${side}` || /^paw_(?:index|middle|ring|thumb)[123]_[LR]$/.test(name) && name.endsWith(side)) {
        originalToLocal.set(i, indices.length); indices.push(i);
      }
    }
    const geometry = source.geometry.clone();
    // BufferGeometry.clone shares userData. Probe topology belongs only to
    // this cropped paw, never to the other paw or the rendered source skin.
    geometry.userData = {};
    geometry.clearGroups();
    for (const [name, attribute] of Object.entries(source.geometry.attributes)) {
      const array = new Float32Array(indices.length * attribute.itemSize);
      indices.forEach((original, i) => {
        for (let k = 0; k < attribute.itemSize; k++) array[i * attribute.itemSize + k] = attribute.getComponent(original, k);
      });
      // The Node and browser loaders may interleave different attributes. This
      // read-only virtual mesh needs only BufferAttribute's numeric accessors.
      const itemSize = attribute.itemSize;
      geometry.setAttribute(name, { array, itemSize, count: indices.length,
        getComponent(i, k) { return array[i * itemSize + k]; },
        getX(i) { return array[i * itemSize]; }, getY(i) { return array[i * itemSize + 1]; },
        getZ(i) { return array[i * itemSize + 2]; }, getW(i) { return array[i * itemSize + 3]; } });
    }
    const triangles = [];
    if (sourceIndex) for (let i = 0; i < sourceIndex.count; i += 3) {
      const a = originalToLocal.get(sourceIndex.getX(i)), b = originalToLocal.get(sourceIndex.getX(i + 1)), c = originalToLocal.get(sourceIndex.getX(i + 2));
      if (a !== undefined && b !== undefined && c !== undefined) triangles.push(a, b, c);
    }
    geometry.setIndex(triangles);
    geometry.userData.qaCloseContactBoundary = true;
    // The probe reads skin from getVertexPosition, so the canonical bone names
    // are labels only. Deformation still uses the untouched real skeleton.
    const mesh = {
      name: `arm_${side}`, isMesh: true, isSkinnedMesh: true, visible: true, parent: null,
      geometry, matrixWorld: source.matrixWorld, bindMatrix: source.bindMatrix, bindMatrixInverse: source.bindMatrixInverse,
      skeleton: { bones: source.skeleton.bones.map(bone => ({ name: canonical(bone.name), getWorldPosition: bone.getWorldPosition.bind(bone) })),
        boneInverses: source.skeleton.boneInverses, boneMatrices: source.skeleton.boneMatrices, update: source.skeleton.update.bind(source.skeleton) },
      getVertexPosition(i, out) { return source.getVertexPosition(indices[i], out); },
      bindPalmPosition(i, out) {
        return out.fromBufferAttribute(source.geometry.attributes.position, indices[i]).applyMatrix4(source.bindMatrix)
          .sub(wristOrigin).applyMatrix4(canonicalRest).multiplyScalar(1 / 1.3);
      },
      traverse(callback) { callback(this); },
    };
    return mesh;
  });
  const muzzle = { getWorldPosition(out) { return out.set(0, 0, -.3).applyMatrix4(weapon.matrixWorld); } };
  const body = { name: `${weaponId}_body`, isMesh: true, visible: weapon.visible, parent: weapon.parent,
    geometry: weapon.geometry, matrixWorld: weapon.matrixWorld, traverse(callback) { callback(this); } };
  const parts = { body, ...(weapon.userData.shortParts ?? {}) };
  if (triggerIndices?.length) {
    const geometry = weapon.geometry.clone(); geometry.setIndex(triggerIndices);
    parts.trigger = { ...body, name: `${weaponId}_trigger`, geometry };
  }
  for (const [name, indices] of Object.entries(contactIndices ?? {})) {
    const geometry = weapon.geometry.clone(); geometry.setIndex(indices);
    parts[name] = { ...body, name: `${weaponId}_${name}`, geometry, position: new V3(), quaternion: new Q() };
  }
  const mag = weapon.getObjectByName(`${weaponId}_mag`); if (mag) parts.mag = mag;
  window.__vmProbe = { scene, holder: { matrixWorld: weapon.matrixWorld, position: weapon.position, quaternion: weapon.quaternion, scale: weapon.getWorldScale(new V3()) },
    arms: { meshes }, models: { [weaponId]: { group: weapon, muzzle, parts } } };
  window.__tpProbeMeshes = [...meshes, ...(parts.trigger ? [parts.trigger] : []), ...Object.keys(contactIndices ?? {}).map(name => parts[name])];
  return { vertices: Object.fromEntries(meshes.map(mesh => [mesh.name.at(-1), mesh.geometry.attributes.position.count])),
    scale: weapon.getWorldScale(new V3()).toArray(), weaponGeometry: weapon.geometry.name };
}

/** Count actual posed index vertices still occupying the physical guard opening. */
export function worldIndexGuardOccupancy(weaponId, side = 'R') {
  const probe = window.__vmProbe;
  probe.scene.updateMatrixWorld(true);
  const mesh = probe.arms.meshes.find(arm => arm.name.endsWith(side));
  const M4 = probe.holder.matrixWorld.constructor, V3 = probe.holder.position.constructor;
  const inverse = new M4().copy(probe.holder.matrixWorld).invert(), point = new V3();
  const indices = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
  const bones = new Set(mesh.skeleton.bones.flatMap((bone, i) => /^index[123]_[LR]$/.test(bone.name) ? [i] : []));
  let total = 0, inside = 0;
  for (let i = 0; i < indices.count; i++) {
    let belongs = false;
    for (let k = 0; k < 4; k++) if (weights.getComponent(i, k) > 0 && bones.has(indices.getComponent(i, k))) belongs = true;
    if (!belongs) continue;
    mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse).multiplyScalar(1000);
    total++; if (triggerInGuard(weaponId, point.toArray())) inside++;
  }
  if (!total) throw new Error(`Missing actual index skin for ${weaponId}/${side}`);
  return { total, inside };
}
