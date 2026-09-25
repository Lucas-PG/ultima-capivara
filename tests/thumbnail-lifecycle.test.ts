import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebGLRenderer } from 'three';

vi.mock('three', async importOriginal => ({
  ...await importOriginal<typeof import('three')>(),
  WebGLRenderer: vi.fn(function () { throw new Error('No GPU in this unit test'); }),
}));

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  vi.stubGlobal('document', { createElement: vi.fn(() => ({})) });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('thumbnail loading lifecycle', () => {
  it('does not create a context when the dynamic import finishes after pagehide', async () => {
    const lifecycle = new AbortController(); lifecycle.abort();
    const { loadWeaponThumbnails } = await import('../src/render/thumbnails');
    const loading = loadWeaponThumbnails(lifecycle.signal);
    await vi.runAllTimersAsync();
    expect((await loading).size).toBe(0);
    expect(WebGLRenderer).not.toHaveBeenCalled();
  });

  it('settles a cancelled delayed render without starting WebGL, and allows a new lifecycle', async () => {
    const { loadWeaponThumbnails } = await import('../src/render/thumbnails');
    const lifecycle = new AbortController();
    const loading = loadWeaponThumbnails(lifecycle.signal);
    let settled = false; void loading.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(249);
    lifecycle.abort();
    await Promise.resolve();
    expect(settled).toBe(true);
    expect((await loading).size).toBe(0);
    await vi.runAllTimersAsync();
    expect(WebGLRenderer).not.toHaveBeenCalled();
    const next = loadWeaponThumbnails(new AbortController().signal);
    await vi.runAllTimersAsync(); await next;
    expect(WebGLRenderer).toHaveBeenCalledOnce();
  });

  it('still coalesces older callers without a signal and keeps the decorative failure fallback', async () => {
    const { loadWeaponThumbnails } = await import('../src/render/thumbnails');
    const first = loadWeaponThumbnails(), second = loadWeaponThumbnails();
    expect(first).toBe(second);
    await vi.advanceTimersByTimeAsync(249);
    expect(WebGLRenderer).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect((await first).size).toBe(0);
    expect(WebGLRenderer).toHaveBeenCalledOnce();
  });
});
