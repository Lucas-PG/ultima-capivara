import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdingFixture } from '../tools/qa/fp-state-node';
// @ts-expect-error Shared exact-skin browser and Node audit.
import { measureGrip } from '../tools/qa/grip-measure.mjs';
// @ts-expect-error Shared carrying, whole-skin and wrist contract.
import { holdingMetrics } from '../tools/qa/holding-metrics.mjs';

let fixture: Awaited<ReturnType<typeof holdingFixture>>;
beforeAll(async () => { fixture = await holdingFixture(); }, 120_000);
afterAll(() => fixture?.dispose());

describe('Doze shell transfer and loading', () => {
  it.each([.159501, .164, .165, .166, .1705, .175, .1815, .19525, .2, .20075, .202, .203, .209, .213, .2145, .215, .22, .22275, .225, .2365, .25])(
    'keeps real shell contact while transferring the pinch at %s seconds', async t => {
      const pose = fixture.pose('shotgun', 'reload', t);
      const row = await holdingMetrics('shotgun', { action: 'reload', t }, pose, measureGrip);
      expect(row.contacts.L?.surface).toBe('mag');
      expect(row.failures).toEqual([]);
    });

  it.each([.264, .286, .308, .341, .36575, .385, .407])(
    'pushes the brass case head with the thumb at %s seconds', async t => {
      const pose = fixture.pose('shotgun', 'reload', t);
      const row = await holdingMetrics('shotgun', { action: 'reload', t }, pose, measureGrip);
      expect(row.contacts.L?.surface).toBe('mag');
      expect(row.failures).toEqual([]);
      const head = measureGrip(['shotgun', 'L', false, {
        surface: 'mag', bones: ['thumb2', 'thumb3'], normal: [0, 0, 1], minNormalDot: .6,
      }]);
      expect(head.nearestSurfaceDistance).toBeLessThanOrEqual(1.5);
    });

  it.each([.001, .003, .005, .008, .012, .02, .4075, .408, .41, .412, .415, .418, .425])(
    'releases the pump or loaded shell without crossing its surface at %s seconds', async t => {
      const pose = fixture.pose('shotgun', 'reload', t);
      const row = await holdingMetrics('shotgun', { action: 'reload', t }, pose, measureGrip);
      expect(row.failures).toEqual([]);
    });
});
