import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdingFixture } from '../tools/qa/fp-state-node';
import { heldCurl, VIEW_SPECS } from '../src/render/viewmodel-specs';
// @ts-expect-error The audit runs unchanged against the shipped Node/browser skin.
import { measureGrip } from '../tools/qa/grip-measure.mjs';
// @ts-expect-error Contact bounds match the dense holding audit.
import { holdingMetrics } from '../tools/qa/holding-metrics.mjs';
// @ts-expect-error The occupancy check reads every real index skin vertex.
import { indexGuardOccupancy } from '../tools/qa/index-skin.mjs';
// @ts-expect-error QA opening is copied from the existing guard cutter.
import { triggerInGuard } from '../tools/qa/trigger-guard.mjs';

describe('M4 trigger withdrawal and return', () => {
  let fixture: Awaited<ReturnType<typeof holdingFixture>>;
  beforeAll(async () => { fixture = await holdingFixture(); }, 120_000);
  afterAll(() => fixture?.dispose());
  const grip = VIEW_SPECS.m4.grips.R;

  it('clears the actual digit along the measured route, including a pulled-trigger departure', () => {
    fixture.pose('m4', 'hip', 0);
    const arms = (fixture.view as any).arms;
    expect(grip.indexExit?.length, 'a measured withdrawal route is present').toBeGreaterThan(0);
    const segments = grip.indexExit!.length + 1;
    for (const pull of [0, 1]) {
      fixture.pose('m4', pull ? 'fire' : 'hip', 0);
      // A shot also moves the real trigger mesh. Audit both configurations
      // along the route; its return traverses those same skinned poses.
      for (let segment = 0; segment < segments; segment++) {
        const a = heldCurl(grip, segment / segments, pull);
        const b = heldCurl(grip, (segment + 1) / segments, pull);
        const length = Math.hypot(...a.index.map((x, i) => b.index[i] - x),
          (b.indexSpread ?? 0) - (a.indexSpread ?? 0), (b.indexRoll ?? 0) - (a.indexRoll ?? 0));
        const steps = Math.max(4, Math.ceil(length / .012));
        for (let step = 0; step <= steps; step++) {
          const u = (segment + step / steps) / segments;
          arms.right.paw.apply(heldCurl(grip, u, pull));
          arms.group.updateMatrixWorld(true);
          const row = measureGrip(['m4', 'R', false, { bones: ['index1', 'index2', 'index3'] }]);
          expect(row.worst, `pull ${pull}, route ${u}: ${JSON.stringify(row.summary)}`).toBeGreaterThanOrEqual(-.5);
        }
      }
    }
    arms.right.paw.apply(heldCurl(grip, 1));
    expect(indexGuardOccupancy('m4').inside, 'every index skin vertex has left the opening').toBe(0);
    arms.right.paw.apply(heldCurl(grip, 0));
    expect(indexGuardOccupancy('m4').inside, 'the digit returns into the opening').toBeGreaterThan(0);
  }, 120_000);

  it('does not mistake an outside distal centroid for a fully withdrawn digit', () => {
    fixture.pose('m4', 'hip', 0);
    const arms = (fixture.view as any).arms;
    arms.right.paw.apply({ ...grip.curl,
      index: [.31604077821022114, .32035520905648573, .14876508327009536],
      indexSpread: -.022268459633471786, indexRoll: .06784888207490607, indexPad: .96 });
    arms.group.updateMatrixWorld(true);
    const row = measureGrip(['m4', 'R', false, { bones: ['index1', 'index2', 'index3'] }]);
    expect(triggerInGuard('m4', row.digits.index.tip)).toBe(false);
    expect(indexGuardOccupancy('m4').inside).toBeGreaterThan(0);
  });

  it.each([
    ['hip', 0, true], ['fire', 0, true], ['sprint', .6, false],
    ['reload', .15, false], ['reload', 1.2, false], ['reload-partial', 1.2, false],
    ['inspect', .12, false], ['inspect', 1.3, false], ['inspect', 1.81, true],
  ] as const)('preserves whole-paw contact in %s at %ss', async (action, t, ready) => {
    const pose = fixture.pose('m4', action, t);
    const row = await holdingMetrics('m4', { action, t }, pose, measureGrip);
    expect(row.failures).toEqual([]);
    if (ready) {
      expect(row.trigger.insideGuard).toBe(true);
      expect(row.trigger.frontDistance).toBeLessThanOrEqual(1.5);
    } else {
      expect(pose.contacts.trigger).toBe(false);
      expect(indexGuardOccupancy('m4').inside).toBe(0);
    }
  }, 30_000);

  it('follows the route while authored inspect keys leave and return to ready', () => {
    for (const t of [.015, .025, .04, .055, .075, .09, .105, 1.625, 1.645, 1.665, 1.685, 1.705, 1.725, 1.745]) {
      fixture.pose('m4', 'inspect', t);
      const row = measureGrip(['m4', 'R', false, { bones: ['index1', 'index2', 'index3'] }]);
      expect(row.worst, `inspect ${t}s`).toBeGreaterThanOrEqual(-.5);
    }
  }, 60_000);
});
