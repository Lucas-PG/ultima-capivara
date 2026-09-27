import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { kitInteriorWindows } from '../src/render/kit-interior';
import type { KitPlacement } from '../src/shared/types';

// Rooms must show the windows their facades promise: every glazed exterior
// window gets an inner pane on the room side of the same wall.
let asset: GLTF;
beforeAll(async () => {
  const bytes = await readFile('public/models/kit/kit.glb');
  vi.stubGlobal('self', globalThis);
  vi.stubGlobal('createImageBitmap', async () => ({ width: 1024, height: 1024, close() {} }));
  try { asset = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ''); }
  finally { vi.unstubAllGlobals(); }
  asset.scene.updateMatrixWorld(true);
});

describe('interior windows', () => {
  for (const piece of ['house_small', 'house_medium', 'house_tall']) it(`${piece} rooms see their facade windows`, () => {
    const placement: KitPlacement = { id: 'h', piece, x: 0, y: 0, z: 0, yaw: 0 };
    const mesh = kitInteriorWindows(asset.scene, [placement])!;
    expect(mesh).not.toBeNull();
    const position = mesh.geometry.getAttribute('position');
    const panes = position.count / 4;
    expect(panes).toBeGreaterThanOrEqual(2);
    // Panes sit inside the footprint, just behind the facade, never outside it.
    const box = new THREE.Box3().setFromBufferAttribute(position as THREE.BufferAttribute);
    const [w, d] = { house_small: [7, 6], house_medium: [9, 7], house_tall: [8, 7] }[piece]!;
    expect(box.max.x).toBeLessThanOrEqual(w / 2); expect(box.max.z).toBeLessThanOrEqual(d / 2);
    expect(box.min.y).toBeGreaterThan(.4);
  });
});
