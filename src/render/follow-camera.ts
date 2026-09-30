import * as THREE from 'three';
import { colliderGrid } from '../shared/collider-grid';
import { terrainHeight } from '../shared/terrain';
import type { Vec3, WorldSpec } from '../shared/types';
import { crownReach, foliageAt, foliageSpan, plantCrown, type CrownShape } from '../shared/vegetation-crowns';
import { vegetationDressing } from '../shared/vegetation-dressing';

// Third-person spectator camera: over the right shoulder of the watched capybara, looking where it looks.
// Snapshots carry the aim at 20 Hz, so the view follows a damped aim instead of the raw one; walls between the
// head and the lens pull the camera in at once and let it back out slowly, so it never shows the inside of a wall.
export interface FollowTarget { pos: Vec3; yaw: number; pitch: number; crouch: boolean; swimming: boolean; alive: boolean }
export const FOLLOW = {
  distance: 3.2, crouchDistance: 2.7, downDistance: 4.4,
  height: 1.5, crouchHeight: 1.1, swimHeight: .75, downHeight: .7,
  shoulder: .5, probe: .24, clearance: .35,
  aimRate: 11, pullOutSpeed: 3.5, leafInSpeed: 6, pitchScale: .72, pitchBias: -.1,
  minPitch: -1.0, maxPitch: .75,
  // Mouse orbit returns behind the target after this long without input.
  orbitIdle: 2.2, orbitReturn: 2.4,
  // A target backed into a wall squeezes the lens into its head. Under `roomy` metres of room behind it,
  // the lens rises over the target (lifts, radians of extra downward pitch) and swings along the wall
  // (swings, radians of yaw), easing there at `reframeRate` and home again once the view behind is clear.
  roomy: 1.7, lifts: [.4, .75, 1.05], swings: [0, .75, -.75, 1.35, -1.35], reframeRate: 4, liftPitch: -1.35,
};
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const AXES = ['x', 'y', 'z'] as const;

/** Entry distance of a segment into an AABB grown by `radius` (a conservative sphere cast), or Infinity. */
export function sweepBox(origin: Vec3, dir: Vec3, length: number, min: Vec3, max: Vec3, radius: number): number {
  let near = 0, far = length;
  for (const axis of AXES) {
    const lo = min[axis] - radius, hi = max[axis] + radius, o = origin[axis], d = dir[axis];
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return Infinity; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    near = Math.max(near, t1); far = Math.min(far, t2);
    if (far < near) return Infinity;
  }
  return near;
}

// Plants have no collision, but a lens inside a crown or a bush shows nothing but leaves. Their foliage
// volumes (the profiles world placement uses) hold the lens back. Unlike a wall they are soft: the
// lens eases in front of them instead of snapping (a runner passing a palm would pump the view), and
// a plant the target itself stands in is ignored (the view would collapse into its head).
const FOLIAGE_CELL = 8;
const foliageIndex = new WeakMap<WorldSpec, Map<number, CrownShape[]>>();
function foliageCells(world: WorldSpec) {
  let cells = foliageIndex.get(world);
  if (cells) return cells;
  cells = new Map();
  const shapes = world.objects.map(plantCrown);
  // Low ground plants never reach a lens: ferns, bromeliads, crops, meadow drifts and the wall drapes.
  if (world.pieces?.length) for (const p of vegetationDressing(world))
    if (!['meadow', 'crop', 'fern', 'bromeliad', 'vine'].includes(p.species)) shapes.push(foliageAt(p.species, p.variant, p.x, p.y, p.z, p.height));
  for (const shape of shapes) {
    if (!shape) continue;
    const reach = crownReach(shape);
    for (let cx = Math.floor((shape.x - reach) / FOLIAGE_CELL); cx <= Math.floor((shape.x + reach) / FOLIAGE_CELL); cx++)
      for (let cz = Math.floor((shape.z - reach) / FOLIAGE_CELL); cz <= Math.floor((shape.z + reach) / FOLIAGE_CELL); cz++) {
        const key = cx * 4096 + cz, list = cells.get(key);
        if (list) list.push(shape); else cells.set(key, [shape]);
      }
  }
  foliageIndex.set(world, cells);
  return cells;
}
const within = (shape: CrownShape, x: number, y: number, z: number) => { const span = foliageSpan(shape, x, z); return !!span && y > span[0] && y < span[1]; };
/** How far a lens can travel from `origin` along unit `dir` before entering the foliage of a plant the origin is not already inside. */
export function foliageDistance(world: WorldSpec, origin: Vec3, dir: Vec3, length: number): number {
  const cells = foliageCells(world), key = (x: number, z: number) => Math.floor(x / FOLIAGE_CELL) * 4096 + Math.floor(z / FOLIAGE_CELL);
  const around = cells.get(key(origin.x, origin.z))?.filter(shape => within(shape, origin.x, origin.y, origin.z));
  const steps = Math.max(4, Math.ceil(length / .3));
  for (let i = 1; i <= steps; i++) {
    const t = length * i / steps, x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
    if (cells.get(key(x, z))?.some(shape => !around?.includes(shape) && within(shape, x, y, z))) return length * (i - 1) / steps;
  }
  return length;
}

/** How far a probe of `radius` can travel from `origin` along unit `dir` before touching a collider or the ground. */
export function clearDistance(world: WorldSpec, origin: Vec3, dir: Vec3, length: number, radius: number, clearance = FOLLOW.clearance): number {
  let allowed = length;
  const end = { x: origin.x + dir.x * length, z: origin.z + dir.z * length }, pad = radius + .5;
  for (const collider of colliderGrid(world).query(Math.min(origin.x, end.x) - pad, Math.min(origin.z, end.z) - pad,
    Math.max(origin.x, end.x) + pad, Math.max(origin.z, end.z) + pad)) {
    // A box the origin already sits in (a low roof over a crouching target) cannot block its own inside.
    const inside = origin.x > collider.min.x && origin.x < collider.max.x && origin.y > collider.min.y && origin.y < collider.max.y &&
      origin.z > collider.min.z && origin.z < collider.max.z;
    if (inside) continue;
    const hit = sweepBox(origin, dir, allowed, collider.min, collider.max, radius);
    if (hit < allowed) allowed = Math.max(0, hit);
  }
  // Terrain: march the segment and stop before the lens dips under a slope.
  const steps = Math.max(4, Math.ceil(allowed / .4));
  for (let i = 1; i <= steps; i++) {
    const t = allowed * i / steps, x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
    if (y < terrainHeight(x, z) + clearance) { allowed = Math.max(0, allowed * (i - 1) / steps); break; }
  }
  return allowed;
}

export class FollowCamera {
  readonly position = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();
  /** Distance from the head pivot to the lens this frame; small values mean the body fills the view. */
  reach = FOLLOW.distance;
  private yaw = 0;
  private pitch = 0;
  private orbitYaw = 0;
  private orbitPitch = 0;
  private idle = Infinity;
  private distance = FOLLOW.distance;
  private leafFree = FOLLOW.distance;
  private lift = 0;
  private swing = 0;
  private liftGoal = 0;
  private swingGoal = 0;
  private initialized = false;
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly pivot = new THREE.Vector3();
  private readonly head = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();

  /** The next update starts from the target's own aim with no easing (a new target or a cut). */
  reset() { this.initialized = false; this.orbitYaw = this.orbitPitch = 0; this.idle = Infinity; this.lift = this.swing = this.liftGoal = this.swingGoal = 0; }

  /** Mouse look while spectating orbits around the target; the view drifts back behind it after a short idle. */
  orbit(dYaw: number, dPitch: number) {
    if (!dYaw && !dPitch) return;
    this.orbitYaw = wrap(this.orbitYaw + dYaw);
    this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + dPitch, -1.2, 1.2);
    this.idle = 0;
  }

  update(world: WorldSpec, target: FollowTarget, dt: number, reducedMotion = false) {
    const step = Math.max(0, Math.min(dt, .1));
    const down = !target.alive;
    // A fallen target is framed from a slow high orbit instead of its last aim.
    const aimPitch = down ? -.42 : target.pitch * FOLLOW.pitchScale + FOLLOW.pitchBias;
    if (!this.initialized) { this.yaw = target.yaw; this.pitch = aimPitch; this.distance = down ? FOLLOW.downDistance : FOLLOW.distance; }
    else {
      const k = reducedMotion ? 1 : 1 - Math.exp(-FOLLOW.aimRate * step);
      this.yaw = wrap(down ? this.yaw + step * (reducedMotion ? 0 : .35) : this.yaw + wrap(target.yaw - this.yaw) * k);
      this.pitch += (aimPitch - this.pitch) * k;
    }
    this.idle += step;
    if (this.idle > FOLLOW.orbitIdle) {
      const k = 1 - Math.exp(-FOLLOW.orbitReturn * step);
      this.orbitYaw -= this.orbitYaw * k; this.orbitPitch -= this.orbitPitch * k;
    }
    const baseYaw = this.yaw + this.orbitYaw, basePitch = THREE.MathUtils.clamp(this.pitch + this.orbitPitch, FOLLOW.minPitch, FOLLOW.maxPitch);
    const height = down ? FOLLOW.downHeight : target.swimming ? FOLLOW.swimHeight : target.crouch ? FOLLOW.crouchHeight : FOLLOW.height;
    const wanted = down ? FOLLOW.downDistance : target.crouch ? FOLLOW.crouchDistance : FOLLOW.distance;
    this.head.set(target.pos.x, target.pos.y + height, target.pos.z);
    this.reframe(world, baseYaw, basePitch, wanted, step, reducedMotion || !this.initialized);
    const yaw = baseYaw + this.swing, pitch = Math.max(FOLLOW.liftPitch, basePitch - this.lift);
    const hard = this.clearBehind(world, yaw, pitch, wanted, down), free = Math.min(hard, this.leafFree);
    const back = this.dir;
    // In at once when a wall blocks, in front of leaves at a run, back out at a walking pace so a doorway does not pump the view.
    if (!this.initialized || reducedMotion) this.distance = free;
    else {
      if (hard < this.distance) this.distance = hard;
      this.distance = free < this.distance ? Math.max(free, this.distance - FOLLOW.leafInSpeed * step) : Math.min(free, this.distance + FOLLOW.pullOutSpeed * step);
    }
    this.reach = this.distance;
    this.position.copy(this.pivot).addScaledVector(back, this.distance);
    this.initialized = true;
  }

  /** Room for the lens behind the target along (yaw, pitch) before a wall or the ground, with the room before
   * foliage in `leafFree`; leaves the pivot, orientation and back direction set. */
  private clearBehind(world: WorldSpec, yaw: number, pitch: number, wanted: number, down: boolean) {
    // Shoulder offset first: a target hugging a wall on its right keeps the pivot inside the room, with
    // room left for the lens probe (a thinner shoulder probe parked the pivot where the lens could not move).
    const right = this.dir.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const side = down ? 0 : foliageDistance(world, this.head, right, clearDistance(world, this.head, right, FOLLOW.shoulder, FOLLOW.probe + .02, 0));
    this.pivot.copy(this.head).addScaledVector(right, side);
    // Back along the view direction, with a probe sphere so the near plane stays out of the wall.
    this.euler.set(pitch, yaw, 0); this.quaternion.setFromEuler(this.euler);
    const back = this.dir.set(0, 0, 1).applyQuaternion(this.quaternion);
    const hard = clearDistance(world, this.pivot, back, wanted, FOLLOW.probe);
    this.leafFree = foliageDistance(world, this.pivot, back, hard);
    return hard;
  }

  /** With the target backed into a wall, picks the smallest lift and swing that give the lens room, and eases toward it. */
  private reframe(world: WorldSpec, yaw: number, pitch: number, wanted: number, step: number, cut: boolean) {
    // Room behind the target, clear of walls and of leaves.
    const roomy = Math.min(FOLLOW.roomy, wanted * .6), room = (lift: number, swing: number) =>
      Math.min(this.clearBehind(world, yaw + swing, Math.max(FOLLOW.liftPitch, pitch - lift), wanted, false), this.leafFree);
    if (room(0, 0) >= roomy) { this.liftGoal = this.swingGoal = 0; }
    else if (room(this.liftGoal, this.swingGoal) < roomy) {
      // Cheapest first: a small lift, then swings along the wall, then both.
      let best = { lift: 0, swing: 0, free: -1, cost: Infinity };
      for (const lift of [0, ...FOLLOW.lifts]) for (const swing of FOLLOW.swings) {
        if (!lift && !swing) continue;
        const free = room(lift, swing), cost = lift + Math.abs(swing) * .8;
        const good = free >= roomy, better = good ? !(best.free >= roomy) || cost < best.cost : !(best.free >= roomy) && free > best.free;
        if (better) best = { lift, swing, free, cost };
      }
      if (best.free > room(0, 0) + .3) { this.liftGoal = best.lift; this.swingGoal = best.swing; }
    }
    const k = cut ? 1 : 1 - Math.exp(-FOLLOW.reframeRate * step);
    this.lift += (this.liftGoal - this.lift) * k;
    this.swing += (this.swingGoal - this.swing) * k;
  }
}
