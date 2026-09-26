import * as THREE from 'three';
import { expect, it } from 'vitest';
import { buildVegetation } from '../src/render/vegetation';
import { plantTrunkSections } from '../src/shared/vegetation-trunks';
import type { MapObject, WorldSpec } from '../src/shared/types';

it('derives the placed tree and leaning palm trunk from the same visible tapered sections', () => {
  for (const kind of ['tree', 'palm'] as const) for (const height of [3, 8, 12]) {
    const object: MapObject = { id: 'stem', kind, pos: { x: 18, y: 1.2, z: -34 },
      scale: { x: 1, y: height, z: 1 }, rotation: 1.17, color: '#789956' };
    const sections = plantTrunkSections(object);
    const vegetation = buildVegetation({ objects: [object], colliders: [] } as unknown as WorldSpec);
    try {
      const node = vegetation.group.children.find(child => child instanceof THREE.LOD) as THREE.LOD;
      const mesh = node.levels[0].object as THREE.InstancedMesh, matrix = new THREE.Matrix4();
      mesh.getMatrixAt(0, matrix);
      const points = mesh.geometry.getAttribute('position'), mask = mesh.geometry.getAttribute('leafDetail');
      const vertices: THREE.Vector3[] = [];
      for (let i = 0; i < points.count; i++) if (mask.getZ(i) < -.5)
        vertices.push(new THREE.Vector3().fromBufferAttribute(points, i).applyMatrix4(matrix).add(node.position));
      expect(vertices.length).toBeGreaterThan(100);
      expect(sections[0].a).toEqual(object.pos);
      for (const vertex of vertices) {
        const error = Math.min(...sections.map(section => {
          const a = new THREE.Vector3().copy(section.a), b = new THREE.Vector3().copy(section.b);
          const axis = b.clone().sub(a), t = THREE.MathUtils.clamp(vertex.clone().sub(a).dot(axis) / axis.lengthSq(), 0, 1);
          const radius = THREE.MathUtils.lerp(section.radiusBottom, section.radiusTop, t);
          return vertex.distanceTo(a.addScaledVector(axis, t)) - radius;
        }));
        // Taper joins overlap 12 mm; palm bark rings add at most 6.5% radius.
        expect(error).toBeLessThan(.035);
      }
      for (const section of sections) {
        const middle = new THREE.Vector3().copy(section.a).lerp(section.b, .5);
        expect(Math.min(...vertices.map(vertex => vertex.distanceTo(middle)))).toBeLessThan(
          Math.hypot(new THREE.Vector3().copy(section.a).distanceTo(section.b) / 2, section.radiusBottom) + .035);
      }
    } finally { vegetation.dispose(); }
  }
});

it('never requests solid trunks for soft understory, flowers or small shrubs', () => {
  const object = { id: 'plant', kind: 'tree', pos: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1.7, z: 1 } } as MapObject;
  expect(plantTrunkSections(object)).toEqual([]);
  expect(plantTrunkSections({ ...object, scale: { ...object.scale, y: 4 }, detail: 'banana' })).toEqual([]);
  expect(plantTrunkSections({ ...object, kind: 'grass', detail: 'fern' })).toEqual([]);
});
