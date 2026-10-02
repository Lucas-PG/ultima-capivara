import * as THREE from 'three';

/** Keep the world palm attached to its paw while the elbow solves around it.
 * The sculpt's soft forearm ownership can extend beyond the wrist into the palm.
 * Work in the inverse bind frame, where paw +Y is the authored digit direction,
 * so neither the current animation nor the scene transform changes ownership.
 * Only existing same-side forearm weight moves; digit and other body weights stay.
 * Returns the number of corrected vertices. Safe to apply again after reloading. */
export function correctWorldPalmWeights(mesh: THREE.SkinnedMesh): number {
  const position = mesh.geometry.getAttribute('position');
  const indices = mesh.geometry.getAttribute('skinIndex');
  const original = mesh.geometry.getAttribute('skinWeight');
  if (!position || !indices || !original) return 0;
  const bones = mesh.skeleton.bones;
  const digits = new Set(bones.flatMap((bone, i) => /^paw_(index|middle|ring|thumb)[123]_[LR]$/.test(bone.name) ? [i] : []));
  let weights: THREE.Float32BufferAttribute | undefined, changed = 0;
  const point = new THREE.Vector3();
  for (const side of ['L', 'R'] as const) {
    const paw = bones.findIndex(bone => bone.name === `paw_${side}`);
    if (paw < 0) continue;
    const fore = new Set(bones.flatMap((bone, i) => bone.name === `forearm_${side}` || bone.name === `forearm_twist_${side}` ? [i] : []));
    const toPaw = new THREE.Matrix4().multiplyMatrices(mesh.skeleton.boneInverses[paw], mesh.bindMatrix);
    for (let vertex = 0; vertex < position.count; vertex++) {
      let pawSlot = -1, pawWeight = 0, foreWeight = 0, digit = false;
      for (let slot = 0; slot < 4; slot++) {
        const bone = indices.getComponent(vertex, slot), weight = original.getComponent(vertex, slot);
        if (weight <= 0) continue;
        if (digits.has(bone)) digit = true;
        if (bone === paw) { pawSlot = slot; pawWeight += weight; }
        if (fore.has(bone)) foreWeight += weight;
      }
      // Existing paw ownership confines this to the wrist and palm. In the
      // shipped LODs every distal forearm-weighted skin vertex has this ownership.
      if (digit || pawSlot < 0 || foreWeight <= 0) continue;
      point.fromBufferAttribute(position, vertex).applyMatrix4(toPaw);
      const t = THREE.MathUtils.clamp((point.y + .020) / .032, 0, 1);
      const wrist = t * t * (3 - 2 * t);
      // An absolute lower bound is idempotent, including on future exports that
      // already carry this correction. Preserve any stronger original paw fit.
      const moved = Math.max(0, (pawWeight + foreWeight) * wrist - pawWeight);
      if (moved <= 1e-8) continue;
      if (!weights) {
        const values = new Float32Array(original.count * 4);
        for (let i = 0; i < original.count; i++) for (let j = 0; j < 4; j++) values[i * 4 + j] = original.getComponent(i, j);
        weights = new THREE.Float32BufferAttribute(values, 4);
      }
      const remaining = Math.max(0, 1 - moved / foreWeight);
      for (let slot = 0; slot < 4; slot++) {
        if (fore.has(indices.getComponent(vertex, slot))) weights.setComponent(vertex, slot, original.getComponent(vertex, slot) * remaining);
      }
      weights.setComponent(vertex, pawSlot, pawWeight + moved);
      changed++;
    }
  }
  if (weights) mesh.geometry.setAttribute('skinWeight', weights);
  return changed;
}
