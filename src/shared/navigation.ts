import { inArena } from './layout';
import { overlapsFootprint, SWIM_DEPTH, SWIM_DRAFT } from './collision';
import { KIT_PIECES } from './kit-collision';
import { colliderGrid } from './collider-grid';
import { terrainHeight } from './terrain';
import { waterAt } from './water';
import type { Collider, NavigationGraph, Vec3, WorldSpec } from './types';

function nearby(world: WorldSpec, x: number, z: number, margin = 0): Collider[] {
  return colliderGrid(world).query(x - margin, z - margin, x + margin, z + margin);
}

// Only deck surfaces derived from bridge/dock kit colliders can lift a route
// above water. Roofs and crate tops are never mistaken for dry ground.
export function walkableHeight(x: number, z: number, world: WorldSpec): number {
  let y = terrainHeight(x, z);
  const water = waterAt(x, z);
  if (water && water.depth >= SWIM_DEPTH) y = Math.max(y, water.surfaceY - SWIM_DRAFT);
  const ground = y;
  for (const c of nearby(world, x, z, .32)) if (c.max.y <= ground + .45 && c.max.y > y && overlapsFootprint({ x, y, z }, c))
    y = c.max.y;
  for (const c of world.walkways ?? []) if (overlapsFootprint({ x, y, z }, c))
    y = Math.max(y, c.max.y);
  return y;
}

/** The step moveActor climbs without a jump. */
const STEP_UP = .45;
export function walkableSegment(world: WorldSpec, from: Pick<Vec3, 'x' | 'z'>, to: Pick<Vec3, 'x' | 'z'>, arena = false): boolean {
  const distance = Math.hypot(to.x - from.x, to.z - from.z), steps = Math.max(1, Math.ceil(distance / .8));
  let previous = walkableHeight(from.x, from.z, world);
  for (let i = 0; i <= steps; i++) {
    const x = from.x + (to.x - from.x) * i / steps, z = from.z + (to.z - from.z) * i / steps;
    const y = walkableHeight(x, z, world);
    // Actors swept beyond a soft boundary can always walk back inside it.
    if (Math.abs(x) > Math.max(124, Math.abs(from.x)) + .001 || Math.abs(z) > Math.max(124, Math.abs(from.z)) + .001 ||
      (arena && !inArena(x, z, .5))) return false;
    if (i && Math.abs(y - previous) > Math.max(.45, distance / steps * .85)) return false;
    // A solid whose top is one legal step up (moveActor's 0.45 m) is climbed, not
    // a wall: the next tread of a stair in front of the feet does not block it.
    if (nearby(world, x, z, .32).some(c => y < c.max.y - .01 && c.max.y - y > STEP_UP && y + 1.8 > c.min.y &&
      Math.hypot(Math.max(c.min.x - x, 0, x - c.max.x), Math.max(c.min.z - z, 0, z - c.max.z)) < .319)) return false;
    previous = y;
  }
  return true;
}

/** `routes` are the authored walking routes (layout NAV_ROUTES): stairs, ramps and paths that
 * may run between the grid's rows. */
export function buildNavigation(world: WorldSpec, routes: readonly (readonly (readonly [number, number])[])[] = []): NavigationGraph {
  const points: Vec3[] = [], links: number[][] = [];
  const side = 61, step = 4, indices = new Int32Array(side * side).fill(-1);
  for (let iz = 0; iz < side; iz++) for (let ix = 0; ix < side; ix++) {
    const x = ix * step - 120, z = iz * step - 120;
    if (!walkableSegment(world, { x, z }, { x, z })) continue;
    indices[iz * side + ix] = points.length;
    points.push({ x, y: walkableHeight(x, z, world), z }); links.push([]);
  }
  for (let iz = 0; iz < side; iz++) for (let ix = 0; ix < side; ix++) {
    const a = indices[iz * side + ix]; if (a < 0) continue;
    for (const [dx, dz] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
      const nx = ix + dx, nz = iz + dz;
      if (nx < 0 || nx >= side || nz >= side) continue;
      const b = indices[nz * side + nx];
      if (b < 0 || !walkableSegment(world, points[a], points[b])) continue;
      links[a].push(b); links[b].push(a);
    }
  }
  // A 4 m grid can miss a 2 m doorway. Add the kit's two explicit entrances
  // and room centre, then connect only genuinely clear walking segments.
  const doors: number[] = [];
  for (const piece of world.pieces ?? []) {
    if (!/^(house_|palafita|bar_mare$|engenho$|church$|market_hall$|warehouse$|barn$)/.test(piece.piece)) continue;
    const floor = KIT_PIECES[piece.piece]?.colliders.find(c => c.type === 'box' && c.height < .25 && c.y < .3 && c.width > 3 && c.depth > 3);
    if (!floor || floor.type !== 'box') continue;
    const scale = piece.scale ?? 1;
    for (const along of [-floor.depth / 2 - 1, 0, floor.depth / 2 + 1]) {
      const x = piece.x + Math.sin(piece.yaw) * along * scale, z = piece.z + Math.cos(piece.yaw) * along * scale;
      if (!walkableSegment(world, { x, z }, { x, z })) continue;
      doors.push(points.length); points.push({ x, y: walkableHeight(x, z, world), z }); links.push([]);
    }
  }
  for (const a of doors) for (let b = 0; b < points.length; b++) {
    if (a === b || Math.hypot(points[a].x - points[b].x, points[a].z - points[b].z) > 10) continue;
    if (links[a].includes(b) || !walkableSegment(world, points[a], points[b])) continue;
    links[a].push(b); links[b].push(a);
  }
  // The grid can also miss a whole authored route: both 4 m rows of the Capela's
  // stair fall within a body width of its cheek walls, so bots climbed to the
  // chapel by the long south path. Every route is walked at 3 m samples, each
  // a node of its own (or the grid node it stands on). Consecutive samples link
  // along the route, and each new node joins the grid nodes it can reach within 6 m.
  const link = (a: number, b: number) => { if (a !== b && !links[a].includes(b)) { links[a].push(b); links[b].push(a); } };
  const gridNear = (x: number, z: number, radius: number) => {
    const found: number[] = [];
    for (let iz = Math.max(0, Math.ceil((z - radius + 120) / step)); iz <= Math.min(side - 1, Math.floor((z + radius + 120) / step)); iz++)
      for (let ix = Math.max(0, Math.ceil((x - radius + 120) / step)); ix <= Math.min(side - 1, Math.floor((x + radius + 120) / step)); ix++) {
        const index = indices[iz * side + ix];
        if (index >= 0 && Math.hypot(points[index].x - x, points[index].z - z) <= radius) found.push(index);
      }
    return found.sort((a, b) => Math.hypot(points[a].x - x, points[a].z - z) - Math.hypot(points[b].x - x, points[b].z - z));
  };
  const deckRoutes = (world.buildingRoutes ?? []).filter(route => route.points.every(point =>
    Math.abs(point.y - walkableHeight(point.x, point.z, world)) < .5)).map(route => route.points.map(point => [point.x, point.z] as const));
  const authoredNodes: number[] = [];
  for (const route of [...routes, ...deckRoutes]) {
    let previous = -1;
    for (let i = 1; i < route.length; i++) {
      const [ax, az] = route[i - 1], [bx, bz] = route[i], samples = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 3));
      for (let k = i === 1 ? 0 : 1; k <= samples; k++) {
        const x = ax + (bx - ax) * k / samples, z = az + (bz - az) * k / samples;
        if (!walkableSegment(world, { x, z }, { x, z })) { previous = -1; continue; }
        let node: number | undefined = gridNear(x, z, .75)[0];
        if (node === undefined) {
          node = points.length; points.push({ x, y: walkableHeight(x, z, world), z }); links.push([]);
          for (const index of gridNear(x, z, 6)) if (walkableSegment(world, points[node], points[index])) link(node, index);
          // Narrow boardwalk junctions can sit entirely between the grid rows.
          for (const index of authoredNodes) if (Math.hypot(points[index].x - x, points[index].z - z) < 6 &&
            walkableSegment(world, points[node], points[index])) link(node, index);
          authoredNodes.push(node);
        }
        if (previous >= 0 && walkableSegment(world, points[previous], points[node])) link(previous, node);
        previous = node;
      }
    }
  }
  return { points, links };
}

// Shared attachment rule for routing and recovery. The endpoint must reach an
// actual graph link, rather than merely stand on a collision-free patch.
export function navigationAnchor(world: WorldSpec, pos: Vec3, arena = false): number | undefined {
  const graph = world.navigation;
  return graph?.points.map((point, index) => ({ index, distance: Math.hypot(pos.x - point.x, pos.z - point.z) }))
    .filter(candidate => graph.links[candidate.index].length && candidate.distance < 36 && (!arena || inArena(graph.points[candidate.index].x, graph.points[candidate.index].z, .5)))
    .sort((a, b) => a.distance - b.distance).slice(0, 16)
    .find(candidate => walkableSegment(world, pos, graph.points[candidate.index], arena))?.index;
}

// A sampled route graph supplies bridges and hill paths to the existing
// local steering. It does not change bot aggression, aiming or movement speed.
export function navigationWaypoint(world: WorldSpec, from: Vec3, to: Vec3, arena = false): Vec3 | null {
  const graph = world.navigation;
  // A swim is slower and gives up the primary gun. Prefer a nearby bridge or
  // boardwalk, while retaining swimming when it is the only connected route.
  const swimming = (p: Vec3) => { const water = waterAt(p.x, p.z); return !!water && p.y < water.surfaceY - .8; };
  const wetSegment = (a: Vec3, b: Vec3) => {
    const n = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 2));
    for (let i = 0; i <= n; i++) {
      const x = a.x + (b.x - a.x) * i / n, z = a.z + (b.z - a.z) * i / n;
      if (swimming({ x, y: walkableHeight(x, z, world), z })) return true;
    }
    return false;
  };
  const preferDry = !swimming(from) && !swimming(to);
  if (!graph || walkableSegment(world, from, to, arena) && (!preferDry || !wetSegment(from, to))) return null;
  const start = navigationAnchor(world, from, arena), end = navigationAnchor(world, to, arena);
  if (start === undefined || end === undefined) return null;
  if (start === end) return Math.hypot(graph.points[start].x - from.x, graph.points[start].z - from.z) > .8 ? graph.points[start] : null;
  const distance = new Float64Array(graph.points.length).fill(Infinity), previous = new Int32Array(graph.points.length).fill(-1);
  const open = new Set<number>([start]); distance[start] = 0;
  while (open.size) {
    let index = -1, best = Infinity;
    for (const candidate of open) if (distance[candidate] < best) { index = candidate; best = distance[candidate]; }
    if (index === end) break;
    open.delete(index);
    for (const next of graph.links[index]) {
      const a = graph.points[index], b = graph.points[next];
      if (arena && (!inArena(b.x, b.z, .5) || !inArena(a.x, a.z, .5))) continue;
      const cost = best + Math.hypot(b.x - a.x, b.z - a.z) * (swimming(a) || swimming(b) ? 3 : 1);
      if (cost < distance[next]) { distance[next] = cost; previous[next] = index; open.add(next); }
    }
  }
  if (!Number.isFinite(distance[end])) return null;
  const path = [end];
  while (path[path.length - 1] !== start) path.push(previous[path[path.length - 1]]);
  path.reverse();
  // Skip short collinear segments when the whole walk is clear, without ever
  // cutting a diagonal corner through a building or a steep bank.
  // A walker standing on its start node follows the graph link itself: its
  // exact spot may not see past the node on a slope, and re-picking the same
  // node there left bots hovering a metre away from it forever.
  const atStart = path.length > 1 && Math.hypot(graph.points[start].x - from.x, graph.points[start].z - from.z) < 1.1;
  let waypoint = atStart ? graph.points[path[1]] : graph.points[start];
  for (const index of path.slice(atStart ? 2 : 1, 8)) {
    const candidate = graph.points[index];
    if (!walkableSegment(world, from, candidate, arena) || preferDry && wetSegment(from, candidate)) break;
    waypoint = candidate;
  }
  return Math.hypot(waypoint.x - from.x, waypoint.z - from.z) > .6 ? waypoint : null;
}
