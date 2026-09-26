import { clamp } from '../shared/math';
import { WEAPONS } from '../shared/weapons';
import type { ActorState, InputFrame, PlayerAction, RenderFrame, Vec3 } from '../shared/types';

// These fields never enter snapshots, input messages or collision queries.
export type PresentationFrame = RenderFrame & { localActor?: ActorState; simulationTime?: number };
const axes = ['x', 'y', 'z'] as const;
const point = (): Vec3 => ({ x: 0, y: 0, z: 0 });

export class LocalPresentation {
  private previous = point();
  private current = point();
  private error = point();
  private position = point();
  private identity = '';
  private actor: ActorState | undefined;
  private reloadIntent: { slot: number; until: number; expires: number } | undefined;

  clear() { this.identity = ''; this.actor = undefined; this.reloadIntent = undefined; }

  private key(actor: ActorState) { return `${actor.id}:${actor.alive}:${actor.stage}`; }
  private reset(actor: ActorState) {
    this.identity = this.key(actor);
    Object.assign(this.previous, actor.pos); Object.assign(this.current, actor.pos);
    for (const axis of axes) this.error[axis] = 0;
    this.reloadIntent = undefined;
  }

  // Called once per real prediction tick, never during the snapshot replay.
  tick(actor: ActorState) {
    if (this.identity !== this.key(actor)) { this.reset(actor); return; }
    Object.assign(this.previous, this.current); Object.assign(this.current, actor.pos);
  }

  reconcile(actor: ActorState) {
    const distance = Math.hypot(actor.pos.x - this.current.x, actor.pos.y - this.current.y, actor.pos.z - this.current.z);
    if (this.identity !== this.key(actor) || distance > 3) { this.reset(actor); return; }
    // Translate both interpolation endpoints and cancel that translation on the
    // visual offset. The next sample is continuous even halfway through a tick.
    for (const axis of axes) {
      const delta = actor.pos[axis] - this.current[axis];
      this.previous[axis] += delta; this.current[axis] = actor.pos[axis]; this.error[axis] -= delta;
    }
  }

  action(action: PlayerAction, actor: ActorState, time: number) {
    if (action.type === 'slot') this.reloadIntent = undefined;
    if (action.type !== 'reload' || !actor.alive || actor.stage !== 'ground' || actor.reloadUntil > time) return;
    const weapon = actor.weapons[actor.slot];
    if (!weapon || weapon.reserve <= 0 || weapon.ammo >= WEAPONS[weapon.id].magazine || !WEAPONS[weapon.id].reload) return;
    this.reloadIntent = { slot: actor.slot, until: time + WEAPONS[weapon.id].reload, expires: time + .3 };
  }

  sample(actor: ActorState, input: InputFrame, alpha: number, dt: number, time: number): ActorState {
    if (this.identity !== this.key(actor)) this.reset(actor);
    const blend = clamp(alpha, 0, 1), decay = Math.exp(-Math.max(0, dt) * 30);
    for (const axis of axes) {
      this.error[axis] *= decay;
      this.position[axis] = this.previous[axis] + (this.current[axis] - this.previous[axis]) * blend + this.error[axis];
    }
    this.actor ||= { ...actor };
    Object.assign(this.actor, actor);
    this.actor.pos = this.position;
    this.actor.yaw = input.yaw; this.actor.pitch = input.pitch;
    this.actor.ads = input.ads;
    this.actor.sprint = input.sprint && !actor.crouch && !input.ads && input.moveZ > 0;
    this.actor.lean = this.actor.sprint ? 0 : input.lean;
    const intent = this.reloadIntent;
    if (intent && (intent.slot !== actor.slot || time >= intent.expires || actor.reloadUntil > time)) this.reloadIntent = undefined;
    else if (intent) this.actor.reloadUntil = intent.until;
    return this.actor;
  }
}
