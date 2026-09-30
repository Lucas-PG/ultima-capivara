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
    hip: { pos: [.13, -.085, -.40], rot: [.03, .10, .16] },
    sprint: { pos: [-.025, -.025, .035], rot: [.62, .18, .22] },
    adsDistance: .32, viewmodelFov: 64, shoulders: { R: [.2, -.36, .25], L: [-.12, -.28, .18] },
    grips: {
      R: { wrist: [.016280, -.057606, .071747], forward: [.466893, .169070, -.868002], palm: [-.874292, -.059101, -.481788],
        curl: curl([.3625, .8125, .395], [.765, .3675, .5275], [1.0025, .215, .033], [.2225, .6825, .418], 1), pole: [.1, -1, .1] },
      L: { wrist: [-.056738, -.060432, .038457], forward: [.050717, .034433, -.998119], palm: [.993572, .099539, .053920],
        curl: curl([1.11183, .051786, .44061], [1.32725, .036, .45816], [1.4675, -.1, -.1], [.12485, .0481, .74906], -.38175), pole: [.1, -.6, .6] },
    },
    recoil: { kick: 1.25, climb: 5.2, roll: 1.5, frequency: 26 }, inertia: .7,
  },
  revolver: {
    url: 'models/arsenal/revolver.glb', scale: 1, handling: 'pistol', reload: 'revolver',
    hip: { pos: [.12, -.10, -.43], rot: [.04, .15, -.06] },
    sprint: { pos: [-.02, -.05, .07], rot: [.95, .25, .3] },
    shoulders: { R: [.2, -.36, .25], L: [-.20, -.28, .18] }, adsDistance: .3, viewmodelFov: 64,
    grips: {
      R: { wrist: [0.010505, -0.061406, 0.077248], forward: [0.535605, 0.195484, -0.821531], palm: [-0.81453, -0.137152, -0.563675],
        curl: curl([0.4625, 0.365, 0.6063], [0.6025, 0.54375, 0.66575], [0.4287, 0.9388, 0.4995], [-0.1, 0.66379, 0.733407], 1.014062), pole: [0.1, -1, 0.1] },
      L: { wrist: [-0.049992, -0.059774, 0.033502], forward: [0.050692, -0.046793, -0.997618], palm: [0.985777, 0.162607, 0.042463],
        curl: curl([0.89433, 0.171, 0.04], [1.243188, 0.724, -0.1], [1.495, -0.1, 0.0835], [0, 0.0281, 0.74906], -0.23175), pole: [0.1, -0.6, 0.6] },
    },
    recoil: { kick: 1.7, climb: 8, roll: 2.2, frequency: 21 }, inertia: .75,
  },
  smg: {
    url: 'models/arsenal/smg.glb', scale: 1, handling: 'rifle', reload: 'rifle',
    hip: { pos: [.16, -.145, -.46], rot: [.04, .20, -.08] },
    sprint: { pos: [-.025, -.02, .035], rot: [.30, .45, .28] },
    shoulders: { R: [.2, -.36, .25], L: [-.24, -.35, .10] }, adsDistance: .23, viewmodelFov: 64,
    grips: { R: { wrist: [.021365, -.060446, .072922], forward: [.466893, .169070, -.868002], palm: [-.874292, -.059101, -.481788],
        curl: curl([.617975, .525613, .218807], [.797975, .415481, .214513], [.988394, .270419, .136959], [-.066706, .701825, .672024], 1), pole: [.1, -1, .1] },
      L: { wrist: [-.05377, -.05397, -.14114], forward: [.25038, .22888, -.94071], palm: [.91867, .2505, .30546],
        curl: curl([.7875, .1975, .3247], [.6625, .8075, .282], [.9025, .4525, .387], [-.1, .014, .133], -.36825), pole: [-.6, -1, .2] } },
    recoil: { kick: .9, climb: 1.8, roll: 1.4, frequency: 24 }, inertia: .85,
  },
  m4: {
    url: 'models/arsenal/m4.glb', scale: 1, handling: 'rifle', reload: 'rifle',
    hip: {"pos": [0.168, -0.112, -0.325], "rot": [0.07, 0.32, 0.4]},
    sprint: { pos: [-.03, -.045, .015], rot: [-.12, .6, .1] }, adsDistance: .15, viewmodelFov: 70, shoulders: { R: [0.32, -0.42, 0.08], L: [-0.3, -0.45, -0.12] },
    // Right index occupies the roomy guard; support wraps the rear handguard.
    // Contact coordinates are measured against the packed asset in metres.
    grips: {L: {"wrist": [-0.06620298567965667, 0.06656503179489037, -0.20597247582832484], "forward": [0.5583379191201537, -0.6800632919516031, -0.4751554345817011], "palm": [0.8170387136035429, 0.5500946910995026, 0.17275291979359086], "pole": [-1, -0.5, 0.2], "curl": {"index": [0.10011548702136971, 0.3330095761689079, 0.6998626424247699], "middle": [0.07883517869937078, 1.2811094058799266, 0.27462084564169087], "ring": [1.2478570231852706, -0.1, -0.1], "thumb": [0.7007584915621096, 0.16991276057680457, 0.09054685215160853], "spread": 1.1028028017977018}}, R: {wrist: [0.022995, -0.066361, 0.106426], forward: [0.404426, 0.41919, -0.812847], palm: [-0.612636, -0.535732, -0.581093], pole: [0.8, -1, 0.3], curl: {index: [0.470115, 0.394616, 0.343606], middle: [0.927018, 0.599134, 1.024462], ring: [1.7, 0.299979, -0.1], thumb: [0.082804, -0.095181, 0.078912], spread: 0.342322}}},
    recoil: RECOIL.rifle, inertia: 1,
  },
  shotgun: {
    url: 'models/arsenal/shotgun.glb', scale: 1, handling: 'heavy', reload: 'shotgun',
    hip: {"pos": [0.22, -0.1, -0.5], "rot": [0, 0.3, 0.4]}, viewmodelFov: 56,
    // The receiver stands taller than the rib: sight from above it, down the rib to the bead.
    sprint: { pos: [-.045, -.055, -.015], rot: [-.18, .45, .05] }, shoulders: { R: [0.28, -0.42, 0], L: [-0.25, -0.45, -0.3] }, adsDistance: .3, adsEye: [0, .113, .03], adsPitch: .003,
    grips: {"R": {"wrist": [0.022332, -0.103282, 0.095983], "forward": [0.301106, 0.523768, -0.796871], "palm": [-0.675689, -0.47248, -0.565868], "pole": [0.8, -1, 0.3], "curl": {"index": [0.044154, 0.036773, 0.420567], "middle": [0.343851, 1.466353, -0.010738], "ring": [1.7, 0.153145, -0.1], "thumb": [0.77398, -0.093148, 0.193754], "spread": 0.562315}}, L: {"wrist": [-0.06485712841388143, 0.02217763099396882, -0.23664665713713245], "forward": [0.6589208000576676, -0.513921772252708, -0.5492793380931043], "palm": [0.6395835711511575, 0.7671258572107424, 0.04950529983967706], "pole": [-1, -0.5, 0.2], "curl": {"index": [0.12691181992572131, -0.08270314530929729, 0.787332423713257], "middle": [-0.04303730998312352, 1.2102540975193277, 0.34729979238094083], "ring": [1.4196154503405725, -0.1, -0.03897511119626113], "thumb": [0.8507458517313851, 0.060037407305118945, -0.07285889659969269], "spread": 0.8651136803220915}, "part": "pump"}},
    recoil: { kick: 2.4, climb: 6.5, roll: 2.5, frequency: 17 }, inertia: 1.25,
  },
  coco: {
    url: 'models/arsenal/coco.glb', scale: 1, handling: 'heavy', reload: 'coco',
    hip: {"pos": [0.22, -0.13, -0.5], "rot": [0.04, 0.3, 0.25]}, viewmodelFov: 58,
    // The hopper rides on the right of the tube, below the sight line: aim straight down the tube top.
    sprint: { pos: [-.035, -.025, .02], rot: [-.14, .40, .1] }, shoulders: { R: [0.28, -0.42, 0], L: [-0.25, -0.46, -0.3] }, adsDistance: 0.34, adsEye: [0, 0.245, 0.084], adsPitch: 0,
    grips: {"R": {"wrist": [0.028038, -0.067413, 0.103065], "forward": [0.37547, 0.427413, -0.822399], "palm": [-0.655368, -0.504998, -0.561667], "pole": [0.8, -1, 0.3], "curl": {"index": [0.671841, 0.222549, 0.097283], "middle": [1.02774, 0.777112, 0.780707], "ring": [1.7, 0.200238, -0.1], "thumb": [-0.098074, 0.055278, -0.041348], "spread": 0.405842}}, L: {"wrist": [-0.058606766322475044, -0.0012593236322061578, -0.28702490340273834], "forward": [0.5895855214283745, -0.49902844782251554, -0.6351059133608209], "palm": [0.6650951440301666, 0.7461074680465266, 0.03117844628414042], "pole": [-1, -0.5, 0.2], "curl": {"index": [0.08289597572739338, 0.3855915098658907, 0.36530424279573814], "middle": [-0.0900961774830357, 1.3251998818739412, 0.8040724190277783], "ring": [1.2791864209163106, -0.08499336605815727, -0.09160633923149585], "thumb": [0.9234451679764263, -0.098829025, -0.1], "spread": 0.8558467450850042}, "part": "pump"}},
    recoil: { kick: 2.6, climb: 7.5, roll: 1.6, frequency: 16 }, inertia: 1.3,
  },
  dmr: {
    url: 'models/arsenal/dmr.glb', scale: 1, handling: 'rifle', reload: 'rifle',
    hip: {"pos": [0.217, -0.096, -0.46], "rot": [0, 0.3, 0.45]}, viewmodelFov: 58,
    sprint: { pos: [-.045, -.055, -.015], rot: [-.18, .45, .05] }, shoulders: { R: [0.26, -0.4, 0.02], L: [-0.26, -0.46, -0.26] }, adsDistance: .12,
    grips: {R: {"wrist": [0.022096469898206513, -0.06357825719032517, 0.1014976412020343], "forward": [0.5731716212517183, 0.3284206600761892, -0.7507424076384637], "palm": [-0.664051603805524, -0.35063170393645104, -0.6603732851031547], "pole": [0.8, -1, 0.3], "curl": {"index": [0.9454448256875748, -0.0971030335553679, 0.18676452372415797], "middle": [1.104669660736829, 0.9405536824677502, 0.7108061084828211], "ring": [1.6983935000000001, 0.3933564403668092, -0.08868622889131722], "thumb": [0.12869569200766892, 0.025994999464394958, 1], "spread": 1.0046721607378604}}, L: {"wrist": [-0.07267361693685483, 0.07488473852430484, -0.2470599249817554], "forward": [0.5442264388088228, -0.7059133727911235, -0.45332537257043853], "palm": [0.8364535911243592, 0.4981334097026885, 0.2284917854828413], "pole": [-1, -0.5, 0.2], "curl": {"index": [-0.05268895222289096, 0.3567702735839711, 0.8384153093148567], "middle": [0.15881470118550672, 1.0944849443350553, 0.25636151121348505], "ring": [1.1821459654431148, -0.09871, 0.04719851267899783], "thumb": [0.5494297464829743, -0.018386766683997097, 0.5752678936072281], "spread": 1.2}}},
    recoil: { kick: 1.7, climb: 4.2, roll: 1.6, frequency: 20 }, inertia: 1.05,
  },
  sniper: {
    url: 'models/arsenal/sniper.glb', scale: 1, handling: 'heavy', reload: 'bolt',
    hip: {"pos": [0.217, -0.096, -0.46], "rot": [0, 0.3, 0.45]}, viewmodelFov: 58,
    sprint: { pos: [-.045, -.055, -.015], rot: [-.18, .45, .05] }, shoulders: { R: [0.28, -0.42, 0.02], L: [-0.26, -0.46, -0.26] }, adsDistance: .12,
    grips: {"R": {"wrist": [0.027958, -0.076478, 0.107616], "forward": [0.405386, 0.396548, -0.823657], "palm": [-0.677483, -0.474598, -0.561937], "pole": [0.8, -1, 0.3], "curl": {"index": [0.68375, -0.070677, -0.1], "middle": [1.006302, 1.228122, 1.279127], "ring": [1.7, 0.232095, -0.1], "thumb": [-0.1, -0.050618, 0.549216], "spread": 0.346758}}, L: {"wrist": [-0.0696007367091729, 0.03630665891799994, -0.25440436517070475], "forward": [0.525337973058387, -0.6260117712880016, -0.5763065818397047], "palm": [0.8294802290734913, 0.527760690703566, 0.18284201629899957], "pole": [-1, -0.5, 0.2], "curl": {"index": [0.15823577934076644, 0.33748562149651873, 1.006282135583036], "middle": [0.5273747578333394, 0.773567154030721, 0.3216896254233457], "ring": [1.3100732945488585, -0.08142211897214635, 0.3500171591305977], "thumb": [0.8956507866560082, -0.0640912159956556, 0.16116338805788627], "spread": 1.2}}},
    recoil: { kick: 2.8, climb: 7, roll: 2, frequency: 15 }, inertia: 1.35,
  },
  machete: {
    url: 'models/arsenal/machete.glb', scale: 1, handling: 'melee', reload: 'none',
    hip: { pos: [.19, -.12, -.48], rot: [.70, .85, 2.0] },
    sprint: { pos: [.03, -.08, .04], rot: [.18, -.35, .15] }, adsDistance: .3, viewmodelFov: 64,
    grips: {
      R: { wrist: [.04108, .03977, .04622], forward: [.09536, -.9793, -.17856], palm: [-.95228, -.03749, -.30293],
        curl: curl([.9, .255, .042], [.48, 1.16, .4], [.74, .88, -.014], [.12, .119, .096], -.2), pole: [-.4, -1, .2] },
      L: { wrist: [-.18, -.16, .05], forward: [.18, .12, -1], palm: [.2, -.95, -.05],
        curl: curl([.3, .35, .2], [.35, .4, .25], [.4, .4, .25], [.3, .15, .1], .3), pole: [-.8, -1, .1] },
    },
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
