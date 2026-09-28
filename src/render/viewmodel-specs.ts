import type { WeaponId } from '../shared/types';
import type { HandCurl } from './fp-arms';
import type { AssetEntry } from './asset-manifest';
import arsenalMetrics from '../../public/models/arsenal/metrics.json';

// First-person presentation data. Weapon space is the model's own space
// (x right, y up, -z toward the muzzle); the origin is the web of the firing paw.
export type V3 = readonly [number, number, number];
export type HandlingClass = 'pistol' | 'rifle' | 'heavy' | 'melee' | 'sling';
export type ReloadStyle = 'pistol' | 'revolver' | 'rifle' | 'shotgun' | 'bolt' | 'coco' | 'sling' | 'none';
export interface GripSpec { wrist: V3; forward: V3; palm: V3; curl: HandCurl; pole: V3 }
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

const rifle = (supportZ: number, supportY = -.035, scale = .8): ViewSpec => ({
  scale, handling: 'rifle', reload: 'rifle',
  hip: { pos: [.2, -.19, -.5], rot: [-.02, .04, -.02] },
  sprint: { pos: [.02, -.08, .06], rot: [.25, .75, .45] },
  adsDistance: .3,
  grips: {
    R: { wrist: [.03, -.14, .16], forward: [-.1, -.3, -1], palm: [-1, 0, 0], curl: RIFLE_R, pole: [.8, -1, .3] },
    L: { wrist: [-.07, supportY - .06, supportZ + .03], forward: [1, .15, -.35], palm: [0, 1, 0], curl: HANDGUARD_L, pole: [-.7, -1, 0] },
  },
  recoil: { kick: 1.1, climb: 2.2, roll: 1.2, frequency: 22 }, inertia: 1,
});

export const VIEW_SPECS: Record<WeaponId, ViewSpec> = {
  pistol: {
    url: 'models/arsenal/pistol.glb', scale: 1, handling: 'pistol', reload: 'pistol',
    hip: { pos: [.135, -.105, -.36], rot: [.05, .24, -.09] },
    sprint: { pos: [-.02, -.05, .07], rot: [.95, .25, .3] },
    adsDistance: .3,
    grips: PISTOL_GRIPS,
    recoil: { kick: 1.25, climb: 5.2, roll: 1.5, frequency: 26 }, inertia: .7,
  },
  revolver: { ...rifle(0), handling: 'pistol', reload: 'revolver', scale: .74, hip: { pos: [.19, -.15, -.46], rot: [0, .12, -.03] },
    sprint: { pos: [-.02, -.05, .07], rot: [.95, .25, .3] }, recoil: { kick: 1.6, climb: 7.5, roll: 2, frequency: 22 }, inertia: .75 },
  smg: rifle(-.265, -.035, .68),
  m4: rifle(-.3),
  shotgun: { ...rifle(-.38), handling: 'heavy', reload: 'shotgun', recoil: { kick: 2.2, climb: 6, roll: 2.5, frequency: 18 }, inertia: 1.25 },
  dmr: { ...rifle(-.325), recoil: { kick: 1.6, climb: 4, roll: 1.5, frequency: 20 } },
  sniper: { ...rifle(-.325), handling: 'heavy', reload: 'bolt', recoil: { kick: 2.6, climb: 6.5, roll: 2, frequency: 16 }, inertia: 1.35 },
  coco: { ...rifle(-.38), handling: 'heavy', reload: 'coco', recoil: { kick: 2.4, climb: 7, roll: 1.5, frequency: 17 }, inertia: 1.3 },
  machete: { ...rifle(0), handling: 'melee', reload: 'none', scale: .92, hip: { pos: [.24, -.12, -.5], rot: [-.55, 0, 0] },
    sprint: { pos: [0, -.05, .05], rot: [.3, .2, .2] }, recoil: { kick: 0, climb: 0, roll: 0, frequency: 20 }, inertia: .8 },
  slingshot: { ...rifle(0), handling: 'sling', reload: 'sling', scale: .72, hip: { pos: [.32, -.2, -.65], rot: [0, 0, 0] },
    recoil: { kick: .6, climb: 1, roll: .5, frequency: 20 }, inertia: .8 },
};

const ARSENAL_BYTES = arsenalMetrics as Record<string, { bytes: number }>;
export function fpManifest(): AssetEntry[] {
  return [
    { path: 'models/fp/fp-arms.glb', kind: 'glb', bytes: 84976, label: 'Patas da capivara' },
    ...Object.values(VIEW_SPECS).filter(spec => spec.url).map(spec => ({ path: spec.url!, kind: 'glb' as const,
      bytes: ARSENAL_BYTES[spec.url!.split('/').pop()!.replace('.glb', '')]?.bytes ?? 0, label: 'Arsenal' })),
  ];
}
