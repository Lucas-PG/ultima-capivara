import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { GameRenderer } from '../src/render/renderer';
import type { WorldSnapshot } from '../src/shared/types';

// Character download/validation has its own readiness suite; this harness isolates GPU lifecycle.
vi.mock('../src/render/capybara', () => ({ preloadCapybaraAsset: vi.fn(async () => {}), disposeCapybaraAssets: vi.fn() }));
vi.mock('../src/render/weapons', () => ({ WeaponView: vi.fn() }));
vi.mock('../src/render/thumbnails', () => ({ loadWeaponThumbnails: vi.fn(async () => {}) }));
vi.mock('../src/render/avatars', async () => {
  const THREE = await import('three');
  return { AvatarView: vi.fn(), BOT_COLOR: '#b8743a', avatar: () => ({
    group: new THREE.Group(), weapon: new THREE.Mesh(), chute: new THREE.Group(),
    body: { skeleton: { dispose() {} } },
  }) };
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function harness(ready: Promise<void> = Promise.resolve()) {
  // Exercise production async orchestration and disposal with GPU/I/O endpoints
  // replaced. Constructing the island or a WebGL context is not part of this test.
  const fields = {
    disposed: false, warming: null, preparation: Promise.resolve(),
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
    assets: { ready: vi.fn(() => ready), prepareTextures: vi.fn(), dispose: vi.fn() },
    weaponView: { assets: Promise.resolve(), scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), revealAll: vi.fn(), dispose: vi.fn() },
    storm: { mesh: new THREE.Mesh(), dispose: vi.fn() },
    ambientLife: { dispose: vi.fn() },
    sky: { group: new THREE.Group(), dispose: vi.fn() },
    worldView: { ready: Promise.resolve(), group: new THREE.Group(), dispose: vi.fn() },
    supplyDrops: { ready: Promise.resolve(), dispose: vi.fn() },
    avatars: { prepare: vi.fn(), warmupWeapons: new THREE.Group(), dispose: vi.fn() },
    pipeline: { beginWarmup: vi.fn(), beginFirstPersonWarmup: vi.fn(), warmup: vi.fn(async () => {}), renderPost: vi.fn(), resize: vi.fn(), dispose: vi.fn() },
    environment: { dispose: vi.fn() }, onProgress: vi.fn(), resize: vi.fn(),
    effects: { warm: vi.fn(), dispose: vi.fn() },
    gl: { setRenderTarget: vi.fn(), compileAsync: vi.fn(async () => {}), render: vi.fn(), dispose: vi.fn(), shadowMap: { enabled: true } },
  };
  const renderer: GameRenderer = Object.assign(Object.create(GameRenderer.prototype), fields);
  return { renderer, ...fields };
}

const snapshot = { actors: [] } as unknown as WorldSnapshot;

describe('renderer preparation lifecycle', () => {
  it('uploads into a tiny offscreen buffer and restores manual LOD and shadow resources', async () => {
    const h = harness(), lod = new THREE.LOD(), sun = new THREE.DirectionalLight();
    lod.autoUpdate = false; sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    const map = new THREE.WebGLRenderTarget(1024, 1024); sun.shadow.map = map;
    h.scene.add(lod, sun);
    h.gl.render.mockImplementation(() => {
      expect(sun.shadow.mapSize.toArray()).toEqual([64, 64]);
    });
    await h.renderer.warmup();
    const output = h.pipeline.renderPost.mock.calls[0][0] as THREE.WebGLRenderTarget;
    expect([output.width, output.height]).toEqual([64, 64]);
    expect(lod.autoUpdate).toBe(false); expect(sun.shadow.map).toBe(map);
    expect(sun.shadow.mapSize.toArray()).toEqual([1024, 1024]);
    expect(h.pipeline.resize).toHaveBeenCalledOnce(); map.dispose();
  });
  it('keeps loading until kit geometry has replaced the placement placeholders', async () => {
    const kit = deferred(), h = harness(); h.worldView.ready = kit.promise;
    const preparing = h.renderer.prepareMatch(snapshot);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(h.gl.compileAsync).not.toHaveBeenCalled(); expect(h.avatars.prepare).not.toHaveBeenCalled();
    kit.resolve(); await preparing;
    expect(h.avatars.prepare).toHaveBeenCalledOnce(); expect(h.pipeline.renderPost).toHaveBeenCalled();
  });

  it('cancels deferred asset warmup and queued match preparation when disposed', async () => {
    const load = deferred(), h = harness(load.promise);
    const warming = h.renderer.warmup(), preparing = h.renderer.prepareMatch(snapshot);
    const results = Promise.allSettled([warming, preparing]);
    await vi.waitFor(() => expect(h.assets.ready).toHaveBeenCalledOnce());
    h.renderer.dispose(); h.renderer.dispose(); load.resolve();
    for (const result of await results) expect(result.status).toBe('rejected');
    expect(h.resize).not.toHaveBeenCalled();
    expect(h.gl.compileAsync).not.toHaveBeenCalled();
    expect(h.avatars.prepare).not.toHaveBeenCalled();
    expect(h.onProgress).not.toHaveBeenCalled();
    expect(h.gl.dispose).toHaveBeenCalledOnce();
    expect(h.supplyDrops.dispose).toHaveBeenCalledOnce();
  });

  it.each(['world', 'first person', 'post'] as const)('does not resume GPU work after disposal during %s compilation', async stage => {
    const compile = deferred(), h = harness();
    if (stage === 'world') h.gl.compileAsync.mockImplementationOnce(() => compile.promise);
    if (stage === 'first person') h.gl.compileAsync.mockResolvedValueOnce().mockImplementationOnce(() => compile.promise);
    if (stage === 'post') h.pipeline.warmup.mockImplementationOnce(() => compile.promise);
    const preparing = h.renderer.prepareMatch(snapshot);
    const result = Promise.allSettled([preparing]);
    await vi.waitFor(() => expect(stage === 'post' ? h.pipeline.warmup : h.gl.compileAsync)
      .toHaveBeenCalledTimes(stage === 'first person' ? 2 : 1));
    h.renderer.dispose();
    const draws = h.gl.render.mock.calls.length, targets = h.gl.setRenderTarget.mock.calls.length;
    compile.resolve();
    expect((await result)[0].status).toBe('rejected');
    expect(h.gl.render).toHaveBeenCalledTimes(draws);
    expect(h.gl.setRenderTarget).toHaveBeenCalledTimes(targets);
    expect(h.pipeline.renderPost).not.toHaveBeenCalled();
    expect(h.avatars.prepare).not.toHaveBeenCalled();
    expect(h.onProgress.mock.calls.some(([fraction]) => fraction === 1)).toBe(false);
    await expect(h.renderer.warmup()).rejects.toThrow('disposed');
  });

  it('never reveals a match disposed during its own avatar upload after common warmup', async () => {
    const upload = deferred(), h = harness();
    await h.renderer.warmup();
    h.onProgress.mockClear();
    h.gl.compileAsync.mockImplementationOnce(() => upload.promise);
    const result = Promise.allSettled([h.renderer.prepareMatch(snapshot)]);
    await vi.waitFor(() => expect(h.avatars.prepare).toHaveBeenCalledOnce());
    h.renderer.dispose();
    const draws = h.gl.render.mock.calls.length;
    upload.resolve();
    expect((await result)[0].status).toBe('rejected');
    expect(h.gl.render).toHaveBeenCalledTimes(draws);
    expect(h.onProgress).not.toHaveBeenCalled();
  });
});
