import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdingFixture } from '../tools/qa/fp-state-node';
import { WRIST_LIMITS } from '../src/render/viewmodel-targets';
// @ts-expect-error The probe measures actual posed skin against the shipped meshes.
import { measureGrip } from '../tools/qa/grip-measure.mjs';
// @ts-expect-error Keep the same bounds as the complete holding audit.
import { holdingMetrics } from '../tools/qa/holding-metrics.mjs';

describe('M4 partial reload support-paw return', () => {
  let fixture: Awaited<ReturnType<typeof holdingFixture>>;
  beforeAll(async () => { fixture = await holdingFixture(); }, 120_000);
  afterAll(() => fixture?.dispose());

  it('clears the seated magazine between the authored return keys', async () => {
    // The former inward diagonal penetrated the seated magazine by 10.347 mm
    // here, halfway between samples in the original 50 ms audit.
    const state = { action: 'reload-partial', t: 2.075 };
    const pose = fixture.pose('m4', state.action, state.t);
    const row = await holdingMetrics('m4', state, pose, measureGrip);
    expect(row.failures).toEqual([]);
    expect(row.L).toBeGreaterThanOrEqual(-.5);
  }, 30_000);

  it.each([2.035, 2.05, 2.065, 2.085, 2.1, 2.115, 2.15, 2.175, 2.2])(
    'keeps the support skin and wrist clear at %ss', t => {
      const pose = fixture.pose('m4', 'reload-partial', t);
      const skin = measureGrip(['m4', 'L']);
      expect(skin.worst, JSON.stringify(skin.summary)).toBeGreaterThanOrEqual(-.5);
      expect(pose.wrists.L).not.toBeNull();
      for (const axis of ['flexion', 'deviation', 'pronation'] as const) {
        expect(pose.wrists.L![axis]).toBeGreaterThanOrEqual(WRIST_LIMITS[axis][0] - .01);
        expect(pose.wrists.L![axis]).toBeLessThanOrEqual(WRIST_LIMITS[axis][1] + .01);
      }
    }, 30_000,
  );
});
