import { afterEach, expect, it, vi } from 'vitest';
import { GameRenderer } from '../src/render/renderer';
import { DEFAULT_SETTINGS } from '../src/settings';

vi.mock('../src/render/weapons', () => ({ WeaponView: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

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
