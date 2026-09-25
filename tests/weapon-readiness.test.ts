import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AssetLoader } from '../src/render/assets';
import type { WeaponView as WeaponViewType } from '../src/render/weapons';

let WeaponView: typeof WeaponViewType;
beforeAll(async () => {
  // Canvas painting is unrelated to model readiness. Keep the real scene/model
  // assembly, substituting only the browser's drawing surface and asset I/O.
  const context = {
    fillRect() {}, fillText() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, fill() {},
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
  ({ WeaponView } = await import('../src/render/weapons'));
});
afterAll(() => vi.unstubAllGlobals());

function fixtures(invalid?: 'pistol' | 'sniper') {
  const pistol = new THREE.Group();
  for (const name of ['service_pistol_pistol_a', 'service_pistol_slide_a', 'service_pistol_hammer_a',
    'service_pistol_trigger_a', 'service_pistol_magazine_loaded']) {
    if (invalid === 'pistol' && name === 'service_pistol_slide_a') continue;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    mesh.name = name; pistol.add(mesh);
  }
  const sniper = new THREE.Group();
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  const main = invalid === 'sniper' ? new THREE.Mesh(geometry, material) : new THREE.SkinnedMesh(geometry, material);
  main.name = 'FRAME_LOD0001';
  if (main instanceof THREE.SkinnedMesh) main.skeleton = new THREE.Skeleton([]);
  sniper.add(main);
  return {
    gltf: async () => ({ scene: pistol }), fbx: async () => sniper,
    texture: () => new THREE.Texture(),
  } as unknown as AssetLoader;
}

describe('required weapon model readiness', () => {
  it.each([
    ['pistol', /service-pistol\/service_pistol_1k\.gltf: missing required nodes service_pistol_slide_a/],
    ['sniper', /m700\/m700\.fbx: required node FRAME_LOD0001 must be a SkinnedMesh/],
  ] as const)('rejects a structurally invalid %s instead of reporting a ready fallback', async (invalid, error) => {
    const ready = vi.fn(), view = new WeaponView(fixtures(invalid), ready);
    try { await expect(view.assets).rejects.toThrow(error); expect(ready).not.toHaveBeenCalled(); }
    finally { view.dispose(); }
  });

  it('reports ready only after both valid imported models have been assembled', async () => {
    const ready = vi.fn(), view = new WeaponView(fixtures(), ready);
    try {
      await view.assets;
      expect(ready).toHaveBeenCalledOnce();
      expect(view.scene.getObjectByName('service_pistol_slide_a')).toBeDefined();
      expect(view.scene.getObjectByName('FRAME_LOD0001')).toBeInstanceOf(THREE.SkinnedMesh);
    } finally { view.dispose(); }
  });
});
