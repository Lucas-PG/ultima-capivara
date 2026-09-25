import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PAINTED_WEAPON_IDS, PAINTED_WEAPON_URL } from '../src/render/painted-weapons';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { ActorState } from '../src/shared/types';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
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
      expect(view.camera.fov).toBe(58);
      const lights = view.scene.children.filter(child => child instanceof THREE.Light);
      expect(lights.map(light => [light.color.getHexString(), light.intensity])).toEqual([
        ['e4ece6', .85], ['ffe6c4', 2.7], ['b9e3ea', 1.1],
      ]);
    } finally { view.dispose(); }
  });
});


describe('painted first-person integration', () => {
  it('loads only the shared set, prewarms every rarity, aligns ADS and disposes sources once', async () => {
    vi.stubGlobal('location', { search: '?weapons=v3' });
    const source = new THREE.Group(), geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    for (const id of PAINTED_WEAPON_IDS) {
      const root = new THREE.Object3D(); root.name = id; source.add(root);
      for (const part of ['body', 'right_paw', 'left_paw', 'muzzle', 'eject', 'sight', 'magazine', 'action', 'legendary']) {
        if (id === 'machete' && part === 'left_paw') continue;
        const node = new THREE.Group(); node.name = `${id}_${part}`; root.add(node);
        if (part === 'sight') node.position.set(0, .12, .07);
        if (['body', 'right_paw', 'left_paw'].includes(part)) node.add(new THREE.Mesh(geometry, material));
      }
    }
    let finish!: (value: GLTF) => void;
    const loader = { gltf: vi.fn(() => new Promise<GLTF>(resolve => { finish = resolve; })), fbx: vi.fn(), texture: vi.fn() };
    const ready = vi.fn(), view = new WeaponView(loader as unknown as AssetLoader, ready);
    try {
      expect(ready).not.toHaveBeenCalled(); expect(loader.gltf).toHaveBeenCalledExactlyOnceWith(PAINTED_WEAPON_URL);
      expect(loader.fbx).not.toHaveBeenCalled(); expect(loader.texture).not.toHaveBeenCalled();
      finish({ scene: source, animations: [] } as unknown as GLTF); await view.assets;
      expect(ready).toHaveBeenCalledOnce(); expect(view.camera.fov).toBe(78);
      view.revealAll(true);
      const variants = new Set<THREE.Material>(), visibleRoots: string[] = [];
      view.scene.traverseVisible(object => {
        if (PAINTED_WEAPON_IDS.includes(object.name as never) && object instanceof THREE.Group) visibleRoots.push(object.name);
        if (object instanceof THREE.Mesh && object.geometry === geometry) variants.add(object.material as THREE.Material);
      });
      expect(visibleRoots).toHaveLength(32); expect(variants.size).toBe(4);
      const resources = [geometry, material, material.map!, ...variants];
      for (const variant of variants) resources.push((variant as THREE.MeshStandardMaterial).map!);
      const dispose = resources.map(resource => vi.spyOn(resource, 'dispose'));
      view.revealAll(false);
      const actor = { alive: true, stage: 'ground', velocity: { x: 0, y: 0, z: 0 }, ads: true, sprint: false,
        weapons: [{ id: 'pistol', rarity: 3 }], slot: 0, reloadUntil: 0 } as unknown as ActorState;
      for (let i = 0; i < 180; i++) view.update(actor, 1 / 60, DEFAULT_SETTINGS, 0, 0);
      view.scene.updateMatrixWorld(true);
      const sights: THREE.Object3D[] = [];
      view.scene.traverseVisible(object => { if (object.name.endsWith('_sight')) sights.push(object); });
      expect(sights).toHaveLength(1);
      const sight = sights[0].getWorldPosition(new THREE.Vector3()).project(view.camera);
      expect(sight.x).toBeCloseTo(0, 5); expect(sight.y).toBeCloseTo(0, 5);
      expect(sights[0].parent!.getObjectByName('pistol_legendary')!.visible).toBe(true);
      view.dispose(); view.dispose();
      for (const release of dispose) expect(release).toHaveBeenCalledOnce();
    } finally { view.dispose(); vi.stubGlobal('location', { search: '' }); }
  });
});
