import { afterEach, expect, it, vi } from 'vitest';
import { GameRenderer } from '../src/render/renderer';
import { DEFAULT_SETTINGS } from '../src/settings';

vi.mock('../src/render/weapons', () => ({ WeaponView: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('protects fine detail from isolated stalls, bounds sustained reductions and restores resolution', () => {
  let now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const renderer = Object.assign(Object.create(GameRenderer.prototype), {
    settings: DEFAULT_SETTINGS, frameInterval: 16.7, lastUpdateAt: now,
    resolutionScale: 1, slowFor: 0, fastFor: 0, applyPixelRatio: vi.fn(),
  });
  const run = (frames: number, interval: number) => {
    for (let i = 0; i < frames; i++) { now += interval; renderer.adaptResolution(); }
  };
  run(30, 25); run(1, 200); run(120, 1000 / 60);
  expect(renderer.resolutionScale).toBe(1);
  run(600, 25);
  expect(renderer.resolutionScale).toBe(.85);
  run(850, 1000 / 60);
  expect(renderer.resolutionScale).toBe(1);
});

it('uses viewport CSS pixels after resizing and updates DPR even when CSS dimensions do not change', () => {
  const viewport = { innerWidth: 1512, innerHeight: 982, devicePixelRatio: 2 }; vi.stubGlobal('window', viewport);
  let ratio = 1;
  const gl = { domElement: { clientWidth: 1920, clientHeight: 720, style: {} },
    getPixelRatio: () => ratio, setPixelRatio: vi.fn(value => { ratio = value; }), setSize: vi.fn() };
  const camera = { aspect: 1, updateProjectionMatrix: vi.fn() };
  const renderer = Object.assign(Object.create(GameRenderer.prototype), {
    disposed: false, settings: { ...DEFAULT_SETTINGS, graphics: 'medium' }, resolutionScale: 1,
    lastSize: { width: 1920, height: 720 }, lastDeviceRatio: 0, gl, camera,
    pipeline: { resize: vi.fn() }, weaponView: { resize: vi.fn() }, avatars: { resize: vi.fn() },
  });
  renderer.resize();
  expect(gl.setSize).toHaveBeenLastCalledWith(1512, 982, false);
  expect(gl.domElement.style).toEqual({ width: '100vw', height: '100vh' });
  expect(camera.aspect).toBe(1512 / 982); expect(ratio).toBe(2);
  viewport.devicePixelRatio = 1; renderer.resize(); expect(ratio).toBe(1);
  viewport.innerWidth = 1100; viewport.innerHeight = 900; renderer.resize();
  expect(gl.setSize).toHaveBeenLastCalledWith(1100, 900, false);
});
