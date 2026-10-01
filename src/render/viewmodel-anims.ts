import type { WeaponId } from '../shared/types';
import type { HandCurl } from './fp-arms';
import type { Choreography, HandKey } from './viewmodel-choreo';

// Authored first-person reloads. Coordinates: gun offsets in camera space
// (x right, y up, z back; pitch up, yaw left, roll counter-clockwise), hands and
// parts in weapon space unless the key says 'view'.
const curl = (index: number[], middle: number[], ring: number[], thumb: number[]) =>
  ({ index, middle, ring, thumb }) as unknown as HandCurl;
const OPEN = curl([.25, .2, .15], [.3, .25, .15], [.35, .25, .2], [.15, .1, .05]);
const HOLD_MAG = curl([.9, .9, .6], [1.1, 1, .7], [1.2, 1.05, .75], [.6, .4, .3]);
const PINCH = curl([.7, .9, .7], [1.2, 1.1, .8], [1.3, 1.1, .8], [.9, .6, .4]);
type Vec = [number, number, number];
const add = (a: Vec, b: Vec, k = 1): Vec => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
// Approach and clearance keys sit at fixed offsets from their fitted contact key (in its own
// space), so a refit of the contact carries the whole reach with it.
const shift = (key: HandKey, d: Vec, extra: Partial<HandKey> = {}): HandKey => ({ ...key, ...extra, wrist: add(key.wrist as Vec, d) });

// The support paw remains in magazine space from acquisition through the palm seat.
const PISTOL_MAG_HAND: HandKey = { space: 'part', part: 'mag', wrist: [-0.075152, -0.145803, 0.032576],
  forward: [0.981206, 0.0706, -0.179583], palm: [-0.047567, 0.99044, 0.129481],
  curl: { index: [0.0945, 0.27144, 0.1269], middle: [0.18, 0.27, 0.135], ring: [0.225, 0.27, 0.135], thumb: [1.4, 0.477825, 0.043246], spread: 0.0865 } };
const PISTOL_MAG_CLEAR = shift(PISTOL_MAG_HAND, [0, -.039, 0]);
const PISTOL_MAG_OUTSIDE = shift(PISTOL_MAG_HAND, [-.108, -.039, 0]);
const PISTOL_CLEAR: HandKey = { space: 'grip', offset: [-.045, 0, 0] };
const PISTOL_RELEASE_HAND: HandKey = { space: 'part', part: 'release', wrist: [-0.061777, -0.050439, -0.044295],
  forward: [-0.231821, 0.531271, -0.814868], palm: [0.953346, -0.042433, -0.298881],
  curl: { index: [0.2088, 0.18, 0.135], middle: [0.2538, 0.225, 0.135], ring: [0.3312, 0.225, 0.18], thumb: [0.31749, 0.228741, 0.142476], spread: -0.1858 } };
const pistolSwap = (retain: boolean): Choreography => [
  { t: .035, L: PISTOL_CLEAR },
  { t: .04, R: { space: 'grip', curl: { index: [.06, .2, .1] } } },
  { t: .91, R: { space: 'grip', curl: { index: [.06, .2, .1] } } },
  { t: .99, R: { space: 'grip' } },
  { t: .08, p: [-.035, .018, .015], r: [.18, .12, -.32], ease: 'out' },
  { t: .075, L: { space: 'gun', wrist: [-.125, -.09, .09], forward: [.35, .12, -1], palm: [1, 0, .15], curl: OPEN } },
  { t: .105, L: retain ? PISTOL_MAG_OUTSIDE : undefined },
  { t: .12, L: retain ? PISTOL_MAG_CLEAR : undefined },
  { t: .14, L: retain ? PISTOL_MAG_HAND : undefined, mag: { out: 0 }, sfx: 'mag-out' },
  { t: .23, L: retain ? PISTOL_MAG_HAND : undefined, mag: { out: .14, p: [0, -.015, .01], r: [.1, 0, .12] }, ease: 'in' },
  { t: .31, L: retain ? PISTOL_MAG_HAND : undefined, mag: { visible: false, out: .25, p: [.02, -.22, .025], r: [.35, .1, .24] }, sfx: retain ? undefined : 'mag-drop' },
  { t: .30, L: retain ? PISTOL_MAG_HAND : { space: 'view', wrist: [-.20, -.46, .03], forward: [.75, .35, -.3], palm: [0, .75, .65], curl: HOLD_MAG } },
  { t: .38, p: [-.035, .018, .015], r: [.18, .12, -.32] },
  { t: .39, mag: { visible: false, out: .22, p: [-.035, -.13, .02], r: [0, 0, .18] }, L: PISTOL_MAG_HAND },
  { t: .42, mag: { out: .22, p: [-.035, -.13, .02], r: [0, 0, .18] }, L: PISTOL_MAG_HAND },
  { t: .55, mag: { out: .10, p: [-.012, 0, .004], r: [0, 0, .07] }, L: PISTOL_MAG_HAND, ease: 'out' },
  { t: .62, mag: { out: .018 }, L: PISTOL_MAG_HAND },
  { t: .67, mag: { out: 0 }, L: PISTOL_MAG_HAND, ease: 'snap', sfx: 'mag-in' },
  { t: .68, p: [-.036, .031, .018], r: [.21, .12, -.30], ease: 'snap' },
  { t: .71, L: PISTOL_MAG_HAND, p: [-.035, .018, .015], r: [.18, .12, -.32] },
  { t: .735, L: PISTOL_MAG_CLEAR },
  { t: .75, L: PISTOL_MAG_OUTSIDE },
];
export const PISTOL_RELOAD_EMPTY: Choreography = [
  { t: 0, parts: { slide: 1 } }, ...pistolSwap(false),
  { t: .775, L: { space: 'gun', wrist: [-.125, -.06, .06], forward: [.25, .4, -1], palm: [1, 0, .1], curl: OPEN } },
  { t: .795, L: { space: 'gun', wrist: [-.085, -.04, .035], forward: [.25, .4, -1], palm: [1, 0, .1], curl: OPEN }, parts: { slide: 1 } },
  { t: .81, L: PISTOL_RELEASE_HAND, parts: { slide: 1, release: 1 } },
  { t: .825, parts: { slide: 0, release: 1 }, p: [-.03, .024, .025], r: [.20, .10, -.26], ease: 'snap', sfx: 'slide-home' },
  { t: .85, parts: { release: 0 }, L: { space: 'gun', wrist: [-.125, -.04, .055], forward: [.15, .1, -1], palm: [1, 0, .1], curl: OPEN } },
  { t: .91, L: PISTOL_CLEAR },
  { t: .96, L: { space: 'grip' }, p: [0, 0, 0], r: [0, 0, 0] },
];
export const PISTOL_RELOAD_PARTIAL: Choreography = [
  ...pistolSwap(true),
  { t: .79, L: { space: 'gun', wrist: [-.125, -.06, .08], forward: [.15, .1, -1], palm: [1, 0, .1], curl: OPEN } },
  { t: .85, L: PISTOL_CLEAR },
  { t: .95, L: { space: 'grip' }, p: [0, 0, 0], r: [0, 0, 0] },
];
const pistolReloads = [PISTOL_RELOAD_PARTIAL, PISTOL_RELOAD_EMPTY].map(keys => [...keys].sort((a, b) => a.t - b.t));
export const pistolReload = (empty: boolean): Choreography => pistolReloads[empty ? 1 : 0];

// Magazine swap shared by the box-magazine long guns. `grab` is the support
// paw's wrist when it holds the seated magazine; it slides with the magazine.
function magSwap(axis: Vec, grab: Vec, finish: Choreography, tilt: { p: Vec; r: Vec } = { p: [-.085, .1, .045], r: [.2, .3, -.55] }): Choreography {
  const hand = (out: number, curlKey = HOLD_MAG) => ({ space: 'gun' as const, wrist: add(grab, axis, out), forward: [.1, -.2, -1] as Vec, palm: [1, 0, 0] as Vec, curl: curlKey });
  return [
    { t: .08, p: tilt.p, r: tilt.r, ease: 'out' },
    { t: .16, L: hand(0) },
    { t: .18, mag: { out: 0 }, sfx: 'mag-out' },
    { t: .28, L: hand(.1), mag: { out: .1 }, ease: 'in' },
    { t: .38, L: { space: 'view', wrist: [-.22, -.5, -.02], forward: [.3, .4, -1], palm: [.9, 0, .2], curl: HOLD_MAG },
      mag: { visible: false, out: .14, p: [-.12, -.2, .08], r: [.3, .4, .8] }, sfx: 'mag-drop' },
    { t: .46, mag: { visible: false, out: .3, p: [-.08, -.12, .04], r: [.2, 0, .4] } },
    { t: .47, mag: { visible: true, out: .3, p: [-.08, -.12, .04], r: [.2, 0, .4] } },
    { t: .56, L: hand(.16), mag: { out: .16, p: [0, 0, 0], r: [0, 0, 0] } },
    { t: .66, L: hand(.02), mag: { out: .02 } },
    { t: .64, p: tilt.p, r: tilt.r },
    { t: .7, L: hand(0), mag: { out: 0 }, p: add(tilt.p, [0, .015, 0]), r: add(tilt.r, [.04, 0, .02]), ease: 'snap', sfx: 'mag-in' },
    ...finish,
  ];
}

// The support paw opens on its fitted long-gun grip, then clears down and left of
// the handguard; both keys follow the grip, so refitting it keeps reloads clean.
const SUPPORT_RELEASE: HandKey = { space: 'grip', offset: [-.012, -.01, .004],
  curl: { index: [.1, .1, .05], middle: [.15, .12, .08], ring: [.15, .12, .08], thumb: [.2, .1, .05] } };
const SUPPORT_CLEAR: HandKey = { ...SUPPORT_RELEASE, offset: [-.075, -.035, .02] };
// Pump grips drop straight off the pump first, then clear to the left.
const PUMP_DROP: HandKey = { ...SUPPORT_RELEASE, offset: [-.006, -.04, 0] };
const PUMP_CLEAR: HandKey = { ...SUPPORT_RELEASE, offset: [-.11, -.05, 0] };
// The firing paw lets go of its grip and opens to the right of the action (bolt and charging handle reaches).
const FIRING_CLEAR: HandKey = { space: 'grip', offset: [.135, 0, 0] };
// It first opens in place, a little off the grip, so the wrapped digits never drag through it.
const FIRING_RELEASE: HandKey = { space: 'grip', offset: [.012, -.004, .006], curl: { index: [.1, .1, .05], middle: [.15, .12, .08], ring: [.15, .12, .08], thumb: [.2, .1, .05] } };
// Contact keys live in the magazine's own frame, so its rotation and the paw
// cannot drift apart. These normalized phases also drive the nearby world rig.
export const M4_MAG_HAND: HandKey = { space: 'part', part: 'mag', wrist: [-0.0612, -0.136442, 0.02362],
  forward: [-0.037945, 0.932039, -0.360366], palm: [0.950032, 0.145464, 0.276189],
  curl: { index: [1.367115, 1.035573, 0.282646], middle: [1.6994, 1.274035, 0.16781], ring: [1.7, 1.7, 0.447145], thumb: [1.241229, 1.108659, 0.617616], spread: -0.1181 } };
const M4_SEAT_HAND: HandKey = { space: 'part', part: 'mag', wrist: [-0.039363, -0.271518, -0.037076],
  forward: [0.922329, 0.267645, -0.278703], palm: [-0.257714, 0.963504, 0.072407],
  curl: { index: [0.09, 0.135, 0.09], middle: [0.09, 0.135, 0.09], ring: [0.108, 0.135, 0.09], thumb: [0.09, 0.09, 0.09], spread: 0.2000 } };
const M4_CATCH_HAND: HandKey = { space: 'gun', wrist: [-0.060181, -0.017140, 0.059754], forward: [-0.101290, 0.870514, -0.481607], palm: [0.795853, 0.361380, 0.485820], curl: { index: [0.180000, 0.220000, 0.090000], middle: [0.180000, 0.220000, 0.090000], ring: [-0.095196, 0.219917, 0.090180], thumb: [0.090000, 0.090000, 0.090000], spread: 0.2000 }, pole: [-1, -.25, .3] };
const M4_TRIGGER_CLEAR: HandKey = { space: 'gun', curl: {index: [0.12, 0.15, 0.1], middle: [0.927018, 0.599134, 1.024462], ring: [1.7, 0.299979, -0.1], thumb: [0.082804, -0.095181, 0.078912], spread: 0.342322} };
// Present the magazine well: lift and roll the rifle's belly toward the eye.
const M4_TILT: { p: Vec; r: Vec } = { p: [-.06, .035, -.05], r: [.22, .3, -.5] };
const M4_SWAP: Choreography = [
  { t: 0, L: { space: 'grip' }, mag: { out: 0 } },
  { t: .015, L: SUPPORT_RELEASE },
  { t: .035, L: SUPPORT_CLEAR },
  { t: .06, R: M4_TRIGGER_CLEAR },
  { t: .10, p: M4_TILT.p, r: M4_TILT.r, ease: 'out',
    L: { space: 'gun', wrist: [-.115, -.06, -.12], forward: [.08, .6, -.8], palm: [1, 0, .08], curl: OPEN } },
  { t: .15, L: shift(M4_MAG_HAND, [-.05, 0, 0]) },
  { t: .17, L: M4_MAG_HAND },
  { t: .20, L: M4_MAG_HAND, mag: { out: 0 }, sfx: 'mag-out' },
  { t: .30, L: M4_MAG_HAND, mag: { out: .13, p: [-.008, 0, .01], r: [.06, 0, .04] }, ease: 'in' },
  { t: .40, L: M4_MAG_HAND, mag: { out: .34, p: [-.09, -.17, .08], r: [.24, -.18, .28] } },
  { t: .42, L: M4_MAG_HAND, mag: { visible: false, out: .34, p: [-.09, -.17, .08], r: [.24, -.18, .28] } },
  { t: .48, L: M4_MAG_HAND, mag: { visible: false, out: .34, p: [-.09, -.17, .08], r: [.24, -.18, .28] } },
  { t: .50, L: M4_MAG_HAND, mag: { out: .34, p: [-.09, -.17, .08], r: [.24, -.18, .28] } },
  { t: .60, L: M4_MAG_HAND, mag: { out: .14, p: [-.015, 0, .005], r: [.06, 0, .05] }, ease: 'out' },
  { t: .67, L: M4_MAG_HAND, mag: { out: .025 } },
  { t: .70, L: M4_MAG_HAND, mag: { out: .025 } },
  // Release the shaft, clear its left edge and put the palm beneath the floorplate.
  { t: .709, L: shift(M4_MAG_HAND, [-.108, 0, 0], { curl: OPEN }) },
  { t: .72, L: { ...M4_MAG_HAND, wrist: [-.17, -.31, -.045], curl: OPEN } },
  { t: .733, L: shift(M4_SEAT_HAND, [-.15, -.047, 0]) },
  { t: .75, L: shift(M4_SEAT_HAND, [0, -.029, 0]) },
  { t: .77, L: M4_SEAT_HAND, mag: { out: 0 }, ease: 'snap', sfx: 'mag-in' },
  { t: .775, p: add(M4_TILT.p, [-.001, .011, -.001]), r: add(M4_TILT.r, [.025, 0, .01]), ease: 'snap' },
  { t: .785, L: shift(M4_SEAT_HAND, [-.027, -.034, 0]) },
  { t: .795, p: M4_TILT.p, r: M4_TILT.r },
];
export const M4_RELOAD_EMPTY: Choreography = [
  { t: 0, parts: { bolt: 1 } },
  ...M4_SWAP,
  { t: .807, L: { ...M4_SEAT_HAND, space: 'gun', wrist: [-.17, -.30, -.115] } },
  { t: .83, L: shift(M4_CATCH_HAND, [-.114, -.003, -.042]), parts: { bolt: 1, release: 0 } },
  { t: .86, L: M4_CATCH_HAND, parts: { bolt: 1, release: 1 }, ease: 'snap' },
  { t: .87, parts: { bolt: 0, release: 1 }, sfx: 'slide-home', ease: 'snap', p: add(M4_TILT.p, [.008, -.002, .007]), r: add(M4_TILT.r, [.015, -.02, .05]) },
  { t: .884, parts: { release: 0 } },
  { t: .902, L: shift(M4_CATCH_HAND, [-.114, -.003, -.042]) },
  { t: .938, L: SUPPORT_CLEAR },
  { t: .958, L: SUPPORT_RELEASE },
  { t: .97, L: { space: 'grip' }, R: { space: 'grip' }, p: [0, 0, 0], r: [0, 0, 0] },
];
export const M4_RELOAD_PARTIAL: Choreography = [
  ...M4_SWAP,
  { t: .813, L: { ...M4_SEAT_HAND, space: 'gun', wrist: [-.17, -.30, -.115] } },
  { t: .87, L: SUPPORT_CLEAR },
  { t: .901, L: SUPPORT_RELEASE },
  { t: .94, L: { space: 'grip' }, R: { space: 'grip' } },
  { t: .96, p: [0, 0, 0], r: [0, 0, 0] },
];
export const m4Reload = (empty: boolean): Choreography => empty ? M4_RELOAD_EMPTY : M4_RELOAD_PARTIAL;
export const SMG_MAG_HAND: HandKey = { space: 'part', part: 'mag', wrist: [-0.075354, -0.236716, 0.037093],
  forward: [0.969438, 0.072119, -0.234495], palm: [-0.084624, 0.995454, -0.043695],
  curl: { index: [0.0945, 0.27144, 0.1269], middle: [0.18, 0.27, 0.135], ring: [0.225, 0.27, 0.135], thumb: [1.317624, 0.087351, -0.076213], spread: 0.0865 } };
const SMG_MAG_CLEAR = shift(SMG_MAG_HAND, [-.02, -.045, 0]);
const SMG_MAG_OUTSIDE = shift(SMG_MAG_HAND, [-.117, -.036, 0]);
const SMG_CLEAR: HandKey = { space: 'grip', offset: [-.05, -.01, 0] };
const SMG_SWAP: Choreography = [
  { t: .035, L: SMG_CLEAR },
  { t: .07, R: { space: 'grip', curl: { index: [-.08, .03, .01] } }, p: [-.06, .055, .025], r: [.16, .15, -.32], ease: 'out' },
  { t: .08, L: { space: 'gun', wrist: [-.15, -.095, -.075], forward: [.1, .1, -1], palm: [1, 0, .1], curl: OPEN } },
  { t: .12, L: SMG_MAG_OUTSIDE },
  { t: .15, L: SMG_MAG_CLEAR },
  { t: .17, L: SMG_MAG_HAND, mag: { out: 0 }, sfx: 'mag-out' },
  { t: .29, L: SMG_MAG_HAND, mag: { out: .19, p: [-.018, -.015, .03], r: [.10, 0, .12] }, ease: 'in' },
  { t: .38, L: SMG_MAG_HAND, mag: { out: .33, p: [-.08, -.18, .10], r: [.25, -.1, .25] } },
  { t: .40, L: SMG_MAG_HAND, mag: { visible: false, out: .33, p: [-.08, -.18, .10], r: [.25, -.1, .25] } },
  { t: .45, L: SMG_MAG_HAND, mag: { visible: false, out: .33, p: [-.08, -.18, .10], r: [.25, -.1, .25] } },
  { t: .46, L: SMG_MAG_HAND, mag: { out: .33, p: [-.08, -.18, .10], r: [.25, -.1, .25] } },
  { t: .57, L: SMG_MAG_HAND, mag: { out: .12, p: [-.01, 0, .01], r: [.04, 0, .04] }, ease: 'out' },
  { t: .64, L: SMG_MAG_HAND, mag: { out: .02 } },
  { t: .68, L: SMG_MAG_HAND, mag: { out: 0 }, ease: 'snap', sfx: 'mag-in' },
  { t: .69, p: [-.059, .066, .023], r: [.19, .15, -.30], ease: 'snap' },
  { t: .715, L: SMG_MAG_CLEAR },
  { t: .735, L: SMG_MAG_OUTSIDE },
  { t: .72, p: [-.06, .055, .025], r: [.16, .15, -.32] },
  { t: .90, R: { space: 'grip', curl: { index: [-.08, .03, .01] } } },
  { t: .98, R: { space: 'grip' }, L: { space: 'grip' }, p: [0, 0, 0], r: [0, 0, 0] },
];
const SMG_CHARGE_HAND: HandKey = { space: 'part', part: 'charge', wrist: [-0.075646, -0.036563, 0.049335],
  forward: [0.274431, 0.482582, -0.831747], palm: [0.96102, -0.107428, 0.254754],
  curl: { index: [1.056161, 1.166807, 0.498414], middle: [1.1781, 1.115445, 1.262282], ring: [1.17, 0.99, 0.72], thumb: [0.564424, 0.227683, 0.045244], spread: -0.3087 } };
export const SMG_RELOAD_EMPTY: Choreography = [...SMG_SWAP,
  { t: .77, L: { space: 'gun', wrist: [-.145, .04, -.13], forward: [.1, .3, -1], palm: [1, -.1, .05], curl: OPEN } },
  { t: .805, L: SMG_CHARGE_HAND, parts: { charge: 0 } },
  { t: .845, L: SMG_CHARGE_HAND, parts: { charge: 1 }, sfx: 'slide-back' },
  { t: .86, L: SMG_CHARGE_HAND, parts: { charge: 1 } },
  { t: .87, L: shift(SMG_CHARGE_HAND, [-.033, 0, 0]), parts: { charge: 1 } },
  { t: .885, L: { space: 'gun', wrist: [-.145, .020, -.12], forward: [.1, .15, -1], palm: [1, 0, .05], curl: OPEN }, parts: { charge: 0 }, ease: 'snap', sfx: 'slide-home' },
  { t: .93, L: SMG_CLEAR },
];
export const SMG_RELOAD_PARTIAL: Choreography = [...SMG_SWAP,
  { t: .83, L: SMG_CLEAR },
  { t: .90, L: { space: 'grip' } },
];
const smgReloads = [SMG_RELOAD_PARTIAL, SMG_RELOAD_EMPTY].map(keys => [...keys].sort((a, b) => a.t - b.t));
export const smgReload = (empty: boolean): Choreography => smgReloads[empty ? 1 : 0];
export const DMR_MAG_HAND: HandKey = { space: 'part', part: 'mag', wrist: [-0.068581, -0.157494, 0.021746],
  forward: [0.073174, 0.932039, -0.354892], palm: [0.982424, -0.006091, 0.186566],
  curl: { index: [1.7, 0.347659, 0.323166], middle: [1.7, 1.7, 0.4023], ring: [1.7, 1.7, 0.396], thumb: [0.576417, 1.197744, 0.86638], spread: 0.0319 } };
export const DMR_CHARGE_HAND: HandKey = { space: 'part', part: 'charge', wrist: [0.085247, -0.064489, 0.058628],
  forward: [-0.025311, 0.932039, -0.361473], palm: [-0.887942, -0.187077, -0.420193], pole: [1, -.35, .2],
  curl: { index: [1.028073, 0.63286, 1.153242], middle: [1.333944, 0.19412, 1.004206], ring: [1.17, 0.99, 0.72], thumb: [0.637656, 0.282854, 0.014837], spread: -0.5602 } };
const DMR_TILT: { p: Vec; r: Vec } = { p: [-.05, .03, -.06], r: [.2, .3, -.45] };
const DMR_SWAP: Choreography = [
  { t: .015, L: SUPPORT_RELEASE },
  { t: .035, L: SUPPORT_CLEAR },
  { t: .08, p: DMR_TILT.p, r: DMR_TILT.r, ease: 'out', L: SUPPORT_CLEAR },
  { t: .13, L: shift(DMR_MAG_HAND, [-.078, 0, 0]) },
  { t: .17, L: DMR_MAG_HAND, mag: { out: 0 } },
  { t: .20, L: DMR_MAG_HAND, mag: { out: 0 }, sfx: 'mag-out' },
  { t: .30, L: DMR_MAG_HAND, mag: { out: .13, r: [.10, 0, .04] }, ease: 'in' },
  { t: .40, L: DMR_MAG_HAND, mag: { out: .32, p: [-.07, -.14, .05], r: [.22, -.12, .23] } },
  { t: .42, L: DMR_MAG_HAND, mag: { visible: false, out: .32, p: [-.07, -.14, .05], r: [.22, -.12, .23] } },
  { t: .48, L: DMR_MAG_HAND, mag: { visible: false, out: .32, p: [-.07, -.14, .05], r: [.22, -.12, .23] } },
  { t: .50, L: DMR_MAG_HAND, mag: { out: .32, p: [-.07, -.14, .05], r: [.22, -.12, .23] } },
  { t: .60, L: DMR_MAG_HAND, mag: { out: .13, r: [.1, 0, .04] } },
  { t: .67, L: DMR_MAG_HAND, mag: { out: .022, r: [.06, 0, 0] } },
  { t: .70, L: DMR_MAG_HAND, mag: { out: 0 }, ease: 'snap', sfx: 'mag-in' },
  { t: .708, p: add(DMR_TILT.p, [-.002, .013, .002]), r: add(DMR_TILT.r, [.03, 0, .02]) },
  { t: .735, L: shift(DMR_MAG_HAND, [-.13, 0, 0], { curl: OPEN }) },
  { t: .77, L: { space: 'gun', wrist: [-.15, -.12, -.17] } },
  { t: .81, L: SUPPORT_CLEAR },
  { t: .825, L: SUPPORT_RELEASE },
  { t: .84, L: { space: 'grip' } },
];
const DMR_RELOAD_PARTIAL: Choreography = [...DMR_SWAP,
  { t: .94, p: [0, 0, 0], r: [0, 0, 0] },
];
const DMR_RELOAD_EMPTY: Choreography = [...DMR_SWAP.map(key => ({ ...key, t: key.t * .86 })),
  { t: .725, R: { space: 'grip' } },
  { t: .745, R: FIRING_RELEASE },
  { t: .765, R: { ...FIRING_CLEAR, curl: OPEN } },
  { t: .80, R: shift(DMR_CHARGE_HAND, [.11, 0, 0]), parts: { charge: 0 } },
  { t: .83, R: DMR_CHARGE_HAND, parts: { charge: 0 } },
  { t: .89, R: DMR_CHARGE_HAND, parts: { charge: 1 }, sfx: 'slide-back' },
  { t: .915, R: DMR_CHARGE_HAND, parts: { charge: 0 }, ease: 'snap', sfx: 'slide-home' },
  { t: .945, R: shift(DMR_CHARGE_HAND, [.11, .035, 0], { curl: OPEN }) },
  { t: .985, R: FIRING_CLEAR },
  { t: .993, R: FIRING_RELEASE },
  { t: 1, R: { space: 'grip' }, p: [0, 0, 0], r: [0, 0, 0] },
];
export const dmrReload = (empty: boolean): Choreography => empty ? DMR_RELOAD_EMPTY : DMR_RELOAD_PARTIAL;

export const SNIPER_MAG_HAND: HandKey = { space: 'part', part: 'mag', wrist: [-0.088988, -0.160195, 0.011241],
  forward: [0.21378, 0.897557, -0.385604], palm: [0.830176, 0.041127, 0.555982],
  curl: { index: [0.771627, 0.221598, 0.286337], middle: [1.461854, 1.092202, -0.057784], ring: [1.7, 1.7, 0.396], thumb: [0.897567, 0.589462, 0.546293], spread: -0.1879 } };
export const SNIPER_BOLT_HAND: HandKey = { space: 'part', part: 'bolt', wrist: [0.123252, -0.08807, 0.065733],
  forward: [-0.090106, 0.932039, -0.350976], palm: [-0.903789, -0.224569, -0.364327], pole: [1, -.35, .2],
  curl: { index: [1.7, -0.1, -0.1], middle: [1.481611, 0.148254, 0.539266], ring: [1.17, 0.99, 0.72], thumb: [0.46395, -0.09157, 0.817014], spread: -0.6000 } };
// A complete four-beat bolt stroke, anchored to the actual moving knob.
export const SNIPER_CYCLE: Choreography = [
  { t: .04, R: FIRING_RELEASE },
  { t: .08, R: { ...FIRING_CLEAR, curl: OPEN }, parts: { bolt: 0, boltPull: 0 } },
  { t: .15, R: shift(SNIPER_BOLT_HAND, [.11, .035, 0]) },
  { t: .22, R: SNIPER_BOLT_HAND, parts: { bolt: 0 } },
  { t: .34, R: SNIPER_BOLT_HAND, parts: { bolt: 1 }, sfx: 'bolt-open' },
  { t: .49, R: SNIPER_BOLT_HAND, parts: { boltPull: 1 }, sfx: 'bolt-back' },
  { t: .56, R: SNIPER_BOLT_HAND, parts: { boltPull: 1 } },
  { t: .72, R: SNIPER_BOLT_HAND, parts: { bolt: 1, boltPull: 0 } },
  { t: .84, R: SNIPER_BOLT_HAND, parts: { bolt: 0 }, ease: 'snap', sfx: 'bolt-home' },
  { t: .9, R: shift(SNIPER_BOLT_HAND, [.11, 0, 0], { curl: OPEN }) },
  { t: .95, R: FIRING_CLEAR },
  { t: .975, R: FIRING_RELEASE },
  { t: 1, R: { space: 'grip' } },
];
const SNIPER_TILT: { p: Vec; r: Vec } = { p: [-.045, .03, -.06], r: [.18, .28, -.42] };
function sniperMagazine(start: number, end: number): Choreography {
  const at = (u: number) => start + (end - start) * u;
  return [
    { t: at(0), L: SUPPORT_RELEASE },
    { t: at(.035), L: SUPPORT_CLEAR },
    { t: at(.09), L: shift(SNIPER_MAG_HAND, [-.082, 0, 0]) },
    { t: at(.15), L: SNIPER_MAG_HAND, mag: { out: 0 } },
    { t: at(.2), L: SNIPER_MAG_HAND, mag: { out: 0 }, sfx: 'mag-out' },
    { t: at(.32), L: SNIPER_MAG_HAND, mag: { out: .12 } },
    { t: at(.42), L: SNIPER_MAG_HAND, mag: { out: .30, p: [-.07, -.15, .05], r: [.15, 0, .2] } },
    { t: at(.44), L: SNIPER_MAG_HAND, mag: { visible: false, out: .30, p: [-.07, -.15, .05], r: [.15, 0, .2] } },
    { t: at(.51), L: SNIPER_MAG_HAND, mag: { visible: false, out: .30, p: [-.07, -.15, .05], r: [.15, 0, .2] } },
    { t: at(.53), L: SNIPER_MAG_HAND, mag: { out: .30, p: [-.07, -.15, .05], r: [.15, 0, .2] } },
    { t: at(.68), L: SNIPER_MAG_HAND, mag: { out: .10 } },
    { t: at(.78), L: SNIPER_MAG_HAND, mag: { out: 0 }, ease: 'snap', sfx: 'mag-in' },
    { t: at(.85), L: shift(SNIPER_MAG_HAND, [-.108, 0, 0], { curl: OPEN }) },
    { t: at(.9), L: { space: 'gun', wrist: [-.15, -.10, -.20] } },
    { t: at(.95), L: SUPPORT_CLEAR },
    { t: at(.975), L: SUPPORT_RELEASE },
    { t: at(1), L: { space: 'grip' } },
  ];
}
const SNIPER_RELOAD_PARTIAL: Choreography = [
  { t: .08, p: SNIPER_TILT.p, r: SNIPER_TILT.r, ease: 'out' },
  ...sniperMagazine(.09, .89),
  { t: .98, p: [0, 0, 0], r: [0, 0, 0] },
];
const SNIPER_RELOAD_EMPTY: Choreography = [
  { t: .025, R: FIRING_RELEASE },
  { t: .05, p: SNIPER_TILT.p, r: SNIPER_TILT.r, ease: 'out', R: { ...FIRING_CLEAR, curl: OPEN } },
  { t: .085, R: shift(SNIPER_BOLT_HAND, [.11, .035, 0]), parts: { bolt: 0, boltPull: 0 } },
  { t: .12, R: SNIPER_BOLT_HAND, parts: { bolt: 0 } },
  { t: .17, R: SNIPER_BOLT_HAND, parts: { bolt: 1 }, sfx: 'bolt-open' },
  { t: .23, R: SNIPER_BOLT_HAND, parts: { boltPull: 1 }, sfx: 'bolt-back' },
  { t: .26, R: shift(SNIPER_BOLT_HAND, [.11, 0, 0], { curl: OPEN }) },
  { t: .285, R: FIRING_CLEAR },
  { t: .298, R: FIRING_RELEASE },
  { t: .31, R: { space: 'grip' } },
  { t: .315, L: { space: 'grip' } },
  ...sniperMagazine(.33, .82),
  { t: .825, R: { space: 'grip' } },
  { t: .835, R: FIRING_RELEASE },
  { t: .845, R: { ...FIRING_CLEAR, curl: OPEN } },
  { t: .865, R: shift(SNIPER_BOLT_HAND, [.15, .06, .04]) },
  { t: .89, R: SNIPER_BOLT_HAND, parts: { boltPull: 1 } },
  { t: .935, R: SNIPER_BOLT_HAND, parts: { bolt: 1, boltPull: 0 }, sfx: 'bolt-home' },
  { t: .96, R: SNIPER_BOLT_HAND, parts: { bolt: 0 }, ease: 'snap' },
  { t: .975, R: shift(SNIPER_BOLT_HAND, [.11, 0, 0], { curl: OPEN }) },
  { t: .99, R: FIRING_CLEAR },
  { t: .995, R: FIRING_RELEASE },
  { t: 1, R: { space: 'grip' }, p: [0, 0, 0], r: [0, 0, 0] },
];
export const sniperReload = (empty: boolean): Choreography => empty ? SNIPER_RELOAD_EMPTY : SNIPER_RELOAD_PARTIAL;
const REVOLVER_CYLINDER_HAND: HandKey = { space: 'part', part: 'cylinder', followRotation: false, wrist: [-0.080089, -0.043126, 0.031289],
  forward: [-0.019041, 0.284059, -0.958618], palm: [0.999803, -0, -0.019859],
  curl: { index: [0.605, -0.010066, 0.400446], middle: [0.2925, 0.387285, 0.705675], ring: [0.2952, 0.4329, 0.2916], thumb: [0.045, 0.108, 0.1305], spread: -0.6000 } };
// The crane swings out under the same paw: one orientation, a little further back, digits closing.
const REVOLVER_CYLINDER_OPEN: HandKey = shift(REVOLVER_CYLINDER_HAND, [-.008, .003, .012]);
// Follow the rod position, keeping the paw clear regardless of cylinder spin.
const REVOLVER_EJECT_HAND: HandKey = { space: 'part', part: 'action', followRotation: false, wrist: [-0.104899, -0.027724, -0.208188],
  forward: [0.932744, 0.168518, -0.318732], palm: [0.281621, 0.211447, 0.935938], pole: [-1, -.2, -.1],
  curl: { index: [1, 1, 0.6], middle: [1.7, 1.300141, 0.9], ring: [1.7, 1.299862, 0.9], thumb: [0.36, 0.135, 0.135], spread: -0.2000 } };
const REVOLVER_EJECT_PRESS: HandKey = { ...REVOLVER_EJECT_HAND };
const REVOLVER_EJECT_APPROACH: HandKey = { ...REVOLVER_EJECT_HAND, space: 'gun', wrist: [-.18, .001, -.185] };
const REVOLVER_EJECT_CLEAR: HandKey = { ...REVOLVER_EJECT_APPROACH, wrist: [-.18, .001, -.090] };
const REVOLVER_CYLINDER_CLEAR: HandKey = { space: 'gun', wrist: [-.145, .008, -.005],
  forward: [.120078, .379252, -.917469], palm: [.973055, .138274, .184511], curl: OPEN };
export const REVOLVER_LOADER_HAND: HandKey = { space: 'part', part: 'mag', wrist: [-0.090575, 0.066225, 0.07539],
  forward: [0.866839, -0.451027, -0.212521], palm: [-0.164948, 0.142825, -0.975906],
  curl: { index: [1.301026, 1.413858, -0.09], middle: [1.607007, 0.013634, -0.09], ring: [0.747, -0.0585, 0.0666], thumb: [0.064511, 0.184419, 0.200391], spread: -0.5904 } };
export const REVOLVER_RELOAD: Choreography = [
  { t: 0, mag: { visible: false }, parts: { swing: 0, spent: 0, fresh: 0, loaded: 0 } },
  { t: .05, R: { space: 'grip', curl: { index: [.06, .2, .1] } } },
  { t: .08, p: [-.045, .035, .025], r: [.20, .25, -.25], ease: 'out',
    L: shift(REVOLVER_CYLINDER_HAND, [-.048, 0, 0]) },
  { t: .12, L: REVOLVER_CYLINDER_HAND, parts: { release: 1, swing: 0 } },
  { t: .17, L: REVOLVER_CYLINDER_HAND, parts: { swing: 1, release: 0 }, ease: 'out' },
  { t: .19, L: REVOLVER_CYLINDER_OPEN, parts: { swing: 1, release: 0 }, sfx: 'cylinder-open', ease: 'out' },
  { t: .23, L: REVOLVER_CYLINDER_CLEAR },
  { t: .255, L: REVOLVER_EJECT_APPROACH },
  { t: .27, L: shift(REVOLVER_EJECT_HAND, [0, 0, -.026]) },
  { t: .28, p: [-.04, .025, .035], r: [1.02, .18, -.22], L: REVOLVER_EJECT_HAND, parts: { eject: 0, spent: 0 } },
  { t: .32, L: REVOLVER_EJECT_PRESS, parts: { eject: 1, spent: .22 }, ease: 'snap', sfx: 'eject' },
  { t: .35, L: REVOLVER_EJECT_PRESS, parts: { eject: 1, spent: .5 }, p: [-.04, .025, .035], r: [1.02, .18, -.22] },
  { t: .365, L: REVOLVER_EJECT_CLEAR, parts: { eject: 1 } },
  { t: .39, L: { space: 'gun', wrist: [-.17, -.07, .10], forward: [.5, .5, -.7], palm: [.7, 0, .7], curl: OPEN }, parts: { eject: 0, spent: 1 } },
  { t: .43, p: [-.055, .035, .045], r: [-.18, .32, -.30],
    L: { space: 'view', wrist: [-.24, -.46, .015], forward: [.7, .3, -.6], palm: [.6, 0, .8], curl: HOLD_MAG } },
  { t: .48, L: REVOLVER_LOADER_HAND, mag: { visible: false, out: .22, p: [-.10, -.09, .04], r: [0, 0, 1.3] }, parts: { fresh: 0 } },
  { t: .49, L: REVOLVER_LOADER_HAND, mag: { out: .22, p: [-.10, -.09, .04], r: [0, 0, 1.3] }, parts: { fresh: 1 } },
  { t: .60, L: REVOLVER_LOADER_HAND, mag: { out: .07, p: [-.03169, -.00433, 0], r: [0, 0, 1.3] }, ease: 'out' },
  { t: .675, L: REVOLVER_LOADER_HAND, mag: { out: 0, p: [-.03169, -.00433, 0], r: [0, 0, 1.3] }, parts: { loaded: 0 }, sfx: 'speedloader', ease: 'in' },
  { t: .676, parts: { loaded: 1 } },
  { t: .73, L: REVOLVER_LOADER_HAND, mag: { out: .12, p: [-.055, -.025, 0], r: [0, 0, 1.3] } },
  { t: .77, L: REVOLVER_LOADER_HAND, mag: { out: .28, p: [-.12, -.16, .04], r: [0, 0, 1.3] } },
  { t: .78, mag: { visible: false, out: .28, p: [-.12, -.16, .04], r: [0, 0, 1.3] } },
  { t: .785, L: REVOLVER_LOADER_HAND },
  { t: .80, L: { ...REVOLVER_CYLINDER_CLEAR, wrist: [-.15, .008, .06] } },
  { t: .82, L: REVOLVER_CYLINDER_OPEN, parts: { swing: 1 } },
  { t: .835, L: REVOLVER_CYLINDER_HAND, parts: { swing: 1 } },
  { t: .88, L: REVOLVER_CYLINDER_HAND, parts: { swing: 0 }, sfx: 'cylinder-close', ease: 'snap', p: [-.035, .025, .025], r: [.03, .2, -.15] },
  { t: .92, L: { space: 'gun', wrist: [-.12, -.075, .055], forward: [.15, .2, -1], palm: [1, 0, .1], curl: OPEN } },
  { t: .94, L: { space: 'grip', offset: [-.025, 0, 0] } },
  { t: .96, L: { space: 'grip' }, R: { space: 'grip' }, p: [0, 0, 0], r: [0, 0, 0] },
  { t: .999, mag: { visible: false }, parts: { spent: 1, fresh: 1, loaded: 1 } },
];
// One shell per cycle; the gun's cant is held separately while the reload lasts.
export const SHOTGUN_SHELL_HAND: HandKey = { space: 'part', part: 'mag', wrist: [-0.097336, -0.075568, 0.03628],
  forward: [0.851422, -0.243672, -0.464439], palm: [0.429774, 0.831704, 0.351514],
  curl: { index: [0.642061, 1.049809, -0.077197], middle: [1.191652, 1.176462, 0.54], ring: [1.080153, 0.900038, 0.54], thumb: [0.771524, 0.129899, -0.040648], spread: -0.1422 } };
const SHOTGUN_PUSH_HAND: HandKey = { space: 'part', part: 'mag', wrist: [-0.058725, -0.097962, 0.032753],
  forward: [0.740046, -0.401766, -0.539366], palm: [0.669918, 0.511321, 0.538294], pole: [-1, -0.2, 0.3],
  curl: { index: [0.310591, 0.226913, 0.173387], middle: [1.218529, 1.238508, 0.540072], ring: [0.92595, 1.140158, 0.540787], thumb: [0.696278, -0.1, -0.081744], spread: -0.1892 } };
const SHOTGUN_SHELL: Choreography = [
  { t: 0, mag: { visible: false, p: [0, -.016, 0] } },
  { t: .065, L: PUMP_DROP },
  { t: .12, L: PUMP_CLEAR, mag: { visible: false, p: [-.10, -.25, .07] } },
  { t: .26, L: SHOTGUN_SHELL_HAND, mag: { visible: false, p: [-.10, -.25, .07] } },
  { t: .29, L: SHOTGUN_SHELL_HAND, mag: { p: [-.10, -.25, .07] } },
  { t: .48, L: SHOTGUN_SHELL_HAND, mag: { p: [0, -.045, .018] } },
  { t: .52, L: SHOTGUN_SHELL_HAND, mag: { out: .02, p: [0, -.03, 0] } },
  { t: .56, L: SHOTGUN_PUSH_HAND, mag: { out: .02, p: [0, -.016, 0] } },
  // Uncurl below the gate, lift into the tube axis, then push the case head.
  { t: .62, L: SHOTGUN_PUSH_HAND, mag: { out: .02, p: [0, .019, 0] } },
  { t: .70, L: SHOTGUN_PUSH_HAND, mag: { out: .065, p: [0, .019, 0] }, ease: 'snap', sfx: 'shell-in' },
  { t: .74, L: SHOTGUN_PUSH_HAND, mag: { out: .085, p: [0, .019, 0] } },
  { t: .78, L: shift(SHOTGUN_PUSH_HAND, [-.105, -.112, 0]), mag: { visible: false, out: .095, p: [0, .019, 0] } },
  { t: .85, L: PUMP_CLEAR },
  { t: .92, L: PUMP_DROP },
  { t: 1, L: { space: 'grip' }, mag: { visible: false } },
];

export const COCO_FRUIT_HAND: HandKey = { space: 'part', part: 'mag', wrist: [-0.1427, -0.043081, 0.06706],
  forward: [0.892113, -0.106238, -0.439145], palm: [0.412027, 0.59011, 0.694264],
  curl: { index: [1.217551, -0.06997, 0.36], middle: [0.962356, 0.076228, 0.45], ring: [-0.09, -0.09, -0.09], thumb: [-0.09, -0.088379, 0.01463], spread: -0.6000 } };
function makeCocoReload(ammo: number): Choreography {
  const keys: import('./viewmodel-choreo').Key[] = [
    { t: 0, mag: { visible: false, p: [-.23, -.42, .08] }, parts: { load1: ammo >= 3 ? 1 : 0, load2: ammo >= 2 ? 1 : 0 } },
    { t: .025, L: PUMP_DROP },
    { t: .06, p: [-.055, -.03, -.10], r: [-.04, .15, -.025], ease: 'out', L: PUMP_CLEAR },
  ];
  const drop = (t: number, slot: number) => {
    const z = -slot * .09;
    keys.push(
      { t, L: COCO_FRUIT_HAND, mag: { visible: false, p: [-.23, -.42, z + .08] } },
      { t: t + .018, L: COCO_FRUIT_HAND, mag: { p: [-.23, -.42, z + .08] } },
      { t: t + .038, L: COCO_FRUIT_HAND, mag: { p: [-.27, -.1, z + .04] } },
      { t: t + .055, L: COCO_FRUIT_HAND, mag: { p: [-.12, .15, z] } },
      { t: t + .072, L: COCO_FRUIT_HAND, mag: { p: [0, .15, z] } },
      { t: t + .096, L: shift(COCO_FRUIT_HAND, [-.127, -.01, 0], { curl: OPEN }), mag: { p: [0, .15, z] } },
      { t: t + .132, L: { space: 'gun', wrist: [-.25, .19, z + .065], curl: OPEN }, mag: { p: [0, 0, z] }, ease: 'in', sfx: 'coconut-in' },
      { t: t + .15, L: { space: 'gun', wrist: [-.26, -.2, z + .065], curl: OPEN }, mag: { visible: slot === 0, p: [0, 0, z] } },
    );
    if (slot) keys.push({ t: t + .131, parts: { ['load' + slot]: 0 } }, { t: t + .132, parts: { ['load' + slot]: 1 } });
  };
  if (ammo === 0) {
    drop(.08, 2); drop(.245, 1); drop(.41, 0);
    keys.push(
      { t: .57, L: PUMP_DROP },
      { t: .595, L: { space: 'grip' }, parts: { pump: 0 } },
      { t: .63, L: { space: 'grip' }, mag: { p: [0, 0, 0] }, parts: { pump: 1 }, sfx: 'pump-back' },
      { t: .65, mag: { p: [0, -.045, 0] } },
      { t: .66, mag: { visible: false }, parts: { pump: 0 }, ease: 'snap', sfx: 'pump-home' },
      { t: .685, L: PUMP_DROP },
      { t: .70, L: PUMP_CLEAR },
    );
    // Feeding frees the rear hopper pocket; top it up for the fourth round.
    drop(.71, 0);
  } else {
    const slots = Array.from({ length: 4 - ammo }, (_, i) => 3 - ammo - i);
    const starts = slots.length === 1 ? [.43] : slots.length === 2 ? [.20, .56] : [.12, .37, .62];
    slots.forEach((slot, i) => drop(starts[i], slot));
  }
  keys.push(
    { t: .88, p: [-.055, -.03, -.10], r: [-.04, .15, -.025] },
    { t: .91, L: PUMP_CLEAR, mag: { p: [0, 0, 0] } },
    { t: .94, L: PUMP_DROP },
    { t: .97, L: { space: 'grip' } },
    { t: 1, p: [0, 0, 0], r: [0, 0, 0], mag: { p: [0, 0, 0] }, parts: { load1: 1, load2: 1, pump: 0 } },
  );
  return keys.sort((a, b) => a.t - b.t);
}
const COCO_RELOADS = [0, 1, 2, 3].map(makeCocoReload);
export const cocoReload = (ammo: number): Choreography => COCO_RELOADS[Math.max(0, Math.min(3, Math.floor(ammo)))];

export const RELOADS: Partial<Record<WeaponId, Choreography>> = {
  pistol: PISTOL_RELOAD_EMPTY, m4: M4_RELOAD_EMPTY, smg: SMG_RELOAD_EMPTY, dmr: DMR_RELOAD_EMPTY, sniper: SNIPER_RELOAD_EMPTY,
  revolver: REVOLVER_RELOAD, shotgun: SHOTGUN_SHELL, coco: COCO_RELOADS[0],
};

// Two deliberate turns reveal the slide finish and the control side, then settle.
export const SHORT_INSPECTS: Partial<Record<WeaponId, Choreography>> = {
  smg: [
    { t: .22, p: [-.035, .04, -.045], r: [.16, .45, -.20], ease: 'out' },
    { t: .42, L: { space: 'grip' } },
    { t: .46, p: [-.035, .04, -.045], r: [.16, .50, -.22] },
    { t: .50, L: { space: 'grip', offset: [-.085, -.045, 0] } },
    { t: .62, L: { space: 'view', wrist: [-.25, -.25, -.40], forward: [.1, .2, -1], palm: [.2, -.95, -.1], curl: OPEN } },
    { t: .72, p: [-.13, .035, -.18], r: [.08, -1.15, .12] },
    { t: .82, p: [-.13, .035, -.18], r: [.08, -1.15, .12], L: { space: 'view', wrist: [-.25, -.25, -.40], forward: [.1, .2, -1], palm: [.2, -.95, -.1], curl: OPEN } },
    { t: .93, L: { space: 'grip', offset: [-.085, -.045, 0] } },
    { t: .99, L: { space: 'grip' } },
  ],
  revolver: [
    { t: .08, R: { space: 'grip', curl: { index: [.06, .2, .1] } } },
    { t: .88, R: { space: 'grip', curl: { index: [.06, .2, .1] } } },
    { t: .97, R: { space: 'grip' } },
    { t: .08, L: { space: 'grip', offset: [-.06, 0, 0] } },
    { t: .18, L: { space: 'view', wrist: [-.20, -.25, -.40], forward: [.18, .12, -1], palm: [.2, -.95, -.05], curl: OPEN } },
    { t: .24, p: [-.035, .018, .025], r: [.12, -.60, .20], ease: 'out' },
    { t: .46, p: [-.035, .018, .025], r: [.13, -.66, .22] },
    { t: .52, L: { space: 'view', wrist: [-.20, -.25, -.40], forward: [.18, .12, -1], palm: [.2, -.95, -.05], curl: OPEN } },
    { t: .62, L: { space: 'grip', offset: [-.06, 0, 0] } },
    { t: .70, L: { space: 'grip' } },
    { t: .72, p: [-.02, .01, .02], r: [.12, .12, -.26] },
    { t: .82, p: [-.02, .01, .02], r: [.12, .12, -.26] },
  ],
  machete: [
    { t: .22, p: [-.05, .015, .015], r: [-.32, -.34, .30], ease: 'out' },
    { t: .46, p: [-.05, .015, .015], r: [-.28, -.38, .38] },
    { t: .70, p: [-.015, .02, .02], r: [-.18, .10, -.30] },
    { t: .82, p: [-.015, .02, .02], r: [-.18, .10, -.30] },
  ],
  pistol: [
    { t: .08, R: { space: 'grip', curl: { index: [.06, .2, .1] } } },
    { t: .88, R: { space: 'grip', curl: { index: [.06, .2, .1] } } },
    { t: .97, R: { space: 'grip' } },
    { t: .08, L: { space: 'grip', offset: [-.06, 0, 0] } },
    { t: .18, L: { space: 'view', wrist: [-.20, -.25, -.40], forward: [.18, .12, -1], palm: [.2, -.95, -.05], curl: OPEN } },
    { t: .24, p: [-.035, .025, .025], r: [.16, -.72, .23], ease: 'out' },
    { t: .48, p: [-.035, .028, .025], r: [.17, -.78, .26] },
    { t: .52, L: { space: 'view', wrist: [-.20, -.25, -.40], forward: [.18, .12, -1], palm: [.2, -.95, -.05], curl: OPEN } },
    { t: .62, L: { space: 'grip', offset: [-.065, 0, 0] } },
    { t: .70, L: { space: 'grip' } },
    { t: .72, p: [-.015, .015, .015], r: [.12, .10, -.25] },
    { t: .82, p: [-.015, .015, .015], r: [.12, .10, -.25] },
  ],
};

// Long guns: lift and roll the left flank (livery) up to the eye, hold, roll
// over to the right flank and ejection side, hold, settle. Both paws keep their
// grips; the firing index rests off the trigger while the gun is on show.
const longInspect = (lift: Vec, left: Vec, right: Vec): Choreography => [
  { t: .06, R: { space: 'grip', curl: { index: [.12, .15, .1] } } },
  { t: .2, p: lift, r: left, ease: 'out' },
  { t: .46, p: [lift[0] - .005, lift[1] + .006, lift[2]], r: [left[0] + .02, left[1] + .03, left[2] - .05] },
  { t: .68, p: [lift[0] + .02, lift[1] + .01, lift[2]], r: right },
  { t: .86, p: [lift[0] + .018, lift[1] + .014, lift[2]], r: [right[0] + .02, right[1] - .03, right[2] + .05] },
  { t: .9, R: { space: 'grip', curl: { index: [.12, .15, .1] } } },
  { t: .97, R: { space: 'grip' } },
];
export const LONG_INSPECTS: Partial<Record<WeaponId, Choreography>> = {
  m4: longInspect([-.06, .05, -.02], [.12, .35, -.45], [.1, -.1, .85]),
  shotgun: longInspect([-.06, .05, -.02], [.1, .3, -.4], [.08, -.1, .8]),
  dmr: longInspect([-.06, .05, -.02], [.1, .3, -.4], [.08, -.05, .45]),
  sniper: longInspect([-.05, .045, -.01], [.08, .25, -.35], [.06, -.08, .7]),
  coco: longInspect([-.06, .04, -.02], [.1, .3, -.35], [.08, -.1, .75]),
};

