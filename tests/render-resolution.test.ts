import { describe, expect, it } from 'vitest';
import { DynamicResolution, PRESET_DENSITY, renderRange, renderSize, type FrameSample } from '../src/render/resolution';

const BUDGET = 1000 / 60;
const frame = (intervalMs: number, extra: Partial<FrameSample> = {}): FrameSample => ({ intervalMs, budgetMs: BUDGET, cpuMs: 6, gpuMs: null, ...extra });
const run = (controller: DynamicResolution, count: number, sample: FrameSample) => { for (let i = 0; i < count; i++) controller.update(sample); };

describe('render range', () => {
  it('keeps a 1x screen at native resolution on Medium and High, and never renders above the screen', () => {
    expect(renderRange('medium', 'auto', 1).max).toBe(1);
    expect(renderRange('high', 'auto', 1).max).toBe(1);
    for (const graphics of ['low', 'medium', 'high'] as const) for (const ratio of [1, 1.5, 2, 3])
      expect(renderRange(graphics, 'auto', ratio).max).toBeLessThanOrEqual(ratio);
  });

  it('spends fewer pixels on Retina than native (the Medium lag on a MacBook Air) and more on each richer preset', () => {
    const low = renderRange('low', 'auto', 2), medium = renderRange('medium', 'auto', 2), high = renderRange('high', 'auto', 2);
    expect(medium.max).toBeLessThan(2);
    expect(low.max).toBeLessThan(medium.max); expect(medium.max).toBeLessThan(high.max);
    for (const range of [low, medium, high]) { expect(range.dynamic).toBe(true); expect(range.min).toBeLessThan(range.max); }
  });

  it('honours a fixed share of native resolution exactly, without dynamic changes', () => {
    expect(renderRange('medium', 1, 2)).toEqual({ min: 2, max: 2, dynamic: false });
    expect(renderRange('low', .5, 2)).toEqual({ min: 1, max: 1, dynamic: false });
    expect(renderRange('high', .75, 1)).toEqual({ min: .75, max: .75, dynamic: false });
  });

  it('keeps each preset range ordered and sizes in whole pixels', () => {
    for (const range of Object.values(PRESET_DENSITY)) expect(range.min).toBeLessThan(range.max);
    expect(renderSize(1470, 956, 1.25)).toEqual({ width: 1838, height: 1195 });
    expect(renderSize(0, 0, 1)).toEqual({ width: 1, height: 1 });
  });
});

describe('dynamic resolution', () => {
  it('ignores an isolated stall, which a lower resolution would not have prevented', () => {
    const controller = new DynamicResolution(renderRange('medium', 'auto', 2));
    run(controller, 60, frame(BUDGET)); controller.update(frame(250)); run(controller, 60, frame(BUDGET));
    expect(controller.density).toBe(1.25);
  });

  it('reacts within half a second when every frame misses, even far below the budget (the 18 fps case)', () => {
    // The previous controller ignored frames longer than 2.6 budgets, so a Retina Medium at 50 ms never scaled down.
    const controller = new DynamicResolution(renderRange('medium', 'auto', 2));
    let changedAfter = -1;
    for (let i = 0; i < 60 && changedAfter < 0; i++) if (controller.update(frame(50))) changedAfter = i;
    expect(changedAfter).toBeGreaterThanOrEqual(0); expect(changedAfter).toBeLessThan(30);
    expect(controller.density).toBeLessThan(1.25);
    run(controller, 600, frame(50));
    expect(controller.density).toBe(renderRange('medium', 'auto', 2).min);
  });

  it('drops straight to the density whose GPU time fits the budget when timer queries exist', () => {
    const controller = new DynamicResolution(renderRange('high', 'auto', 2));
    // 30 ms of GPU at 1.5: the pixels that fit 80 percent of 16.7 ms are (13.3 / 30) of them.
    run(controller, 30, frame(33.3, { gpuMs: 30 }));
    expect(controller.density).toBeLessThan(1.5 * Math.sqrt(13.4 / 30) + .051);
    expect(controller.density).toBeGreaterThanOrEqual(.75);
  });

  it('does not blur the image when the main thread, not the GPU, is late', () => {
    const controller = new DynamicResolution(renderRange('medium', 'auto', 2));
    run(controller, 300, frame(33.3, { cpuMs: 24 }));
    expect(controller.density).toBe(1.25);
  });

  it('climbs back with headroom, guided by GPU time, without crossing the ceiling', () => {
    const range = renderRange('medium', 'auto', 2), controller = new DynamicResolution(range);
    run(controller, 120, frame(40, { gpuMs: 30 }));
    const low = controller.density;
    expect(low).toBeLessThan(range.max);
    // Plenty of room: 6 ms of GPU at this density.
    run(controller, 3000, frame(BUDGET, { gpuMs: 6 }));
    expect(controller.density).toBe(range.max);
  });

  it('holds a density whose next step would not fit', () => {
    const range = renderRange('high', 'auto', 2), controller = new DynamicResolution(range);
    run(controller, 60, frame(40, { gpuMs: 28 }));
    const settled = controller.density;
    // 11 ms at this density: one more step predicts more than 75 percent of the budget.
    run(controller, 3000, frame(BUDGET, { gpuMs: 11.5 * (settled / settled) }));
    expect(controller.density).toBeLessThanOrEqual(settled + .05);
  });

  it('probes upward without GPU timings and backs off after a failed probe', () => {
    const range = renderRange('medium', 'auto', 2), controller = new DynamicResolution(range);
    run(controller, 60, frame(40));
    const low = controller.density;
    // Steady frames: the first probe comes after about 3 s.
    let steps = 0; while (controller.density === low && steps < 1000) { controller.update(frame(BUDGET)); steps++; }
    expect(steps * BUDGET).toBeGreaterThan(2900); expect(steps * BUDGET).toBeLessThan(5000);
    // The probe misses: back down, and the next probe waits twice as long.
    const probe = controller.density; let guard = 0;
    while (controller.density === probe && guard++ < 100) controller.update(frame(40));
    const back = controller.density; expect(back).toBeLessThan(probe);
    steps = 0; while (controller.density === back && steps < 2000) { controller.update(frame(BUDGET)); steps++; }
    expect(steps * BUDGET).toBeGreaterThan(5900);
  });

  it('never moves a fixed resolution', () => {
    const controller = new DynamicResolution(renderRange('medium', 1, 2));
    run(controller, 600, frame(60, { gpuMs: 50 }));
    expect(controller.density).toBe(2);
  });

  it('restarts at the ceiling when the range changes', () => {
    const controller = new DynamicResolution(renderRange('medium', 'auto', 2));
    run(controller, 300, frame(50));
    controller.reset(renderRange('high', 'auto', 2));
    expect(controller.density).toBe(1.5);
  });
});
