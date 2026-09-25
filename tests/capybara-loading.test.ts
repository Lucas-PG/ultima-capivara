import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { statSync } from 'node:fs';
import type { Settings, WorldSpec } from '../src/shared/types';
import type { AssetEntry } from '../src/render/asset-manifest';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

const { loaderConstructor } = vi.hoisted(() => ({ loaderConstructor: vi.fn() }));
vi.mock('../src/render/assets', () => ({ AssetLoader: loaderConstructor }));
vi.mock('three', async original => ({ ...await original<typeof THREE>(), WebGLRenderer: vi.fn() }));

// Exercise the real warmup gate without allocating a browser or GPU.
vi.mock('../src/render/world-scene', () => ({ WorldScene: class {} }));
vi.mock('../src/render/thumbnails', () => ({ loadWeaponThumbnails: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../src/render/weapons', () => ({ WeaponView: class {} }));
vi.mock('../src/render/avatars', () => ({ AvatarView: class {}, avatar: vi.fn(), BOT_COLOR: '#bd8956' }));
vi.mock('../src/render/camera', async () => {
  const THREE = await import('three');
  return { CameraRig: class {}, makePlane: () => new THREE.Group() };
});
vi.mock('../src/render/loot', () => ({ LootView: class {} }));
vi.mock('../src/render/effects', () => ({ EffectsView: class {} }));
vi.mock('../src/render/pipeline', () => ({ RenderPipeline: class {}, PRESETS: {} }));
vi.mock('../src/render/item-geometry', () => ({ itemGeometry: vi.fn() }));

function fixture(): GLTF {
  const scene = new THREE.Group();
  const bones = ['root', 'head', 'arm_L', 'arm_R'].map(name => {
    const bone = new THREE.Bone(); bone.name = name; return bone;
  });
  scene.add(bones[0]); bones[0].add(...bones.slice(1));
  const skeleton = new THREE.Skeleton(bones);
  const material = new THREE.MeshStandardMaterial();
  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), material);
    mesh.name = `Capybara_LOD${i}`; mesh.bind(skeleton); scene.add(mesh);
  }
  return { scene, animations: ['idle', 'run', 'jump'].map(name => new THREE.AnimationClip(name, 1, [])) } as unknown as GLTF;
}

async function warmupHarness(load = vi.fn(async () => fixture())) {
  const { GameRenderer } = await import('../src/render/renderer');
  const upload = vi.fn();
  const assets = { gltf: load, ready: vi.fn().mockResolvedValue(undefined), dispose: vi.fn() };
  const renderer = Object.assign(Object.create(GameRenderer.prototype), {
    disposed: false, warming: null, assets, onProgress: vi.fn(), scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
    worldView: { skyTexture: { image: { data: [] } } },
    weaponView: { assets: Promise.resolve(), scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() },
    gl: { compileAsync: vi.fn().mockResolvedValue(undefined) }, resize: vi.fn(), uploadEverything: upload,
  }) as InstanceType<typeof GameRenderer>;
  return { renderer, upload, assets };
}

beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers();
  vi.stubGlobal('location', { search: '?capy=v3' });
});

describe('capybara cosmetic colour contract', () => {
  const colors = ['#1FB5A8', '#E76F51', '#FFC23D', '#3D6FB6', '#A468FF', '#F28DB2', '#8CC453', '#F4F1E8', '#bd8956'];

  it('keeps procedural fur fixed for new and legacy profile colours', async () => {
    vi.stubGlobal('location', { search: '' });
    const capy = await import('../src/render/capybara');
    const baseline = capy.buildCapybaraBody(colors[0]);
    expect((baseline.body.material as THREE.Material).userData.toonCharacter).toBe(true);
    const original = baseline.body.geometry.getAttribute('color');
    const positions = baseline.body.geometry.getAttribute('position');
    const bones = baseline.body.geometry.getAttribute('skinIndex');
    const baseFur = new THREE.Color('#B8743A');
    expect(Array.from({ length: original.count }, (_, i) => i).some(i =>
      Math.abs(original.getX(i) - baseFur.r) < 1e-6 && Math.abs(original.getY(i) - baseFur.g) < 1e-6 && Math.abs(original.getZ(i) - baseFur.b) < 1e-6)).toBe(true);
    for (const color of colors.slice(1)) {
      const actor = capy.buildCapybaraBody(color), tint = actor.body.geometry.getAttribute('color');
      let changed = 0;
      for (let i = 0; i < tint.count; i++) {
        if (tint.getX(i) === original.getX(i) && tint.getY(i) === original.getY(i) && tint.getZ(i) === original.getZ(i)) continue;
        changed++;
        // Identity colours stay confined to cloth around the neck, never head/paws/belly.
        expect(bones.getX(i)).toBe(capy.CAPY_BONES.torso);
        expect(positions.getY(i)).toBeGreaterThanOrEqual(1.039);
        expect(positions.getY(i)).toBeLessThanOrEqual(1.446);
      }
      expect(changed).toBeGreaterThan(0);
      actor.body.skeleton.dispose();
    }
    baseline.body.skeleton.dispose(); capy.disposeCapybaraAssets();
  });

  it('changes only bandana atlas columns and shares one material across every LOD and matching actor', async () => {
    const capy = await import('../src/render/capybara');
    const source = fixture();
    const sourceMaterial = (source.scene.getObjectByName('Capybara_LOD0') as THREE.SkinnedMesh).material as THREE.MeshStandardMaterial;
    sourceMaterial.vertexColors = true; sourceMaterial.emissive.set('#FFFFFF'); sourceMaterial.emissiveMap = new THREE.Texture();
    await capy.preloadCapybaraAsset(async () => source);
    for (const color of colors) {
      const actor = capy.buildCapybaraBody(color), copy = capy.buildCapybaraBody(color);
      const meshes = (actor.body.getObjectByName('Capivara_LOD') as THREE.LOD).levels.map(level => level.object as THREE.SkinnedMesh);
      const material = meshes[0].material as THREE.MeshStandardMaterial;
      expect(meshes.every(mesh => mesh.material === material)).toBe(true);
      expect(material.userData.toonCharacter).toBe(true);
      expect(material.customProgramCacheKey()).toContain('ilha-dourada-character-v1');
      expect(material.vertexColors).toBe(true);
      expect(material.emissiveMap).toBe(sourceMaterial.emissiveMap);
      expect(material.emissive.getHexString()).toBe('ffffff');
      expect((copy.body.getObjectByName('Capybara_LOD0') as THREE.SkinnedMesh).material).toBe(material);
      const atlas = material.map as THREE.DataTexture, pixels = atlas.image.data!;
      expect(atlas.colorSpace).toBe(THREE.SRGBColorSpace);
      const hexAt = (column: number) => Array.from(pixels.slice(column * 4, column * 4 + 3)).map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
      expect([0, 1, 2, 3, 4].map(hexAt)).toEqual(['B8743A', 'D39A47', '7A4424', '4A2C1C', 'E8C08A']);
      expect(hexAt(5)).toBe(color.slice(1).toUpperCase());
      if (color === '#1FB5A8') expect(hexAt(6)).toBe('12877E');
      expect(hexAt(7)).toBe('6E7040');
      const disposed = vi.fn(); material.addEventListener('dispose', disposed);
      actor.body.skeleton.dispose(); copy.body.skeleton.dispose();
      expect(disposed).not.toHaveBeenCalled();
    }
    const actor = capy.buildCapybaraBody(colors[0]);
    const material = (actor.body.getObjectByName('Capybara_LOD0') as THREE.SkinnedMesh).material as THREE.MeshStandardMaterial;
    const disposeMaterial = vi.fn(), disposeAtlas = vi.fn();
    material.addEventListener('dispose', disposeMaterial); material.map!.addEventListener('dispose', disposeAtlas);
    actor.body.skeleton.dispose(); capy.disposeCapybaraAssets();
    expect(disposeMaterial).toHaveBeenCalledTimes(1); expect(disposeAtlas).toHaveBeenCalledTimes(1);
    expect(() => capy.buildCapybaraBody(colors[0])).toThrow('ainda não está pronta');
  });

  it('does not resurrect disposed caches when a download finishes late', async () => {
    const capy = await import('../src/render/capybara');
    let finish!: (asset: GLTF) => void;
    const preload = capy.preloadCapybaraAsset(() => new Promise(resolve => { finish = resolve; }));
    capy.disposeCapybaraAssets();
    const asset = fixture(), source = asset.scene.getObjectByName('Capybara_LOD0') as THREE.SkinnedMesh;
    const disposed = vi.fn(); source.geometry.addEventListener('dispose', disposed);
    finish(asset);
    await expect(preload).rejects.toThrow('cancelado após descarte');
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(() => capy.buildCapybaraBody(colors[0])).toThrow('ainda não está pronta');
  });
});
afterEach(() => {
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks();
});

describe('capybara asset readiness', () => {
  it.each([false, true])('registers the exact optional asset size only with opt-in = %s', async enabled => {
    vi.stubGlobal('location', { search: enabled ? '?capy=v3' : '' });
    const { GameRenderer } = await import('../src/render/renderer');
    const stop = new Error('Manifest captured before GPU setup');
    loaderConstructor.mockClear().mockImplementation(function () { throw stop; });
    expect(() => new GameRenderer({} as HTMLCanvasElement, { objects: [] } as unknown as WorldSpec, {} as Settings)).toThrow(stop);
    const manifest = loaderConstructor.mock.calls[0][2] as readonly AssetEntry[];
    const entries = manifest.filter(asset => asset.path.includes('capybara'));
    expect(entries).toEqual(enabled ? [{
      path: 'models/capybara/capybara.glb', kind: 'glb',
      bytes: statSync('public/models/capybara/capybara.glb').size, label: 'Capivara',
    }] : []);
  });

  it('replaces only legacy weapon assets in the optional painted manifest', async () => {
    vi.stubGlobal('location', { search: '?capy=v3&weapons=v3' });
    const { GameRenderer } = await import('../src/render/renderer');
    const { ASSET_MANIFEST } = await import('../src/render/asset-manifest');
    const stop = new Error('Manifest captured before GPU setup');
    loaderConstructor.mockClear().mockImplementation(function () { throw stop; });
    expect(() => new GameRenderer({} as HTMLCanvasElement, { objects: [] } as unknown as WorldSpec, {} as Settings)).toThrow(stop);
    const manifest = loaderConstructor.mock.calls[0][2] as readonly AssetEntry[];
    expect(manifest.some(asset => /^models\/(service-pistol|m700)\//.test(asset.path))).toBe(false);
    expect(manifest.find(asset => asset.path === 'models/weapons/painted-weapons.glb')).toEqual({
      path: 'models/weapons/painted-weapons.glb', kind: 'glb',
      bytes: statSync('public/models/weapons/painted-weapons.glb').size, label: 'Armas da ilha',
    });
    for (const entry of ASSET_MANIFEST.filter(asset => !/^models\/(service-pistol|m700)\//.test(asset.path))) expect(manifest).toContainEqual(entry);
    expect(manifest.some(asset => asset.path === 'models/capybara/capybara.glb')).toBe(true);
  });

  it('keeps warmup pending beyond 15 seconds and creates only the final opted-in avatar', async () => {
    const capy = await import('../src/render/capybara');
    let finish!: (asset: GLTF) => void;
    const load = vi.fn(() => new Promise<GLTF>(resolve => { finish = resolve; }));
    const { renderer, upload, assets } = await warmupHarness(load);
    let ready = false;
    const warmup = renderer.warmup().then(() => { ready = true; });
    await vi.advanceTimersByTimeAsync(16000);
    expect(ready).toBe(false);
    expect(upload).not.toHaveBeenCalled();
    expect(() => capy.buildCapybaraBody('#1FB5A8')).toThrow('ainda não está pronta');
    expect(assets.ready).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledWith(capy.CAPYBARA_ASSET_URL);
    finish(fixture()); await warmup;
    expect(assets.ready).toHaveBeenCalledOnce();
    expect(assets.ready.mock.invocationCallOrder[0]).toBeLessThan(upload.mock.invocationCallOrder[0]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(1);
    const avatar = capy.buildCapybaraBody('#1FB5A8');
    expect(avatar.body.name).toBe('Capivara_v3');
    expect(avatar.body.getObjectByName('Capivara_LOD')).toBeInstanceOf(THREE.LOD);
    avatar.body.skeleton.dispose();
  });

  it('rejects warmup on download failure without reporting ready or creating a fallback', async () => {
    const capy = await import('../src/render/capybara');
    const failure = new Error('GLB unavailable');
    const warning = vi.spyOn(console, 'warn');
    const { renderer, upload, assets } = await warmupHarness(vi.fn(async () => { throw failure; }));
    await expect(renderer.warmup()).rejects.toBe(failure);
    expect(assets.ready).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
    expect(() => capy.buildCapybaraBody('#bd8956')).toThrow('ainda não está pronta');
  });

  it.each(['bone', 'clip', 'LOD'])('rejects malformed %s assets and releases every fetched resource', async defect => {
    const capy = await import('../src/render/capybara');
    const asset = fixture();
    const meshes = asset.scene.children.filter(object => object instanceof THREE.SkinnedMesh);
    const material = meshes[0].material as THREE.MeshStandardMaterial;
    material.map = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    const resources = new Set([...meshes.map(mesh => mesh.geometry), material, material.map, meshes[0].skeleton]);
    const disposals = [...resources].map(resource => vi.spyOn(resource, 'dispose'));
    if (defect === 'bone') asset.scene.getObjectByName('head')!.name = 'missing_head';
    if (defect === 'clip') asset.animations = [];
    if (defect === 'LOD') meshes[2].name = 'missing_LOD';
    await expect(capy.preloadCapybaraAsset(async () => asset)).rejects.toThrow('Capivara v3 inválida');
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
    expect(() => capy.buildCapybaraBody('#1FB5A8')).toThrow('ainda não está pronta');
  });

  it('loads under the configured non-root deployment base', async () => {
    vi.stubEnv('BASE_URL', '/ilha/');
    const capy = await import('../src/render/capybara');
    const load = vi.fn(async () => fixture());
    const { renderer } = await warmupHarness(load);
    await renderer.warmup();
    expect(load).toHaveBeenCalledWith('/ilha/models/capybara/capybara.glb');
  });

  it('does not request the optional asset with the flag disabled', async () => {
    vi.stubGlobal('location', { search: '' });
    const capy = await import('../src/render/capybara');
    const load = vi.fn(async () => fixture());
    const { renderer, upload } = await warmupHarness(load);
    await renderer.warmup();
    expect(upload).toHaveBeenCalledOnce();
    expect(load).not.toHaveBeenCalled();
    const avatar = capy.buildCapybaraBody('#bd8956');
    expect(avatar.body.name).not.toBe('Capivara_v3');
    avatar.body.skeleton.dispose();
  });
});
