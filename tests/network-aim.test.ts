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

function shoot(kind: 'held' | 'click', useRendered: boolean, transitTicks = 0) {
  const sim = new Simulation(world, { ...DEFAULT_CONFIG, mode: 'deathmatch', bots: false },
    [{ id: 'a', name: 'A', color: '#1fb5a8', ready: true, connected: true },
      { id: 'b', name: 'B', color: '#e76f51', ready: true, connected: true }], 'aim-test', 1);
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
  return { hp: sim.snapshot().actors.find(a => a.id === 'b')!.hp, events: sim.drainEvents() };
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
  it('keeps the last displayed timestamp through newer packets and between 30 FPS frames', () => {
    const rendered = 10;
    expect(shotClientTime(10.1, rendered)).toBe(rendered);
    expect(shotClientTime(10.1 + 1 / 30, rendered)).toBe(rendered);
    expect(shotClientTime(10.21, rendered)).toBe(10.21);
    expect(shotClientTime(10, null)).toBe(10);
    expect(shotClientTime(10, 10.1)).toBe(10);
  });
});
