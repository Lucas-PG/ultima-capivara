import * as THREE from 'three';
import { expect, it } from 'vitest';
import { GroundCover } from '../src/render/ground-cover';
import { createWorld } from '../src/shared/world';
import { ROADS } from '../src/shared/layout';

it('keeps grass away from roads and solids, culls distant cells and disables it on Low', () => {
  const world = createWorld(), cover = new GroundCover(world), camera = new THREE.PerspectiveCamera();
  try {
    const matrix = new THREE.Matrix4();
    const violations: { x: number; z: number; reason: string }[] = [];
    for (const node of cover.group.children) if (node instanceof THREE.InstancedMesh) {
      // All roots in this draw belong to its 24 m cell. The furnished island
      // has thousands of colliders; distant solids cannot intersect these roots.
      const nearby = world.colliders.filter(c => c.max.x >= node.position.x - 1 && c.min.x <= node.position.x + 25
        && c.max.z >= node.position.z - 1 && c.min.z <= node.position.z + 25);
      for (let i = 0; i < node.count; i++) {
        node.getMatrixAt(i, matrix);
        const x = matrix.elements[12] + node.position.x, y = matrix.elements[13] + .015, z = matrix.elements[14] + node.position.z;
        if (ROADS.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1)) violations.push({ x, z, reason: 'road' });
        if (nearby.some(c => c.min.y < y + .4 && c.max.y > y && x > c.min.x && x < c.max.x && z > c.min.z && z < c.max.z)) violations.push({ x, z, reason: 'solid' });
      }
    }
    expect(violations).toEqual([]);
    camera.position.set(-35, 4, 61); cover.setQuality('medium'); cover.update(camera, 1, false);
    const visible = cover.group.children.filter(node => node.visible);
    expect(visible.length).toBeGreaterThan(0); expect(visible.length).toBeLessThan(48);
    expect(visible.some(node => node instanceof THREE.Mesh && !(node instanceof THREE.InstancedMesh))).toBe(true);
    const mediumCount = cover.group.children.reduce((n, node) => n + (node instanceof THREE.InstancedMesh ? node.count : 0), 0);
    cover.setQuality('high');
    expect(cover.group.children.reduce((n, node) => n + (node instanceof THREE.InstancedMesh ? node.count : 0), 0)).toBeGreaterThan(mediumCount);
    cover.setQuality('low'); cover.update(camera, 2, false);
    expect(cover.group.visible).toBe(false);
    expect(cover.group.children.every(node => !node.visible)).toBe(true);
  } finally { cover.dispose(); }
  expect(cover.group.children).toHaveLength(0);
});
