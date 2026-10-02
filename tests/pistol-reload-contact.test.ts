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

describe('pistol slide release', () => {
  it.each([.81, .825])('places the thumb on the actual release at %s', phase => {
    const pose = fixture.pose('pistol', 'reload', phase * 1.8);
    const skin = measureGrip(['pistol', 'L']);
    const thumb = measureGrip(['pistol', 'L', false, { surface: 'release', bones: ['thumb3'] }]);
    expect(skin.worst).toBeGreaterThanOrEqual(-.5);
    expect(thumb.worst).toBeGreaterThanOrEqual(-.5);
    expect(thumb.worst).toBeLessThanOrEqual(1.5);
    expect(Math.abs(pose.wrists.L!.flexion)).toBeLessThanOrEqual(45);
    expect(pose.wrists.L!.deviation).toBeGreaterThanOrEqual(-25);
    expect(pose.wrists.L!.deviation).toBeLessThanOrEqual(20);
    expect(Math.abs(pose.wrists.L!.pronation)).toBeLessThanOrEqual(80);
  });
});

describe('pistol support return', () => {
  it.each([['reload', 1.675], ['reload-partial', 1.6], ['reload-partial', 1.625]] as const)(
    '%s at %s approaches the firing paw from below without crossing it', (action, seconds) => {
      fixture.pose('pistol', action, seconds);
      expect(measureGrip(['pistol', 'L', true]).worst).toBeGreaterThanOrEqual(-.5);
      expect(measureGrip(['pistol', 'L']).worst).toBeGreaterThanOrEqual(-.5);
    });
});
