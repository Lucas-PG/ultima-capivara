import type { WeaponId } from '../shared/types';

// FOV belongs to the first-person layer too. These draft poses are measured in
// tools/blender/weapon-review.html before any default-path art is replaced.
export const WEAPON_VIEW_FOV = 78;
export interface WeaponHipPose { x: number; y: number; z: number; scale: number }
export const WEAPON_HIP_POSES: Record<WeaponId, WeaponHipPose> = {
  pistol: { x: .23, y: -.07, z: -.34, scale: 1 },
  smg: { x: .3, y: -.04, z: -.53, scale: 1 },
  m4: { x: .3, y: -.07, z: -.53, scale: 1 },
  shotgun: { x: .3, y: -.035, z: -.53, scale: 1 },
  dmr: { x: .3, y: -.07, z: -.53, scale: 1 },
  sniper: { x: .3, y: -.07, z: -.53, scale: 1 },
  machete: { x: .23, y: .06, z: -.34, scale: 1 },
  slingshot: { x: .3, y: -.04, z: -.53, scale: 1 },
};
