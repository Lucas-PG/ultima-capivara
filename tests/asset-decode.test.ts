import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetLoader } from '../src/render/assets';

vi.mock('three/addons/loaders/KTX2Loader.js', () => ({ KTX2Loader: class {
  setTranscoderPath() { return this; }
  detectSupport() { return this; }
  dispose() {}
} }));

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function textureLoad() {
  let resolve!: () => void, reject!: (error: Error) => void, loaded!: () => void;
  const decoded = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  vi.stubGlobal('location', { href: 'http://localhost/' });
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(function (this: THREE.TextureLoader, url, onLoad) {
    const texture = new THREE.Texture<HTMLImageElement>(); texture.image = { decode: () => decoded } as HTMLImageElement;
    this.manager.itemStart(url);
    loaded = () => { onLoad?.(texture); this.manager.itemEnd(url); };
    return texture;
  });
  const progress = vi.fn();
  const loader = new AssetLoader({} as THREE.WebGLRenderer, progress,
    [{ path: 'paint.png', kind: 'texture', bytes: 100, label: 'Pintando' }]);
  loader.texture('paint.png');
  return { loader, progress, loaded: () => loaded(), resolve, reject };
}

describe('texture decode readiness', () => {
  it('prepares new detail maps without reuploading shared atlases on the next match', () => {
    vi.stubGlobal('location', { href: 'http://localhost/' });
    const loader = new AssetLoader({ capabilities: { getMaxAnisotropy: () => 8 } } as unknown as THREE.WebGLRenderer);
    const map = new THREE.DataTexture(new Uint8Array(128 * 128 * 4), 128, 128);
    const palette = new THREE.DataTexture(new Uint8Array(16 * 16 * 4), 16, 16);
    const material = new THREE.MeshStandardMaterial({ map, emissiveMap: palette });
    const scene = new THREE.Group(); scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), material));
    loader.prepareTextures(scene);
    expect(map.anisotropy).toBe(8); expect(map.generateMipmaps).toBe(true);
    expect(map.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(palette.minFilter).toBe(THREE.NearestFilter); expect(palette.version).toBe(0);
    const uploadedVersion = map.version;
    const normal = new THREE.DataTexture(new Uint8Array(128 * 128 * 4), 128, 128);
    material.normalMap = normal;
    loader.prepareTextures(scene);
    expect(map.version).toBe(uploadedVersion);
    expect(normal.anisotropy).toBe(8); expect(normal.version).toBeGreaterThan(0);
    loader.dispose(); material.dispose(); map.dispose(); palette.dispose(); normal.dispose();
    (scene.children[0] as THREE.Mesh).geometry.dispose();
  });

  it('holds asset completion until a loaded image finishes decoding', async () => {
    const h = textureLoad(), ready = vi.fn();
    const pending = h.loader.ready().then(ready);
    h.loaded(); await Promise.resolve(); await Promise.resolve();
    expect(ready).not.toHaveBeenCalled();
    expect(h.loader.stats.completed).toBe(0);
    expect(h.progress.mock.calls.some(([fraction]) => fraction >= .9)).toBe(false);
    h.resolve(); await pending;
    expect(ready).toHaveBeenCalledOnce();
    expect(h.loader.stats.completed).toBe(1);
    expect(h.progress).toHaveBeenLastCalledWith(.9, 'Pintando (1/1)');
    h.loader.dispose();
  });

  it('rejects readiness and never completes a resource when decode fails', async () => {
    const h = textureLoad();
    const pending = expect(h.loader.ready()).rejects.toThrow('decode failed');
    h.loaded(); h.reject(new Error('decode failed')); await pending;
    expect(h.loader.stats.completed).toBe(0);
    expect(h.progress.mock.calls.some(([fraction]) => fraction >= .9)).toBe(false);
    h.loader.dispose();
  });
});
