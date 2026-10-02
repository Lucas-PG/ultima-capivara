import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdingFixture } from '../tools/qa/fp-state-node';
// @ts-expect-error The audit deforms the same shipped skin as the browser.
import { measureGrip } from '../tools/qa/grip-measure.mjs';

describe('trigger withdrawal through authored grip-key transitions', () => {
  let fixture: Awaited<ReturnType<typeof holdingFixture>>;
  beforeAll(async () => { fixture = await holdingFixture(); }, 120_000);
  afterAll(() => fixture?.dispose());

  it('keeps the sniper index clear while inspect leaves and returns to its ready grip', () => {
    // Both transitions cross intermediate route knots. Checking only the ready
    // and indexed endpoints misses the straight blend through the trigger guard.
    for (const t of [0, .02, .05, .075, .09, .1, .12, .15, .2, .25, .4, .7,
      1.2, 1.55, 1.62, 1.65, 1.67, 1.7, 1.72, 1.75, 1.78, 1.8]) {
      const pose = fixture.pose('sniper', 'inspect', t);
      expect(pose.active).toBe('sniper');
      const index = measureGrip(['sniper', 'R', false, { bones: ['index1', 'index2', 'index3'] }]);
      expect(index.worst, `inspect ${t}s: ${JSON.stringify(index.summary)}`).toBeGreaterThanOrEqual(-.5);
    }
  }, 60_000);
});
