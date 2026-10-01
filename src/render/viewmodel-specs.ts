import type { WeaponId } from '../shared/types';
import type { HandCurl } from './fp-arms';
import type { AssetEntry } from './asset-manifest';
import arsenalMetrics from '../../public/models/arsenal/metrics.json';
import armsMetrics from '../../public/models/fp/metrics.json';
import fittedGrips from './fp-grips.json';

// First-person presentation data. Weapon space is the model's own space
// (x right, y up, -z toward the muzzle); the origin is the web of the firing paw.
export type V3 = readonly [number, number, number];
export type HandlingClass = 'pistol' | 'rifle' | 'heavy' | 'melee';
export type ReloadStyle = 'pistol' | 'revolver' | 'rifle' | 'shotgun' | 'bolt' | 'coco' | 'none';
export interface GripSpec { wrist: V3; forward: V3; palm: V3; curl: HandCurl; pole: V3; /** Follow an animated part (the pump). */ part?: string }
export interface ViewSpec {
  /** First-person model (models/arsenal). */
  url: string;
  scale: number;
  handling: HandlingClass;
  reload: ReloadStyle;
  /** Camera-space position of the weapon origin and its (pitch, yaw, roll). */
  hip: { pos: V3; rot: V3 };
  sprint: { pos: V3; rot: V3 };
  /** Eye-to-sight distance when aiming. */
  adsDistance: number;
  /** Independent weapon lens at the hip (vertical degrees); preserves peripheral world vision. */
  viewmodelFov?: number;
  /** Weapon lens while aimed; the lens blends from the hip lens by the aim amount. */
  adsFov?: number;
  /** Aim point in weapon space when the sight socket is blocked by the gun's own body, and the muzzle-up pitch that puts the front sight on the crosshair. */
  adsEye?: V3; adsPitch?: number;
  grips: { R: GripSpec; L?: GripSpec };
  /** Hidden shoulder joints (camera space) the arms hang from; they set where each forearm enters the frame. */
  shoulders?: { R: V3; L: V3 };
  /** Hidden shoulders while aimed (blended by the aim amount), so the support forearm hangs under the gun. */
  adsShoulders?: { R: V3; L: V3 };
  /** The hip framing the camera-space ('view') choreography keys were authored against. Those keys move
   * rigidly with the gun from that hip to the current one, so they keep their place around the gun. */
  choreoFrame?: { pos: V3; rot: V3 };
  /** One-handed weapons: the free paw's rest (camera space); it dips under the cut while swinging. */
  freePaw?: { wrist: V3; forward: V3; palm: V3 };
  /** Hidden shoulders while reloading (blended in and out), where a reload's reaches need the arm from elsewhere. */
  reloadShoulders?: { R: V3; L: V3 };
  /** First-person elbow directions (camera space) for the rest grips; the shared grip data keeps its own. */
  poles?: { R?: V3; L?: V3 };
  /** Visual recoil: back kick (m/s), muzzle climb and roll (rad/s), spring frequency. */
  recoil: { kick: number; climb: number; roll: number; frequency: number };
  /** Heavier guns lag more behind the view. */
  inertia: number;
}

const curl = (index: V3, middle: V3, ring: V3, thumb: V3, spread?: number): HandCurl => ({ index, middle, ring, thumb, spread });
// Hidden shoulders behind and below the eye: the firing forearm rises from the
// lower right in line with its paw; long guns bring the support shoulder forward
// so that arm reaches the handguard with a bent elbow instead of a locked one.
export const SHOULDERS = { R: [.2, -.36, .25] as V3, L: [-.2, -.36, .2] as V3 };
// Wrapped digits, trigger finger resting on the trigger, thumb along the frame.
const PISTOL_R = curl([.25, .65, .35], [1.0, .7, .4], [1.05, .7, .4], [.5, .3, .2]);
const PISTOL_L = curl([1.3, 1.2, .8], [1.4, 1.2, .8], [1.45, 1.25, .85], [.1, .1, .05]);
const RIFLE_R = curl([.25, .65, .35], [1.0, .65, .4], [1.05, .65, .4], [.55, .4, .2]);
const HANDGUARD_L = curl([.55, .8, .5], [.65, .8, .5], [.7, .8, .5], [.5, .5, .25]);

const PISTOL_GRIPS = {
  R: { wrist: [.033, -.024, .052], forward: [-.05, -.2, -1], palm: [-1, 0, 0], curl: PISTOL_R, pole: [.7, -1, .2] },
  L: { wrist: [-.038, -.053, .051], forward: [.2, -.35, -1], palm: [1, .1, -.1], curl: PISTOL_L, pole: [-.6, -1, .1] },
} as const satisfies ViewSpec['grips'];

const UNDERHAND_L = (wrist: V3, part?: string): GripSpec => ({ wrist, forward: [1, .12, -.12], palm: [.1, 1, .12], curl: HANDGUARD_L, pole: [-.8, -1, .1], part });
const FOREGRIP_L = (wrist: V3): GripSpec => ({ wrist, forward: [.05, -.2, -1], palm: [1, 0, 0], curl: PISTOL_R, pole: [-.8, -1, .2] });
const RIFLE_GRIP_R = (wrist: V3 = [.037, -.030, .047]): GripSpec => ({ wrist, forward: [-.03, -.15, -1], palm: [-1, 0, 0], curl: RIFLE_R, pole: [.8, -1, .3] });
const RECOIL = { light: { kick: 1.1, climb: 2.2, roll: 1.2, frequency: 22 }, rifle: { kick: 1.4, climb: 3, roll: 1.4, frequency: 21 } };

// Paw grips per weapon (weapon space), fitted to the first-person paw with tools/qa/grip-fit.mjs
// and checked with tools/qa/fp-clearance.mjs. The world character holds guns with the same data.
const GRIPS = fittedGrips as unknown as Record<WeaponId, ViewSpec['grips']>;

// Hip framing per weapon (camera space, metres and radians), placed from the target composition in
// docs/overhaul/viewmodel-research.md: the gun points nearly along the view (a small inward yaw and
// cant, the muzzle just right of and below the reticle), the sight sits right of centre a little below
// the horizon, the support paw on the fore-end just right of centre with its forearm rising steeply from
// the bottom edge, the firing paw's back at the lower right. One narrow hip lens (VIEWMODEL_FOV) for
// every gun; while aiming the lens blends back to each gun's authored sight picture (adsFov).
const POLES_LONG = { R: [.5, -1, .3] as V3, L: [-.15, -1, .5] as V3 };
const POLES_HANDGUN = { R: [.5, -1, .3] as V3, L: [-.4, -1, .3] as V3 };
export const VIEW_SPECS: Record<WeaponId, ViewSpec> = {
  pistol: {
    url: 'models/arsenal/pistol.glb', scale: 1, handling: 'pistol', reload: 'pistol',
    hip: { pos: [.056, -.107, -.393], rot: [.035, .052, .07] },
    sprint: { pos: [-.025, -.025, .035], rot: [.62, .18, .22] },
    adsDistance: .32, adsFov: 64, poles: POLES_HANDGUN,
    choreoFrame: { pos: [.13, -.085, -.40], rot: [.03, .10, .16] },
    shoulders: { R: [.224, -.633, -.094], L: [-.081, -.587, -.073] }, adsShoulders: { R: [.137, -.635, -.065], L: [-.104, -.583, .019] },
    grips: GRIPS.pistol,
    recoil: { kick: 1.25, climb: 5.2, roll: 1.5, frequency: 26 }, inertia: .7,
  },
  revolver: {
    url: 'models/arsenal/revolver.glb', scale: 1, handling: 'pistol', reload: 'revolver',
    hip: { pos: [.059, -.124, -.422], rot: [.035, .052, .07] },
    sprint: { pos: [-.02, -.05, .07], rot: [.95, .25, .3] },
    adsDistance: .3, adsFov: 64, poles: POLES_HANDGUN,
    choreoFrame: { pos: [.12, -.10, -.43], rot: [.04, .15, -.06] },
    shoulders: { R: [.23, -.658, -.128], L: [-.077, -.603, -.123] }, adsShoulders: { R: [.139, -.659, -.057], L: [-.102, -.598, .01] },
    grips: GRIPS.revolver,
    recoil: { kick: 1.7, climb: 8, roll: 2.2, frequency: 21 }, inertia: .75,
  },
  smg: {
    url: 'models/arsenal/smg.glb', scale: 1, handling: 'rifle', reload: 'rifle',
    hip: { pos: [.134, -.145, -.517], rot: [.087, .122, .122] },
    sprint: { pos: [-.025, -.02, .035], rot: [.30, .45, .28] },
    adsDistance: .23, adsFov: 64, poles: POLES_LONG,
    choreoFrame: { pos: [.16, -.145, -.46], rot: [.04, .20, -.08] },
    shoulders: { R: [.318, -.659, -.228], L: [.018, -.66, -.314] }, adsShoulders: { R: [.144, -.666, .009], L: [-.1, -.64, -.2] },
    grips: GRIPS.smg,
    recoil: { kick: .9, climb: 1.8, roll: 1.4, frequency: 24 }, inertia: .85,
  },
  m4: {
    url: 'models/arsenal/m4.glb', scale: 1, handling: 'rifle', reload: 'rifle',
    hip: { pos: [.157, -.143, -.589], rot: [.105, .14, .14] },
    sprint: { pos: [-.03, -.045, .015], rot: [-.12, .6, .1] },
    adsDistance: .15, adsFov: 70, poles: POLES_LONG,
    choreoFrame: { pos: [.168, -.112, -.325], rot: [.07, .32, .4] },
    shoulders: { R: [.347, -.681, -.285], L: [-.016, -.509, -.48] }, adsShoulders: { R: [.141, -.69, .1], L: [-.123, -.503, -.138] },
    grips: GRIPS.m4,
    recoil: RECOIL.rifle, inertia: 1,
  },
  shotgun: {
    url: 'models/arsenal/shotgun.glb', scale: 1, handling: 'heavy', reload: 'shotgun',
    hip: { pos: [.155, -.136, -.537], rot: [.052, .122, .14] },
    sprint: { pos: [-.045, -.055, -.015], rot: [-.18, .45, .05] },
    // The receiver stands taller than the rib: sight from above it, down the rib to the bead.
    adsDistance: .3, adsEye: [0, .113, .03], adsPitch: .003, adsFov: 56, poles: POLES_LONG,
    choreoFrame: { pos: [.22, -.1, -.5], rot: [0, .3, .4] },
    shoulders: { R: [.338, -.653, -.25], L: [-.019, -.56, -.479] }, adsShoulders: { R: [.141, -.662, -.051], L: [-.129, -.537, -.306] },
    grips: GRIPS.shotgun,
    recoil: { kick: 2.4, climb: 6.5, roll: 2.5, frequency: 17 }, inertia: 1.25,
  },
  coco: {
    url: 'models/arsenal/coco.glb', scale: 1, handling: 'heavy', reload: 'coco',
    hip: { pos: [.188, -.255, -.669], rot: [.087, .14, .14] },
    sprint: { pos: [-.035, -.025, .02], rot: [-.14, .40, .1] },
    // The hopper rides on the right of the tube, below the sight line: aim straight down the tube top.
    adsDistance: .34, adsEye: [0, .245, .084], adsPitch: 0, adsFov: 58, poles: POLES_LONG,
    choreoFrame: { pos: [.22, -.13, -.5], rot: [.04, .3, .25] },
    shoulders: { R: [.383, -.788, -.357], L: [.01, -.688, -.616] },
    // The coconut lifts reach over the tube to the hopper on its right: the support arm comes from the left
    // for them, as authored (the earlier shoulders, carried with the gun to this hip).
    reloadShoulders: { R: [.137, -.556, -.175], L: [-.342, -.53, -.552] }, adsShoulders: { R: [.147, -.807, -.114], L: [-.13, -.691, -.407] },
    grips: GRIPS.coco,
    recoil: { kick: 2.6, climb: 7.5, roll: 1.6, frequency: 16 }, inertia: 1.3,
  },
  dmr: {
    url: 'models/arsenal/dmr.glb', scale: 1, handling: 'rifle', reload: 'rifle',
    hip: { pos: [.171, -.169, -.669], rot: [.07, .14, .14] },
    sprint: { pos: [-.045, -.055, -.015], rot: [-.18, .45, .15] },
    adsDistance: .12, adsFov: 58, poles: POLES_LONG,
    choreoFrame: { pos: [.217, -.096, -.46], rot: [0, .3, .45] },
    shoulders: { R: [.37, -.707, -.348], L: [-.018, -.531, -.604] }, adsShoulders: { R: [.148, -.726, .092], L: [-.132, -.526, -.204] },
    grips: GRIPS.dmr,
    recoil: { kick: 1.7, climb: 4.2, roll: 1.6, frequency: 20 }, inertia: 1.05,
  },
  sniper: {
    url: 'models/arsenal/sniper.glb', scale: 1, handling: 'heavy', reload: 'bolt',
    hip: { pos: [.19, -.173, -.69], rot: [.044, .122, .14] },
    sprint: { pos: [-.045, -.055, -.015], rot: [-.18, .45, .05] },
    adsDistance: .12, adsFov: 58, poles: POLES_LONG,
    choreoFrame: { pos: [.217, -.096, -.46], rot: [0, .3, .45] },
    shoulders: { R: [.393, -.705, -.386], L: [.016, -.578, -.595] }, adsShoulders: { R: [.157, -.718, .057], L: [-.13, -.553, -.183] },
    grips: GRIPS.sniper,
    recoil: { kick: 2.8, climb: 7, roll: 2, frequency: 15 }, inertia: 1.35,
  },
  machete: {
    url: 'models/arsenal/machete.glb', scale: 1, handling: 'melee', reload: 'none',
    // Carried at the lower right, the blade rising diagonally up and left to just short of the reticle, its
    // flat and the back of the gripping paw toward the eye; the free paw guards open at the lower left
    // (Valorant's and Call of Duty's knife framing).
    hip: { pos: [.207, -.17, -.6], rot: [.599, .419, 2.281] },
    sprint: { pos: [.03, -.08, .04], rot: [.18, -.35, .15] }, adsDistance: .3,
    shoulders: { R: [.45, -.6, -.5], L: [-.3, -.6, -.1] }, poles: { R: [.6, -1, .3], L: [-.6, -1, .2] },
    freePaw: { wrist: [-.21, -.17, -.44], forward: [.45, .45, -1], palm: [.75, -.6, .1] },
    choreoFrame: { pos: [.19, -.12, -.48], rot: [.70, .85, 2.0] },
    grips: GRIPS.machete,
    recoil: { kick: 0, climb: 0, roll: 0, frequency: 20 }, inertia: .8,
  },
};

/** A weapon's rest grips with its first-person elbow directions applied. */
export function framedGrips(spec: Pick<ViewSpec, 'grips' | 'poles'>): ViewSpec['grips'] {
  const R = spec.poles?.R ? { ...spec.grips.R, pole: spec.poles.R } : spec.grips.R;
  const L = spec.grips.L && spec.poles?.L ? { ...spec.grips.L, pole: spec.poles.L } : spec.grips.L;
  return L ? { R, L } : { R };
}

const ARSENAL_BYTES = arsenalMetrics as Record<string, { bytes: number }>;
export function fpManifest(): AssetEntry[] {
  return [
    { path: 'models/fp/fp-arms.glb', kind: 'glb', bytes: armsMetrics.bytes, label: 'Patas da capivara' },
    ...Object.values(VIEW_SPECS).map(spec => ({ path: spec.url, kind: 'glb' as const,
      bytes: ARSENAL_BYTES[spec.url.split('/').pop()!.replace('.glb', '')]?.bytes ?? 0, label: 'Arsenal' })),
  ];
}
