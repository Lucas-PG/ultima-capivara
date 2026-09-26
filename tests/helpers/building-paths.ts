import type { KitTraversal } from '../../src/shared/kit-collision';
export { buildingPoint } from '../../src/shared/building-access';

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
