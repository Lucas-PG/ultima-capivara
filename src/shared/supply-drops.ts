import { colliderGrid } from './collider-grid';
import { clamp } from './math';
import { walkableSegment } from './navigation';
import { terrainHeight } from './terrain';
import { waterAt } from './water';
import type { SupplyDropState, Vec3, WorldSpec, ZoneState } from './types';

export const SUPPLY_DROP_TIMES = [45, 125] as const;
export const SUPPLY_APPROACH_SECONDS = 5;
export const SUPPLY_DESCENT_SECONDS = 12;
export const SUPPLY_RELEASE_HEIGHT = 32;
export const SUPPLY_CRATE_RADIUS = .55;
const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const routes = new WeakMap<WorldSpec, readonly Vec3[]>();

export function supplyDropPhase(drop: SupplyDropState, time: number) {
  return drop.opened ? 'opened' : time < drop.releaseAt ? 'incoming' : time < drop.landsAt ? 'descending' : 'landed';
}

export function supplyDropPosition(drop: SupplyDropState, time: number): Vec3 {
  const progress = clamp((time - drop.releaseAt) / (drop.landsAt - drop.releaseAt), 0, 1);
  return { ...drop.pos, y: drop.pos.y + SUPPLY_RELEASE_HEIGHT * (1 - progress) };
}

function mainRoutes(world: WorldSpec): readonly Vec3[] {
  const cached = routes.get(world);
  if (cached) return cached;
  const graph = world.navigation;
  if (!graph) return [];
  const seen = new Set<number>();
  let largest: number[] = [];
  for (let start = 0; start < graph.points.length; start++) {
    if (seen.has(start)) continue;
    const component = [start]; seen.add(start);
    for (let i = 0; i < component.length; i++) for (const next of graph.links[component[i]])
      if (!seen.has(next)) { seen.add(next); component.push(next); }
    if (component.length > largest.length) largest = component;
  }
  const points = largest.length > 1 ? largest.map(index => graph.points[index]) : [];
  routes.set(world, points); return points;
}

// The crate footprint and parachute column must be dry and clear. A water node,
// roof or isolated graph island can never become a delivery site.
export function clearSupplyLanding(world: WorldSpec, point: Vec3): boolean {
  const { x, y, z } = point, footprint = SUPPLY_CRATE_RADIUS + .1;
  if (Math.abs(y - terrainHeight(x, z)) > .03 || waterAt(x, z)) return false;
  for (const dx of [-footprint, 0, footprint]) for (const dz of [-footprint, 0, footprint])
    if (waterAt(x + dx, z + dz) || Math.abs(terrainHeight(x + dx, z + dz) - y) > .1) return false;
  if ([...(world.mudBaths ?? []), ...(world.trampolines ?? [])].some(site => Math.hypot(x - site.x, z - site.z) < site.radius + 4)) return false;
  if (world.chests.some(chest => Math.hypot(x - chest.x, z - chest.z) < 3)) return false;
  const margin = 1.25;
  if (colliderGrid(world).query(x - margin, z - margin, x + margin, z + margin).some(c =>
    c.min.x < x + margin && c.max.x > x - margin && c.min.z < z + margin && c.max.z > z - margin &&
    c.max.y > y + .03 && c.min.y < y + SUPPLY_RELEASE_HEIGHT + 3)) return false;
  let approaches = 0;
  for (const [dx, dz] of directions) {
    const to = { x: x + dx * 3, z: z + dz * 3 };
    if ([1, 2, 3].some(distance => waterAt(x + dx * distance, z + dz * distance))) continue;
    if (walkableSegment(world, point, to)) approaches++;
  }
  return approaches >= 2;
}

export function chooseSupplyLanding(world: WorldSpec, zone: ZoneState, random: () => number, previous: readonly SupplyDropState[] = []): Vec3 | null {
  const radius = zone.nextRadius - 8;
  if (radius <= 0) return null;
  const candidates = mainRoutes(world).filter(point => Math.hypot(point.x - zone.nextX, point.z - zone.nextZ) <= radius &&
    previous.every(drop => Math.hypot(point.x - drop.pos.x, point.z - drop.pos.z) >= 24));
  // Shuffle only when a delivery is due, never in the movement tick or renderer.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return candidates.find(point => clearSupplyLanding(world, point)) ?? null;
}
