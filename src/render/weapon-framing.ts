import type { WeaponId } from '../shared/types';

// FOV belongs to the first-person layer too. The hip framing leaves the centre
// clear while retaining the authored sights for ADS.
export const WEAPON_VIEW_FOV = 78;
export interface WeaponHipPose { x: number; y: number; z: number; scale: number; pitch?: number; yaw?: number; roll?: number }
export const WEAPON_HIP_POSES: Record<WeaponId, WeaponHipPose> = {
  pistol: { x: .25, y: -.16, z: -.59, scale: .82, yaw: .2, roll: -.035 },
  smg: { x: .27, y: -.16, z: -.65, scale: .9 },
  m4: { x: .28, y: -.17, z: -.67, scale: .9 },
  shotgun: { x: .28, y: -.16, z: -.65, scale: .9 },
  dmr: { x: .28, y: -.17, z: -.67, scale: .9 },
  sniper: { x: .28, y: -.17, z: -.67, scale: .9 },
  machete: { x: .18, y: 0, z: -.35, scale: 1, pitch: -.8 },
  slingshot: { x: .27, y: -.16, z: -.65, scale: .9 },
};
