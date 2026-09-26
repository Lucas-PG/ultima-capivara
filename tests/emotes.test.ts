import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { EMOTES, EMOTE_IDS } from '../src/shared/emotes';
import { emptyInput } from '../src/shared/math';
import { actorHeight, moveActor } from '../src/shared/collision';
import { terrainHeight } from '../src/shared/terrain';
import { fastPart, gearPart, rebuildFrame, worldPart } from '../src/network/codec';
import { validAction } from '../src/network/session';
import type { ActorState, InputFrame, PlayerAction, WorldSpec } from '../src/shared/types';

const world: WorldSpec = { version: 'emote-test', size: 260, colliders: [], objects: [], districts: [], loot: [], chests: [],
  spawns: [{ x: 0, y: terrainHeight(0, -20), z: -20, mode: 'both', yaw: 0 }] };
const profile = { id: 'capy', name: 'Capivara', color: '#e76f51', ready: true, connected: true };
function fixture() {
  const sim = new Simulation(world, { mode: 'deathmatch', capacity: 2, bots: false, difficulty: 'normal', duration: 300 }, [profile], 'a'.repeat(48), 42);
  for (let i = 0; i < 198; i++) sim.step(1 / 60);
  const runtime = (sim as any).actors.get(profile.id);
  return { sim, runtime, actor: runtime.state as ActorState };
}
function advance(sim: Simulation, ticks: number) { for (let i = 0; i < ticks; i++) sim.step(1 / 60); }

describe('host-authoritative emotes', () => {
  it.each(EMOTE_IDS)('synchronizes %s for its authored duration, then ends it', emote => {
    const { sim, actor } = fixture(), pos = { ...actor.pos };
    sim.action(profile.id, { type: 'emote', id: 1, emote });
    expect(actor.emote).toBe(emote);
    expect(actor.emoteUntil).toBeCloseTo(sim.snapshot().time + EMOTES[emote].duration);
    const snapshot = sim.snapshot();
    const remote = rebuildFrame(fastPart(snapshot), worldPart(snapshot), gearPart(snapshot))!.actors[0];
    expect(remote.emote).toBe(emote); expect(remote.emoteUntil).toBeCloseTo(actor.emoteUntil, 2);
    advance(sim, Math.floor(EMOTES[emote].duration * 60) - 2);
    expect(actor.emote).toBe(emote); expect(actor.pos).toEqual(pos);
    advance(sim, 4);
    expect(actor.emote).toBeNull(); expect(actor.emoteUntil).toBe(0);
  });

  it.each([
    { moveX: 1 }, { moveZ: -1 }, { jump: true }, { crouch: true }, { sprint: true },
    { fire: true }, { ads: true }, { lean: 1 }, { yaw: .1 }, { pitch: .1 },
  ] satisfies Partial<InputFrame>[])('cancels on deliberate input %j', input => {
    const { sim, actor } = fixture();
    sim.action(profile.id, { type: 'emote', id: 1, emote: 'dance' });
    sim.input(profile.id, { ...emptyInput(), ...input, seq: 1, clientTime: sim.snapshot().time });
    sim.step(1 / 60);
    expect(actor.emote).toBeNull();
  });

  it('uses the same movement cancellation and seated collision height in prediction', () => {
    const { sim, actor } = fixture();
    sim.action(profile.id, { type: 'emote', id: 1, emote: 'sit' });
    sim.step(1 / 60);
    expect(actor.crouch).toBe(true); expect(actorHeight(actor)).toBe(1.3);
    const predicted = structuredClone(actor), frame = { ...emptyInput(), moveX: 1, seq: 1, clientTime: sim.snapshot().time };
    sim.input(profile.id, frame); moveActor(predicted, frame, world, 1 / 60, 1, 'deathmatch'); sim.step(1 / 60);
    expect(predicted.pos).toEqual(actor.pos); expect(predicted.emote).toBeNull();
    expect(actor.crouch).toBe(false); expect(actorHeight(actor)).toBe(1.8);
  });

  it('keeps a stationary pose facing its chosen direction during an input gap', () => {
    const { sim, actor } = fixture();
    actor.yaw = 1.2; actor.pitch = -.3;
    sim.action(profile.id, { type: 'emote', id: 1, emote: 'chill' });
    advance(sim, 120);
    expect(actor.emote).toBe('chill');
    expect(actor.yaw).toBe(1.2); expect(actor.pitch).toBe(-.3);
  });

  it('identifies a deliberate restart by its deadline but ignores a duplicate action', () => {
    const { sim, actor } = fixture();
    sim.action(profile.id, { type: 'emote', id: 1, emote: 'wave' });
    const first = actor.emoteUntil;
    advance(sim, 30);
    sim.action(profile.id, { type: 'emote', id: 1, emote: 'wave' });
    expect(actor.emoteUntil).toBe(first);
    sim.action(profile.id, { type: 'emote', id: 2, emote: 'wave' });
    expect(actor.emoteUntil).toBeGreaterThan(first);
    expect(actor.emote).toBe('wave');
  });

  it('lets a reliable trigger cancel the pose and fire without losing the click', () => {
    const { sim, actor } = fixture(), ammo = actor.weapons[0].ammo;
    sim.action(profile.id, { type: 'emote', id: 1, emote: 'wave' });
    sim.action(profile.id, { type: 'trigger', id: 2, yaw: 0, pitch: 0, lean: 0, ads: false, clientTime: sim.snapshot().time });
    sim.step(1 / 60);
    expect(actor.emote).toBeNull(); expect(actor.weapons[0].ammo).toBe(ammo - 1);
    expect(sim.drainEvents().filter(e => e.type === 'shot')).toHaveLength(1);
  });

  it('cancels on harm, explicit cancellation, disconnect and death without adding protection', () => {
    const { sim, actor, runtime } = fixture();
    actor.protectionUntil = 0;
    sim.action(profile.id, { type: 'emote', id: 1, emote: 'chill' });
    expect(actor.protectionUntil).toBe(0);
    (sim as any).damage(runtime, 10, null, 'pistol', false);
    expect(actor.hp).toBe(90); expect(actor.emote).toBeNull();
    sim.action(profile.id, { type: 'emote', id: 2, emote: 'dance' });
    sim.action(profile.id, { type: 'emote', id: 3, emote: null });
    expect(actor.emote).toBeNull();
    sim.action(profile.id, { type: 'emote', id: 4, emote: 'wave' });
    sim.player(profile, 'disconnect'); expect(actor.emote).toBeNull();
    sim.player(profile, 'reconnect');
    sim.action(profile.id, { type: 'emote', id: 1, emote: 'wave' });
    (sim as any).damage(runtime, 100, null, 'pistol', false);
    expect(actor.alive).toBe(false); expect(actor.emote).toBeNull();
    advance(sim, 181);
    expect(actor.alive).toBe(true); expect(actor.emote).toBeNull(); expect(actor.emoteUntil).toBe(0);
  });

  it('rejects invalid IDs and cannot activate while airborne, swimming, reloading or using an item', () => {
    const { sim, actor } = fixture();
    for (const emote of ['teleport', '__proto__', 4, {}, undefined]) {
      const action = { type: 'emote', id: 1, emote };
      expect(validAction(action)).toBe(false);
      sim.action(profile.id, action as PlayerAction);
      expect(actor.emote).toBeNull();
    }
    let id = 1;
    for (const patch of [{ grounded: false }, { swimming: true }, { reloadUntil: 20 }, { using: 'bandage' as const }]) {
      Object.assign(actor, { grounded: true, swimming: false, reloadUntil: 0, using: null }, patch);
      sim.action(profile.id, { type: 'emote', id: id++, emote: 'sit' });
      expect(actor.emote).toBeNull();
    }
    Object.assign(actor, { grounded: true, swimming: false, reloadUntil: 0, using: null });
    sim.action(profile.id, { type: 'emote', id: id++, emote: 'sit' });
    expect(actor.emote).toBe('sit');
    expect(validAction({ type: 'emote', id, emote: null })).toBe(true);
  });
});
