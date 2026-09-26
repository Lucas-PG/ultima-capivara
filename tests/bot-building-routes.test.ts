import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { BotBuildingRoutes } from '../src/simulation/building-routes';
import { createBrain } from '../src/simulation/bots';
import { buildBuildingRoutes, buildingPoint } from '../src/shared/building-access';
import { KIT_PIECES } from '../src/shared/kit-collision';
import { terrainHeight } from '../src/shared/terrain';
import { createWorld } from '../src/shared/world';
import type { ActorState, InputFrame, KitPlacement, Vec3 } from '../src/shared/types';
import { walkTraversal } from './helpers/traversal-probe';

const base = createWorld();
base.buildingRoutes = buildBuildingRoutes(base);
const houses = base.pieces!.filter(piece => piece.piece === 'house_tall');
const upper = KIT_PIECES.house_tall.traversal!.floors.find(floor => floor.id === 'upper-room')!;
type Runtime = { state: ActorState; brain: ReturnType<typeof createBrain>; input: InputFrame; landedAt: number };

function scenario(piece: KitPlacement, seed = 7, start?: Vec3) {
  const route = base.buildingRoutes!.find(route => route.pieceId === piece.id && route.floorId === upper.id)!;
  const item = { id: 'upper-upgrade', kind: 'weapon' as const, weapon: 'm4' as const, ...buildingPoint(piece, [1, upper.y, -1.5]) };
  const world = { ...base, loot: [item], chests: [] };
  const sim = new Simulation(world, { mode: 'battle-royale', capacity: 2, bots: true, difficulty: 'normal', duration: 300 },
    [{ id: 'player', name: 'P', color: '#fff', ready: true, connected: true }], 'building-bot', seed);
  const actors = (sim as any).actors as Map<string, Runtime>, bot = actors.get('bot-1')!;
  for (const actor of actors.values()) { actor.state.alive = false; actor.state.hp = 0; actor.state.respawnAt = 0; }
  Object.assign(actors.get('player')!.state, { alive: true, hp: 100, stage: 'ground', grounded: true,
    pos: { x: -110, y: terrainHeight(-110, -110), z: -110 }, protectionUntil: 1e9 });
  Object.assign(bot.state, { alive: true, hp: 100, stage: 'ground', grounded: true, pos: { ...(start ?? route.points[0]) },
    velocity: { x: 0, y: 0, z: 0 }, weapons: [{ id: 'pistol', ammo: 17, reserve: 51, rarity: 0 }], slot: 0 });
  bot.brain = createBrain(false, 2, bot.state.pos, 1); bot.brain.leisureAt = Infinity;
  Object.assign((sim as any).zone, { radius: 999, nextRadius: 900 });
  for (let i = 0; i < 181; i++) sim.step(1 / 60);
  const trace: { x: number; y: number; z: number; jump: boolean; vy: number }[] = [];
  let walkingVy = 0;
  const observe = (actor: ActorState) => { walkingVy = Math.min(walkingVy, actor.velocity.y); };
  const up = walkTraversal(world, bot.state, route.points, observe);
  const down = walkTraversal(world, up.actor, [...route.points].reverse(), observe);
  expect(up.ok && down.ok, 'The bot fixture must use a route a player can walk').toBe(true);
  const advance = (until: () => boolean, seconds = 18) => {
    for (let i = 0; i < seconds * 60 && !until(); i++) {
      const previous = { ...bot.state.pos };
      sim.step(1 / 60);
      const pos = bot.state.pos;
      expect(Math.hypot(pos.x - previous.x, pos.y - previous.y, pos.z - previous.z)).toBeLessThan(.5);
      trace.push({ ...pos, jump: bot.input.jump, vy: bot.state.velocity.y });
    }
    return until();
  };
  return { sim, world, bot, item, route, trace, advance, walkingVy };
}

describe('bots use authored building routes through ordinary movement', () => {
  it.each(houses)('collects upstairs loot and walks back down $id', piece => {
    const h = scenario(piece);
    const collected = h.advance(() => h.bot.state.weapons.some(weapon => weapon.id === 'm4'));
    expect(collected, JSON.stringify({ piece: piece.id, pos: h.bot.state.pos, brain: h.bot.brain })).toBe(true);
    expect(h.bot.state.pos.y).toBeCloseTo(h.item.y, 1);
    const entry = h.route.points[0];
    h.bot.brain.goal = { ...entry }; h.bot.brain.loot = null;
    const returned = h.advance(() => Math.hypot(h.bot.state.pos.x - entry.x, h.bot.state.pos.z - entry.z) < .3 && Math.abs(h.bot.state.pos.y - entry.y) < .15);
    expect(returned, JSON.stringify({ piece: piece.id, pos: h.bot.state.pos, entry })).toBe(true);
    expect(h.trace.some(point => point.jump)).toBe(false);
    // The capsule can overhang a tread before dropping to the next one. Match
    // actual ordinary walking, allowing one gravity tick, not a roof shortcut.
    expect(Math.min(...h.trace.map(point => point.vy))).toBeGreaterThanOrEqual(h.walkingVy - .4);
    expect(h.sim.snapshot().loot.find(item => item.id === h.item.id)?.active).toBe(false);
  });

  it('joins the real ground entrance from outside before collecting upstairs loot', () => {
    const piece = houses[0], route = base.buildingRoutes!.find(route => route.pieceId === piece.id && route.floorId === upper.id)!;
    const entry = route.points[0], next = route.points[1], length = Math.hypot(next.x - entry.x, next.z - entry.z);
    const start = { x: entry.x - (next.x - entry.x) / length * 2.5, y: entry.y,
      z: entry.z - (next.z - entry.z) / length * 2.5 };
    start.y = terrainHeight(start.x, start.z);
    const h = scenario(piece, 11, start);
    expect(h.advance(() => h.bot.state.weapons.some(weapon => weapon.id === 'm4')),
      JSON.stringify({ pos: h.bot.state.pos, entry, brain: h.bot.brain })).toBe(true);
    expect(h.trace.some(point => Math.hypot(point.x - entry.x, point.z - entry.z) < .2 && Math.abs(point.y - entry.y) < .2)).toBe(true);
    expect(h.trace.some(point => point.jump)).toBe(false);
  });

  it('retraces the visited stairs if another player takes the target during ascent', () => {
    const h = scenario(houses[0], 19), entry = h.route.points[0];
    expect(h.advance(() => h.bot.state.pos.y > entry.y + .9)).toBe(true);
    (h.sim as any).loot[0].active = false;
    h.bot.brain.goal = { ...entry }; h.bot.brain.thinkAt = 0;
    expect(h.advance(() => Math.hypot(h.bot.state.pos.x - entry.x, h.bot.state.pos.z - entry.z) < .3 && Math.abs(h.bot.state.pos.y - entry.y) < .15),
      JSON.stringify({ pos: h.bot.state.pos, entry })).toBe(true);
    expect(h.bot.state.weapons.some(weapon => weapon.id === 'm4')).toBe(false);
    expect(h.trace.some(point => point.jump)).toBe(false);
    expect(Math.min(...h.trace.map(point => point.vy))).toBeGreaterThanOrEqual(h.walkingVy - .4);
  });

  it('does not connect coincident XZ positions on different floors or invent routes for old worlds', () => {
    const h = scenario(houses[0]);
    const router = new BotBuildingRoutes(h.world, false), bot = {};
    const from = { ...h.item, y: h.route.points[0].y };
    const step = router.step(bot, from, h.item);
    expect(step?.point).toEqual(h.route.points[0]); expect(step?.precise).toBe(false);
    expect(new BotBuildingRoutes({ ...h.world, buildingRoutes: undefined }, false).step(bot, from, h.item)).toBe(null);
    expect(h.world.navigation).toBe(base.navigation);
  });
});
