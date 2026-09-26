import type { Vec3, WorldSpec } from './types';

export const MUD_HEAL_PER_SECOND = 4;
export const MUD_HURT_COOLDOWN = 3;

// Contact comes from the authored kit surface, so roofs, rims and nearby paths
// cannot provide the bath benefit just because their XZ positions overlap.
export function mudBathAt(pos: Vec3, world: Pick<WorldSpec, 'mudBaths'>) {
  return world.mudBaths?.find(bath => Math.abs(pos.y - bath.y) <= .16 &&
    Math.hypot(pos.x - bath.x, pos.z - bath.z) <= bath.radius) ?? null;
}
