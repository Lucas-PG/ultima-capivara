import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { terrainHeight } from '../src/shared/terrain';
import type { ActorState, Difficulty, WorldSpec } from '../src/shared/types';

function advance(sim: Simulation, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds * 4); i++) sim.step(Math.min(.25, seconds - i * .25));
}

function duel(distance = 10, difficulty: Difficulty = 'normal', facing = Math.PI) {
  const world: WorldSpec = {
    version: 'bot-test', size: 256, objects: [], districts: [], loot: [], chests: [], colliders: [],
    spawns: [
      { x: 0, y: terrainHeight(0, 0), z: 0, yaw: 0, mode: 'deathmatch' },
      { x: 0, y: terrainHeight(0, -distance), z: -distance, yaw: 0, mode: 'deathmatch' },
    ],
  };
  const sim = new Simulation(world, { mode: 'deathmatch', capacity: 8, bots: true, difficulty, duration: 300 },
    [{ id: 'player', name: 'Player', color: '#fff', ready: true, connected: true }], 'bot-duel', 7);
  advance(sim, 3.1);
  const actors = (sim as any).actors as Map<string, { state: ActorState; botThinkAt: number; target: string | null; targetPos: ActorState['pos'] | null }>;
  const player = actors.get('player')!.state, bot = actors.get('bot-1')!;
  for (const [id, actor] of actors) if (id !== 'player' && id !== 'bot-1') { actor.state.alive = false; actor.state.hp = 0; actor.state.respawnAt = 0; }
  player.pos = { x: 0, y: terrainHeight(0, 0), z: 0 };
  bot.state.pos = { x: 0, y: terrainHeight(0, -distance), z: -distance };
  bot.state.yaw = facing; bot.state.pitch = 0;
  player.protectionUntil = bot.state.protectionUntil = 0;
  bot.botThinkAt = sim.snapshot().time;
  sim.drainEvents();
  return { sim, world, player, bot };
}

describe('fair bot combat', () => {
  it('turns through an exposed 180 degrees and waits before shooting', () => {
    const { sim, bot, player } = duel(7, 'normal', 0);
    advance(sim, .35);
    expect(Math.abs(bot.state.yaw)).toBeGreaterThan(0);
    expect(Math.abs(bot.state.yaw)).toBeLessThan(1);
    expect(bot.state.ads).toBe(true);
    expect(sim.drainEvents().filter(e => e.type === 'shot' && e.actor === 'bot-1')).toHaveLength(0);
    advance(sim, .6);
    expect(player.hp).toBe(100);
    expect(sim.drainEvents().filter(e => e.type === 'shot' && e.actor === 'bot-1')).toHaveLength(0);
    advance(sim, 2.05);
    expect(player.alive).toBe(true);
  });

  it('does not target a protected player or update a hidden player position', () => {
    const { sim, world, player, bot } = duel(10);
    player.protectionUntil = sim.snapshot().time + 1;
    advance(sim, .7);
    expect(bot.target).toBeNull();
    expect(sim.drainEvents().filter(e => e.type === 'shot' && e.actor === 'bot-1')).toHaveLength(0);
    player.protectionUntil = 0;
    advance(sim, .45);
    expect(bot.targetPos?.x).toBe(0);
    world.colliders.push({ id: 'screen', min: { x: -20, y: 0, z: -5.5 }, max: { x: 20, y: 5, z: -4.5 }, material: 'stone' });
    player.pos.x = 4;
    advance(sim, .8);
    expect(bot.target).toBeNull();
    expect(bot.targetPos?.x).toBe(0);
    expect(sim.drainEvents().filter(e => e.type === 'shot' && e.actor === 'bot-1')).toHaveLength(0);
  });

  it('moves around small cover toward the last seen position', () => {
    const { sim, world, bot } = duel(10);
    advance(sim, .4);
    world.colliders.push({ id: 'cover', min: { x: -1.5, y: 0, z: -6 }, max: { x: 1.5, y: 4, z: -4 }, material: 'stone' });
    sim.drainEvents();
    advance(sim, 8);
    expect(Math.abs(bot.state.pos.x)).toBeGreaterThan(1.5);
    expect(sim.drainEvents().some(e => e.type === 'shot' && e.actor === 'bot-1')).toBe(true);
  });

  it('spaces shots into bursts, aims at the body, and can still win a duel', () => {
    const { sim, player, bot } = duel(10);
    player.hp = 1000;
    const start = sim.snapshot().time;
    const events: ReturnType<Simulation['drainEvents']> = [], shotTimes: number[] = [];
    for (let i = 0; i < 110; i++) {
      advance(sim, .05);
      const batch = sim.drainEvents();
      shotTimes.push(...batch.filter(e => e.type === 'shot' && e.actor === 'bot-1').map(() => sim.snapshot().time));
      events.push(...batch);
    }
    const shots = events.filter(e => e.type === 'shot' && e.actor === 'bot-1');
    const hits = events.filter(e => e.type === 'damage' && e.actor === 'bot-1' && e.target === 'player');
    expect(shots.length).toBeGreaterThan(3);
    expect(shots.length).toBeLessThan(17);
    expect(shotTimes.some((time, i) => i > 0 && time - shotTimes[i - 1] > .9)).toBe(true);
    expect(bot.state.weapons[0].ammo).toBe(25 - shots.length);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every(hit => hit.type === 'damage' && !hit.head)).toBe(true);
    expect(player.hp).toBeGreaterThan(750);
    expect(sim.snapshot().time - start).toBeCloseTo(5.5, 1);

    player.hp = 100;
    advance(sim, 20);
    expect(sim.drainEvents().some(e => e.type === 'kill' && e.actor === 'bot-1' && e.target === 'player')).toBe(true);
  });

  it('makes each difficulty visibly quicker to acquire a target', () => {
    const firstShot = (difficulty: Difficulty) => {
      const { sim } = duel(10, difficulty);
      const start = sim.snapshot().time;
      for (let i = 0; i < 70; i++) {
        advance(sim, .05);
        if (sim.drainEvents().some(e => e.type === 'shot' && e.actor === 'bot-1')) return sim.snapshot().time - start;
      }
      return Infinity;
    };
    const hard = firstShot('hard'), normal = firstShot('normal'), easy = firstShot('easy');
    expect(hard).toBeGreaterThanOrEqual(.45);
    expect(hard).toBeLessThan(normal);
    expect(normal).toBeLessThan(easy);
  });
});
