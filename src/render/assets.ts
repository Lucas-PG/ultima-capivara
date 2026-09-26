import * as THREE from 'three';
import { timing } from './timing';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ASSET_MANIFEST, type AssetEntry } from './asset-manifest';
import { AssetProgress, type AssetProgressCallback } from './asset-progress';

export class AssetLoader {
  private readonly manager = new THREE.LoadingManager();
  private readonly textures = new Map<string, THREE.Texture>();
  private readonly decodingTextures = new Set<string>();
  private readonly models = new Map<string, Promise<GLTF>>();
  private readonly pending: Promise<unknown>[] = [];
  private readonly ktx: KTX2Loader;
  private readonly gltfLoader: GLTFLoader;
  private readonly progress: AssetProgress;
  private readonly anisotropy: number;
  private readonly base = new URL(import.meta.env.BASE_URL, location.href);

  constructor(gl: THREE.WebGLRenderer, onProgress: AssetProgressCallback = () => {}, manifest: readonly AssetEntry[] = ASSET_MANIFEST) {
    this.anisotropy = gl.capabilities?.getMaxAnisotropy() ?? 1;
    this.progress = new AssetProgress(manifest, onProgress);
    this.manager.onProgress = url => {
      const path = this.path(url);
      if (!this.decodingTextures.has(path)) this.progress.finish(path);
    };
    this.manager.onError = url => this.progress.fail(this.path(url));
    this.ktx = new KTX2Loader(this.manager).setTranscoderPath(`${import.meta.env.BASE_URL}decoders/basis/`).detectSupport(gl);
    this.gltfLoader = new GLTFLoader(this.manager).setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(this.ktx);
    this.manager.addHandler(/\.ktx2$/i, this.ktx);
    if (timing.enabled) {
      const parse = this.gltfLoader.parse.bind(this.gltfLoader);
      this.gltfLoader.parse = (data, path, onLoad, onError) => {
        const started = timing.begin();
        try { parse(data, path, asset => { timing.end('gltf-parse-wall', started, path, true); onLoad(asset); }, onError); }
        finally { timing.end('gltf-parse-sync', started, path, true); }
      };
    }
  }

  private path(url: string) { return new URL(url, this.base).pathname.slice(this.base.pathname.length); }
  private url(path: string) { return new URL(path, this.base).href; }
  private bytes(path: string) { return (event: ProgressEvent) => this.progress.transfer(this.path(this.url(path)), event.loaded); }
  private track<T>(promise: Promise<T>): Promise<T> {
    this.pending.push(promise);
    // Callers may wait until the whole scene is assembled before awaiting ready().
    void promise.catch(() => {});
    return promise;
  }

  texture(path: string): THREE.Texture {
    const cached = this.textures.get(path); if (cached) return cached;
    let texture!: THREE.Texture;
    const started = timing.begin();
    this.decodingTextures.add(path);
    this.track(new Promise<void>((resolve, reject) => {
      const fail = (error: unknown) => { this.progress.fail(path); this.decodingTextures.delete(path); reject(error); };
      texture = new THREE.TextureLoader(this.manager).load(this.url(path), loaded => {
        timing.end('texture-ready-wall', started, path, true);
        // Explicit decode keeps lazy image work inside the readiness barrier.
        const image = loaded.image as HTMLImageElement, decodeAt = timing.begin();
        const decoded = Promise.resolve().then(() => typeof image.decode === 'function' ? image.decode() : undefined);
        void decoded.then(() => {
          timing.end('texture-decode-wall', decodeAt, path, true);
          this.decodingTextures.delete(path); this.progress.finish(path); resolve();
        }, fail);
      }, undefined, fail);
    }));
    this.textures.set(path, texture); return texture;
  }

  hdr(path: string): THREE.DataTexture {
    let texture!: THREE.DataTexture;
    this.track(new Promise<void>((resolve, reject) => {
      texture = new HDRLoader(this.manager).load(this.url(path), () => resolve(), this.bytes(path), reject);
    }));
    return texture;
  }

  gltf(path: string): Promise<GLTF> {
    let promise = this.models.get(path);
    if (!promise) { promise = this.track(this.gltfLoader.loadAsync(this.url(path), this.bytes(path))); this.models.set(path, promise); }
    return promise;
  }

  fbx(path: string): Promise<THREE.Group> {
    return this.track(import('three/addons/loaders/FBXLoader.js').then(({ FBXLoader }) =>
      new FBXLoader(this.manager).loadAsync(this.url(path), this.bytes(path))));
  }

  ktx2(path: string): Promise<THREE.CompressedTexture> {
    return this.track(this.ktx.loadAsync(this.url(path), this.bytes(path)));
  }

  async ready(): Promise<void> {
    // Includes loads registered by model setup after a dynamic loader import.
    let count = 0;
    do { count = this.pending.length; await Promise.all(this.pending); } while (count !== this.pending.length);
  }

  // Run after all authored and procedural materials exist, before GPU warmup.
  // Palette lookup tables encode discrete colours, not a spatial image: their
  // nearest sampling must survive or fur and emissive swatches bleed together.
  prepareTextures(root: THREE.Object3D) {
    const seen = new Set<THREE.Texture>();
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite || object instanceof THREE.Line)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'specularIntensityMap', 'specularColorMap']) {
          const texture = (material as unknown as Record<string, unknown>)[key];
          if (!(texture instanceof THREE.Texture) || seen.has(texture)) continue;
          seen.add(texture);
          const palette = texture.minFilter === THREE.NearestFilter && texture.magFilter === THREE.NearestFilter && texture.image?.width <= 64;
          if (palette) continue;
          const generateMipmaps = !(texture instanceof THREE.CompressedTexture);
          const minFilter = generateMipmaps || texture.mipmaps?.length ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
          if (texture.anisotropy !== this.anisotropy || texture.magFilter !== THREE.LinearFilter ||
            texture.generateMipmaps !== generateMipmaps || texture.minFilter !== minFilter) {
            texture.anisotropy = this.anisotropy; texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = generateMipmaps; texture.minFilter = minFilter;
            // A second match shares these textures. Invalidating unchanged maps
            // here used to upload every atlas and rebuild its mip chain again.
            texture.needsUpdate = true;
          }
        }
      }
    });
  }

  get stats() { return this.progress.stats; }
  dispose() { this.ktx.dispose(); }
}
