import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdingFixture } from '../tools/qa/fp-state-node';
import { WEAPONS } from '../src/shared/weapons';
// @ts-expect-error The browser and Node audits share actual skinned geometry.
import { measureGrip } from '../tools/qa/grip-measure.mjs';

describe('moving rifle magazines', () => {
  let fixture: Awaited<ReturnType<typeof holdingFixture>>;
  beforeAll(async () => { fixture = await holdingFixture(); });
  afterAll(() => fixture.dispose());
  const phases = [.17, .20, .30, .40, .50, .60, .67, .70];
  const cases = (['m4', 'dmr'] as const).flatMap(weapon => (['reload', 'reload-partial'] as const).flatMap(action =>
    phases.map(phase => ({ weapon, action, phase: weapon === 'dmr' && action === 'reload' ? phase * .86 : phase }))));
  it.each(cases)('$weapon $action at $phase keeps the palm and fingers on the moving magazine', ({ weapon, action, phase }) => {
    // Sample immediately after the key so a floating-point phase just below a
    // magazine reveal does not intentionally measure its hidden predecessor.
    const pose = fixture.pose(weapon, action, phase * WEAPONS[weapon].reload + 1e-6);
    const skin = measureGrip([weapon, 'L']);
    const contact = measureGrip([weapon, 'L', false, { surface: 'mag' }]);
    expect(pose.contacts.L).toBe('mag');
    expect(skin.worst).toBeGreaterThanOrEqual(-.5);
    for (const gap of [contact.worst, contact.regions.palm, contact.regions.wrap]) {
      expect(gap).toBeGreaterThanOrEqual(-.5);
      expect(gap).toBeLessThanOrEqual(1.5);
    }
    const wrist = pose.wrists.L!;
    expect(Math.abs(wrist.flexion)).toBeLessThanOrEqual(45.01);
    expect(wrist.deviation).toBeGreaterThanOrEqual(-25.01);
    expect(wrist.deviation).toBeLessThanOrEqual(20.01);
    expect(Math.abs(wrist.pronation)).toBeLessThanOrEqual(80.01);
  }, 30_000);
});
