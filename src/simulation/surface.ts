import { ROADS } from '../shared/layout';
import { terrainHeight } from '../shared/terrain';
import type { Collider, Surface, Vec3 } from '../shared/types';

// The sea plane (world-scene water mesh) also floods the Lagoa pond basin.
export const WATER_LEVEL = -.05;

export interface Impact { point: Vec3; surface: Surface; normal: Vec3 }

const onRoad = (x: number, z: number) => ROADS.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1);

function terrainNormal(x: number, z: number): Vec3 {
  const e = .5, dx = terrainHeight(x + e, z) - terrainHeight(x - e, z), dz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  const n = Math.hypot(dx, 2 * e, dz);
  return { x: -dx / n, y: 2 * e / n, z: -dz / n };
}

// Same broad regions the terrain is painted with: asphalt, beach, bare slope, grass.
export function terrainSurface(x: number, z: number): Surface {
  if (onRoad(x, z)) return 'stone';
  if (terrainHeight(x, z) < .8) return 'sand';
  return terrainNormal(x, z).y < .86 ? 'dirt' : 'foliage';
}

// The face of an axis-aligned box that a ray entering at `point` crossed.
function boxNormal(point: Vec3, c: Collider, d: Vec3): Vec3 {
  let best = Infinity, normal: Vec3 = { x: 0, y: 1, z: 0 };
  for (const axis of ['x', 'y', 'z'] as const) {
    for (const [plane, sign] of [[c.min[axis], -1], [c.max[axis], 1]] as const) {
      const gap = Math.abs(point[axis] - plane);
      // Only faces that look back toward the shooter can be the entry face.
      if (gap < best && sign * d[axis] <= 0) { best = gap; normal = { x: 0, y: 0, z: 0, [axis]: sign }; }
    }
  }
  return normal;
}

// Refines a coarse world hit (raycastWorld steps the terrain every 2 m) into
// an exact impact point, a surface kind for the effects and the face normal.
// A ray that crosses the water first ends on the water.
export function resolveImpact(origin: Vec3, d: Vec3, hit: { distance: number; collider: Collider } | null, range: number): Impact | null {
  let distance = hit?.distance ?? range;
  let surface: Surface | null = null, normal: Vec3 | null = null;
  if (hit && hit.collider.id === 'terrain') {
    let low = Math.max(0, distance - 2), high = distance;
    for (let i = 0; i < 10; i++) {
      const mid = (low + high) / 2;
      if (origin.y + d.y * mid < terrainHeight(origin.x + d.x * mid, origin.z + d.z * mid)) high = mid; else low = mid;
    }
    distance = high;
  }
  if (d.y < -1e-6 && origin.y > WATER_LEVEL) {
    const t = (origin.y - WATER_LEVEL) / -d.y;
    if (t < distance && terrainHeight(origin.x + d.x * t, origin.z + d.z * t) < WATER_LEVEL) {
      distance = t; surface = 'water'; normal = { x: 0, y: 1, z: 0 };
    }
  }
  const point = { x: origin.x + d.x * distance, y: origin.y + d.y * distance, z: origin.z + d.z * distance };
  if (!surface) {
    if (!hit) return null;
    if (hit.collider.id === 'terrain') { surface = terrainSurface(point.x, point.z); normal = terrainNormal(point.x, point.z); }
    else {
      const m = hit.collider.material;
      surface = m === 'earth' ? 'dirt' : m;
      normal = boxNormal(point, hit.collider, d);
    }
  }
  return { point, surface, normal: normal! };
}
