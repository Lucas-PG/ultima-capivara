import { afterEach, expect, it, vi } from 'vitest';
import { GameRenderer } from '../src/render/renderer';
import { DynamicResolution, renderRange } from '../src/render/resolution';
import { GUARD } from '../src/render/pipeline';
import { DEFAULT_SETTINGS } from '../src/settings';

vi.mock('../src/render/weapons', () => ({ WeaponView: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function harness(viewport: { innerWidth: number; innerHeight: number; devicePixelRatio: number }, graphics: 'low' | 'medium' | 'high' = 'medium') {
  vi.stubGlobal('window', viewport);
  const gl = { domElement: { width: 1, height: 1, style: {} },
    setDrawingBufferSize: vi.fn((width: number, height: number, value: number) => {
      gl.domElement.width = Math.floor(width * value); gl.domElement.height = Math.floor(height * value);
    }) };
  const settings = { ...DEFAULT_SETTINGS, graphics };
  const renderer = Object.assign(Object.create(GameRenderer.prototype), {
    disposed: false, settings, lastSize: { width: 1, height: 1 }, lastDeviceRatio: 0, outputRatio: 0, lastUpdateAt: 0, lastCpuMs: 4, gl,
    camera: { aspect: 1, updateProjectionMatrix: vi.fn() },
    dynamicResolution: new DynamicResolution(renderRange(graphics, 'auto', viewport.devicePixelRatio)),
    pipeline: { setSize: vi.fn(), setRenderSize: vi.fn() }, weaponView: { resize: vi.fn() }, avatars: { resize: vi.fn() },
  });
  return { renderer, gl };
}

it('fills a Retina canvas at native resolution while drawing the 3D image at the preset density', () => {
  const { renderer, gl } = harness({ innerWidth: 1470, innerHeight: 956, devicePixelRatio: 2 });
  renderer.resize();
  // The canvas (and the HTML HUD over it) keeps the screen's density; the upscale fills it.
  expect([gl.domElement.width, gl.domElement.height]).toEqual([2940, 1912]);
  expect(gl.domElement.style).toEqual({ width: '100vw', height: '100vh' });
  // Medium draws 1.25 render pixels per CSS pixel, a guard band past the ceiling allocated once.
  expect(renderer.pipeline.setSize).toHaveBeenLastCalledWith({ outputWidth: 2940, outputHeight: 1912,
    allocWidth: 1838 + GUARD, allocHeight: 1195 + GUARD, width: 1838, height: 1195 });
  expect(renderer.camera.aspect).toBe(1470 / 956);
});

it('follows a display change and keeps a 1x screen at native resolution', () => {
  const viewport = { innerWidth: 1512, innerHeight: 982, devicePixelRatio: 2 };
  const { renderer, gl } = harness(viewport);
  renderer.resize();
  viewport.devicePixelRatio = 1; renderer.resize();
  expect([gl.domElement.width, gl.domElement.height]).toEqual([1512, 982]);
  expect(renderer.pipeline.setSize).toHaveBeenLastCalledWith({ outputWidth: 1512, outputHeight: 982,
    allocWidth: 1512 + GUARD, allocHeight: 982 + GUARD, width: 1512, height: 982 });
  viewport.innerWidth = 1100; viewport.innerHeight = 900; renderer.resize();
  expect([gl.domElement.width, gl.domElement.height]).toEqual([1100, 900]);
});

it('answers a sustained slow frame rate by drawing fewer pixels, without reallocating or resizing the canvas', () => {
  let now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const { renderer, gl } = harness({ innerWidth: 1470, innerHeight: 956, devicePixelRatio: 2 });
  renderer.resize();
  const resized = gl.setDrawingBufferSize.mock.calls.length, allocated = renderer.pipeline.setSize.mock.calls.length;
  renderer.lastUpdateAt = now;
  // 50 ms frames: the 18 fps the user saw on Medium.
  for (let i = 0; i < 40; i++) { now += 50; renderer.adaptResolution(1000 / 60); }
  expect(renderer.pipeline.setRenderSize).toHaveBeenCalled();
  const [width, height] = renderer.pipeline.setRenderSize.mock.calls.at(-1);
  expect(width).toBeLessThan(1838); expect(height).toBeLessThan(1195);
  expect(gl.setDrawingBufferSize).toHaveBeenCalledTimes(resized);
  expect(renderer.pipeline.setSize).toHaveBeenCalledTimes(allocated);
});
