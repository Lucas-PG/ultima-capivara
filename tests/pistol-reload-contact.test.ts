import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdingFixture } from '../tools/qa/fp-state-node';
// @ts-expect-error Shared browser and Node exact-skin probe.
import { measureGrip } from '../tools/qa/grip-measure.mjs';

let fixture: Awaited<ReturnType<typeof holdingFixture>>;
beforeAll(async () => { fixture = await holdingFixture(); });
afterAll(() => fixture?.dispose());

describe('pistol magazine palm seat', () => {
  const samples = [
    ...[.55, .62, .67, .71].map(t => ['reload', t] as const),
    ...[.14, .23, .30, .43, .55, .62, .67, .71].map(t => ['reload-partial', t] as const),
  ];
  it.each(samples)('%s at %s keeps the palm on the magazine without passing through the gun', (action, phase) => {
    const pose = fixture.pose('pistol', action, phase * 1.8);
    const skin = measureGrip(['pistol', 'L']);
    const palm = measureGrip(['pistol', 'L', false, { surface: 'mag', region: 'palm' }]);
    expect(skin.worst).toBeGreaterThanOrEqual(-.5);
    expect(palm.worst).toBeGreaterThanOrEqual(-.5);
    expect(palm.worst).toBeLessThanOrEqual(1.5);
    const wrist = pose.wrists.L;
    expect(wrist).toBeTruthy();
    expect(Math.abs(wrist!.flexion)).toBeLessThanOrEqual(45);
    expect(wrist!.deviation).toBeGreaterThanOrEqual(-25);
    expect(wrist!.deviation).toBeLessThanOrEqual(20);
    expect(Math.abs(wrist!.pronation)).toBeLessThanOrEqual(80);
  });
});
