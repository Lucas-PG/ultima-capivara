import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildVegetation } from '../src/render/vegetation';
import { createWorld } from '../src/shared/world';
import { PLANT_CELL_SIZE } from '../src/shared/vegetation-trunks';
import type { MapObject, WorldSpec } from '../src/shared/types';

describe('vegetation rendering budget', () => {
  it('keeps leaf UVs inside one padded atlas tile and selects cheap silhouettes on Low', () => {
    const objects = ['tree', 'ipe-yellow', 'ipe-pink', 'mangrove', 'flamboyant', 'banana', 'palm'].map((detail, i) =>
      ({ id: `plant-${i}`, kind: detail === 'palm' ? 'palm' : 'tree', detail,
        pos: { x: i * 20, y: 0, z: 0 }, scale: { x: 1, y: 7, z: 1 } }) as MapObject);
    const atlas = new THREE.Texture(), vegetation = buildVegetation({ objects, colliders: [] } as unknown as WorldSpec, atlas);
    const camera = new THREE.PerspectiveCamera();
    vegetation.group.updateMatrixWorld(true);
    try {
      for (const node of vegetation.group.children.filter((child): child is THREE.LOD => child instanceof THREE.LOD)) {
        const near = node.levels[0].object as THREE.InstancedMesh;
        const uv = near.geometry.getAttribute('uv'), leaf = near.geometry.getAttribute('leafDetail');
        const position = near.geometry.getAttribute('position');
        let cards = 0, largestSprigEdge = 0;
        for (let face = 0; face < uv.count; face += 3) {
          if (leaf.getZ(face) < 1.5) continue;
          cards++;
          for (let edge = 0; edge < 3; edge++) {
            const a = face + edge, b = face + (edge + 1) % 3;
            largestSprigEdge = Math.max(largestSprigEdge, Math.hypot(position.getX(a) - position.getX(b),
              position.getY(a) - position.getY(b), position.getZ(a) - position.getZ(b)));
          }
          const tile = Math.floor(uv.getX(face) * 4) + Math.floor((1 - uv.getY(face)) * 4) * 4;
          for (let vertex = face; vertex < face + 3; vertex++) {
            expect(Math.floor(uv.getX(vertex) * 4) + Math.floor((1 - uv.getY(vertex)) * 4) * 4).toBe(tile);
            for (const coordinate of [uv.getX(vertex) * 4, (1 - uv.getY(vertex)) * 4])
              expect(coordinate % 1).toBeGreaterThan(.01);
          }
        }
        expect(cards).toBeGreaterThan(50);
        if (!node.name.startsWith('vegetation:palm:') && !node.name.startsWith('vegetation:banana:'))
          expect(largestSprigEdge, 'near crowns need small sprigs, not head-sized individual leaves').toBeLessThan(.75);
        camera.position.copy(node.position); camera.updateMatrixWorld();
        vegetation.setQuality('low'); node.update(camera);
        expect(node.levels[0].object.visible).toBe(false);
        const low = node.levels[1].object as THREE.InstancedMesh;
        expect(low.visible).toBe(true);
        expect(low.geometry.getAttribute('position').count).toBeLessThan(near.geometry.getAttribute('position').count * .65);
        vegetation.setQuality('medium'); node.update(camera); expect(near.visible).toBe(true);
      }
    } finally { vegetation.dispose(); atlas.dispose(); }
  });

  it('switches canopy detail at 25 m and distant silhouettes at 60 m', () => {
    const vegetation = buildVegetation(createWorld()), camera = new THREE.PerspectiveCamera();
    vegetation.group.updateMatrixWorld(true);
    try {
      for (const cell of vegetation.group.children.filter((node): node is THREE.LOD => node instanceof THREE.LOD && node.levels.length === 3)) {
        const view = (distance: number) => {
          camera.position.set(cell.position.x + distance, 0, cell.position.z); camera.updateMatrixWorld(); cell.update(camera);
        };
        view(0); expect(cell.levels[0].object.visible).toBe(true);
        view(26); expect(cell.levels[1].object.visible).toBe(true);
        view(65); expect(cell.levels[2].object.visible).toBe(true);
        view(20); expect(cell.levels[0].object.visible).toBe(true);
        const count = (level: number) => (cell.levels[level].object as THREE.InstancedMesh).geometry.getAttribute('position').count;
        expect(count(2)).toBeLessThan(count(0) * .45);
        expect(count(0) / 3).toBeLessThan(7000);
      }
    } finally { vegetation.dispose(); }
  });

  it('keeps distant coconut crowns drooping and close to the near silhouette', () => {
    const vegetation = buildVegetation(createWorld());
    try {
      const palm = vegetation.group.children.find(node => node.name.startsWith('vegetation:palm:')) as THREE.LOD;
      const outline = (mesh: THREE.InstancedMesh) => {
        const position = mesh.geometry.getAttribute('position'), frond = mesh.geometry.getAttribute('palmFrond');
        let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < position.count; i++) {
          if (frond.getX(i) < .5) continue;
          const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        }
        return { minY, maxY, width: Math.max(maxX - minX, maxZ - minZ) };
      };
      const near = outline(palm.levels[0].object as THREE.InstancedMesh);
      const far = outline(palm.levels[1].object as THREE.InstancedMesh);
      const height = (palm.levels[1].object as THREE.InstancedMesh).geometry.getAttribute('plantTemplate').getX(0);
      expect((far.maxY - far.minY) / far.width).toBeGreaterThanOrEqual(.4);
      expect((height * .91 - far.minY) / (far.width / 2)).toBeGreaterThanOrEqual(.35);
      expect(Math.abs(far.minY - near.minY)).toBeLessThan(.15);
      expect(Math.abs(far.width / near.width - 1)).toBeLessThan(.12);
    } finally { vegetation.dispose(); }
  });

  it('keeps island pickup and spawn placement deterministic through vegetation rebuilds', () => {
    const world = createWorld();
    const before = structuredClone({ loot: world.loot, spawns: world.spawns, chests: world.chests });
    const vegetation = buildVegetation(world); vegetation.dispose();
    expect({ loot: world.loot, spawns: world.spawns, chests: world.chests }).toEqual(before);
    const rebuilt = createWorld();
    expect({ loot: rebuilt.loot, spawns: rebuilt.spawns, chests: rebuilt.chests }).toEqual(before);
  });

  it('keeps every decorative plant at its authored position and size through LOD', () => {
    const world = createWorld(), vegetation = buildVegetation(world);
    const species = (object: (typeof world.objects)[number]) => object.kind === 'tree' ?
      (['mangrove', 'orchard', 'ipe-yellow', 'ipe-pink', 'flamboyant', 'banana'].includes(object.detail || '') ? object.detail! : 'tree') :
      object.kind === 'grass' && ['reeds', 'fern', 'monstera', 'ground-litter'].includes(object.detail || '') ? object.detail! : object.kind;
    const present = new Set(world.objects.filter(object => object.kind === 'tree' ||
      object.kind === 'palm' || object.kind === 'grass').map(species));
    for (const type of ['palm', 'banana', 'flamboyant', 'ipe-yellow', 'ipe-pink', 'mangrove', 'orchard'])
      expect(present.has(type), `${type} should have a placed specimen`).toBe(true);
    const instances: THREE.InstancedMesh[] = [];
    let disposed = 0;
    const palmLeans = new Set<number>(), palmDirections = new Set<number>();
    try {
      const cells = vegetation.group.children.filter((node): node is THREE.LOD => node instanceof THREE.LOD);
      const matrix = new THREE.Matrix4();
      let nearCount = 0;
      for (const cell of cells) {
        const [, type, cx, cz] = cell.name.split(':');
        const objects = world.objects.filter(object => species(object) === type &&
          Math.floor(object.pos.x / PLANT_CELL_SIZE) === Number(cx) && Math.floor(object.pos.z / PLANT_CELL_SIZE) === Number(cz));
        const near = cell.levels[0].object as THREE.InstancedMesh;
        instances.push(near); nearCount += near.count;
        expect(near.count).toBe(objects.length);
        if (objects[0].kind !== 'grass') {
          const far = cell.levels[1].object as THREE.InstancedMesh;
          const distant = cell.levels[2].object as THREE.InstancedMesh;
          instances.push(far, distant);
          expect(distant.count).toBe(objects.length);
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
            // Only large stems become cover. Small shrubs remain decorative.
            if (object.scale.y < 2.5) expect(world.colliders.some(c => c.pieceId === object.id)).toBe(false);
            if (type === 'palm') {
              const height = Math.hypot(matrix.elements[4], matrix.elements[5], matrix.elements[6]);
              expect(height * templateHeight).toBeCloseTo(object.scale.y, 3);
              const lean = THREE.MathUtils.radToDeg(Math.acos(matrix.elements[5] / height));
              expect(lean).toBeGreaterThanOrEqual(2.9);
              expect(lean).toBeLessThanOrEqual(12.1);
              palmLeans.add(Math.round(lean));
              palmDirections.add(Math.floor((Math.atan2(matrix.elements[4], matrix.elements[6]) + Math.PI) / (Math.PI / 2)));
            }
          }
        }
      }
      expect(nearCount).toBe(world.objects.filter(object =>
        object.kind === 'tree' || object.kind === 'palm' || object.kind === 'grass').length);
      expect(palmLeans.size).toBeGreaterThan(6);
      expect(palmDirections.size).toBeGreaterThanOrEqual(4);
      const shadows = vegetation.group.children.filter((node): node is THREE.InstancedMesh =>
        node instanceof THREE.InstancedMesh && node.castShadow);
      for (const mesh of shadows) for (let index = 0; index < mesh.count; index++) {
        mesh.getMatrixAt(index, matrix);
        expect(Math.hypot(matrix.elements[4], matrix.elements[5], matrix.elements[6])).toBeGreaterThanOrEqual(2.5);
      }
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
