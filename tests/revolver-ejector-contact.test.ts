import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdingFixture } from '../tools/qa/fp-state-node';
// @ts-expect-error Shared browser and Node actual-skin probe.
import { measureGrip } from '../tools/qa/grip-measure.mjs';
// @ts-expect-error Shared physical acceptance contract.
import { holdingMetrics } from '../tools/qa/holding-metrics.mjs';

let fixture: Awaited<ReturnType<typeof holdingFixture>>;
beforeAll(async () => { fixture = await holdingFixture(); }, 120_000);
afterAll(() => fixture?.dispose());

describe('revolver ejector palm press', () => {
  for (const action of ['reload', 'reload-partial']) it.each([.28, .30, .32, .35])(`${action} phase %s presses the actual rod front cap`, async phase => {
    const state = { action, t: phase * 2.3 + 1e-6 };
    const pose = fixture.pose('revolver', action, state.t);
    expect(pose.contacts.L).toBe('action');
    const row = await holdingMetrics('revolver', state, pose, measureGrip);
    expect(row.failures).toEqual([]);
    const palm = measureGrip(['revolver', 'L', false, { surface: 'action', region: 'palm' }]);
    expect(palm.worst).toBeGreaterThanOrEqual(-.5);
    expect(palm.worst).toBeLessThanOrEqual(1.5);
    const front = measureGrip(['revolver', 'L', false, { surface: 'action', region: 'palm', normal: [0, 0, -1], minNormalDot: .95 }]);
    expect(front.nearestSurfaceDistance).toBeGreaterThanOrEqual(0);
    expect(front.nearestSurfaceDistance).toBeLessThanOrEqual(1.5);
    // The cap is 71 mm in front of the action pivot; the star behind the drum is not a pressing surface.
    const view = fixture.view as any;
    const rodZ = view.models.revolver.parts.action.position.z;
    expect(front.summary.hand.surfaceAt[2]).toBeCloseTo((rodZ - .071) * 1000, 2);
  }, 30_000);
});

describe('revolver ejector approach and withdrawal', () => {
  for (const action of ['reload', 'reload-partial']) it.each([.245, .255, .27, .351, .355, .36, .365, .375, .385, .39])(
    `${action} phase %s clears the rod and falling cartridges`, async phase => {
      const state = { action, t: phase * 2.3 };
      const pose = fixture.pose('revolver', action, state.t);
      const row = await holdingMetrics('revolver', state, pose, measureGrip);
      expect(pose.active).toBe('revolver');
      expect(pose.contacts.R).toBe('body');
      expect(row.failures).toEqual([]);
    }, 30_000);
});
