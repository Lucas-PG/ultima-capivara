import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { KIT_PIECES, kitColliders } from '../src/shared/kit-collision';
import { overlapsFootprint } from '../src/shared/collision';

let asset: GLTF | undefined;
beforeAll(async () => {
  if (!Object.values(KIT_PIECES).some(piece => piece.traversal)) return;
  const bytes = await readFile('public/models/kit/kit.glb');
  vi.stubGlobal('self', globalThis);
  vi.stubGlobal('createImageBitmap', async () => ({ width: 1024, height: 1024, close() {} }));
  try {
    asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
      .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    asset.scene.updateMatrixWorld(true);
  } finally { vi.unstubAllGlobals(); }
});

describe('building floors agree with the visible exported mesh', () => {
  it('has generated floor contracts to verify against all three LODs', () => {
    expect(KIT_PIECES.house_tall.traversal).toBeDefined();
    expect(asset).toBeDefined();
  });

  it('keeps the tall-house upper wall joins closed instead of opening cracks during LOD reduction', () => {
    const ray = new THREE.Raycaster();
    for (let lod = 0; lod < 3; lod++) for (const side of [-1, 1]) {
      for (const x of [-2, -1.04, -1, -.96, 0, .96, 1, 1.04, 2]) {
        ray.set(new THREE.Vector3(x, 4.6, side * 2.9), new THREE.Vector3(0, 0, side)); ray.far = 1;
        const hit = ray.intersectObject(asset!.scene.getObjectByName(`house_tall_LOD${lod}`)!, false)[0];
        expect(hit, `upper wall join at x${x}, side${side}, LOD${lod} must remain visible`).toBeDefined();
      }
    }
  });

  it('roots every tall-house railing post into a visible tread or upper floor', () => {
    const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
    const posts = KIT_PIECES.house_tall.colliders.filter(c => c.type === 'box' && Math.abs(c.height - .98) < .001);
    expect(posts.length).toBeGreaterThan(8);
    for (const post of posts) for (let lod = 0; lod < 3; lod++) {
      const bottom = post.y - post.height / 2;
      ray.set(new THREE.Vector3(post.x, bottom + .04, post.z), down); ray.far = .08;
      const hit = ray.intersectObject(asset!.scene.getObjectByName(`house_tall_LOD${lod}`)!, false)[0];
      expect(hit, `post at ${post.x},${post.z} must touch its floor in LOD${lod}`).toBeDefined();
      expect(Math.abs(hit.point.y - bottom)).toBeLessThan(.025);
    }
  });

  it('keeps room furniture feet visible at every LOD and soft decorations non-solid', () => {
    const ray = new THREE.Raycaster(), up = new THREE.Vector3(0, 1, 0);
    for (const id of ['table', 'chair', 'shelf_pottery', 'wardrobe', 'sofa', 'hammock', 'stove', 'bed', 'interior_counter']) {
      const definition = KIT_PIECES[id];
      const feet = definition.colliders.filter(shape => shape.y - shape.height / 2 < .01);
      expect(feet.length, `${id} needs actual support`).toBeGreaterThan(0);
      for (const foot of feet) for (let lod = 0; lod < 3; lod++) {
        const bottom = foot.y - foot.height / 2;
        ray.set(new THREE.Vector3(foot.x, bottom - .04, foot.z), up); ray.far = .09;
        const hit = ray.intersectObject(asset!.scene.getObjectByName(`${id}_LOD${lod}`)!, false)[0];
        expect(hit, `${id} LOD${lod} has collision without a visible foot`).toBeDefined();
        expect(Math.abs(hit.point.y - bottom)).toBeLessThan(.035);
      }
    }
    for (const id of ['rug', 'potted_plant', 'wall_picture']) expect(KIT_PIECES[id].colliders, id).toHaveLength(0);
  });

  for (const [id, definition] of Object.entries(KIT_PIECES)) {
    if (!definition.traversal) continue;
    it(`supports every usable floor sample in ${id} with visible geometry and collision`, () => {
      const colliders = kitColliders({ id: 'building', piece: id, x: 0, y: 0, z: 0, yaw: 0 });
      const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
      for (const floor of definition.traversal!.floors) {
        const [x0, z0, x1, z1] = floor.bounds;
        const nx = Math.max(1, Math.ceil((x1 - x0) / .5)), nz = Math.max(1, Math.ceil((z1 - z0) / .5));
        let checked = 0;
        for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
          const x = x0 + (ix + .5) / nx * (x1 - x0), z = z0 + (iz + .5) / nz * (z1 - z0);
          const foot = { x, y: floor.y, z };
          // A slab continuing under a wall is not an empty walkable room.
          if (colliders.some(c => c.max.y > floor.y + .05 && c.min.y < floor.y + 1.8 && overlapsFootprint(foot, c))) continue;
          const support = colliders.some(c => Math.abs(c.max.y - floor.y) < .04 &&
            x >= c.min.x - .001 && x <= c.max.x + .001 && z >= c.min.z - .001 && z <= c.max.z + .001);
          expect(support, `${id}/${floor.id} visual floor has no support at ${x},${z}`).toBe(true);
          for (let lod = 0; lod < 3; lod++) {
            const mesh = asset!.scene.getObjectByName(`${id}_LOD${lod}`)!;
            ray.set(new THREE.Vector3(x, floor.y + .075, z), down); ray.far = .15;
            const hit = ray.intersectObject(mesh, false)[0];
            expect(hit, `${id}/${floor.id} LOD${lod} collision has no floor at ${x},${z}`).toBeDefined();
            expect(Math.abs(hit.point.y - floor.y), `${id}/${floor.id} LOD${lod} floor height`).toBeLessThanOrEqual(.06);
          }
          checked++;
        }
        expect(checked, `${id}/${floor.id} has no usable standing area`).toBeGreaterThan(0);
      }
      for (const stair of definition.traversal!.stairs) for (const index of stair.colliderIndices) {
        const tread = definition.colliders[index];
        if (tread.type !== 'box') throw new Error(`${id}/${stair.id} needs an explicit tread surface`);
        const top = tread.y + tread.height / 2, yaw = tread.yaw ?? 0;
        for (const offset of [-.25, 0, .25]) {
          const x = tread.x + Math.cos(yaw) * tread.width * offset;
          const z = tread.z - Math.sin(yaw) * tread.width * offset;
          for (let lod = 0; lod < 3; lod++) {
            ray.set(new THREE.Vector3(x, top + .075, z), down); ray.far = .15;
            const hit = ray.intersectObject(asset!.scene.getObjectByName(`${id}_LOD${lod}`)!, false)[0];
            expect(hit, `${id}/${stair.id} tread ${index} LOD${lod} needs a visible step`).toBeDefined();
            expect(Math.abs(hit.point.y - top)).toBeLessThanOrEqual(.06);
          }
        }
      }
    });
  }
});
