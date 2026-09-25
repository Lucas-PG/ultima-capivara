import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

// Exercise the real warmup gate without allocating a browser or GPU.
vi.mock('../src/render/world-scene', () => ({ WorldScene: class {} }));
vi.mock('../src/render/weapons', () => ({ WeaponView: class {} }));
vi.mock('../src/render/avatars', () => ({ AvatarView: class {}, avatar: vi.fn(), BOT_COLOR: '#bd8956' }));
vi.mock('../src/render/camera', () => ({ CameraRig: class {}, makePlane: vi.fn() }));
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
  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    mesh.name = `Capybara_LOD${i}`; mesh.bind(skeleton); scene.add(mesh);
  }
  return { scene, animations: ['idle', 'run', 'jump'].map(name => new THREE.AnimationClip(name, 1, [])) } as unknown as GLTF;
}

async function warmupHarness() {
  const { GameRenderer } = await import('../src/render/renderer');
  const upload = vi.fn();
  const renderer = Object.assign(Object.create(GameRenderer.prototype), {
    warming: null, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
    worldView: { skyTexture: { image: { data: [] } } },
    weaponView: { assets: Promise.resolve(), scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() },
    gl: { compileAsync: vi.fn().mockResolvedValue(undefined) }, resize: vi.fn(), uploadEverything: upload,
  }) as InstanceType<typeof GameRenderer>;
  return { renderer, upload };
}

beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers();
  vi.stubGlobal('location', { search: '?capy=v3' });
});
afterEach(() => {
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks();
});

describe('capybara asset readiness', () => {
  it('keeps warmup pending beyond 15 seconds and creates only the final opted-in avatar', async () => {
    const capy = await import('../src/render/capybara');
    let finish!: (asset: GLTF) => void;
    const load = vi.fn(() => new Promise<GLTF>(resolve => { finish = resolve; }));
    const preload = capy.preloadCapybaraAsset(load);
    expect(capy.preloadCapybaraAsset(load)).toBe(preload);
    const { renderer, upload } = await warmupHarness();
    let ready = false;
    const warmup = renderer.warmup().then(() => { ready = true; });
    await vi.advanceTimersByTimeAsync(16000);
    expect(ready).toBe(false);
    expect(upload).not.toHaveBeenCalled();
    expect(() => capy.buildCapybaraBody('#1FB5A8')).toThrow('ainda não está pronta');
    finish(fixture()); await warmup;
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
    const preload = capy.preloadCapybaraAsset(async () => { throw failure; });
    const failedPreload = expect(preload).rejects.toBe(failure);
    const { renderer, upload } = await warmupHarness();
    await expect(renderer.warmup()).rejects.toBe(failure);
    await failedPreload;
    expect(upload).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
    expect(() => capy.buildCapybaraBody('#bd8956')).toThrow('ainda não está pronta');
  });

  it('rejects malformed assets before the readiness promise succeeds', async () => {
    const capy = await import('../src/render/capybara');
    const asset = fixture(); asset.animations = [];
    await expect(capy.preloadCapybaraAsset(async () => asset)).rejects.toThrow('animação idle');
    expect(() => capy.buildCapybaraBody('#1FB5A8')).toThrow('ainda não está pronta');
  });

  it('loads under the configured non-root deployment base', async () => {
    vi.stubEnv('BASE_URL', '/ilha/');
    const capy = await import('../src/render/capybara');
    const load = vi.fn(async () => fixture());
    await capy.preloadCapybaraAsset(load);
    expect(load).toHaveBeenCalledWith('/ilha/models/capybara/capybara.glb');
  });

  it('does not request the optional asset with the flag disabled', async () => {
    vi.stubGlobal('location', { search: '' });
    const capy = await import('../src/render/capybara');
    const load = vi.fn(async () => fixture());
    await capy.preloadCapybaraAsset(load);
    expect(load).not.toHaveBeenCalled();
    const avatar = capy.buildCapybaraBody('#bd8956');
    expect(avatar.body.name).not.toBe('Capivara_v3');
    avatar.body.skeleton.dispose();
  });
});
