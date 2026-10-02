import type { WeaponId } from '../shared/types';
import { blendCurl, type HandCurl } from './fp-arms';
import type { Choreography, HandKey } from './viewmodel-choreo';

// Authored first-person reloads. Coordinates: gun offsets in camera space
// (x right, y up, z back; pitch up, yaw left, roll counter-clockwise), hands and
// parts in weapon space unless the key says 'view'.
const curl = (index: number[], middle: number[], ring: number[], thumb: number[]) =>
  ({ index, middle, ring, thumb }) as unknown as HandCurl;
const INDEXED: HandKey = { space: 'grip', indexed: true };
const OPEN = curl([.25, .2, .15], [.3, .25, .15], [.35, .25, .2], [.15, .1, .05]);
const HOLD_MAG = curl([.9, .9, .6], [1.1, 1, .7], [1.2, 1.05, .75], [.6, .4, .3]);
const PINCH = curl([.7, .9, .7], [1.2, 1.1, .8], [1.3, 1.1, .8], [.9, .6, .4]);
type Vec = [number, number, number];
const add = (a: Vec, b: Vec, k = 1): Vec => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
// Approach and clearance keys sit at fixed offsets from their fitted contact key (in its own
// space), so a refit of the contact carries the whole reach with it.
const shift = (key: HandKey, d: Vec, extra: Partial<HandKey> = {}): HandKey => ({ ...key, contact: false, ...extra, wrist: add(key.wrist as Vec, d) });

// The support paw remains in magazine space from acquisition through the palm seat.
const PISTOL_MAG_HAND: HandKey = { space: 'part', part: 'mag', wrist: [-0.0785948, -0.1461899, 0.0391613],
  forward: [0.901984, -0.0589296, -0.4277291],
  palm: [0.2762471, 0.8401116, 0.4667977],
  pole: [-1, -0.5, 0.3],
  curl: { index: [-0.1, 0.2707668, 0.127294], middle: [-0.0158199, 0.27, 0.135], ring: [0.225186, 0.2694, 0.135], thumb: [1.4, 0.5214256, 0.0424187], spread: 0.0704499, indexSpread: 0.65 } };
const PISTOL_MAG_CLEAR = shift(PISTOL_MAG_HAND, [0, -.039, 0]);
const PISTOL_MAG_OUTSIDE = shift(PISTOL_MAG_HAND, [-.108, -.039, 0]);
const PISTOL_CLEAR: HandKey = { space: 'grip', offset: [-.06, -.02, 0] };
const PISTOL_RETURN_CLEAR: HandKey = { space: 'grip', offset: [-.045, -.025, 0] };
const PISTOL_RELEASE_HAND: HandKey = { space: 'part', part: 'release', wrist: [-0.0523961, -0.0845468, -0.0218285],
  forward: [-0.0228905, 0.7940599, -0.6074083],
  palm: [0.9970598, 0.0625748, 0.0442288],
  pole: [-1, -0.5, 0.3],
  curl: { index: [0.1942984, 0.1859468, 0.127659], middle: [0.1705234, 0.2246227, 0.1382764], ring: [0.1138685, 0.2156006, 0.164218], thumb: [0.1490603, 0.2830322, 0.0607156], spread: 0.3145627, indexSpread: 0.0048042, indexRoll: 0 } };
// A fitted reload hold clears the magazine's swept path while the palm and wrap carry the grip.
const PISTOL_RELOAD_HOLD: HandKey = { space: 'gun', contact: 'body', wrist: [0.03726642847, -0.1043853105, 0.08007228938],
  forward: [0.3411367836, 0.4343394781, -0.8336515535], palm: [-0.919691667, -0.02919254217, -0.3915546362], pole: [1, -1, 0.3],
  curl: { index: [0.05, 0.08, 0.05], middle: [0.815783137, 0.3095488795, 0.2095882589], ring: [1.183409809, 0.4802219305, 0.5244103115], thumb: [0.5531420024, 0.4946569955, 0.2115953837], spread: 0.7265735896, indexSpread: 0, indexRoll: 0 } };
const PISTOL_RELOAD_OPEN: HandKey = { space: 'grip', curl: { ring: [1.155, 0.5182772376, 0.5167532119] } };
const PISTOL_RELOAD_OPEN_HOLD: HandKey = { ...PISTOL_RELOAD_HOLD, curl: { ...PISTOL_RELOAD_HOLD.curl, ring: [1.155, 0.4802219305, 0.5244103115] } };
const pistolSwap = (retain: boolean): Choreography => [
  { t: .035, L: PISTOL_CLEAR },
  { t: .055, R: { space: 'grip' } },
  { t: .075, R: PISTOL_RELOAD_OPEN },
  { t: .12, R: PISTOL_RELOAD_OPEN_HOLD },
  { t: .14, R: PISTOL_RELOAD_HOLD },
  { t: .73, R: PISTOL_RELOAD_HOLD },
  { t: .75, R: PISTOL_RELOAD_OPEN_HOLD },
  { t: .79, R: PISTOL_RELOAD_OPEN },
  { t: .83, R: { space: 'grip' } },
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
  { t: .795, L: shift(PISTOL_RELEASE_HAND, [-.025, 0, 0]), parts: { slide: 1 } },
  { t: .81, L: PISTOL_RELEASE_HAND, parts: { slide: 1, release: 1 } },
  { t: .825, L: PISTOL_RELEASE_HAND, parts: { slide: 0, release: 1 }, p: [-.03, .024, .025], r: [.20, .10, -.26], ease: 'snap', sfx: 'slide-home' },
  { t: .85, parts: { release: 0 }, L: shift(PISTOL_RELEASE_HAND, [-.05, 0, 0]) },
  { t: .91, L: PISTOL_RETURN_CLEAR },
  { t: .96, L: { space: 'grip' }, p: [0, 0, 0], r: [0, 0, 0] },
];
export const PISTOL_RELOAD_PARTIAL: Choreography = [
  ...pistolSwap(true),
  { t: .79, L: { space: 'gun', wrist: [-.125, -.06, .08], forward: [.15, .1, -1], palm: [1, 0, .1], curl: OPEN } },
  { t: .85, L: PISTOL_RETURN_CLEAR },
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

// The support paw opens on its fitted long-gun grip, then clears down and a little left of the
// handguard (the paw holds it from below); both keys follow the grip, so refitting it keeps reloads clean.
const SUPPORT_RELEASE: HandKey = { space: 'grip', offset: [-.009, -.036, .004],
  curl: { index: [.1, .1, .05], middle: [.15, .12, .08], ring: [.15, .12, .08], thumb: [.2, .1, .05] } };
const SUPPORT_CLEAR: HandKey = { ...SUPPORT_RELEASE, offset: [-.045, -.065, .02] };
// Pump grips drop straight off the pump first, then clear to the left.
const PUMP_DROP: HandKey = { ...SUPPORT_RELEASE, offset: [-.006, -.04, 0] };
const PUMP_CLEAR: HandKey = { ...SUPPORT_RELEASE, offset: [-.11, -.05, 0] };
// The firing paw lets go of its grip and opens to the right of the action (bolt and charging handle reaches).
const FIRING_CLEAR: HandKey = { space: 'grip', offset: [.135, 0, 0] };
// It first opens in place, a little off the grip, so the wrapped digits never drag through it.
const FIRING_RELEASE: HandKey = { space: 'grip', offset: [.022, -.008, .012], curl: { index: [.1, .1, .05], middle: [.5, .4, .3], ring: [.5, .4, .3], thumb: [.2, .1, .05] } };
// Contact keys live in the magazine's own frame, so its rotation and the paw
// cannot drift apart. These normalized phases also drive the nearby world rig.
export const M4_MAG_HAND: HandKey = { space: 'part', part: 'mag', wrist: [-0.0593490864, -0.136928338, 0.0187194475],
  forward: [-0.0642325252, 0.932038919, -0.356619735], palm: [0.960904205, 0.154210395, 0.229961436], pole: [-0.6, -1, 0.2],
  curl: { index: [1.4111503, 1.07548386, 0.243035708], middle: [1.69919657, 1.26077337, 0.166553947], ring: [1.64799083, 1.64687312, 0.402045], thumb: [1.29825442, 1.18090287, 0.624376383],
    spread: -0.15668296, indexSpread: 0.000856693515, indexRoll: 0.0742739061 } };
const M4_SEAT_HAND: HandKey = { space: 'part', part: 'mag', wrist: [-0.039363, -0.271518, -0.034076],
  forward: [0.922329003, 0.267645001, -0.278703001], palm: [-0.257713991, 0.963504398, 0.0724069953], pole: [-0.6, -1, 0.2],
  curl: { index: [0.09, 0.135, 0.09], middle: [0.09, 0.135, 0.09], ring: [0.108, 0.135, 0.09], thumb: [0.09, 0.09, 0.09],
    spread: 0.2, indexSpread: 0, indexRoll: 0 } };
const M4_CATCH_HAND: HandKey = { space: 'gun', contact: 'release', wrist: [-0.0604106248, -0.017342856, 0.0569210825],
  forward: [-0.105187603, 0.868329589, -0.484705367], palm: [0.805265146, 0.360368485, 0.470831816], pole: [-1, -0.25, 0.3],
  curl: { index: [0.195093226, 0.235093226, 0.105093226], middle: [0.195093226, 0.235093226, 0.105093226], ring: [-0.0952160449, 0.215055577, 0.105273226], thumb: [0.105093226, 0.105093226, 0.105093226],
    spread: 0.211319919, indexSpread: 0.00905593534, indexRoll: 0.00905593534 } };
const M4_TRIGGER_CLEAR = INDEXED;
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
  { t: .72, L: { ...M4_MAG_HAND, contact: false, wrist: [-.17, -.31, -.045], curl: OPEN } },
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
  { t: .845, L: { ...M4_SEAT_HAND, space: 'gun', wrist: [-.12, -.13, -.18] } },
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
const SMG_CLEAR: HandKey = { space: 'grip', offset: [-.04, -.05, 0] };
const SMG_SWAP: Choreography = [
  { t: .035, L: SMG_CLEAR },
  { t: .07, R: INDEXED, p: [-.06, .055, .025], r: [.16, .15, -.32], ease: 'out' },
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
  { t: .90, R: INDEXED },
  { t: .98, R: { space: 'grip' }, L: { space: 'grip' }, p: [0, 0, 0], r: [0, 0, 0] },
];
const SMG_CHARGE_HAND: HandKey = { space: 'part', part: 'charge', wrist: [-0.0712715207, -0.0365287927, 0.0465020958],
  forward: [0.259133355, 0.461110908, -0.848661673], palm: [0.9624155, -0.0493324025, 0.267063137], pole: [-0.6, -1, 0.2],
  curl: { index: [1.12551124, 1.21059965, 0.535734993], middle: [.05, .3, .3], ring: [1.25893331, 1.19648349, 0.758054273], thumb: [0.516442284, 0.143842169, -0.0551321481],
    spread: -0.512847704, indexSpread: 0.0160632489, indexRoll: -0.00905554362 } };
export const SMG_RELOAD_EMPTY: Choreography = [...SMG_SWAP,
  { t: .77, L: { space: 'gun', wrist: [-.145, .06, -.11], forward: [.1, .3, -1], palm: [1, -.1, .05], curl: OPEN } },
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
export const DMR_MAG_HAND: HandKey = { space: 'part', part: 'mag', wrist: [-0.0552457004, -0.176134431, 0.0297619114],
  forward: [-0.0730927614, 0.931327437, -0.356772551], palm: [0.997298788, 0.0708548799, -0.0193575112], pole: [-0.6, -1, 0.2],
  curl: { index: [1.69525368, 0.502577814, 0.0885968163], middle: [1.68389985, 1.68670036, 0.00712259756], ring: [1.69991943, 1.68057842, 0.566507556], thumb: [0.627791661, 1.2, 0.749037448],
    spread: -0.0377629519, indexSpread: -0.184319642, indexRoll: 0.202376869 } };
export const DMR_CHARGE_HAND: HandKey = { space: 'part', part: 'charge', wrist: [0.085247, -0.061489, 0.058628],
  forward: [-0.025311, 0.932039, -0.361473], palm: [-0.887942, -0.187077, -0.420193], pole: [1, -.35, .2],
  curl: { index: [1.028073, 0.63286, 1.153242], middle: [1.5, .9, .3], ring: [1.17, 0.99, 0.72], thumb: [0.637656, 0.282854, 0.014837], spread: -0.5602 } };
const DMR_CHARGE_OPEN = blendCurl(DMR_CHARGE_HAND.curl as HandCurl, OPEN, .5);
const DMR_TILT: { p: Vec; r: Vec } = { p: [-.05, .03, -.06], r: [.2, .3, -.45] };
// The Carabina's support paw clears straight down off its long fore-end (a sideways clear bends the wrist).
const DMR_CLEAR: HandKey = { ...SUPPORT_RELEASE, offset: [-.03, -.06, .02] };
const DMR_SWAP: Choreography = [
  { t: .015, L: SUPPORT_RELEASE },
  { t: .035, L: DMR_CLEAR },
  { t: .08, p: DMR_TILT.p, r: DMR_TILT.r, ease: 'out', L: DMR_CLEAR },
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
  { t: .77, L: { space: 'gun', wrist: [-.12, -.16, -.15] } },
  { t: .81, L: DMR_CLEAR },
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
  { t: .80, R: shift(DMR_CHARGE_HAND, [.05, 0, -.02], { curl: DMR_CHARGE_OPEN }), parts: { charge: 0 } },
  { t: .83, R: DMR_CHARGE_HAND, parts: { charge: 0 } },
  { t: .89, R: DMR_CHARGE_HAND, parts: { charge: 1 }, sfx: 'slide-back' },
  { t: .915, R: DMR_CHARGE_HAND, parts: { charge: 0 }, ease: 'snap', sfx: 'slide-home' },
  { t: .925, R: shift(DMR_CHARGE_HAND, [.012, 0, 0]) },
  { t: .945, R: shift(DMR_CHARGE_HAND, [.11, .035, 0], { curl: OPEN }) },
  { t: .985, R: FIRING_CLEAR },
  { t: .993, R: FIRING_RELEASE },
  { t: 1, R: { space: 'grip' }, p: [0, 0, 0], r: [0, 0, 0] },
];
export const dmrReload = (empty: boolean): Choreography => empty ? DMR_RELOAD_EMPTY : DMR_RELOAD_PARTIAL;

export const SNIPER_MAG_HAND: HandKey = { space: 'part', part: 'mag', wrist: [-0.06168303, -0.130380905, 0.020969671],
  forward: [-0.081614336, 0.932038888, -0.353047604], palm: [0.941218682, 0.188578059, 0.280260072], pole: [-.6, -1, .2],
  curl: { index: [1.453161833, 1.096850318, 0.357420103], middle: [1.699294604, 1.164363146, 0.119951493],
    ring: [1.698009674, 1.667844655, 0.311541437], thumb: [1.389409786, 1.152091779, 0.892753878],
    spread: -0.372212105, indexSpread: -0.051981285, indexRoll: 0.072361654 } };
export const SNIPER_BOLT_HAND: HandKey = { space: 'part', part: 'bolt', wrist: [0.124036664, -0.0881238791, 0.0570596199],
  forward: [-0.075888258, 0.932039048, -0.35432215], palm: [-0.933322825, -0.191458369, -0.303730469], pole: [1, -0.35, 0.2],
  curl: { index: [1.69910537, -0.1, -0.0597593187], middle: [1.7, 1.3, .4], ring: [1.17030999, 0.970000092, 0.765884855], thumb: [0.466614927, -0.0920849344, 0.804425041],
    spread: -0.576427671, indexSpread: -0.0175922303, indexRoll: -0.075282557 } };
// The paw reaches the knob half open from the right and rear, then reverses that clear approach.
const SNIPER_BOLT_OPEN = blendCurl(SNIPER_BOLT_HAND.curl as HandCurl, OPEN, .5);
const SNIPER_BOLT_APPROACH = shift(SNIPER_BOLT_HAND, [.04, 0, .02], { curl: SNIPER_BOLT_OPEN });
const SNIPER_FIRING_RELEASE: HandKey = { ...FIRING_RELEASE, indexed: true,
  curl: { middle: [.5, .4, .3], ring: [.5, .4, .3], thumb: [.2, .1, .05] } };
// A complete four-beat bolt stroke, anchored to the actual moving knob.
export const SNIPER_CYCLE: Choreography = [
  { t: .015, R: INDEXED },
  { t: .04, R: SNIPER_FIRING_RELEASE },
  { t: .08, R: { ...FIRING_CLEAR, curl: OPEN }, parts: { bolt: 0, boltPull: 0 } },
  { t: .15, R: SNIPER_BOLT_APPROACH },
  { t: .22, R: SNIPER_BOLT_HAND, parts: { bolt: 0 } },
  { t: .34, R: SNIPER_BOLT_HAND, parts: { bolt: 1 }, sfx: 'bolt-open' },
  { t: .49, R: SNIPER_BOLT_HAND, parts: { boltPull: 1 }, sfx: 'bolt-back' },
  { t: .56, R: SNIPER_BOLT_HAND, parts: { boltPull: 1 } },
  { t: .72, R: SNIPER_BOLT_HAND, parts: { bolt: 1, boltPull: 0 } },
  { t: .84, R: SNIPER_BOLT_HAND, parts: { bolt: 0 }, ease: 'snap', sfx: 'bolt-home' },
  { t: .87, R: SNIPER_BOLT_APPROACH },
  { t: .9, R: shift(SNIPER_BOLT_HAND, [.13, 0, 0], { curl: OPEN }) },
  { t: .95, R: FIRING_CLEAR },
  { t: .965, R: SNIPER_FIRING_RELEASE },
  { t: .982, R: INDEXED },
  { t: 1, R: { space: 'grip' } },
];
const SNIPER_TILT: { p: Vec; r: Vec } = { p: [-.045, .03, -.06], r: [.18, .28, -.42] };
// Clear the fore-end downward and toward the muzzle before travelling back to the magazine.
const SNIPER_SUPPORT_RELEASE: HandKey = { ...SUPPORT_RELEASE, offset: [-.009, -.05, -.025] };
const SNIPER_SUPPORT_CLEAR: HandKey = { ...SUPPORT_CLEAR, offset: [-.045, -.065, -.025] };
function sniperMagazine(start: number, end: number): Choreography {
  const at = (u: number) => start + (end - start) * u;
  return [
    { t: at(0), L: SNIPER_SUPPORT_RELEASE },
    { t: at(.035), L: SNIPER_SUPPORT_CLEAR },
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
    { t: at(.95), L: SNIPER_SUPPORT_CLEAR },
    { t: at(.975), L: SNIPER_SUPPORT_RELEASE },
    { t: at(1), L: { space: 'grip' } },
  ];
}
const SNIPER_RELOAD_PARTIAL: Choreography = [
  { t: .08, p: SNIPER_TILT.p, r: SNIPER_TILT.r, ease: 'out' },
  ...sniperMagazine(.09, .89),
  { t: .98, p: [0, 0, 0], r: [0, 0, 0] },
];
const SNIPER_RELOAD_EMPTY: Choreography = [
  { t: .012, R: INDEXED },
  { t: .025, R: SNIPER_FIRING_RELEASE },
  { t: .05, p: SNIPER_TILT.p, r: SNIPER_TILT.r, ease: 'out', R: { ...FIRING_CLEAR, curl: OPEN } },
  { t: .085, R: SNIPER_BOLT_APPROACH, parts: { bolt: 0, boltPull: 0 } },
  { t: .12, R: SNIPER_BOLT_HAND, parts: { bolt: 0 } },
  { t: .17, R: SNIPER_BOLT_HAND, parts: { bolt: 1 }, sfx: 'bolt-open' },
  { t: .23, R: SNIPER_BOLT_HAND, parts: { boltPull: 1 }, sfx: 'bolt-back' },
  { t: .26, R: shift(SNIPER_BOLT_HAND, [.10, -.03, .03], { curl: OPEN }) },
  { t: .285, R: FIRING_CLEAR },
  { t: .298, R: SNIPER_FIRING_RELEASE },
  { t: .31, R: INDEXED },
  { t: .315, L: { space: 'grip' } },
  ...sniperMagazine(.33, .82),
  { t: .825, R: { space: 'grip' } },
  { t: .835, R: SNIPER_FIRING_RELEASE },
  { t: .845, R: { ...FIRING_CLEAR, curl: OPEN } },
  { t: .855, R: shift(SNIPER_BOLT_HAND, [.10, -.06, .03], { curl: OPEN }) },
  { t: .865, R: SNIPER_BOLT_APPROACH },
  { t: .89, R: SNIPER_BOLT_HAND, parts: { boltPull: 1 } },
  { t: .935, R: SNIPER_BOLT_HAND, parts: { bolt: 1, boltPull: 0 }, sfx: 'bolt-home' },
  { t: .96, R: SNIPER_BOLT_HAND, parts: { bolt: 0 }, ease: 'snap' },
  { t: .968, R: SNIPER_BOLT_APPROACH },
  { t: .975, R: shift(SNIPER_BOLT_HAND, [.13, 0, 0], { curl: OPEN }) },
  { t: .99, R: FIRING_CLEAR },
  { t: .993, R: SNIPER_FIRING_RELEASE },
  { t: .997, R: INDEXED },
  { t: 1, R: { space: 'grip' }, p: [0, 0, 0], r: [0, 0, 0] },
];
export const sniperReload = (empty: boolean): Choreography => empty ? SNIPER_RELOAD_EMPTY : SNIPER_RELOAD_PARTIAL;
// The thumb operates the closed drum while the firing paw carries the gun.
const REVOLVER_CYLINDER_HAND: HandKey = { space: 'part', part: 'cylinder', followRotation: false, wrist: [-0.082289, -0.043126, 0.031289],
  forward: [-0.019041, 0.284059, -0.958618], palm: [0.999803, -0, -0.019859],
  curl: { index: [0.605, -0.010066, 0.400446], middle: [0.2925, 0.387285, 0.705675], ring: [0.2952, 0.4329, 0.2916],
    thumb: [0.23421637, 0.01146226, 0.03533607], spread: -0.6000 } };
const REVOLVER_CYLINDER_HOLD: HandKey = { space: 'part', part: 'cylinder', followRotation: false, wrist: [-0.07976809, -0.03386608, 0.03692756],
  forward: [0.31131404, 0.36516032, -0.87734914], palm: [0.9447089, -0.01885601, 0.32736759],
  curl: { index: [0.67216502, 0.56511613, 0.56968173], middle: [0.03612153, 0.25586821, 0.56296411], ring: [0.29670741, 0.311389, 0.30438672],
    thumb: [0.07538948, 0.15208919, 0.02638258], spread: -0.58857659, indexSpread: -0.18801034, indexRoll: 0.02800623 } };
// The thumb stays on the moving drum while the other fingers pass outside the barrel and close into a wrap.
// Nodes use cylinder swing; the reload keys invert its existing out/snap easing without changing the part track.
const REVOLVER_CYLINDER_TRANSFER = [
  [.1, -.002, 0], [.2, -.004, 0], [.3, -.005, 0], [.4, -.0045, .0008], [.5, -.0047, .001],
  [.525, -.00395, .0012, -.001], [.55, -.0032, .0014], [.575, -.0033, .0016], [.6, -.0046, .0018],
  [.65, -.0046, .0013], [.675, -.0038, .00165], [.7, -.006, 0], [.8, -.0048, 0], [.9, -.003, 0],
].map(([swing, x, y, z = 0]) => {
  const a = REVOLVER_CYLINDER_HAND, b = REVOLVER_CYLINDER_HOLD;
  const mix = (from: readonly number[], to: readonly number[]): Vec => from.map((v, i) => v + (to[i] - v) * swing) as Vec;
  const hand: HandKey = { ...a, wrist: add(mix(a.wrist!, b.wrist!), [x, y, z]), forward: mix(a.forward!, b.forward!),
    palm: mix(a.palm!, b.palm!), curl: blendCurl(a.curl as HandCurl, b.curl as HandCurl, swing) };
  return { swing, hand };
});
const REVOLVER_CYLINDER_OPEN = shift(REVOLVER_CYLINDER_HOLD, [-.008, .003, .012]);
// The palm presses the rod's front cap, following its full extraction stroke in gun axes.
const REVOLVER_EJECT_HAND: HandKey = { space: 'part', part: 'action', followRotation: false, wrist: [-0.08593031, -0.02023016, -0.10887405],
  forward: [0.96544354, 0.22035956, 0.13914182], palm: [-0.16669059, 0.11172083, 0.97965948], pole: [-1, -.2, -.1],
  curl: { index: [1.24140009, 1.25129948, 0.35067221], middle: [1.69972106, 1.67469269, 0.59956379], ring: [1.66619032, 1.51201032, 0.92777167],
    thumb: [0.42462933, 0.32189328, -0.02038075], spread: -0.08614119, indexSpread: -0.04060769, indexRoll: 0.08627977 } };
const REVOLVER_EJECT_PRESS: HandKey = { ...REVOLVER_EJECT_HAND };
const REVOLVER_EJECT_APPROACH = shift(REVOLVER_EJECT_HAND, [-.045, 0, -.026]);
// Withdraw in front of the rod before dropping left of the falling cartridge cases.
const REVOLVER_EJECT_CLEAR = shift(REVOLVER_EJECT_HAND, [-.055, 0, -.025]);
const REVOLVER_CYLINDER_CLEAR: HandKey = { space: 'gun', wrist: [-.145, .008, -.005],
  forward: [.120078, .379252, -.917469], palm: [.973055, .138274, .184511], curl: OPEN };
// The palm seats the loader from behind while the opposed thumb and middle wrap retain it.
export const REVOLVER_LOADER_HAND: HandKey = { space: 'part', part: 'mag', wrist: [-0.05476685, 0.06577439, 0.09280667],
  forward: [0.70129708, -0.54634644, -0.45791699], palm: [-0.28156934, 0.37783421, -0.88202042],
  curl: { index: [1.69402186, 1.16271518, -0.0990648], middle: [1.69977404, -0.07128009, 0.03852169], ring: [0.56256675, -0.09809991, -0.0999614],
    thumb: [0.07342672, -0.02417476, -0.03463604], spread: -0.57367058, indexSpread: -0.26679073, indexRoll: -0.32436789 } };
// The whole reload is held further out (10 to 15 cm) so the gun, not the support forearm, is the subject.
export const REVOLVER_RELOAD: Choreography = [
  { t: 0, mag: { visible: false }, parts: { swing: 0, spent: 0, fresh: 0, loaded: 0 } },
  { t: .05, R: INDEXED },
  { t: .08, p: [-.04, 0, -.15], r: [.20, .25, -.25], ease: 'out',
    L: shift(REVOLVER_CYLINDER_HAND, [-.048, 0, 0]) },
  { t: .12, L: REVOLVER_CYLINDER_HAND, parts: { release: 1, swing: 0 } },
  ...REVOLVER_CYLINDER_TRANSFER.map(({ swing, hand }) => ({ t: .12 + .05 * (1 - Math.cbrt(1 - swing)), L: hand, ease: 'linear' as const })),
  { t: .17, L: REVOLVER_CYLINDER_HOLD, parts: { swing: 1, release: 0 }, ease: 'out' },
  { t: .19, L: REVOLVER_CYLINDER_OPEN, parts: { swing: 1, release: 0 }, sfx: 'cylinder-open', ease: 'out' },
  { t: .23, L: REVOLVER_CYLINDER_CLEAR },
  { t: .255, L: REVOLVER_EJECT_APPROACH },
  { t: .27, L: shift(REVOLVER_EJECT_HAND, [0, 0, -.026]) },
  { t: .28, p: [.01, -.06, -.17], r: [.6, .18, -.22], L: REVOLVER_EJECT_HAND, parts: { eject: 0, spent: 0 } },
  { t: .32, L: REVOLVER_EJECT_PRESS, parts: { eject: 1, spent: .22 }, ease: 'snap', sfx: 'eject' },
  { t: .35, L: REVOLVER_EJECT_PRESS, parts: { eject: 1, spent: .5 }, p: [.01, -.06, -.17], r: [.6, .18, -.22] },
  { t: .365, L: REVOLVER_EJECT_CLEAR, parts: { eject: 1 } },
  { t: .39, L: { space: 'gun', wrist: [-.215, -.10, .08], forward: [.5, .5, -.7], palm: [.7, 0, .7], curl: OPEN }, parts: { eject: 0, spent: 1 } },
  { t: .43, p: [-.05, 0, -.14], r: [-.18, .32, -.30],
    L: { space: 'view', wrist: [-.24, -.46, .015], forward: [.7, .3, -.6], palm: [.6, 0, .8], curl: HOLD_MAG } },
  { t: .48, L: REVOLVER_LOADER_HAND, mag: { visible: false, out: .22, p: [-.10, -.09, .04], r: [0, 0, 1.3] }, parts: { fresh: 0 } },
  { t: .49, L: REVOLVER_LOADER_HAND, mag: { out: .22, p: [-.10, -.09, .04], r: [0, 0, 1.3] }, parts: { fresh: 1 } },
  { t: .60, L: REVOLVER_LOADER_HAND, mag: { out: .07, p: [-.03169, -.00433, 0], r: [0, 0, 1.3] }, ease: 'out' },
  { t: .675, L: REVOLVER_LOADER_HAND, mag: { out: 0, p: [-.03169, -.00433, 0], r: [0, 0, 1.3] }, parts: { loaded: 0 }, sfx: 'speedloader', ease: 'in' },
  { t: .676, parts: { loaded: 1 } },
  { t: .73, L: REVOLVER_LOADER_HAND, mag: { out: .12, p: [-.055, -.025, 0], r: [0, 0, 1.3] } },
  { t: .77, L: REVOLVER_LOADER_HAND, mag: { out: .28, p: [-.19, -.1, .04], r: [0, 0, 1.3] } },
  { t: .78, mag: { visible: false, out: .28, p: [-.19, -.1, .04], r: [0, 0, 1.3] } },
  { t: .785, L: REVOLVER_LOADER_HAND },
  { t: .80, L: { ...REVOLVER_CYLINDER_CLEAR, wrist: [-.15, .008, .06] } },
  { t: .82, L: REVOLVER_CYLINDER_OPEN, parts: { swing: 1 } },
  { t: .835, L: REVOLVER_CYLINDER_HOLD, parts: { swing: 1 } },
  ...[...REVOLVER_CYLINDER_TRANSFER].reverse().map(({ swing, hand }) => ({ t: .835 + .045 * (1 - swing ** .2), L: hand, ease: 'linear' as const })),
  { t: .88, L: REVOLVER_CYLINDER_HAND, parts: { swing: 0 }, sfx: 'cylinder-close', ease: 'snap', p: [-.035, .01, -.1], r: [.03, .2, -.15] },
  { t: .89, L: shift(REVOLVER_CYLINDER_HAND, [-.012, 0, 0]) },
  { t: .92, L: { space: 'gun', wrist: [-.145, -.06, .07], forward: [.15, .2, -1], palm: [1, 0, .1], curl: OPEN } },
  { t: .94, L: { space: 'grip', offset: [-.025, 0, 0] } },
  { t: .96, L: { space: 'grip' }, R: { space: 'grip' }, p: [0, 0, 0], r: [0, 0, 0] },
  { t: .999, mag: { visible: false }, parts: { spent: 1, fresh: 1, loaded: 1 } },
];
// One shell per cycle; the gun's cant is held separately while the reload lasts.
// Refit (tools/qa/grip-fit.mjs, wristLimits and hiddenArm): the shell held from below with a natural wrist,
// the forearm under the gun and the elbow out of view.
export const SHOTGUN_SHELL_HAND: HandKey = { space: 'part', part: 'mag', wrist: [-0.076501, -0.065773, 0.048781],
  forward: [0.638213, -0.193053, -0.745262], palm: [0.355875, 0.932392, 0.063230],
  curl: { index: [0.402615, 0.468904, 0.448619], middle: [0.592363, 1.067581, 0.147305], ring: [1.326215, 0.269641, -0.100000], thumb: [0.801185, 0.148668, -0.095655], spread: -0.5868 } };
// The thumb follows the brass case head through the loading port.
const SHOTGUN_PUSH_HAND: HandKey = { space: 'part', part: 'mag', wrist: [-0.03934336443, -0.08056528468, 0.07548856288],
  forward: [0.7061960261, -0.01636587814, -0.7078271899], palm: [0.172778898, 0.973491515, 0.1498723546], pole: [-1, -0.2, 0.3],
  curl: { index: [-0.007259485642, 1.593086428, 0.4112079128], middle: [0.9714162684, 0.2909297807, 0.4130556655], ring: [0.8047126263, 0.06707094847, 0.0401642947], thumb: [0.6911483027, -0.09736905912, -0.09735590079], spread: -0.5996603795, indexSpread: 0.256989761, indexRoll: -0.1926338234 } };
// Roll the shell from a three-digit pinch onto the case-head thumb before entering the port.
const SHOTGUN_TRANSFER: readonly HandKey[] = [
  { space: 'part', part: 'mag', wrist: [-0.07545364778, -0.06797251779, 0.05087022268],
    forward: [0.6431774541, -0.1821787318, -0.7437295693], palm: [0.3447574923, 0.93616489, 0.06883001016], pole: [-1, -0.2, 0.3],
    curl: { index: [0.3469978447, 0.5391654017, 0.4462808071], middle: [0.6160538293, 1.019040299, 0.1639144166], ring: [1.293621102, 0.2569803718, -0.09123973158], thumb: [0.7943077064, 0.1492906838, -0.0957613063], spread: -0.5876037737, indexSpread: 0.01606186006, indexRoll: -0.01203961396 } },
  { space: 'part', part: 'mag', wrist: [-0.07392629556, -0.06969203558, 0.05343944536],
    forward: [0.6480487277, -0.1712780749, -0.7420893933], palm: [0.3335890945, 0.9397773653, 0.07440980937], pole: [-1, -0.2, 0.3],
    curl: { index: [0.3233806893, 0.6094268035, 0.4439426141], middle: [0.6397446585, 0.9704995976, 0.1805238332], ring: [1.261027204, 0.2443197436, -0.08247946317], thumb: [0.7874304129, 0.1179133676, -0.0958676126], spread: -0.5884075475, indexSpread: 0.03212372012, indexRoll: -0.02407922792 } },
  { space: 'part', part: 'mag', wrist: [-0.06919159111, -0.07145107117, 0.05593789072],
    forward: [0.6575082058, -0.1494037168, -0.7384859435], palm: [0.3111091981, 0.9465200442, 0.08550364235], pole: [-1, -0.2, 0.3],
    curl: { index: [0.2841463786, 0.749949607, 0.4392662282], middle: [0.6871263171, 0.8734181952, 0.2137426664], ring: [1.195839407, 0.2189984871, -0.06495892633], thumb: [0.7736758257, 0.08715873522, -0.0960802252], spread: -0.5900150949, indexSpread: 0.06424744024, indexRoll: -0.04815845585 } },
  { space: 'part', part: 'mag', wrist: [-0.06624938666, -0.07414010676, 0.05927633608],
    forward: [0.6666273827, -0.1273393406, -0.7344335402], palm: [0.2883422882, 0.9526475753, 0.09654699424], pole: [-1, -0.2, 0.3],
    curl: { index: [0.2489120679, 0.8904724105, 0.4345898423], middle: [0.7345079757, 0.7763367927, 0.2469614996], ring: [1.13065161, 0.1936772306, -0.04743838949], thumb: [0.7759212385, 0.05640410283, -0.0962928378], spread: -0.5916226424, indexSpread: 0.09637116037, indexRoll: -0.07223768378 } },
  { space: 'part', part: 'mag', wrist: [-0.06478211409, -0.07446041501, 0.06033609218],
    forward: [0.6694406109, -0.1203191647, -0.7330570013], palm: [0.2810816403, 0.9544563938, 0.1000305145], pole: [-1, -0.2, 0.3],
    curl: { index: [0.2326482483, 0.9350799692, 0.4331053704], middle: [0.7495488093, 0.7455192724, 0.2575064859], ring: [1.109958396, 0.185639251, -0.04187667028], thumb: [0.7715549824, 0.04664135232, -0.09636032954], spread: -0.5921329422, indexSpread: 0.1065685141, indexRoll: -0.07988139389 } },
  { space: 'part', part: 'mag', wrist: [-0.06217918222, -0.07514914234, 0.06316678144],
    forward: [0.6753556373, -0.1052002904, -0.7299504518], palm: [0.265418654, 0.9581233652, 0.107482813], pole: [-1, -0.2, 0.3],
    curl: { index: [0.1976777572, 1.030995214, 0.4299134564], middle: [0.7818896342, 0.6792553903, 0.2801803327], ring: [1.065463813, 0.1683559742, -0.02991785265], thumb: [0.7461666514, 0.02564947044, -0.0965054504], spread: -0.5932301898, indexSpread: 0.1284948805, indexRoll: -0.09631691171 } },
  { space: 'part', part: 'mag', wrist: [-0.05966946484, -0.0760027498, 0.06346118714],
    forward: [0.6780436934, -0.09815912191, -0.728437737], palm: [0.2581123683, 0.9597252295, 0.1109301092], pole: [-1, -0.2, 0.3],
    curl: { index: [0.1814139376, 1.075602773, 0.4284289845], middle: [0.7969304679, 0.6484378699, 0.2907253191], ring: [1.044770599, 0.1603179946, -0.02435613344], thumb: [0.7666887152, 0.03188671993, -0.09657294214], spread: -0.5937404896, indexSpread: 0.1386922342, indexRoll: -0.1039606218 } },
  { space: 'part', part: 'mag', wrist: [-0.05545997777, -0.07783817793, 0.0663132268],
    forward: [0.6836878527, -0.08299954459, -0.7250393063], palm: [0.2423579489, 0.9629472764, 0.1183011728], pole: [-1, -0.2, 0.3],
    curl: { index: [0.1464434465, 1.171518018, 0.4252370705], middle: [0.8292712928, 0.5821739879, 0.3133991659], ring: [1.000276016, 0.1430347178, -0.01239731581], thumb: [0.7604120642, -0.00510516195, -0.096718063], spread: -0.5948377372, indexSpread: 0.1606186006, indexRoll: -0.1203961397 } },
  { space: 'part', part: 'mag', wrist: [-0.04761277332, -0.07884721351, 0.06881167216],
    forward: [0.6916191411, -0.06075012633, -0.7197029845], palm: [0.2191797655, 0.9671200424, 0.1289924572], pole: [-1, -0.2, 0.3],
    curl: { index: [0.09520913577, 1.312040821, 0.4205606846], middle: [0.8766529513, 0.4850925855, 0.3466179991], ring: [0.9350882197, 0.1177134614, 0.005123221025], thumb: [0.718657477, -0.03585979434, -0.09693067559], spread: -0.5964452846, indexSpread: 0.1927423207, indexRoll: -0.1444753676 } }
];
const SHOTGUN_SHELL: Choreography = [
  { t: 0, mag: { visible: false, p: [0, -.016, 0] } },
  { t: .015, L: { space: 'grip', offset: [0, -.004, 0] } },
  { t: .065, L: PUMP_DROP },
  { t: .12, L: PUMP_CLEAR, mag: { visible: false, p: [-.10, -.25, .07] } },
  { t: .26, L: SHOTGUN_SHELL_HAND, mag: { visible: false, p: [-.10, -.25, .07] } },
  { t: .29, L: SHOTGUN_SHELL_HAND, mag: { p: [-.10, -.25, .07] } },
  { t: 0.3, L: SHOTGUN_TRANSFER[0] },
  { t: 0.31, L: SHOTGUN_TRANSFER[1] },
  { t: 0.33, L: SHOTGUN_TRANSFER[2] },
  { t: 0.355, L: SHOTGUN_TRANSFER[3] },
  { t: 0.365, L: SHOTGUN_TRANSFER[4] },
  { t: 0.38, L: SHOTGUN_TRANSFER[5] },
  { t: 0.39, L: SHOTGUN_TRANSFER[6] },
  { t: 0.405, L: SHOTGUN_TRANSFER[7] },
  { t: 0.43, L: SHOTGUN_TRANSFER[8] },
  // Present the nose to the tube from below, then level the shell as the thumb pushes its case head.
  { t: .48, L: SHOTGUN_PUSH_HAND, mag: { out: .04, p: [0, -.065, 0], r: [.5, 0, 0] } },
  { t: .52, L: SHOTGUN_PUSH_HAND, mag: { out: .04, p: [0, -.045, 0], r: [.5, 0, 0] } },
  { t: .56, L: SHOTGUN_PUSH_HAND, mag: { out: .04, p: [0, -.03, 0], r: [.5, 0, 0] } },
  { t: .62, L: SHOTGUN_PUSH_HAND, mag: { out: .04, p: [0, -.012, 0], r: [.5, 0, 0] } },
  { t: .665, L: SHOTGUN_PUSH_HAND, mag: { out: .055, p: [0, 0, 0], r: [.32, 0, 0] } },
  { t: .70, L: SHOTGUN_PUSH_HAND, mag: { out: .07, p: [0, .010, 0], r: [.15, 0, 0] }, ease: 'snap', sfx: 'shell-in' },
  { t: .74, L: SHOTGUN_PUSH_HAND, mag: { out: .085, p: [0, .019, 0] } },
  { t: .76, L: shift(SHOTGUN_PUSH_HAND, [0, -.035, 0]) },
  { t: .78, L: shift(SHOTGUN_PUSH_HAND, [-.105, -.112, .018]), mag: { visible: false, out: .095, p: [0, .019, 0] } },
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
    { t: .06, R: INDEXED }, { t: .9, R: INDEXED }, { t: .97, R: { space: 'grip' } },
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
    { t: .08, R: INDEXED },
    { t: .88, R: INDEXED },
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
    { t: .08, R: INDEXED },
    { t: .88, R: INDEXED },
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
  { t: .06, R: INDEXED },
  { t: .2, p: lift, r: left, ease: 'out' },
  { t: .46, p: [lift[0] - .005, lift[1] + .006, lift[2]], r: [left[0] + .02, left[1] + .03, left[2] - .05] },
  { t: .68, p: [lift[0] + .02, lift[1] + .01, lift[2]], r: right },
  { t: .86, p: [lift[0] + .018, lift[1] + .014, lift[2]], r: [right[0] + .02, right[1] - .03, right[2] + .05] },
  { t: .9, R: INDEXED },
  { t: .97, R: { space: 'grip' } },
];
export const LONG_INSPECTS: Partial<Record<WeaponId, Choreography>> = {
  m4: longInspect([-.06, .04, -.05], [.12, .35, -.45], [.1, -.1, .85]),
  shotgun: longInspect([-.05, .03, -.08], [.1, .3, -.4], [.08, -.1, .8]),
  dmr: longInspect([-.05, .03, -.08], [.1, .3, -.4], [.08, -.05, .45]),
  sniper: longInspect([-.045, .03, -.08], [.08, .25, -.35], [.06, -.08, .7]),
  coco: longInspect([-.05, .03, -.07], [.1, .3, -.35], [.08, -.1, .75]),
};
