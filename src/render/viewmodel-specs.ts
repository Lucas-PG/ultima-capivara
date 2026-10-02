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
export type IndexPose = Pick<HandCurl, 'index' | 'indexSpread' | 'indexRoll' | 'indexPad'>;
export interface GripSpec { wrist: V3; forward: V3; palm: V3; curl: HandCurl; pole: V3; /** Follow an animated part (the pump). */ part?: string;
  /** Trigger-digit poses fitted without moving the load-bearing palm and other digits. */ indexed?: IndexPose; fired?: IndexPose }

/** Shared first/third-person trigger articulation. Other digits keep their carrying grip throughout. */
export function heldCurl(grip: GripSpec, indexedAmount = 0, triggerPull = 0): HandCurl {
  if (!indexedAmount && (!triggerPull || !grip.fired)) return grip.curl;
  const indexed = Math.max(0, Math.min(1, indexedAmount)), pulled = Math.max(0, Math.min(1, triggerPull));
  const fired = grip.fired ?? grip.curl, safe = grip.indexed ?? { index: [.05, .08, .05] as V3, indexSpread: 0 };
  if (indexed === 1) return { ...grip.curl, ...safe, indexRoll: safe.indexRoll ?? 0, indexPad: safe.indexPad ?? 1 };
  if (indexed === 0 && pulled === 1) return { ...grip.curl, ...fired, indexRoll: fired.indexRoll ?? grip.curl.indexRoll ?? 0,
    indexPad: fired.indexPad ?? grip.curl.indexPad ?? 1 };
  const joint = (i: 0 | 1 | 2) => {
    const ready = grip.curl.index[i] + (fired.index[i] - grip.curl.index[i]) * pulled;
    return ready + (safe.index[i] - ready) * indexed;
  };
  const readySpread = (grip.curl.indexSpread ?? 0) + ((fired.indexSpread ?? 0) - (grip.curl.indexSpread ?? 0)) * pulled;
  const readyRoll = (grip.curl.indexRoll ?? 0) + ((fired.indexRoll ?? grip.curl.indexRoll ?? 0) - (grip.curl.indexRoll ?? 0)) * pulled;
  const readyPad = (grip.curl.indexPad ?? 1) + ((fired.indexPad ?? grip.curl.indexPad ?? 1) - (grip.curl.indexPad ?? 1)) * pulled;
  return { ...grip.curl, index: [joint(0), joint(1), joint(2)], indexSpread: readySpread + ((safe.indexSpread ?? 0) - readySpread) * indexed,
    indexRoll: readyRoll + ((safe.indexRoll ?? 0) - readyRoll) * indexed,
    indexPad: readyPad + ((safe.indexPad ?? 1) - readyPad) * indexed };
}
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
  freePaw?: { wrist: V3; forward: V3; palm: V3; curl?: HandCurl };
  /** Share (0 to 1) of the gun's motion (sway, bob, cuts, inspect) the hidden firing shoulder follows: a
   * one-handed blade moves as one piece with its forearm. Holding paws always follow a draw or holster. */
  armRide?: number;
  /** Hidden shoulders while reloading (blended in and out), where a reload's reaches need the arm from elsewhere. */
  reloadShoulders?: { R: V3; L: V3 };
  /** Elbow directions while aimed (blended in by the aim amount). */
  adsPoles?: { R?: V3; L?: V3 };
  /** Natural-wrist arm solve per arm (default on, with WRIST_SOLVE): false keeps the authored shoulder and elbow. */
  natural?: { R?: boolean; L?: boolean };
  /** Handguns sprint one-handed: the support paw's free pose (camera space), blended in by the sprint. */
  sprintFree?: { wrist: V3; forward: V3; palm: V3 };
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
// the horizon, the support paw under the rear of the fore-end just right of centre and low, its forearm
// foreshortened from the bottom edge, the firing paw's back at the lower right. Hidden shoulders and
// elbow poles (hip, and blended in while aiming) were solved with tools/qa/vm-arm-solve.mts so each
// forearm continues its paw with a natural wrist; the arm solver keeps that true in every other state.
// One narrow hip lens (VIEWMODEL_FOV) for every gun; while aiming the lens blends back to each gun's
// authored sight picture (adsFov).
export const VIEW_SPECS: Record<WeaponId, ViewSpec> = {
  pistol: {
    url: 'models/arsenal/pistol.glb', scale: 1, handling: 'pistol', reload: 'pistol',
    hip: { pos: [.056, -.085, -.393], rot: [.035, .052, .07] },
    // Sprint: low and canted inward, muzzle forward-down, so the slide's flank shows (MW, Apex).
    sprint: { pos: [-.035, -.02, .03], rot: [-.15, .25, .35] },
    sprintFree: { wrist: [-.2, -.42, -.3], forward: [.25, .6, -1], palm: [.7, -.5, .2] },
    adsDistance: .32, adsFov: 64, poles: { R: [-.249, -.938, .243], L: [.072, -.876, .478] }, adsPoles: { R: [-.548, -.769, .33], L: [-.121, -.759, .64] },
    choreoFrame: { pos: [.13, -.085, -.40], rot: [.03, .10, .16] },
    shoulders: { R: [.056, -.076, .079], L: [-.213, -.043, -.059] }, adsShoulders: { R: [.097, -.081, .077], L: [-.226, .004, -.134] },
    grips: GRIPS.pistol,
    recoil: { kick: 1.25, climb: 5.2, roll: 1.5, frequency: 26 }, inertia: .7,
  },
  revolver: {
    url: 'models/arsenal/revolver.glb', scale: 1, handling: 'pistol', reload: 'revolver',
    hip: { pos: [.059, -.1, -.422], rot: [.035, .052, .07] },
    sprint: { pos: [-.035, -.03, .035], rot: [-.15, .25, .35] },
    sprintFree: { wrist: [-.2, -.42, -.3], forward: [.25, .6, -1], palm: [.7, -.5, .2] },
    adsDistance: .3, adsFov: 64, poles: { R: [-.23, -.955, .187], L: [.187, -.825, .534] }, adsPoles: { R: [-.492, -.807, .326], L: [-.129, -.751, .648] },
    choreoFrame: { pos: [.12, -.10, -.43], rot: [.04, .15, -.06] },
    shoulders: { R: [.05, -.122, .053], L: [-.172, -.041, -.083] }, adsShoulders: { R: [.077, -.102, .066], L: [-.221, -.014, -.136] },
    // Reloading, the support arm works from below and left (the crane, the ejector, the loader), not across the top.
    reloadShoulders: { R: [.05, -.122, .053], L: [-.25, -.3, -.1] },
    grips: GRIPS.revolver,
    recoil: { kick: 1.7, climb: 8, roll: 2.2, frequency: 21 }, inertia: .75,
  },
  smg: {
    url: 'models/arsenal/smg.glb', scale: 1, handling: 'rifle', reload: 'rifle',
    hip: { pos: [.134, -.145, -.517], rot: [.087, .122, .122] },
    sprint: { pos: [-.025, -.02, .035], rot: [.30, .45, .28] },
    adsDistance: .23, adsFov: 64, poles: { R: [.206, -.969, -.135], L: [-.6, -1, .2] }, adsPoles: { R: [-.515, -.831, .21], L: [-.4, -1, .3] },
    choreoFrame: { pos: [.16, -.145, -.46], rot: [.04, .20, -.08] },
    shoulders: { R: [.042, -.345, .072], L: [-.016, -.315, -.135] },
    // Reloading, the support arm hangs further left so its forearm clears the magazine on the way back to the foregrip.
    reloadShoulders: { R: [.042, -.345, .072], L: [-.15, -.35, -.05] }, adsShoulders: { R: [.064, -.124, .218], L: [-.3, -.4, 0] },
    grips: GRIPS.smg,
    recoil: { kick: .9, climb: 1.8, roll: 1.4, frequency: 24 }, inertia: .85,
  },
  m4: {
    url: 'models/arsenal/m4.glb', scale: 1, handling: 'rifle', reload: 'rifle',
    hip: { pos: [.157, -.167, -.589], rot: [.105, .14, .14] },
    sprint: { pos: [-.03, -.045, .015], rot: [-.12, .6, .1] },
    adsDistance: .15, adsFov: 70, poles: { R: [-.04, -.999, -.02], L: [.757, -.616, .218] }, adsPoles: { R: [-.364, -.815, .45], L: [.507, -.427, .749] },
    choreoFrame: { pos: [.168, -.112, -.325], rot: [.07, .32, .4] },
    shoulders: { R: [.201, -.295, .012], L: [-.242, -.441, -.334] }, adsShoulders: { R: [.075, -.084, .211], L: [-.519, -.246, -.088] },
    grips: GRIPS.m4,
    recoil: RECOIL.rifle, inertia: 1,
  },
  shotgun: {
    url: 'models/arsenal/shotgun.glb', scale: 1, handling: 'heavy', reload: 'shotgun',
    hip: { pos: [.155, -.156, -.537], rot: [.052, .122, .14] },
    sprint: { pos: [-.045, -.055, -.015], rot: [-.18, .45, .05] },
    // The receiver stands taller than the rib: sight from above it, down the rib to the bead.
    adsDistance: .3, adsEye: [0, .113, .03], adsPitch: .003, adsFov: 56, poles: { R: [-.291, -.955, .06], L: [.842, -.34, .419] }, adsPoles: { R: [-.698, -.62, .359], L: [.614, -.572, .543] },
    choreoFrame: { pos: [.22, -.1, -.5], rot: [0, .3, .4] },
    shoulders: { R: [.25, -.3, -.05], L: [-.221, -.419, -.35] }, adsShoulders: { R: [.102, -.096, .068], L: [-.448, -.242, -.218] },
    grips: GRIPS.shotgun,
    recoil: { kick: 2.4, climb: 6.5, roll: 2.5, frequency: 17 }, inertia: 1.25,
  },
  coco: {
    url: 'models/arsenal/coco.glb', scale: 1, handling: 'heavy', reload: 'coco',
    hip: { pos: [.188, -.255, -.669], rot: [.087, .14, .14] },
    sprint: { pos: [-.035, -.025, .02], rot: [-.14, .40, .1] },
    // The hopper rides on the right of the tube, below the sight line: aim straight down the tube top.
    adsDistance: .34, adsEye: [0, .245, .084], adsPitch: 0, adsFov: 58, poles: { R: [.109, -.992, .068], L: [.839, -.485, .247] }, adsPoles: { R: [-.244, -.875, .418], L: [.757, -.416, .504] },
    choreoFrame: { pos: [.22, -.13, -.5], rot: [.04, .3, .25] },
    shoulders: { R: [.22, -.339, -.073], L: [-.136, -.494, -.473] },
    // The coconut lifts reach over the tube to the hopper on its right: the support arm comes from the left
    // for them, as authored (the earlier shoulders carried with the gun to this hip, a little further left).
    reloadShoulders: { R: [.137, -.556, -.175], L: [-.42, -.53, -.55] }, adsShoulders: { R: [.043, -.187, .039], L: [-.37, -.349, -.243] },
    grips: GRIPS.coco,
    recoil: { kick: 2.6, climb: 7.5, roll: 1.6, frequency: 16 }, inertia: 1.3,
  },
  dmr: {
    url: 'models/arsenal/dmr.glb', scale: 1, handling: 'rifle', reload: 'rifle',
    hip: { pos: [.171, -.193, -.669], rot: [.07, .14, .14] },
    sprint: { pos: [-.045, -.055, -.015], rot: [-.18, .45, .15] },
    adsDistance: .12, adsFov: 58, poles: { R: [.104, -.995, -.004], L: [.894, -.298, .333] }, adsPoles: { R: [-.181, -.859, .478], L: [.458, -.57, .683] },
    choreoFrame: { pos: [.217, -.096, -.46], rot: [0, .3, .45] },
    shoulders: { R: [.28, -.31, -.027], L: [-.156, -.399, -.452] }, adsShoulders: { R: [.082, -.094, .233], L: [-.471, -.223, -.25] },
    grips: GRIPS.dmr,
    recoil: { kick: 1.7, climb: 4.2, roll: 1.6, frequency: 20 }, inertia: 1.05,
  },
  sniper: {
    url: 'models/arsenal/sniper.glb', scale: 1, handling: 'heavy', reload: 'bolt',
    hip: { pos: [.19, -.195, -.69], rot: [.044, .122, .14] },
    sprint: { pos: [-.045, -.055, -.015], rot: [-.18, .45, .05] },
    adsDistance: .12, adsFov: 58, poles: { R: [-.077, -.996, -.034], L: [.558, -.79, .254] }, adsPoles: { R: [-.263, -.882, .39], L: [.202, -.255, .946] },
    choreoFrame: { pos: [.217, -.096, -.46], rot: [0, .3, .45] },
    shoulders: { R: [.275, -.325, -.068], L: [-.207, -.302, -.392] }, adsShoulders: { R: [.059, -.111, .212], L: [-.497, -.238, -.331] },
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
    shoulders: { R: [.12, -.565, -.706], L: [-.3, -.6, -.1] }, poles: { R: [-.348, -.405, .846], L: [-.6, -1, .2] },
    // The free paw rests relaxed and open low at the lower left, mostly out of frame.
    freePaw: { wrist: [-.27, -.31, -.43], forward: [.3, .55, -1], palm: [.65, -.6, .2],
      curl: { index: [.35, .45, .3], middle: [.4, .5, .3], ring: [.45, .5, .35], thumb: [.2, .15, .1], spread: .25 } },
    choreoFrame: { pos: [.19, -.12, -.48], rot: [.70, .85, 2.0] }, armRide: 1,
    // The blade's arm rides rigidly with the cut, so its wrist keeps the carry's natural angles throughout.
    natural: { R: false },
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
