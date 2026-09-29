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
const M4_TRIGGER_CLEAR: HandKey = { space: 'gun', curl: {index: [0.12, 0.15, 0.1], middle: [0.839068, 0.627801, 0.810085], ring: [1.245737, 0.765474, -0.011606], thumb: [-0.1, 0.213327, 0.303182], spread: 0.203024} };
const M4_SWAP: Choreography = [
  { t: 0, L: { space: 'grip' }, mag: { out: 0 } },
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
// Carabina uses a short curved magazine. Release and return paths stay left of
// the receiver; the firing paw only leaves after support has regained the forend.
export const DMR_MAG_HAND: HandKey = {space: "part", part: "mag", wrist: [-0.050175, -0.160768, 0.023229], forward: [0.109983, 0.926697, -0.359354], palm: [0.9769, -0.034138, 0.210951], curl: {index: [1.349937, 0.482453, 0.351455], middle: [1.7, 1.7, 0.447], ring: [1.7, 1.7, 0.44], thumb: [0.781299, 0.91152, 0.246083], spread: 0.174935}};
export const DMR_CHARGE_HAND: HandKey = {space: "part", part: "charge", wrist: [0.064112, -0.062461, 0.040238], forward: [-0.100371, 0.883821, -0.456931], palm: [-0.896322, -0.279676, -0.344076], curl: {index: [1.010944, 0.560632, 0.644719], middle: [1.593198, 0.231539, 0.8], ring: [1.3, 1.1, 0.8], thumb: [0.27295, 0.164685, 0.174024], spread: -0.6}};
const DMR_SWAP: Choreography = [
  { t: .08, p: [-.065, .085, .02], r: [.12, .28, -.30], ease: 'out', L: { space: 'gun', wrist: [-.14, .025, -.17] } },
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
  { t: .81, L: { space: 'gun', wrist: [-0.15, 0.047938, -0.16662] } },
  { t: .84, L: { space: 'grip' } },
];
const DMR_RELOAD_PARTIAL: Choreography = [...DMR_SWAP,
  { t: .94, p: [0, 0, 0], r: [0, 0, 0] },
];
const DMR_RELOAD_EMPTY: Choreography = [...DMR_SWAP.map(key => ({ ...key, t: key.t * .86 })),
  { t: .725, R: { space: 'grip' } },
  { t: .765, R: { space: 'gun', wrist: [0.16, -0.078092, 0.104591], curl: OPEN } },
  { t: .80, R: { ...DMR_CHARGE_HAND, wrist: [0.149112, -0.062461, 0.040238] }, parts: { charge: 0 } },
  { t: .83, R: DMR_CHARGE_HAND, parts: { charge: 0 } },
  { t: .89, R: DMR_CHARGE_HAND, parts: { charge: 1 }, sfx: 'slide-back' },
  { t: .915, R: DMR_CHARGE_HAND, parts: { charge: 0 }, ease: 'snap', sfx: 'slide-home' },
  { t: .945, R: { ...DMR_CHARGE_HAND, wrist: [0.149112, -0.062461, 0.040238], curl: OPEN } },
  { t: .985, R: { space: 'gun', wrist: [0.16, -0.078092, 0.104591] } },
  { t: 1, R: { space: 'grip' }, p: [0, 0, 0], r: [0, 0, 0] },
];
export const dmrReload = (empty: boolean): Choreography => empty ? DMR_RELOAD_EMPTY : DMR_RELOAD_PARTIAL;

export const SNIPER_MAG_HAND: HandKey = {space: "part", part: "mag", wrist: [-0.066532, -0.137539, 0.023697], forward: [0.225781, 0.849056, -0.477626], palm: [0.865008, 0.050785, 0.499181], curl: {index: [1.196701, 0.725765, 0.445857], middle: [1.587534, 1.224863, 0.381687], ring: [1.7, 1.7, 0.44], thumb: [0.90276, 1.2, 0.37329], spread: 0.03666}};
export const SNIPER_BOLT_HAND: HandKey = { ...{space: "part", part: "bolt", wrist: [0.099465, -0.090861, 0.064821], forward: [-0.106178, 0.840785, -0.530856], palm: [-0.882864, -0.325333, -0.338689], curl: {index: [0.826277, 1.076612, -0.1], middle: [1.7, 0.548489, 0.8], ring: [1.3, 1.1, 0.8], thumb: [0.447496, -0.039733, -0.074656], spread: -0.6}}, pole: [1, -.35, .2] };
// A complete four-beat bolt stroke, anchored to the actual moving knob.
export const SNIPER_CYCLE: Choreography = [
  { t: .08, R: { space: 'gun', wrist: [0.16, -0.093071, 0.095477], curl: OPEN }, parts: { bolt: 0, boltPull: 0 } },
  { t: .15, R: { ...SNIPER_BOLT_HAND, wrist: [0.184465, -0.090861, 0.064821] } },
  { t: .22, R: SNIPER_BOLT_HAND, parts: { bolt: 0 } },
  { t: .34, R: SNIPER_BOLT_HAND, parts: { bolt: 1 }, sfx: 'bolt-open' },
  { t: .49, R: SNIPER_BOLT_HAND, parts: { boltPull: 1 }, sfx: 'bolt-back' },
  { t: .56, R: SNIPER_BOLT_HAND, parts: { boltPull: 1 } },
  { t: .72, R: SNIPER_BOLT_HAND, parts: { bolt: 1, boltPull: 0 } },
  { t: .84, R: SNIPER_BOLT_HAND, parts: { bolt: 0 }, ease: 'snap', sfx: 'bolt-home' },
  { t: .9, R: { ...SNIPER_BOLT_HAND, wrist: [0.184465, -0.090861, 0.064821], curl: OPEN } },
  { t: .95, R: { space: 'gun', wrist: [0.16, -0.093071, 0.095477] } },
  { t: 1, R: { space: 'grip' } },
];
function sniperMagazine(start: number, end: number): Choreography {
  const at = (u: number) => start + (end - start) * u;
  return [
    { t: at(0), L: { space: 'gun', wrist: [-0.15, 0.024245, -0.231177] } },
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
    { t: at(.95), L: { space: 'gun', wrist: [-0.15, 0.024245, -0.231177] } },
    { t: at(1), L: { space: 'grip' } },
  ];
}
const SNIPER_RELOAD_PARTIAL: Choreography = [
  { t: .08, p: [-.055, .07, .018], r: [.1, .22, -.26], ease: 'out' },
  ...sniperMagazine(.09, .89),
  { t: .98, p: [0, 0, 0], r: [0, 0, 0] },
];
const SNIPER_RELOAD_EMPTY: Choreography = [
  { t: .05, p: [-.055, .07, .018], r: [.1, .22, -.26], ease: 'out', R: { space: 'gun', wrist: [0.16, -0.093071, 0.095477], curl: OPEN } },
  { t: .085, R: { ...SNIPER_BOLT_HAND, wrist: [0.184465, -0.090861, 0.064821] }, parts: { bolt: 0, boltPull: 0 } },
  { t: .12, R: SNIPER_BOLT_HAND, parts: { bolt: 0 } },
  { t: .17, R: SNIPER_BOLT_HAND, parts: { bolt: 1 }, sfx: 'bolt-open' },
  { t: .23, R: SNIPER_BOLT_HAND, parts: { boltPull: 1 }, sfx: 'bolt-back' },
  { t: .26, R: { ...SNIPER_BOLT_HAND, wrist: [0.184465, -0.090861, 0.064821], curl: OPEN } },
  { t: .285, R: { space: 'gun', wrist: [0.16, -0.093071, 0.095477] } },
  { t: .31, R: { space: 'grip' } },
  { t: .315, L: { space: 'grip' } },
  ...sniperMagazine(.33, .82),
  { t: .825, R: { space: 'grip' } },
  { t: .845, R: { space: 'gun', wrist: [0.16, -0.093071, 0.095477], curl: OPEN } },
  { t: .865, R: { ...SNIPER_BOLT_HAND, wrist: [0.184465, -0.090861, 0.104821] } },
  { t: .89, R: SNIPER_BOLT_HAND, parts: { boltPull: 1 } },
  { t: .935, R: SNIPER_BOLT_HAND, parts: { bolt: 1, boltPull: 0 }, sfx: 'bolt-home' },
  { t: .96, R: SNIPER_BOLT_HAND, parts: { bolt: 0 }, ease: 'snap' },
  { t: .975, R: { ...SNIPER_BOLT_HAND, wrist: [0.184465, -0.090861, 0.064821], curl: OPEN } },
  { t: .99, R: { space: 'gun', wrist: [0.16, -0.093071, 0.095477] } },
  { t: 1, R: { space: 'grip' }, p: [0, 0, 0], r: [0, 0, 0] },
];
export const sniperReload = (empty: boolean): Choreography => empty ? SNIPER_RELOAD_EMPTY : SNIPER_RELOAD_PARTIAL;
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
// One shell per authoritative .55-second segment. The shell travels nose-first
// into the underside gate; the support paw returns before a final empty rack.
export const SHOTGUN_SHELL_HAND: HandKey = {space: "part", part: "mag", wrist: [-0.071047, -0.055894, 0.031512], forward: [0.857025, -0.146583, -0.493986], palm: [0.399395, 0.794695, 0.457104], curl: {index: [0.382089, 0.850316, 0.130138], middle: [1.313641, 1.232602, 0.6], ring: [1.200465, 1.000042, 0.6], thumb: [0.857916, 0.07711, 0.175881], spread: -0.154593}};
const SHOTGUN_PUSH_HAND: HandKey = {wrist: [-0.049022, -0.064088, 0.033021], forward: [0.799141, -0.112196, -0.590581], palm: [0.532349, 0.588445, 0.608554], pole: [-1, -0.2, 0.3], curl: {index: [0.345101, 0.252126, 0.192652], middle: [1.354021, 1.376316, 0.599732], ring: [1.028833, 1.266842, 0.600874], thumb: [0.750224, -0.1, -0.09105], spread: -0.05879}, space: "part", part: "mag"};
const SHOTGUN_SHELL: Choreography = [
  { t: 0, mag: { visible: false, p: [0, -.016, 0] } },
  { t: .12, L: { space: 'gun', wrist: [-.15, .021887, -.279933] }, mag: { visible: false, p: [-.10, -.25, .07] } },
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
  { t: .85, L: { space: 'gun', wrist: [-.15, -.08, -.279933] } },
  { t: .92, L: { space: 'gun', wrist: [-.15, .021887, -.279933] } },
  { t: 1, L: { space: 'grip' }, mag: { visible: false } },
];

export const COCO_FRUIT_HAND: HandKey = {space: "part", part: "mag", wrist: [-0.092022, -0.020249, 0.067966], forward: [0.889325, 0.0343, -0.455987], palm: [0.280517, 0.746583, 0.60326], curl: {index: [1.441798, -0.1, 0.4], middle: [1.286589, -0.1, 0.5], ring: [-0.1, -0.1, -0.1], thumb: [-0.1, -0.098199, 0.016256], spread: -0.6}};
function makeCocoReload(ammo: number): Choreography {
  const keys: import('./viewmodel-choreo').Key[] = [
    { t: 0, mag: { visible: false, p: [-.17, -.42, .08] }, parts: { load1: ammo >= 3 ? 1 : 0, load2: ammo >= 2 ? 1 : 0 } },
    { t: .06, p: [-.055, -.03, -.10], r: [-.04, .15, -.025], ease: 'out', L: { space: 'gun', wrist: [-.18, -.03, -.18] } },
  ];
  const drop = (t: number, slot: number) => {
    const z = -slot * .09;
    keys.push(
      { t, L: COCO_FRUIT_HAND, mag: { visible: false, p: [-.17, -.42, z + .08] } },
      { t: t + .018, L: COCO_FRUIT_HAND, mag: { p: [-.17, -.42, z + .08] } },
      { t: t + .055, L: COCO_FRUIT_HAND, mag: { p: [-.17, .17, z] } },
      { t: t + .072, L: COCO_FRUIT_HAND, mag: { p: [0, .17, z] } },
      { t: t + .096, L: { ...COCO_FRUIT_HAND, wrist: [-.19, -.028, .067], curl: OPEN }, mag: { p: [0, .17, z] } },
      { t: t + .132, L: { space: 'gun', wrist: [-.21, .38, z + .065], curl: OPEN }, mag: { p: [0, 0, z] }, ease: 'in', sfx: 'coconut-in' },
      { t: t + .15, L: { space: 'gun', wrist: [-.21, -.16, z + .065], curl: OPEN }, mag: { visible: slot === 0, p: [0, 0, z] } },
    );
    if (slot) keys.push({ t: t + .131, parts: { ['load' + slot]: 0 } }, { t: t + .132, parts: { ['load' + slot]: 1 } });
  };
  if (ammo === 0) {
    drop(.08, 2); drop(.245, 1); drop(.41, 0);
    keys.push(
      { t: .57, L: { space: 'gun', wrist: [-0.18, 0.00522, -0.224605] } },
      { t: .595, L: { space: 'grip' }, parts: { pump: 0 } },
      { t: .63, L: { space: 'grip' }, mag: { p: [0, 0, 0] }, parts: { pump: 1 }, sfx: 'pump-back' },
      { t: .65, mag: { p: [0, -.045, 0] } },
      { t: .66, mag: { visible: false }, parts: { pump: 0 }, ease: 'snap', sfx: 'pump-home' },
      { t: .69, L: { space: 'gun', wrist: [-0.18, 0.00522, -0.224605] } },
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
    { t: .91, L: { space: 'gun', wrist: [-0.18, 0.00522, -0.224605] }, mag: { p: [0, 0, 0] } },
    { t: .97, L: { space: 'grip' } },
    { t: 1, p: [0, 0, 0], r: [0, 0, 0], mag: { p: [0, 0, 0] }, parts: { load1: 1, load2: 1, pump: 0 } },
  );
  return keys.sort((a, b) => a.t - b.t);
}
const COCO_RELOADS = [0, 1, 2, 3].map(makeCocoReload);
export const cocoReload = (ammo: number): Choreography => COCO_RELOADS[Math.max(0, Math.min(3, Math.floor(ammo)))];
// After each stone: fetch a new one and draw back to the anchor.

export const RELOADS: Partial<Record<WeaponId, Choreography>> = {
  pistol: PISTOL_RELOAD, m4: M4_RELOAD_EMPTY, smg: SMG_RELOAD, dmr: DMR_RELOAD_EMPTY, sniper: SNIPER_RELOAD_EMPTY,
  revolver: REVOLVER_RELOAD, shotgun: SHOTGUN_SHELL, coco: COCO_RELOADS[0],
};
