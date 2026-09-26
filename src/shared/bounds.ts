import { ARENA } from './layout';
import { isArenaMode, type Mode, type Vec3, type WorldSpec } from './types';

export interface BoundaryFeedback { x: number; z: number; strength: number; message: string }
export function boundaryFeedback(pos: Pick<Vec3, 'x' | 'z'>, world: Pick<WorldSpec, 'size' | 'walkways'>, mode?: Mode): BoundaryFeedback | null {
  // A pier can extend past the shore. The current starts after stepping off
  // its visible deck, rather than opposing movement along a dry boardwalk.
  if (!isArenaMode(mode) && world.walkways?.some(deck => pos.x >= deck.min.x && pos.x <= deck.max.x && pos.z >= deck.min.z && pos.z <= deck.max.z)) return null;
  const ocean = world.size / 2 - 7;
  const limits = isArenaMode(mode) ? ARENA : { minX: -ocean, maxX: ocean, minZ: -ocean, maxZ: ocean };
  const dx = pos.x < limits.minX ? limits.minX - pos.x : pos.x > limits.maxX ? limits.maxX - pos.x : 0;
  const dz = pos.z < limits.minZ ? limits.minZ - pos.z : pos.z > limits.maxZ ? limits.maxZ - pos.z : 0;
  const distance = Math.hypot(dx, dz);
  if (distance === 0) return null;
  return { x: dx / distance, z: dz / distance, strength: Math.min(1, distance / 3),
    message: isArenaMode(mode) ? 'Volte para a Vila' : 'A correnteza está forte. Volte para a ilha' };
}
