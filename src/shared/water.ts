import { LAKE, riverSample } from './layout';
import { terrainHeight } from './terrain';

export const WATER_LEVEL = -.05;
export const WATER_HALF_SIZE = 800;
export interface WaterSample { surfaceY: number; depth: number; kind: 'river' | 'lagoon' | 'ocean' }

/** The visible water plane intersected with the shared terrain, before deck support. */
export function waterAt(x: number, z: number): WaterSample | null {
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > WATER_HALF_SIZE || Math.abs(z) > WATER_HALF_SIZE) return null;
  const depth = WATER_LEVEL - terrainHeight(x, z);
  if (depth <= 0) return null;
  const river = riverSample(x, z);
  const kind = river.distance < river.width / 2 + 4.5
    ? Math.hypot(x - LAKE[0], z - LAKE[1]) < LAKE[2] ? 'lagoon' : 'river'
    : 'ocean';
  return { surfaceY: WATER_LEVEL, depth, kind };
}
