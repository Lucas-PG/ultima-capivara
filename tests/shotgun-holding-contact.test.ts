import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdingFixture } from '../tools/qa/fp-state-node';
// @ts-expect-error Shared exact-skin browser and Node audit.
import { measureGrip } from '../tools/qa/grip-measure.mjs';
// @ts-expect-error Shared carrying, trigger, whole-skin and wrist contract.
import { holdingMetrics } from '../tools/qa/holding-metrics.mjs';

let fixture: Awaited<ReturnType<typeof holdingFixture>>;
beforeAll(async () => { fixture = await holdingFixture(); }, 120_000);
afterAll(() => fixture?.dispose());

const withdrawal = [
  ...[.175, .2, .225, .25, .275, .3, .35].map(t => ['draw', t] as const),
  ...[.0125, .025, .0375].map(t => ['holster', t] as const),
  ...[.01, .025, .05, .075, .1, 1.625, 1.65, 1.675, 1.7, 1.725, 1.745].map(t => ['inspect', t] as const),
  ...[.05, .1, .15, .3, .6].map(t => ['sprint', t] as const),
];

describe('Doze carrying contact through index withdrawal', () => {
  it.each(withdrawal)('%s at %s keeps the complete paw outside the guard', async (action, t) => {
    const pose = fixture.pose('shotgun', action, t);
    const row = await holdingMetrics('shotgun', { action, t }, pose, measureGrip);
    expect(pose.active).toBe('shotgun');
    expect(row.contacts.R?.surface).toBe('body');
    expect(row.contacts.L?.surface).toBe('pump');
    expect(row.failures).toEqual([]);
  });
});

describe('Doze pump stroke', () => {
  it.each([.125, .15, .175, .2, .225, .25, .275, .3, .325, .35, .45, .55])(
    'keeps the wrapped pump grip clear of the receiver at %s seconds', async t => {
      const pose = fixture.pose('shotgun', 'fire', t);
      const row = await holdingMetrics('shotgun', { action: 'fire', t }, pose, measureGrip);
      expect(row.contacts.L?.surface).toBe('pump');
      expect(row.failures).toEqual([]);
    });
});
