import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdingFixture } from '../tools/qa/fp-state-node';
// @ts-expect-error Shared exact-skin browser and Node audit.
import { measureGrip } from '../tools/qa/grip-measure.mjs';
// @ts-expect-error Shared carrying, whole-skin and wrist contract.
import { holdingMetrics } from '../tools/qa/holding-metrics.mjs';

let fixture: Awaited<ReturnType<typeof holdingFixture>>;
beforeAll(async () => { fixture = await holdingFixture(); }, 120_000);
afterAll(() => fixture?.dispose());

describe('pistol moving contacts', () => {
  it.each([.175, .2, .225, .25, .275, .3])('keeps the joined cup clear through draw at %s seconds', async t => {
    const pose = fixture.pose('pistol', 'draw', t);
    const row = await holdingMetrics('pistol', { action: 'draw', t }, pose, measureGrip);
    expect(pose.active).toBe('pistol');
    expect(row.contacts.R?.surface).toBe('body');
    expect(row.contacts.L?.surface).toBe('paw');
    expect(row.failures).toEqual([]);
  });

  for (const action of ['sprint', 'inspect']) {
    it.each([.01, .02, .025, .03, .04, .05, .065, .075, .1, .125, .15])(
      `${action} releases the support cup without crossing the carrying paw at %s seconds`, async t => {
        const pose = fixture.pose('pistol', action, t);
        const row = await holdingMetrics('pistol', { action, t }, pose, measureGrip);
        expect(row.failures).toEqual([]);
      });
  }

  for (const action of ['reload', 'reload-partial']) {
    it.each([.025, .03, .035, .04, .05, .11, .135, .16, .2, .25, .28, .3, .32, .35, 1.125, 1.15, 1.175, 1.2, 1.35, 1.38, 1.4, 1.42, 1.46, 1.49, 1.68, 1.71, 1.745, 1.76])(
      `${action} keeps the carrying digits outside the moving magazine at %s seconds`, async t => {
        const pose = fixture.pose('pistol', action, t);
        const row = await holdingMetrics('pistol', { action, t }, pose, measureGrip);
        expect(pose.active).toBe('pistol');
        expect(row.contacts.R?.surface).toBe('body');
        expect(row.failures).toEqual([]);
      });
  }
});
