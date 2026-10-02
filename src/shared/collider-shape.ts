import type { Collider, Vec3, WorldSpec } from './types';

const dressing = new WeakMap<WorldSpec, WorldSpec>();
/** Decoration is authored with placement cores, independently of collision. */
export function dressingWorld(world: WorldSpec): WorldSpec {
  if (!world.dressingColliders) return world;
  let result = dressing.get(world);
  if (!result) { result = { ...world, colliders: world.dressingColliders, dressingColliders: undefined }; dressing.set(world, result); }
  return result;
}

/** Vertical extent of a solid beneath a circular footprint, or null outside it. */
export function colliderSpan(c: Collider, x: number, z: number, radius = 0): [number, number] | null {
  if (!c.hull) {
    const dx = Math.max(c.min.x - x, 0, x - c.max.x), dz = Math.max(c.min.z - z, 0, z - c.max.z);
    return dx * dx + dz * dz > radius * radius ? null : [c.min.y, c.max.y];
  }
  let low = -Infinity, high = Infinity;
  for (const [nx, ny, nz, distance] of c.hull) {
    const available = distance + radius * Math.hypot(nx, nz) - nx * x - nz * z;
    if (Math.abs(ny) < 1e-9) { if (available < 0) return null; }
    else if (ny > 0) high = Math.min(high, available / ny);
    else low = Math.max(low, available / ny);
    if (low > high) return null;
  }
  return [low, high];
}

/** Body cylinder against the convex faces. Used by players, bots and spawns. */
export function intersectsCollider(c: Collider, p: Vec3, height: number, radius: number, tolerance = 0): boolean {
  const span = colliderSpan(c, p.x, p.z, radius);
  return !!span && p.y + height > span[0] + tolerance && p.y < span[1] - tolerance;
}

export function containsCollider(c: Collider, p: Vec3, radius = 0): boolean {
  if (c.hull) return c.hull.every(([nx, ny, nz, distance]) => nx * p.x + ny * p.y + nz * p.z < distance + radius);
  return p.x > c.min.x - radius && p.x < c.max.x + radius && p.y > c.min.y - radius && p.y < c.max.y + radius &&
    p.z > c.min.z - radius && p.z < c.max.z + radius;
}

/** Segment against the solid's faces; radius grows them for a camera probe. */
export function sweepCollider(c: Collider, origin: Vec3, dir: Vec3, length: number, radius = 0): number {
  let near = 0, far = length;
  if (c.hull) {
    for (const [nx, ny, nz, distance] of c.hull) {
      const available = distance + radius - nx * origin.x - ny * origin.y - nz * origin.z;
      const velocity = nx * dir.x + ny * dir.y + nz * dir.z;
      if (Math.abs(velocity) < 1e-9) { if (available < 0) return Infinity; }
      else if (velocity < 0) near = Math.max(near, available / velocity);
      else far = Math.min(far, available / velocity);
      if (near > far) return Infinity;
    }
  } else {
    for (const axis of ['x', 'y', 'z'] as const) {
      const d = dir[axis], o = origin[axis], lo = c.min[axis] - radius, hi = c.max[axis] + radius;
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return Infinity; continue; }
      const a = (lo - o) / d, b = (hi - o) / d;
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
      if (near > far) return Infinity;
    }
  }
  return near;
}

/** Smallest horizontal exit of a body from a stone hull. */
export function pushFromHull(c: Collider, p: Vec3, height: number, radius: number): boolean {
  if (!c.hull || !intersectsCollider(c, p, height, radius, .001)) return false;
  let shift = Infinity, dx = 0, dz = 0;
  for (const [nx, ny, nz, distance] of c.hull) {
    const horizontal = Math.hypot(nx, nz);
    if (horizontal < 1e-8) continue;
    const penetration = (distance + radius * horizontal - Math.min(0, ny) * height - nx * p.x - ny * p.y - nz * p.z) / horizontal;
    if (penetration < shift) { shift = penetration; dx = nx / horizontal; dz = nz / horizontal; }
  }
  if (!Number.isFinite(shift)) return false;
  p.x += dx * (shift + .001); p.z += dz * (shift + .001);
  return true;
}

/** Keep a camera's lens outside stone even during an interpolated camera cut. */
export function pushLensFromHull(c: Collider, p: Vec3, radius: number): boolean {
  if (!c.hull || !containsCollider(c, p, radius)) return false;
  let shift = Infinity, dx = 0, dy = 0, dz = 0;
  for (const [nx, ny, nz, distance] of c.hull) {
    const penetration = distance + radius - nx * p.x - ny * p.y - nz * p.z;
    if (penetration < shift) { shift = penetration; dx = nx; dy = ny; dz = nz; }
  }
  p.x += dx * (shift + .001); p.y += dy * (shift + .001); p.z += dz * (shift + .001);
  return true;
}
