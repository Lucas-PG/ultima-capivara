import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdingFixture } from '../tools/qa/fp-state-node';
import { VIEW_SPECS } from '../src/render/viewmodel-specs';
// @ts-expect-error Standalone browser/Node audit uses the same actual skinned mesh.
import { holdingMetrics } from '../tools/qa/holding-metrics.mjs';
// @ts-expect-error The numerical probe runs unchanged in the browser and Node.
import { measureGrip } from '../tools/qa/grip-measure.mjs';

describe('shipped SMG carrying skin', () => {
  let fixture: Awaited<ReturnType<typeof holdingFixture>>;
  beforeAll(async () => { fixture = await holdingFixture(); });
  afterAll(() => fixture.dispose());
  it('keeps the shipped default pose exact and bounds axial rotation to the index knuckle', () => {
    fixture.pose('smg', 'hip', 0);
    const arm = (fixture.view as any).arms.right;
    const pose = VIEW_SPECS.smg.grips.R.curl;
    const bones = arm.paw.fingers;
    const snapshot = () => Object.fromEntries(Object.entries(bones).map(([digit, chain]) =>
      [digit, (chain as any[]).map(({ bone }) => bone.quaternion.toArray())]));
    arm.paw.apply(pose); const original = snapshot();
    arm.paw.apply({ ...pose, indexRoll: 0 }); expect(snapshot()).toEqual(original);
    arm.paw.apply({ ...pose, indexRoll: .65 }); const rolled = snapshot();
    expect(rolled.index[0]).not.toEqual(original.index[0]);
    expect(rolled.index.slice(1)).toEqual(original.index.slice(1));
    for (const digit of ['middle', 'ring', 'thumb']) expect(rolled[digit]).toEqual(original[digit]);
    arm.paw.apply({ ...pose, indexRoll: 10 }); expect(snapshot()).toEqual(rolled);
    arm.paw.apply(pose);
  });
  it('aggregates the same actual palm and wrapping skin as isolated region scans', () => {
    fixture.pose('smg', 'hip', 0);
    const scan = measureGrip(['smg', 'L', false, { surface: 'body' }]);
    for (const region of ['palm', 'wrap'])
      expect(scan.regions[region]).toBe(measureGrip(['smg', 'L', false, { surface: 'body', region }]).worst);
  }, 30_000);
  it.each([['hip', 0], ['fire', .001], ['sprint', .6]] as const)('holds its surfaces through %s', async (action, t) => {
    const pose = fixture.pose('smg', action, t);
    const row = await holdingMetrics('smg', { action, t }, pose, measureGrip);
    expect(row.failures).toEqual([]);
    expect(row.contacts.R.surface).toBe('body');
    expect(row.contacts.L.surface).toBe('body');
    if (action !== 'sprint') expect(row.trigger.insideGuard).toBe(true);
  }, 30_000);
});
