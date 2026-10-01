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
  /** Independent weapon lens; preserves peripheral world vision. */
  viewmodelFov?: number;
  /** Aim point in weapon space when the sight socket is blocked by the gun's own body, and the muzzle-up pitch that puts the front sight on the crosshair. */
  adsEye?: V3; adsPitch?: number;
  grips: { R: GripSpec; L?: GripSpec };
  /** Hidden shoulder joints (camera space) the arms hang from; they set where each forearm enters the frame. */
  shoulders?: { R: V3; L: V3 };
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
const RIFLE_SHOULDERS = { R: [.2, -.36, .25] as V3, L: [-.18, -.26, -.14] as V3 };
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
const LONG_SPRINT = { pos: [-.03, -.05, .06] as V3, rot: [.22, .6, .38] as V3 };

// Paw grips per weapon (weapon space), fitted to the first-person paw with tools/qa/grip-fit.mjs
// and checked with tools/qa/fp-clearance.mjs. The world character holds guns with the same data.
const GRIPS = fittedGrips as unknown as Record<WeaponId, ViewSpec['grips']>;

export const VIEW_SPECS: Record<WeaponId, ViewSpec> = {
  pistol: {
    url: 'models/arsenal/pistol.glb', scale: 1, handling: 'pistol', reload: 'pistol',
    hip: { pos: [.13, -.085, -.40], rot: [.03, .10, .16] },
    sprint: { pos: [-.025, -.025, .035], rot: [.62, .18, .22] },
    adsDistance: .32, viewmodelFov: 64, shoulders: { R: [.2, -.36, .25], L: [-.20, -.28, .18] },
    grips: GRIPS.pistol,
    recoil: { kick: 1.25, climb: 5.2, roll: 1.5, frequency: 26 }, inertia: .7,
  },
  revolver: {
    url: 'models/arsenal/revolver.glb', scale: 1, handling: 'pistol', reload: 'revolver',
    hip: { pos: [.12, -.10, -.43], rot: [.04, .15, -.06] },
    sprint: { pos: [-.02, -.05, .07], rot: [.95, .25, .3] },
    shoulders: { R: [.2, -.36, .25], L: [-.20, -.28, .18] }, adsDistance: .3, viewmodelFov: 64,
    grips: GRIPS.revolver,
    recoil: { kick: 1.7, climb: 8, roll: 2.2, frequency: 21 }, inertia: .75,
  },
  smg: {
    url: 'models/arsenal/smg.glb', scale: 1, handling: 'rifle', reload: 'rifle',
    hip: { pos: [.16, -.145, -.46], rot: [.04, .20, -.08] },
    sprint: { pos: [-.025, -.02, .035], rot: [.30, .45, .28] },
    shoulders: { R: [.2, -.36, .25], L: [-.24, -.35, .10] }, adsDistance: .23, viewmodelFov: 64,
    grips: GRIPS.smg,
    recoil: { kick: .9, climb: 1.8, roll: 1.4, frequency: 24 }, inertia: .85,
  },
  m4: {
    url: 'models/arsenal/m4.glb', scale: 1, handling: 'rifle', reload: 'rifle',
    hip: {"pos": [0.168, -0.112, -0.325], "rot": [0.07, 0.32, 0.4]},
    sprint: { pos: [-.03, -.045, .015], rot: [-.12, .6, .1] }, adsDistance: .15, viewmodelFov: 70, shoulders: { R: [0.32, -0.42, 0.08], L: [-0.3, -0.45, -0.12] },
    // Right index occupies the roomy guard; support wraps the rear handguard.
    // Contact coordinates are measured against the packed asset in metres.
    grips: GRIPS.m4,
    recoil: RECOIL.rifle, inertia: 1,
  },
  shotgun: {
    url: 'models/arsenal/shotgun.glb', scale: 1, handling: 'heavy', reload: 'shotgun',
    hip: {"pos": [0.22, -0.1, -0.5], "rot": [0, 0.3, 0.4]}, viewmodelFov: 56,
    // The receiver stands taller than the rib: sight from above it, down the rib to the bead.
    sprint: { pos: [-.045, -.055, -.015], rot: [-.18, .45, .05] }, shoulders: { R: [0.28, -0.42, 0], L: [-0.25, -0.45, -0.3] }, adsDistance: .3, adsEye: [0, .113, .03], adsPitch: .003,
    grips: GRIPS.shotgun,
    recoil: { kick: 2.4, climb: 6.5, roll: 2.5, frequency: 17 }, inertia: 1.25,
  },
  coco: {
    url: 'models/arsenal/coco.glb', scale: 1, handling: 'heavy', reload: 'coco',
    hip: {"pos": [0.22, -0.13, -0.5], "rot": [0.04, 0.3, 0.25]}, viewmodelFov: 58,
    // The hopper rides on the right of the tube, below the sight line: aim straight down the tube top.
    sprint: { pos: [-.035, -.025, .02], rot: [-.14, .40, .1] }, shoulders: { R: [0.28, -0.42, 0], L: [-0.25, -0.46, -0.3] }, adsDistance: 0.34, adsEye: [0, 0.245, 0.084], adsPitch: 0,
    grips: GRIPS.coco,
    recoil: { kick: 2.6, climb: 7.5, roll: 1.6, frequency: 16 }, inertia: 1.3,
  },
  dmr: {
    url: 'models/arsenal/dmr.glb', scale: 1, handling: 'rifle', reload: 'rifle',
    hip: {"pos": [0.217, -0.096, -0.46], "rot": [0, 0.3, 0.45]}, viewmodelFov: 58,
    sprint: { pos: [-.045, -.055, -.015], rot: [-.18, .45, .05] }, shoulders: { R: [0.4, -0.4, 0.05], L: [-0.26, -0.46, -0.26] }, adsDistance: .12,
    grips: GRIPS.dmr,
    recoil: { kick: 1.7, climb: 4.2, roll: 1.6, frequency: 20 }, inertia: 1.05,
  },
  sniper: {
    url: 'models/arsenal/sniper.glb', scale: 1, handling: 'heavy', reload: 'bolt',
    hip: {"pos": [0.217, -0.096, -0.46], "rot": [0, 0.3, 0.45]}, viewmodelFov: 58,
    sprint: { pos: [-.045, -.055, -.015], rot: [-.18, .45, .05] }, shoulders: { R: [0.4, -0.4, 0.05], L: [-0.26, -0.46, -0.26] }, adsDistance: .12,
    grips: GRIPS.sniper,
    recoil: { kick: 2.8, climb: 7, roll: 2, frequency: 15 }, inertia: 1.35,
  },
  machete: {
    url: 'models/arsenal/machete.glb', scale: 1, handling: 'melee', reload: 'none',
    hip: { pos: [.19, -.12, -.48], rot: [.70, .85, 2.0] },
    sprint: { pos: [.03, -.08, .04], rot: [.18, -.35, .15] }, adsDistance: .3, viewmodelFov: 64,
    grips: GRIPS.machete,
    recoil: { kick: 0, climb: 0, roll: 0, frequency: 20 }, inertia: .8,
  },
};

const ARSENAL_BYTES = arsenalMetrics as Record<string, { bytes: number }>;
export function fpManifest(): AssetEntry[] {
  return [
    { path: 'models/fp/fp-arms.glb', kind: 'glb', bytes: armsMetrics.bytes, label: 'Patas da capivara' },
    ...Object.values(VIEW_SPECS).map(spec => ({ path: spec.url, kind: 'glb' as const,
      bytes: ARSENAL_BYTES[spec.url.split('/').pop()!.replace('.glb', '')]?.bytes ?? 0, label: 'Arsenal' })),
  ];
}
