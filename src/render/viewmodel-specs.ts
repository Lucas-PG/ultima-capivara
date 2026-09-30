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
    hip: { pos: [.23, -.086, -.372], rot: [.044, .159, .568] },
    sprint: { pos: [-.03, -.045, .015], rot: [-.12, .6, .1] }, adsDistance: .15, viewmodelFov: 71, shoulders: {R: [0.32, -0.42, 0.08], L: [-0.347974, -0.408304, 0.061382]},
    // Right index occupies the roomy guard; support wraps the rear handguard.
    // Contact coordinates are measured against the packed asset in metres.
    grips: {L: {"wrist": [-0.055957, 0.057106, -0.118615], "forward": [0.558887, -0.394012, -0.729657], "palm": [0.784387, 0.536665, 0.311011], "pole": [-1, 0.750774, 0.336303], "curl": {"index": [-0.1, -0.1, -0.1], "middle": [0.830031, -0.001348, -0.1], "ring": [0.955268, -0.1, -0.1], "thumb": [0.604244, -0.272554, 0.06363], "spread": 0.053322}}, R: {wrist: [0.022995, -0.066361, 0.106426], forward: [0.404426, 0.41919, -0.812847], palm: [-0.612636, -0.535732, -0.581093], pole: [0.8, -1, 0.3], curl: {index: [0.470115, 0.394616, 0.343606], middle: [0.927018, 0.599134, 1.024462], ring: [1.7, 0.299979, -0.1], thumb: [0.082804, -0.095181, 0.078912], spread: 0.342322}}},
    recoil: RECOIL.rifle, inertia: 1,
  },
  shotgun: {
    url: 'models/arsenal/shotgun.glb', scale: 1, handling: 'heavy', reload: 'shotgun',
    hip: {"pos": [0.186007, -0.072154, -0.370896], "rot": [-0.075671, 0.104731, 0.549886]}, viewmodelFov: 70.27994,
    // The receiver stands taller than the rib: sight from above it, down the rib to the bead.
    sprint: { pos: [-.045, -.055, -.015], rot: [-.18, .45, .05] }, shoulders: {"R": [0.32, -0.42, 0.08], "L": [-0.533863, -0.337058, -0.116012]}, adsDistance: .3, adsEye: [0, .113, .03], adsPitch: .003,
    grips: {"R": {"wrist": [0.022332, -0.103282, 0.095983], "forward": [0.301106, 0.523768, -0.796871], "palm": [-0.675689, -0.47248, -0.565868], "pole": [0.8, -1, 0.3], "curl": {"index": [0.044154, 0.036773, 0.420567], "middle": [0.343851, 1.466353, -0.010738], "ring": [1.7, 0.153145, -0.1], "thumb": [0.77398, -0.093148, 0.193754], "spread": 0.562315}}, "L": {"wrist": [-0.04829, -0.010082, -0.255699], "forward": [0.911082, -0.155341, -0.381837], "palm": [0.089054, 0.978577, -0.185622], "pole": [-1, -0.720035, 0.038107], "curl": {"index": [0.366696, 0.530867, 0.034256], "middle": [0.432906, 0.701724, 0.416634], "ring": [0.794207, 0.253968, 0.241194], "thumb": [0.594733, -0.041763, 0.649773], "spread": 0.84603}, "part": "pump"}},
    recoil: { kick: 2.4, climb: 6.5, roll: 2.5, frequency: 17 }, inertia: 1.25,
  },
  coco: {
    url: 'models/arsenal/coco.glb', scale: 1, handling: 'heavy', reload: 'coco',
    hip: {"pos": [0.268824, -0.068704, -0.400336], "rot": [-0.090693, 0.043656, 0.543863]}, viewmodelFov: 74.263811,
    // The hopper stands over the tube: use the matching offset notch and front post along its left side.
    sprint: { pos: [-.035, -.025, .02], rot: [-.14, .40, .1] }, shoulders: {"R": [0.32, -0.42, 0.08], "L": [-0.552248, -0.49106, -0.08648]}, adsDistance: .32, adsEye: [-.17, .194, .087], adsPitch: -.003,
    grips: {"R": {"wrist": [0.028038, -0.067413, 0.103065], "forward": [0.37547, 0.427413, -0.822399], "palm": [-0.655368, -0.504998, -0.561667], "pole": [0.8, -1, 0.3], "curl": {"index": [0.671841, 0.222549, 0.097283], "middle": [1.02774, 0.777112, 0.780707], "ring": [1.7, 0.200238, -0.1], "thumb": [-0.098074, 0.055278, -0.041348], "spread": 0.405842}}, "L": {"wrist": [-0.049897, -0.027384, -0.246142], "forward": [0.916163, -0.18198, -0.35711], "palm": [0.131251, 0.978074, -0.161695], "pole": [-1, -0.670562, -0.102812], "curl": {"index": [0.500075, 0.394614, 0.110596], "middle": [0.650407, 0.556593, 0.106378], "ring": [1.100279, -0.1, -0.1], "thumb": [0.650405, 0.161244, 0.168972], "spread": 0.961247}, "part": "pump"}},
    recoil: { kick: 2.6, climb: 7.5, roll: 1.6, frequency: 16 }, inertia: 1.3,
  },
  dmr: {
    url: 'models/arsenal/dmr.glb', scale: 1, handling: 'rifle', reload: 'rifle',
    hip: {"pos": [0.23, -0.08, -0.4], "rot": [0.04, 0.13, 0.6]}, viewmodelFov: 76,
    sprint: { pos: [-.045, -.055, -.015], rot: [-.18, .45, .05] }, shoulders: {"R": [0.32, -0.42, 0.08], "L": [-0.347974, -0.408304, 0.061382]}, adsDistance: .12,
    grips: {"R": {"wrist": [0.023565, -0.05018, 0.10291], "forward": [0.456456, 0.325292, -0.82815], "palm": [-0.653844, -0.508625, -0.560168], "pole": [0.8, -1, 0.3], "curl": {"index": [0.995045, 0.005333, 0.035249], "middle": [0.992214, 0.924683, 0.965462], "ring": [1.7, 0.330288, -0.1], "thumb": [-0.07324, -0.023376, 1], "spread": 0.965321}}, "L": {"wrist": [-0.059203, 0.074558, -0.161451], "forward": [0.552251, -0.499993, -0.667102], "palm": [0.762385, 0.62666, 0.161449], "pole": [-1, 0.750774, 0.336303], "curl": {"index": [-0.078418, -0.097227, 0.578059], "middle": [0.244984, 0.270195, 1.059575], "ring": [1.047623, -0.1, -0.1], "thumb": [0.939737, -0.251783, 0.264329], "spread": 0.242199}}},
    recoil: { kick: 1.7, climb: 4.2, roll: 1.6, frequency: 20 }, inertia: 1.05,
  },
  sniper: {
    url: 'models/arsenal/sniper.glb', scale: 1, handling: 'heavy', reload: 'bolt',
    hip: {"pos": [0.23, -0.08, -0.4], "rot": [0.04, 0.13, 0.6]}, viewmodelFov: 76,
    sprint: { pos: [-.045, -.055, -.015], rot: [-.18, .45, .05] }, shoulders: {"R": [0.32, -0.42, 0.08], "L": [-0.347974, -0.408304, 0.061382]}, adsDistance: .12,
    grips: {"R": {"wrist": [0.027958, -0.076478, 0.107616], "forward": [0.405386, 0.396548, -0.823657], "palm": [-0.677483, -0.474598, -0.561937], "pole": [0.8, -1, 0.3], "curl": {"index": [0.68375, -0.070677, -0.1], "middle": [1.006302, 1.228122, 1.279127], "ring": [1.7, 0.232095, -0.1], "thumb": [-0.1, -0.050618, 0.549216], "spread": 0.346758}}, "L": {"wrist": [-0.056517, 0.062581, -0.187296], "forward": [0.469232, -0.482145, -0.739836], "palm": [0.86095, 0.436137, 0.261821], "pole": [-1, 0.750774, 0.336303], "curl": {"index": [-0.1, -0.1, 0.417678], "middle": [0.125521, 0.640236, 0.054899], "ring": [0.998227, -0.1, -0.1], "thumb": [0.779821, -0.02272, 0.283248], "spread": 0.67787}}},
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
