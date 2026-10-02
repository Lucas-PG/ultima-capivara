import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdingFixture } from '../tools/qa/fp-state-node';
// @ts-expect-error Shared browser and Node audit of the shipped skin.
import { holdingMetrics } from '../tools/qa/holding-metrics.mjs';
// @ts-expect-error Geometry probe uses the actual deformed paw vertices.
import { measureGrip } from '../tools/qa/grip-measure.mjs';

describe('SMG charging-handle approach and withdrawal', () => {
  let fixture: Awaited<ReturnType<typeof holdingFixture>>;
  beforeAll(async () => { fixture = await holdingFixture(); }, 120_000);
  afterAll(() => fixture.dispose());

  for (const t of [1.55, 1.585, 1.59, 1.6, 1.61, 1.65, 1.655, 1.66, 1.69, 1.73, 1.75, 1.77]) {
    it(`clears the receiver and handle at ${t}s`, async () => {
      const state = { action: 'reload', t: t + 1e-6 }, pose = fixture.pose('smg', state.action, state.t);
      const row = await holdingMetrics('smg', state, pose, measureGrip);
      expect(row.failures, JSON.stringify(row.failures)).toEqual([]);
      expect(pose.contacts.R, 'the firing palm carries the weapon throughout the reach').toBe('body');
      if (t >= 1.61 && t <= 1.72) {
        expect(pose.contacts.L, 'the support paw physically pulls the moving handle').toBe('charge');
        expect(row.contacts.L.gap).toBeGreaterThanOrEqual(-.5);
        expect(row.contacts.L.gap).toBeLessThanOrEqual(1.5);
      } else expect(pose.contacts.L, 'the approach and release actually leave the handle').toBeNull();
    }, 30_000);
  }
});
