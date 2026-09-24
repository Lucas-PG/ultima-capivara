import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { clearSpawn, hasLineOfSight, moveActor, raycastWorld } from '../src/shared/collision';
import { terrainHeight } from '../src/shared/terrain';
import { createWorld } from '../src/shared/world';
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
    expect(shots[0].end.x).toBeLessThan(shots[0].origin.x - 80);
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
    for (let i = 0; i < 10; i++) { send(sim, 'a', i + 1, { yaw, fire: true, ads: true }); advance(sim, .1); }
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
    send(sim, 'a', 1, { yaw, fire: true, ads: true }); advance(sim, .02);
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
      expect(actor.pos.x).toBeGreaterThanOrEqual(-100);
      expect(actor.pos.x).toBeLessThanOrEqual(15);
      expect(actor.pos.z).toBeGreaterThanOrEqual(-100);
      expect(actor.pos.z).toBeLessThanOrEqual(15);
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
    const example = actual.loot.find(item => item.kind === 'armor' && item.x >= -98 && item.x <= 13 && item.z >= -98 && item.z <= 13 && approach(item))!;
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
    advance(sim, .55);
    expect(actor.weapons[0].ammo).toBe(1);
    expect(actor.weapons[0].reserve).toBe(5);
    expect(actor.reloadUntil).toBeGreaterThan(sim.snapshot().time);
    send(sim, 'a', 1, { fire: true });
    advance(sim, .05);
    expect(actor.weapons[0].ammo).toBe(0);
    expect(actor.reloadUntil).toBe(0);
  });

  it('hits actors from inside the body and on steep downward rays', () => {
    const sim = new Simulation(world(), config, profiles, 'rays');
    const target = sim.snapshot().actors[0];
    target.pos = { x: 0, y: 0, z: 0 };
    const ray = (sim as any).rayActor.bind(sim) as (origin: { x: number; y: number; z: number }, direction: { x: number; y: number; z: number }, actor: ActorState, max: number) => { distance: number; head: boolean } | null;
    expect(ray({ x: 0, y: .8, z: 0 }, { x: 1, y: 0, z: 0 }, target, 2)).toEqual({ distance: 0, head: false });
    expect(ray({ x: 0, y: 3, z: 0 }, { x: 0, y: -1, z: 0 }, target, 3)?.head).toBe(true);
    expect(ray({ x: .27, y: 3, z: 0 }, { x: 0, y: -1, z: 0 }, target, 3)?.head).toBe(false);
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
