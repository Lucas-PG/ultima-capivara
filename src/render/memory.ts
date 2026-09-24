import type * as THREE from 'three';

// Static, never-raycast geometry only needs its arrays until the GPU has them.
// Bounding spheres must already be computed. Drops the CPU copy (the island's
// merged world, vegetation and props were ~275 MB of JS heap).
export function releaseAfterUpload(geometry: THREE.BufferGeometry) {
  const attributes = [...Object.values(geometry.attributes), ...(geometry.index ? [geometry.index] : [])] as THREE.BufferAttribute[];
  for (const attribute of attributes) {
    attribute.onUpload(function (this: THREE.BufferAttribute) {
      (this as { array: THREE.TypedArray }).array = new (this.array.constructor as new (length: number) => THREE.TypedArray)(0);
    });
  }
  return geometry;
}
