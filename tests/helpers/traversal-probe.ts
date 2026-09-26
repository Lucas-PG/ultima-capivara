import { moveActor } from '../../src/shared/collision';
import { emptyInput } from '../../src/shared/math';
import type { ActorState, Vec3, WorldSpec } from '../../src/shared/types';

export interface TraversalResult {
  ok: boolean; waypoint: number; ticks: number; reason?: string;
  actual: Vec3; expected: Vec3; actor: ActorState;
}

// Drive the ordinary walking input, with no jumping, teleports or position
// correction after the entrance. The same probe can be replayed in visual QA.
export function walkTraversal(world: WorldSpec, template: ActorState, route: readonly Vec3[],
  onTick?: (actor: ActorState, waypoint: number) => void): TraversalResult {
  if (route.length < 2) throw new Error('Traversal needs an entrance and a destination');
  const actor = structuredClone(template);
  actor.pos = { ...route[0] }; actor.velocity = { x: 0, y: 0, z: 0 };
  actor.alive = actor.grounded = true; actor.stage = 'ground';
  actor.crouch = actor.sprint = actor.swimming = false;
  actor.emote = null; actor.soaking = false; actor.bounceProtected = false;
  let ticks = 0;
  for (let waypoint = 1; waypoint < route.length; waypoint++) {
    const expected = route[waypoint], from = { ...actor.pos };
    const limit = Math.ceil(180 + Math.hypot(expected.x - from.x, expected.z - from.z) * 90);
    let reached = false;
    for (let frame = 0; frame < limit; frame++) {
      const dx = expected.x - actor.pos.x, dz = expected.z - actor.pos.z, distance = Math.hypot(dx, dz);
      // On a narrow tread the round feet may already overlap the next step.
      // Require the final floor exactly, while permitting one legal rise en route.
      const highTolerance = waypoint === route.length - 1 ? .09 : .45;
      if (distance < .12 && actor.pos.y >= expected.y - .09 && actor.pos.y <= expected.y + highTolerance) { reached = true; break; }
      actor.yaw = Math.atan2(-dx, -dz);
      moveActor(actor, { ...emptyInput(), seq: ++ticks, yaw: actor.yaw, moveZ: Math.min(1, distance / .35) }, world, 1 / 60);
      onTick?.(actor, waypoint);
      if (actor.pos.y < Math.min(from.y, expected.y) - .5) return {
        ok: false, waypoint, ticks, reason: 'fell below the intended walking surface', actual: { ...actor.pos }, expected, actor,
      };
    }
    if (!reached) return { ok: false, waypoint, ticks, reason: 'could not reach the next landing by walking',
      actual: { ...actor.pos }, expected, actor };
  }
  return { ok: true, waypoint: route.length - 1, ticks, actual: { ...actor.pos }, expected: route.at(-1)!, actor };
}
