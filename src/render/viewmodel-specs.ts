import type { WeaponId } from '../shared/types';
import type { HandCurl } from './fp-arms';
import type { AssetEntry } from './asset-manifest';
import arsenalMetrics from '../../public/models/arsenal/metrics.json';

// First-person presentation data. Weapon space is the model's own space
// (x right, y up, -z toward the muzzle); the origin is the web of the firing paw.
export type V3 = readonly [number, number, number];
export type HandlingClass = 'pistol' | 'rifle' | 'heavy' | 'melee' | 'sling';
export type ReloadStyle = 'pistol' | 'revolver' | 'rifle' | 'shotgun' | 'bolt' | 'coco' | 'sling' | 'none';
export interface GripSpec { wrist: V3; forward: V3; palm: V3; curl: HandCurl; pole: V3; /** Follow an animated part (the pump). */ part?: string }
export interface ViewSpec {
  /** v2 asset (models/arsenal). Without it the legacy painted model is used. */
  url?: string;
  scale: number;
  handling: HandlingClass;
  reload: ReloadStyle;
  /** Camera-space position of the weapon origin and its (pitch, yaw, roll). */
  hip: { pos: V3; rot: V3 };
  sprint: { pos: V3; rot: V3 };
  /** Eye-to-sight distance when aiming. */
  adsDistance: number;
  grips: { R: GripSpec; L?: GripSpec };
  /** Visual recoil: back kick (m/s), muzzle climb and roll (rad/s), spring frequency. */
  recoil: { kick: number; climb: number; roll: number; frequency: number };
  /** Heavier guns lag more behind the view. */
  inertia: number;
}

const curl = (index: V3, middle: V3, ring: V3, thumb: V3): HandCurl => ({ index, middle, ring, thumb });
// Wrapped digits, trigger finger resting on the trigger, thumb along the frame.
const PISTOL_R = curl([.3, .55, .35], [1.5, 1.4, 1], [1.55, 1.4, 1], [.5, .3, .2]);
const PISTOL_L = curl([1.3, 1.2, .8], [1.4, 1.2, .8], [1.45, 1.25, .85], [.1, .1, .05]);
const RIFLE_R = curl([.5, .7, .4], [1.4, 1.3, .9], [1.45, 1.3, .9], [.55, .4, .2]);
const HANDGUARD_L = curl([1.05, .95, .6], [1.15, 1.0, .65], [1.2, 1.05, .7], [.25, .15, .1]);

const PISTOL_GRIPS = {
  R: { wrist: [.03, 0, .092], forward: [-.05, -.2, -1], palm: [-1, 0, 0], curl: PISTOL_R, pole: [.7, -1, .2] },
  L: { wrist: [-.04, -.035, .075], forward: [.2, -.35, -1], palm: [1, .1, -.1], curl: PISTOL_L, pole: [-.6, -1, .1] },
} as const satisfies ViewSpec['grips'];

const UNDERHAND_L = (wrist: V3, part?: string): GripSpec => ({ wrist, forward: [1, .3, -.25], palm: [.1, 1, .12], curl: HANDGUARD_L, pole: [-.8, -1, .1], part });
const FOREGRIP_L = (wrist: V3): GripSpec => ({ wrist, forward: [.05, -.2, -1], palm: [1, 0, 0], curl: PISTOL_R, pole: [-.8, -1, .2] });
const RIFLE_GRIP_R = (wrist: V3 = [.032, -.004, .094]): GripSpec => ({ wrist, forward: [-.05, -.3, -1], palm: [-1, 0, 0], curl: RIFLE_R, pole: [.8, -1, .3] });
const RECOIL = { light: { kick: 1.1, climb: 2.2, roll: 1.2, frequency: 22 }, rifle: { kick: 1.4, climb: 3, roll: 1.4, frequency: 21 } };
const LONG_SPRINT = { pos: [-.04, -.06, .07] as V3, rot: [.3, .85, .5] as V3 };

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
    grips: { R: { ...PISTOL_GRIPS.R, wrist: [.033, -.006, .094] }, L: { ...PISTOL_GRIPS.L, wrist: [-.042, -.042, .078] } },
    recoil: { kick: 1.7, climb: 8, roll: 2.2, frequency: 21 }, inertia: .75,
  },
  smg: {
    url: 'models/arsenal/smg.glb', scale: 1, handling: 'rifle', reload: 'rifle',
    hip: { pos: [.16, -.18, -.35], rot: [.06, .24, -.12] },
    sprint: LONG_SPRINT, adsDistance: .2,
    grips: { R: RIFLE_GRIP_R([.032, -.004, .09]), L: FOREGRIP_L([-.032, -.012, -.075]) },
    recoil: { kick: .9, climb: 1.8, roll: 1.4, frequency: 24 }, inertia: .85,
  },
  m4: {
    url: 'models/arsenal/m4.glb', scale: 1, handling: 'rifle', reload: 'rifle',
    hip: { pos: [.17, -.195, -.37], rot: [.06, .24, -.12] },
    sprint: LONG_SPRINT, adsDistance: .22,
    grips: { R: RIFLE_GRIP_R(), L: UNDERHAND_L([-.05, .0, -.2]) },
    recoil: RECOIL.rifle, inertia: 1,
  },
  shotgun: {
    url: 'models/arsenal/shotgun.glb', scale: 1, handling: 'heavy', reload: 'shotgun',
    hip: { pos: [.17, -.19, -.37], rot: [.06, .22, -.12] },
    sprint: LONG_SPRINT, adsDistance: .24,
    grips: { R: { wrist: [.03, -.015, .1], forward: [-.05, -.45, -1], palm: [-1, 0, 0], curl: RIFLE_R, pole: [.8, -1, .3] }, L: UNDERHAND_L([-.052, -.03, -.33], 'pump') },
    recoil: { kick: 2.4, climb: 6.5, roll: 2.5, frequency: 17 }, inertia: 1.25,
  },
  coco: {
    url: 'models/arsenal/coco.glb', scale: 1, handling: 'heavy', reload: 'coco',
    hip: { pos: [.2, -.22, -.46], rot: [.06, .2, -.1] },
    sprint: LONG_SPRINT, adsDistance: .26,
    grips: { R: RIFLE_GRIP_R([.032, -.004, .09]), L: UNDERHAND_L([-.055, -.035, -.25], 'pump') },
    recoil: { kick: 2.6, climb: 7.5, roll: 1.6, frequency: 16 }, inertia: 1.3,
  },
  dmr: {
    url: 'models/arsenal/dmr.glb', scale: 1, handling: 'rifle', reload: 'rifle',
    hip: { pos: [.17, -.195, -.38], rot: [.06, .22, -.12] },
    sprint: LONG_SPRINT, adsDistance: .12,
    grips: { R: { wrist: [.03, -.012, .1], forward: [-.05, -.45, -1], palm: [-1, 0, 0], curl: RIFLE_R, pole: [.8, -1, .3] }, L: UNDERHAND_L([-.052, -.01, -.27]) },
    recoil: { kick: 1.7, climb: 4.2, roll: 1.6, frequency: 20 }, inertia: 1.05,
  },
  sniper: {
    url: 'models/arsenal/sniper.glb', scale: 1, handling: 'heavy', reload: 'bolt',
    hip: { pos: [.17, -.2, -.39], rot: [.06, .22, -.12] },
    sprint: LONG_SPRINT, adsDistance: .12,
    grips: { R: { wrist: [.03, -.015, .1], forward: [-.05, -.45, -1], palm: [-1, 0, 0], curl: RIFLE_R, pole: [.8, -1, .3] }, L: UNDERHAND_L([-.052, -.03, -.3]) },
    recoil: { kick: 2.8, climb: 7, roll: 2, frequency: 15 }, inertia: 1.35,
  },
  machete: {
    url: 'models/arsenal/machete.glb', scale: 1, handling: 'melee', reload: 'none',
    hip: { pos: [.17, -.2, -.36], rot: [.3, .3, -.5] },
    sprint: { pos: [0, -.05, .05], rot: [.3, .2, .2] }, adsDistance: .3,
    grips: { R: { wrist: [.035, -.07, .02], forward: [-.1, 1, .15], palm: [-1, 0, 0], curl: curl([1.45, 1.3, .9], [1.5, 1.35, .95], [1.55, 1.35, .95], [.7, .5, .3]), pole: [.8, -1, .3] } },
    recoil: { kick: 0, climb: 0, roll: 0, frequency: 20 }, inertia: .8,
  },
  slingshot: {
    url: 'models/arsenal/slingshot.glb', scale: 1, handling: 'sling', reload: 'sling',
    hip: { pos: [-.07, -.08, -.5], rot: [.05, -.05, .15] },
    sprint: { pos: [.05, -.08, .06], rot: [.4, -.3, -.3] }, adsDistance: .38,
    grips: {
      R: { wrist: [.2, -.1, .3], forward: [-.45, .35, -1], palm: [-1, .1, .3], curl: curl([.9, .8, .6], [1.2, 1.1, .8], [1.3, 1.1, .8], [.9, .5, .3]), pole: [.9, -1, .4] },
      L: { wrist: [-.03, -.06, .085], forward: [.05, .05, -1], palm: [1, 0, 0], curl: PISTOL_R, pole: [-.8, -1, .2] },
    },
    recoil: { kick: .6, climb: 1, roll: .5, frequency: 20 }, inertia: .8,
  },
};

const ARSENAL_BYTES = arsenalMetrics as Record<string, { bytes: number }>;
export function fpManifest(): AssetEntry[] {
  return [
    { path: 'models/fp/fp-arms.glb', kind: 'glb', bytes: 84976, label: 'Patas da capivara' },
    ...Object.values(VIEW_SPECS).filter(spec => spec.url).map(spec => ({ path: spec.url!, kind: 'glb' as const,
      bytes: ARSENAL_BYTES[spec.url!.split('/').pop()!.replace('.glb', '')]?.bytes ?? 0, label: 'Arsenal' })),
  ];
}
