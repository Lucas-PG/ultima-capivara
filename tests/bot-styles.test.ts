import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { BOT_STYLES, createBrain, type BotStyle } from '../src/simulation/bots';
import { terrainHeight } from '../src/shared/terrain';
import { createWorld } from '../src/shared/world';
import type { ActorState, InputFrame, WorldSpec } from '../src/shared/types';

type Runtime = { state: ActorState; brain: ReturnType<typeof createBrain>; input: InputFrame };
const ground = (x: number, z: number) => ({ x, y: terrainHeight(x, z), z });

// One bot and a parked, invulnerable human on open ground.
function arena(style: BotStyle, botAt = ground(0, -16), extra: Partial<WorldSpec> = {}, seed = 5) {
  const world: WorldSpec = { version: 'style-test', size: 256, objects: [], districts: [], loot: [], chests: [], colliders: [],
    spawns: [{ ...ground(0, 0), yaw: 0, mode: 'deathmatch' }], ...extra };
  const sim = new Simulation(world, { mode: 'deathmatch', capacity: 8, bots: true, difficulty: 'normal', duration: 300 },
    [{ id: 'player', name: 'P', color: '#fff', ready: true, connected: true }], 'styles', seed);
  for (let i = 0; i < 13; i++) sim.step(.25);
  const runtime = sim as any, actors = runtime.actors as Map<string, Runtime>, bot = actors.get('bot-1')!, player = actors.get('player')!.state;
  for (const [id, actor] of actors) if (id !== 'player' && id !== 'bot-1') Object.assign(actor.state, { alive: false, hp: 0, respawnAt: 1e9 });
  Object.assign(player, { pos: ground(0, 0), hp: 1e6, protectionUntil: 0 });
  Object.assign(bot.state, { pos: { ...botAt }, yaw: Math.PI, protectionUntil: 0,
    weapons: [{ id: 'pistol', ammo: 17, reserve: 300, rarity: 0, box: 0 }], slot: 0 });
  bot.brain = createBrain(false, 2, bot.state.pos, 1, style); bot.brain.leisureAt = Infinity;
  sim.drainEvents();
  return { sim, runtime, bot, player };
}
const run = (sim: Simulation, seconds: number, each: () => void = () => {}) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) { sim.step(1 / 60); sim.drainEvents(); each(); }
};

describe('bot play styles', () => {
  it('mixes rushers, anchors and flankers in a lobby, reproducibly for a seed', () => {
    const lobby = (seed: number) => {
      const sim = new Simulation(createWorld(), { mode: 'battle-royale', capacity: 8, bots: true, difficulty: 'normal', duration: 300 }, [], 'lobby', seed);
      return [...((sim as any).actors as Map<string, Runtime>).values()].map(actor => actor.brain.style);
    };
    const styles = lobby(9);
    for (const style of BOT_STYLES) expect(styles.filter(s => s === style).length, style).toBeGreaterThan(2);
    expect(lobby(9)).toEqual(styles);
  });

  it('a rusher closes to point-blank range while an anchor keeps its distance', () => {
    const distanceAfter = (style: BotStyle) => {
      const { sim, bot, player } = arena(style);
      run(sim, 3);
      return Math.hypot(bot.state.pos.x - player.pos.x, bot.state.pos.z - player.pos.z);
    };
    const rusher = distanceAfter('rusher'), anchor = distanceAfter('anchor');
    expect(rusher).toBeLessThan(12.5);
    expect(anchor).toBeGreaterThan(rusher + 3);
  });

  it('an anchor holds and watches a lost sighting; a rusher keeps pushing it', () => {
    const watch = (style: BotStyle) => {
      const { sim, runtime, bot, player } = arena(style, ground(40, 40));
      player.protectionUntil = 1e9;
      const sighting = ground(40, 20);
      Object.assign(bot.brain, { lastSeen: sighting, lastSeenAt: runtime.time });
      run(sim, 1.8);
      const held = { ...bot.state.pos };
      let crouched = true, facing = true;
      run(sim, 2.5, () => {
        crouched &&= bot.state.crouch;
        const toSighting = Math.atan2(-(sighting.x - bot.state.pos.x), -(sighting.z - bot.state.pos.z));
        facing &&= Math.abs(Math.atan2(Math.sin(toSighting - bot.state.yaw), Math.cos(toSighting - bot.state.yaw))) < .5;
      });
      return { moved: Math.hypot(bot.state.pos.x - held.x, bot.state.pos.z - held.z), crouched, facing };
    };
    const anchor = watch('anchor'), rusher = watch('rusher');
    expect(anchor.moved).toBeLessThan(.5); expect(anchor.crouched).toBe(true); expect(anchor.facing).toBe(true);
    expect(rusher.moved).toBeGreaterThan(4);
  });

  it('glances down open side streets while walking, without losing its way', () => {
    const { sim, bot, player } = arena('flanker', ground(-45, -20));
    player.protectionUntil = 1e9;
    bot.brain.goal = ground(5, -20);
    let glanced = 0;
    run(sim, 14, () => {
      const heading = Math.atan2(-bot.state.velocity.x, -bot.state.velocity.z);
      if (Math.hypot(bot.state.velocity.x, bot.state.velocity.z) > 2 &&
        Math.abs(Math.atan2(Math.sin(heading - bot.state.yaw), Math.cos(heading - bot.state.yaw))) > .5) glanced++;
    });
    // Several glances of about half a second each ...
    expect(glanced / 60).toBeGreaterThan(.8);
    // ... while still reaching the goal 50 m away.
    expect(Math.hypot(bot.state.pos.x - 5, bot.state.pos.z + 20), JSON.stringify(bot.state.pos)).toBeLessThan(4);
  });

  it('sniped from beyond its sight, it breaks the line of fire and then peeks toward the shot', () => {
    const at = ground(0, -16);
    // A low wall off to the bot's side, between it and the distant marksman.
    const { sim, runtime, bot, player } = arena('flanker', at, { colliders: [
      { id: 'wall', min: { x: 2, y: at.y, z: at.z + 2 }, max: { x: 6, y: at.y + 2.2, z: at.z + 3 }, material: 'stone' },
    ] });
    // 70 m away: beyond a pistol bot's sight, so it only knows where the shot came from.
    Object.assign(player, { pos: ground(0, 54) });
    bot.brain.goal = ground(0, -60);
    run(sim, .5);
    runtime.damage(runtime.actors.get('bot-1'), 20, 'player', 'sniper', false, 70);
    let tookCover = false;
    run(sim, 1.5, () => { tookCover ||= bot.brain.mode === 'cover'; });
    expect(bot.brain.sees).toBe(false);
    expect(tookCover).toBe(true);
    expect(Math.hypot(bot.brain.lastSeen!.x - player.pos.x, bot.brain.lastSeen!.z - player.pos.z)).toBeLessThan(1);
    // The cover it chose really blocks the marksman.
    expect(runtime.grid.sees({ ...bot.brain.coverPt!, y: bot.brain.coverPt!.y + 1 }, { ...player.pos, y: player.pos.y + 1.2 })).toBe(false);
  });
});
