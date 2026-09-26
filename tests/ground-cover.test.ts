import * as THREE from 'three';
import { expect, it } from 'vitest';
import { GroundCover } from '../src/render/ground-cover';
import { createWorld } from '../src/shared/world';
import { ROADS } from '../src/shared/layout';

it('keeps grass away from roads and solids, culls distant cells and disables it on Low', () => {
  const world = createWorld(), cover = new GroundCover(world), camera = new THREE.PerspectiveCamera();
  try {
    const matrix = new THREE.Matrix4();
    for (const node of cover.group.children) if (node instanceof THREE.InstancedMesh) {
      for (let i = 0; i < node.count; i++) {
        node.getMatrixAt(i, matrix);
        const x = matrix.elements[12] + node.position.x, y = matrix.elements[13] + .015, z = matrix.elements[14] + node.position.z;
        expect(ROADS.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1)).toBe(false);
        expect(world.colliders.some(c => c.min.y < y + .4 && c.max.y > y && x > c.min.x && x < c.max.x && z > c.min.z && z < c.max.z)).toBe(false);
      }
    }
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
