import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { CORRENTE_LADDER, WEAPONS } from '../src/shared/weapons';
import { terrainHeight } from '../src/shared/terrain';
import { boundaryFeedback } from '../src/shared/bounds';
import { ARENA, inArena } from '../src/shared/layout';
import { closestInteraction } from '../src/shared/interaction';
import { fastPart, gearPart, rebuildFrame, worldPart } from '../src/network/codec';
import { validConfig } from '../src/network/session';
import type { ActorState, PlayerProfile, RoomConfig, WeaponId, WorldSpec } from '../src/shared/types';

const config: RoomConfig = { mode: 'corrente', capacity: 2, bots: false, difficulty: 'normal', duration: 300 };
const profiles: PlayerProfile[] = ['a', 'b'].map(id => ({ id, name: id, color: '#e76f51', connected: true, ready: true }));
const point = (x: number, z: number) => ({ x, y: terrainHeight(x, z), z });
const world: WorldSpec = { version: 'corrente-test', size: 260, colliders: [], objects: [], districts: [],
  spawns: [-25, -5, 20, 40].map(x => ({ ...point(x, -20), yaw: 0, mode: 'deathmatch' })),
  loot: [{ id: 'free-sniper', kind: 'weapon', weapon: 'sniper', ...point(-25, -20) }],
  chests: [{ id: 'chest', ...point(-25, -20) }] };

function advance(sim: Simulation, ticks: number) { for (let n = 0; n < ticks; n++) sim.step(1 / 60); }
function fixture(bots = false) {
  const sim = new Simulation(world, { ...config, bots }, profiles, 'a'.repeat(48), 40);
  advance(sim, 200);
  const runtime = sim as any;
  const a = runtime.actors.get('a'), b = runtime.actors.get('b');
  a.state.protectionUntil = b.state.protectionUntil = 0;
  return { sim, runtime, a, b, actor: a.state as ActorState };
}
function eliminate(runtime: any, victim: any, attacker: any, weapon: WeaponId | 'storm' | 'fall') {
  victim.state.alive = true; victim.state.hp = 100; victim.state.protectionUntil = 0;
  runtime.damage(victim, 1000, attacker?.state.id ?? null, weapon, false);
}

describe('Corrente race to the facão', () => {
  it('starts everyone on equal pistols, inside the shared arena, with pickups disabled', () => {
    const { sim, runtime, actor } = fixture(true), snapshot = sim.snapshot();
    expect(snapshot.actors).toHaveLength(8);
    expect(snapshot.actors.every(a => a.weaponLevel === 0 && a.stage === 'ground' && inArena(a.pos.x, a.pos.z))).toBe(true);
    expect(snapshot.actors.every(a => a.weapons.length === 1 && a.weapons[0].id === 'pistol' && a.weapons[0].rarity === 0)).toBe(true);
    expect(snapshot.loot.every(item => !item.active)).toBe(true);
    expect(snapshot.openedChests).toEqual(['chest']);
    actor.pos = point(-25, -20);
    sim.action('a', { type: 'interact', id: 1, target: 'free-sniper' });
    expect(actor.weapons[0].id).toBe('pistol');
    expect(closestInteraction(world, snapshot, actor, { id: '', name: '' })).toBeNull();
    expect(runtime.findLoot(actor)).toBeNull();
    const edge = { x: ARENA.maxX + 2, z: 0 };
    expect(boundaryFeedback(edge, world, 'corrente')).toEqual(boundaryFeedback(edge, world, 'deathmatch'));
  });

  it('advances one stage per elimination with fresh ammo, then requires the final facão', () => {
    const { sim, runtime, a, b, actor } = fixture();
    for (let level = 1; level < CORRENTE_LADDER.length; level++) {
      actor.reloadUntil = 100; actor.shotHeat = a.shotHeat = 1; a.adsAmount = 1;
      eliminate(runtime, b, a, CORRENTE_LADDER[level - 1]);
      expect(actor.weaponLevel).toBe(level);
      expect(actor.weapons).toHaveLength(1);
      expect(actor.weapons[0].id).toBe(CORRENTE_LADDER[level]);
      expect(actor.weapons[0].ammo).toBe(WEAPONS[CORRENTE_LADDER[level]].magazine);
      expect(actor.reloadUntil).toBe(0); expect(actor.shotHeat).toBe(0); expect(a.adsAmount).toBe(0);
      expect(sim.snapshot().remaining).toBe(8 - level);
      expect(sim.snapshot().phase).toBe('playing');
    }
    // A stone already in flight may earn another elimination, but cannot finish the race.
    eliminate(runtime, b, a, 'slingshot');
    advance(sim, 1);
    expect(sim.snapshot().phase).toBe('playing'); expect(actor.weaponLevel).toBe(7);
    eliminate(runtime, b, a, 'machete'); advance(sim, 1);
    const result = sim.snapshot();
    expect(result.phase).toBe('results'); expect(result.remaining).toBe(0);
    expect(result.results.filter(r => r.winner).map(r => r.id)).toEqual(['a']);
    expect(sim.drainEvents().filter(e => e.type === 'upgrade')).toHaveLength(7);
  });

  it('retains progression and refreshes the current gun after a normal death and respawn', () => {
    const { sim, runtime, a, b, actor } = fixture();
    eliminate(runtime, b, a, 'pistol');
    eliminate(runtime, b, a, 'smg');
    actor.weapons[0].ammo = 1;
    eliminate(runtime, a, b, 'pistol');
    expect(actor.alive).toBe(false); expect(actor.weaponLevel).toBe(2);
    advance(sim, 181);
    expect(actor.alive).toBe(true); expect(actor.weaponLevel).toBe(2);
    expect(actor.weapons[0]).toMatchObject({ id: 'm4', ammo: WEAPONS.m4.magazine });
    expect(inArena(actor.pos.x, actor.pos.z)).toBe(true);
  });

  it('ignores environmental and self eliminations and never wins by the Correria clock', () => {
    const { sim, runtime, a, b, actor } = fixture();
    eliminate(runtime, b, null, 'fall');
    eliminate(runtime, b, null, 'storm');
    eliminate(runtime, a, a, 'pistol');
    expect(actor.weaponLevel).toBe(0); expect(actor.kills).toBe(0);
    runtime.time = config.duration + 10; advance(sim, 1);
    expect(sim.snapshot().phase).toBe('playing');
    expect(sim.snapshot().remaining).toBe(8);
  });

  it('gives human reloads renewable reserves without changing the weapon stage', () => {
    const { sim, actor } = fixture();
    actor.weapons[0].ammo = actor.weapons[0].reserve = 0;
    sim.action('a', { type: 'reload', id: 1 });
    expect(actor.reloadUntil).toBeGreaterThan(sim.snapshot().time);
    advance(sim, 110);
    expect(actor.weapons[0].ammo).toBe(WEAPONS.pistol.magazine);
    expect(actor.weapons[0].reserve).toBeGreaterThan(0);
    expect(actor.weaponLevel).toBe(0);
  });

  it('synchronizes the selected mode and every ladder level with its matching gun', () => {
    const { sim, runtime, a, b } = fixture();
    expect(validConfig(config)).toBe(true);
    for (let level = 0; level < CORRENTE_LADDER.length; level++) {
      if (level) eliminate(runtime, b, a, CORRENTE_LADDER[level - 1]);
      const s = sim.snapshot(), guest = rebuildFrame(fastPart(s), worldPart(s), gearPart(s));
      expect(guest?.config.mode).toBe('corrente');
      expect(guest?.actors[0].weaponLevel).toBe(level);
      expect(guest?.actors[0].weapons[0].id).toBe(CORRENTE_LADDER[level]);
    }
  });

  it('awards a real pistol hit and a real final melee hit, including the winning hit stats', () => {
    const { sim, runtime, a, b, actor } = fixture();
    actor.pos = point(0, -20); actor.yaw = actor.pitch = 0;
    b.state.pos = { ...actor.pos, z: actor.pos.z - 1.5 }; b.state.hp = 1; b.history = [];
    sim.action('a', { type: 'trigger', id: 1, yaw: 0, pitch: 0, lean: 0, ads: false, clientTime: sim.snapshot().time });
    advance(sim, 1);
    expect(actor.weaponLevel).toBe(1);
    for (let level = 2; level < CORRENTE_LADDER.length; level++) eliminate(runtime, b, a, CORRENTE_LADDER[level - 1]);
    advance(sim, 15);
    b.state.alive = true; b.state.hp = 1; b.state.protectionUntil = 0;
    b.state.pos = { ...actor.pos, z: actor.pos.z - 1.5 }; b.history = [];
    sim.action('a', { type: 'trigger', id: 2, yaw: 0, pitch: 0, lean: 0, ads: false, clientTime: sim.snapshot().time });
    advance(sim, 1);
    expect(sim.snapshot().phase).toBe('results');
    expect(sim.snapshot().results.find(r => r.id === 'a')).toMatchObject({ winner: true, shots: 2, hits: 2 });
  });

  it('lets a bot progress, respawn with its stage and finish through its normal combat loop', () => {
    const { sim, runtime, a, b } = fixture(true), bot = runtime.actors.get('bot-2');
    for (const other of runtime.actors.values()) if (other !== bot && other !== a) { other.state.alive = false; other.state.respawnAt = 0; }
    for (let level = 1; level < CORRENTE_LADDER.length; level++) eliminate(runtime, b, bot, CORRENTE_LADDER[level - 1]);
    b.state.alive = false; b.state.respawnAt = 0;
    eliminate(runtime, bot, a, 'pistol'); advance(sim, 181);
    expect(bot.state.weaponLevel).toBe(7); expect(bot.state.weapons[0].id).toBe('machete');
    bot.state.pos = point(0, -20); bot.state.protectionUntil = 0; bot.state.yaw = 0;
    a.state.pos = { ...bot.state.pos, z: bot.state.pos.z - 2 }; a.state.hp = 1; a.state.protectionUntil = 0;
    advance(sim, 360);
    expect(sim.snapshot().phase).toBe('results');
    expect(sim.snapshot().results.find(r => r.id === bot.state.id)?.winner).toBe(true);
  });
});
