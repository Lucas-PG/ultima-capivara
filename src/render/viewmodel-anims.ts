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
export const M4_MAG_HAND: HandKey = {space: 'part', part: 'mag', wrist: [-0.048025, -0.209705, 0.014781], forward: [0.096382, 0.866301, -0.490135], palm: [0.990179, -0.03335, 0.135767], curl: {index: [1.586385, 0.71908, 0.372844], middle: [1.7, 1.7, 0.446858], ring: [1.631273, 1.641896, 0.441123], thumb: [0.745295, 0.977314, 0.245617], spread: 0.193682}};
const M4_SEAT_HAND: HandKey = {space: 'part', part: 'mag', wrist: [-0.034137, -0.253842, -0.043832], forward: [0.943698, 0.267645, -0.194425], palm: [-0.230288, 0.953439, 0.194736], curl: {index: [0.1, 0.15, 0.1], middle: [0.1, 0.15, 0.1], ring: [0.12, 0.15, 0.1], thumb: [0.1, 0.1, 0.1], spread: 0.2}};
const M4_CATCH_HAND: HandKey = {space: 'gun', wrist: [-0.042108, -0.06803, 0.102531], forward: [-0.094787, 0.759023, -0.644128], palm: [0.893112, 0.350652, 0.281771], curl: {index: [0.2, 0.25, 0.1], middle: [0.2, 0.25, 0.1], ring: [0.204994, 0.248438, 0.1], thumb: [0.1, 0.1, 0.1], spread: 0.2 }, pole: [-1, -.25, .3] };
const M4_TRIGGER_CLEAR: HandKey = { space: 'gun', curl: {index: [0.12, 0.15, 0.1], middle: [0.927018, 0.599134, 1.024462], ring: [1.7, 0.299979, -0.1], thumb: [0.082804, -0.095181, 0.078912], spread: 0.342322} };
const M4_SUPPORT_RELEASE: HandKey = {"space": "gun", "wrist": [-0.055957, 0.057106, -0.118615], "curl": {"index": [-0.1, -0.1, -0.1], "middle": [0.2, 0.15, 0.1], "ring": [0.2, 0.15, 0.1], "thumb": [0.604244, -0.272554, 0.06363], "spread": 0.053322}};
const M4_SWAP: Choreography = [
  { t: 0, L: { space: 'grip' }, mag: { out: 0 } },
  { t: .015, L: M4_SUPPORT_RELEASE },
  { t: .035, L: { ...M4_SUPPORT_RELEASE, wrist: [-.13, 0.057106, -0.118615] } },
  { t: .06, R: M4_TRIGGER_CLEAR },
  { t: .10, p: [-.068, .065, .025], r: [.20, .22, -.36], ease: 'out',
    L: { space: 'gun', wrist: [-.115, -.06, -.12], forward: [.08, .6, -.8], palm: [1, 0, .08], curl: OPEN } },
  { t: .15, L: { ...M4_MAG_HAND, wrist: [-.085, -.209705, .014781] } },
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
  { t: .709, L: { ...M4_MAG_HAND, wrist: [-.13, -.209705, .014781], curl: OPEN } },
  { t: .72, L: { ...M4_MAG_HAND, wrist: [-.17, -.31, -.045], curl: OPEN } },
  { t: .733, L: { ...M4_SEAT_HAND, wrist: [-.15, -.29, -.044] } },
  { t: .75, L: { ...M4_SEAT_HAND, wrist: [-.034137, -.276, -.043832] } },
  { t: .77, L: M4_SEAT_HAND, mag: { out: 0 }, ease: 'snap', sfx: 'mag-in' },
  { t: .775, p: [-.069, .076, .024], r: [.225, .22, -.35], ease: 'snap' },
  { t: .785, L: { ...M4_SEAT_HAND, wrist: [-.055, -.28, -.043832] } },
  { t: .795, p: [-.068, .065, .025], r: [.20, .22, -.36] },
];
export const M4_RELOAD_EMPTY: Choreography = [
  { t: 0, parts: { bolt: 1 } },
  ...M4_SWAP,
  { t: .807, L: { ...M4_SEAT_HAND, space: 'gun', wrist: [-.135, -.25, -.115] } },
  { t: .83, L: { ...M4_CATCH_HAND, wrist: [-.13, -.07, .07] }, parts: { bolt: 1, release: 0 } },
  { t: .86, L: M4_CATCH_HAND, parts: { bolt: 1, release: 1 }, ease: 'snap' },
  { t: .87, parts: { bolt: 0, release: 1 }, sfx: 'slide-home', ease: 'snap', p: [-.06, .063, .032], r: [.215, .20, -.31] },
  { t: .884, parts: { release: 0 } },
  { t: .902, L: { ...M4_CATCH_HAND, wrist: [-.13, -.07, .07] } },
  { t: .938, L: { ...M4_SUPPORT_RELEASE, wrist: [-.13, 0.057106, -0.118615] } },
  { t: .958, L: M4_SUPPORT_RELEASE },
  { t: .97, L: { space: 'grip' }, R: { space: 'grip' }, p: [0, 0, 0], r: [0, 0, 0] },
];
export const M4_RELOAD_PARTIAL: Choreography = [
  ...M4_SWAP,
  { t: .813, L: { ...M4_SEAT_HAND, space: 'gun', wrist: [-.135, -.25, -.115] } },
  { t: .87, L: { ...M4_SUPPORT_RELEASE, wrist: [-.13, 0.057106, -0.118615] } },
  { t: .901, L: M4_SUPPORT_RELEASE },
  { t: .94, L: { space: 'grip' }, R: { space: 'grip' } },
  { t: .96, p: [0, 0, 0], r: [0, 0, 0] },
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
export const DMR_MAG_HAND: HandKey = {space: "part", part: "mag", wrist: [-0.050175, -0.160768, 0.023229], forward: [0.109983, 0.926697, -0.359354], palm: [0.9769, -0.034138, 0.210951], curl: {index: [1.349937, 0.482453, 0.351455], middle: [1.7, 1.7, 0.447], ring: [1.7, 1.7, 0.44], thumb: [0.781299, 0.91152, 0.246083], spread: 0.174935}};
export const DMR_CHARGE_HAND: HandKey = {space: "part", part: "charge", wrist: [0.064112, -0.062461, 0.040238], forward: [-0.100371, 0.883821, -0.456931], palm: [-0.896322, -0.279676, -0.344076], curl: {index: [1.010944, 0.560632, 0.644719], middle: [1.593198, 0.231539, 0.8], ring: [1.3, 1.1, 0.8], thumb: [0.27295, 0.164685, 0.174024], spread: -0.6}};
const DMR_SUPPORT_RELEASE: HandKey = {"space": "gun", "wrist": [-0.059203, 0.074558, -0.161451], "curl": {"index": [-0.078418, -0.097227, 0.578059], "middle": [0.2, 0.15, 0.1], "ring": [0.2, 0.15, 0.1], "thumb": [0.939737, -0.251783, 0.264329], "spread": 0.242199}};
const DMR_SWAP: Choreography = [
  { t: .015, L: DMR_SUPPORT_RELEASE },
  { t: .035, L: { ...DMR_SUPPORT_RELEASE, wrist: [-0.15, 0.074558, -0.161451] } },
  { t: .08, p: [-.065, .085, .02], r: [.12, .28, -.30], ease: 'out', L: { space: 'gun', wrist: [-0.15, 0.074558, -0.161451] } },
  { t: .13, L: { ...DMR_MAG_HAND, wrist: [-0.11, -0.160768, 0.023229] } },
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
  { t: .708, p: [-.067, .098, .022], r: [.15, .28, -.28] },
  { t: .735, L: { ...DMR_MAG_HAND, wrist: [-0.15, -0.160768, 0.023229], curl: OPEN } },
  { t: .77, L: { space: 'gun', wrist: [-.15, -.12, -.17] } },
  { t: .81, L: { ...DMR_SUPPORT_RELEASE, wrist: [-0.15, 0.074558, -0.161451] } },
  { t: .825, L: DMR_SUPPORT_RELEASE },
  { t: .84, L: { space: 'grip' } },
];
const DMR_RELOAD_PARTIAL: Choreography = [...DMR_SWAP,
  { t: .94, p: [0, 0, 0], r: [0, 0, 0] },
];
const DMR_RELOAD_EMPTY: Choreography = [...DMR_SWAP.map(key => ({ ...key, t: key.t * .86 })),
  { t: .725, R: { space: 'grip' } },
  { t: .765, R: { space: 'gun', wrist: [0.16, -0.05018, 0.10291], curl: OPEN } },
  { t: .80, R: { ...DMR_CHARGE_HAND, wrist: [0.149112, -0.062461, 0.040238] }, parts: { charge: 0 } },
  { t: .83, R: DMR_CHARGE_HAND, parts: { charge: 0 } },
  { t: .89, R: DMR_CHARGE_HAND, parts: { charge: 1 }, sfx: 'slide-back' },
  { t: .915, R: DMR_CHARGE_HAND, parts: { charge: 0 }, ease: 'snap', sfx: 'slide-home' },
  { t: .945, R: { ...DMR_CHARGE_HAND, wrist: [0.149112, -0.062461, 0.040238], curl: OPEN } },
  { t: .985, R: { space: 'gun', wrist: [0.16, -0.05018, 0.10291] } },
  { t: 1, R: { space: 'grip' }, p: [0, 0, 0], r: [0, 0, 0] },
];
export const dmrReload = (empty: boolean): Choreography => empty ? DMR_RELOAD_EMPTY : DMR_RELOAD_PARTIAL;

export const SNIPER_MAG_HAND: HandKey = {space: "part", part: "mag", wrist: [-0.066532, -0.137539, 0.023697], forward: [0.225781, 0.849056, -0.477626], palm: [0.865008, 0.050785, 0.499181], curl: {index: [1.196701, 0.725765, 0.445857], middle: [1.587534, 1.224863, 0.381687], ring: [1.7, 1.7, 0.44], thumb: [0.90276, 1.2, 0.37329], spread: 0.03666}};
export const SNIPER_BOLT_HAND: HandKey = { ...{space: "part", part: "bolt", wrist: [0.099465, -0.090861, 0.064821], forward: [-0.106178, 0.840785, -0.530856], palm: [-0.882864, -0.325333, -0.338689], curl: {index: [0.826277, 1.076612, -0.1], middle: [1.7, 0.548489, 0.8], ring: [1.3, 1.1, 0.8], thumb: [0.447496, -0.039733, -0.074656], spread: -0.6}}, pole: [1, -.35, .2] };
// A complete four-beat bolt stroke, anchored to the actual moving knob.
export const SNIPER_CYCLE: Choreography = [
  { t: .08, R: { space: 'gun', wrist: [0.16, -0.076478, 0.107616], curl: OPEN }, parts: { bolt: 0, boltPull: 0 } },
  { t: .15, R: { ...SNIPER_BOLT_HAND, wrist: [0.184465, -0.090861, 0.064821] } },
  { t: .22, R: SNIPER_BOLT_HAND, parts: { bolt: 0 } },
  { t: .34, R: SNIPER_BOLT_HAND, parts: { bolt: 1 }, sfx: 'bolt-open' },
  { t: .49, R: SNIPER_BOLT_HAND, parts: { boltPull: 1 }, sfx: 'bolt-back' },
  { t: .56, R: SNIPER_BOLT_HAND, parts: { boltPull: 1 } },
  { t: .72, R: SNIPER_BOLT_HAND, parts: { bolt: 1, boltPull: 0 } },
  { t: .84, R: SNIPER_BOLT_HAND, parts: { bolt: 0 }, ease: 'snap', sfx: 'bolt-home' },
  { t: .9, R: { ...SNIPER_BOLT_HAND, wrist: [0.184465, -0.090861, 0.064821], curl: OPEN } },
  { t: .95, R: { space: 'gun', wrist: [0.16, -0.076478, 0.107616] } },
  { t: 1, R: { space: 'grip' } },
];
const SNIPER_SUPPORT_RELEASE: HandKey = {"space": "gun", "wrist": [-0.056517, 0.062581, -0.187296], "curl": {"index": [-0.1, -0.1, 0.417678], "middle": [0.2, 0.15, 0.1], "ring": [0.2, 0.15, 0.1], "thumb": [0.779821, -0.02272, 0.283248], "spread": 0.67787}};
function sniperMagazine(start: number, end: number): Choreography {
  const at = (u: number) => start + (end - start) * u;
  return [
    { t: at(0), L: SNIPER_SUPPORT_RELEASE },
    { t: at(.035), L: { ...SNIPER_SUPPORT_RELEASE, wrist: [-0.15, 0.062581, -0.187296] } },
    { t: at(.09), L: { ...SNIPER_MAG_HAND, wrist: [-0.13, -0.137539, 0.023697] } },
    { t: at(.15), L: SNIPER_MAG_HAND, mag: { out: 0 } },
    { t: at(.2), L: SNIPER_MAG_HAND, mag: { out: 0 }, sfx: 'mag-out' },
    { t: at(.32), L: SNIPER_MAG_HAND, mag: { out: .12 } },
    { t: at(.42), L: SNIPER_MAG_HAND, mag: { out: .30, p: [-.07, -.15, .05], r: [.15, 0, .2] } },
    { t: at(.44), L: SNIPER_MAG_HAND, mag: { visible: false, out: .30, p: [-.07, -.15, .05], r: [.15, 0, .2] } },
    { t: at(.51), L: SNIPER_MAG_HAND, mag: { visible: false, out: .30, p: [-.07, -.15, .05], r: [.15, 0, .2] } },
    { t: at(.53), L: SNIPER_MAG_HAND, mag: { out: .30, p: [-.07, -.15, .05], r: [.15, 0, .2] } },
    { t: at(.68), L: SNIPER_MAG_HAND, mag: { out: .10 } },
    { t: at(.78), L: SNIPER_MAG_HAND, mag: { out: 0 }, ease: 'snap', sfx: 'mag-in' },
    { t: at(.85), L: { ...SNIPER_MAG_HAND, wrist: [-0.15, -0.137539, 0.023697], curl: OPEN } },
    { t: at(.9), L: { space: 'gun', wrist: [-.15, -.10, -.20] } },
    { t: at(.95), L: { ...SNIPER_SUPPORT_RELEASE, wrist: [-0.15, 0.062581, -0.187296] } },
    { t: at(.975), L: SNIPER_SUPPORT_RELEASE },
    { t: at(1), L: { space: 'grip' } },
  ];
}
const SNIPER_RELOAD_PARTIAL: Choreography = [
  { t: .08, p: [-.055, .07, .018], r: [.1, .22, -.26], ease: 'out' },
  ...sniperMagazine(.09, .89),
  { t: .98, p: [0, 0, 0], r: [0, 0, 0] },
];
const SNIPER_RELOAD_EMPTY: Choreography = [
  { t: .05, p: [-.055, .07, .018], r: [.1, .22, -.26], ease: 'out', R: { space: 'gun', wrist: [0.16, -0.076478, 0.107616], curl: OPEN } },
  { t: .085, R: { ...SNIPER_BOLT_HAND, wrist: [0.184465, -0.090861, 0.064821] }, parts: { bolt: 0, boltPull: 0 } },
  { t: .12, R: SNIPER_BOLT_HAND, parts: { bolt: 0 } },
  { t: .17, R: SNIPER_BOLT_HAND, parts: { bolt: 1 }, sfx: 'bolt-open' },
  { t: .23, R: SNIPER_BOLT_HAND, parts: { boltPull: 1 }, sfx: 'bolt-back' },
  { t: .26, R: { ...SNIPER_BOLT_HAND, wrist: [0.184465, -0.090861, 0.064821], curl: OPEN } },
  { t: .285, R: { space: 'gun', wrist: [0.16, -0.076478, 0.107616] } },
  { t: .31, R: { space: 'grip' } },
  { t: .315, L: { space: 'grip' } },
  ...sniperMagazine(.33, .82),
  { t: .825, R: { space: 'grip' } },
  { t: .845, R: { space: 'gun', wrist: [0.16, -0.076478, 0.107616], curl: OPEN } },
  { t: .865, R: { ...SNIPER_BOLT_HAND, wrist: [0.184465, -0.090861, 0.104821] } },
  { t: .89, R: SNIPER_BOLT_HAND, parts: { boltPull: 1 } },
  { t: .935, R: SNIPER_BOLT_HAND, parts: { bolt: 1, boltPull: 0 }, sfx: 'bolt-home' },
  { t: .96, R: SNIPER_BOLT_HAND, parts: { bolt: 0 }, ease: 'snap' },
  { t: .975, R: { ...SNIPER_BOLT_HAND, wrist: [0.184465, -0.090861, 0.064821], curl: OPEN } },
  { t: .99, R: { space: 'gun', wrist: [0.16, -0.076478, 0.107616] } },
  { t: 1, R: { space: 'grip' }, p: [0, 0, 0], r: [0, 0, 0] },
];
export const sniperReload = (empty: boolean): Choreography => empty ? SNIPER_RELOAD_EMPTY : SNIPER_RELOAD_PARTIAL;
const REVOLVER_CYLINDER_HAND: HandKey = { space: 'part', part: 'cylinder', followRotation: false, wrist: [-.063398, -.035966, .025749],
  forward: [.120078, .379252, -.917469], palm: [.973055, .138274, .184511],
  curl: { ...curl([.45, 0, .49], [.325, -.045, .5866], [.328, .481, .324], [.05, .12, .145]), spread: -.6 } };
const REVOLVER_CYLINDER_OPEN: HandKey = { space: 'part', part: 'cylinder', followRotation: false, wrist: [-.064594, -.033152, .039456],
  forward: [.120078, .379252, -.917469], palm: [.973055, .138274, .184511],
  curl: { ...curl([.65875, .20525, .65185], [.805, -.1, .5843], [.53675, .65335, .706], [-.1, .42625, .06935]), spread: -.6 } };
// Follow the rod position, keeping the paw clear regardless of cylinder spin.
const REVOLVER_EJECT_HAND: HandKey = { space: 'part', part: 'action', followRotation: false, wrist: [-0.088316, -0.039317, -0.100332],
  forward: [0.987534, 0.100769, -0.120923], palm: [0.121529, 0.000122, 0.992588], pole: [-1, -.2, -.1],
  curl: { ...curl([0.6532, -0.1, 0.441494], [0.164948, 0.205314, 0.141002], [0.046324, 0.10041, 0.10022], [0.4, 0.15, 0.15]), spread: -.2 } };
const REVOLVER_EJECT_PRESS: HandKey = { ...REVOLVER_EJECT_HAND };
const REVOLVER_EJECT_APPROACH: HandKey = { ...REVOLVER_EJECT_HAND, space: 'gun', wrist: [-.18, .001, -.185] };
const REVOLVER_EJECT_CLEAR: HandKey = { ...REVOLVER_EJECT_APPROACH, wrist: [-.18, .001, -.090] };
const REVOLVER_CYLINDER_CLEAR: HandKey = { space: 'gun', wrist: [-.145, .008, -.005],
  forward: [.120078, .379252, -.917469], palm: [.973055, .138274, .184511], curl: OPEN };
export const REVOLVER_LOADER_HAND: HandKey = { space: 'part', part: 'mag', wrist: [-.066680, .051711, .059228],
  forward: [0.83925, -0.498163, -0.21793], palm: [-0.177945, 0.127097, -0.975798],
  curl: { ...curl([1.137208, 1.590752, -.1], [1.7, .216684, -.1], [.83, -.065, .074], [.286, -.009, .38]), spread: -.6 } };
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
  { t: .27, L: { ...REVOLVER_EJECT_HAND, wrist: [-.08831, -.039308, -.120332] } },
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
  { t: .94, L: { space: 'grip', offset: [-.025, 0, 0] } },
  { t: .96, L: { space: 'grip' }, R: { space: 'grip' }, p: [0, 0, 0], r: [0, 0, 0] },
  { t: .999, mag: { visible: false }, parts: { spent: 1, fresh: 1, loaded: 1 } },
];
// One shell per cycle; the gun's cant is held separately while the reload lasts.
export const SHOTGUN_SHELL_HAND: HandKey = {space: "part", part: "mag", wrist: [-0.071047, -0.055894, 0.031512], forward: [0.857025, -0.146583, -0.493986], palm: [0.399395, 0.794695, 0.457104], curl: {index: [0.382089, 0.850316, 0.130138], middle: [1.313641, 1.232602, 0.6], ring: [1.200465, 1.000042, 0.6], thumb: [0.857916, 0.07711, 0.175881], spread: -0.154593}};
const SHOTGUN_PUSH_HAND: HandKey = {wrist: [-0.049022, -0.064088, 0.033021], forward: [0.799141, -0.112196, -0.590581], palm: [0.532349, 0.588445, 0.608554], pole: [-1, -0.2, 0.3], curl: {index: [0.345101, 0.252126, 0.192652], middle: [1.354021, 1.376316, 0.599732], ring: [1.028833, 1.266842, 0.600874], thumb: [0.750224, -0.1, -0.09105], spread: -0.05879}, space: "part", part: "mag"};
const SHOTGUN_SHELL: Choreography = [
  { t: 0, mag: { visible: false, p: [0, -.016, 0] } },
  { t: .065, L: { space: 'gun', wrist: [-.04829, -.090082, -.255699] } },
  { t: .12, L: { space: 'gun', wrist: [-.15, -.090082, -.255699] }, mag: { visible: false, p: [-.10, -.25, .07] } },
  { t: .26, L: SHOTGUN_SHELL_HAND, mag: { visible: false, p: [-.10, -.25, .07] } },
  { t: .29, L: SHOTGUN_SHELL_HAND, mag: { p: [-.10, -.25, .07] } },
  { t: .48, L: SHOTGUN_SHELL_HAND, mag: { p: [0, -.045, .018] } },
  { t: .52, L: SHOTGUN_SHELL_HAND, mag: { out: .02, p: [0, -.03, 0] } },
  { t: .56, L: SHOTGUN_PUSH_HAND, mag: { out: .02, p: [0, -.016, 0] } },
  // Uncurl below the gate, lift into the tube axis, then push the case head.
  { t: .62, L: SHOTGUN_PUSH_HAND, mag: { out: .02, p: [0, .019, 0] } },
  { t: .70, L: SHOTGUN_PUSH_HAND, mag: { out: .065, p: [0, .019, 0] }, ease: 'snap', sfx: 'shell-in' },
  { t: .74, L: SHOTGUN_PUSH_HAND, mag: { out: .085, p: [0, .019, 0] } },
  { t: .78, L: { ...SHOTGUN_PUSH_HAND, wrist: [-.13, -.15, .033021] }, mag: { visible: false, out: .095, p: [0, .019, 0] } },
  { t: .85, L: { space: 'gun', wrist: [-.15, -.090082, -.255699] } },
  { t: .92, L: { space: 'gun', wrist: [-.04829, -.090082, -.255699] } },
  { t: 1, L: { space: 'grip' }, mag: { visible: false } },
];

export const COCO_FRUIT_HAND: HandKey = {space: "part", part: "mag", wrist: [-0.092022, -0.020249, 0.067966], forward: [0.889325, 0.0343, -0.455987], palm: [0.280517, 0.746583, 0.60326], curl: {index: [1.441798, -0.1, 0.4], middle: [1.286589, -0.1, 0.5], ring: [-0.1, -0.1, -0.1], thumb: [-0.1, -0.098199, 0.016256], spread: -0.6}};
function makeCocoReload(ammo: number): Choreography {
  const keys: import('./viewmodel-choreo').Key[] = [
    { t: 0, mag: { visible: false, p: [-.23, -.42, .08] }, parts: { load1: ammo >= 3 ? 1 : 0, load2: ammo >= 2 ? 1 : 0 } },
    { t: .025, L: { space: 'gun', wrist: [-.049897, -.107384, -.246142] } },
    { t: .06, p: [-.055, -.03, -.10], r: [-.04, .15, -.025], ease: 'out', L: { space: 'gun', wrist: [-.18, -.107384, -.246142] } },
  ];
  const drop = (t: number, slot: number) => {
    const z = -slot * .09;
    keys.push(
      { t, L: COCO_FRUIT_HAND, mag: { visible: false, p: [-.23, -.42, z + .08] } },
      { t: t + .018, L: COCO_FRUIT_HAND, mag: { p: [-.23, -.42, z + .08] } },
      { t: t + .055, L: COCO_FRUIT_HAND, mag: { p: [-.23, .17, z] } },
      { t: t + .072, L: COCO_FRUIT_HAND, mag: { p: [0, .17, z] } },
      { t: t + .096, L: { ...COCO_FRUIT_HAND, wrist: [-.19, -.028, .067], curl: OPEN }, mag: { p: [0, .17, z] } },
      { t: t + .132, L: { space: 'gun', wrist: [-.32, .38, z + .065], curl: OPEN }, mag: { p: [0, 0, z] }, ease: 'in', sfx: 'coconut-in' },
      { t: t + .15, L: { space: 'gun', wrist: [-.32, -.16, z + .065], curl: OPEN }, mag: { visible: slot === 0, p: [0, 0, z] } },
    );
    if (slot) keys.push({ t: t + .131, parts: { ['load' + slot]: 0 } }, { t: t + .132, parts: { ['load' + slot]: 1 } });
  };
  if (ammo === 0) {
    drop(.08, 2); drop(.245, 1); drop(.41, 0);
    keys.push(
      { t: .57, L: { space: 'gun', wrist: [-.049897, -.107384, -.246142] } },
      { t: .595, L: { space: 'grip' }, parts: { pump: 0 } },
      { t: .63, L: { space: 'grip' }, mag: { p: [0, 0, 0] }, parts: { pump: 1 }, sfx: 'pump-back' },
      { t: .65, mag: { p: [0, -.045, 0] } },
      { t: .66, mag: { visible: false }, parts: { pump: 0 }, ease: 'snap', sfx: 'pump-home' },
      { t: .685, L: { space: 'gun', wrist: [-.049897, -.107384, -.246142] } },
      { t: .70, L: { space: 'gun', wrist: [-.18, -.107384, -.246142] } },
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
    { t: .91, L: { space: 'gun', wrist: [-.18, -.107384, -.246142] }, mag: { p: [0, 0, 0] } },
    { t: .94, L: { space: 'gun', wrist: [-.049897, -.107384, -.246142] } },
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
    { t: .08, R: { space: 'grip', curl: { index: [-.08, .04, .02] } } },
    { t: .88, R: { space: 'grip', curl: { index: [-.08, .04, .02] } } },
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
