import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { createBrain, recoveryDirection } from '../src/simulation/bots';
import { walkableHeight } from '../src/shared/navigation';
import { createWorld } from '../src/shared/world';
import type { ActorState, InputFrame } from '../src/shared/types';

const base = createWorld();
type Runtime = { state: ActorState; brain: ReturnType<typeof createBrain>; input: InputFrame };
const point = (x: number, z: number) => ({ x, y: walkableHeight(x, z, base), z });
function fixture(start: ActorState['pos'], goal: ActorState['pos']) {
  const prize = { ...goal, id: 'route-prize', kind: 'weapon' as const, weapon: 'm4' as const };
  const sim = new Simulation({ ...base, loot: [prize], chests: [] },
    { mode: 'battle-royale', capacity: 2, bots: true, difficulty: 'normal', duration: 300 },
    [{ id: 'observer', name: 'Observer', color: '#fff', ready: true, connected: true }], 'navigation-review', 3);
  const runtime = sim as any, actors = runtime.actors as Map<string, Runtime>, bot = actors.get('bot-1')!;
  for (const a of actors.values()) Object.assign(a.state, { alive: false, hp: 0, respawnAt: 0 });
  Object.assign(actors.get('observer')!.state, { alive: true, hp: 100, stage: 'ground', grounded: true,
    pos: point(110, -110), protectionUntil: 1e9 });
  Object.assign(bot.state, { alive: true, hp: 100, stage: 'ground', grounded: true, pos: { ...start }, velocity: { x: 0, y: 0, z: 0 },
    weapons: [{ id: 'pistol', ammo: 17, reserve: 51, rarity: 0, box: 2 }], slot: 0 });
  bot.brain = createBrain(false, 2, bot.state.pos, 1); bot.brain.leisureAt = Infinity; bot.brain.goal = goal;
  Object.assign(runtime, { phase: 'playing', time: 12, zoneTimer: 999 });
  Object.assign(runtime.zone, { radius: 999, nextRadius: 900 });
  return { sim, bot, runtime };
}

describe('connected routes on the rebuilt island', () => {
  it.each([
    ['chapel bridge', [-41.5, 0], [-41.5, 25]],
    ['arch bridge', [-8, -6], [-8, 24]],
    ['timber bridge', [36, 5], [36, 33]],
    ['estuary bridge', [83, 12], [83, 34]],
    ['Engenho lane', [-85.7, 35.5], [-85.7, 23.5]],
    ['Palafitas junctions', [86, 80], [103, 96.2]],
    ['west approach', [-112, 13], [-101.5, 35.5]],
  ] as const)('walks the %s and collects the destination loot without swimming', (_, start, goal) => {
    const { sim, bot } = fixture(point(start[0], start[1]), point(goal[0], goal[1]));
    let swam = false, collected = false;
    for (let i = 0; i < 35 * 60 && !collected; i++) {
      sim.step(1 / 60); sim.drainEvents(); swam ||= bot.state.swimming;
      collected = bot.state.weapons.some(w => w.id === 'm4');
    }
    expect(collected, JSON.stringify({ start, goal, pos: bot.state.pos, via: bot.brain.via })).toBe(true);
    expect(swam).toBe(false);
  });

  it('walks away from an overhanging rock using its full body clearance', () => {
    const start = { x: -83.36653, y: 6.82108, z: 85.27539 };
    const { sim, bot } = fixture(start, point(-64, 87));
    for (let i = 0; i < 6 * 60; i++) { sim.step(1 / 60); sim.drainEvents(); }
    expect(Math.hypot(bot.state.pos.x - start.x, bot.state.pos.z - start.z), JSON.stringify({ pos: bot.state.pos, goal: bot.brain.goal, via: bot.brain.via })).toBeGreaterThan(5);
  });

  it('returns toward shore when a swimmer begins beyond the soft boundary', () => {
    const start = { x: -124, y: -1.15, z: -124.1 };
    const { sim, bot } = fixture(start, point(-108, -108));
    bot.state.swimming = true; bot.state.grounded = false;
    for (let i = 0; i < 6 * 60; i++) { sim.step(1 / 60); sim.drainEvents(); }
    expect(bot.state.pos.x).toBeGreaterThan(-119); expect(bot.state.pos.z).toBeGreaterThan(-119);
  });

  it('steps off a small rock shelf instead of probing from the ground below it', () => {
    const start = { x: -89.35078, y: 12.62346, z: -88.69112 };
    const { sim, bot } = fixture(start, point(-12, -28));
    const before = structuredClone(bot.state);
    expect(recoveryDirection(base, bot.state, point(-12, -28), 'battle-royale')).not.toBeNull();
    expect(bot.state).toEqual(before);
    let swam = false;
    for (let i = 0; i < 16 * 60; i++) { sim.step(1 / 60); sim.drainEvents(); swam ||= bot.state.swimming; }
    expect(Math.hypot(bot.state.pos.x - start.x, bot.state.pos.z - start.z), JSON.stringify(bot.state.pos)).toBeGreaterThan(5);
    expect(swam).toBe(false);
  });
});
