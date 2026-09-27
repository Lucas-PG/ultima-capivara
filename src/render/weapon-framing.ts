import type { WeaponId } from '../shared/types';

// FOV belongs to the first-person layer too. The hip framing leaves the centre
// clear while retaining the authored sights for ADS.
export const WEAPON_VIEW_FOV = 78;
export interface WeaponHipPose { x: number; y: number; z: number; scale: number; pitch?: number; yaw?: number; roll?: number }
export const WEAPON_HIP_POSES: Record<WeaponId, WeaponHipPose> = {
  pistol: { x: .25, y: -.14, z: -.59, scale: .74, yaw: .2, roll: -.035 },
  smg: { x: .30, y: -.12, z: -.67, scale: .68, pitch: -.10 },
  m4: { x: .30, y: -.13, z: -.77, scale: .80, pitch: -.14 },
  shotgun: { x: .30, y: -.13, z: -.77, scale: .80, pitch: -.14 },
  dmr: { x: .30, y: -.13, z: -.77, scale: .80, pitch: -.14 },
  sniper: { x: .32, y: -.14, z: -.80, scale: .80, pitch: -.14 },
  machete: { x: .24, y: -.12, z: -.50, scale: .92, pitch: -.55 },
  slingshot: { x: .32, y: -.20, z: -.65, scale: .72 },
};

// Code-built arsenal: the stock butt sits at the shoulder just behind the eye,
// so long guns read from above and behind like a held rifle, not a floating prop.
export const TOON_HIP_POSES: Record<WeaponId, WeaponHipPose> = {
  pistol: { x: .15, y: -.17, z: -.5, scale: .9, yaw: .1 },
  smg: { x: .19, y: -.2, z: -.5, scale: .8, yaw: .1 },
  m4: { x: .2, y: -.2, z: -.53, scale: .78, yaw: .1, pitch: .03 },
  shotgun: { x: .2, y: -.2, z: -.55, scale: .78, yaw: .1, pitch: .03 },
  dmr: { x: .2, y: -.21, z: -.55, scale: .78, yaw: .1, pitch: .03 },
  sniper: { x: .2, y: -.21, z: -.57, scale: .76, yaw: .1, pitch: .03 },
  machete: { x: .22, y: -.22, z: -.48, scale: .9, pitch: -.3, roll: -.12 },
  slingshot: { x: .12, y: -.22, z: -.5, scale: .8 },
};
