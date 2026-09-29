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

const PISTOL_RELOAD: Choreography = [
  // Cant the gun toward the support paw and show the well.
  { t: .1, p: [-.085, .065, .03], r: [.35, .16, -.55], ease: 'out' },
  { t: .09, L: { space: 'view', wrist: [-.13, -.3, -.12], forward: [.3, .5, -1], palm: [.8, 0, .3], curl: OPEN } },
  // Release: the empty magazine slides and drops away.
  { t: .12, mag: { out: .01 }, sfx: 'mag-out' },
  { t: .2, mag: { out: .1, p: [.01, -.03, .01], r: [.25, 0, .15] }, ease: 'in' },
  { t: .3, mag: { visible: false, out: .16, p: [.03, -.32, .06], r: [1.1, .3, .7] }, ease: 'in', sfx: 'mag-drop' },
  // Paw to the belt and back with a fresh magazine.
  { t: .3, L: { space: 'view', wrist: [-.2, -.52, .02], forward: [.2, .8, -.4], palm: [.9, 0, .2], curl: HOLD_MAG } },
  { t: .4, mag: { visible: false, out: .3, p: [-.06, -.2, .05], r: [0, 0, .5] } },
  { t: .41, mag: { visible: true, out: .3, p: [-.06, -.2, .05], r: [0, 0, .5] } },
  { t: .5, L: { space: 'gun', wrist: [-.075, -.33, .06], forward: [.35, .9, -.15], palm: [1, 0, .1], curl: HOLD_MAG } },
  { t: .5, mag: { out: .14, p: [-.03, -.03, .012], r: [0, 0, .25] } },
  { t: .58, L: { space: 'gun', wrist: [-.048, -.24, .04], forward: [.15, .95, -.15], palm: [1, 0, .05], curl: HOLD_MAG } },
  { t: .58, mag: { out: .06, p: [0, 0, 0], r: [0, 0, 0] } },
  // Seat it with the heel of the paw.
  { t: .65, L: { space: 'gun', wrist: [-.045, -.175, .025], forward: [.15, .95, -.15], palm: [1, 0, .05], curl: HOLD_MAG }, ease: 'snap' },
  { t: .65, mag: { out: 0 }, ease: 'snap', sfx: 'mag-in' },
  { t: .63, p: [-.085, .065, .03], r: [.35, .16, -.55] },
  { t: .67, p: [-.09, .08, .025], r: [.4, .16, -.52], ease: 'snap' },
  // Rack the slide over the top, then let it snap home.
  { t: .74, p: [-.07, .0, .05], r: [.05, .38, -.08] },
  { t: .74, L: { space: 'gun', wrist: [-.095, .05, .085], forward: [1, .15, -.2], palm: [.25, -1, 0], curl: PINCH } },
  { t: .8, L: { space: 'gun', wrist: [-.095, .05, .12], forward: [1, .15, -.2], palm: [.25, -1, 0], curl: PINCH } },
  { t: .74, parts: { slide: 0 } },
  { t: .8, parts: { slide: .03 }, sfx: 'slide-back' },
  { t: .83, parts: { slide: 0 }, ease: 'snap', sfx: 'slide-home' },
  { t: .83, p: [-.065, .012, .065], r: [.12, .38, -.06], ease: 'snap' },
  { t: .87, L: { space: 'gun', wrist: [-.12, .02, .15], forward: [1, .1, -.3], palm: [.3, -1, 0], curl: OPEN } },
  { t: .97, L: { space: 'grip' } },
];

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
const M4_TRIGGER_CLEAR: HandKey = { space: 'gun', curl: {index: [0.12, 0.15, 0.1], middle: [1.640656, 0.978047, 0.615716], ring: [1.157106, 0.842412, 0.390713], thumb: [0.44918, 0.426999, 0.725114], spread: 0.237084} };
const M4_SWAP: Choreography = [
  { t: 0, L: { space: 'grip' }, mag: { out: 0 } },
  { t: .06, R: M4_TRIGGER_CLEAR },
  { t: .10, p: [-.068, .105, .025], r: [.20, .22, -.36], ease: 'out',
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
  { t: .775, p: [-.069, .116, .024], r: [.225, .22, -.35], ease: 'snap' },
  { t: .785, L: { ...M4_SEAT_HAND, wrist: [-.055, -.28, -.043832] } },
  { t: .795, p: [-.068, .105, .025], r: [.20, .22, -.36] },
];
export const M4_RELOAD_EMPTY: Choreography = [
  { t: 0, parts: { bolt: 1 } },
  ...M4_SWAP,
  { t: .807, L: { ...M4_SEAT_HAND, space: 'gun', wrist: [-.135, -.25, -.115] } },
  { t: .83, L: { ...M4_CATCH_HAND, wrist: [-.13, -.07, .07] }, parts: { bolt: 1, release: 0 } },
  { t: .86, L: M4_CATCH_HAND, parts: { bolt: 1, release: 1 }, ease: 'snap' },
  { t: .87, parts: { bolt: 0, release: 1 }, sfx: 'slide-home', ease: 'snap', p: [-.06, .103, .032], r: [.215, .20, -.31] },
  { t: .884, parts: { release: 0 } },
  { t: .902, L: { ...M4_CATCH_HAND, wrist: [-.13, -.07, .07] } },
  { t: .938, L: { space: 'gun', wrist: [-.13, .060359, -.141015], forward: [.074714, .399403, -.913726], palm: [.898035, -.425303, -.112475], curl: { index: [.571759, 1.513912, .276212], middle: [.400614, 1.310437, 1.17425], ring: [1.361137, -.1, .430514], thumb: [-.1, -.1, .583421], spread: -.479682 } } },
  { t: .97, L: { space: 'grip' }, R: { space: 'grip' }, p: [0, 0, 0], r: [0, 0, 0] },
];
export const M4_RELOAD_PARTIAL: Choreography = [
  ...M4_SWAP,
  { t: .813, L: { ...M4_SEAT_HAND, space: 'gun', wrist: [-.135, -.25, -.115] } },
  { t: .87, L: { space: 'gun', wrist: [-.13, .060359, -.141015], forward: [.074714, .399403, -.913726], palm: [.898035, -.425303, -.112475], curl: { index: [.571759, 1.513912, .276212], middle: [.400614, 1.310437, 1.17425], ring: [1.361137, -.1, .430514], thumb: [-.1, -.1, .583421], spread: -.479682 } } },
  { t: .94, L: { space: 'grip' }, R: { space: 'grip' } },
  { t: .96, p: [0, 0, 0], r: [0, 0, 0] },
];
export const m4Reload = (empty: boolean): Choreography => empty ? M4_RELOAD_EMPTY : M4_RELOAD_PARTIAL;
const SMG_RELOAD = magSwap([0, -1, -.045], [-.03, -.08, -.008], [
  // The cocking lever: pull back and slap it home.
  { t: .77, L: { space: 'gun', wrist: [-.075, .055, -.03], forward: [0, .25, -1], palm: [1, -.2, 0], curl: PINCH } },
  { t: .77, parts: { charge: 0 } },
  { t: .82, L: { space: 'gun', wrist: [-.075, .055, .035], forward: [0, .25, -1], palm: [1, -.2, 0], curl: PINCH }, parts: { charge: 1 }, sfx: 'slide-back' },
  { t: .86, L: { space: 'gun', wrist: [-.08, .04, -.04], forward: [0, .25, -1], palm: [1, -.2, 0], curl: OPEN }, parts: { charge: 0 }, ease: 'snap', sfx: 'slide-home' },
  { t: .87, p: [-.02, .03, .03], r: [.14, .12, -.25], ease: 'snap' },
  { t: .96, L: { space: 'grip' } },
]);
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
// Swing out, punch the ejector, index a speedloader, flick the cylinder shut.
const REVOLVER_RELOAD: Choreography = [
  { t: 0, mag: { visible: false } },
  { t: .1, p: [-.07, .05, .02], r: [.3, .3, .35], ease: 'out' },
  { t: .09, L: { space: 'gun', wrist: [-.075, .0, .05], forward: [.2, .4, -1], palm: [1, 0, .1], curl: OPEN } },
  { t: .12, parts: { swing: 0 } },
  { t: .18, parts: { swing: 1 }, ease: 'snap', sfx: 'cylinder-open' },
  { t: .22, p: [-.07, .05, .02], r: [.3, .3, .35] },
  { t: .3, p: [-.05, .07, .03], r: [1.05, .25, .3] },
  { t: .26, L: { space: 'gun', wrist: [-.07, -.03, -.1], forward: [.35, .3, 1], palm: [.2, 1, 0], curl: PINCH } },
  { t: .3, parts: { eject: 0 } },
  { t: .33, parts: { eject: 1 }, ease: 'snap', sfx: 'eject' },
  { t: .37, parts: { eject: 0 } },
  { t: .42, p: [-.07, .04, .02], r: [.15, .3, .4] },
  { t: .44, L: { space: 'view', wrist: [-.22, -.48, -.02], forward: [.3, .5, -1], palm: [.9, 0, .2], curl: HOLD_MAG } },
  { t: .5, mag: { visible: false, out: .14, p: [-.07, -.05, .0] } },
  { t: .51, mag: { visible: true, out: .14, p: [-.07, -.05, .0] } },
  { t: .6, L: { space: 'gun', wrist: [-.05, -.05, .12], forward: [.2, .4, -1], palm: [.6, .2, -.6], curl: HOLD_MAG }, mag: { out: .05, p: [-.0327, -.005, 0] } },
  { t: .68, L: { space: 'gun', wrist: [-.045, -.045, .085], forward: [.2, .4, -1], palm: [.6, .2, -.6], curl: HOLD_MAG }, mag: { out: 0, p: [-.0327, -.005, 0] }, sfx: 'speedloader' },
  { t: .72, mag: { visible: false, out: 0, p: [-.0327, -.005, 0] } },
  { t: .74, parts: { swing: 1 } },
  { t: .78, parts: { swing: 0 }, ease: 'snap', sfx: 'cylinder-close' },
  { t: .76, p: [-.07, .04, .02], r: [.15, .3, .4] },
  { t: .8, p: [-.05, .03, .03], r: [.05, .2, .15], ease: 'snap' },
  { t: .96, L: { space: 'grip' } },
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
  pistol: PISTOL_RELOAD, m4: M4_RELOAD_EMPTY, smg: SMG_RELOAD, dmr: DMR_RELOAD, sniper: SNIPER_RELOAD,
  revolver: REVOLVER_RELOAD, shotgun: SHOTGUN_SHELL, coco: COCO_RELOAD,
};
