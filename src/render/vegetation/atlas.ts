import foliageMetrics from '../../../tools/art/foliage-atlas.metrics.json';
import groundMetrics from '../../../tools/art/ground-atlas.metrics.json';
import type { TileUv } from './mesh-builder';

interface Metrics { size: number; tiles: Record<string, { x: number; y: number; w: number; h: number; root: number[] }> }

/** Pixel rects from the atlas builder become UV rects. Textures load with flipY, so v runs bottom to top. */
function tiles<Name extends string>(metrics: Metrics) {
  const out: Record<string, TileUv> = {};
  for (const [name, t] of Object.entries(metrics.tiles)) out[name] = {
    u0: t.x / metrics.size, u1: (t.x + t.w) / metrics.size,
    v0: 1 - (t.y + t.h) / metrics.size, v1: 1 - t.y / metrics.size,
    aspect: t.w / t.h, root: [t.root[0], t.root[1]] as const,
  };
  return out as Record<Name, TileUv>;
}

export type FoliageTile = keyof typeof foliageMetrics.tiles;
export type GroundTile = keyof typeof groundMetrics.tiles;
export const FOLIAGE_TILES = tiles<FoliageTile>(foliageMetrics as Metrics);
export const GROUND_TILES = tiles<GroundTile>(groundMetrics as Metrics);
