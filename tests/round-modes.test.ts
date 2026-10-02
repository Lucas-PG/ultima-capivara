import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { fastPart, gearPart, rebuildFrame, worldPart } from '../src/network/codec';
import { validAction, validConfig } from '../src/network/session';
import { BUY_SECONDS, DUEL_READY_SECONDS, ELIMINATION_MONEY, lossMoney, MAX_MONEY, ROUND_BREAK_SECONDS, ROUND_SECONDS, ROUND_TARGET, SHOP, START_MONEY, WIN_MONEY } from '../src/shared/round-modes';
import { WEAPONS } from '../src/shared/weapons';
import { emptyInput } from '../src/shared/math';
import { terrainHeight } from '../src/shared/terrain';
import { createWorld } from '../src/shared/world';
import { clearSpawn } from '../src/shared/collision';
import type { ActorState, PlayerProfile, RoomConfig, WorldSpec } from '../src/shared/types';

const point = (x: number, z: number) => ({ x, y: terrainHeight(x, z), z });
const world: WorldSpec = { version: 'round-test', size: 260, colliders: [], objects: [], districts: [],
  spawns: [-35, -25, -15, 15, 25, 35].map(x => ({ ...point(x, -20), yaw: 0, mode: 'deathmatch' })),
  loot: [{ id: 'free-sniper', kind: 'weapon', weapon: 'sniper', ...point(-25, -20) }], chests: [{ id: 'chest', ...point(-25, -20) }] };
const profile = (id: string): PlayerProfile => ({ id, name: id, color: '#e76f51', connected: true, ready: true });
const advance = (sim: Simulation, seconds: number) => { for (let i = 0; i < Math.ceil(seconds * 60); i++) sim.step(1 / 60); };
function fixture(mode: RoomConfig['mode'] = 'duel', bots = false, teamSize: 2 | 3 = 2) {
  const players = bots ? [profile('a')] : Array.from({ length: mode === 'duel' ? 2 : teamSize * 2 }, (_, n) => profile(String.fromCharCode(97 + n)));
  const config: RoomConfig = { mode, capacity: mode === 'duel' ? 2 : teamSize * 2, teamSize, bots, difficulty: 'normal', duration: 300 };
  const sim = new Simulation(world, config, players, 'a'.repeat(48), 40), runtime = sim as any;
  advance(sim, 3.1);
  const a = runtime.actors.get('a'), b = runtime.actors.get('b') ?? runtime.actors.get('bot-1');
  return { sim, runtime, a, b, config };
}
const live = (sim: Simulation) => advance(sim, sim.snapshot().round!.endsAt - sim.snapshot().time + .05);
function eliminate(runtime: any, victim: any, attacker: any = null) { runtime.damage(victim, 1000, attacker?.state.id ?? null, 'pistol', false); }
function wipe(runtime: any, team: number, attacker: any) { for (const actor of runtime.actors.values()) if (actor.state.team === team) eliminate(runtime, actor, attacker); }

describe('Duelo shared equipment and round flow', () => {
  it('draws one identical weapon for both capybaras and renews equal kits every round', () => {
    const { sim, runtime, a, b } = fixture();
    const first = sim.snapshot();
    expect(first.actors).toHaveLength(2);
    expect(first.round).toMatchObject({ number: 1, phase: 'buy', score: [0, 0], target: ROUND_TARGET });
    expect(first.actors[0].weapons).toEqual(first.actors[1].weapons);
    expect(first.actors.every(actor => actor.armor === 50)).toBe(true);
    expect(first.loot.every(item => !item.active)).toBe(true);
    expect(first.openedChests).toEqual(['chest']);
    const original = first.round!.weapon;
    live(sim); eliminate(runtime, b, a); advance(sim, .02);
    expect(sim.snapshot().round).toMatchObject({ phase: 'over', score: [1, 0], winner: 0 });
    advance(sim, ROUND_BREAK_SECONDS + .1);
    const next = sim.snapshot();
    expect(next.round).toMatchObject({ number: 2, phase: 'buy', score: [1, 0] });
    expect(next.round!.weapon).not.toBe(original);
    expect(next.actors.every(actor => actor.alive && actor.hp === 100 && actor.armor === 50)).toBe(true);
    expect(next.actors[0].weapons).toEqual(next.actors[1].weapons);
  });
  it('freezes movement and all damage/actions before the round, never respawns a mid-round casualty', () => {
    const { sim, runtime, a, b } = fixture();
    const before = { ...a.state.pos };
    sim.input('a', { ...emptyInput(), seq: 1, moveZ: 1, fire: true, clientTime: sim.snapshot().time });
    sim.action('a', { type: 'trigger', id: 1, yaw: 0, pitch: 0, lean: 0, ads: false, clientTime: sim.snapshot().time });
    eliminate(runtime, a, b); advance(sim, .5);
    expect(a.state.pos).toEqual(before); expect(a.state.alive).toBe(true); expect(a.shots).toBe(0);
    live(sim); eliminate(runtime, a, b); advance(sim, 3.2);
    expect(a.state.alive).toBe(false); expect(a.state.respawnAt).toBe(0);
  });
  it('ends the match by rounds, preserving the winner and result instead of total eliminations', () => {
    const { sim, runtime, a, b } = fixture();
    b.state.kills = 100;
    for (let round = 0; round < ROUND_TARGET; round++) {
      live(sim); eliminate(runtime, b, a); advance(sim, .02); advance(sim, ROUND_BREAK_SECONDS + .1);
    }
    expect(sim.snapshot().phase).toBe('results');
    expect(sim.snapshot().results.find(result => result.id === 'a')).toMatchObject({ winner: true, place: 1 });
    expect(sim.snapshot().round?.score).toEqual([ROUND_TARGET, 0]);
  });
  it('draws a timeout or simultaneous wipe without awarding a round', () => {
    for (const timeout of [true, false]) {
      const { sim, runtime, a, b } = fixture(); live(sim);
      if (timeout) runtime.time = sim.snapshot().round!.endsAt;
      else { eliminate(runtime, a); eliminate(runtime, b); }
      advance(sim, .02);
      expect(sim.snapshot().round).toMatchObject({ phase: 'over', winner: null, score: [0, 0] });
    }
  });
});

describe('Team elimination and economy', () => {
  it('fills exact 2v2 and 3v3 teams and waits for the last opponent', () => {
    for (const teamSize of [2, 3] as const) {
      const { sim, runtime, a, b } = fixture('squads', true, teamSize);
      const actors = sim.snapshot().actors;
      expect(actors).toHaveLength(teamSize * 2);
      expect(actors.filter(actor => actor.team === 0)).toHaveLength(teamSize);
      runtime.updateBot = () => {};
      live(sim); eliminate(runtime, b, a); advance(sim, .02);
      expect(sim.snapshot().round?.phase).toBe('live');
      wipe(runtime, 1, a); advance(sim, .02);
      expect(sim.snapshot().round).toMatchObject({ phase: 'over', winner: 0, score: [1, 0] });
    }
  });
  it('ignores allied bullets, buys and damage outside the buy/live windows', () => {
    const { sim, runtime, a, b } = fixture('squads');
    const ally = runtime.actors.get('c');
    sim.action('a', { type: 'buy', id: 1, round: 1, item: 'armor' });
    expect(a.state.armor).toBe(100);
    live(sim); eliminate(runtime, ally, a);
    expect(ally.state.hp).toBe(100); expect(a.state.kills).toBe(0);
    a.state.money = 16000;
    sim.action('a', { type: 'buy', id: 2, round: 1, item: 'm4' });
    expect(a.state.money).toBe(16000); expect(a.state.weapons.some((w: any) => w.id === 'm4')).toBe(false);
    eliminate(runtime, b, a); advance(sim, .02);
    expect(a.state.money).toBe(MAX_MONEY);
  });
  it('deduplicates purchases, checks price/item/round, and refunds only this buy phase', () => {
    const { sim, a } = fixture('squads');
    sim.action('a', { type: 'buy', id: 1, round: 1, item: 'm4' });
    expect(a.state.money).toBe(START_MONEY);
    sim.action('a', { type: 'buy', id: 2, round: 9, item: 'armor' });
    sim.action('a', { type: 'buy', id: 3, round: 1, item: 'bogus' as any });
    expect(a.state.money).toBe(START_MONEY);
    sim.action('a', { type: 'buy', id: 4, round: 1, item: 'armor' });
    sim.action('a', { type: 'buy', id: 4, round: 1, item: 'armor' });
    expect(a.state.money).toBe(150); expect(a.state.armor).toBe(100);
    sim.action('a', { type: 'refund', id: 5, round: 1 });
    expect(a.state.money).toBe(START_MONEY); expect(a.state.armor).toBe(0);
    sim.action('a', { type: 'refund', id: 6, round: 1 });
    expect(a.state.money).toBe(START_MONEY);
    live(sim); sim.action('a', { type: 'refund', id: 7, round: 1 });
    expect(a.state.money).toBe(START_MONEY);
  });
  it('awards eliminations and wins once, carries survivor gear, and supplies a fallen player with free basics', () => {
    const { sim, runtime, a, b } = fixture('squads');
    a.state.money = 5000;
    sim.action('a', { type: 'buy', id: 1, round: 1, item: 'm4' });
    sim.action('a', { type: 'buy', id: 2, round: 1, item: 'armor' });
    sim.action('a', { type: 'buy', id: 3, round: 1, item: 'medkit' });
    live(sim);
    a.state.weapons[0].ammo = 1; a.state.weapons[0].rarity = 2; a.state.armor = 37; a.state.hp = 15;
    wipe(runtime, 1, a); advance(sim, .02);
    expect(a.state.money).toBe(5000 - 2900 - 650 - 400 + 2 * ELIMINATION_MONEY + WIN_MONEY);
    expect(b.state.money).toBe(START_MONEY + lossMoney(1));
    const awarded = a.state.money; advance(sim, 1); expect(a.state.money).toBe(awarded);
    advance(sim, ROUND_BREAK_SECONDS);
    expect(a.state.hp).toBe(100); expect(a.state.armor).toBe(37); expect(a.state.consumables.medkit).toBe(1);
    expect(a.state.weapons[0]).toMatchObject({ id: 'm4', rarity: 2, ammo: WEAPONS.m4.magazine });
    expect(b.state.weapons.map((weapon: any) => weapon.id)).toEqual(['pistol', 'machete']); expect(b.state.armor).toBe(0);
    expect(lossMoney(1)).toBe(1900); expect(lossMoney(2)).toBe(2400); expect(lossMoney(10)).toBe(3400);
  });
  it('has bots buy protection on the pistol round and upgrade with earned money', () => {
    const { sim, runtime, a, b } = fixture('squads', true);
    expect(b.state.armor).toBe(100); expect(b.state.money).toBe(150);
    runtime.updateBot = () => {};
    live(sim); wipe(runtime, 1, a); advance(sim, .02); advance(sim, ROUND_BREAK_SECONDS + .05);
    runtime.botBuy(b);
    expect(b.state.weapons.some((weapon: any) => weapon.id === 'smg')).toBe(true);
    expect(b.state.armor).toBe(100); expect(b.state.money).toBeGreaterThanOrEqual(0);
  });
  it('marks every winning teammate first, even a teammate eliminated in the last round', () => {
    const { sim, runtime, a, b } = fixture('squads');
    live(sim); runtime.round.score = [ROUND_TARGET - 1, 0];
    eliminate(runtime, runtime.actors.get('c'), b); wipe(runtime, 1, a); advance(sim, .02); advance(sim, ROUND_BREAK_SECONDS + .05);
    expect(sim.snapshot().results.filter(result => result.winner).map(result => result.id).sort()).toEqual(['a', 'c']);
    expect(sim.snapshot().results.filter(result => result.winner).every(result => result.place === 1)).toBe(true);
  });
  it('keeps a disconnected body vulnerable during grace, then ends a round after forfeiture', () => {
    const { sim, runtime, a, b } = fixture(); live(sim);
    sim.player(profile('b'), 'disconnect'); advance(sim, 2);
    expect(b.state.alive).toBe(true);
    advance(sim, 29);
    expect(b.state.alive).toBe(false); expect(sim.snapshot().round).toMatchObject({ phase: 'over', winner: 0 });
    expect(a.state.kills).toBe(0);
  });
});

describe('Round transport and real island starts', () => {
  it('validates capacities, buy identities, money limits and round snapshots', () => {
    const { sim, config } = fixture('squads');
    expect(validConfig(config)).toBe(true); expect(validConfig({ ...config, capacity: 5 })).toBe(false);
    expect(validConfig({ ...config, teamSize: 4 })).toBe(false);
    expect(validConfig({ ...config, mode: 'duel', capacity: 2 })).toBe(true);
    expect(validAction({ type: 'buy', id: 1, round: 1, item: 'm4' })).toBe(true);
    expect(validAction({ type: 'buy', id: 1, round: 0, item: 'm4' })).toBe(false);
    expect(validAction({ type: 'buy', id: 1, round: 1, item: '__proto__' })).toBe(false);
    const snapshot = sim.snapshot(), fast = fastPart(snapshot), world = worldPart(snapshot), gear = gearPart(snapshot);
    const guest = rebuildFrame(fast, world, gear);
    expect(guest?.round).toEqual(snapshot.round);
    expect(guest?.actors.map(a => [a.team, a.money])).toEqual(snapshot.actors.map(a => [a.team, a.money]));
    gear[0].money = MAX_MONEY + 1; expect(rebuildFrame(fast, world, gear)).toBeNull();
    gear[0].money = 0; fast.round!.score[0] = -1; expect(rebuildFrame(fast, world, gear)).toBeNull();
  });
  it('places both teams on clear, distinct town starts and switches ends next round', () => {
    const island = createWorld();
    const sim = new Simulation(island, { mode: 'squads', teamSize: 3, capacity: 6, bots: false, difficulty: 'normal', duration: 300 },
      Array.from({ length: 6 }, (_, n) => profile(String(n))), 'a'.repeat(48), 2);
    const actors = sim.snapshot().actors;
    expect(actors.every(actor => clearSpawn(actor.pos, island))).toBe(true);
    expect(new Set(actors.map(actor => `${actor.pos.x}:${actor.pos.z}`)).size).toBe(6);
    const average = (team: number, list: ActorState[]) => list.filter(a => a.team === team).reduce((sum, a) => sum + a.pos.x, 0) / 3;
    expect(Math.abs(average(0, actors) - average(1, actors))).toBeGreaterThan(25);
    (sim as any).prepareRound();
    expect(Math.sign(average(0, sim.snapshot().actors) - average(1, sim.snapshot().actors))).toBe(-Math.sign(average(0, actors) - average(1, actors)));
  });
});

it('replaces a practice bot with a guest who waits until the next round, preserving team size', () => {
  const { sim, runtime } = fixture('squads', true, 3); runtime.updateBot = () => {};
  live(sim);
  const ally = runtime.actors.get('bot-1').state, before = { hp: ally.hp, armor: ally.armor };
  const at = { x: ally.pos.x, y: ally.pos.y + .6, z: ally.pos.z };
  runtime.projectiles.push({ owner: 'bot-5', weapon: 'coco', origin: at, pos: { ...at }, velocity: { x: 0, y: 0, z: 0 }, life: 0 });
  sim.player(profile('guest'), 'join'); advance(sim, .02);
  expect({ hp: ally.hp, armor: ally.armor }).toEqual(before);
  const arrived = sim.snapshot();
  expect(arrived.actors).toHaveLength(6);
  expect(arrived.actors.filter(actor => actor.team === 1)).toHaveLength(3);
  expect(arrived.actors.find(actor => actor.id === 'guest')).toMatchObject({ alive: false, team: 1 });
  runtime.prepareRound();
  expect(sim.snapshot().actors.find(actor => actor.id === 'guest')).toMatchObject({ alive: true, hp: 100, team: 1 });
});

it('keeps squads spectating on allies and leaves the duel opponent watchable', async () => {
  const { roundSpectators } = await import('../src/shared/round-modes');
  const { sim } = fixture('squads');
  expect(roundSpectators(sim.snapshot(), 'a').map(actor => actor.id)).toEqual(['a', 'c']);
  const duel = fixture().sim;
  expect(roundSpectators(duel.snapshot(), 'a')).toHaveLength(2);
});
