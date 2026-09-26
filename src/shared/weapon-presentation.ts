import type { WeaponId } from './types';
import { WEAPONS } from './weapons';

// Presentation only. Fractions scale to the authoritative reload duration,
// including each individual shotgun shell. Audio reads these same contacts.
export const RELOAD_CUES: Record<WeaponId, { grab: number; out: number; insert: number; seat: number; rack: number; close: number }> = {
  pistol: { grab: .13, out: .29, insert: .47, seat: .63, rack: .81, close: .9 },
  smg: { grab: .14, out: .3, insert: .45, seat: .61, rack: .79, close: .89 },
  m4: { grab: .16, out: .32, insert: .48, seat: .65, rack: .82, close: .91 },
  shotgun: { grab: .18, out: .32, insert: .4, seat: .68, rack: .78, close: .9 },
  dmr: { grab: .16, out: .32, insert: .49, seat: .65, rack: .82, close: .91 },
  sniper: { grab: .17, out: .34, insert: .49, seat: .64, rack: .81, close: .91 },
  machete: { grab: 0, out: 0, insert: 0, seat: 0, rack: 0, close: 0 },
  slingshot: { grab: .18, out: .35, insert: .4, seat: .66, rack: .77, close: .89 },
};

export const smoothPose = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const phase = (t: number, start: number, end: number) => smoothPose((t - start) / (end - start));
const pulse = (t: number, start: number, peak: number, end: number) => phase(t, start, peak) * (1 - phase(t, peak, end));
type Point = readonly [number, number, number];

// Authored palm centres, in the painted asset's Y-up, -Z-forward space.
export const SUPPORT_PALM: Record<WeaponId, Point> = {
  pistol: [-.067, -.178, .151], smg: [-.074, -.11, -.34], m4: [-.074, -.11, -.37],
  shotgun: [-.074, -.15, -.47], dmr: [-.074, -.11, -.4], sniper: [-.074, -.11, -.4],
  machete: [0, 0, 0], slingshot: [-.025, .045, .21],
};
const MAG_GRIP: Record<WeaponId, Point> = {
  pistol: [-.065, -.245, .12], smg: [-.074, -.29, -.12], m4: [-.074, -.29, -.12],
  // The shell finishes above the authored underside mouth (0, -.129, -.094).
  shotgun: [-.048, -.106, -.101], dmr: [-.074, -.29, -.12], sniper: [-.074, -.29, -.12],
  machete: [0, 0, 0], slingshot: [-.025, .045, .21],
};
const ACTION_GRIP: Record<WeaponId, Point> = {
  pistol: [-.080, .020, .075], smg: [.127, -.074, -.159], m4: [.127, -.074, -.159],
  shotgun: SUPPORT_PALM.shotgun, dmr: [.12, -.06, -.145], sniper: [.155, -.03, .063],
  machete: [0, 0, 0], slingshot: SUPPORT_PALM.slingshot,
};
export interface ReloadPose {
  mag: number; action: number; actionRoll: number;
  discardY: number; discardZ: number; discardRoll: number;
  hideMagazine: boolean; showDiscard: boolean;
  handX: number; handY: number; handZ: number; handRoll: number; handPitch: number;
  lift: number; forward: number; pitch: number; roll: number; bump: number; prop: number;
}
export const createReloadPose = (): ReloadPose => ({ mag: 0, action: 0, actionRoll: 0,
  discardY: 0, discardZ: 0, discardRoll: 0, hideMagazine: false, showDiscard: false,
  handX: 0, handY: 0, handZ: 0, handRoll: 0, handPitch: 0, lift: 0, forward: 0, pitch: 0, roll: 0, bump: 0, prop: 0 });

export function sampleReload(id: WeaponId, progress: number, out: ReloadPose): ReloadPose {
  const p = Math.max(0, Math.min(1, progress)), cue = RELOAD_CUES[id];
  if (id === 'machete' || p === 0 || p === 1) {
    Object.assign(out, createReloadPose());
    return out;
  }
  const shell = id === 'shotgun', pebble = id === 'slingshot', single = shell || pebble;
  const hold = phase(p, .015, cue.grab) * (1 - phase(p, cue.close, 1));
  const rack = pulse(p, cue.rack - .045, cue.rack, cue.close);
  const transfer = phase(p, cue.seat + .025, id === 'sniper' ? cue.seat + .065 : cue.rack - .06);
  const returnHand = 1 - phase(p, cue.close, 1);
  const grasp = phase(p, .015, cue.grab);
  const palm = SUPPORT_PALM[id], contact = MAG_GRIP[id], action = ACTION_GRIP[id];
  const oldTravel = id === 'pistol' ? .16 : .20;
  const oldOut = -oldTravel * phase(p, cue.grab, cue.out);
  const fetchAt = cue.out + .055, incoming = phase(p, fetchAt, cue.insert);
  const seating = phase(p, cue.insert, cue.seat);
  const dropTime = Math.max(0, (p - cue.out) * WEAPONS[id].reload);
  const discardEnd = cue.out + .45 / WEAPONS[id].reload;
  const discardReset = 1 - phase(p, Math.max(discardEnd, .68), .99);
  // The old magazine is its own visible object. The replacement waits below
  // the screen while the paw releases the old one and fetches the new one.
  out.mag = single ? 0 : -phase(p, .001, cue.grab) * ((.85 - oldTravel) * (1 - incoming) + oldTravel * (1 - seating));
  out.hideMagazine = !single && p < fetchAt;
  out.showDiscard = !single && p < discardEnd;
  out.discardY = single ? 0 : (oldOut - Math.min(1.3, dropTime * .4 + dropTime * dropTime * 5)) * discardReset;
  out.discardZ = single ? 0 : -Math.min(.12, dropTime * .3) * discardReset;
  out.discardRoll = single ? 0 : Math.min(.8, dropTime * 2) * discardReset;
  out.action = single ? 0 : rack * (id === 'sniper' ? .095 : id === 'pistol' ? .052 : .065);
  out.actionRoll = id === 'sniper' ? -.65 * pulse(p, cue.seat + .07, cue.rack - .045, cue.close) : 0;
  if (single) {
    // Fetch a shell/stone below the receiver, seat it, return to the pump/pouch.
    const fetch = pulse(p, .01, cue.out, cue.seat);
    out.handX = ((contact[0] - palm[0]) * grasp - fetch * .025) * returnHand;
    out.handY = ((contact[1] - palm[1]) * grasp - fetch * (shell ? .17 : .13)) * returnHand;
    out.handZ = ((contact[2] - palm[2]) * grasp + fetch * .09) * returnHand;
    out.handRoll = (shell ? -.28 : .12) * hold;
    out.handPitch = (shell ? .45 : .12) * hold;
    out.prop = phase(p, cue.grab, cue.out) * (1 - phase(p, cue.seat - .035, cue.seat));
  } else {
    // The bolt knob turns around the bore before being pulled. Keep the paw on
    // that moving contact rather than reaching its unturned rest position.
    const actionX = action[0] * Math.cos(out.actionRoll) - action[1] * Math.sin(out.actionRoll);
    const actionY = action[0] * Math.sin(out.actionRoll) + action[1] * Math.cos(out.actionRoll);
    out.handX = ((contact[0] - palm[0]) * grasp * (1 - transfer) + (actionX - palm[0]) * transfer) * returnHand;
    const fetch = phase(p, cue.out, fetchAt);
    const handMag = p < cue.out ? oldOut : oldOut * (1 - fetch) + out.mag * fetch;
    out.handY = (((contact[1] - palm[1]) * grasp + handMag) * (1 - transfer) + (actionY - palm[1]) * transfer) * returnHand;
    out.handZ = ((contact[2] - palm[2]) * grasp * (1 - transfer) + (action[2] - palm[2] + out.action) * transfer) * returnHand;
    out.handRoll = ((id === 'pistol' ? -.2 : -.12) * (1 - transfer) + (id === 'pistol' ? -.22 : .20) * transfer) * hold + out.actionRoll;
    // The authored forearm points back toward the camera in the resting grip.
    // Pivot it down at the palm while reaching the action, never translate the
    // entire sleeve into the lens. The palm contact itself remains fixed.
    out.handPitch = (id === 'pistol' ? .28 : .95) * transfer * returnHand;
    out.prop = 0;
  }
  out.bump = pulse(p, cue.seat - .025, cue.seat, cue.seat + .045);
  out.lift = hold * (shell ? .055 : id === 'pistol' ? .07 : pebble ? .05 : .075);
  out.forward = hold * (id === 'pistol' ? .14 : pebble ? .02 : .18);
  out.pitch = hold * (shell ? .04 : id === 'pistol' ? .055 : .035);
  out.roll = hold * (shell ? -.35 : id === 'pistol' ? -.30 : pebble ? -.12 : -.35);
  return out;
}

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
