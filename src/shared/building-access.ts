import { clearSpawn, overlapsFootprint } from './collision';
import { colliderGrid } from './collider-grid';
import { KIT_PIECES } from './kit-collision';
import { terrainHeight } from './terrain';
import { walkableHeight } from './navigation';
import type { BuildingRoute, KitPlacement, Vec3, WorldSpec } from './types';

export function buildingPoint(piece: KitPlacement, point: readonly [number, number, number]): Vec3 {
  const scale = piece.scale ?? 1, c = Math.cos(piece.yaw), s = Math.sin(piece.yaw);
  return { x: piece.x + (point[0] * c + point[2] * s) * scale, y: piece.y + point[1] * scale,
    z: piece.z + (point[2] * c - point[0] * s) * scale };
}

interface Node { id: string; piece: string; floor?: string; point: Vec3; ground: boolean }
interface Edge { to: string; points: Vec3[] }

// Preserve authored heights and turns separately from the outdoor route grid.
// Every exported path is verified in both directions by real movement tests.
export function buildBuildingRoutes(world: WorldSpec): BuildingRoute[] {
  const nodes = new Map<string, Node>(), edges = new Map<string, Edge[]>();
  const key = (piece: string, local: string) => `${piece}/${local}`;
  const link = (from: string, to: string, points: Vec3[]) => {
    edges.get(from)!.push({ to, points });
    edges.get(to)!.push({ to: from, points: [...points].reverse() });
  };
  for (const piece of world.pieces ?? []) {
    const access = KIT_PIECES[piece.piece]?.traversal;
    if (!access) continue;
    for (const entrance of access.entrances) {
      const id = key(piece.id, entrance.id), point = buildingPoint(piece, entrance.point);
      const terrain = terrainHeight(point.x, point.z);
      const ground = !entrance.platform && terrain >= 0 && Math.abs(point.y - terrain) <= .45;
      if (ground) point.y = walkableHeight(point.x, point.z, world);
      nodes.set(id, { id, piece: piece.id, point, ground: ground && clearSpawn(point, world) }); edges.set(id, []);
    }
    for (const floor of access.floors) {
      const anchor = access.routes.find(route => route.to === floor.id)?.points.at(-1) ?? access.routes.find(route => route.from === floor.id)?.points[0];
      if (!anchor) throw new Error(`Missing floor route: ${piece.id}/${floor.id}`);
      const id = key(piece.id, floor.id);
      nodes.set(id, { id, piece: piece.id, floor: floor.id, point: buildingPoint(piece, anchor), ground: false }); edges.set(id, []);
    }
    for (const route of access.routes) {
      const a = nodes.get(key(piece.id, route.from))!, b = nodes.get(key(piece.id, route.to))!;
      const interior = route.points.map(point => buildingPoint(piece, point)).filter(point =>
        Math.hypot(point.x - a.point.x, point.z - a.point.z) > .001 && Math.hypot(point.x - b.point.x, point.z - b.point.z) > .001);
      link(a.id, b.id, [a.point, ...interior, b.point]);
    }
  }
  const supported = (point: Vec3) => Math.abs(terrainHeight(point.x, point.z) - point.y) <= .06 ||
    colliderGrid(world).query(point.x, point.z, point.x, point.z).some(c => Math.abs(c.max.y - point.y) <= .06 &&
      point.x >= c.min.x && point.x <= c.max.x && point.z >= c.min.z && point.z <= c.max.z);
  const standingClear = (point: Vec3) => colliderGrid(world).query(point.x - .5, point.z - .5, point.x + .5, point.z + .5)
    .every(c => point.y >= c.max.y - .01 || point.y + 1.8 <= c.min.y || !overlapsFootprint(point, c));
  const list = [...nodes.values()];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j], distance = Math.hypot(a.point.x - b.point.x, a.point.z - b.point.z);
    if (a.piece === b.piece || Math.abs(a.point.y - b.point.y) > .08 || distance > 1.35) continue;
    const steps = Math.max(1, Math.ceil(distance / .2));
    const segment = Array.from({ length: steps + 1 }, (_, n) => ({
      x: a.point.x + (b.point.x - a.point.x) * n / steps, y: a.point.y + (b.point.y - a.point.y) * n / steps,
      z: a.point.z + (b.point.z - a.point.z) * n / steps }));
    if (segment.every(point => standingClear(point) && supported(point))) link(a.id, b.id, [a.point, b.point]);
  }
  const result: BuildingRoute[] = [];
  for (const entrance of list.filter(node => node.ground)) {
    const paths = new Map<string, Vec3[]>([[entrance.id, [entrance.point]]]), queue = [entrance.id];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const node = nodes.get(queue[cursor])!;
      if (node.floor) result.push({ id: `${node.id}@${entrance.id}`, pieceId: node.piece, floorId: node.floor, points: paths.get(node.id)! });
      for (const edge of edges.get(node.id)!) if (!paths.has(edge.to)) {
        paths.set(edge.to, [...paths.get(node.id)!, ...edge.points.slice(1)]); queue.push(edge.to);
      }
    }
  }
  return result;
}
