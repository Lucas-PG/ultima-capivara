import { advanceAds, coolShotHeat, HANDLING, shotHeatGain, shotSpread, WEAPONS } from './shared/weapons';
import { pelletDirection, rayCapybara, shotOrigin } from './shared/ballistics';
import { raycastWorld } from './shared/collision';
import { swimReady } from './shared/inventory';
import { sameTeam } from './shared/round-modes';
import { resolveImpact } from './simulation/surface';
import type { ActorState, GameEvent, InputFrame, Vec3, WeaponId, WorldSpec } from './shared/types';

export type ShotEvent = Extract<GameEvent, { type: 'shot' }>;
const TICK = 1 / 60;
// A predicted round the host has not confirmed by then was refused (dry, busy, dead).
const UNCONFIRMED = .6;

/**
 * Predicts the local player's own rounds so every shooter-owned cue (flash,
 * kick, recoil, sound, tracer, impact) plays on the input frame instead of a
 * snapshot later. It mirrors the host's gating in Simulation.fire() and draws
 * the same seeded spread; the host stays authoritative for hits and damage,
 * and its shot events for rounds predicted here are then skipped.
 */
export class FirePredictor {
  private nextShot = 0;
  private readonly readyAt: Partial<Record<WeaponId, number>> = {};
  private weapon: WeaponId | null = null;
  private slot = -1;
  private sprintEndedAt = -Infinity;
  private wasSprinting = false;
  private ads = 0;
  private heat = 0;
  private serverHeat = 0;
  private lastPress = -1;
  private seq = 0;
  private readonly pending: { seq: number; at: number; weapon: WeaponId }[] = [];
  private readonly predicted = new Set<number>();
  private identity = '';
  // A click that landed in a sprint-out: the host fires it once the gun is up (Simulation TRIGGER_HOLD).
  private heldPress: { id: number; until: number } | null = null;
  private sprintBlocked = false;
  // The swap key time: the host starts the draw when that action arrives, as far ahead as every input.
  private swapTo: { slot: number; at: number } | null = null;

  reset() {
    this.nextShot = 0; this.weapon = null; this.slot = -1; this.sprintEndedAt = -Infinity; this.wasSprinting = false;
    this.ads = 0; this.heat = this.serverHeat = 0; this.lastPress = -1; this.seq = 0; this.identity = ''; this.heldPress = null;
    this.pending.length = 0; this.predicted.clear();
    for (const key of Object.keys(this.readyAt) as WeaponId[]) delete this.readyAt[key];
  }

  /** Authoritative state: the host's shot count and heat correct the prediction. */
  sync(actor: ActorState, now: number) {
    const identity = `${actor.id}:${actor.deaths}:${actor.alive}`;
    if (identity !== this.identity) { const seq = actor.shotSeq; this.reset(); this.identity = identity; this.seq = seq; }
    while (this.pending.length && (this.pending[0].seq <= actor.shotSeq || now - this.pending[0].at > UNCONFIRMED)) this.pending.shift();
    // Refused rounds leave the local count ahead of the host's: fall back to it.
    if (!this.pending.length) this.seq = Math.max(actor.shotSeq, Math.min(this.seq, actor.shotSeq));
    if (actor.shotHeat > this.serverHeat + .01) this.heat = actor.shotHeat;
    this.serverHeat = actor.shotHeat;
  }

  /** True once for a host shot event this client already showed. */
  consume(event: ShotEvent): boolean {
    if (event.seq === undefined || !this.predicted.has(event.seq)) return false;
    this.predicted.delete(event.seq);
    return true;
  }

  /** Per input tick: aim, heat, sprint and swap timers, and held automatic fire. */
  tick(actor: ActorState, input: InputFrame, now: number, simTime: number, match: string, world: WorldSpec, targets: Iterable<ActorState>): ShotEvent | null {
    const w = actor.weapons[actor.slot];
    if (!w) return null;
    if (actor.slot !== this.slot || w.id !== this.weapon) {
      // Mirrors Simulation.drawWeapon, timed from the swap key when this client pressed it.
      const from = this.swapTo?.slot === actor.slot && now - this.swapTo.at < .5 ? this.swapTo.at : now;
      if (this.weapon !== null) this.nextShot = Math.max(from + HANDLING[w.id].draw, this.readyAt[w.id] ?? 0);
      this.slot = actor.slot; this.weapon = w.id; this.heat = 0; this.ads = 0; this.swapTo = null;
    }
    if (this.wasSprinting && !actor.sprint) this.sprintEndedAt = now;
    this.wasSprinting = actor.sprint;
    this.heat = coolShotHeat(this.heat, TICK);
    this.ads = actor.swimming ? 0 : advanceAds(w.id, this.ads, input.ads && !actor.sprint && !(actor.reloadUntil > simTime) && w.id !== 'machete', TICK);
    const held = this.heldPress;
    if (held) {
      if (now >= held.until) this.heldPress = null;
      else {
        const shot = this.fire(actor, input.yaw, input.pitch, input.lean, now, simTime, match, world, targets, held.id);
        if (shot || !this.sprintBlocked) this.heldPress = null;
        if (shot) return shot;
      }
    }
    if (!input.fire || !WEAPONS[w.id].automatic) return null;
    return this.fire(actor, input.yaw, input.pitch, input.lean, now, simTime, match, world, targets, undefined);
  }

  /** The swap key was pressed: the draw the host applies starts now. */
  swap(slot: number, now: number) { this.swapTo = { slot, at: now }; }

  /** A trigger press, the moment the button goes down. */
  press(actor: ActorState, pressId: number, yaw: number, pitch: number, lean: number, now: number, simTime: number, match: string, world: WorldSpec, targets: Iterable<ActorState>): ShotEvent | null {
    const shot = this.fire(actor, yaw, pitch, lean, now, simTime, match, world, targets, pressId);
    if (!shot && this.sprintBlocked) this.heldPress = { id: pressId, until: now + .35 };
    return shot;
  }

  /** Quick melee (Simulation.quickMelee): one facão swing now, whatever is held. */
  melee(actor: ActorState, yaw: number, pitch: number, now: number, simTime: number, match: string, world: WorldSpec, targets: Iterable<ActorState>): ShotEvent | null {
    const facao = actor.weapons.findIndex(w => WEAPONS[w.id].melee);
    if (facao < 0 || actor.swimming || now + 1e-6 < (this.readyAt[actor.weapons[facao].id] ?? 0)) return null;
    this.nextShot = now;
    return this.fire({ ...actor, slot: facao, sprint: false }, yaw, pitch, 0, now, simTime, match, world, targets, undefined, true);
  }

  private fire(actor: ActorState, yaw: number, pitch: number, lean: number, now: number, simTime: number, match: string, world: WorldSpec, targets: Iterable<ActorState>, pressId: number | undefined, quick = false): ShotEvent | null {
    const w = actor.weapons[actor.slot], def = w && WEAPONS[w.id];
    this.sprintBlocked = false;
    if (!w || !def || !actor.alive || actor.stage !== 'ground' || actor.using || (actor.emote && actor.emoteUntil > simTime) || now + 1e-6 < this.nextShot || (actor.swimming && !swimReady(w.id))) return null;
    if (!def.automatic && pressId === undefined && !quick) return null;
    if (pressId !== undefined && pressId <= this.lastPress) return null;
    if (!def.melee && (actor.sprint || now + 1e-6 < this.sprintEndedAt + HANDLING[w.id].sprintOut)) { this.sprintBlocked = true; return null; }
    if (actor.reloadUntil > simTime && (w.id !== 'shotgun' || w.ammo === 0)) return null;
    const spent = this.pending.reduce((sum, shot) => sum + Number(shot.weapon === w.id), 0);
    if (!def.melee && w.ammo - spent <= 0) return null;
    const speed = Math.hypot(actor.velocity.x, actor.velocity.z);
    const spread = shotSpread(w.id, this.ads, speed, !actor.grounded && !actor.swimming, this.heat, actor.swimming, actor.crouch);
    if (!def.melee && !def.projectile) this.heat = Math.min(1.2, this.heat + shotHeatGain(w.id));
    if (pressId !== undefined) this.lastPress = pressId;
    const interval = 60 / def.rpm, held = now - this.nextShot < TICK * 1.5;
    this.nextShot = this.readyAt[w.id] = (held ? this.nextShot : now) + interval;
    const seq = ++this.seq;
    this.pending.push({ seq, at: now, weapon: w.id }); this.predicted.add(seq);
    if (this.predicted.size > 64) this.predicted.delete(this.predicted.values().next().value!);
    const aim = { ...actor, yaw, lean: actor.swimming ? 0 : lean };
    const origin = shotOrigin(aim);
    if (def.projectile) {
      const d = pelletDirection(w.id, match, actor.id, seq, 0, yaw, pitch, 0);
      return { type: 'shot', id: 0, actor: actor.id, weapon: w.id, origin, end: { x: origin.x + d.x * 2, y: origin.y + d.y * 2, z: origin.z + d.z * 2 }, hit: false, seq };
    }
    let hit = false, end: Vec3 | null = null, surface: ShotEvent['surface'], normal: Vec3 | undefined;
    for (let pellet = 0; pellet < (def.pellets || 1); pellet++) {
      const d = pelletDirection(w.id, match, actor.id, seq, pellet, yaw, pitch, spread);
      const wall = raycastWorld(origin, d, def.range, world);
      let best = wall?.distance ?? def.range, struck = false;
      for (const t of targets) {
        if (t.id === actor.id || !t.alive || sameTeam(actor, t) || t.stage !== 'ground') continue;
        const found = rayCapybara(origin, d, t.pos, t.crouch, t.yaw, best);
        if (found) { best = found.distance; struck = true; }
      }
      if (struck) { hit = true; end = { x: origin.x + d.x * best, y: origin.y + d.y * best, z: origin.z + d.z * best }; }
      else if (!hit) {
        const impact = resolveImpact(origin, d, wall, def.range);
        end = impact?.point ?? end ?? { x: origin.x + d.x * def.range, y: origin.y + d.y * def.range, z: origin.z + d.z * def.range };
        if (impact && !surface) { surface = impact.surface; normal = impact.normal; }
      }
    }
    return { type: 'shot', id: 0, actor: actor.id, weapon: w.id, origin, end: end!, hit, ...(!hit && surface ? { surface, normal } : {}), seq };
  }
}
