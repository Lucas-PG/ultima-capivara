import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { clearSpawn, hasLineOfSight, moveActor, raycastWorld } from '../src/shared/collision';
import { terrainHeight } from '../src/shared/terrain';
import { createWorld } from '../src/shared/world';
import { inArena } from '../src/shared/layout';
import { advanceAds, damageFalloff, shotSpread, WEAPONS } from '../src/shared/weapons';
import { finiteTree } from '../src/network/codec';
import type { ActorState, InputFrame, PlayerProfile, RoomConfig, WorldSpec } from '../src/shared/types';

const world = (withWall = false): WorldSpec => ({
  version: 'test', size: 256, objects: [], districts: [], loot: [{ id: 'armor-1', kind: 'armor', x: 0, y: terrainHeight(0, 0), z: 0 }],
  chests: [{ id: 'chest-1', x: 0, y: terrainHeight(0, 0), z: 0 }],
  colliders: withWall ? [{ id: 'wall', min: { x: -1, y: 0, z: -2.8 }, max: { x: 1, y: 5, z: -2.2 }, material: 'stone' }] : [],
  spawns: [
    { x: 0, y: terrainHeight(0, 0), z: 0, mode: 'both', yaw: 0 },
    { x: 0, y: terrainHeight(0, -5), z: -5, mode: 'both', yaw: 0 },
  ],
});
const config: RoomConfig = { mode: 'deathmatch', capacity: 2, bots: false, difficulty: 'normal', duration: 300 };
const profiles: PlayerProfile[] = [
  { id: 'a', name: 'A', color: '#111111', ready: true, connected: true },
  { id: 'b', name: 'B', color: '#222222', ready: true, connected: true },
];
const input = (seq: number, extras: Partial<InputFrame> = {}): InputFrame => ({
  seq, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, sprint: false, crouch: false, jump: false,
  fire: false, ads: false, lean: 0, clientTime: 0, ...extras,
});
const send = (sim: Simulation, id: string, seq: number, extras: Partial<InputFrame> = {}) => sim.input(id, input(seq, { clientTime: sim.snapshot().time, ...extras }));
function advance(sim: Simulation, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds * 4); i++) sim.step(Math.min(.25, seconds - i * .25));
}

describe('authoritative simulation', () => {
  it('uses a fresh match seed by default and repeats exactly with an injected seed', () => {
    const mode = { ...config, mode: 'battle-royale' as const };
    const one = new Simulation(world(), mode, [profiles[0]], 'seed');
    const two = new Simulation(world(), mode, [profiles[0]], 'seed');
    expect([one.snapshot().plane.x, one.snapshot().plane.z]).not.toEqual([two.snapshot().plane.x, two.snapshot().plane.z]);
    const fixedOne = new Simulation(world(), mode, [profiles[0]], 'seed', 12345);
    const fixedTwo = new Simulation(world(), mode, [profiles[0]], 'seed', 12345);
    expect(fixedOne.snapshot()).toEqual(fixedTwo.snapshot());
    advance(fixedOne, 4);
    advance(fixedTwo, 4);
    expect(fixedOne.snapshot()).toEqual(fixedTwo.snapshot());
  });

  it('keeps the first settled shot accurate, widens bursts and movement, then recovers', () => {
    expect(shotSpread('m4', 1, 0, false, 0)).toBeCloseTo(WEAPONS.m4.adsSpread);
    expect(shotSpread('m4', 1, 3.9, false, 0)).toBeGreaterThan(shotSpread('m4', 1, 0, false, 0));
    expect(shotSpread('m4', 1, 0, true, 0)).toBeGreaterThan(shotSpread('m4', 1, 3.9, false, 0));
    expect(shotSpread('m4', 1, 0, false, 1)).toBeGreaterThan(shotSpread('m4', 1, 0, false, 0));
    const sim = new Simulation(world(), config, [profiles[0]], 'spread-recovery', 7);
    advance(sim, 3.1);
    const actor = (sim as any).actors.get('a');
    for (let i = 0; i < 6; i++) { send(sim, 'a', i + 1, { fire: true }); advance(sim, .05); }
    expect(sim.drainEvents().filter(e => e.type === 'shot').length).toBeGreaterThan(2);
    expect(actor.shotHeat).toBeGreaterThan(.2);
    send(sim, 'a', 7, { fire: false });
    advance(sim, .6);
    expect(actor.shotHeat).toBe(0);
  });

  it('keeps burst heat on re-selecting the current slot and clears it on a real switch', () => {
    const sim = new Simulation(world(), config, [profiles[0]], 'same-slot', 23);
    advance(sim, 3.1);
    const actor = (sim as any).actors.get('a');
    (sim as any).fire(actor);
    actor.nextShot = 0; actor.wasFiring = false;
    (sim as any).fire(actor);
    const heat = actor.shotHeat;
    expect(heat).toBeGreaterThan(.3);
    sim.action('a', { type: 'slot', id: 1, slot: 0 });
    expect(actor.shotHeat).toBe(heat);
    expect(actor.state.shotHeat).toBe(heat);
    sim.action('a', { type: 'slot', id: 2, slot: 1 });
    expect(actor.shotHeat).toBe(0);
    expect(actor.state.shotHeat).toBe(0);
  });

  it('widens real seeded shot rays with burst, movement and airtime, then narrows after cooling', () => {
    const sim = new Simulation(world(true), config, [profiles[0]], 'ray-spread', 911);
    advance(sim, 3.1);
    const actor = (sim as any).actors.get('a');
    actor.state.weapons[0] = { id: 'm4', ammo: 2000, reserve: 0, rarity: 0 };
    actor.state.slot = 0;
    actor.state.pos = { x: 0, y: terrainHeight(0, 0), z: 0 };
    actor.state.yaw = actor.state.pitch = 0;
    const fire = () => {
      actor.nextShot = 0; actor.wasFiring = false;
      (sim as any).fire(actor);
      const shot = sim.drainEvents().find(event => event.type === 'shot' && event.actor === 'a');
      if (shot?.type !== 'shot') throw new Error('Shot was not fired');
      const ray = { x: shot.end.x - shot.origin.x, y: shot.end.y - shot.origin.y, z: shot.end.z - shot.origin.z };
      return Math.hypot(ray.x, ray.y) / Math.abs(ray.z);
    };
    const sample = (heat: number, speed: number, grounded: boolean) => {
      actor.state.velocity.x = speed; actor.state.grounded = grounded;
      let total = 0;
      for (let i = 0; i < 240; i++) { actor.shotHeat = actor.state.shotHeat = heat; total += fire(); }
      return total / 240;
    };
    const settled = sample(0, 0, true);
    actor.shotHeat = actor.state.shotHeat = 0;
    for (let i = 0; i < 4; i++) fire();
    const burstHeat = actor.shotHeat;
    expect(burstHeat).toBeGreaterThan(.9);
    const burst = sample(burstHeat, 0, true);
    const moving = sample(0, 3.9, true);
    const airborne = sample(0, 0, false);
    actor.state.grounded = true; actor.state.velocity.x = 0;
    actor.shotHeat = actor.state.shotHeat = burstHeat;
    advance(sim, .6);
    expect(actor.shotHeat).toBe(0);
    const recovered = sample(actor.shotHeat, 0, true);
    expect(burst).toBeGreaterThan(settled * 1.15);
    expect(moving).toBeGreaterThan(settled * 1.1);
    expect(airborne).toBeGreaterThan(moving * 1.1);
    expect(recovered).toBeLessThan(burst * .9);
  });

  it('makes scoped accuracy arrive over the weapon transition instead of on button press', () => {
    expect(advanceAds('m4', 0, true, 1 / 60)).toBeGreaterThan(0);
    expect(advanceAds('m4', 0, true, 1 / 60)).toBeLessThan(1);
    expect(advanceAds('sniper', 0, true, .16)).toBeLessThan(advanceAds('pistol', 0, true, .16));
    const half = advanceAds('m4', 0, true, .11);
    expect(shotSpread('m4', half, 0, false, 0)).toBeGreaterThan(WEAPONS.m4.adsSpread);
    expect(shotSpread('m4', half, 0, false, 0)).toBeLessThan(WEAPONS.m4.spread);
    expect(advanceAds('m4', 1, false, .22)).toBe(0);
  });

  it('records fired shots, distinct hit shots, headshots, chests and elapsed survival from the simulation', () => {
    const sim = new Simulation(world(), config, profiles, 'match-stats', 7);
    advance(sim, 3.1);
    const shooter = (sim as any).actors.get('a'), target = (sim as any).actors.get('b');
    shooter.state.pos = { x: 0, y: terrainHeight(0, 0), z: 0 };
    target.state.pos = { x: 0, y: terrainHeight(0, -5), z: -5 };
    target.state.protectionUntil = 0;
    shooter.state.yaw = 0;
    shooter.state.pitch = Math.atan2(target.state.pos.y + 1.6 - shooter.state.pos.y - 1.62, 5);
    shooter.adsAmount = 1;
    (sim as any).random = () => .5;
    (sim as any).fire(shooter);
    sim.action('a', { type: 'interact', id: 1, target: 'chest-1' });
    advance(sim, 5);
    (sim as any).finish();
    const result = sim.snapshot().results.find(a => a.id === 'a')!;
    expect(result).toMatchObject({ shots: 1, hits: 1, headshots: 1, chests: 1 });
    expect(result.survived).toBeGreaterThanOrEqual(5);
    expect(Number.isInteger(result.survived * 10)).toBe(true);
  });

  it('counts a shotgun blast once even when several pellets hit and freezes BR survival at elimination', () => {
    const sim = new Simulation(world(), { ...config, mode: 'battle-royale', capacity: 3 }, [...profiles, { id: 'c', name: 'C', color: '#333333', ready: true, connected: true }], 'pellet-stats', 8);
    advance(sim, 3.5);
    const shooter = (sim as any).actors.get('a'), target = (sim as any).actors.get('b');
    shooter.state.stage = target.state.stage = 'ground';
    shooter.state.pos = { x: 0, y: terrainHeight(0, 0), z: 0 };
    target.state.pos = { x: 0, y: terrainHeight(0, -5), z: -5 };
    target.state.protectionUntil = 0;
    shooter.state.weapons[0] = { id: 'shotgun', ammo: 6, reserve: 6, rarity: 0 };
    shooter.state.slot = 0; shooter.adsAmount = 1;
    shooter.state.yaw = 0;
    shooter.state.pitch = Math.atan2(target.state.pos.y + 1.6 - shooter.state.pos.y - 1.62, 5);
    (sim as any).random = () => .5;
    (sim as any).fire(shooter);
    expect(shooter.shots).toBe(1);
    expect(shooter.hits).toBe(1);
    expect(shooter.headshots).toBe(1);
    if (target.state.alive) (sim as any).kill(target, shooter, 'shotgun');
    const eliminatedAt = target.eliminatedAt;
    advance(sim, .5);
    (sim as any).finish();
    const winner = sim.snapshot().results.find(a => a.id === 'a')!;
    const eliminated = sim.snapshot().results.find(a => a.id === 'b')!;
    expect(eliminated.survived).toBeCloseTo(Math.round((eliminatedAt - (sim as any).matchStartedAt) * 10) / 10, 1);
    expect(winner.survived).toBeGreaterThan(eliminated.survived);
  });

  it('buffers a jump pressed just before landing for one tenth of a second', () => {
    const sim = new Simulation(world(), config, [profiles[0]], 'jump-buffer', 5);
    advance(sim, 3.1);
    const actor = (sim as any).actors.get('a');
    actor.state.pos.y = terrainHeight(actor.state.pos.x, actor.state.pos.z) + .01;
    actor.state.velocity.y = -2; actor.state.grounded = false;
    sim.action('a', { type: 'jump', id: 1 });
    advance(sim, 1 / 60);
    expect(actor.state.grounded).toBe(true);
    advance(sim, 1 / 60);
    expect(actor.state.velocity.y).toBeGreaterThan(6);
    const expired = new Simulation(world(), config, [profiles[0]], 'expired-jump', 5);
    advance(expired, 3.1);
    const late = (expired as any).actors.get('a');
    late.state.pos.y = terrainHeight(late.state.pos.x, late.state.pos.z) + 1;
    late.state.velocity.y = 0; late.state.grounded = false;
    expired.action('a', { type: 'jump', id: 1 });
    advance(expired, .12);
    expect(late.jumpQueued).toBe(false);
  });

  it('reconciles a replay of shared movement with the host after acceleration and jump inputs', () => {
    const w = world();
    const sim = new Simulation(w, config, [profiles[0]], 'reconcile', 10);
    advance(sim, 3.1);
    const predicted = structuredClone(sim.snapshot().actors[0]);
    for (let i = 1; i <= 60; i++) {
      const frame = input(i, { moveZ: 1, jump: i >= 20 && i <= 25, clientTime: sim.snapshot().time });
      sim.input('a', frame);
      sim.step(1 / 60);
      moveActor(predicted, frame, w, 1 / 60);
    }
    const host = sim.snapshot().actors[0];
    expect(predicted.pos.x).toBeCloseTo(host.pos.x, 5);
    expect(predicted.pos.y).toBeCloseTo(host.pos.y, 5);
    expect(predicted.pos.z).toBeCloseTo(host.pos.z, 5);
    expect(predicted.velocity.x).toBeCloseTo(host.velocity.x, 5);
    expect(predicted.velocity.y).toBeCloseTo(host.velocity.y, 5);
    expect(predicted.velocity.z).toBeCloseTo(host.velocity.z, 5);
  });

  it('tapers short-range weapon damage without weakening close hits or marksman rifles', () => {
    expect(damageFalloff('smg', 18)).toBe(1);
    expect(damageFalloff('smg', 39)).toBeCloseTo(.825);
    expect(damageFalloff('smg', 80)).toBe(.65);
    expect(damageFalloff('pistol', 90)).toBe(.7);
    expect(damageFalloff('m4', 140)).toBe(.8);
    expect(damageFalloff('shotgun', 38)).toBeCloseTo(.2);
    expect(damageFalloff('dmr', 190)).toBe(1);
    expect(damageFalloff('sniper', 240)).toBe(1);
    const sim = new Simulation(world(), config, profiles, 'falloff-hit', 7);
    advance(sim, 5.1);
    const attacker = (sim as any).actors.get('a');
    const target = (sim as any).actors.get('b');
    target.state.pos = { x: 0, y: terrainHeight(0, -39), z: -39 };
    target.state.protectionUntil = 0;
    attacker.state.yaw = 0;
    attacker.state.pitch = Math.atan2(target.state.pos.y + 1 - attacker.state.pos.y - 1.62, 39);
    attacker.state.ads = true;
    (sim as any).random = () => .5;
    (sim as any).fire(attacker);
    const hit = sim.drainEvents().find(e => e.type === 'damage' && e.target === 'b');
    expect(hit?.type).toBe('damage');
    if (hit?.type !== 'damage') return;
    expect(hit.amount).toBeGreaterThan(13);
    expect(hit.amount).toBeLessThan(15);
  });

  it('fires one pistol round for a quick trigger press after the release frame arrives', () => {
    const sim = new Simulation(world(), config, [profiles[0]], 'quick-trigger');
    advance(sim, 3.1);
    sim.action('a', { type: 'slot', id: 1, slot: 1 });
    const press = { type: 'trigger' as const, id: 2, yaw: Math.PI / 2, pitch: 0, lean: 0, ads: true, clientTime: sim.snapshot().time };
    sim.action('a', { ...press, yaw: Infinity });
    sim.action('a', press);
    sim.action('a', press);
    sim.action('a', { ...press, id: 1 });
    sim.action('a', { ...press, id: 10000 });
    send(sim, 'a', 1, { fire: false });
    advance(sim, .02);
    expect(sim.snapshot().actors[0].weapons[1].ammo).toBe(16);
    const shots = sim.drainEvents().filter(e => e.type === 'shot');
    expect(shots).toHaveLength(1);
    // Straight along yaw π/2 (−x) until it meets the island's terrain or range.
    expect(shots[0].end.x).toBeLessThan(shots[0].origin.x - 20);
    expect(Math.abs(shots[0].end.z - shots[0].origin.z)).toBeLessThan(1);
    expect(sim.snapshot().actors[0].ads).toBe(true);
    advance(sim, .2);
    expect(sim.snapshot().actors[0].weapons[1].ammo).toBe(16);
    sim.action('a', { ...press, id: 3, clientTime: sim.snapshot().time });
    advance(sim, .02);
    expect(sim.snapshot().actors[0].weapons[1].ammo).toBe(15);
  });

  it('coalesces a trigger press with held automatic fire without an extra shot', () => {
    const sim = new Simulation(world(), config, [profiles[0]], 'held-trigger');
    advance(sim, 3.1);
    sim.action('a', { type: 'trigger', id: 1, yaw: 0, pitch: 0, lean: 0, ads: false, clientTime: sim.snapshot().time });
    send(sim, 'a', 1, { fire: true, firePressId: 1 });
    advance(sim, .02);
    expect(sim.snapshot().actors[0].weapons[0].ammo).toBe(24);
    advance(sim, .2);
    expect(sim.snapshot().actors[0].weapons[0].ammo).toBeLessThan(24);
    send(sim, 'a', 2, { fire: false });
    advance(sim, .02);
    const stopped = sim.snapshot().actors[0].weapons[0].ammo;
    advance(sim, .2);
    expect(sim.snapshot().actors[0].weapons[0].ammo).toBe(stopped);
  });

  it('does not replay a delayed reliable trigger after its held-fire frame already shot', () => {
    const sim = new Simulation(world(), config, [profiles[0]], 'delayed-trigger');
    advance(sim, 3.1);
    const pressTime = sim.snapshot().time;
    send(sim, 'a', 1, { fire: true, firePressId: 1 });
    advance(sim, .02);
    expect(sim.snapshot().actors[0].weapons[0].ammo).toBe(24);
    send(sim, 'a', 2, { fire: false });
    advance(sim, .15);
    sim.action('a', { type: 'trigger', id: 1, yaw: 0, pitch: 0, lean: 0, ads: false, clientTime: pressTime });
    advance(sim, .02);
    expect(sim.snapshot().actors[0].weapons[0].ammo).toBe(24);
    sim.action('a', { type: 'trigger', id: 2, yaw: 0, pitch: 0, lean: 0, ads: false, clientTime: pressTime });
    advance(sim, .02);
    expect(sim.snapshot().actors[0].weapons[0].ammo).toBe(23);
  });

  it('does not replay a delayed held frame after its reliable pistol trigger already shot', () => {
    const sim = new Simulation(world(), config, [profiles[0]], 'delayed-held-fire');
    advance(sim, 3.1);
    sim.action('a', { type: 'slot', id: 1, slot: 1 });
    sim.action('a', { type: 'trigger', id: 2, yaw: 0, pitch: 0, lean: 0, ads: false, clientTime: sim.snapshot().time });
    send(sim, 'a', 1, { fire: false });
    advance(sim, .02);
    expect(sim.snapshot().actors[0].weapons[1].ammo).toBe(16);
    advance(sim, .2);
    send(sim, 'a', 2, { fire: true, firePressId: 2 });
    advance(sim, .02);
    expect(sim.snapshot().actors[0].weapons[1].ammo).toBe(16);
    send(sim, 'a', 3, { fire: false });
    advance(sim, .02);
    sim.action('a', { type: 'trigger', id: 3, yaw: 0, pitch: 0, lean: 0, ads: false, clientTime: sim.snapshot().time });
    advance(sim, .02);
    expect(sim.snapshot().actors[0].weapons[1].ammo).toBe(15);
  });

  it('honors a quick jump action once even when the next input frame has released jump', () => {
    const sim = new Simulation(world(), config, [profiles[0]], 'quick-jump');
    advance(sim, 3.1);
    const ground = sim.snapshot().actors[0].pos.y;
    sim.action('a', { type: 'jump', id: 5 });
    send(sim, 'a', 1, { jump: false });
    advance(sim, .02);
    expect(sim.snapshot().actors[0].pos.y).toBeGreaterThan(ground);
    expect(sim.snapshot().actors[0].velocity.y).toBeGreaterThan(0);
    advance(sim, 2);
    expect(sim.snapshot().actors[0].grounded).toBe(true);
    sim.action('a', { type: 'jump', id: 5 });
    sim.action('a', { type: 'jump', id: 4 });
    advance(sim, .02);
    expect(sim.snapshot().actors[0].grounded).toBe(true);
    sim.action('a', { type: 'jump', id: 6 });
    advance(sim, .02);
    expect(sim.snapshot().actors[0].velocity.y).toBeGreaterThan(0);
  });

  it('keeps movement finite and rejects invalid, stale, and distant future input sequences', () => {
    const sim = new Simulation(world(), config, profiles, 'm');
    advance(sim, 3.1);
    send(sim, 'a', 1, { moveZ: 1 });
    advance(sim, .5);
    const before = sim.snapshot().actors.find(a => a.id === 'a')!;
    send(sim, 'a', 2, { moveZ: Infinity });
    send(sim, 'a', 10000, { moveZ: -1 });
    send(sim, 'a', 1, { moveZ: -1 });
    send(sim, 'a', 2, { moveZ: -1, clientTime: sim.snapshot().time + 2 });
    advance(sim, .2);
    const after = sim.snapshot().actors.find(a => a.id === 'a')!;
    expect(after.lastInput).toBe(1);
    expect(Number.isFinite(after.pos.x + after.pos.y + after.pos.z)).toBe(true);
    expect(Math.hypot(after.pos.x - before.pos.x, after.pos.z - before.pos.z)).toBeGreaterThan(0);
  });

  it('consumes loot and chests only once', () => {
    const lootWorld = world();
    lootWorld.spawns = lootWorld.spawns.slice(0, 1);
    const sim = new Simulation(lootWorld, config, [profiles[0]], 'm');
    advance(sim, 3.1);
    sim.action('a', { type: 'interact', id: 1, target: 'armor-1' });
    sim.action('a', { type: 'interact', id: 2, target: 'armor-1' });
    sim.action('a', { type: 'interact', id: 3, target: 'chest-1' });
    sim.action('a', { type: 'interact', id: 4, target: 'chest-1' });
    const state = sim.snapshot();
    expect(state.actors[0].armor).toBe(50);
    expect(state.openedChests).toEqual(['chest-1']);
    expect(sim.drainEvents().filter(e => e.type === 'pickup')).toHaveLength(2);
  });

  it('spills chest contents onto the ground to be picked up one by one', () => {
    const lootWorld = world();
    lootWorld.spawns = lootWorld.spawns.slice(0, 1);
    lootWorld.chests = [{ id: 'chest-1', x: 0, y: terrainHeight(0, -1.5), z: -1.5 }];
    const sim = new Simulation(lootWorld, config, [profiles[0]], 'm');
    advance(sim, 3.1);
    const weaponsBefore = sim.snapshot().actors[0].weapons.length;
    sim.action('a', { type: 'interact', id: 1, target: 'chest-1' });
    const drops = sim.snapshot().loot.filter(item => item.from);
    expect(drops.length).toBeGreaterThanOrEqual(3);
    expect(drops.length).toBeLessThanOrEqual(4);
    expect(sim.snapshot().actors[0].weapons).toHaveLength(weaponsBefore);
    const weapon = drops.find(item => item.kind === 'weapon')!;
    expect(weapon.weapon).toBeTruthy();
    expect(weapon.rarity).toBeGreaterThanOrEqual(1);
    for (const drop of drops) {
      expect(new Set(drops.map(d => d.id)).size).toBe(drops.length);
      expect(Math.hypot(drop.x - 0, drop.z + 1.5)).toBeLessThan(2);
      expect(drop.y).toBeGreaterThanOrEqual(terrainHeight(drop.x, drop.z) - 1e-6);
      expect(drop.from).toEqual({ x: 0, y: terrainHeight(0, -1.5) + .6, z: -1.5 });
    }
    sim.action('a', { type: 'interact', id: 2, target: weapon.id });
    expect(sim.snapshot().actors[0].weapons.some(w => w.id === weapon.weapon)).toBe(true);
    expect(sim.snapshot().loot.find(item => item.id === weapon.id)?.active).toBe(false);
    advance(sim, 1.2);
    expect(sim.snapshot().loot.some(item => item.id === weapon.id)).toBe(false);
    expect(sim.snapshot().loot.filter(item => item.from)).toHaveLength(drops.length - 1);
  });

  it('keeps real-world snapshots publishable (no undefined fields)', () => {
    const sim = new Simulation(createWorld(), { ...config, mode: 'battle-royale', bots: false }, [profiles[0]], 'm');
    advance(sim, .5);
    expect(finiteTree(sim.snapshot())).toBe(true);
  });

  it('counts a lethal hit once and respawns a deathmatch player with protection', () => {
    const sim = new Simulation(world(), config, profiles, 'm');
    advance(sim, 5.1);
    const [a, b] = sim.snapshot().actors;
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(b.pos.y - a.pos.y - .08, Math.hypot(dx, dz));
    for (let i = 0; i < 10; i++) { send(sim, 'a', i + 1, { yaw, pitch, fire: true, ads: true }); advance(sim, .1); }
    const dead = sim.snapshot().actors.find(v => v.id === 'b')!;
    expect(dead.deaths).toBe(1);
    expect(sim.snapshot().actors.find(v => v.id === 'a')!.kills).toBe(1);
    expect(sim.drainEvents().filter(e => e.type === 'kill' && e.target === 'b')).toHaveLength(1);
    advance(sim, 3.1);
    const respawned = sim.snapshot().actors.find(v => v.id === 'b')!;
    expect(respawned.alive).toBe(true);
    expect(respawned.hp).toBe(100);
    expect(respawned.protectionUntil).toBeGreaterThan(sim.snapshot().time);
  });

  it('ends timed combat at the deadline and awards the most eliminations', () => {
    const sim = new Simulation(world(), config, profiles, 'timed-score');
    advance(sim, 5.1);
    const [a, b] = sim.snapshot().actors;
    const yaw = Math.atan2(-(b.pos.x - a.pos.x), -(b.pos.z - a.pos.z));
    const pitch = Math.atan2(b.pos.y + .93 - (a.pos.y + 1.62), Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z));
    for (let i = 0; i < 10; i++) { send(sim, 'a', i + 1, { yaw, pitch, fire: true, ads: true }); advance(sim, .1); }
    expect(sim.snapshot().actors.find(actor => actor.id === 'a')!.kills).toBe(1);
    advance(sim, 302.9 - sim.snapshot().time);
    expect(sim.snapshot().phase).toBe('playing');
    advance(sim, .2);
    const result = sim.snapshot();
    expect(result.phase).toBe('results');
    expect(result.remaining).toBe(0);
    expect(result.results.filter(row => row.winner).map(row => row.id)).toEqual(['a']);
  });

  it('shares timed victory on equal eliminations even when damage differs', () => {
    const sim = new Simulation(world(), config, profiles, 'timed-tie');
    advance(sim, 5.1);
    const [a, b] = sim.snapshot().actors;
    const yaw = Math.atan2(-(b.pos.x - a.pos.x), -(b.pos.z - a.pos.z));
    const pitch = Math.atan2(b.pos.y + .93 - (a.pos.y + 1.62), Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z));
    send(sim, 'a', 1, { yaw, pitch, fire: true, ads: true }); advance(sim, .02);
    send(sim, 'a', 2, { yaw, fire: false });
    expect(sim.snapshot().actors.find(actor => actor.id === 'a')!.damage).toBeGreaterThan(0);
    advance(sim, 304 - sim.snapshot().time);
    const result = sim.snapshot();
    expect(result.results.map(row => row.kills)).toEqual([0, 0]);
    expect(result.results.map(row => row.place)).toEqual([1, 1]);
    expect(result.results.every(row => row.winner)).toBe(true);
  });

  it('blocks shots and movement through a wall', () => {
    const w = world(true);
    expect(hasLineOfSight({ x: 0, y: 2, z: 0 }, { x: 0, y: 2, z: -5 }, w)).toBe(false);
    const sim = new Simulation(w, config, profiles, 'm');
    advance(sim, 5.1);
    const [a, b] = sim.snapshot().actors;
    const yaw = Math.atan2(-(b.pos.x - a.pos.x), -(b.pos.z - a.pos.z));
    send(sim, 'a', 1, { yaw, fire: true });
    advance(sim, 1);
    expect(sim.snapshot().actors.find(v => v.id === 'b')!.hp).toBe(100);
    const mover = sim.snapshot().actors.find(v => v.pos.z > -2.8)! as ActorState;
    for (let i = 0; i < 120; i++) moveActor(mover, input(i + 1, { moveZ: 1 }), w, 1 / 60);
    expect(mover.pos.z).toBeGreaterThan(-2.2);
  });

  it('uses terrain height to block sight across a hill', () => {
    expect(hasLineOfSight({ x: -8, y: 3, z: 55 }, { x: -8, y: 3, z: 125 }, world())).toBe(false);
  });

  it('flies the plane low across the island and faces falling capybaras where they steer', () => {
    const sim = new Simulation(world(), { ...config, mode: 'battle-royale', bots: true }, [profiles[0]], 'plane-route', 9);
    advance(sim, 3.1);
    const start = sim.snapshot().plane;
    advance(sim, 5.8);
    const mid = sim.snapshot().plane;
    expect(mid.y).toBe(115);
    // Legacy route: 350 m through a point at most 35 m from the island centre.
    const dx = mid.x - start.x, dz = mid.z - start.z, len = Math.hypot(dx, dz);
    expect(Math.abs((0 - start.x) * -dz / len + (0 - start.z) * dx / len)).toBeLessThanOrEqual(35.01);
    expect(Math.hypot(mid.x, mid.z)).toBeLessThan(40);
    const human = (sim as any).actors.get('a');
    sim.action('a', { type: 'jump', id: 1 });
    send(sim, 'a', 1, { yaw: 1.1, pitch: -.4, moveZ: 1 });
    advance(sim, .5);
    const falling = sim.snapshot().actors.find(v => v.id === 'a')!;
    expect(falling.stage).toBe('falling');
    expect(falling.yaw).toBeCloseTo(1.1, 5);
    expect(human.state.pitch).toBeCloseTo(-.4, 5);
    advance(sim, 4);
    for (const bot of sim.snapshot().actors.filter(v => v.bot && (v.stage === 'falling' || v.stage === 'parachute') && Math.hypot(v.velocity.x, v.velocity.z) > 1))
      expect(Math.abs(Math.atan2(Math.sin(bot.yaw - Math.atan2(-bot.velocity.x, -bot.velocity.z)), Math.cos(bot.yaw - Math.atan2(-bot.velocity.x, -bot.velocity.z))))).toBeLessThan(.01);
  });

  it('fills battle royale to 21 actors and treats a late human as a spectator', () => {
    const sim = new Simulation(world(), { ...config, mode: 'battle-royale', bots: true }, profiles, 'br');
    expect(sim.snapshot().actors).toHaveLength(21);
    advance(sim, 3.1);
    const aliveBefore = sim.snapshot().actors.filter(a => a.alive).length;
    sim.player({ ...profiles[0], id: 'late' }, 'join');
    const joined = sim.snapshot();
    const late = joined.actors.find(a => a.id === 'late')!;
    expect(late.alive).toBe(false);
    expect(late.deaths).toBe(1);
    expect(joined.actors.filter(a => a.alive)).toHaveLength(aliveBefore);
    expect(joined.actors).toHaveLength(22);
  });

  it('generates deterministic clear spawns and pickup positions on the terrain', () => {
    const actual = createWorld();
    expect(createWorld()).toEqual(actual);
    expect(actual.spawns.length).toBeGreaterThan(50);
    expect(actual.loot.length + actual.chests.length).toBeGreaterThan(150);
    for (const point of [...actual.spawns, ...actual.loot, ...actual.chests]) {
      expect(point.y).toBeGreaterThanOrEqual(terrainHeight(point.x, point.z) - .001);
      expect(clearSpawn(point, actual)).toBe(true);
    }
  });

  it('gives every visible roof a walkable collision surface close to its pitch', () => {
    const actual = createWorld();
    const roofs = actual.objects.filter(object => object.kind === 'roof');
    expect(roofs.length).toBeGreaterThan(40);
    for (const roof of roofs) {
      for (const [fx, fz] of [[0, 0], [.25, 0], [-.25, 0], [0, .25], [0, -.25], [.45, 0]] as const) {
        const x = roof.pos.x + roof.scale.x * fx, z = roof.pos.z + roof.scale.z * fz;
        const profile = roof.detail === 'hip' ? Math.max(Math.abs(fx), Math.abs(fz)) : Math.abs(fx);
        const visibleHeight = roof.pos.y + roof.scale.y * (1 - 2 * profile);
        const hit = raycastWorld({ x, y: roof.pos.y + roof.scale.y + 1, z }, { x: 0, y: -1, z: 0 }, roof.scale.y + 2, actual);
        expect(hit?.collider.id.startsWith(`${roof.id}-step-`)).toBe(true);
        expect(hit!.point.y).toBeGreaterThanOrEqual(visibleHeight - .001);
        expect(hit!.point.y - visibleHeight).toBeLessThanOrEqual(.19);
      }
    }
  });

  it('uses safe deathmatch spawns in the real island arena', () => {
    const actual = createWorld();
    const sim = new Simulation(actual, { ...config, capacity: 16, bots: true }, profiles, 'island');
    const actors = sim.snapshot().actors;
    expect(actors).toHaveLength(8);
    for (const actor of actors) {
      expect(inArena(actor.pos.x, actor.pos.z)).toBe(true);
      expect(actual.colliders.some(c => actor.pos.x > c.min.x - .32 && actor.pos.x < c.max.x + .32 && actor.pos.z > c.min.z - .32 && actor.pos.z < c.max.z + .32 && actor.pos.y < c.max.y && actor.pos.y + 1.8 > c.min.y)).toBe(false);
    }
  });

  it('prefers a spawn hidden from living opponents', () => {
    const w = world();
    w.spawns = [{ x: 10, y: terrainHeight(10, 0), z: 0, mode: 'deathmatch', yaw: 0 }];
    w.colliders = [{ id: 'cover', min: { x: 4, y: 0, z: -2 }, max: { x: 6, y: 5, z: 2 }, material: 'stone' }];
    const sim = new Simulation(w, config, [profiles[0]], 'hidden-spawn');
    w.spawns.push({ x: 0, y: terrainHeight(0, 0), z: 0, mode: 'deathmatch', yaw: 0 });
    w.spawns.push({ x: 20, y: terrainHeight(20, 0), z: 0, mode: 'deathmatch', yaw: 0 });
    sim.player(profiles[1], 'join');
    expect(sim.snapshot().actors.find(a => a.id === 'b')!.pos.x).toBe(0);
  });

  it('keeps island loot reachable from valid nearby ground and collectable', () => {
    const actual = createWorld();
    const approach = (item: { x: number; y: number; z: number }) => {
      for (let i = 0; i < 16; i++) {
        const angle = i * Math.PI / 8, x = item.x + Math.cos(angle) * 1.8, z = item.z + Math.sin(angle) * 1.8;
        const pos = { x, y: terrainHeight(x, z), z };
        if (clearSpawn(pos, actual) && hasLineOfSight({ x, y: pos.y + 1.62, z }, { x: item.x, y: item.y + .5, z: item.z }, actual)) return pos;
      }
      return null;
    };
    const accessible = [...actual.loot, ...actual.chests].filter(item => approach(item));
    expect(accessible.length / (actual.loot.length + actual.chests.length)).toBeGreaterThan(.95);
    const example = actual.loot.find(item => item.kind === 'armor' && inArena(item.x, item.z, 2) && approach(item))!;
    const pos = approach(example)!;
    const isolated = { ...actual, spawns: [{ ...pos, mode: 'deathmatch' as const, yaw: 0 }] };
    const sim = new Simulation(isolated, config, [profiles[0]], 'real-loot');
    advance(sim, 3.1);
    sim.action('a', { type: 'interact', id: 1, target: example.id });
    expect(sim.snapshot().loot.find(item => item.id === example.id)!.active).toBe(false);
  });

  it('requires a fresh press for a semi automatic weapon and stops stale fire', () => {
    const sim = new Simulation(world(), config, [profiles[0]], 'semi');
    advance(sim, 5.1);
    sim.action('a', { type: 'slot', id: 1, slot: 1 });
    for (let i = 0; i < 6; i++) { send(sim, 'a', i + 1, { fire: true }); advance(sim, .1); }
    expect(sim.snapshot().actors[0].weapons[1].ammo).toBe(16);
    advance(sim, 1);
    expect(sim.snapshot().actors[0].weapons[1].ammo).toBe(16);
    send(sim, 'a', 7, { fire: false }); advance(sim, .05);
    send(sim, 'a', 8, { fire: true }); advance(sim, .05);
    expect(sim.snapshot().actors[0].weapons[1].ammo).toBe(15);
  });

  it('forfeits an absent battle royale player after 30 seconds without a false kill', () => {
    const sim = new Simulation(world(), { ...config, mode: 'battle-royale' }, profiles, 'forfeit');
    advance(sim, 3.1);
    sim.player(profiles[0], 'disconnect');
    advance(sim, 30.1);
    const snap = sim.snapshot();
    expect(snap.actors.find(a => a.id === 'a')!.alive).toBe(false);
    expect(snap.actors.find(a => a.id === 'a')!.deaths).toBe(1);
    expect(snap.actors.find(a => a.id === 'b')!.kills).toBe(0);
    expect(snap.phase).toBe('results');
    expect(snap.results.find(r => r.id === 'b')!.winner).toBe(true);
    expect(sim.drainEvents().filter(e => e.type === 'kill')).toHaveLength(0);
    sim.player(profiles[0], 'expired');
    expect(sim.snapshot().actors.find(a => a.id === 'a')!.deaths).toBe(1);
  });

  it('holds an expired deathmatch player out until a new join', () => {
    const sim = new Simulation(world(), config, profiles, 'dm-disconnect');
    advance(sim, 3.1);
    sim.player(profiles[0], 'disconnect');
    advance(sim, 30.1);
    sim.player(profiles[0], 'reconnect');
    advance(sim, 4);
    expect(sim.snapshot().actors.find(a => a.id === 'a')!.alive).toBe(false);
    sim.player(profiles[0], 'join');
    advance(sim, .05);
    const actor = sim.snapshot().actors.find(a => a.id === 'a')!;
    expect(actor.alive).toBe(true);
    expect(actor.deaths).toBe(1);
    expect(actor.protectionUntil).toBeGreaterThan(sim.snapshot().time);
  });

  it('accepts fresh input and action counters after reconnect while preserving the actor', () => {
    const sim = new Simulation(world(), config, [profiles[0]], 'reconnect-counters');
    advance(sim, 5.1);
    send(sim, 'a', 100, { moveZ: 1 });
    sim.action('a', { type: 'slot', id: 100, slot: 1 });
    advance(sim, .1);
    const before = sim.snapshot().actors[0];
    sim.player(profiles[0], 'disconnect');
    sim.player(profiles[0], 'reconnect');
    send(sim, 'a', 1, { moveZ: 1 });
    sim.action('a', { type: 'slot', id: 1, slot: 0 });
    advance(sim, .1);
    const after = sim.snapshot().actors[0];
    expect(after.lastInput).toBe(1);
    expect(after.slot).toBe(0);
    expect(after.alive).toBe(true);
    expect(after.hp).toBe(before.hp);
    expect(after.weapons).toEqual(before.weapons);
    sim.player(profiles[0], 'expired');
    expect(sim.snapshot().actors[0].alive).toBe(true);
  });

  it('rewinds hitscan targets for at most 200 milliseconds', () => {
    const scenario = (age: number) => {
      const sim = new Simulation(world(), config, profiles, 'rewind', 1);
      advance(sim, 5.1);
      const [a, b] = sim.snapshot().actors;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(b.pos.y - a.pos.y - .08, Math.hypot(dx, dz));
      send(sim, 'b', 1, { moveX: 1 });
      advance(sim, .19);
      send(sim, 'a', 1, { yaw, pitch, ads: true, fire: true, clientTime: sim.snapshot().time - age });
      advance(sim, .05);
      return sim.snapshot().actors.find(actor => actor.id === 'b')!.hp;
    };
    expect(scenario(.18)).toBeLessThan(100);
    expect(scenario(.3)).toBe(100);
  });

  it('gives a late deathmatch join two seconds of protection from its join time', () => {
    const sim = new Simulation(world(), config, [profiles[0]], 'late-dm');
    advance(sim, 12);
    sim.player(profiles[1], 'join');
    const snap = sim.snapshot();
    expect(snap.actors.find(a => a.id === 'b')!.protectionUntil - snap.time).toBeCloseTo(2, 4);
  });

  it('loads shotgun shells one at a time and lets a loaded shell interrupt reloading', () => {
    const sim = new Simulation(world(), config, [profiles[0]], 'shells');
    advance(sim, 5.1);
    const actor = (sim as any).actors.get('a').state as ActorState;
    actor.weapons = [{ id: 'shotgun', ammo: 0, reserve: 6, rarity: 0 }];
    actor.slot = 0;
    sim.action('a', { type: 'reload', id: 1 });
    advance(sim, .57);
    expect(actor.weapons[0].ammo).toBe(1);
    expect(actor.weapons[0].reserve).toBe(5);
    expect(actor.reloadUntil).toBeGreaterThan(sim.snapshot().time);
    send(sim, 'a', 1, { fire: true });
    advance(sim, .05);
    expect(actor.weapons[0].ammo).toBe(0);
    expect(actor.reloadUntil).toBe(0);
  });

  it('uses legacy-sized shapes: a head sphere over a body cylinder, and nothing around them', () => {
    const sim = new Simulation(world(), config, profiles, 'rays');
    const target = sim.snapshot().actors[0];
    target.pos = { x: 0, y: 0, z: 0 };
    const ray = (sim as any).rayActor.bind(sim) as (origin: { x: number; y: number; z: number }, direction: { x: number; y: number; z: number }, actor: ActorState, max: number) => { distance: number; head: boolean } | null;
    expect(ray({ x: 0, y: .9, z: 0 }, { x: 1, y: 0, z: 0 }, target, 2)).toEqual({ distance: 0, head: false });
    // Head sphere r .25 at (0, 1.6, -.04).
    expect(ray({ x: 0, y: 1.6, z: -3 }, { x: 0, y: 0, z: 1 }, target, 5)).toEqual({ distance: expect.closeTo(3 - .04 - .25, 5), head: true });
    expect(ray({ x: .2, y: 1.6, z: -3 }, { x: 0, y: 0, z: 1 }, target, 5)?.head).toBe(true);
    expect(ray({ x: 0, y: 3, z: -.04 }, { x: 0, y: -1, z: 0 }, target, 3)).toEqual({ distance: expect.closeTo(3 - 1.85, 5), head: true });
    // Body cylinder r .3 from the feet to 1.42.
    expect(ray({ x: 0, y: .8, z: -3 }, { x: 0, y: 0, z: 1 }, target, 5)).toEqual({ distance: expect.closeTo(3 - .3, 5), head: false });
    expect(ray({ x: 0, y: .05, z: -3 }, { x: 0, y: 0, z: 1 }, target, 5)?.head).toBe(false);
    expect(ray({ x: .28, y: 3, z: 0 }, { x: 0, y: -1, z: 0 }, target, 3)).toEqual({ distance: expect.closeTo(3 - 1.42, 5), head: false });
    // Empty space beside the head and body, above the head, and under the feet.
    expect(ray({ x: .3, y: 1.6, z: -3 }, { x: 0, y: 0, z: 1 }, target, 5)).toBeNull();
    expect(ray({ x: .35, y: .8, z: -3 }, { x: 0, y: 0, z: 1 }, target, 5)).toBeNull();
    expect(ray({ x: 0, y: 1.9, z: -3 }, { x: 0, y: 0, z: 1 }, target, 5)).toBeNull();
    expect(ray({ x: 0, y: -.1, z: -3 }, { x: 0, y: 0, z: 1 }, target, 5)).toBeNull();
  });

  it('rotates and crouches the shapes, and favours humans when a bot is shooting', () => {
    const sim = new Simulation(world(), config, profiles, 'posed-rays');
    const target = sim.snapshot().actors[0];
    target.pos = { x: 0, y: 0, z: 0 }; target.yaw = Math.PI / 2;
    const ray = (sim as any).rayActor.bind(sim) as (origin: { x: number; y: number; z: number }, direction: { x: number; y: number; z: number }, actor: ActorState, max: number, p?: unknown, c?: unknown, y?: unknown, favoured?: boolean) => { distance: number; head: boolean } | null;
    // Facing +x the head sphere sits .04 toward -x.
    expect(ray({ x: -3, y: 1.6, z: 0 }, { x: 1, y: 0, z: 0 }, target, 5)?.distance).toBeCloseTo(3 - .04 - .25, 5);
    target.yaw = 0; target.crouch = true;
    // Crouched, everything scales by 1.3/1.8 from the feet.
    const k = 1.3 / 1.8;
    expect(ray({ x: 0, y: 1.6 * k, z: -3 }, { x: 0, y: 0, z: 1 }, target, 5)?.head).toBe(true);
    expect(ray({ x: 0, y: 1.42 * k - .02, z: -3 }, { x: 0, y: 0, z: 1 }, target, 5)?.head).toBe(false);
    expect(ray({ x: 0, y: 1.45, z: -3 }, { x: 0, y: 0, z: 1 }, target, 5)).toBeNull();
    target.crouch = false;
    // Legacy player-favouring sizes: head r .19, body r .27 up to 1.36.
    expect(ray({ x: .22, y: 1.6, z: -3 }, { x: 0, y: 0, z: 1 }, target, 5)?.head).toBe(true);
    expect(ray({ x: .22, y: 1.6, z: -3 }, { x: 0, y: 0, z: 1 }, target, 5, undefined, undefined, undefined, true)).toBeNull();
    expect(ray({ x: .285, y: .8, z: -3 }, { x: 0, y: 0, z: 1 }, target, 5)?.head).toBe(false);
    expect(ray({ x: .285, y: .8, z: -3 }, { x: 0, y: 0, z: 1 }, target, 5, undefined, undefined, undefined, true)).toBeNull();
    expect(ray({ x: .1, y: 1.39, z: -3 }, { x: 0, y: 0, z: 1 }, target, 5, undefined, undefined, undefined, true)).toBeNull();
  });

  it('lets solid cover stop a shot before the long muzzle', () => {
    const w = world();
    const base = terrainHeight(0, -1.5);
    w.colliders.push({ id: 'close-cover', min: { x: -2, y: base - 1, z: -2 }, max: { x: 2, y: base + 4, z: -1 }, material: 'stone' });
    const sim = new Simulation(w, config, profiles, 'muzzle-cover');
    advance(sim, 5.1);
    const a = (sim as any).actors.get('a').state as ActorState, b = (sim as any).actors.get('b').state as ActorState;
    a.pos = { x: 0, y: terrainHeight(0, -5), z: -5 };
    b.pos = { x: 0, y: terrainHeight(0, 0), z: 0 }; b.yaw = 0; b.protectionUntil = 0;
    // Drop the pre-teleport history so lag compensation does not rewind b onto a.
    (sim as any).actors.get('b').history = [];
    send(sim, 'a', 1, { yaw: Math.PI, pitch: -.04, ads: true, fire: true });
    advance(sim, .02);
    expect(b.hp).toBe(100);
    expect(sim.drainEvents().some(event => event.type === 'shot' && event.actor === 'a' && !event.hit)).toBe(true);
  });

  it('rewinds orientation as well as position for a turning target', () => {
    const scenario = (age: number) => {
      const sim = new Simulation(world(), config, profiles, 'turning-rewind');
      advance(sim, 5.1);
      const shooter = (sim as any).actors.get('a'), target = (sim as any).actors.get('b');
      // The ray grazes the front of the head sphere: a hit facing -z (yaw 0), a miss facing +z.
      shooter.state.pos = { x: -5, y: terrainHeight(0, 0), z: -.27 };
      shooter.state.weapons[0] = { id: 'sniper', ammo: 5, reserve: 0, rarity: 0 };
      shooter.adsAmount = 1;
      target.state.pos = { x: 0, y: terrainHeight(0, 0), z: 0 };
      target.state.yaw = Math.PI; target.state.protectionUntil = 0;
      target.history = [{ time: sim.snapshot().time - .18, pos: { ...target.state.pos }, crouch: false, yaw: 0 }];
      const eye = shooter.state.pos.y + 1.62;
      const pitch = Math.atan2(target.state.pos.y + 1.6 - eye, 5);
      send(sim, 'a', 1, { yaw: -Math.PI / 2, pitch, ads: true, fire: true, clientTime: sim.snapshot().time - age });
      advance(sim, .02);
      return { hp: target.state.hp, hits: sim.drainEvents().filter(event => event.type === 'damage' && event.target === 'b') };
    };
    expect(scenario(.18).hits.some(event => event.type === 'damage' && event.head)).toBe(true);
    expect(scenario(.3).hp).toBe(100);
  });

  it('keeps a crouched actor crouched under a low roof', () => {
    const w = world();
    const actor = new Simulation(w, config, [profiles[0]], 'headroom').snapshot().actors[0];
    w.colliders.push({ id: 'ceiling', min: { x: actor.pos.x - 2, y: actor.pos.y + 1.35, z: actor.pos.z - 2 }, max: { x: actor.pos.x + 2, y: actor.pos.y + 1.55, z: actor.pos.z + 2 }, material: 'wood' });
    moveActor(actor, input(1, { crouch: true }), w, 1 / 60);
    moveActor(actor, input(2), w, 1 / 60);
    expect(actor.crouch).toBe(true);
    expect(actor.pos.y + 1.3).toBeLessThanOrEqual(w.colliders[0].min.y);
  });

  it('lands a parachuting actor on a roof before the terrain', () => {
    const w = world();
    const ground = terrainHeight(0, 0), roof = ground + 2.5;
    w.colliders.push({ id: 'roof', min: { x: -2, y: roof - .2, z: -2 }, max: { x: 2, y: roof, z: 2 }, material: 'wood' });
    const sim = new Simulation(w, { ...config, mode: 'battle-royale' }, profiles, 'roof');
    advance(sim, 3.1);
    const actor = (sim as any).actors.get('a').state as ActorState;
    actor.stage = 'parachute'; actor.pos = { x: 0, y: roof + .6, z: 0 }; actor.velocity = { x: 0, y: -6.5, z: 0 };
    advance(sim, .5);
    expect(actor.stage).toBe('ground');
    expect(actor.pos.y).toBeCloseTo(roof, 4);
  });

  it('lands and remains on a pitched roof in the island world', () => {
    const actual = createWorld();
    const roof = actual.objects.find(object => object.kind === 'roof' && object.detail === 'hip')!;
    const x = roof.pos.x + roof.scale.x * .25;
    const visibleHeight = roof.pos.y + roof.scale.y * .5;
    const sim = new Simulation(actual, { ...config, mode: 'battle-royale' }, profiles, 'island-roof');
    advance(sim, 3.1);
    const actor = (sim as any).actors.get('a').state as ActorState;
    actor.stage = 'parachute'; actor.pos = { x, y: visibleHeight + .6, z: roof.pos.z };
    actor.velocity = { x: 0, y: -6.5, z: 0 };
    advance(sim, .5);
    expect(actor.stage).toBe('ground');
    expect(actor.pos.y).toBeGreaterThanOrEqual(visibleHeight - .001);
    expect(actor.pos.y - visibleHeight).toBeLessThanOrEqual(.25);
    advance(sim, .5);
    expect(actor.pos.y - visibleHeight).toBeLessThanOrEqual(.25);
    const startX = actor.pos.x, startY = actor.pos.y;
    actor.yaw = Math.PI / 2;
    for (let i = 0; i < 35; i++) moveActor(actor, input(i, { moveZ: 1 }), actual, 1 / 60);
    expect(actor.pos.x).toBeLessThan(startX - 1);
    expect(actor.pos.y).toBeGreaterThan(startY);
    expect(actor.grounded).toBe(true);
  });

  it('clears previous-life effects and rewind history on respawn', () => {
    const sim = new Simulation(world(), config, profiles, 'fresh-life');
    advance(sim, 5.1);
    const runtime = (sim as any).actors.get('a');
    runtime.hot = 30; runtime.boostUntil = 100; runtime.history = [{ time: sim.snapshot().time, pos: { x: 100, y: 0, z: 100 }, crouch: false }];
    runtime.state.useUntil = 100; runtime.state.using = 'guarana';
    runtime.state.alive = false; runtime.state.hp = 0; runtime.state.respawnAt = sim.snapshot().time + .1;
    advance(sim, .15);
    expect(runtime.state.alive).toBe(true);
    expect(runtime.state.using).toBeNull();
    expect(runtime.state.useUntil).toBe(0);
    expect(runtime.hot).toBe(0);
    expect(runtime.boostUntil).toBe(0);
    expect(runtime.history.every((h: { pos: { x: number } }) => h.pos.x !== 100)).toBe(true);
  });

  it('waits for a disconnected last survivor to reconnect or forfeit before ending battle royale', () => {
    const sim = new Simulation(world(), { ...config, mode: 'battle-royale' }, profiles, 'last-disconnect');
    advance(sim, 3.1);
    (sim as any).actors.get('b').state.alive = false;
    sim.player(profiles[0], 'disconnect');
    advance(sim, .2);
    expect(sim.snapshot().phase).toBe('playing');
    sim.player(profiles[0], 'reconnect');
    advance(sim, .05);
    expect(sim.snapshot().phase).toBe('results');
    expect(sim.snapshot().results.find(r => r.id === 'a')!.winner).toBe(true);
  });
});
