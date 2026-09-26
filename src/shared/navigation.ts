import { inArena } from './layout';
import { overlapsFootprint } from './collision';
import { KIT_PIECES } from './kit-collision';
import { terrainHeight } from './terrain';
import type { Collider, NavigationGraph, Vec3, WorldSpec } from './types';

const CELL = 8;
const geometry = new WeakMap<WorldSpec, { count: number; cells: Map<string, Collider[]> }>();
function nearby(world: WorldSpec, x: number, z: number, margin = 0): Collider[] {
  let cached = geometry.get(world);
  if (!cached || cached.count !== world.colliders.length) {
    const cells = new Map<string, Collider[]>();
    for (const c of world.colliders) for (let ix = Math.floor(c.min.x / CELL); ix <= Math.floor(c.max.x / CELL); ix++)
      for (let iz = Math.floor(c.min.z / CELL); iz <= Math.floor(c.max.z / CELL); iz++) {
        const key = `${ix}:${iz}`, list = cells.get(key);
        if (list) list.push(c); else cells.set(key, [c]);
      }
    cached = { count: world.colliders.length, cells }; geometry.set(world, cached);
  }
  const x0 = Math.floor((x - margin) / CELL), x1 = Math.floor((x + margin) / CELL);
  const z0 = Math.floor((z - margin) / CELL), z1 = Math.floor((z + margin) / CELL);
  if (x0 === x1 && z0 === z1) return cached.cells.get(`${x0}:${z0}`) ?? [];
  const result: Collider[] = [];
  for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) result.push(...cached.cells.get(`${ix}:${iz}`) ?? []);
  return result;
}

// Only deck surfaces derived from bridge/dock kit colliders can lift a route
// above water. Roofs and crate tops are never mistaken for dry ground.
export function walkableHeight(x: number, z: number, world: WorldSpec): number {
  let y = terrainHeight(x, z);
  const ground = y;
  for (const c of nearby(world, x, z, .32)) if (c.max.y <= ground + .45 && c.max.y > y && overlapsFootprint({ x, y, z }, c))
    y = c.max.y;
  for (const c of world.walkways ?? []) if (overlapsFootprint({ x, y, z }, c))
    y = Math.max(y, c.max.y);
  return y;
}

export function walkableSegment(world: WorldSpec, from: Pick<Vec3, 'x' | 'z'>, to: Pick<Vec3, 'x' | 'z'>, arena = false): boolean {
  const distance = Math.hypot(to.x - from.x, to.z - from.z), steps = Math.max(1, Math.ceil(distance / .8));
  let previous = walkableHeight(from.x, from.z, world);
  for (let i = 0; i <= steps; i++) {
    const x = from.x + (to.x - from.x) * i / steps, z = from.z + (to.z - from.z) * i / steps;
    const y = walkableHeight(x, z, world);
    if (y < .3 || Math.abs(x) > 124 || Math.abs(z) > 124 || (arena && !inArena(x, z, .5))) return false;
    if (i && Math.abs(y - previous) > Math.max(.45, distance / steps * .85)) return false;
    if (nearby(world, x, z, .32).some(c => y < c.max.y - .01 && y + 1.8 > c.min.y &&
      x + .32 > c.min.x && x - .32 < c.max.x && z + .32 > c.min.z && z - .32 < c.max.z)) return false;
    previous = y;
  }
  return true;
}

export function buildNavigation(world: WorldSpec): NavigationGraph {
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
    if (!/^(house_|church$|market_hall$|warehouse$|barn$)/.test(piece.piece)) continue;
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
  return { points, links };
}

// A sampled route graph supplies bridges and hill paths to the existing
// local steering. It does not change bot aggression, aiming or movement speed.
export function navigationWaypoint(world: WorldSpec, from: Vec3, to: Vec3, arena = false): Vec3 | null {
  const graph = world.navigation;
  if (!graph || walkableSegment(world, from, to, arena)) return null;
  const attach = (pos: Vec3) => graph.points.map((point, index) => ({ index, distance: Math.hypot(pos.x - point.x, pos.z - point.z) }))
    .filter(candidate => graph.links[candidate.index].length && candidate.distance < 36 && (!arena || inArena(graph.points[candidate.index].x, graph.points[candidate.index].z, .5)))
    .sort((a, b) => a.distance - b.distance).slice(0, 16)
    .find(candidate => walkableSegment(world, pos, graph.points[candidate.index], arena))?.index;
  const start = attach(from), end = attach(to);
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
      const cost = best + Math.hypot(b.x - a.x, b.z - a.z);
      if (cost < distance[next]) { distance[next] = cost; previous[next] = index; open.add(next); }
    }
  }
  if (!Number.isFinite(distance[end])) return null;
  const path = [end];
  while (path[path.length - 1] !== start) path.push(previous[path[path.length - 1]]);
  path.reverse();
  // Skip short collinear segments when the whole walk is clear, without ever
  // cutting a diagonal corner through the river or a building.
  let waypoint = graph.points[start];
  for (const index of path.slice(1, 8)) {
    const candidate = graph.points[index];
    if (!walkableSegment(world, from, candidate, arena)) break;
    waypoint = candidate;
  }
  return Math.hypot(waypoint.x - from.x, waypoint.z - from.z) > .6 ? waypoint : null;
}
