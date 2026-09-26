import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { actorEye, moveActor, SWIM_DRAFT, SWIM_SPEED } from '../src/shared/collision';
import { emptyInput } from '../src/shared/math';
import { walkableSegment } from '../src/shared/navigation';
import { terrainHeight } from '../src/shared/terrain';
import { WATER_LEVEL } from '../src/shared/water';
import { shotSpread } from '../src/shared/weapons';
import { createWorld } from '../src/shared/world';
import { fastPart, gearPart, rebuildFrame, worldPart } from '../src/network/codec';
import type { ActorState, InputFrame, RoomConfig, WorldSpec } from '../src/shared/types';

const world: WorldSpec = { version: 'swim-test', size: 260, colliders: [], objects: [], districts: [], loot: [], chests: [],
  spawns: [{ x: 0, y: terrainHeight(0, -20), z: -20, mode: 'both', yaw: 0 }] };
const config: RoomConfig = { mode: 'deathmatch', capacity: 2, bots: false, difficulty: 'normal', duration: 300 };
const profile = { id: 'capy', name: 'Capivara', color: '#e76f51', ready: true, connected: true };
function fixture() {
  const sim = new Simulation(world, config, [profile], 'a'.repeat(48), 42);
  for (let i = 0; i < 198; i++) sim.step(1 / 60);
  const runtime = (sim as any).actors.get(profile.id);
  return { sim, runtime, actor: runtime.state as ActorState };
}
function place(actor: ActorState, x: number, z: number, y = terrainHeight(x, z)) {
  actor.pos = { x, y, z }; actor.velocity = { x: 0, y: 0, z: 0 }; actor.grounded = true; actor.swimming = false;
}
function move(actor: ActorState, frame: Partial<InputFrame>, ticks: number, map = world) {
  for (let i = 0; i < ticks; i++) moveActor(actor, { ...emptyInput(), ...frame }, map, 1 / 60);
}

describe('capybaras swim with shared authoritative movement', () => {
  it('floats with the head above water and cannot jump, crouch, sprint, lean or aim underwater', () => {
    const { actor } = fixture();
    place(actor, -20, 8);
    move(actor, { sprint: true, ads: true, crouch: true, jump: true, lean: 1 }, 120);
    expect(actor.swimming).toBe(true);
    expect(actor.pos.y).toBeCloseTo(WATER_LEVEL - SWIM_DRAFT);
    expect(actor.pos.y + actorEye(actor)).toBeGreaterThan(WATER_LEVEL + .4);
    expect(actor.velocity.y).toBe(0);
    expect(actor.grounded || actor.sprint || actor.crouch || actor.ads).toBe(false);
    expect(actor.lean).toBe(0);
  });

  it('limits swim speed even while sprint and boost are requested', () => {
    const { actor } = fixture();
    place(actor, -20, 8);
    for (let i = 0; i < 180; i++) moveActor(actor, { ...emptyInput(), moveX: 1, sprint: true }, world, 1 / 60, 1.15);
    expect(actor.swimming).toBe(true);
    expect(Math.hypot(actor.velocity.x, actor.velocity.z)).toBeCloseTo(SWIM_SPEED, 3);
    expect(actor.pos.x).toBeGreaterThan(-14);
  });

  it('enters and leaves the real river through a visible open bank without a water wall', () => {
    const actual = createWorld(), { actor } = fixture();
    place(actor, -60, 2);
    move(actor, {}, 1, actual);
    expect(actor.swimming).toBe(true);
    move(actor, { moveZ: 1 }, 300, actual);
    expect(actor.pos.z).toBeLessThan(-8);
    expect(actor.swimming).toBe(false);
    expect(actor.grounded).toBe(true);
    actor.yaw = Math.PI;
    move(actor, { moveZ: 1 }, 300, actual);
    expect(actor.pos.z).toBeGreaterThan(-1);
  });

  it('supports dry decks and swimming underneath the same bridge', () => {
    const deck = { id: 'visible-deck', min: { x: -24, y: 1, z: 4 }, max: { x: -16, y: 1.3, z: 12 }, material: 'wood' as const };
    const bridge = { ...world, colliders: [deck], walkways: [deck] }, { actor } = fixture();
    place(actor, -20, 8, deck.max.y);
    move(actor, {}, 10, bridge);
    expect(actor.swimming).toBe(false); expect(actor.grounded).toBe(true);
    expect(actor.pos.y).toBe(deck.max.y);
    place(actor, -20, 8);
    move(actor, {}, 10, bridge);
    expect(actor.swimming).toBe(true);
    expect(actor.pos.y + 1.8).toBeLessThan(deck.min.y);
  });

  it('climbs visible low steps out of the water without needing to jump', () => {
    const steps = Array.from({ length: 10 }, (_, index) => ({ id: `step-${index}`, material: 'stone' as const,
      min: { x: -22, y: -1.2, z: 9 + index * .6 }, max: { x: -18, y: -.88 + index * .27, z: 9.6 + index * .6 } }));
    const { actor } = fixture();
    place(actor, -20, 8); actor.yaw = Math.PI;
    move(actor, { moveZ: 1 }, 200, { ...world, colliders: steps });
    expect(actor.pos.z).toBeGreaterThan(15);
    expect(actor.pos.y).toBeGreaterThan(1.5);
    expect(actor.swimming).toBe(false);
  });

  it('lets bot steering cross a river without resetting it at the shoreline', () => {
    const { sim, actor, runtime } = fixture();
    place(actor, -20, -1); actor.bot = true; runtime.brain = {};
    (sim as any).updateBot = (bot: any) => { bot.input = { ...emptyInput(), yaw: Math.PI, moveZ: 1 }; };
    let swam = false;
    for (let i = 0; i < 360; i++) { sim.step(1 / 60); swam ||= actor.swimming; }
    expect(swam).toBe(true);
    expect(actor.pos.z).toBeGreaterThan(14);
  });

  it('matches host and prediction through water entry, traversal and exit', () => {
    const { sim, actor } = fixture();
    place(actor, -20, 8);
    const predicted = structuredClone(actor);
    for (let seq = 1; seq <= 300; seq++) {
      const input = { ...emptyInput(), seq, clientTime: sim.snapshot().time, moveZ: 1, sprint: true, ads: seq < 30 };
      sim.input(profile.id, input);
      moveActor(predicted, input, world, 1 / 60, 1, config.mode);
      sim.step(1 / 60);
      expect(predicted.pos).toEqual(actor.pos);
      expect(predicted.velocity).toEqual(actor.velocity);
      expect(predicted.swimming).toBe(actor.swimming);
      expect(predicted.slot).toBe(actor.slot);
    }
    expect(actor.swimming).toBe(false);
  });

  it('selects an owned pistol, blocks a heavy-weapon switch and rejects forged ADS', () => {
    const { sim, actor, runtime } = fixture();
    place(actor, -20, 8);
    actor.reloadUntil = 20; runtime.adsAmount = 1; runtime.shotHeat = actor.shotHeat = .8;
    sim.step(1 / 60);
    expect(actor.weapons[actor.slot].id).toBe('pistol');
    expect(actor.reloadUntil).toBe(0); expect(runtime.adsAmount).toBe(0); expect(actor.shotHeat).toBe(0);
    sim.action(profile.id, { type: 'slot', id: 1, slot: 0 });
    expect(actor.weapons[actor.slot].id).toBe('pistol');
    sim.action(profile.id, { type: 'trigger', id: 2, yaw: 0, pitch: 0, lean: 1, ads: true, clientTime: sim.snapshot().time });
    sim.step(1 / 60);
    expect(actor.ads).toBe(false); expect(actor.lean).toBe(0); expect(runtime.adsAmount).toBe(0);
    expect(sim.drainEvents().filter(e => e.type === 'shot').map(e => e.type === 'shot' && e.weapon)).toEqual(['pistol']);
  });

  it('does not grant a pistol or fire a rifle when no pistol is owned', () => {
    const { sim, actor } = fixture();
    actor.weapons = [actor.weapons[0]]; place(actor, -20, 8);
    sim.step(1 / 60);
    const ammo = actor.weapons[0].ammo;
    sim.action(profile.id, { type: 'trigger', id: 1, yaw: 0, pitch: 0, lean: 0, ads: true, clientTime: sim.snapshot().time });
    sim.step(1 / 60);
    expect(actor.weapons).toHaveLength(1); expect(actor.weapons[0].ammo).toBe(ammo);
    expect(sim.drainEvents().some(e => e.type === 'shot')).toBe(false);
  });

  it('widens pistol spread while swimming even with an ADS claim', () => {
    expect(shotSpread('pistol', 1, 0, false, 0, true)).toBeGreaterThan(shotSpread('pistol', 0, 0, false, 0));
    expect(shotSpread('pistol', 1, 0, false, 0, true)).toBe(shotSpread('pistol', 0, 0, false, 0, true));
  });

  it('emits one entry and exit per transition and replicates swimming and drip time', () => {
    const { sim, actor } = fixture();
    place(actor, -20, 8);
    for (let i = 0; i < 60; i++) sim.step(1 / 60);
    let events = sim.drainEvents().filter(e => e.type === 'water');
    expect(events).toHaveLength(1); expect(events[0]).toMatchObject({ entering: true, pos: { y: WATER_LEVEL } });
    let snapshot = sim.snapshot();
    expect(rebuildFrame(fastPart(snapshot), worldPart(snapshot), gearPart(snapshot))?.actors[0].swimming).toBe(true);
    actor.pos = { x: 0, y: terrainHeight(0, -20), z: -20 };
    sim.step(1 / 60);
    events = sim.drainEvents().filter(e => e.type === 'water');
    expect(events).toHaveLength(1); expect(events[0]).toMatchObject({ entering: false });
    snapshot = sim.snapshot();
    const restored = rebuildFrame(fastPart(snapshot), worldPart(snapshot), gearPart(snapshot))!.actors[0];
    expect(restored.swimming).toBe(false); expect(restored.wetUntil).toBeGreaterThan(snapshot.time + 2.9);
  });

  it('allows river navigation and gently pushes swimmers back from the deep ocean', () => {
    expect(walkableSegment(world, { x: -20, z: 7 }, { x: -12, z: 8 })).toBe(true);
    const { actor } = fixture();
    place(actor, 140, -70);
    const start = actor.pos.x;
    for (let i = 0; i < 120; i++) moveActor(actor, { ...emptyInput(), moveX: 1, sprint: true }, world, 1 / 60, 1, 'battle-royale');
    expect(actor.swimming).toBe(true); expect(actor.pos.x).toBeLessThan(start - 3);
  });

  it('turns an aerial water landing into swimming without fall damage', () => {
    const { sim, actor } = fixture();
    place(actor, -20, 8, -.7); actor.stage = 'falling'; actor.grounded = false; actor.velocity.y = -35;
    sim.step(1 / 60);
    expect(actor.stage).toBe('ground'); expect(actor.swimming).toBe(true);
    expect(actor.hp).toBe(100);
    expect(sim.drainEvents().filter(e => e.type === 'water')).toHaveLength(1);
  });
});
