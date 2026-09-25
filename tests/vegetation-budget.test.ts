import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildVegetation } from '../src/render/vegetation';
import { createWorld } from '../src/shared/world';

describe('vegetation rendering budget', () => {
  it('keeps every plant visible through LOD and bounds the shadow geometry', () => {
    const world = createWorld(), vegetation = buildVegetation(world);
    try {
      const cells = vegetation.group.children.filter((node): node is THREE.LOD => node instanceof THREE.LOD);
      const nearCount = cells.reduce((count, node) => count +
        (node.levels[0].object instanceof THREE.InstancedMesh ? node.levels[0].object.count : 0), 0);
      expect(nearCount).toBe(world.objects.filter(object =>
        object.kind === 'tree' || object.kind === 'palm' || object.kind === 'grass').length);
      const shadows = vegetation.group.children.filter((node): node is THREE.InstancedMesh =>
        node instanceof THREE.InstancedMesh && node.castShadow);
      const shadowTriangles = shadows.reduce((count, mesh) => count +
        (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3 * mesh.count, 0);
      expect(shadows.length).toBeLessThanOrEqual(40);
      expect(shadowTriangles).toBeLessThan(20_000);
      for (const cell of cells.filter(node => node.name.startsWith('vegetation:grass:') ||
        node.name.startsWith('vegetation:reeds:'))) {
        expect(cell.levels).toHaveLength(1);
        expect(cell.levels[0].object).toBeInstanceOf(THREE.InstancedMesh);
      }
    } finally { vegetation.dispose(); }
  });
});
