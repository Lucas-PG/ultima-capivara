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
    hip: { pos: [.12, -.115, -.40], rot: [.025, .20, -.08] },
    sprint: { pos: [-.025, -.025, .035], rot: [.62, .18, .22] },
    adsDistance: .32, viewmodelFov: 64,
    grips: {
      R: { wrist: [.04260, -.03700, .03940], forward: [.24386, -.01941, -.96962], palm: [-.95820, .14941, -.24398],
        curl: curl([1.41, .21, .3092], [.76, .7, .4], [.9, .97, .53], [-.05, .2, .2], -.45), pole: [.7, -1, .2] },
      L: { wrist: [-.07408, -.10542, .01206], forward: [.35567, .47016, -.80774], palm: [.92615, -.29330, .23709],
        curl: curl([1.04, -.00045, .32], [1.07842, .18, .05871], [1.6, -.1, .12705], [-.1, -.1, .1], .093), pole: [-.6, -1, .1] },
    },
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
    hip: { pos: [.15, -.10, -.40], rot: [-.08, .25, -.10] },
    sprint: { pos: [-.025, -.02, .035], rot: [.30, .45, .28] },
    shoulders: { R: [.2, -.36, .25], L: [-.24, -.35, .10] }, adsDistance: .23, viewmodelFov: 64,
    grips: { R: { wrist: [.03965, -.06249, .04687], forward: [.27072, .24256, -.93160], palm: [-.96249, .05029, -.26661],
        curl: curl([.7625, .755, .267], [.686, 1.426, .2075], [.81, 1.1695, .2425], [-.1, -.1, .1175], -.3), pole: [.7, -1, .2] },
      L: { wrist: [-.05377, -.05397, -.14114], forward: [.25038, .22888, -.94071], palm: [.91867, .2505, .30546],
        curl: curl([.7875, .1975, .3247], [.6625, .8075, .282], [.9025, .4525, .387], [-.1, .014, .133], -.36825), pole: [-.6, -1, .2] } },
    recoil: { kick: .9, climb: 1.8, roll: 1.4, frequency: 24 }, inertia: .85,
  },
  m4: {
    url: 'models/arsenal/m4.glb', scale: 1, handling: 'rifle', reload: 'rifle',
    hip: { pos: [.17, -.195, -.37], rot: [.06, .24, -.12] },
    sprint: LONG_SPRINT, adsDistance: .15, viewmodelFov: 64, shoulders: RIFLE_SHOULDERS,
    // Fitted with tools/qa/grip-fit.mjs. R: index through the enlarged guard onto the trigger face,
    // thumb resting along the right of the receiver, claws of the other digits showing on the grip's
    // left side (the middle digit brushes the guard bar, under 3 mm, hidden). L (underhand): palm under the
    // handguard, thumb along its left side, the three digits wrapping up the right side, no clipping.
    grips: { R: { wrist: [.043, -.027, .088], forward: [.181, -.069, -.981], palm: [-.937, .29, -.193], curl: curl([.475, .614, .429], [1.253, .127, .478], [1.181, .756, .413], [-.039, .369, .647], -.315), pole: [.8, -1, .3] },
      L: { wrist: [-.037, .014, -.235], forward: [.926, .007, -.377], palm: [-.012, 1, -.011], curl: curl([.144, .696, .86], [.336, .939, .962], [.494, 1.076, .749], [.252, .096, .258], .662), pole: [-.8, -1, .1] } },
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
    hip: { pos: [.19, -.12, -.48], rot: [.70, .85, 2.0] },
    sprint: { pos: [.03, -.08, .04], rot: [.18, -.35, .15] }, adsDistance: .3, viewmodelFov: 64,
    grips: {
      R: { wrist: [.04108, .03977, .04622], forward: [.09536, -.9793, -.17856], palm: [-.95228, -.03749, -.30293],
        curl: curl([.9, .255, .042], [.48, 1.16, .4], [.74, .88, -.014], [.12, .119, .096], -.2), pole: [.8, -1, .3] },
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
