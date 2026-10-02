import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdingFixture } from '../tools/qa/fp-state-node';
// @ts-expect-error Shared browser and Node audit of the shipped skin.
import { holdingMetrics } from '../tools/qa/holding-metrics.mjs';
// @ts-expect-error Geometry probe uses the actual deformed paw vertices.
import { measureGrip } from '../tools/qa/grip-measure.mjs';

describe('sniper bolt entry, exit and safe index return', () => {
  let fixture: Awaited<ReturnType<typeof holdingFixture>>;
  beforeAll(async () => { fixture = await holdingFixture(); }, 120_000);
  afterAll(() => fixture.dispose());

  const states = [
    ...[0, .004, .01, .01425, .02, .17, .18, .19, .2, .32, .5, .81, .825, .93, .938, .945, .95]
      .map(t => ({ action: 'fire', t })),
    ...[.034, .34, .35, .7, 2.54, 2.55, 2.57, 2.58, 2.59, 2.63, 2.64, 2.65, 2.7, 2.89, 2.904, 2.98, 2.995]
      .map(t => ({ action: 'reload', t })),
  ];
  for (const state of states) it(`${state.action} ${state.t}s keeps actual skin clear`, async () => {
    const pose = fixture.pose('sniper', state.action, state.t);
    const row = await holdingMetrics('sniper', state, pose, measureGrip);
    expect(row.failures, JSON.stringify(row.failures)).toEqual([]);
    expect(pose.contacts.L, 'the support paw carries the fore-end during bolt manipulation').toBe('body');
    if (state.action === 'fire' && [0, .95].includes(state.t)) {
      expect(pose.contacts.trigger, 'ready and immediate fire keep the index on the trigger').toBe(true);
      expect(row.trigger.insideGuard).toBe(true);
    }
    if (state.action === 'fire' && [.01, .938, .945].includes(state.t)) {
      expect(pose.contacts.R, 'withdrawing only the index retains the carrying palm').toBe('body');
      expect(pose.contacts.trigger, 'the indexed digit does not claim firing contact').toBe(false);
    }
  }, 30_000);
});
