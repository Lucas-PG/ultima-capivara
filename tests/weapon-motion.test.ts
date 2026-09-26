import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../src/shared/weapons';
import { sampleMelee, smoothPose,
  MELEE_SECONDS, MELEE_HIT_STOP, MELEE_CONTACT, weaponShotDuration, type MeleePose } from '../src/shared/weapon-presentation';
import type { WeaponId } from '../src/shared/types';

const reloadable = (Object.keys(WEAPONS) as WeaponId[]).filter(id => WEAPONS[id].reload > 0);
const melee = (time: number, side = 1) => sampleMelee(time, side, {} as MeleePose);

describe('physical first-person action timing', () => {
  it('closes every firearm action before the next legal shot instead of resetting an open bolt mid-cycle', () => {
    for (const id of reloadable) expect(weaponShotDuration(id)).toBeLessThan(60 / WEAPONS[id].rpm);
  });
  it('winds up opposite the fast cut, follows through, then settles within the attack cadence even on a hit', () => {
    expect(melee(.08).x).toBeGreaterThan(0);
    expect(melee(.18).x).toBeLessThan(0);
    expect(melee(.24).x).toBeLessThan(melee(.18).x);
    expect(melee(MELEE_CONTACT).smear).toBeGreaterThan(.8);
    expect(melee(.3).smear).toBe(0);
    expect(MELEE_SECONDS + MELEE_HIT_STOP).toBeLessThanOrEqual(60 / WEAPONS.machete.rpm);
    expect(Object.values(melee(0)).every(value => value === 0)).toBe(true);
    expect(Object.values(melee(MELEE_SECONDS)).every(value => value === 0)).toBe(true);
    for (const t of [.04, .1, .16, .23, .36]) {
      const left = melee(t, -1), right = melee(t, 1);
      expect(left.x).toBe(-right.x); expect(left.yaw).toBe(-right.yaw); expect(left.roll).toBe(-right.roll);
    }
    expect(smoothPose(.001)).toBeLessThan(.0000001);
    expect(1 - smoothPose(.999)).toBeLessThan(.0000001);
  });
});
