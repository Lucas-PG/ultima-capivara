import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { releaseAfterUpload } from '../src/render/memory';

describe('static geometry upload ownership', () => {
  it('retains vertex data until upload, then frees owned backing storage without changing draw counts or bounds', () => {
    const geometry = new THREE.BoxGeometry(1, 2, 3);
    geometry.computeBoundingSphere();
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const index = geometry.index!, bounds = geometry.boundingSphere!.clone();
    const vertices = position.array, indices = index.array;
    const vertexCount = position.count, indexCount = index.count;
    releaseAfterUpload(geometry);
    expect(vertices.byteLength).toBeGreaterThan(0);
    expect(indices.byteLength).toBeGreaterThan(0);
    position.onUploadCallback(); index.onUploadCallback();
    expect(vertices.buffer.byteLength).toBe(0);
    expect(indices.buffer.byteLength).toBe(0);
    expect(position.array.length).toBe(0);
    expect(position.count).toBe(vertexCount);
    expect(index.count).toBe(indexCount);
    expect(geometry.boundingSphere).toEqual(bounds);
    geometry.dispose();
  });

  it('does not detach data still needed by another attribute or an external partial view', () => {
    const shared = new Float32Array([1, 2, 3, 4, 5, 6]);
    const geometry = new THREE.BufferGeometry();
    const position = new THREE.BufferAttribute(shared, 3), normal = new THREE.BufferAttribute(shared, 3);
    const uv = new THREE.BufferAttribute(new Float32Array(shared.buffer, 0, 4), 2);
    geometry.setAttribute('position', position).setAttribute('normal', normal).setAttribute('uv', uv);
    releaseAfterUpload(geometry); position.onUploadCallback();
    expect([...normal.array]).toEqual([1, 2, 3, 4, 5, 6]);
    normal.onUploadCallback(); uv.onUploadCallback();
    expect([...shared]).toEqual([1, 2, 3, 4, 5, 6]);
    const partial = new THREE.BufferAttribute(shared.subarray(0, 3), 3);
    const other = new THREE.BufferGeometry().setAttribute('position', partial);
    releaseAfterUpload(other); partial.onUploadCallback();
    expect([...shared]).toEqual([1, 2, 3, 4, 5, 6]);
    geometry.dispose(); other.dispose();
  });

  it('still drops the attribute view on browsers without transfer', () => {
    const source = new Float32Array([1, 2, 3]);
    Object.defineProperty(source.buffer, 'transfer', { value: undefined });
    const position = new THREE.BufferAttribute(source, 3);
    const geometry = new THREE.BufferGeometry().setAttribute('position', position);
    releaseAfterUpload(geometry); position.onUploadCallback();
    expect(position.array.length).toBe(0);
    expect(source.buffer.byteLength).toBe(12);
    geometry.dispose();
  });
});
