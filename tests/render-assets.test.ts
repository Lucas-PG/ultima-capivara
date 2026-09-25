import { statSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ASSET_MANIFEST } from '../src/render/asset-manifest';
import { AssetProgress } from '../src/render/asset-progress';

describe('match asset readiness', () => {
  it('weights progress by the exact shipped resource sizes and covers glTF dependencies', () => {
    const paths = new Set(ASSET_MANIFEST.map(asset => asset.path));
    expect(paths.size).toBe(ASSET_MANIFEST.length);
    for (const asset of ASSET_MANIFEST) expect(statSync(`public/${asset.path}`).size, asset.path).toBe(asset.bytes);
    for (const asset of ASSET_MANIFEST.filter(asset => asset.kind === 'gltf')) {
      const gltf = JSON.parse(readFileSync(`public/${asset.path}`, 'utf8'));
      const base = asset.path.slice(0, asset.path.lastIndexOf('/') + 1);
      for (const resource of [...gltf.buffers, ...gltf.images]) {
        if (resource.uri && !resource.uri.startsWith('data:')) expect(paths.has(base + resource.uri), resource.uri).toBe(true);
      }
    }
  });

  it('does not fabricate progress or double-count completion, and reserves completion for GPU warmup', () => {
    const events: { fraction: number; label: string }[] = [];
    const progress = new AssetProgress([
      { path: 'large.glb', kind: 'glb', bytes: 900, label: 'Modelo' },
      { path: 'small.webp', kind: 'texture', bytes: 100, label: 'Textura' },
    ], (fraction, label) => events.push({ fraction, label }));
    expect(events).toHaveLength(0);
    progress.transfer('large.glb', 450);
    expect(events.at(-1)?.fraction).toBeCloseTo(.405);
    progress.transfer('large.glb', 100);
    expect(events.at(-1)?.fraction).toBeCloseTo(.405);
    progress.finish('small.webp'); progress.finish('small.webp');
    expect(progress.stats.completed).toBe(1);
    expect(events.at(-1)?.fraction).toBeCloseTo(.495);
    progress.finish('large.glb');
    expect(progress.stats).toEqual({ loadedBytes: 1000, totalBytes: 1000, completed: 2, total: 2 });
    expect(events.at(-1)?.fraction).toBe(.9);
  });
  it('never counts a failed required resource as successfully loaded', () => {
    const progress = new AssetProgress([
      { path: 'required.glb', kind: 'glb', bytes: 1000, label: 'Modelo' },
    ], () => {});
    progress.transfer('required.glb', 200);
    progress.fail('required.glb');
    // LoadingManager sends itemEnd even when the loader reported an error.
    progress.finish('required.glb');
    expect(progress.stats).toEqual({ loadedBytes: 200, totalBytes: 1000, completed: 0, total: 1 });
  });

});
