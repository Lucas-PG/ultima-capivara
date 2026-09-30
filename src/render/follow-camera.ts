import * as THREE from 'three';
import { colliderGrid } from '../shared/collider-grid';
import { terrainHeight } from '../shared/terrain';
import type { Vec3, WorldSpec } from '../shared/types';

// Third-person spectator camera: over the right shoulder of the watched capybara, looking where it looks.
// Snapshots carry the aim at 20 Hz, so the view follows a damped aim instead of the raw one; walls between the
// head and the lens pull the camera in at once and let it back out slowly, so it never shows the inside of a wall.
export interface FollowTarget { pos: Vec3; yaw: number; pitch: number; crouch: boolean; swimming: boolean; alive: boolean }
export const FOLLOW = {
  distance: 3.2, crouchDistance: 2.7, downDistance: 4.4,
  height: 1.5, crouchHeight: 1.1, swimHeight: .75, downHeight: .7,
  shoulder: .5, probe: .24, clearance: .35,
  aimRate: 11, pullOutSpeed: 3.5, pitchScale: .72, pitchBias: -.1,
  minPitch: -1.0, maxPitch: .75,
  // Mouse orbit returns behind the target after this long without input.
  orbitIdle: 2.2, orbitReturn: 2.4,
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
  private initialized = false;
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly pivot = new THREE.Vector3();
  private readonly head = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();

  /** The next update starts from the target's own aim with no easing (a new target or a cut). */
  reset() { this.initialized = false; this.orbitYaw = this.orbitPitch = 0; this.idle = Infinity; }

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
    const yaw = this.yaw + this.orbitYaw, pitch = THREE.MathUtils.clamp(this.pitch + this.orbitPitch, FOLLOW.minPitch, FOLLOW.maxPitch);
    const height = down ? FOLLOW.downHeight : target.swimming ? FOLLOW.swimHeight : target.crouch ? FOLLOW.crouchHeight : FOLLOW.height;
    const wanted = down ? FOLLOW.downDistance : target.crouch ? FOLLOW.crouchDistance : FOLLOW.distance;
    this.head.set(target.pos.x, target.pos.y + height, target.pos.z);
    // Shoulder offset first: a target hugging a wall on its right keeps the pivot inside the room.
    const right = this.dir.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const side = down ? 0 : clearDistance(world, this.head, right, FOLLOW.shoulder, FOLLOW.probe * .7, 0);
    this.pivot.copy(this.head).addScaledVector(right, side);
    // Back along the view direction, with a probe sphere so the near plane stays out of the wall.
    this.euler.set(pitch, yaw, 0); this.quaternion.setFromEuler(this.euler);
    const back = this.dir.set(0, 0, 1).applyQuaternion(this.quaternion);
    const free = clearDistance(world, this.pivot, back, wanted, FOLLOW.probe);
    // In at once when blocked, back out at a walking pace so a doorway does not pump the view.
    if (!this.initialized || free < this.distance || reducedMotion) this.distance = free;
    else this.distance = Math.min(free, this.distance + FOLLOW.pullOutSpeed * step);
    this.reach = this.distance;
    this.position.copy(this.pivot).addScaledVector(back, this.distance);
    this.initialized = true;
  }
}
