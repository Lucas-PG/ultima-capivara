import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { DIFFICULTY, adaptDifficulty } from '../src/simulation/bots';
import { terrainHeight } from '../src/shared/terrain';
import { createWorld } from '../src/shared/world';
import type { ActorState, Difficulty, GameEvent, InputFrame, WorldSpec } from '../src/shared/types';

type Runtime = { state: ActorState; brain: any; input: InputFrame; lastInputAt: number };

function advance(sim: Simulation, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds * 4); i++) sim.step(Math.min(.25, seconds - i * .25));
}
const actorsOf = (sim: Simulation) => (sim as any).actors as Map<string, Runtime>;

// One bot and one human on open ground; every other bot is parked dead.
function duel(distance = 10, difficulty: Difficulty = 'normal', facing = Math.PI, seed = 7, extra: Partial<WorldSpec> = {}) {
  const world: WorldSpec = {
    version: 'bot-test', size: 256, objects: [], districts: [], loot: [], chests: [], colliders: [],
    spawns: [
      { x: 0, y: terrainHeight(0, 0), z: 0, yaw: 0, mode: 'deathmatch' },
      { x: 0, y: terrainHeight(0, -distance), z: -distance, yaw: 0, mode: 'deathmatch' },
    ], ...extra,
  };
  const sim = new Simulation(world, { mode: 'deathmatch', capacity: 8, bots: true, difficulty, duration: 300 },
    [{ id: 'player', name: 'Player', color: '#fff', ready: true, connected: true }], 'bot-duel', seed);
  advance(sim, 3.1);
  const actors = actorsOf(sim);
  const player = actors.get('player')!.state, bot = actors.get('bot-1')!;
  for (const [id, actor] of actors) if (id !== 'player' && id !== 'bot-1') { actor.state.alive = false; actor.state.hp = 0; actor.state.respawnAt = 0; }
  player.pos = { x: 0, y: terrainHeight(0, 0), z: 0 };
  bot.state.pos = { x: 0, y: terrainHeight(0, -distance), z: -distance };
  bot.state.yaw = facing; bot.state.pitch = 0;
  bot.brain.elite = false; bot.brain.skill = 2; bot.brain.thinkAt = 0; bot.brain.lastPos = { ...bot.state.pos };
  player.protectionUntil = bot.state.protectionUntil = 0;
  sim.drainEvents();
  return { sim, world, player, bot };
}
function collect(sim: Simulation, seconds: number, step = .05) {
  const events: { time: number; event: GameEvent }[] = [];
  for (let i = 0; i < Math.round(seconds / step); i++) {
    advance(sim, step);
    const time = sim.snapshot().time;
    for (const event of sim.drainEvents()) events.push({ time, event });
  }
  return events;
}
const botShots = (events: { time: number; event: GameEvent }[]) => events.filter(e => e.event.type === 'shot' && e.event.actor === 'bot-1');

describe('legacy bot behaviour', () => {
  it('waits a reaction time before shooting, then deals the legacy damage share', () => {
    const { sim, player } = duel(10);
    player.hp = 10_000;
    const start = sim.snapshot().time;
    const events = collect(sim, 4);
    const shots = botShots(events);
    expect(shots.length).toBeGreaterThan(0);
    // Non-elite reaction: .45–.75 s + distance/140 + the difficulty's extra .15 s.
    expect(shots[0].time - start).toBeGreaterThan(.45 + 10 / 140 + .15);
    const k = .45 * DIFFICULTY.normal.dmg;
    const hits = events.filter(e => e.event.type === 'damage' && e.event.actor === 'bot-1').map(e => (e.event as Extract<GameEvent, { type: 'damage' }>));
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) expect([17 * k, 17 * 1.8 * k].some(v => Math.abs(hit.amount - Math.round(v * 10) / 10) < .11)).toBe(true);
  });

  it('fires automatic weapons in short bursts separated by pauses', () => {
    const { sim, player } = duel(9);
    player.hp = 10_000;
    const times = botShots(collect(sim, 7, 1 / 60)).map(s => s.time);
    expect(times.length).toBeGreaterThan(12);
    const bursts: number[] = [];
    let size = 1;
    for (let i = 1; i < times.length; i++) {
      if (times[i] - times[i - 1] > .25) { bursts.push(size); size = 1; } else size++;
    }
    bursts.push(size);
    expect(bursts.length).toBeGreaterThan(1);
    expect(Math.max(...bursts)).toBeLessThanOrEqual(9);
    expect(times.some((t, i) => i > 0 && t - times[i - 1] >= .3)).toBe(true);
  });

  it('neither targets a protected player nor sees or shoots through walls', () => {
    const { sim, world, player, bot } = duel(10);
    player.hp = 10_000;
    player.protectionUntil = sim.snapshot().time + 1;
    expect(botShots(collect(sim, .8))).toHaveLength(0);
    expect(bot.brain.target).toBeNull();
    world.colliders.push({ id: 'wall', min: { x: -20, y: 0, z: -5.5 }, max: { x: 20, y: 6, z: -4.5 }, material: 'stone' });
    player.protectionUntil = 0;
    expect(botShots(collect(sim, 2))).toHaveLength(0);
    expect(bot.brain.target).toBeNull();
    world.colliders.pop();
    bot.state.pos = { x: 0, y: terrainHeight(0, -10), z: -10 }; bot.state.yaw = Math.PI; bot.brain.thinkAt = 0;
    expect(botShots(collect(sim, 3)).length).toBeGreaterThan(0);
    expect(bot.brain.target).toBe('player');
  });

  it('hears a gunshot behind it and turns to fight', () => {
    const { sim, player, bot } = duel(10, 'normal', 0);
    // Walking away from the player, so it only notices through hearing.
    bot.brain.goal = { x: 0, y: terrainHeight(0, -60), z: -60 };
    collect(sim, 1);
    expect(bot.brain.target).toBeNull();
    const actors = actorsOf(sim), human = actors.get('player')!;
    // The player fires into the sky: the bot has its back turned but hears it.
    human.state.slot = 0;
    sim.input('player', { seq: 1, moveX: 0, moveZ: 0, yaw: 0, pitch: 1.2, sprint: false, crouch: false, jump: false, fire: true, ads: false, lean: 0, clientTime: sim.snapshot().time });
    advance(sim, .1);
    sim.input('player', { seq: 2, moveX: 0, moveZ: 0, yaw: 0, pitch: 1.2, sprint: false, crouch: false, jump: false, fire: false, ads: false, lean: 0, clientTime: sim.snapshot().time });
    collect(sim, 1.2);
    expect(bot.brain.target).toBe('player');
    const toPlayer = Math.atan2(-(player.pos.x - bot.state.pos.x), -(player.pos.z - bot.state.pos.z));
    expect(Math.abs(Math.atan2(Math.sin(toPlayer - bot.state.yaw), Math.cos(toPlayer - bot.state.yaw)))).toBeLessThan(.3);
  });

  it('walks to a better weapon and switches to it', () => {
    const { sim, player, bot } = duel(40, 'normal', Math.PI, 7, {
      loot: [{ id: 'm4-1', kind: 'weapon', weapon: 'm4', x: 8, y: terrainHeight(8, -40), z: -40 }],
      colliders: [{ id: 'screen', min: { x: -30, y: 0, z: -21 }, max: { x: 30, y: 8, z: -19 }, material: 'stone' }],
    });
    player.protectionUntil = sim.snapshot().time + 60;
    collect(sim, 8);
    expect(bot.state.weapons.some(w => w.id === 'm4')).toBe(true);
    expect(bot.state.weapons[bot.state.slot].id).toBe('m4');
  });

  it('opens a chest in battle royale and collects a spilled upgrade', () => {
    const world: WorldSpec = {
      version: 'bot-test', size: 256, objects: [], districts: [], loot: [], colliders: [],
      chests: [{ id: 'chest-1', x: 6, y: terrainHeight(6, 0), z: 0 }],
      spawns: [{ x: 0, y: terrainHeight(0, 0), z: 0, yaw: 0, mode: 'both' }],
    };
    const sim = new Simulation(world, { mode: 'battle-royale', capacity: 2, bots: true, difficulty: 'normal', duration: 300 },
      [{ id: 'player', name: 'P', color: '#fff', ready: true, connected: true }], 'chest-bot', 3);
    advance(sim, 3.1);
    const actors = actorsOf(sim), bot = actors.get('bot-1')!;
    for (const [id, a] of actors) if (id !== 'bot-1') { a.state.alive = false; a.state.hp = 0; }
    // Keep the human alive (a lone survivor would end the match), parked and protected far away.
    const human = actors.get('player')!.state;
    Object.assign(human, { alive: true, hp: 100, stage: 'ground', grounded: true, pos: { x: -110, y: terrainHeight(-110, -110), z: -110 }, protectionUntil: 1e9 });
    Object.assign(bot.state, { stage: 'ground', grounded: true, pos: { x: 0, y: terrainHeight(0, 0), z: 0 }, weapons: [{ id: 'pistol', ammo: 17, reserve: 51, rarity: 0 }, { id: 'machete', ammo: 0, reserve: 0, rarity: 0 }], slot: 0 });
    bot.brain.jumpAt = Infinity; bot.brain.thinkAt = 0; bot.brain.lastPos = { ...bot.state.pos };
    (sim as any).zone.radius = 999; (sim as any).zone.nextRadius = 900;
    collect(sim, 8);
    expect(sim.snapshot().openedChests).toEqual(['chest-1']);
    collect(sim, 8);
    const kinds = bot.state.weapons.map(w => w.id);
    const took = bot.state.armor > 0 || bot.state.helmet > 0 || kinds.some(id => !['pistol', 'machete', 'slingshot'].includes(id)) ||
      Object.values(bot.state.consumables).some(n => n > 0);
    expect(took).toBe(true);
  });

  it('runs for the safe circle when the storm would catch it', () => {
    const world: WorldSpec = {
      version: 'bot-test', size: 256, objects: [], districts: [], loot: [], chests: [], colliders: [],
      spawns: [{ x: 0, y: terrainHeight(0, 0), z: 0, yaw: 0, mode: 'both' }],
    };
    const sim = new Simulation(world, { mode: 'battle-royale', capacity: 2, bots: true, difficulty: 'normal', duration: 300 },
      [{ id: 'player', name: 'P', color: '#fff', ready: true, connected: true }], 'storm-bot', 5);
    advance(sim, 3.1);
    const actors = actorsOf(sim), bot = actors.get('bot-1')!;
    for (const [id, a] of actors) if (id !== 'bot-1') { a.state.alive = false; a.state.hp = 0; }
    // Keep the human alive (a lone survivor would end the match), parked and protected far away.
    const human = actors.get('player')!.state;
    Object.assign(human, { alive: true, hp: 100, stage: 'ground', grounded: true, pos: { x: -110, y: terrainHeight(-110, -110), z: -110 }, protectionUntil: 1e9 });
    Object.assign(bot.state, { stage: 'ground', grounded: true, pos: { x: 70, y: terrainHeight(70, 0), z: 0 } });
    bot.brain.jumpAt = Infinity; bot.brain.thinkAt = 0; bot.brain.lastPos = { ...bot.state.pos };
    Object.assign((sim as any).zone, { x: 0, z: 0, radius: 95, nextX: 0, nextZ: 0, nextRadius: 20 });
    // The storm is already closing: legacy zoneNeed() sends the bot running inside.
    Object.assign((sim as any).zone, { shrinking: true }); (sim as any).zoneStart = { x: 0, y: 0, z: 0 }; (sim as any).zoneStartRadius = 95;
    (sim as any).zoneTimer = 6; (sim as any).zone.timeLeft = 6;
    advance(sim, 4);
    expect(bot.brain.zoneGoal).not.toBeNull();
    expect(bot.state.pos.x).toBeLessThan(50);
  });

  it('gets faster and more dangerous with difficulty', () => {
    const measure = (difficulty: Difficulty) => {
      let first = 0, samples = 0, damage = 0;
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const { sim, player } = duel(10, difficulty, Math.PI, seed);
        player.hp = 10_000;
        const start = sim.snapshot().time, events = collect(sim, 3);
        const shot = botShots(events)[0];
        if (shot) { first += shot.time - start; samples++; }
        damage += events.filter(e => e.event.type === 'damage' && e.event.actor === 'bot-1').reduce((sum, e) => sum + (e.event as any).amount, 0);
      }
      return { first: first / samples, damage };
    };
    const easy = measure('easy'), hard = measure('hard');
    expect(hard.first).toBeLessThan(easy.first);
    expect(hard.damage).toBeGreaterThan(easy.damage * 1.3);
  });

  it('jumps toward spread-out loot spots, lands and keeps moving on the real island', () => {
    const world = createWorld();
    const sim = new Simulation(world, { mode: 'battle-royale', capacity: 8, bots: true, difficulty: 'normal', duration: 300 },
      [{ id: 'player', name: 'P', color: '#fff', ready: true, connected: true }], 'island-bots', 11);
    const bots = [...actorsOf(sim).values()].filter(a => a.brain);
    const lands = bots.map(a => a.brain.land);
    const gaps = lands.map((l, i) => Math.min(...lands.filter((_, j) => j !== i).map(o => Math.hypot(o.x - l.x, o.z - l.z))));
    expect(gaps.filter(g => g >= 20).length).toBeGreaterThanOrEqual(lands.length - 2);
    // Record where each bot touches down.
    const touchdown = new Map<string, ActorState['pos']>();
    for (let i = 0; i < 32 * 10; i++) {
      advance(sim, .1);
      for (const a of bots) if (a.state.stage === 'ground' && !touchdown.has(a.state.id)) touchdown.set(a.state.id, { ...a.state.pos });
    }
    const grounded = bots.filter(a => a.state.alive && a.state.stage === 'ground');
    expect(grounded.length).toBeGreaterThan(bots.filter(a => a.state.alive).length * .9);
    const accurate = [...touchdown].filter(([id, p]) => { const land = bots.find(a => a.state.id === id)!.brain.land; return Math.hypot(p.x - land.x, p.z - land.z) < 12; });
    expect(accurate.length).toBeGreaterThan(touchdown.size * .8);
    const before = new Map(grounded.map(a => [a.state.id, { ...a.state.pos }]));
    advance(sim, 12);
    const moved = grounded.filter(a => a.state.alive && Math.hypot(a.state.pos.x - before.get(a.state.id)!.x, a.state.pos.z - before.get(a.state.id)!.z) > 3);
    expect(moved.length).toBeGreaterThan(grounded.filter(a => a.state.alive).length * .6);
    expect(grounded.filter(a => a.state.alive && terrainHeight(a.state.pos.x, a.state.pos.z) < -.3)).toHaveLength(0);
  });

  it('adaptive difficulty makes practice bots milder after losses and braver after wins, within legacy bounds', () => {
    const base = DIFFICULTY.normal;
    expect(adaptDifficulty(base, 0)).toEqual(base);
    const mild = adaptDifficulty(base, -1), brave = adaptDifficulty(base, 1);
    expect(mild.dmg).toBeLessThan(base.dmg); expect(mild.err).toBeGreaterThan(base.err); expect(mild.react).toBeGreaterThan(base.react);
    expect(brave.dmg).toBeGreaterThan(base.dmg); expect(brave.err).toBeLessThan(base.err);
    expect(mild.dmg / base.dmg).toBeGreaterThan(.75); expect(brave.dmg / base.dmg).toBeLessThan(1.25);
    expect(adaptDifficulty(base, 99)).toEqual(adaptDifficulty(base, 1));
    expect(adaptDifficulty(base, Number.NaN)).toEqual(base);
  });
});
