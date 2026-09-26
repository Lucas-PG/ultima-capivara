import type { WeaponId } from './types';
import { WEAPONS } from './weapons';

export const smoothPose = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const phase = (t: number, start: number, end: number) => smoothPose((t - start) / (end - start));
const pulse = (t: number, start: number, peak: number, end: number) => phase(t, start, peak) * (1 - phase(t, peak, end));

// The 35 ms contact pause still fits inside the authoritative 500 ms cadence.
export const MELEE_SECONDS = .46;
export const MELEE_CONTACT = .135;
export const MELEE_HIT_STOP = .035;
export const weaponShotDuration = (id: WeaponId) => id === 'machete' ? MELEE_SECONDS :
  id === 'shotgun' ? .42 : id === 'sniper' ? .58 : Math.min(.16, 60 / WEAPONS[id].rpm * .8);
export interface MeleePose { x: number; y: number; z: number; pitch: number; yaw: number; roll: number; smear: number; kick: number }
export function sampleMelee(seconds: number, side: number, out: MeleePose): MeleePose {
  const t = Math.max(0, seconds);
  const wind = phase(t, 0, .085), cut = phase(t, .085, .18), follow = phase(t, .18, .245), recover = 1 - phase(t, .245, MELEE_SECONDS);
  out.x = side * (.09 * wind - .29 * cut - .025 * follow) * recover;
  out.y = (.07 * wind - .10 * cut - .02 * follow) * recover;
  out.z = (.035 * wind - .09 * cut) * recover;
  out.pitch = (-.28 * wind + .56 * cut + .06 * follow) * recover;
  out.yaw = side * (-.36 * wind + 1.0 * cut + .08 * follow) * recover;
  out.roll = side * (-.45 * wind + 1.32 * cut + .12 * follow) * recover;
  out.smear = pulse(t, .09, .132, .19);
  out.kick = pulse(t, .11, .17, .29);
  return out;
}
