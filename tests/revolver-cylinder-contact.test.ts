import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdingFixture } from '../tools/qa/fp-state-node';
// @ts-expect-error Shared browser and Node actual-skin probe.
import { measureGrip } from '../tools/qa/grip-measure.mjs';
// @ts-expect-error Shared physical acceptance contract.
import { holdingMetrics } from '../tools/qa/holding-metrics.mjs';

let fixture: Awaited<ReturnType<typeof holdingFixture>>;
beforeAll(async () => { fixture = await holdingFixture(); }, 120_000);
afterAll(() => fixture?.dispose());

describe('revolver cylinder manipulation', () => {
  for (const action of ['reload', 'reload-partial']) it.each([.12, .125, .130988, .131333, .132408, .13316, .135, .135624, .13607, .15, .17, .835, .838249, .838402, .839371, .839715, .84, .840255, .840441, .85, .865, .88])(
    `${action} phase %s keeps the operating thumb on the drum`, async phase => {
      const state = { action, t: phase * 2.3 };
      const pose = fixture.pose('revolver', action, state.t);
      expect(pose.contacts.R).toBe('body');
      expect(pose.contacts.L, 'the moving cylinder is a real contact, not an exempt hand').toBe('cylinder');
      const row = await holdingMetrics('revolver', state, pose, measureGrip);
      expect(row.failures).toEqual([]);
      const thumb = measureGrip(['revolver', 'L', false, { surface: 'cylinder', bones: ['thumb2', 'thumb3'] }]);
      expect(thumb.worst).toBeGreaterThanOrEqual(-.5);
      expect(thumb.worst).toBeLessThanOrEqual(1.5);
      if (phase === .17 || phase === .835) for (const region of ['palm', 'wrap']) {
        const contact = measureGrip(['revolver', 'L', false, { surface: 'cylinder', region }]);
        expect(contact.worst, `open drum ${region} overlap`).toBeGreaterThanOrEqual(-.5);
        expect(contact.worst, `open drum ${region} separation`).toBeLessThanOrEqual(1.5);
      }
    }, 30_000);
});

describe('revolver cylinder release and support return', () => {
  for (const action of ['reload', 'reload-partial']) it.each([.10, .18, .825, .8875, .90, .95])(
    `${action} phase %s clears the barrel, drum, and carrying paw`, async phase => {
      const state = { action, t: phase * 2.3 };
      const pose = fixture.pose('revolver', action, state.t);
      const row = await holdingMetrics('revolver', state, pose, measureGrip);
      expect(pose.active).toBe('revolver');
      expect(row.failures).toEqual([]);
    }, 30_000);
});
