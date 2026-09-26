import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildVegetation } from '../src/render/vegetation';
import { createWorld } from '../src/shared/world';

describe('vegetation rendering budget', () => {
  it('keeps each palm close LOD through 55 m out and returns by 50 m in', () => {
    const world = createWorld(), vegetation = buildVegetation(world);
    const camera = new THREE.PerspectiveCamera();
    const cells = new Map(vegetation.group.children.filter((node): node is THREE.LOD =>
      node instanceof THREE.LOD && node.name.startsWith('vegetation:palm:')).map(node => [node.name, node]));
    vegetation.group.updateMatrixWorld(true);
    try {
      for (const palm of world.objects.filter(object => object.kind === 'palm')) {
        const cellX = Math.floor(palm.pos.x / 32), cellZ = Math.floor(palm.pos.z / 32);
        const cell = cells.get(`vegetation:palm:${cellX}:${cellZ}`);
        expect(cell, `missing palm cell for ${palm.id}`).toBeDefined();
        const dx = palm.pos.x - cell!.position.x, dz = palm.pos.z - cell!.position.z;
        const direction = new THREE.Vector2(dx, dz).normalize();
        const view = (distance: number) => {
          camera.position.set(palm.pos.x + direction.x * distance, palm.pos.y + 1.62,
            palm.pos.z + direction.y * distance);
          camera.updateMatrixWorld();
          cell!.update(camera);
        };
        view(0);
        view(54.9);
        expect(cell!.levels[0].object.visible, `${palm.id} switched before 55 m outbound`).toBe(true);
        view(130);
        expect(cell!.levels[1].object.visible, `${palm.id} never reached far LOD`).toBe(true);
        view(49.9);
        expect(cell!.levels[0].object.visible, `${palm.id} stayed far below 50 m inbound`).toBe(true);
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
      object.kind === 'grass' && object.detail === 'reeds' ? 'reeds' : object.kind;
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
            // Thin decorative trunks must not regain independent invisible boxes.
            expect(world.colliders.some(c => c.pieceId === object.id)).toBe(false);
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
