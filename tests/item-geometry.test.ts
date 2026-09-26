import * as THREE from 'three';
import { expect, it } from 'vitest';
import { itemGeometry } from '../src/render/item-geometry';

it('keeps the visible remote pistol compact and distinct from a long gun within the prop budget', () => {
  const pistol = itemGeometry('weapon', 'pistol'), rifle = itemGeometry('weapon', 'm4');
  pistol.computeBoundingBox(); rifle.computeBoundingBox();
  const size = pistol.boundingBox!.getSize(new THREE.Vector3());
  expect(size.z).toBeLessThan(.35); expect(size.y).toBeGreaterThan(.2);
  expect(size.z / rifle.boundingBox!.getSize(new THREE.Vector3()).z).toBeLessThan(.4);
  expect(pistol.getAttribute('position').count / 3).toBeLessThan(2000);
  expect(pistol.getAttribute('color').count).toBe(pistol.getAttribute('position').count);
  expect(Array.from(pistol.getAttribute('normal').array).every(Number.isFinite)).toBe(true);
  pistol.dispose(); rifle.dispose();
});

it('removes subpixel pistol detail at distance while preserving its compact silhouette', () => {
  const near = itemGeometry('weapon', 'pistol'), far = itemGeometry('weapon', 'pistol', 'far');
  try {
    near.computeBoundingBox(); far.computeBoundingBox();
    expect(far.getAttribute('position').count).toBeLessThan(near.getAttribute('position').count * .5);
    expect(far.boundingBox!.min.distanceTo(near.boundingBox!.min)).toBeLessThan(.008);
    expect(far.boundingBox!.max.distanceTo(near.boundingBox!.max)).toBeLessThan(.008);
    expect(far.getAttribute('color').count).toBe(far.getAttribute('position').count);
    expect(Array.from(far.getAttribute('normal').array).every(Number.isFinite)).toBe(true);
  } finally { near.dispose(); far.dispose(); }
});
