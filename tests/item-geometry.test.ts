import * as THREE from 'three';
import { expect, it } from 'vitest';
import { itemGeometry } from '../src/render/item-geometry';

it('keeps the visible remote pistol compact and distinct from a long gun within the prop budget', () => {
  const pistol = itemGeometry('weapon', 'pistol'), rifle = itemGeometry('weapon', 'm4');
  pistol.computeBoundingBox(); rifle.computeBoundingBox();
  const size = pistol.boundingBox!.getSize(new THREE.Vector3());
  expect(size.z).toBeLessThan(.35); expect(size.y).toBeGreaterThan(.18);
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

it('gives every pickup a solid silhouette, never a flat board seen edge-on at eye height', () => {
  // Loot used to be primitive boxes: the armour vest a 0.14 m navy slab that read as a board from the side.
  const kinds = ['armor', 'helmet', 'ammo', 'medkit', 'bandage', 'guarana', 'acai', 'rapadura'] as const;
  for (const kind of kinds) {
    const geometry = itemGeometry(kind);
    geometry.computeBoundingBox();
    const size = geometry.boundingBox!.getSize(new THREE.Vector3());
    // Depth from every side as it spins, and big enough to see across a street.
    expect(Math.min(size.x, size.z), `${kind} is thin edge-on`).toBeGreaterThan(.2);
    expect(Math.max(size.x, size.y, size.z), `${kind} size`).toBeGreaterThan(.33);
    expect(Math.max(size.x, size.y, size.z), `${kind} size`).toBeLessThan(.65);
    // Triangles: near copies within 14 m, far copies (the whole island's loot) beyond.
    const far = itemGeometry(kind, 'pistol', 'far');
    expect(geometry.getAttribute('position').count / 3, `${kind} near budget`).toBeLessThan(4500);
    expect(far.getAttribute('position').count / 3, `${kind} far budget`).toBeLessThan(geometry.getAttribute('position').count / 3 * .5);
    far.dispose();
    expect(Array.from(geometry.getAttribute('normal').array).every(Number.isFinite)).toBe(true);
    geometry.dispose();
  }
});
