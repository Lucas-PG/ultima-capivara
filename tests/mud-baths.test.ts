import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { moveActor } from '../src/shared/collision';
import { closestInteraction } from '../src/shared/interaction';
import { emptyInput } from '../src/shared/math';
import { MUD_HEAL_PER_SECOND, MUD_HURT_COOLDOWN, mudBathAt } from '../src/shared/recreation';
import { terrainHeight } from '../src/shared/terrain';
import { createWorld } from '../src/shared/world';
import { fastPart, gearPart, rebuildFrame, worldPart } from '../src/network/codec';
import type { ActorState, EmoteId, WorldSpec } from '../src/shared/types';

const base = terrainHeight(0, -20), bath = { id: 'bath', x: 0, y: base + .12, z: -20, radius: 1.45 };
const world: WorldSpec = { version: 'bath-test', size: 260, objects: [], districts: [], loot: [], chests: [],
  mudBaths: [bath], spawns: [{ ...bath, yaw: 0, mode: 'both' }],
  colliders: [{ id: 'bath-surface', min: { x: -1, y: base, z: -21 }, max: { x: 1, y: bath.y, z: -19 }, material: 'earth' }] };
function advance(sim: Simulation, ticks: number) { for (let n = 0; n < ticks; n++) sim.step(1 / 60); }
function fixture(mode: 'deathmatch' | 'corrente' = 'deathmatch') {
  const sim = new Simulation(world, { mode, capacity: 2, bots: false, difficulty: 'normal', duration: 300 },
    [{ id: 'a', name: 'Capivara', color: '#e76f51', ready: true, connected: true }], 'a'.repeat(48), 12);
  advance(sim, 200);
  const runtime = (sim as any).actors.get('a'), actor = runtime.state as ActorState;
  actor.hp = 50; actor.protectionUntil = 0;
  return { sim, runtime, actor };
}

describe('mud-bath risk and reward', () => {
  it('heals on each real generated bath surface without moving the seated actor', () => {
    const island = createWorld();
    expect(island.mudBaths).toHaveLength(3);
    for (const site of island.mudBaths!) {
      const sim = new Simulation(island, { mode: 'battle-royale', capacity: 2, bots: false, difficulty: 'normal', duration: 300 },
        ['a', 'b'].map(id => ({ id, name: id, color: '#e76f51', ready: true, connected: true })), 'a'.repeat(48), 12);
      advance(sim, 200);
      const actor = (sim as any).actors.get('a').state as ActorState;
      actor.pos = { x: site.x, y: site.y, z: site.z }; actor.velocity = { x: 0, y: 0, z: 0 };
      actor.stage = 'ground'; actor.grounded = true; actor.hp = 50;
      sim.action('a', { type: 'interact', id: 1, target: site.id });
      advance(sim, 60);
      expect(actor.emote).toBe('chill'); expect(actor.soaking).toBe(true);
      expect(actor.hp).toBeCloseTo(54);
      expect(actor.pos).toMatchObject({ x: site.x, z: site.z });
      expect(actor.pos.y).toBeCloseTo(site.y, 8);
    }
  });

  it.each(['sit', 'chill'] satisfies EmoteId[])('heals slowly while %s stays on the authored surface', emote => {
    const { sim, actor } = fixture();
    sim.action('a', { type: 'emote', id: 1, emote });
    advance(sim, 120);
    expect(actor.hp).toBeCloseTo(50 + MUD_HEAL_PER_SECOND * 2);
    expect(actor.soaking).toBe(true);
    expect(actor.pos).toEqual({ x: bath.x, y: bath.y, z: bath.z });
    const s = sim.snapshot(), remote = rebuildFrame(fastPart(s), worldPart(s), gearPart(s));
    expect(remote?.actors[0].soaking).toBe(true);
    expect(remote?.actors[0].hp).toBeCloseTo(actor.hp, 2);
  });

  it.each(['deathmatch', 'corrente'] as const)('offers a seated interaction in %s and caps healing at full health', mode => {
    const { sim, actor } = fixture(mode);
    const interaction = closestInteraction(world, sim.snapshot(), actor, { id: '', name: '' });
    expect(interaction).toEqual({ id: bath.id, name: 'Sentar no banho de lama' });
    sim.action('a', { type: 'interact', id: 1, target: interaction!.id });
    expect(actor.emote).toBe('chill'); actor.hp = 99;
    advance(sim, 60);
    expect(actor.hp).toBe(100); expect(actor.soaking).toBe(true);
    expect(closestInteraction(world, sim.snapshot(), actor, { id: '', name: '' })).toBeNull();
  });

  it('stops immediately on a hit and prevents quick reseating from bypassing the harm cooldown', () => {
    const { sim, actor, runtime } = fixture();
    sim.action('a', { type: 'emote', id: 1, emote: 'sit' }); advance(sim, 60);
    (sim as any).damage(runtime, 10, null, 'pistol', false);
    const injured = actor.hp;
    expect(actor.soaking).toBe(false); expect(actor.emote).toBeNull();
    sim.action('a', { type: 'emote', id: 2, emote: 'chill' });
    advance(sim, MUD_HURT_COOLDOWN * 60 - 2);
    expect(actor.hp).toBe(injured); expect(actor.soaking).toBe(false);
    advance(sim, 10);
    expect(actor.hp).toBeGreaterThan(injured); expect(actor.soaking).toBe(true);
  });

  it('cannot heal by standing, dancing, sitting nearby, sitting on a roof or forging a remote interaction', () => {
    const { sim, actor } = fixture();
    advance(sim, 60); expect(actor.hp).toBe(50);
    sim.action('a', { type: 'emote', id: 1, emote: 'dance' }); advance(sim, 60);
    expect(actor.hp).toBe(50); expect(actor.soaking).toBe(false);
    actor.pos.x = 3;
    sim.action('a', { type: 'interact', id: 2, target: bath.id });
    expect(actor.emote).toBeNull();
    sim.action('a', { type: 'emote', id: 3, emote: 'sit' }); advance(sim, 20);
    expect(actor.hp).toBe(50); expect(actor.soaking).toBe(false);
    expect(mudBathAt({ ...bath, y: bath.y + 2 }, world)).toBeNull();
    expect(mudBathAt({ ...bath, y: bath.y + .3 }, world)).toBeNull();
    expect(mudBathAt({ ...bath, x: bath.radius + .01 }, world)).toBeNull();
  });

  it('shared movement clears soaking on exit without applying client-side healing', () => {
    const { sim, actor } = fixture();
    sim.action('a', { type: 'emote', id: 1, emote: 'chill' }); advance(sim, 1);
    const predicted = structuredClone(actor), hp = predicted.hp;
    moveActor(predicted, { ...emptyInput(), moveX: 1 }, world, 1 / 60);
    expect(predicted.soaking).toBe(false); expect(predicted.emote).toBeNull(); expect(predicted.hp).toBe(hp);
  });

  it('expiry and death stop healing, and respawn does not revive the bathing state', () => {
    const { sim, actor, runtime } = fixture();
    sim.action('a', { type: 'emote', id: 1, emote: 'chill' }); advance(sim, 721);
    expect(actor.soaking).toBe(false); expect(actor.emote).toBeNull();
    const after = actor.hp; advance(sim, 60); expect(actor.hp).toBe(after);
    sim.action('a', { type: 'emote', id: 2, emote: 'sit' }); advance(sim, 1);
    (sim as any).damage(runtime, 1000, null, 'pistol', false);
    expect(actor.alive).toBe(false); expect(actor.soaking).toBe(false);
    advance(sim, 181);
    expect(actor.alive).toBe(true); expect(actor.soaking).toBe(false); expect(actor.emote).toBeNull();
  });
});
