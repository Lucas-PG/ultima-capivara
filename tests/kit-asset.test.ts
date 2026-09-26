import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { NodeIO, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createKit } from '../src/render/kit';
import type { AssetLoader } from '../src/render/assets';
import metadata from '../src/shared/kit-pieces.json';

let document: Document, asset: GLTF;
beforeAll(async () => {
  document = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read('public/models/kit/kit.glb');
  const bytes = await readFile('public/models/kit/kit.glb');
  vi.stubGlobal('self', globalThis);
  vi.stubGlobal('createImageBitmap', async () => ({ width: 1024, height: 1024, close() {} }));
  try { asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ''); }
  finally { vi.unstubAllGlobals(); }
});

describe('island kit geometry and traversal contract', () => {
  it('ships every collision piece with three real LODs, a shared atlas and baked shading', () => {
    expect(document.getRoot().listMaterials()).toHaveLength(1);
    for (const [id, definition] of Object.entries(metadata)) {
      for (let lod = 0; lod < 3; lod++) {
        const node = document.getRoot().listNodes().find(node => node.getName() === `${id}_LOD${lod}`);
        expect(node, `${id} LOD${lod}`).toBeDefined();
        const primitive = node!.getMesh()!.listPrimitives()[0];
        expect(primitive.getAttribute('COLOR_0'), `${id} baked AO`).toBeDefined();
        const uv = primitive.getAttribute('TEXCOORD_0')!;
        for (let i = 0; i < Math.min(uv.getCount(), 100); i++) {
          for (const value of uv.getElement(i, [])) {
            expect(value, `${id} atlas inset`).toBeGreaterThan(.005);
            expect(value, `${id} atlas inset`).toBeLessThan(.995);
          }
        }
        expect(primitive.getIndices()!.getCount()).toBeGreaterThan(12);
        if (id.startsWith('house_')) expect(primitive.getIndices()!.getCount() / 3, `${id} LOD${lod} budget`).toBeLessThanOrEqual([12000, 3000, 800][lod]);
        if (['flower_bed', 'bush_cluster', 'hedge'].includes(id)) expect(primitive.getIndices()!.getCount() / 3, `${id} landscape budget`).toBeLessThanOrEqual([12000, 3000, 800][lod]);
      }
      expect(definition.height, id).toBeGreaterThan(0);
      for (const collider of definition.colliders) {
        expect(collider.height, id).toBeGreaterThan(0);
        expect(collider.y + collider.height / 2, id).toBeLessThanOrEqual(definition.height + .01);
      }
    }
  });

  it('leaves opposing doorways open and puts bridge collision exactly at the deck', () => {
    for (const [id, depth] of [['house_small', 6], ['house_tall', 7], ['church', 16], ['market_hall', 12]] as const) {
      for (const side of [-1, 1]) {
        const obstructs = metadata[id].colliders.some(c => c.type === 'box' &&
          Math.abs(c.x) < c.width / 2 && Math.abs(1.4 - c.y) < c.height / 2 && Math.abs(side * depth / 2 - c.z) < c.depth / 2);
        expect(obstructs, `${id} exit ${side}`).toBe(false);
      }
    }
    const deck = metadata.bridge_stone.colliders[0];
    expect(deck.y + deck.height / 2).toBe(.45);
    expect(deck.depth).toBe(16);
  });

  it('aligns the rotated tower merlons with their authored collision corners', () => {
    asset.scene.updateMatrixWorld(true);
    const tower = asset.scene.getObjectByName('fort_tower_LOD0')!;
    const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
    for (const c of metadata.fort_tower.colliders) {
      if (c.type !== 'box') continue;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const local = new THREE.Vector3(sx * c.width! * .43, 0, sz * c.depth! * .43).applyAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw || 0);
        ray.set(new THREE.Vector3(c.x + local.x, 10, c.z + local.z), down);
        const hit = ray.intersectObject(tower, false)[0];
        expect(hit, `merlon at ${c.x},${c.z}`).toBeDefined();
        expect(hit.point.y).toBeGreaterThan(c.y + c.height / 2 - .06);
      }
    }
  });

  it('keeps recreation contact surfaces visible, supported and accessible at every LOD', () => {
    asset.scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
    for (const id of ['mud_bath', 'trampoline'] as const) {
      const definition = metadata[id], contact = definition.interaction;
      expect(definition.height, `${id} entry lip`).toBeLessThanOrEqual(.45);
      const floor = definition.colliders[0];
      expect(floor.type).toBe('cylinder');
      expect(floor.y + floor.height / 2).toBeCloseTo(contact.surfaceY, 6);
      // The movement adapter uses inscribed strips. Keep the whole interaction
      // circle inside their supported core, including either entry direction.
      expect(contact.radius).toBeLessThanOrEqual(floor.radius! * 5 / 6);
      for (let lod = 0; lod < 3; lod++) {
        const mesh = asset.scene.getObjectByName(`${id}_LOD${lod}`)!;
        for (let sample = 0; sample < 16; sample++) {
          const angle = sample * Math.PI / 8, radius = sample ? contact.radius * .96 : 0;
          ray.set(new THREE.Vector3(Math.sin(angle) * radius, 2, Math.cos(angle) * radius), down);
          const hit = ray.intersectObject(mesh, false)[0];
          expect(hit, `${id} LOD${lod} contact ${sample}`).toBeDefined();
          expect(hit.point.y).toBeGreaterThanOrEqual(contact.surfaceY - .012);
          expect(hit.point.y).toBeLessThanOrEqual(contact.surfaceY + .025);
        }
      }
    }
  });

  it('roots the river-step railing posts in the corresponding treads', () => {
    const posts = metadata.river_steps.colliders.filter(c => c.type === 'box' && Math.abs(c.x) > 2);
    expect(posts).toHaveLength(8);
    for (const post of posts) {
      const tread = metadata.river_steps.colliders.find(c => c.type === 'box' && c.x === 0 &&
        Math.abs(c.z - post.z) < c.depth! / 2);
      expect(tread).toBeDefined();
      expect(post.y - post.height / 2).toBeCloseTo(tread!.y + tread!.height / 2, 6);
    }
  });

  it('keeps every cliff collision face behind outward stone geometry at every LOD', () => {
    asset.scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    for (const id of ['cliff_rock', 'cliff_rock_low', 'cliff_rock_tall', 'cliff_ledge'] as const) {
      for (let lod = 0; lod < 3; lod++) {
        const rock = asset.scene.getObjectByName(`${id}_LOD${lod}`)!;
        for (const c of metadata[id].colliders) {
          if (c.type !== 'box') continue;
          const center = new THREE.Vector3(c.x, c.y, c.z), size = [c.width, c.height, c.depth];
          for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
            const normal = new THREE.Vector3().setComponent(axis, sign);
            for (const a of [-.43, .43]) for (const b of [-.43, .43]) {
              const sample = center.clone();
              sample.setComponent((axis + 1) % 3, sample.getComponent((axis + 1) % 3) + a * size[(axis + 1) % 3]);
              sample.setComponent((axis + 2) % 3, sample.getComponent((axis + 2) % 3) + b * size[(axis + 2) % 3]);
              ray.set(sample.addScaledVector(normal, 30), normal.clone().negate());
              const hit = ray.intersectObject(rock, false)[0];
              expect(hit, `${id} LOD${lod} axis ${axis} face ${sign}`).toBeDefined();
              expect(hit.point.clone().sub(center).dot(normal), `${id} collision stays inside stone`).toBeGreaterThanOrEqual(size[axis] / 2 - .08);
            }
          }
        }
      }
    }
  });

  it('preserves metre scale after meshopt decoding, placement, rotation and cell merging', async () => {
    const scene = new THREE.Scene();
    const kit = createKit(scene, { gltf: async () => asset } as unknown as AssetLoader,
      [{ piece:'house_small', x:43, y:2, z:-22, yaw:Math.PI / 2, scale:1.3 }]);
    await kit.ready; scene.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    scene.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
    expect(meshes).toHaveLength(3);
    const bounds = new THREE.Box3().setFromObject(meshes[0]);
    const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    expect(center.x).toBeCloseTo(43, 0); expect(center.z).toBeCloseTo(-22, 0);
    expect(bounds.min.y).toBeCloseTo(2, 1);
    expect(size.x).toBeGreaterThan(8); expect(size.z).toBeGreaterThan(9); expect(size.y).toBeGreaterThan(6);
    kit.dispose(); expect(scene.children).toHaveLength(0);
  });

  it('reduces dense planting at walking distance without hiding solid kit collision', async () => {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const kit = createKit(scene, { gltf: async () => asset } as unknown as AssetLoader, [
      { piece: 'bush_cluster', x: 1, y: 0, z: 1, yaw: 0 },
      { piece: 'hedge', x: 2, y: 0, z: 1, yaw: 0 },
      { piece: 'flower_bed', x: 1, y: 0, z: 2, yaw: 0 },
      { piece: 'house_small', x: 3, y: 0, z: 3, yaw: 0 },
    ]);
    await kit.ready; scene.updateMatrixWorld(true);
    const plants = scene.getObjectByName('kit:plants:0:0') as THREE.LOD;
    const flowers = scene.getObjectByName('kit:flowers:0:0') as THREE.LOD;
    const house = scene.getObjectByName('kit:solid:0:0') as THREE.LOD;
    const move = (distance: number) => {
      camera.position.set(1.5, 2, 1 + distance); camera.updateMatrixWorld(true); kit.update(camera);
    };
    move(3); expect(plants.getCurrentLevel()).toBe(0);
    move(20); expect(plants.getCurrentLevel()).toBe(1); expect(flowers.getCurrentLevel()).toBe(1);
    const near = (plants.levels[0].object as THREE.Mesh).geometry.index!.count;
    const middle = (plants.levels[1].object as THREE.Mesh).geometry.index!.count;
    expect(middle).toBeLessThan(near * .4);
    for (const entry of [...plants.levels, ...flowers.levels]) expect((entry.object as THREE.Mesh).castShadow).toBe(false);
    move(40);
    expect(plants.getCurrentLevel()).toBe(2); expect(plants.visible).toBe(true);
    expect(((plants.levels[2].object as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity).toBeCloseTo(.5);
    move(55); expect(plants.visible).toBe(false);
    expect(flowers.visible).toBe(true); expect(house.visible).toBe(true);
    move(3); expect(plants.visible).toBe(true); expect(plants.getCurrentLevel()).toBe(0);
    kit.dispose(); expect(scene.children).toHaveLength(0);
  });

  it('keeps window bounce inside the rotated house and follows each authored floor without extra lights', async () => {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const placement = { piece: 'house_tall', x: 43, y: 2, z: -22, yaw: Math.PI / 2, scale: 1.3 };
    const kit = createKit(scene, { gltf: async () => asset } as unknown as AssetLoader, [placement]);
    await kit.ready;
    const lod = scene.getObjectByName('kit:solid:1:-1') as THREE.LOD;
    const material = (lod.levels[0].object as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader } as THREE.WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    const move = (x: number, y: number, z: number) => {
      camera.position.set(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), placement.yaw)
        .multiplyScalar(placement.scale).add(new THREE.Vector3(placement.x, placement.y, placement.z));
      kit.update(camera);
    };
    move(0, 1.7, 0);
    expect(shader.uniforms.kitRoomAmount.value).toBe(1);
    const bounds = shader.uniforms.kitRoomBounds.value as THREE.Vector4;
    expect(bounds.z).toBeCloseTo(.11); expect(bounds.w).toBeCloseTo(3.04);
    move(0, 4.9, 0);
    expect(bounds.z).toBeCloseTo(3.22); expect(bounds.w).toBeCloseTo(6.4);
    const local = camera.position.clone().applyMatrix4(shader.uniforms.kitRoomInverse.value);
    expect(local.x).toBeCloseTo(0); expect(local.y).toBeCloseTo(4.9); expect(local.z).toBeCloseTo(0);
    const windows = shader.uniforms.kitWindowRects.value as THREE.Vector4[];
    for (const window of windows) {
      expect(Math.abs((window.x + window.z) / 2)).toBeCloseTo(2.56, 1);
      expect(window.z - window.x).toBeCloseTo(1.45, 1);
      expect((window.y + window.w) / 2).toBeCloseTo(4.98, 1);
    }
    move(5, 4.9, 0); expect(shader.uniforms.kitRoomAmount.value).toBe(0);
    move(0, 7, 0); expect(shader.uniforms.kitRoomAmount.value).toBe(0);
    let lights = 0; scene.traverse(object => { if (object instanceof THREE.Light) lights++; });
    expect(lights).toBe(0); expect(lod.levels).toHaveLength(3);
    kit.dispose(); expect(scene.children).toHaveLength(0);
  });

  it('reduces room furniture independently of buildings while preserving every solid silhouette', async () => {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const kit = createKit(scene, { gltf: async () => asset } as unknown as AssetLoader, [
      { piece: 'bed', x: 1, y: 0, z: 1, yaw: 0 },
      { piece: 'interior_counter', x: 2, y: 0, z: 1, yaw: 0 },
      { piece: 'bed', x: 18, y: 3.22, z: 1, yaw: Math.PI / 2 },
      { piece: 'house_small', x: 3, y: 0, z: 3, yaw: 0 },
    ]);
    await kit.ready; scene.updateMatrixWorld(true);
    const furniture = scene.getObjectByName('kit:furniture:0:0') as THREE.LOD;
    const upperFurniture = scene.getObjectByName('kit:furniture:2:0') as THREE.LOD;
    const house = scene.getObjectByName('kit:solid:0:0') as THREE.LOD;
    expect(furniture.levels).toHaveLength(3); expect(upperFurniture.levels).toHaveLength(3);
    const move = (distance: number) => {
      camera.position.set(1.5, 1.7, 1 + distance); camera.updateMatrixWorld(true); kit.update(camera);
    };
    move(3); expect(furniture.getCurrentLevel()).toBe(0);
    move(16); expect(furniture.getCurrentLevel()).toBe(1); expect(house.getCurrentLevel()).toBe(0);
    move(33); expect(furniture.getCurrentLevel()).toBe(2);
    move(120); expect(furniture.visible).toBe(true); expect(upperFurniture.visible).toBe(true);
    for (const entry of [...furniture.levels, ...upperFurniture.levels]) {
      const mesh = entry.object as THREE.Mesh, material = mesh.material as THREE.MeshStandardMaterial;
      expect(mesh.castShadow).toBe(false); expect(mesh.receiveShadow).toBe(true);
      expect(material.opacity).toBe(1); expect(material.transparent).toBe(false);
    }
    expect((house.levels[0].object as THREE.Mesh).castShadow).toBe(true);
    const near = (furniture.levels[0].object as THREE.Mesh).geometry.index!.count;
    const far = (furniture.levels[2].object as THREE.Mesh).geometry.index!.count;
    expect(far).toBeLessThan(near * .4);
    move(3); expect(furniture.getCurrentLevel()).toBe(0);
    kit.dispose(); expect(scene.children).toHaveLength(0);
  });
});
