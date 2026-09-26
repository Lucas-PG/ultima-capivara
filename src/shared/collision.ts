import { clamp } from './math';
import { terrainHeight } from './terrain';
import { boundaryFeedback } from './bounds';
import type { ActorState, Collider, InputFrame, Mode, Vec3, WorldSpec } from './types';

const RADIUS = .32;
const STEP = .45;
export const actorHeight = (actor: ActorState) => actor.crouch ? 1.3 : 1.8;
// Standing eye sits in the head volume; crouched, the head centre drops to ~1.14 m.
export const actorEye = (actor: ActorState) => actor.crouch ? 1.17 : 1.62;
export const overlapsFootprint = (pos: Vec3, collider: Collider): boolean => {
  const x = pos.x - clamp(pos.x, collider.min.x, collider.max.x);
  const z = pos.z - clamp(pos.z, collider.min.z, collider.max.z);
  return x * x + z * z < RADIUS * RADIUS;
};

const hasHeadroom = (pos: Vec3, world: WorldSpec, height: number): boolean =>
  world.colliders.every(c => !overlapsFootprint(pos, c) || pos.y >= c.max.y - .01 || pos.y + height <= c.min.y);

export function raycastWorld(origin: Vec3, direction: Vec3, maxDistance: number, world: WorldSpec): { distance: number; collider: Collider; point: Vec3 } | null {
  let nearest: { distance: number; collider: Collider; point: Vec3 } | null = null;
  for (const collider of world.colliders) {
    let low = 0, high = maxDistance;
    for (const axis of ['x', 'y', 'z'] as const) {
      const d = direction[axis], o = origin[axis];
      if (Math.abs(d) < 1e-9) { if (o < collider.min[axis] || o > collider.max[axis]) { low = Infinity; break; } continue; }
      const a = (collider.min[axis] - o) / d, b = (collider.max[axis] - o) / d;
      low = Math.max(low, Math.min(a, b)); high = Math.min(high, Math.max(a, b));
      if (low > high) break;
    }
    if (low <= high && low < maxDistance && (!nearest || low < nearest.distance)) nearest = { distance: low, collider, point: { x: origin.x + direction.x * low, y: origin.y + direction.y * low, z: origin.z + direction.z * low } };
  }
  const limit = Math.min(maxDistance, nearest?.distance ?? maxDistance);
  const steps = Math.ceil(limit / 2);
  for (let i = 1; i <= steps; i++) {
    const distance = Math.min(limit, i * 2);
    const point = { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance, z: origin.z + direction.z * distance };
    if (point.y < terrainHeight(point.x, point.z) - .02) {
      return { distance, point, collider: { id: 'terrain', min: point, max: point, material: 'earth' } };
    }
  }
  return nearest;
}

export function hasLineOfSight(a: Vec3, b: Vec3, world: WorldSpec): boolean {
  const distance = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  if (distance < 1e-8) return true;
  const dx = (b.x - a.x) / distance, dy = (b.y - a.y) / distance, dz = (b.z - a.z) / distance;
  const limit = distance - .05;
  // Boolean visibility needs no hit record, direction object or terrain points.
  // Keep the same slab bounds and endpoint tolerance as raycastWorld.
  for (let i = 0; i < world.colliders.length; i++) {
    const collider = world.colliders[i];
    let low = 0, high = limit;
    for (let axis = 0; axis < 3; axis++) {
      const d = axis === 0 ? dx : axis === 1 ? dy : dz, o = axis === 0 ? a.x : axis === 1 ? a.y : a.z;
      const min = axis === 0 ? collider.min.x : axis === 1 ? collider.min.y : collider.min.z;
      const max = axis === 0 ? collider.max.x : axis === 1 ? collider.max.y : collider.max.z;
      if (Math.abs(d) < 1e-9) { if (o < min || o > max) { low = Infinity; break; } continue; }
      const near = (min - o) / d, far = (max - o) / d;
      low = Math.max(low, Math.min(near, far)); high = Math.min(high, Math.max(near, far));
      if (low > high) break;
    }
    if (low <= high && low < limit) return false;
  }
  const steps = Math.ceil(limit / 2);
  for (let i = 1; i <= steps; i++) {
    const along = Math.min(limit, i * 2);
    if (a.y + dy * along < terrainHeight(a.x + dx * along, a.z + dz * along) - .02) return false;
  }
  return true;
}

export function clearSpawn(pos: Vec3, world: WorldSpec): boolean {
  return world.colliders.every(c => pos.y >= c.max.y - .01 || pos.y + 1.8 <= c.min.y ||
    pos.x + RADIUS <= c.min.x || pos.x - RADIUS >= c.max.x || pos.z + RADIUS <= c.min.z || pos.z - RADIUS >= c.max.z);
}

/** Shared host/client ground movement. The host remains authoritative. */
export function moveActor(actor: ActorState, input: InputFrame, world: WorldSpec, dt: number, speedMultiplier = 1, mode?: Mode): ActorState {
  if (actor.stage !== 'ground' || !actor.alive || !Number.isFinite(dt) || dt <= 0) return actor;
  const p = actor.pos;
  actor.crouch = input.crouch || (actor.crouch && !hasHeadroom(p, world, 1.8));
  actor.sprint = input.sprint && !actor.crouch && !input.ads && input.moveZ > 0;
  actor.ads = input.ads;
  actor.lean = actor.sprint ? 0 : clamp(input.lean, -1, 1);
  const f = -Math.sin(actor.yaw), g = -Math.cos(actor.yaw), r = Math.cos(actor.yaw), s = -Math.sin(actor.yaw);
  const mx = clamp(input.moveX, -1, 1), mz = clamp(input.moveZ, -1, 1), length = Math.max(1, Math.hypot(mx, mz));
  const speed = (actor.crouch ? 2.1 : actor.sprint ? 6.4 : input.ads ? 2.4 : 3.9) * clamp(speedMultiplier, .1, 2);
  let wantedX = (f * mz + r * mx) / length * speed, wantedZ = (g * mz + s * mx) / length * speed;
  const boundary = boundaryFeedback(p, world, mode);
  if (boundary) {
    const inward = wantedX * boundary.x + wantedZ * boundary.z;
    const push = Math.max(0, 3.2 - inward) * boundary.strength;
    wantedX += boundary.x * push; wantedZ += boundary.z * push;
  }
  const alpha = 1 - Math.exp(-(actor.grounded ? 9 : 1.6) * dt);
  actor.velocity.x += (wantedX - actor.velocity.x) * alpha;
  actor.velocity.z += (wantedZ - actor.velocity.z) * alpha;
  if (input.jump && actor.grounded) { actor.velocity.y = 7; actor.grounded = false; }
  p.x += actor.velocity.x * dt; p.z += actor.velocity.z * dt;
  const height = actorHeight(actor);
  for (const c of world.colliders) {
    if (p.y >= c.max.y - .01 || p.y + height <= c.min.y) continue;
    const cx = clamp(p.x, c.min.x, c.max.x), cz = clamp(p.z, c.min.z, c.max.z);
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= RADIUS * RADIUS) continue;
    if (actor.grounded && c.max.y - p.y <= STEP && hasHeadroom({ x: p.x, y: c.max.y, z: p.z }, world, height)) { p.y = Math.max(p.y, c.max.y); continue; }
    if (d2 > 1e-9) { const k = (RADIUS - Math.sqrt(d2)) / Math.sqrt(d2); p.x += dx * k; p.z += dz * k; }
    else { const ex = Math.min(p.x - c.min.x, c.max.x - p.x), ez = Math.min(p.z - c.min.z, c.max.z - p.z); if (ex < ez) p.x = p.x - c.min.x < c.max.x - p.x ? c.min.x - RADIUS : c.max.x + RADIUS; else p.z = p.z - c.min.z < c.max.z - p.z ? c.min.z - RADIUS : c.max.z + RADIUS; }
  }
  actor.velocity.y -= 22 * dt;
  let ground = terrainHeight(p.x, p.z);
  for (const c of world.colliders) {
    if (!overlapsFootprint(p, c)) continue;
    if (p.y >= c.max.y - STEP) ground = Math.max(ground, c.max.y);
    else if (actor.velocity.y > 0 && p.y + height <= c.min.y && p.y + height + actor.velocity.y * dt > c.min.y) actor.velocity.y = 0;
  }
  p.y += actor.velocity.y * dt;
  if (p.y <= ground) { p.y = ground; actor.velocity.y = 0; actor.grounded = true; }
  else actor.grounded = false;
  return actor;
}
