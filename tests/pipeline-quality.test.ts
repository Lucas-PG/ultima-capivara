import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { PRESETS, RenderPipeline } from '../src/render/pipeline';
import { AtmospherePass } from '../src/render/atmosphere-pass';

vi.mock('../src/render/atmosphere-pass', () => ({ AtmospherePass: vi.fn(function () {
  return { target: { texture: new THREE.Texture() }, scene: new THREE.Scene(), resize: vi.fn(), render: vi.fn(), dispose: vi.fn() };
}) }));
vi.mock('three/addons/postprocessing/SMAAPass.js', () => ({ SMAAPass: class {
  setSize = vi.fn(); dispose = vi.fn();
} }));

it('never creates or compiles AO on Low, and releases it when lowering quality', async () => {
  const gl = { getDrawingBufferSize: (size: THREE.Vector2) => size.set(1920, 1080), compileAsync: vi.fn(async () => {}) };
  const pipeline = new RenderPipeline(gl as unknown as THREE.WebGLRenderer, 0);
  pipeline.setQuality(PRESETS.low); pipeline.beginWarmup(); await pipeline.warmup();
  expect(AtmospherePass).not.toHaveBeenCalled(); expect(gl.compileAsync).toHaveBeenCalledTimes(3);
  pipeline.setQuality(PRESETS.medium);
  expect(AtmospherePass).toHaveBeenCalledOnce();
  const atmosphere = vi.mocked(AtmospherePass).mock.results[0].value as AtmospherePass;
  pipeline.setQuality(PRESETS.low);
  expect(atmosphere.dispose).toHaveBeenCalledOnce();
  gl.compileAsync.mockClear(); await pipeline.warmup();
  expect(gl.compileAsync).toHaveBeenCalledTimes(3); pipeline.dispose();
});
