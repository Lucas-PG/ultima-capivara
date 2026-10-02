import { describe, expect, it } from 'vitest';
import { StepCadence } from '../src/sound/step-cadence';
import { moveActor } from '../src/shared/collision';
import { emptyInput } from '../src/shared/math';
import { Simulation } from '../src/simulation';
import type { Collider, WorldSpec } from '../src/shared/types';

const BASE = 40, RISE = .18, RUN = 1.2;
const box = (id: string, x0: number, x1: number, top: number): Collider => ({ id,
  min: { x: x0, y: BASE - 2, z: -3 }, max: { x: x1, y: top, z: 3 }, material: 'stone' });
function fixture(shapes: Collider[], y: number) {
  const world: WorldSpec = { version: 'step-physics', size: 260, colliders: shapes, objects: [], districts: [], loot: [], chests: [],
    spawns: [{ x: .4, y, z: 0, mode: 'both', yaw: -Math.PI / 2 }] };
  const sim = new Simulation(world, { mode: 'deathmatch', capacity: 2, bots: false, difficulty: 'normal', duration: 300 },
    [{ id: 'walker', name: 'Caminhante', color: '#fff', ready: true, connected: true }], 'cadence', 7);
  const actor = sim.snapshot().actors[0];
  Object.assign(actor, { pos: { x: .4, y, z: 0 }, yaw: -Math.PI / 2, stage: 'ground', grounded: true, velocity: { x: 0, y: 0, z: 0 } });
  const cadence = new StepCadence(actor);
  return { actor, world, cadence };
}
function walk(shapes: Collider[], y: number, stance: 'walk' | 'sprint' | 'crouch') {
  const { actor, world, cadence } = fixture(shapes, y), events = [];
  let airborne = 0, distance = 0, previous = actor.pos.x;
  for (let tick = 0; tick < 1200 && actor.pos.x < 13; tick++) {
    moveActor(actor, { ...emptyInput(), moveZ: 1, yaw: -Math.PI / 2, sprint: stance === 'sprint', crouch: stance === 'crouch' }, world, 1 / 60);
    distance += actor.pos.x - previous; previous = actor.pos.x;
    if (!actor.grounded) airborne++;
    events.push(cadence.update(actor));
  }
  return { events, airborne, distance, actor };
}

describe('footsteps from real downhill movement', () => {
  it.each(['walk', 'sprint', 'crouch'] as const)('keeps a %s stride while descending physical stairs and a ramp', stance => {
    const stairs = [box('floor', -20, 20, BASE), ...Array.from({ length: 10 }, (_, i) =>
      box(`tread-${i}`, i * RUN, (i + 1) * RUN, BASE + (10 - i) * RISE))];
    const slope = 3 / 14, norm = Math.hypot(slope, 1), top = 43 - slope * (.4 - .32);
    const ramp: Collider = { id: 'ramp', min: { x: 0, y: BASE, z: -3 }, max: { x: 14, y: 43, z: 3 }, material: 'stone',
      hull: [[1, 0, 0, 14], [-1, 0, 0, 0], [0, 0, 1, 3], [0, 0, -1, 3], [0, -1, 0, -BASE], [slope / norm, 1 / norm, 0, 43 / norm]] };
    const runs = [walk([box('flat', -20, 20, BASE + 10 * RISE)], BASE + 10 * RISE, stance),
      walk(stairs, BASE + 10 * RISE, stance), walk([box('floor', -20, 20, BASE), ramp], top, stance)];
    for (const run of runs) {
      const stride = stance === 'sprint' ? 2.15 : stance === 'crouch' ? 2.7 : 1.65;
      expect(run.actor.pos.x, JSON.stringify({ run: runs.indexOf(run), pos: run.actor.pos, velocity: run.actor.velocity, alive: run.actor.alive, grounded: run.actor.grounded })).toBeGreaterThanOrEqual(13);
      expect(run.events.filter(event => event.landing)).toHaveLength(0);
      expect(run.events.filter(event => event.step)).toHaveLength(Math.floor(run.distance / stride));
    }
    expect(runs[1].airborne).toBeGreaterThan(15);
    expect(runs[1].events.filter(event => event.step)).toHaveLength(runs[0].events.filter(event => event.step).length);
    expect(runs[2].events.filter(event => event.step)).toHaveLength(runs[0].events.filter(event => event.step).length);
  });

  it('keeps one real landing after walking off a tall ledge', () => {
    const run = walk([box('floor', -20, 20, BASE), box('ledge', -2, 2, BASE + 1.8)], BASE + 1.8, 'walk');
    expect(run.events.filter(event => event.landing)).toHaveLength(1);
    expect(run.airborne).toBeGreaterThan(20);
  });
});
