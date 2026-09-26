import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { moveActor, TRAMPOLINE_IMPULSE } from '../src/shared/collision';
import { emptyInput } from '../src/shared/math';
import { terrainHeight } from '../src/shared/terrain';
import { createWorld } from '../src/shared/world';
import { WATER_LEVEL } from '../src/shared/water';
import { fastPart, gearPart, rebuildFrame, worldPart } from '../src/network/codec';
import type { ActorState, WorldSpec } from '../src/shared/types';

const base = terrainHeight(0, -20), pad = { id: 'pad', x: 0, y: base + .32, z: -20, radius: 1.38, impulse: TRAMPOLINE_IMPULSE };
const world: WorldSpec = { version: 'bounce-test', size: 260, objects: [], districts: [], loot: [], chests: [],
  trampolines: [pad], spawns: [{ x: 4, y: base, z: -20, yaw: 0, mode: 'both' }],
  colliders: [{ id: 'pad-surface', min: { x: -.95, y: base, z: -20.95 }, max: { x: .95, y: pad.y, z: -19.05 }, material: 'wood' }] };
function advance(sim: Simulation, ticks: number) { for (let n = 0; n < ticks; n++) sim.step(1 / 60); }
function fixture() {
  const sim = new Simulation(world, { mode: 'deathmatch', capacity: 2, bots: false, difficulty: 'normal', duration: 300 },
    [{ id: 'a', name: 'Capivara', color: '#e76f51', ready: true, connected: true }], 'a'.repeat(48), 12);
  advance(sim, 200);
  const runtime = (sim as any).actors.get('a'), actor = runtime.state as ActorState;
  actor.protectionUntil = 0;
  actor.pos = { x: pad.x, y: pad.y, z: pad.z };
  return { sim, runtime, actor };
}

describe('capybara trampoline contact', () => {
  it('matches host and prediction above all three real pads without hidden overhead collisions', () => {
    const island = createWorld();
    expect(island.trampolines).toHaveLength(3);
    for (const site of island.trampolines!) {
      const sim = new Simulation(island, { mode: 'battle-royale', capacity: 2, bots: false, difficulty: 'normal', duration: 300 },
        ['a', 'b'].map(id => ({ id, name: id, color: '#e76f51', ready: true, connected: true })), 'a'.repeat(48), 12);
      advance(sim, 200);
      const actor = (sim as any).actors.get('a').state as ActorState;
      actor.pos = { x: site.x, y: site.y, z: site.z }; actor.velocity = { x: 0, y: 0, z: 0 };
      actor.stage = 'ground'; actor.grounded = true;
      const predicted = structuredClone(actor), frame = { ...emptyInput(), seq: 1, clientTime: sim.snapshot().time };
      sim.input('a', frame);
      for (let i = 0; i < 30; i++) { sim.step(1 / 60); moveActor(predicted, frame, island, 1 / 60, 1, 'battle-royale'); }
      expect(actor.pos).toEqual(predicted.pos); expect(actor.velocity).toEqual(predicted.velocity);
      expect(actor.pos.y).toBeGreaterThan(site.y + 3);
      expect(actor.bounceProtected).toBe(true); expect(actor.bounceSeq).toBe(1);
      expect(sim.drainEvents().filter(event => event.type === 'bounce')).toHaveLength(1);
    }
  });

  it('launches on visible contact, including jump presses, with the same host and predicted arc', () => {
    const { sim, actor } = fixture();
    const frame = { ...emptyInput(), jump: true, seq: 1, clientTime: sim.snapshot().time }, predicted = structuredClone(actor);
    sim.input('a', frame); moveActor(predicted, frame, world, 1 / 60, 1, 'deathmatch'); sim.step(1 / 60);
    expect(actor.pos).toEqual(predicted.pos); expect(actor.velocity).toEqual(predicted.velocity);
    expect(actor.velocity.y).toBeCloseTo(TRAMPOLINE_IMPULSE - 22 / 60);
    expect(actor.grounded).toBe(false); expect(actor.bounceProtected).toBe(true); expect(actor.bounceSeq).toBe(1);
    const s = sim.snapshot(), remote = rebuildFrame(fastPart(s), worldPart(s), gearPart(s))!.actors[0];
    expect(remote.bounceProtected).toBe(true); expect(remote.bounceSeq).toBe(1);
    expect(sim.drainEvents().filter(e => e.type === 'bounce')).toHaveLength(1);
  });

  it('does not repeatedly launch in midair and bounces again on the next landing', () => {
    const { sim, actor } = fixture();
    advance(sim, 1); const launched = actor.pos.y;
    advance(sim, 30);
    expect(actor.pos.y).toBeGreaterThan(launched + 2.5); expect(actor.bounceSeq).toBe(1);
    for (let n = 0; n < 100 && actor.bounceSeq === 1; n++) advance(sim, 1);
    expect(actor.bounceSeq).toBe(2); expect(actor.velocity.y).toBeGreaterThan(10);
    expect(sim.drainEvents().filter(e => e.type === 'bounce')).toHaveLength(2);
  });

  it('has no invisible launch volume above, beside or beneath the rendered contact', () => {
    const { actor } = fixture();
    for (const pos of [{ ...pad, x: pad.radius + .4 }, { ...pad, y: pad.y + 2 }, { ...pad, y: pad.y - 1 }]) {
      const copy = structuredClone(actor); copy.pos = pos;
      moveActor(copy, emptyInput(), world, 1 / 60);
      expect(copy.bounceSeq).toBe(0); expect(copy.bounceProtected).toBe(false);
    }
  });

  it('cushions an initial aerial landing, but does not remove ordinary fall damage elsewhere', () => {
    const { sim, actor, runtime } = fixture();
    actor.stage = 'parachute'; actor.grounded = false; actor.pos.y = pad.y + .1; actor.velocity.y = -30;
    sim.step(1 / 60);
    expect(actor.hp).toBe(100); expect(actor.bounceSeq).toBe(1); expect(actor.velocity.y).toBe(TRAMPOLINE_IMPULSE);
    actor.pos = { x: 5, y: terrainHeight(5, -20) + .1, z: -20 }; actor.velocity.y = -30;
    actor.stage = 'parachute'; actor.grounded = false; actor.bounceProtected = false; runtime.nextShot = 0;
    sim.step(1 / 60);
    expect(actor.hp).toBeLessThan(100); expect(actor.bounceProtected).toBe(false);
  });

  it('protects only falling during the bounce and clears protection on dry landing or water', () => {
    const { sim, actor, runtime } = fixture();
    advance(sim, 1);
    (sim as any).damage(runtime, 20, null, 'fall', false); expect(actor.hp).toBe(100);
    (sim as any).damage(runtime, 20, null, 'pistol', false); expect(actor.hp).toBe(80);
    actor.pos.x = 5;
    for (let n = 0; n < 150 && !actor.grounded; n++) advance(sim, 1);
    expect(actor.grounded).toBe(true); expect(actor.bounceProtected).toBe(false);
    (sim as any).damage(runtime, 10, null, 'fall', false); expect(actor.hp).toBe(70);
    actor.bounceProtected = true; actor.pos = { x: -60, y: WATER_LEVEL - 1.1, z: 2 }; actor.grounded = false;
    sim.step(1 / 60);
    expect(actor.swimming).toBe(true); expect(actor.bounceProtected).toBe(false);
  });

  it('cancels emotes at launch and clears immunity through death and respawn', () => {
    const { sim, actor, runtime } = fixture();
    sim.action('a', { type: 'emote', id: 1, emote: 'sit' }); advance(sim, 1);
    expect(actor.emote).toBeNull(); expect(actor.bounceProtected).toBe(true);
    (sim as any).damage(runtime, 1000, null, 'pistol', false);
    expect(actor.alive).toBe(false); expect(actor.bounceProtected).toBe(false);
    advance(sim, 181);
    expect(actor.alive).toBe(true); expect(actor.bounceProtected).toBe(false);
    expect(actor.bounceSeq).toBe(1);
  });
});
