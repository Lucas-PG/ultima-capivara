import { describe, expect, it } from 'vitest';
import { BOT_TELL, Simulation } from '../src/simulation';
import { createBrain } from '../src/simulation/bots';
import { terrainHeight } from '../src/shared/terrain';
import type { ActorState, GameEvent, WorldSpec } from '../src/shared/types';

const point = (x: number, z = -20) => ({ x, y: terrainHeight(x, z), z });
function fixture(seed = 7, recreation: 'bath' | 'trampoline' | null = null) {
  const world: WorldSpec = { version: 'personality-test', size: 260, objects: [], colliders: [], chests: [], loot: [], districts: [],
    spawns: [{ ...point(0), yaw: 0, mode: 'both' }],
    mudBaths: recreation === 'bath' ? [{ id: 'bath', ...point(6), radius: 1.45 }] : [],
    trampolines: recreation === 'trampoline' ? [{ id: 'pad', ...point(6), radius: 1.38, impulse: 12 }] : [] };
  const sim = new Simulation(world, { mode: 'battle-royale', capacity: 2, bots: true, difficulty: 'normal', duration: 300 },
    [{ id: 'player', name: 'P', color: '#ffffff', ready: true, connected: true }], 'personality', seed);
  const runtime = sim as any, actors = runtime.actors as Map<string, any>;
  runtime.phase = 'playing'; runtime.time = 12; runtime.matchStartedAt = 12; runtime.zoneTimer = 999;
  runtime.zone.radius = 900; runtime.zone.nextRadius = 800;
  for (const [id, actor] of actors) {
    Object.assign(actor.state, { alive: id === 'player' || id === 'bot-1', stage: 'ground', grounded: true, respawnAt: 0,
      pos: id === 'bot-1' ? point(0) : point(110, 110), velocity: { x: 0, y: 0, z: 0 }, protectionUntil: 0 });
  }
  const bot = actors.get('bot-1')!, player = actors.get('player')!;
  player.state.protectionUntil = 1000;
  bot.brain = createBrain(false, 2, bot.state.pos, 1); bot.landedAt = 0; bot.state.yaw = -Math.PI / 2;
  bot.state.weapons = [{ id: 'pistol', ammo: 17, reserve: 51, rarity: 0 }]; bot.state.slot = 0;
  sim.drainEvents();
  return { sim, runtime, actors, bot, player, world };
}
function advance(sim: Simulation, seconds: number, inspect: () => void = () => {}) {
  for (let tick = 0; tick < Math.ceil(seconds * 60); tick++) { sim.step(1 / 60); inspect(); }
}
function afterKill(seed: number) {
  const f = fixture(seed), victim = f.actors.get('bot-2');
  Object.assign(victim.state, { alive: true, hp: 1, pos: point(2) });
  f.bot.brain.target = victim.state.id; f.bot.brain.lastSeen = { ...victim.state.pos }; f.bot.brain.lastSeenAt = f.sim.snapshot().time;
  f.runtime.kill(victim, f.bot, 'pistol');
  return f;
}
function celebrating() {
  for (let seed = 1; seed <= 20; seed++) {
    const f = afterKill(seed);
    for (let tick = 0; tick < 8 * 60; tick++) {
      f.sim.step(1 / 60);
      if (f.bot.state.emote) return f;
    }
  }
  throw new Error('No seeded bot celebrated a safe elimination');
}

describe('seeded bot personality without combat concessions', () => {
  it('sometimes waves or dances after a quiet kill, reproduces the seed and stops within two seconds', () => {
    const sample = () => Array.from({ length: 12 }, (_, i) => {
      const { sim, bot } = afterKill(i + 1);
      let first = 0, last = 0, emote: ActorState['emote'] = null;
      advance(sim, 9, () => {
        if (bot.state.emote) { first ||= sim.snapshot().time; last = sim.snapshot().time; emote = bot.state.emote; }
      });
      if (emote) {
        expect(first).toBeGreaterThanOrEqual(15); expect(last - first).toBeLessThanOrEqual(1.81);
        expect(['wave', 'dance']).toContain(emote); expect(bot.state.emote).toBeNull();
      }
      return { first, last, emote };
    });
    const samples = sample();
    expect(samples).toEqual(sample());
    expect(samples.filter(s => s.emote).length).toBeGreaterThan(1);
    expect(samples.filter(s => s.emote).length).toBeLessThan(11);
  });

  it('cancels a gesture for a nearby opponent behind it, including a protected arrival', () => {
    const { sim, bot, player } = celebrating();
    player.state.pos = { ...bot.state.pos, x: bot.state.pos.x + Math.sin(bot.state.yaw) * 10,
      z: bot.state.pos.z + Math.cos(bot.state.yaw) * 10 };
    bot.brain.thinkAt = 0;
    sim.step(1 / 60);
    expect(bot.state.emote).toBeNull(); expect(bot.brain.leisure).toBeNull();
    expect(bot.brain.target).toBeNull();
  });

  it('keeps normal reaction and shooting after a gesture is interrupted by an enemy', () => {
    const { sim, bot, player } = celebrating();
    player.state.pos = { ...bot.state.pos, x: bot.state.pos.x - Math.sin(bot.state.yaw) * 9,
      z: bot.state.pos.z - Math.cos(bot.state.yaw) * 9 };
    player.state.hp = 10000; player.state.protectionUntil = 0; bot.brain.thinkAt = 0;
    const events: { time: number; event: GameEvent }[] = [];
    advance(sim, 2.5, () => {
      expect(bot.state.emote).toBeNull();
      for (const event of sim.drainEvents()) events.push({ time: sim.snapshot().time, event });
    });
    const alert = events.find(e => e.event.type === 'alert' && e.event.actor === bot.state.id);
    const shot = events.find(e => e.event.type === 'shot' && e.event.actor === bot.state.id);
    expect(alert && shot).toBeTruthy();
    expect(shot!.time - alert!.time).toBeGreaterThanOrEqual(BOT_TELL - 1 / 60);
    expect(shot!.time - alert!.time).toBeLessThan(1.5);
  });

  it('walks to a nearby mud bath and heals only through seated contact, then leaves', () => {
    const { sim, bot } = fixture(7, 'bath'); bot.state.hp = 60;
    let seated = false;
    advance(sim, 10, () => {
      if (!seated && !bot.state.soaking) expect(bot.state.hp).toBe(60);
      seated ||= bot.state.soaking;
    });
    expect(seated).toBe(true); expect(bot.state.hp).toBeGreaterThanOrEqual(85);
    expect(bot.state.hp).toBeLessThan(86); expect(bot.state.emote).toBeNull();
    expect(bot.brain.leisure).toBeNull();
  });

  it('cancels soaking immediately on damage, cannot instantly sit again and keeps the attacker response', () => {
    const { sim, runtime, bot, player } = fixture(7, 'bath'); bot.state.hp = 55;
    advance(sim, 3); expect(bot.state.soaking).toBe(true);
    runtime.damage(bot, 5, player.state.id, 'pistol', false);
    const hurtHp = bot.state.hp;
    expect(bot.state.soaking).toBe(false); expect(bot.state.emote).toBeNull(); expect(bot.brain.leisure).toBeNull();
    expect(bot.brain.lastAttacker).toBe(player.state.id);
    advance(sim, 6);
    expect(bot.state.hp).toBe(hurtHp); expect(bot.state.soaking).toBe(false);
  });

  it('refuses leisure near a threat, after recent harm, or across a blocked approach', () => {
    for (const reason of ['enemy', 'harm', 'wall'] as const) {
      const { sim, runtime, bot, player, world } = fixture(7, 'bath'); bot.state.hp = 55;
      if (reason === 'enemy') player.state.pos = point(12);
      if (reason === 'harm') bot.lastHurt = runtime.time;
      if (reason === 'wall') world.colliders.push({ id: 'wall', material: 'stone', min: { x: 2, y: 0, z: -23 }, max: { x: 3, y: 8, z: -17 } });
      sim.step(1 / 60);
      expect(bot.brain.leisure).toBeNull(); expect(bot.state.emote).toBeNull();
    }
  });

  it('abandons a bath as soon as the closing storm requires travel', () => {
    const { sim, runtime, bot } = fixture(7, 'bath'); bot.state.hp = 55;
    advance(sim, 3); expect(bot.state.soaking).toBe(true);
    Object.assign(runtime.zone, { x: -30, z: -20, radius: 95, nextX: -30, nextZ: -20, nextRadius: 10, shrinking: true });
    runtime.zoneStart = { x: -30, y: 0, z: -20 }; runtime.zoneStartRadius = 95; runtime.zoneTimer = 2;
    bot.brain.thinkAt = 0; const before = bot.state.pos.x;
    advance(sim, .5);
    expect(bot.state.emote).toBeNull(); expect(bot.state.soaking).toBe(false); expect(bot.brain.leisure).toBeNull();
    expect(bot.state.pos.x).toBeLessThan(before - 1);
  });

  it('takes one seeded idle trampoline bounce, then leaves instead of becoming a stationary target', () => {
    let exercised = false;
    for (let seed = 1; seed <= 12 && !exercised; seed++) {
      const { sim, bot, world } = fixture(seed, 'trampoline');
      sim.step(1 / 60);
      if (bot.brain.leisure?.kind !== 'trampoline') continue;
      advance(sim, 4);
      expect(bot.state.bounceSeq).toBe(1); expect(bot.brain.leisure).toBeNull();
      expect(Math.hypot(bot.state.pos.x - world.trampolines![0].x, bot.state.pos.z - world.trampolines![0].z)).toBeGreaterThan(3);
      expect(bot.state.hp).toBe(100); exercised = true;
    }
    expect(exercised).toBe(true);
  });

  it('contests a landed supply crate and collects an upgrade without an inventory grant', () => {
    const { sim, runtime, bot } = fixture();
    runtime.supplyDrops.push({ id: 'supply-1', pos: point(6), district: '', heading: 0, announcedAt: 0, releaseAt: 5, landsAt: 10, opened: false });
    runtime.supplyRewards.set('supply-1', { weapon: 'm4', rarity: 3 });
    advance(sim, 6);
    expect(sim.snapshot().supplyDrops[0].opened).toBe(true);
    expect(bot.state.weapons.some((weapon: any) => weapon.id === 'm4' && weapon.rarity === 3)).toBe(true);
    expect(sim.drainEvents().some(event => event.type === 'pickup' && event.actor === bot.state.id && event.item === 'drop-1')).toBe(true);
  });
});
