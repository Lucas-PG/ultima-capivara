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
  it('ships every collision piece with two real LODs, a shared atlas and baked shading', () => {
    expect(document.getRoot().listMaterials()).toHaveLength(1);
    for (const [id, definition] of Object.entries(metadata)) {
      for (let lod = 0; lod < 2; lod++) {
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

  it('preserves metre scale after meshopt decoding, placement, rotation and cell merging', async () => {
    const scene = new THREE.Scene();
    const kit = createKit(scene, { gltf: async () => asset } as unknown as AssetLoader,
      [{ piece:'house_small', x:43, y:2, z:-22, yaw:Math.PI / 2, scale:1.3 }]);
    await kit.ready; scene.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    scene.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
    expect(meshes).toHaveLength(2);
    const bounds = new THREE.Box3().setFromObject(meshes[0]);
    const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    expect(center.x).toBeCloseTo(43, 0); expect(center.z).toBeCloseTo(-22, 0);
    expect(bounds.min.y).toBeCloseTo(2, 1);
    expect(size.x).toBeGreaterThan(8); expect(size.z).toBeGreaterThan(9); expect(size.y).toBeGreaterThan(6);
    kit.dispose(); expect(scene.children).toHaveLength(0);
  });
});
