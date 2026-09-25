import type * as THREE from 'three';

// Owned, static, never-raycast geometry only needs its arrays until upload.
// Bounds must already be computed. Callers use fresh merged attributes; external
// views must not alias their buffers. Partial/shared views keep the GC fallback.
export function releaseAfterUpload(geometry: THREE.BufferGeometry) {
  const attributes = [...Object.values(geometry.attributes), ...(geometry.index ? [geometry.index] : [])] as THREE.BufferAttribute[];
  const uses = new Map<ArrayBufferLike, number>();
  for (const attribute of attributes) uses.set(attribute.array.buffer, (uses.get(attribute.array.buffer) ?? 0) + 1);
  for (const attribute of attributes) {
    const source = attribute.array;
    const ownsBuffer = source.byteOffset === 0 && source.byteLength === source.buffer.byteLength && uses.get(source.buffer) === 1;
    attribute.onUpload(function (this: THREE.BufferAttribute) {
      const array = this.array;
      (this as { array: THREE.TypedArray }).array = new (array.constructor as new (length: number) => THREE.TypedArray)(0);
      // Dropping the view alone leaves hundreds of MB for a later major GC.
      // Transfer to zero bytes releases owned backing storage during loading.
      if (ownsBuffer && array.buffer instanceof ArrayBuffer) {
        (array.buffer as ArrayBuffer & { transfer?: (size: number) => ArrayBuffer }).transfer?.(0);
      }
    });
  }
  return geometry;
}
