import { triggerInGuard } from './trigger-guard.mjs';

// Check every real index skin vertex, including blended vertices at the knuckle.
// A distal centroid outside the opening does not prove the digit has left it.
export function indexGuardOccupancy(weapon, side = 'R') {
  const view = window.__vmProbe;
  view.scene.updateMatrixWorld(true);
  const mesh = view.arms.meshes.find(arm => arm.name.endsWith(side));
  const Matrix4 = view.holder.matrixWorld.constructor, Vector3 = view.holder.position.constructor;
  const toGun = new Matrix4().copy(view.holder.matrixWorld).invert();
  const indices = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
  const indexBones = new Set(mesh.skeleton.bones.flatMap((bone, i) => /^index[123]_[LR]$/.test(bone.name) ? [i] : []));
  const point = new Vector3(), vertices = [];
  for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
    let belongs = false;
    for (let k = 0; k < 4; k++) if (weights.getComponent(i, k) > 0 && indexBones.has(indices.getComponent(i, k))) belongs = true;
    if (!belongs) continue;
    mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).applyMatrix4(toGun).multiplyScalar(1000);
    vertices.push(point.toArray());
  }
  if (!vertices.length) throw new Error(`No index skin vertices for ${weapon}/${side}`);
  return { total: vertices.length, inside: vertices.filter(point => triggerInGuard(weapon, point)).length, vertices };
}
