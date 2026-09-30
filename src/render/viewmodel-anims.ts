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

// The support paw remains in magazine space from acquisition through the palm seat.
const PISTOL_MAG_HAND: HandKey = { space: 'part', part: 'mag', wrist: [-.06187, -.12927, .02909],
  forward: [.99713, .07060, -.02726], palm: [-.06953, .99684, .03849],
  curl: { ...curl([.105, .3016, .141], [.2, .3, .15], [.25, .3, .15], [1.254, .386, .13324]), spread: .0865 } };
const PISTOL_MAG_CLEAR: HandKey = { ...PISTOL_MAG_HAND, wrist: [-.06187, -.15927, .02909] };
const PISTOL_MAG_OUTSIDE: HandKey = { ...PISTOL_MAG_HAND, wrist: [-.145, -.15927, .02909] };
const PISTOL_CLEAR: HandKey = { space: 'grip', offset: [-.045, 0, 0] };
const pistolSwap = (retain: boolean): Choreography => [
  { t: .035, L: PISTOL_CLEAR },
  { t: .04, R: { space: 'grip', curl: { index: [-.08, .04, .02] } } },
  { t: .91, R: { space: 'grip', curl: { index: [-.08, .04, .02] } } },
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
  { t: .81, L: { space: 'part', part: 'release', wrist: [-.04228, -.04441, .04857],
    forward: [-.25798, .33335, -.90682], palm: [.95606, -.04722, -.28935],
    curl: { ...curl([.232, .2, .15], [.282, .25, .15], [.368, .25, .2], [.35, .25, -.1]), spread: -.2625 } }, parts: { slide: 1, release: 1 } },
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

type Vec = [number, number, number];
const add = (a: Vec, b: Vec, k = 1): Vec => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

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

// Contact keys live in the magazine's own frame, so its rotation and the paw
// cannot drift apart. These normalized phases also drive the nearby world rig.
export const M4_MAG_HAND: HandKey = { space: 'part', part: 'mag', wrist: [-.033, -.105, .042],
  forward: [.08, -.15, -1], palm: [1, .08, .05], curl: curl([.7, .65, .35], [.8, .7, .4], [.85, .7, .4], [.6, .45, .25]) };
const M4_SWAP: Choreography = [
  { t: 0, L: { space: 'grip' }, mag: { out: 0 } },
  { t: .12, p: [-.068, .105, .025], r: [.20, .22, -.36], ease: 'out',
    L: { space: 'gun', wrist: [-.063, -.073, .034], forward: [.08, -.15, -1], palm: [1, .08, .05], curl: OPEN } },
  { t: .17, L: M4_MAG_HAND },
  { t: .20, L: M4_MAG_HAND, mag: { out: 0 }, sfx: 'mag-out' },
  { t: .30, L: M4_MAG_HAND, mag: { out: .13, p: [-.008, 0, .01], r: [.06, 0, .04] }, ease: 'in' },
  { t: .40, L: M4_MAG_HAND, mag: { out: .39, p: [-.10, -.20, .10], r: [.24, -.18, .28] } },
  { t: .42, L: M4_MAG_HAND, mag: { visible: false, out: .39, p: [-.10, -.20, .10], r: [.24, -.18, .28] } },
  { t: .48, L: M4_MAG_HAND, mag: { visible: false, out: .39, p: [-.10, -.20, .10], r: [.24, -.18, .28] } },
  { t: .50, L: M4_MAG_HAND, mag: { out: .39, p: [-.10, -.20, .10], r: [.24, -.18, .28] } },
  { t: .60, L: M4_MAG_HAND, mag: { out: .16, p: [-.015, 0, .005], r: [.06, 0, .05] }, ease: 'out' },
  { t: .65, L: M4_MAG_HAND, mag: { out: .035 }, p: [-.068, .105, .025], r: [.20, .22, -.36] },
  { t: .70, L: M4_MAG_HAND, mag: { out: 0 }, ease: 'snap', sfx: 'mag-in' },
  { t: .712, L: M4_MAG_HAND, p: [-.069, .115, .024], r: [.225, .22, -.35], ease: 'snap' },
  { t: .74, p: [-.068, .105, .025], r: [.20, .22, -.36] },
];
export const M4_RELOAD_EMPTY: Choreography = [
  { t: 0, parts: { bolt: 1 } },
  ...M4_SWAP,
  { t: .78, L: { space: 'gun', wrist: [-.070, .002, .085], forward: [.08, .24, -1], palm: [1, 0, .08], curl: OPEN }, parts: { bolt: 1, release: 0 } },
  { t: .815, L: { space: 'gun', wrist: [-.041, .008, .080], forward: [.08, .24, -1], palm: [1, 0, .08], curl: OPEN }, parts: { bolt: 1, release: 1 }, ease: 'snap' },
  { t: .825, parts: { bolt: 0, release: 1 }, sfx: 'slide-home', ease: 'snap', p: [-.060, .103, .032], r: [.215, .20, -.31] },
  { t: .845, parts: { release: 0 } },
  { t: .94, L: { space: 'grip' }, p: [0, 0, 0], r: [0, 0, 0] },
];
export const M4_RELOAD_PARTIAL: Choreography = [
  ...M4_SWAP,
  { t: .83, L: { space: 'grip' } },
  { t: .94, p: [0, 0, 0], r: [0, 0, 0] },
];
export const m4Reload = (empty: boolean): Choreography => empty ? M4_RELOAD_EMPTY : M4_RELOAD_PARTIAL;
export const SMG_MAG_HAND: HandKey = { space: 'part', part: 'mag', wrist: [-.06202, -.22501, .02066],
  forward: [.99370, .07060, -.08700], palm: [-.06159, .99286, .10220],
  curl: { ...curl([.105, .3016, .141], [.2, .3, .15], [.25, .3, .15], [1.254, .1, -.1]), spread: .0865 } };
const SMG_MAG_CLEAR: HandKey = { ...SMG_MAG_HAND, wrist: [-.06202, -.25301, .02066] };
const SMG_MAG_OUTSIDE: HandKey = { ...SMG_MAG_HAND, wrist: [-.15202, -.25301, .02066] };
const SMG_CLEAR: HandKey = { space: 'grip', offset: [-.05, -.01, 0] };
const SMG_SWAP: Choreography = [
  { t: .035, L: SMG_CLEAR },
  { t: .07, R: { space: 'grip', curl: { index: [-.08, .03, .01] } }, p: [-.06, .055, .025], r: [.16, .15, -.32], ease: 'out' },
  { t: .08, L: { space: 'gun', wrist: [-.12, -.085, -.075], forward: [.1, .1, -1], palm: [1, 0, .1], curl: OPEN } },
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
const SMG_CHARGE_HAND: HandKey = { space: 'part', part: 'charge', wrist: [-.061, -.03261, .05069],
  forward: [.18036, .39273, -.90179], palm: [.98262, -.11280, .14740],
  curl: { ...curl([.4, 1.436, .784], [1.309, 1.236, .835], [1.3, 1.1, .8], [.6965, .1935, -.1]), spread: -.311425 } };
export const SMG_RELOAD_EMPTY: Choreography = [...SMG_SWAP,
  { t: .77, L: { space: 'gun', wrist: [-.145, .04, -.13], forward: [.1, .3, -1], palm: [1, -.1, .05], curl: OPEN } },
  { t: .805, L: SMG_CHARGE_HAND, parts: { charge: 0 } },
  { t: .845, L: SMG_CHARGE_HAND, parts: { charge: 1 }, sfx: 'slide-back' },
  { t: .86, L: SMG_CHARGE_HAND, parts: { charge: 1 } },
  { t: .87, L: { ...SMG_CHARGE_HAND, wrist: [-.086, -.03261, .05069] }, parts: { charge: 1 } },
  { t: .885, L: { space: 'gun', wrist: [-.145, .020, -.12], forward: [.1, .15, -1], palm: [1, 0, .05], curl: OPEN }, parts: { charge: 0 }, ease: 'snap', sfx: 'slide-home' },
  { t: .93, L: SMG_CLEAR },
];
export const SMG_RELOAD_PARTIAL: Choreography = [...SMG_SWAP,
  { t: .83, L: SMG_CLEAR },
  { t: .90, L: { space: 'grip' } },
];
const smgReloads = [SMG_RELOAD_PARTIAL, SMG_RELOAD_EMPTY].map(keys => [...keys].sort((a, b) => a.t - b.t));
export const smgReload = (empty: boolean): Choreography => smgReloads[empty ? 1 : 0];
const DMR_RELOAD = magSwap([0, -1, 0], [-.03, -.02, -.06], [
  // The firing paw works the charging handle on the right.
  { t: .74, R: { space: 'grip' } },
  { t: .8, R: { space: 'gun', wrist: [.085, .03, -.01], forward: [-.3, .25, -1], palm: [-1, 0, 0], curl: PINCH }, parts: { charge: 0 } },
  { t: .86, R: { space: 'gun', wrist: [.085, .03, .05], forward: [-.3, .25, -1], palm: [-1, 0, 0], curl: PINCH }, parts: { charge: 1 }, sfx: 'slide-back' },
  { t: .88, parts: { charge: 0 }, ease: 'snap', sfx: 'slide-home' },
  { t: .89, p: [-.02, .03, .03], r: [.14, .12, -.25], ease: 'snap' },
  { t: .9, L: { space: 'grip' } },
  { t: .97, R: { space: 'grip' } },
]);
const SNIPER_RELOAD: Choreography = [
  { t: .05, p: [-.02, .02, .01], r: [.08, .1, -.2], ease: 'out' },
  { t: .08, parts: { boltHand: 0, bolt: 0, boltPull: 0 } },
  { t: .14, parts: { boltHand: 1 } },
  { t: .2, parts: { bolt: 1 }, sfx: 'bolt-open' },
  { t: .27, parts: { boltPull: 1 }, sfx: 'bolt-back' },
  { t: .3, L: { space: 'gun', wrist: [-.03, -.03, -.05], forward: [.1, -.2, -1], palm: [1, 0, 0], curl: HOLD_MAG }, mag: { out: 0 } },
  { t: .38, L: { space: 'gun', wrist: [-.03, -.1, -.05], forward: [.1, -.2, -1], palm: [1, 0, 0], curl: HOLD_MAG }, mag: { out: .07 }, ease: 'in', sfx: 'mag-out' },
  { t: .47, L: { space: 'view', wrist: [-.22, -.5, -.02], forward: [.3, .4, -1], palm: [.9, 0, .2], curl: HOLD_MAG },
    mag: { visible: false, out: .1, p: [-.1, -.2, .06], r: [.3, .4, .7] } },
  { t: .53, mag: { visible: false, out: .26, p: [-.06, -.1, .03], r: [.2, 0, .3] } },
  { t: .54, mag: { visible: true, out: .26, p: [-.06, -.1, .03], r: [.2, 0, .3] } },
  { t: .63, L: { space: 'gun', wrist: [-.03, -.13, -.05], forward: [.1, -.2, -1], palm: [1, 0, 0], curl: HOLD_MAG }, mag: { out: .1, p: [0, 0, 0], r: [0, 0, 0] } },
  { t: .69, L: { space: 'gun', wrist: [-.03, -.03, -.05], forward: [.1, -.2, -1], palm: [1, 0, 0], curl: HOLD_MAG }, mag: { out: 0 }, ease: 'snap', sfx: 'mag-in' },
  { t: .78, L: { space: 'grip' }, parts: { boltPull: 1 } },
  { t: .84, parts: { boltPull: 0 } },
  { t: .89, parts: { bolt: 0 }, ease: 'snap', sfx: 'bolt-home' },
  { t: .9, p: [-.02, .025, .025], r: [.1, .1, -.18], ease: 'snap' },
  { t: .96, parts: { boltHand: 0 } },
];
// The left paw supports the crane, punches the rod, loads, then presses shut.
const REVOLVER_CYLINDER_HAND: HandKey = { space: 'part', part: 'cylinder', followRotation: false, wrist: [-.063398, -.035966, .025749],
  forward: [.120078, .379252, -.917469], palm: [.973055, .138274, .184511],
  curl: { ...curl([.45, 0, .49], [.325, -.045, .5866], [.328, .481, .324], [.05, .12, .145]), spread: -.6 } };
const REVOLVER_CYLINDER_OPEN: HandKey = { space: 'part', part: 'cylinder', followRotation: false, wrist: [-.064594, -.033152, .039456],
  forward: [.120078, .379252, -.917469], palm: [.973055, .138274, .184511],
  curl: { ...curl([.65875, .20525, .65185], [.805, -.1, .5843], [.53675, .65335, .706], [-.1, .42625, .06935]), spread: -.6 } };
const REVOLVER_EJECT_HAND: HandKey = { space: 'part', part: 'action', wrist: [.051772, .039267, -.055277],
  forward: [-.698141, -.205702, -.685774], palm: [-.70227, .383164, .600002],
  curl: { ...curl([.05, .1, .1], [.05, .1, .1], [.05, .1, .1], [.853425, .092898, .10771]), spread: .097656 } };
const REVOLVER_EJECT_PRESS: HandKey = { space: 'part', part: 'action', wrist: [0.043131, 0.057794, -0.057921],
  forward: [-0.412614, -0.589249, -0.694648], palm: [-0.846523, 0.529654, 0.053537],
  curl: { ...curl([0.169244, 0.105449, 0.102144], [0.05, 0.1, 0.1], [0.05, 0.1, 0.1], [1.388888, 0.092429, 0.10771]), spread: -0.270429 } };
const REVOLVER_EJECT_APPROACH: HandKey = { space: 'gun', wrist: [-.145, .12, -.095],
  forward: [.011454, -.727725, -.685774], palm: [-.557057, -.574182, .600002],
  curl: { ...curl([.05, .1, .1], [.05, .1, .1], [.05, .1, .1], [.853425, .092898, .10771]), spread: .097656 } };
const REVOLVER_EJECT_CLEAR: HandKey = { ...REVOLVER_EJECT_APPROACH, wrist: [-.145, .105, -.070] };
const REVOLVER_CYLINDER_CLEAR: HandKey = { space: 'gun', wrist: [-.145, .008, -.005],
  forward: [.120078, .379252, -.917469], palm: [.973055, .138274, .184511], curl: OPEN };
export const REVOLVER_LOADER_HAND: HandKey = { space: 'part', part: 'mag', wrist: [-.077918, .034115, .077085],
  forward: [.924307, -.346149, .160737], palm: [.014522, -.388962, -.921139],
  curl: { ...curl([.9, 1.46, -.1], [1.1232, .4488, -.1], [1.38, -.1, -.1], [-.04, .58, .86]), spread: .35 } };
export const REVOLVER_RELOAD: Choreography = [
  { t: 0, mag: { visible: false }, parts: { swing: 0, spent: 0, fresh: 0, loaded: 0 } },
  { t: .05, R: { space: 'grip', curl: { index: [-.08, .04, .02] } } },
  { t: .08, p: [-.045, .035, .025], r: [.20, .25, -.25], ease: 'out',
    L: { ...REVOLVER_CYLINDER_HAND, wrist: [-.10, -.035966, .025749] } },
  { t: .12, L: REVOLVER_CYLINDER_HAND, parts: { release: 1, swing: 0 } },
  { t: .17, L: REVOLVER_CYLINDER_HAND, parts: { swing: 1, release: 0 }, ease: 'out' },
  { t: .19, L: REVOLVER_CYLINDER_OPEN, parts: { swing: 1, release: 0 }, sfx: 'cylinder-open', ease: 'out' },
  { t: .23, L: REVOLVER_CYLINDER_CLEAR },
  { t: .255, L: REVOLVER_EJECT_APPROACH },
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
  { t: .92, L: { space: 'gun', wrist: [-.09, -.065, .055], forward: [.15, .2, -1], palm: [1, 0, .1], curl: OPEN } },
  { t: .96, L: { space: 'grip' }, R: { space: 'grip' }, p: [0, 0, 0], r: [0, 0, 0] },
  { t: .999, mag: { visible: false }, parts: { spent: 1, fresh: 1, loaded: 1 } },
];
// One shell per cycle; the gun's cant is held separately while the reload lasts.
const SHOTGUN_SHELL: Choreography = [
  { t: 0, mag: { visible: false } },
  { t: .2, L: { space: 'view', wrist: [-.18, -.46, -.04], forward: [.3, .5, -1], palm: [.8, .2, .2], curl: PINCH }, mag: { visible: false } },
  { t: .32, mag: { visible: true, p: [-.04, -.1, .07] } },
  { t: .55, L: { space: 'gun', wrist: [-.02, -.09, .06], forward: [.25, .6, -1], palm: [.3, .9, 0], curl: PINCH }, mag: { p: [0, -.028, .025] } },
  { t: .7, L: { space: 'gun', wrist: [-.02, -.065, .015], forward: [.25, .6, -1], palm: [.3, .9, 0], curl: PINCH }, mag: { out: .045, p: [0, 0, 0] }, sfx: 'shell-in' },
  { t: .72, mag: { visible: false, out: .06 } },
  { t: .98, L: { space: 'grip' } },
];
const COCO_RELOAD: Choreography = [
  { t: .08, p: [-.05, .03, .03], r: [-.1, .2, .22], ease: 'out' },
  { t: .06, mag: { visible: false } },
  { t: .12, L: { space: 'view', wrist: [-.22, -.48, -.02], forward: [.3, .5, -1], palm: [.8, .2, .2], curl: HOLD_MAG } },
  { t: .42, mag: { visible: false, p: [-.09, .1, .06] } },
  { t: .43, mag: { visible: true, p: [-.09, .1, .06] } },
  { t: .55, L: { space: 'gun', wrist: [-.1, .12, .09], forward: [.6, .2, -1], palm: [.5, -.8, 0], curl: HOLD_MAG }, mag: { p: [-.02, .05, .01] } },
  { t: .64, L: { space: 'gun', wrist: [-.075, .16, .08], forward: [.6, .1, -1], palm: [.3, -1, 0], curl: OPEN }, mag: { p: [0, 0, 0] }, ease: 'in', sfx: 'coconut-in' },
  { t: .7, p: [-.05, .03, .03], r: [-.1, .2, .22] },
  { t: .78, L: { space: 'grip' }, p: [-.03, .01, .04], r: [.05, .15, .1] },
  { t: .8, parts: { pump: 0 } },
  { t: .86, parts: { pump: 1 }, sfx: 'pump-back' },
  { t: .92, parts: { pump: 0 }, ease: 'snap', sfx: 'pump-home' },
];
// After each stone: fetch a new one and draw back to the anchor.

export const RELOADS: Partial<Record<WeaponId, Choreography>> = {
  pistol: PISTOL_RELOAD_EMPTY, m4: M4_RELOAD_EMPTY, smg: SMG_RELOAD_EMPTY, dmr: DMR_RELOAD, sniper: SNIPER_RELOAD,
  revolver: REVOLVER_RELOAD, shotgun: SHOTGUN_SHELL, coco: COCO_RELOAD,
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
    { t: .24, p: [-.035, .018, .025], r: [.12, -.60, .20], ease: 'out' },
    { t: .46, p: [-.035, .018, .025], r: [.13, -.66, .22] },
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
    { t: .08, R: { space: 'grip', curl: { index: [-.08, .04, .02] } } },
    { t: .88, R: { space: 'grip', curl: { index: [-.08, .04, .02] } } },
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
