import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildVegetation } from '../src/render/vegetation';
import { createWorld } from '../src/shared/world';

describe('vegetation rendering budget', () => {
  it('keeps every plant at its authored position, size and collision width through LOD', () => {
    const world = createWorld(), vegetation = buildVegetation(world);
    const species = (object: (typeof world.objects)[number]) => object.kind === 'tree' ?
      (['mangrove', 'orchard', 'ipe-yellow', 'ipe-pink', 'flamboyant', 'banana'].includes(object.detail || '') ? object.detail! : 'tree') :
      object.kind === 'grass' && object.detail === 'reeds' ? 'reeds' : object.kind;
    const trunk = (x: number, z: number) => world.colliders.find(collider =>
      /^(mangrove-)?trunk-/.test(collider.id) &&
      Math.abs((collider.min.x + collider.max.x) / 2 - x) < .0001 &&
      Math.abs((collider.min.z + collider.max.z) / 2 - z) < .0001);
    const present = new Set(world.objects.filter(object => object.kind === 'tree' ||
      object.kind === 'palm' || object.kind === 'grass').map(species));
    for (const type of ['palm', 'banana', 'flamboyant', 'ipe-yellow', 'ipe-pink', 'mangrove', 'orchard'])
      expect(present.has(type), `${type} should have a placed specimen`).toBe(true);
    const instances: THREE.InstancedMesh[] = [];
    let disposed = 0;
    try {
      const cells = vegetation.group.children.filter((node): node is THREE.LOD => node instanceof THREE.LOD);
      const matrix = new THREE.Matrix4();
      let nearCount = 0;
      for (const cell of cells) {
        const [, type, cx, cz] = cell.name.split(':');
        const objects = world.objects.filter(object => species(object) === type &&
          Math.floor(object.pos.x / 32) === Number(cx) && Math.floor(object.pos.z / 32) === Number(cz));
        const near = cell.levels[0].object as THREE.InstancedMesh;
        instances.push(near); nearCount += near.count;
        expect(near.count).toBe(objects.length);
        if (type !== 'grass' && type !== 'reeds') {
          const far = cell.levels[1].object as THREE.InstancedMesh;
          instances.push(far);
          expect(far.count).toBe(objects.length);
        } else expect(cell.levels).toHaveLength(1);
        const templateHeight = near.geometry.getAttribute('plantTemplate').getX(0);
        for (let i = 0; i < objects.length; i++) {
          const object = objects[i]; near.getMatrixAt(i, matrix);
          expect(matrix.elements[12] + cell.position.x).toBeCloseTo(object.pos.x, 4);
          expect(matrix.elements[13]).toBeCloseTo(object.pos.y, 4);
          expect(matrix.elements[14] + cell.position.z).toBeCloseTo(object.pos.z, 4);
          const heightScale = matrix.elements[5];
          if (type === 'grass' || type === 'reeds') {
            const cap = type === 'grass' ? .42 : 1.6;
            expect(Math.min(cap, templateHeight) * heightScale).toBeLessThanOrEqual(cap + .001);
            expect(Math.min(cap, templateHeight) * heightScale).toBeCloseTo(Math.min(cap, object.scale.y), 3);
          } else {
            const collider = trunk(object.pos.x, object.pos.z);
            expect(collider, `missing trunk collider for ${object.id}`).toBeDefined();
            const templateRadius = type === 'palm' ? .13 + templateHeight * .009 :
              type === 'banana' ? .13 : .15 + templateHeight * .015;
            const visualRadius = templateRadius * Math.hypot(matrix.elements[0], matrix.elements[2]);
            expect(Math.abs(visualRadius - (collider!.max.x - collider!.min.x) / 2)).toBeLessThanOrEqual(.02);
          }
        }
      }
      expect(nearCount).toBe(world.objects.filter(object =>
        object.kind === 'tree' || object.kind === 'palm' || object.kind === 'grass').length);
      const shadows = vegetation.group.children.filter((node): node is THREE.InstancedMesh =>
        node instanceof THREE.InstancedMesh && node.castShadow);
      instances.push(...shadows);
      for (const mesh of instances) mesh.addEventListener('dispose', () => disposed++);
      const shadowTriangles = shadows.reduce((count, mesh) => count +
        (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3 * mesh.count, 0);
      expect(shadows.length).toBeLessThanOrEqual(40);
      expect(shadowTriangles).toBeLessThan(20_000);
    } finally { vegetation.dispose(); }
    expect(disposed).toBe(instances.length);
  });
});
