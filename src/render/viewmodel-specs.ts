import type { WeaponId } from '../shared/types';
import type { HandCurl } from './fp-arms';
import type { AssetEntry } from './asset-manifest';
import arsenalMetrics from '../../public/models/arsenal/metrics.json';
import armsMetrics from '../../public/models/fp/metrics.json';

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

export const VIEW_SPECS: Record<WeaponId, ViewSpec> = {
  pistol: {
    url: 'models/arsenal/pistol.glb', scale: 1, handling: 'pistol', reload: 'pistol',
    hip: { pos: [.135, -.105, -.36], rot: [.05, .24, -.09] },
    sprint: { pos: [-.02, -.05, .07], rot: [.95, .25, .3] },
    adsDistance: .3, grips: PISTOL_GRIPS,
    recoil: { kick: 1.25, climb: 5.2, roll: 1.5, frequency: 26 }, inertia: .7,
  },
  revolver: {
    url: 'models/arsenal/revolver.glb', scale: 1, handling: 'pistol', reload: 'revolver',
    hip: { pos: [.14, -.11, -.37], rot: [.05, .24, -.09] },
    sprint: { pos: [-.02, -.05, .07], rot: [.95, .25, .3] },
    adsDistance: .3,
    grips: { R: { ...PISTOL_GRIPS.R, wrist: [.034, -.025, .054] }, L: { ...PISTOL_GRIPS.L, wrist: [-.040, -.058, .054] } },
    recoil: { kick: 1.7, climb: 8, roll: 2.2, frequency: 21 }, inertia: .75,
  },
  smg: {
    url: 'models/arsenal/smg.glb', scale: 1, handling: 'rifle', reload: 'rifle',
    hip: { pos: [.16, -.18, -.35], rot: [.06, .24, -.12] },
    sprint: LONG_SPRINT, shoulders: RIFLE_SHOULDERS, adsDistance: .2,
    grips: { R: RIFLE_GRIP_R([.037, -.025, .045]), L: FOREGRIP_L([-.032, -.036, -.1]) },
    recoil: { kick: .9, climb: 1.8, roll: 1.4, frequency: 24 }, inertia: .85,
  },
  m4: {
    url: 'models/arsenal/m4.glb', scale: 1, handling: 'rifle', reload: 'rifle',
    hip: { pos: [.15, -.14, -.45], rot: [.04, .18, -.10] },
    sprint: LONG_SPRINT, adsDistance: .15, viewmodelFov: 64, shoulders: RIFLE_SHOULDERS,
    // Right index occupies the roomy guard; support wraps the rear handguard.
    // Contact coordinates are measured against the packed asset in metres.
    grips: { R: {wrist: [0.043291, -0.034263, 0.076335], forward: [0.24894, -0.287327, -0.924917], palm: [-0.968176, -0.048426, -0.245539], pole: [0.8, -1, 0.3], curl: {index: [1.233688, 0.498791, 0.198466], middle: [1.640656, 0.978047, 0.615716], ring: [1.157106, 0.842412, 0.390713], thumb: [0.44918, 0.426999, 0.725114], spread: 0.237084}},
      L: {wrist: [-0.066016, 0.060359, -0.141015], forward: [0.074714, 0.399403, -0.913726], palm: [0.898035, -0.425303, -0.112475], pole: [-0.8, -1, 0.1], curl: {index: [0.571759, 1.513912, 0.276212], middle: [0.400614, 1.310437, 1.17425], ring: [1.361137, -0.1, 0.430514], thumb: [-0.1, -0.1, 0.583421], spread: -0.479682}} },
    recoil: RECOIL.rifle, inertia: 1,
  },
  shotgun: {
    url: 'models/arsenal/shotgun.glb', scale: 1, handling: 'heavy', reload: 'shotgun',
    hip: { pos: [.17, -.19, -.37], rot: [.06, .22, -.12] },
    // The receiver stands taller than the rib: sight from above it, down the rib to the bead.
    sprint: LONG_SPRINT, shoulders: RIFLE_SHOULDERS, adsDistance: .3, adsEye: [0, .13, .02], adsPitch: .07,
    grips: { R: { wrist: [.036, -.014, .052], forward: [-.05, -.25, -1], palm: [-1, 0, 0], curl: RIFLE_R, pole: [.8, -1, .3] }, L: UNDERHAND_L([-.052, -.03, -.33], 'pump') },
    recoil: { kick: 2.4, climb: 6.5, roll: 2.5, frequency: 17 }, inertia: 1.25,
  },
  coco: {
    url: 'models/arsenal/coco.glb', scale: 1, handling: 'heavy', reload: 'coco',
    hip: { pos: [.2, -.22, -.46], rot: [.06, .2, -.1] },
    // The hopper stands over the tube: aim from above it, the notch and hopper lined up on the target.
    sprint: LONG_SPRINT, shoulders: RIFLE_SHOULDERS, adsDistance: .2, adsEye: [-.03, .26, .03], adsPitch: .18,
    grips: { R: RIFLE_GRIP_R([.037, -.025, .045]), L: UNDERHAND_L([-.055, -.035, -.25], 'pump') },
    recoil: { kick: 2.6, climb: 7.5, roll: 1.6, frequency: 16 }, inertia: 1.3,
  },
  dmr: {
    url: 'models/arsenal/dmr.glb', scale: 1, handling: 'rifle', reload: 'rifle',
    hip: { pos: [.17, -.195, -.38], rot: [.06, .22, -.12] },
    sprint: LONG_SPRINT, shoulders: RIFLE_SHOULDERS, adsDistance: .12,
    grips: { R: { wrist: [.036, -.011, .052], forward: [-.05, -.25, -1], palm: [-1, 0, 0], curl: RIFLE_R, pole: [.8, -1, .3] }, L: UNDERHAND_L([-.052, -.01, -.27]) },
    recoil: { kick: 1.7, climb: 4.2, roll: 1.6, frequency: 20 }, inertia: 1.05,
  },
  sniper: {
    url: 'models/arsenal/sniper.glb', scale: 1, handling: 'heavy', reload: 'bolt',
    hip: { pos: [.17, -.2, -.39], rot: [.06, .22, -.12] },
    sprint: LONG_SPRINT, shoulders: RIFLE_SHOULDERS, adsDistance: .12,
    grips: { R: { wrist: [.036, -.014, .052], forward: [-.05, -.25, -1], palm: [-1, 0, 0], curl: RIFLE_R, pole: [.8, -1, .3] }, L: UNDERHAND_L([-.052, -.008, -.3]) },
    recoil: { kick: 2.8, climb: 7, roll: 2, frequency: 15 }, inertia: 1.35,
  },
  machete: {
    url: 'models/arsenal/machete.glb', scale: 1, handling: 'melee', reload: 'none',
    hip: { pos: [.16, -.16, -.4], rot: [.9, .6, -.3] },
    sprint: { pos: [0, -.05, .05], rot: [.3, .2, .2] }, adsDistance: .3,
    grips: { R: { wrist: [.035, -.07, .02], forward: [-.1, 1, .15], palm: [-1, 0, 0], curl: curl([1.45, 1.3, .9], [1.5, 1.35, .95], [1.55, 1.35, .95], [.7, .5, .3]), pole: [.8, -1, .3] } },
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
