import type { KitTraversal } from '../../src/shared/kit-collision';
import type { KitPlacement, Vec3 } from '../../src/shared/types';

export function buildingPoint(piece: KitPlacement, point: readonly [number, number, number]): Vec3 {
  const scale = piece.scale ?? 1, c = Math.cos(piece.yaw), s = Math.sin(piece.yaw);
  return { x: piece.x + (point[0] * c + point[2] * s) * scale, y: piece.y + point[1] * scale,
    z: piece.z + (point[2] * c - point[0] * s) * scale };
}

// Route topology is authored with the solids; tests and review cameras consume
// it without inventing a path through walls or teleporting between floors.
export function routesToFloor(traversal: KitTraversal, floorId: string): [number, number, number][][] {
  const result: [number, number, number][][] = [];
  for (const entrance of traversal.entrances) {
    const seen = new Set([entrance.id]);
    const queue = [{ id: entrance.id, points: [entrance.point] }];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const current = queue[cursor];
      if (current.id === floorId) { result.push(current.points); break; }
      for (const route of traversal.routes) {
        const forward = route.from === current.id;
        const next = forward ? route.to : route.to === current.id ? route.from : null;
        if (!next || seen.has(next)) continue;
        seen.add(next);
        queue.push({ id: next, points: [...current.points, ...(forward ? route.points : [...route.points].reverse())] });
      }
    }
  }
  return result;
}
