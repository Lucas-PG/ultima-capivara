import { buildBuildingRoutes } from '../../src/shared/building-access';
import type { ActorState, Vec3, WorldSpec } from '../../src/shared/types';
import { walkTraversal } from './traversal-probe';

// Review the exact published ground routes, without spawning on upper decks.
export function placedBuildingRoutes(world: WorldSpec, actor: ActorState): Map<string, Vec3[]> {
  const paths = new Map<string, Vec3[]>();
  for (const route of world.buildingRoutes ?? buildBuildingRoutes(world)) {
    const key = `${route.pieceId}/${route.floorId}`;
    if (paths.has(key)) continue;
    if (!walkTraversal(world, actor, route.points).ok || !walkTraversal(world, actor, [...route.points].reverse()).ok) continue;
    paths.set(key, route.points);
  }
  return paths;
}
