import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEAPONS } from '../src/shared/weapons';
import { holdingFixture } from '../tools/qa/fp-state-node';
// @ts-expect-error Shared browser and Node audit of the shipped skin.
import { holdingMetrics } from '../tools/qa/holding-metrics.mjs';
// @ts-expect-error Geometry probe uses the actual deformed paw vertices.
import { measureGrip } from '../tools/qa/grip-measure.mjs';

describe('Carabina charging handle stroke', () => {
  let fixture: Awaited<ReturnType<typeof holdingFixture>>;
  beforeAll(async () => { fixture = await holdingFixture(); }, 120_000);
  afterAll(() => fixture.dispose());

  for (const phase of [.80, .815, .825, .83, .86, .89, .90, .915, .922, .935, .955, .98, .993, 1]) {
    it(`clears the receiver and carries the real handle at ${phase}`, async () => {
      const state = { action: 'reload', t: phase * WEAPONS.dmr.reload + 1e-6 };
      const pose = fixture.pose('dmr', state.action, state.t);
      const row = await holdingMetrics('dmr', state, pose, measureGrip);
      expect(row.failures, JSON.stringify(row.failures)).toEqual([]);
      expect(pose.contacts.L, 'support paw carries the fore-end throughout charging').toBe('body');
      if (phase >= .83 && phase <= .915) {
        expect(pose.contacts.R, 'the firing paw follows the moving handle').toBe('charge');
        expect(row.contacts.R.gap).toBeGreaterThanOrEqual(-.5);
        expect(row.contacts.R.gap).toBeLessThanOrEqual(1.5);
      }
    }, 30_000);
  }
});
