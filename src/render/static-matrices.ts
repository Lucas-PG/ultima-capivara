import * as THREE from 'three';

const sameMatrix = (a: THREE.Matrix4, b: THREE.Matrix4) => {
  for (let i = 0; i < 16; i++) if (!Object.is(a.elements[i], b.elements[i])) return false;
  return true;
};

/**
 * Cache an assembled subtree whose descendant transforms are static. Visibility,
 * material and geometry updates still use their usual render paths. Root/parent
 * transforms refresh the whole subtree; call the returned invalidator before
 * changing a descendant transform or adding/removing a child.
 */
export function cacheStaticMatrices(root: THREE.Object3D): () => void {
  const update = root.updateMatrixWorld;
  const local = new THREE.Matrix4(), world = new THREE.Matrix4(), parentWorld = new THREE.Matrix4();
  let valid = false, parent: THREE.Object3D | null = null;
  const invalidate = () => { valid = false; parent = null; };
  // A retained disposed kit must not retain its former scene through this cache.
  root.addEventListener('removed', invalidate);
  root.updateMatrixWorld = function (force?: boolean) {
    if (valid && this.matrixAutoUpdate) this.updateMatrix();
    if (!valid || this.parent !== parent || !sameMatrix(this.matrix, local) || !sameMatrix(this.matrixWorld, world) ||
      this.parent && !sameMatrix(this.parent.matrixWorld, parentWorld)) {
      update.call(this, force);
      parent = this.parent; local.copy(this.matrix); world.copy(this.matrixWorld);
      if (parent) parentWorld.copy(parent.matrixWorld);
      valid = true;
    } else this.matrixWorldNeedsUpdate = false;
  };
  return invalidate;
}
