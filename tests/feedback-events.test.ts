import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { terrainHeight } from '../src/shared/terrain';
import type { GameEvent, InputFrame, PlayerProfile, RoomConfig, WorldSpec } from '../src/shared/types';

// The client effects and audio key off these event contracts: surface-aware
// impacts, the armor-break cue, the consumable cue and the 1 Hz storm bite.
const flat = (colliders: WorldSpec['colliders'] = []): WorldSpec => ({
  version: 'test', size: 256, objects: [], districts: [], loot: [], chests: [], colliders,
  spawns: [{ x: 0, y: terrainHeight(0, 0), z: 0, mode: 'both', yaw: 0 }, { x: 0, y: terrainHeight(0, 8), z: 8, mode: 'both', yaw: 0 }],
});
const profiles: PlayerProfile[] = [
  { id: 'a', name: 'A', color: '#111111', ready: true, connected: true },
  { id: 'b', name: 'B', color: '#222222', ready: true, connected: true },
];
const dm: RoomConfig = { mode: 'deathmatch', capacity: 2, bots: false, difficulty: 'normal', duration: 300 };
const input = (sim: Simulation, seq: number, extras: Partial<InputFrame> = {}): InputFrame => ({
  seq, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, sprint: false, crouch: false, jump: false, fire: false, ads: false, lean: 0,
  clientTime: sim.snapshot().time, ...extras,
});
function advance(sim: Simulation, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 60); i++) sim.step(1 / 60);
}
const runtime = (sim: Simulation, id: string) => (sim as any).actors.get(id);
type Shot = Extract<GameEvent, { type: 'shot' }>;

function shoot(world: WorldSpec, place: { x: number; z: number }, yaw: number, pitch: number) {
  const sim = new Simulation(world, dm, [profiles[0]], 'impact', 11);
  advance(sim, 3.1);
  const a = runtime(sim, 'a');
  a.state.pos = { x: place.x, y: terrainHeight(place.x, place.z), z: place.z };
  a.state.slot = 1; // pistol: one ray, semi-automatic
  a.state.protectionUntil = 0;
  sim.drainEvents();
  sim.input('a', input(sim, 1, { yaw, pitch, fire: true, ads: true }));
  advance(sim, .05);
  return sim.drainEvents().find((e): e is Shot => e.type === 'shot')!;
}

describe('impact events', () => {
  it('reports the wall material and the face that looks back at the shooter', () => {
    const shot = shoot(flat([{ id: 'wall', min: { x: -2, y: 0, z: -3.4 }, max: { x: 2, y: 6, z: -3 }, material: 'wood' }]), { x: 0, z: 0 }, 0, 0);
    expect(shot.hit).toBe(false);
    expect(shot.surface).toBe('wood');
    expect(shot.end.z).toBeCloseTo(-3, 2);
    expect(shot.normal).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('puts a ground impact on the terrain surface instead of inside the 2 m ray step', () => {
    const shot = shoot(flat(), { x: 0, z: 0 }, .4, -.35);
    expect(shot.surface).toBeDefined();
    expect(Math.abs(shot.end.y - terrainHeight(shot.end.x, shot.end.z))).toBeLessThan(.02);
    expect(shot.normal!.y).toBeGreaterThan(.7);
  });

  it('ends a shot over the sea on the water surface, not on the seabed', () => {
    let z = -100;
    while (terrainHeight(0, z - 12) > -1) z -= 1;
    const shot = shoot(flat(), { x: 0, z }, 0, -.12);
    expect(terrainHeight(0, z)).toBeGreaterThan(-.05);
    expect(shot.surface).toBe('water');
    expect(shot.end.y).toBeCloseTo(-.05, 3);
    expect(terrainHeight(shot.end.x, shot.end.z)).toBeLessThan(shot.end.y);
  });

  it('marks only the hit that empties the armor as an armor break', () => {
    const sim = new Simulation(flat(), dm, profiles, 'armor', 3);
    advance(sim, 3.1);
    const b = runtime(sim, 'b');
    b.state.armor = 20; b.state.protectionUntil = 0;
    sim.drainEvents();
    const hit = (amount: number) => { (sim as any).damage(b, amount, 'a', 'smg', false); return sim.drainEvents().find(e => e.type === 'damage') as Extract<GameEvent, { type: 'damage' }>; };
    expect(hit(12).armorBreak).toBeUndefined();
    expect(hit(12).armorBreak).toBe(true);
    expect(b.state.armor).toBe(0);
    expect(hit(12).armorBreak).toBeUndefined();
  });

  it('announces a consumable only when it takes effect, never when interrupted', () => {
    const sim = new Simulation(flat(), dm, profiles, 'use', 4);
    advance(sim, 3.1);
    const a = runtime(sim, 'a');
    a.state.hp = 50; a.state.consumables.bandage = 2; a.state.protectionUntil = 0;
    sim.drainEvents();
    sim.action('a', { type: 'consume', id: 1, item: 'bandage' });
    advance(sim, 1);
    (sim as any).damage(a, 5, 'b', 'smg', false);
    advance(sim, 2);
    expect(sim.drainEvents().filter(e => e.type === 'use')).toHaveLength(0);
    sim.action('a', { type: 'consume', id: 2, item: 'bandage' });
    advance(sim, 2.6);
    const uses = sim.drainEvents().filter(e => e.type === 'use');
    expect(uses).toEqual([expect.objectContaining({ actor: 'a', item: 'bandage' })]);
    expect(a.state.hp).toBe(60);
  });
});

describe('storm damage', () => {
  function storm() {
    const sim = new Simulation(flat(), { ...dm, mode: 'battle-royale' }, profiles, 'storm', 5);
    advance(sim, 3.1);
    const zone = (sim as any).zone;
    zone.x = 0; zone.z = 0; zone.radius = 20; zone.damage = 4; (sim as any).zoneTimer = 1e9;
    for (const id of ['a', 'b']) {
      const s = runtime(sim, id).state;
      Object.assign(s, { stage: 'ground', grounded: true, pos: { x: 0, y: terrainHeight(0, 0), z: 0 } });
    }
    sim.drainEvents();
    const a = runtime(sim, 'a').state;
    const place = (outside: boolean) => { a.pos = outside ? { x: 40, y: terrainHeight(40, 0), z: 0 } : { x: 0, y: terrainHeight(0, 0), z: 0 }; };
    const bites = () => sim.drainEvents().filter(e => e.type === 'damage' && e.target === 'a') as Extract<GameEvent, { type: 'damage' }>[];
    return { sim, a, place, bites };
  }

  it('bites once per second with the phase damage, matching the continuous total', () => {
    const { sim, a, place, bites } = storm();
    place(true);
    advance(sim, 3.02);
    const events = bites();
    expect(events).toHaveLength(3);
    expect(events.every(e => e.amount === 4 && e.actor === '')).toBe(true);
    expect(a.hp).toBe(100 - 12);
  });

  it('keeps exposure across quick steps back inside so edge hopping cannot dodge a bite', () => {
    const { sim, place, bites } = storm();
    for (let i = 0; i < 3; i++) { place(true); advance(sim, .6); place(false); advance(sim, .6); }
    // 1.8 s outside in 0.6 s pieces: one bite, where a reset-on-entry timer would give none.
    expect(bites()).toHaveLength(1);
  });
});
