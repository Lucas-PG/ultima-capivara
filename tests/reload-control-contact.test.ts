import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdingFixture } from '../tools/qa/fp-state-node';
import { WEAPONS } from '../src/shared/weapons';
// @ts-expect-error Shared exact-skin browser and Node probe.
import { measureGrip } from '../tools/qa/grip-measure.mjs';

describe('manipulating small weapon controls', () => {
  let fixture: Awaited<ReturnType<typeof holdingFixture>>;
  beforeAll(async () => { fixture = await holdingFixture(); });
  afterAll(() => fixture.dispose());
  const cases = [
    { weapon: 'm4' as const, action: 'reload', t: .77 * WEAPONS.m4.reload, side: 'L', part: 'mag', region: 'palm' },
    { weapon: 'm4' as const, action: 'reload', t: .86 * WEAPONS.m4.reload, side: 'L', part: 'release', region: 'palm' },
    ...[.805, .825, .845, .86].map(t => ({ weapon: 'smg' as const, action: 'reload', t: t * WEAPONS.smg.reload, side: 'L', part: 'charge', region: undefined })),
    ...[.12, .17, .23, .89, .935, .96].map(t => ({ weapon: 'sniper' as const, action: 'reload', t: t * WEAPONS.sniper.reload, side: 'R', part: 'bolt', region: undefined })),
    ...[.22, .34, .49, .56, .72, .84].map(t => ({ weapon: 'sniper' as const, action: 'fire', t: t * .95, side: 'R', part: 'bolt', region: undefined })),
  ];
  it.each(cases)('$weapon $action at $t stays on the moving $part', ({ weapon, action, t, side, part, region }) => {
    const pose = fixture.pose(weapon, action, t + 1e-6);
    expect(pose.contacts[side as 'L' | 'R']).toBe(part);
    const skin = measureGrip([weapon, side]);
    const contact = measureGrip([weapon, side, false, { surface: part, region }]);
    expect(skin.worst).toBeGreaterThanOrEqual(-.5);
    expect(contact.worst).toBeGreaterThanOrEqual(-.5);
    expect(contact.worst).toBeLessThanOrEqual(1.5);
    const wrist = pose.wrists[side as 'L' | 'R']!;
    expect(Math.abs(wrist.flexion)).toBeLessThanOrEqual(45.01);
    expect(wrist.deviation).toBeGreaterThanOrEqual(-25.01);
    expect(wrist.deviation).toBeLessThanOrEqual(20.01);
    expect(Math.abs(wrist.pronation)).toBeLessThanOrEqual(80.01);
  }, 30_000);
});
