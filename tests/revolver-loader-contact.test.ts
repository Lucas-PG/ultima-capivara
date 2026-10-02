import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdingFixture } from '../tools/qa/fp-state-node';
// @ts-expect-error Shared browser and Node actual-skin probe.
import { measureGrip } from '../tools/qa/grip-measure.mjs';
// @ts-expect-error Shared physical acceptance contract.
import { holdingMetrics } from '../tools/qa/holding-metrics.mjs';

let fixture: Awaited<ReturnType<typeof holdingFixture>>;
beforeAll(async () => { fixture = await holdingFixture(); }, 120_000);
afterAll(() => fixture?.dispose());

describe('revolver speedloader hold', () => {
  for (const action of ['reload', 'reload-partial']) it.each([.49, .55, .60, .64, .675, .676, .70, .73, .77])(
    `${action} phase %s keeps the palm and wrapping digits on the loader`, async phase => {
      const state = { action, t: phase * 2.3 + 1e-6 };
      const pose = fixture.pose('revolver', action, state.t);
      expect(pose.contacts.L).toBe('mag');
      expect(pose.contacts.R).toBe('body');
      const row = await holdingMetrics('revolver', state, pose, measureGrip);
      expect(row.failures).toEqual([]);
      for (const region of ['palm', 'wrap']) {
        const contact = measureGrip(['revolver', 'L', false, { surface: 'mag', region }]);
        expect(contact.worst, `${region} overlap`).toBeGreaterThanOrEqual(-.5);
        expect(contact.worst, `${region} separation`).toBeLessThanOrEqual(1.5);
      }
    }, 30_000);
});

describe('revolver speedloader acquisition and return', () => {
  for (const action of ['reload', 'reload-partial']) it.each([.455, .475, .79, .807])(
    `${action} phase %s clears the gun and carrying paw`, async phase => {
      const state = { action, t: phase * 2.3 };
      const pose = fixture.pose('revolver', action, state.t);
      const row = await holdingMetrics('revolver', state, pose, measureGrip);
      expect(pose.active).toBe('revolver');
      expect(row.failures).toEqual([]);
    }, 30_000);
});
