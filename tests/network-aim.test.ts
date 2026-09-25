import { describe, expect, it } from 'vitest';
import { RemoteInterpolation, shotClientTime } from '../src/network/interpolation';
import { Simulation } from '../src/simulation';
import { terrainHeight } from '../src/shared/terrain';
import { DEFAULT_CONFIG, type InputFrame, type WorldSpec } from '../src/shared/types';

const world: WorldSpec = { version: 'test', size: 256, objects: [], districts: [], loot: [], chests: [], colliders: [],
  spawns: [{ x: 0, y: terrainHeight(0, 0), z: 0, mode: 'both', yaw: 0 },
    { x: 0, y: terrainHeight(0, -5), z: -5, mode: 'both', yaw: 0 }] };
const input = (time: number, values: Partial<InputFrame> = {}): InputFrame => ({ seq: 1, moveX: 0, moveZ: 0,
  yaw: 0, pitch: 0, sprint: false, crouch: false, jump: false, fire: false, ads: true, lean: 0, clientTime: time, ...values });
const advance = (sim: Simulation, ticks: number) => { for (let i = 0; i < ticks; i++) sim.step(1 / 60); };

function simulation() {
  return new Simulation(world, { ...DEFAULT_CONFIG, mode: 'deathmatch', bots: false },
    [{ id: 'a', name: 'A', color: '#1fb5a8', ready: true, connected: true },
      { id: 'b', name: 'B', color: '#e76f51', ready: true, connected: true }], 'aim-test', 1);
}

function shoot(kind: 'held' | 'click', useRendered: boolean, transitTicks = 0) {
  const sim = simulation();
  advance(sim, 306);
  const first = sim.snapshot(), buffer = new RemoteInterpolation();
  buffer.push(first, 'a', first.time * 1000);
  const shown = buffer.sample(first.time * 1000 + 100).get('b')!;
  const renderedTime = buffer.time;
  const origin = first.actors.find(a => a.id === 'a')!;
  const dx = shown.pos.x - origin.pos.x, dz = shown.pos.z - origin.pos.z;
  const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(shown.pos.y - origin.pos.y - .08, Math.hypot(dx, dz));
  sim.input('b', input(first.time, { moveZ: 1, yaw: -Math.PI / 2, sprint: true, ads: false }));
  advance(sim, 9);
  const now = sim.snapshot().time;
  buffer.push(sim.snapshot(), 'a', now * 1000);
  // A receive-side clock adjustment must not replace the timestamp of the last
  // displayed frame used below by the click or held-fire input.
  // At 30 FPS a click can arrive between displayed frames. Both input routes
  // must retain the displayed timestamp, even if new snapshots arrived since.
  const stamp = shotClientTime(now, useRendered ? renderedTime : null);
  advance(sim, transitTicks);
  if (kind === 'held') sim.input('a', input(stamp, { fire: true, yaw, pitch }));
  else sim.action('a', { type: 'trigger', id: 1, yaw, pitch, lean: 0, ads: true, clientTime: stamp });
  advance(sim, 1);
  return { hp: sim.snapshot().actors.find(a => a.id === 'b')!.hp,
    ammoBefore: origin.weapons[0].ammo, ammo: sim.snapshot().actors.find(a => a.id === 'a')!.weapons[0].ammo,
    events: sim.drainEvents() };
}

describe('aim at the remote pose that was actually rendered', () => {
  it.each(['held', 'click'] as const)('%s fire hits the shown moving target using history', kind => {
    expect(shoot(kind, false).hp).toBe(100);
    expect(shoot(kind, true).hp).toBeLessThan(100);
  });
  it.each(['held', 'click'] as const)('%s fire still respects the authority 200 ms execution bound', kind => {
    // 150 ms visual age plus 83 ms transit exceeds the host's rewind window.
    expect(shoot(kind, true, 5).hp).toBe(100);
  });
  it('fires a reliable click with a stale timestamp using current targets, without extra rewind', () => {
    // A stalled guest or reliable channel can deliver the shown timestamp late.
    // Timestamp freshness limits rewind, not whether a valid click consumes ammo.
    const shot = shoot('click', true, 120);
    expect(shot.ammo).toBe(shot.ammoBefore - 1);
    expect(shot.events.filter(event => event.type === 'shot' && event.actor === 'a')).toHaveLength(1);
    expect(shot.hp).toBe(100);
  });
  it('retains future/finite validation, duplicate IDs and cadence for stale clicks', () => {
    const sim = simulation(); advance(sim, 306);
    const now = sim.snapshot().time;
    const press = { type: 'trigger' as const, id: 1, yaw: 0, pitch: 0, lean: 0, ads: false, clientTime: now - 3 };
    const ammo = () => sim.snapshot().actors.find(actor => actor.id === 'a')!.weapons[0].ammo;
    for (const clientTime of [now + 2, Infinity, NaN]) {
      sim.action('a', { ...press, clientTime }); advance(sim, 1); expect(ammo()).toBe(25);
    }
    sim.action('a', press); advance(sim, 1); expect(ammo()).toBe(24);
    sim.action('a', { ...press, id: 2 }); advance(sim, 1); expect(ammo()).toBe(24);
    advance(sim, 60);
    sim.action('a', press); advance(sim, 1); expect(ammo()).toBe(24);
    sim.action('a', { ...press, id: 3 }); advance(sim, 1); expect(ammo()).toBe(23);
  });
  it('does not replay an old held shot through a delayed reliable copy after respawn', () => {
    const sim = simulation(); advance(sim, 306);
    const pressTime = sim.snapshot().time;
    sim.input('a', input(pressTime, { fire: true, firePressId: 7 })); advance(sim, 1);
    expect(sim.snapshot().actors[0].weapons[0].ammo).toBe(24);
    sim.input('a', input(sim.snapshot().time, { seq: 2 }));
    const runtime = (sim as any).actors.get('a');
    (sim as any).kill(runtime, null, 'fall'); advance(sim, 181);
    expect(runtime.state.alive).toBe(true); expect(runtime.state.weapons[0].ammo).toBe(25);
    const press = { type: 'trigger' as const, id: 7, yaw: 0, pitch: 0, lean: 0, ads: false, clientTime: pressTime };
    sim.action('a', press); advance(sim, 1);
    expect(runtime.state.weapons[0].ammo).toBe(25);
    expect(runtime.state.protectionUntil).toBeGreaterThan(sim.snapshot().time);
    sim.action('a', { ...press, id: 8 }); advance(sim, 1);
    expect(runtime.state.weapons[0].ammo).toBe(24);
    // A resumed connection deliberately restarts its action sequence.
    advance(sim, 60);
    const profile = { id: 'a', name: 'A', color: '#1fb5a8', ready: true, connected: true };
    sim.player(profile, 'disconnect'); sim.player(profile, 'reconnect');
    sim.action('a', { ...press, id: 1 }); advance(sim, 1);
    expect(runtime.state.weapons[0].ammo).toBe(23);
  });
  it('keeps the last displayed timestamp through newer packets and between 30 FPS frames', () => {
    const rendered = 10;
    expect(shotClientTime(10.1, rendered)).toBe(rendered);
    expect(shotClientTime(10.1 + 1 / 30, rendered)).toBe(rendered);
    expect(shotClientTime(10.21, rendered)).toBe(10.21);
    expect(shotClientTime(10, null)).toBe(10);
    expect(shotClientTime(10, 10.1)).toBe(10);
  });
});
