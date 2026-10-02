import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdingFixture } from '../tools/qa/fp-state-node';
// @ts-expect-error Standalone browser/Node audit uses the same actual skinned mesh.
import { holdingMetrics } from '../tools/qa/holding-metrics.mjs';
// @ts-expect-error The numerical probe runs unchanged in the browser and Node.
import { measureGrip } from '../tools/qa/grip-measure.mjs';

describe('shipped SMG carrying skin', () => {
  let fixture: Awaited<ReturnType<typeof holdingFixture>>;
  beforeAll(async () => { fixture = await holdingFixture(); });
  afterAll(() => fixture.dispose());
  it.each([['hip', 0], ['fire', .001], ['sprint', .6]] as const)('holds its surfaces through %s', async (action, t) => {
    const pose = fixture.pose('smg', action, t);
    const row = await holdingMetrics('smg', { action, t }, pose, measureGrip);
    expect(row.failures).toEqual([]);
    expect(row.contacts.R.surface).toBe('body');
    expect(row.contacts.L.surface).toBe('body');
    if (action !== 'sprint') expect(row.trigger.insideGuard).toBe(true);
  }, 30_000);
});
