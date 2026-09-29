import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { createBrain } from '../src/simulation/bots';
import { CAPELA, CAPELA_STAIR } from '../src/shared/layout';
import { walkableHeight } from '../src/shared/navigation';
import { terrainHeight } from '../src/shared/terrain';
import { createWorld } from '../src/shared/world';
import type { ActorState, InputFrame } from '../src/shared/types';

// The Capela do Morro's stone stair is the chapel's front door: bots used to
// climb to it only by the long south-east path, because the 4 m route grid
// never ran up the flight between its cheek walls.
const base = createWorld();
type Runtime = { state: ActorState; brain: ReturnType<typeof createBrain>; input: InputFrame };
const { x: sx, z: sz, risers, run, halfWidth } = CAPELA_STAIR;
const footX = sx + risers * run / 2, headX = sx - risers * run / 2;

function climb(start: { x: number; z: number }, seed: number) {
  // A prize on the adro before the chapel door draws the bot up the hill.
  const x = CAPELA[0] + 9, z = CAPELA[1] - 3.5;
  const item = { id: 'adro-prize', kind: 'weapon' as const, weapon: 'm4' as const, x, y: walkableHeight(x, z, base), z };
  const world = { ...base, loot: [item], chests: [] };
  const sim = new Simulation(world, { mode: 'battle-royale', capacity: 2, bots: true, difficulty: 'normal', duration: 300 },
    [{ id: 'player', name: 'P', color: '#fff', ready: true, connected: true }], 'capela-bot', seed);
  const actors = (sim as any).actors as Map<string, Runtime>, bot = actors.get('bot-1')!;
  for (const actor of actors.values()) { actor.state.alive = false; actor.state.hp = 0; actor.state.respawnAt = 0; }
  Object.assign(actors.get('player')!.state, { alive: true, hp: 100, stage: 'ground', grounded: true,
    pos: { x: 110, y: terrainHeight(110, -110), z: -110 }, protectionUntil: 1e9 });
  const pos = { x: start.x, y: walkableHeight(start.x, start.z, base), z: start.z };
  Object.assign(bot.state, { alive: true, hp: 100, stage: 'ground', grounded: true, pos,
    velocity: { x: 0, y: 0, z: 0 }, weapons: [{ id: 'pistol', ammo: 17, reserve: 51, rarity: 0, box: 2 }], slot: 0 });
  bot.brain = createBrain(false, 2, bot.state.pos, 1); bot.brain.leisureAt = Infinity;
  Object.assign((sim as any).zone, { radius: 999, nextRadius: 900 });
  const trace: { x: number; y: number; z: number; jump: boolean }[] = [];
  let collected = false;
  for (let i = 0; i < 40 * 60 && !collected; i++) {
    sim.step(1 / 60);
    trace.push({ ...bot.state.pos, jump: bot.input.jump });
    collected = bot.state.weapons.some(weapon => weapon.id === 'm4');
  }
  return { collected, trace, bot, item };
}

describe('bots climb the Capela do Morro by its stone stair', () => {
  it.each([
    ['the foot of the stair', { x: footX + 4, z: sz }, 3],
    ['Rua do Sul, below the Capela street', { x: -30, z: 40 }, 5],
  ])('walks up the flight from %s to the adro', (_, start, seed) => {
    const h = climb(start, seed);
    expect(h.collected, JSON.stringify({ pos: h.bot.state.pos, brain: h.bot.brain.goal })).toBe(true);
    // Every tread from foot to head is walked between the cheek walls ...
    const onFlight = h.trace.filter(p => p.x < footX - .5 && p.x > headX + .5 && Math.abs(p.z - sz) < halfWidth);
    expect(Math.max(...onFlight.map(p => p.y)) - Math.min(...onFlight.map(p => p.y))).toBeGreaterThan(9);
    // ... by ordinary walking, never by the south-east path round the hill.
    expect(h.trace.some(p => p.z > sz + 9)).toBe(false);
    expect(h.trace.some(p => p.jump)).toBe(false);
  });
});
