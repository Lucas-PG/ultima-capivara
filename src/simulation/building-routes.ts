import { KIT_PIECES } from '../shared/kit-collision';
import { inArena } from '../shared/layout';
import { navigationWaypoint, walkableSegment } from '../shared/navigation';
import type { BuildingRoute, Vec3, WorldSpec } from '../shared/types';

interface Floor {
  key: string; x: number; y: number; z: number; c: number; s: number; scale: number;
  bounds: readonly number[]; routes: BuildingRoute[];
}
interface Journey { route: BuildingRoute; index: number; reverse: boolean; entered: boolean; target: string | null; last: Vec3 }
export interface BuildingStep { point: Vec3; precise: boolean; advanced: boolean; waypoint: boolean }
const horizontal = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);

// Outdoor routing stays on its existing grid. Only source-authored building
// paths retain their exact turns and heights, cached for each bot's journey.
export class BotBuildingRoutes {
  private readonly floors: Floor[] = [];
  private readonly journeys = new WeakMap<object, Journey>();
  private readonly lengths = new Map<BuildingRoute, number>();
  constructor(private readonly world: WorldSpec, private readonly arena: boolean) {
    for (const route of world.buildingRoutes ?? []) {
      const piece = world.pieces?.find(piece => piece.id === route.pieceId);
      const floor = piece && KIT_PIECES[piece.piece]?.traversal?.floors.find(floor => floor.id === route.floorId);
      if (!piece || !floor || route.points.length < 2 || route.points.at(-1)!.y < route.points[0].y + .6 ||
        arena && route.points.some(point => !inArena(point.x, point.z, .5))) continue;
      const key = `${piece.id}/${floor.id}`;
      let placed = this.floors.find(placed => placed.key === key);
      if (!placed) {
        const scale = piece.scale ?? 1;
        placed = { key, x: piece.x, y: piece.y + floor.y * scale, z: piece.z,
          c: Math.cos(piece.yaw), s: Math.sin(piece.yaw), scale, bounds: floor.bounds, routes: [] };
        this.floors.push(placed);
      }
      placed.routes.push(route);
      this.lengths.set(route, route.points.slice(1).reduce((sum, point, i) => sum +
        Math.hypot(point.x - route.points[i].x, point.y - route.points[i].y, point.z - route.points[i].z), 0));
    }
  }

  private floorAt(point: Vec3): Floor | undefined {
    return this.floors.find(floor => {
      if (Math.abs(point.y - floor.y) > .5) return false;
      const dx = (point.x - floor.x) / floor.scale, dz = (point.z - floor.z) / floor.scale;
      const x = dx * floor.c - dz * floor.s, z = dx * floor.s + dz * floor.c;
      return x >= floor.bounds[0] && x <= floor.bounds[2] && z >= floor.bounds[1] && z <= floor.bounds[3];
    });
  }
  contains(point: Vec3) { return !!this.floorAt(point); }

  private select(floor: Floor, from: Vec3, goal: Vec3, reverse: boolean): BuildingRoute | undefined {
    let best: BuildingRoute | undefined, cost = Infinity;
    for (const route of floor.routes) {
      const entrance = route.points[0], anchor = route.points.at(-1)!;
      const distance = this.lengths.get(route)! + (reverse ? horizontal(from, anchor) + horizontal(entrance, goal) : horizontal(from, entrance));
      if (distance >= cost || !reverse && !walkableSegment(this.world, from, entrance, this.arena) &&
        !navigationWaypoint(this.world, from, entrance, this.arena)) continue;
      best = route; cost = distance;
    }
    return best;
  }

  step(bot: object, from: Vec3, goal: Vec3): BuildingStep | null {
    if (!this.floors.length) return null;
    const target = this.floorAt(goal), targetKey = target?.key ?? null;
    let journey = this.journeys.get(bot), advanced = false;
    if (journey && Math.hypot(from.x - journey.last.x, from.y - journey.last.y, from.z - journey.last.z) > 4) {
      this.journeys.delete(bot); journey = undefined;
    }
    if (journey && journey.target !== targetKey) {
      if (!journey.entered) { this.journeys.delete(bot); journey = undefined; }
      else {
        // If loot disappears or the storm interrupts an ascent, retrace the
        // visited treads instead of taking the old roof-drop shortcut.
        if (!journey.reverse) { journey.reverse = true; journey.index = Math.max(0, journey.index - 1); }
        journey.target = targetKey;
      }
    }
    if (!journey) {
      const current = this.floorAt(from);
      if (current && current.key === targetKey) return { point: goal, precise: true, advanced: false, waypoint: false };
      const floor = current ?? target;
      if (!floor) return null;
      const reverse = !!current, route = this.select(floor, from, goal, reverse);
      if (!route) return null;
      journey = { route, reverse, entered: reverse, index: reverse ? route.points.length - 1 : 0, target: targetKey, last: { ...from } };
      this.journeys.set(bot, journey);
    }
    Object.assign(journey.last, from);
    while (journey.index >= 0 && journey.index < journey.route.points.length) {
      const point = journey.route.points[journey.index];
      const end = journey.reverse ? journey.index === 0 : journey.index === journey.route.points.length - 1;
      if (horizontal(from, point) >= .12 || from.y < point.y - .09 || from.y > point.y + (end ? .12 : .45))
        return { point, precise: journey.entered, advanced, waypoint: true };
      journey.entered = true; journey.index += journey.reverse ? -1 : 1; advanced = true;
    }
    this.journeys.delete(bot);
    // Completion may leave an actor on the destination floor, or at a ground
    // entrance before a trip to another building. Resolve that next leg once.
    return journey.reverse ? null : { point: goal, precise: true, advanced: true, waypoint: false };
  }
}
