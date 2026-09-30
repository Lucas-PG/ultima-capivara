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
    hip: { pos: [.16, -.085, -.50], rot: [.04, .38, -.10] },
    sprint: { pos: [-.03, -.045, .015], rot: [-.12, .6, .1] }, adsDistance: .15, viewmodelFov: 62, shoulders: RIFLE_SHOULDERS,
    // Right index occupies the roomy guard; support wraps the rear handguard.
    // Contact coordinates are measured against the packed asset in metres.
    grips: { R: {wrist: [0.03673, -0.085649, 0.101657], forward: [0.14615, 0.41919, -0.896058], palm: [-0.929482, -0.251912, -0.26945], pole: [0.8, -1, 0.3], curl: {index: [0.410279, 0.181295, 0.101941], middle: [0.839068, 0.627801, 0.810085], ring: [1.245737, 0.765474, -0.011606], thumb: [-0.1, 0.213327, 0.303182], spread: 0.203024}},
      L: {wrist: [-0.066016, 0.060359, -0.141015], forward: [0.074714, 0.399403, -0.913726], palm: [0.898035, -0.425303, -0.112475], pole: [-0.8, -1, 0.1], curl: {index: [0.571759, 1.513912, 0.276212], middle: [0.400614, 1.310437, 1.17425], ring: [1.361137, -0.1, 0.430514], thumb: [-0.1, -0.1, 0.583421], spread: -0.479682}} },
    recoil: RECOIL.rifle, inertia: 1,
  },
  shotgun: {
    url: 'models/arsenal/shotgun.glb', scale: 1, handling: 'heavy', reload: 'shotgun',
    hip: { pos: [.17, -0.1, -.54], rot: [.04, .38, -.10] }, viewmodelFov: 64,
    // The receiver stands taller than the rib: sight from above it, down the rib to the bead.
    sprint: { pos: [-.045, -.055, -.015], rot: [-.18, .45, .05] }, shoulders: { R: [.32, -.42, .08], L: [-.18, -.26, -.14] }, adsDistance: .3, adsEye: [0, .113, .03], adsPitch: .003,
    grips: {R: {wrist: [0.039829, -0.066649, 0.095531], forward: [0.006937, 0.04762, -0.998841], palm: [-0.935857, 0.35223, 0.010293], pole: [0.8, -1, 0.3], curl: {index: [0.893633, -0.1, -0.1], middle: [0.872103, 0.765716, 1.3], ring: [1.7, 0.718443, -0.04509], thumb: [0.169247, -0.00121, 0.129398], spread: 0.036586}}, L: {"wrist": [-0.04829, -0.010082, -0.255699], "forward": [0.911082, -0.155341, -0.381837], "palm": [0.089054, 0.978577, -0.185622], "pole": [-0.8, -0.5, 0.1], "curl": {"index": [0.366696, 0.530867, 0.034256], "middle": [0.432906, 0.701724, 0.416634], "ring": [0.794207, 0.253968, 0.241194], "thumb": [0.594733, -0.041763, 0.649773], "spread": 0.84603}, "part": "pump"}},
    recoil: { kick: 2.4, climb: 6.5, roll: 2.5, frequency: 17 }, inertia: 1.25,
  },
  coco: {
    url: 'models/arsenal/coco.glb', scale: 1, handling: 'heavy', reload: 'coco',
    hip: { pos: [.17, -0.155, -.6], rot: [.04, .38, -.10] }, viewmodelFov: 62,
    // The hopper stands over the tube: use the matching offset notch and front post along its left side.
    sprint: { pos: [-.035, -.025, .02], rot: [-.14, .40, .1] }, shoulders: { R: [.32, -.42, .08], L: [-.18, -.26, -.14] }, adsDistance: .32, adsEye: [-.17, .194, .087], adsPitch: -.003,
    grips: {R: {wrist: [0.04176, -0.081663, 0.101139], forward: [0.03953, 0.321209, -0.946183], palm: [-0.981749, -0.163807, -0.096625], pole: [0.8, -1, 0.3], curl: {index: [0.330593, 0.193231, 0.054067], middle: [0.718137, 0.714601, 0.878175], ring: [0.825117, 0.912549, 0.006472], thumb: [-0.0994, -0.1, 0.153029], spread: 0.242279}}, L: {wrist: [-0.05783, 0.00522, -0.224605], forward: [0.027421, 0.438813, -0.89816], palm: [0.870697, -0.451863, -0.194184], pole: [-0.8, -1, 0.1], curl: {index: [0.191884, 1.692804, 0.179111], middle: [0.414467, 1.446004, 1.289294], ring: [1.311731, -0.1, 0.431467], thumb: [-0.055075, -0.044778, 0.508262], spread: -0.439967}, part: "pump"}},
    recoil: { kick: 2.6, climb: 7.5, roll: 1.6, frequency: 16 }, inertia: 1.3,
  },
  dmr: {
    url: 'models/arsenal/dmr.glb', scale: 1, handling: 'rifle', reload: 'rifle',
    hip: { pos: [.17, -0.1, -.54], rot: [.04, .38, -.10] }, viewmodelFov: 62,
    sprint: { pos: [-.045, -.055, -.015], rot: [-.18, .45, .05] }, shoulders: { R: [.46, -.36, .08], L: [-.18, -.26, -.14] }, adsDistance: .12,
    grips: {R: {wrist: [0.042294, -0.078092, 0.104591], forward: [0.024757, 0.301231, -0.95323], palm: [-0.963511, -0.247023, -0.103086], pole: [0.8, -1, 0.3], curl: {index: [0.431278, -0.076448, 0.050724], middle: [0.776043, 0.599022, 0.908378], ring: [0.996669, 1.096922, -0.042761], thumb: [-0.062005, -0.088964, 0.595735], spread: 0.717973}}, L: {wrist: [-0.063438, 0.047938, -0.16662], forward: [-0.062985, 0.932039, -0.356842], palm: [0.882658, -0.114848, -0.455769], pole: [-0.8, -1, 0.1], curl: {index: [1.008798, 1.58085, 0.547956], middle: [1.058809, 1.114573, 0.980641], ring: [1.609121, -0.1, -0.1], thumb: [-0.049445, 0.08068, 1], spread: -0.589737}}},
    recoil: { kick: 1.7, climb: 4.2, roll: 1.6, frequency: 20 }, inertia: 1.05,
  },
  sniper: {
    url: 'models/arsenal/sniper.glb', scale: 1, handling: 'heavy', reload: 'bolt',
    hip: { pos: [.17, -0.095, -.58], rot: [.04, .38, -.10] }, viewmodelFov: 64,
    sprint: { pos: [-.045, -.055, -.015], rot: [-.18, .45, .05] }, shoulders: { R: [.4, -.5, .10], L: [-.18, -.26, -.14] }, adsDistance: .12,
    grips: {R: {wrist: [0.053526, -0.093071, 0.095477], forward: [-0.084158, 0.30867, -0.947439], palm: [-0.992503, -0.110539, 0.052148], pole: [1, -0.15, 0.1], curl: {index: [0.063997, 0.435093, 0.188558], middle: [0.633144, 0.763352, 0.503952], ring: [1.083091, 0.858482, -0.017053], thumb: [-0.1, 0.124929, 0.493332], spread: 0.396903}}, L: {wrist: [-0.065256, 0.024245, -0.231177], forward: [-0.082326, 0.771908, -0.630381], palm: [0.881658, -0.238496, -0.407183], pole: [-0.8, -1, 0.1], curl: {index: [1.169868, 1.492473, 0.020263], middle: [1.133511, 1.134429, 0.662263], ring: [1.631724, -0.1, -0.1], thumb: [-0.1, 0.115746, 0.939441], spread: -0.556926}}},
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
