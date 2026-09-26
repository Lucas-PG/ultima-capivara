import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { boundaryFeedback } from '../src/shared/bounds';
import { moveActor } from '../src/shared/collision';
import { ARENA } from '../src/shared/layout';
import { emptyInput } from '../src/shared/math';
import { terrainHeight } from '../src/shared/terrain';
import type { ActorState, Mode, RoomConfig, WorldSpec } from '../src/shared/types';

const world: WorldSpec = { version: 'bounds-test', size: 260, objects: [], colliders: [], districts: [], loot: [], chests: [],
  spawns: [{ x: 0, y: terrainHeight(0, -20), z: -20, mode: 'both', yaw: 0 }] };
const config: RoomConfig = { mode: 'deathmatch', capacity: 2, bots: false, difficulty: 'normal', duration: 300 };
const profiles = [{ id: 'player', name: 'Capivara', color: '#e76f51', ready: true, connected: true }];
function actor(x: number, z: number): ActorState {
  const state = new Simulation(world, config, profiles, 'bounds', 41).snapshot().actors[0];
  state.pos = { x, y: terrainHeight(x, z), z }; state.stage = 'ground'; state.grounded = true;
  state.velocity = { x: 0, y: 0, z: 0 };
  return state;
}

describe('visible boundaries with soft shared movement', () => {
  it('pushes actors back from every town edge and the open ocean', () => {
    const cases: { x: number; z: number; dx: number; dz: number; mode: Mode }[] = [
      { x: ARENA.maxX + 4, z: -20, dx: -1, dz: 0, mode: 'deathmatch' },
      { x: ARENA.minX - 4, z: -20, dx: 1, dz: 0, mode: 'deathmatch' },
      { x: 0, z: ARENA.maxZ + 4, dx: 0, dz: -1, mode: 'deathmatch' },
      { x: 0, z: ARENA.minZ - 4, dx: 0, dz: 1, mode: 'deathmatch' },
      { x: 138, z: 0, dx: -1, dz: 0, mode: 'battle-royale' },
      { x: -138, z: 0, dx: 1, dz: 0, mode: 'battle-royale' },
    ];
    for (const sample of cases) {
      const capy = actor(sample.x, sample.z), start = { ...capy.pos };
      const feedback = boundaryFeedback(capy.pos, world, sample.mode)!;
      expect(feedback.x * sample.dx + feedback.z * sample.dz).toBeGreaterThan(.99);
      moveActor(capy, emptyInput(), world, 1 / 60, 1, sample.mode);
      // The first frame is a gentle velocity change, never a position snap.
      expect(Math.hypot(capy.pos.x - start.x, capy.pos.z - start.z)).toBeLessThan(.02);
      for (let i = 0; i < 90; i++) moveActor(capy, emptyInput(), world, 1 / 60, 1, sample.mode);
      expect((capy.pos.x - start.x) * sample.dx + (capy.pos.z - start.z) * sample.dz).toBeGreaterThan(1.5);
    }
  });

  it('leaves movement inside the limits identical', () => {
    const normal = actor(0, -20), bounded = structuredClone(normal);
    const input = { ...emptyInput(), moveX: .4, moveZ: .7, sprint: true };
    expect(boundaryFeedback(normal.pos, world, 'deathmatch')).toBeNull();
    for (let i = 0; i < 90; i++) {
      moveActor(normal, input, { ...world, size: 1000 }, 1 / 60);
      moveActor(bounded, input, world, 1 / 60, 1, 'deathmatch');
    }
    expect(bounded).toEqual(normal);
  });

  it('uses identical boundary integration in host simulation and client prediction', () => {
    const sim = new Simulation(world, config, profiles, 'host-prediction-bounds', 42);
    for (let i = 0; i < 198; i++) sim.step(1 / 60);
    const authoritative = (sim as any).actors.get('player').state as ActorState;
    Object.assign(authoritative, actor(ARENA.maxX + 5, -20));
    const predicted = structuredClone(authoritative);
    for (let i = 1; i <= 90; i++) {
      const frame = { ...emptyInput(), seq: i, clientTime: sim.snapshot().time, yaw: -Math.PI / 2, moveZ: 1, sprint: true };
      sim.input('player', frame);
      predicted.yaw = frame.yaw; predicted.pitch = frame.pitch;
      moveActor(predicted, frame, world, 1 / 60, 1, config.mode);
      sim.step(1 / 60);
      expect(predicted.pos).toEqual(authoritative.pos);
      expect(predicted.velocity).toEqual(authoritative.velocity);
    }
  });

  it('provides pt-BR feedback only while outside the applicable limit', () => {
    expect(boundaryFeedback({ x: ARENA.maxX, z: 0 }, world, 'deathmatch')).toBeNull();
    expect(boundaryFeedback({ x: ARENA.maxX + 1, z: 0 }, world, 'deathmatch')?.message).toBe('Volte para a Vila');
    expect(boundaryFeedback({ x: 138, z: 0 }, world, 'battle-royale')?.message).toContain('Volte para a ilha');
  });

  it('lets players walk to the visible end of a pier before the ocean current starts', () => {
    const pier = { id: 'pier', min: { x: 120, y: 1, z: -3 }, max: { x: 136, y: 1.4, z: 3 }, material: 'wood' as const };
    const coast = { ...world, walkways: [pier] };
    expect(boundaryFeedback({ x: 133, z: 0 }, coast, 'battle-royale')).toBeNull();
    expect(boundaryFeedback({ x: 137, z: 0 }, coast, 'battle-royale')).not.toBeNull();
  });
});
