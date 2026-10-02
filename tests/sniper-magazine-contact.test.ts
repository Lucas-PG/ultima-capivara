import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEAPONS } from '../src/shared/weapons';
import { holdingFixture } from '../tools/qa/fp-state-node';
// @ts-expect-error Shared browser and Node audit of the shipped skin.
import { holdingMetrics } from '../tools/qa/holding-metrics.mjs';
// @ts-expect-error Geometry probe uses the actual deformed paw vertices.
import { measureGrip } from '../tools/qa/grip-measure.mjs';

describe('sniper magazine palm and wrapping digits', () => {
  let fixture: Awaited<ReturnType<typeof holdingFixture>>;
  beforeAll(async () => { fixture = await holdingFixture(); }, 120_000);
  afterAll(() => fixture.dispose());

  for (const empty of [true, false]) for (const phase of [.15, .2, .32, .42, .53, .68, .78]) {
    it(`${empty ? 'empty' : 'tactical'} swap retains actual magazine contact at ${phase}`, async () => {
      const start = empty ? .33 : .09, end = empty ? .82 : .89;
      const state = { action: empty ? 'reload' : 'reload-partial', t: (start + (end - start) * phase) * WEAPONS.sniper.reload + 1e-6 };
      const pose = fixture.pose('sniper', state.action, state.t);
      const row = await holdingMetrics('sniper', state, pose, measureGrip);
      expect(pose.contacts.L, 'the support paw stays attached to the moving magazine').toBe('mag');
      expect(row.failures, JSON.stringify(row.failures)).toEqual([]);
      const contact = measureGrip(['sniper', 'L', false, { surface: 'mag' }]);
      for (const region of ['palm', 'wrap']) {
        expect(contact.regions[region], `${region} penetration`).toBeGreaterThanOrEqual(-.5);
        expect(contact.regions[region], `${region} contact`).toBeLessThanOrEqual(1.5);
      }
    }, 30_000);
  }

  for (const [action, t] of [['sprint', .4], ['sprint', .5], ['reload', .99], ['reload', 1],
    ['reload-partial', .1], ['reload-partial', .2], ['reload-partial', .25], ['reload-partial', 2.6], ['reload-partial', 2.65]] as const) {
    it(`${action} ${t}s clears the stock and the released support paw`, async () => {
      const state = { action, t }, pose = fixture.pose('sniper', action, t);
      const row = await holdingMetrics('sniper', state, pose, measureGrip);
      expect(row.failures, JSON.stringify(row.failures)).toEqual([]);
      expect(pose.contacts.R, 'the firing palm carries the rifle through the support release').toBe('body');
      if (action !== 'sprint') expect(pose.contacts.L, 'the moving support paw has released the fore-end').toBeNull();
    }, 30_000);
  }
});
