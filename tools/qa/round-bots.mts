import { Simulation } from '../../src/simulation/index.ts';
import { createWorld } from '../../src/shared/world.ts';
import type { Mode } from '../../src/shared/types.ts';
const world = createWorld();
for (const mode of ['duel', 'squads'] as Mode[]) {
  const sim = new Simulation(world, { mode, capacity: mode === 'duel' ? 2 : 6, teamSize: 3, bots: true, difficulty: 'normal', duration: 300 },
    [{ id: 'practice', name: 'Treino', color: '#1fb5a8', ready: true, connected: true }], 'a'.repeat(48), 71);
  const events: any[] = [];
  for (let i = 0; i < 180 * 60; i++) { sim.step(1 / 60); events.push(...sim.drainEvents().filter(event => event.type === 'kill')); }
  const snap = sim.snapshot();
  console.log(JSON.stringify({ mode, round: snap.round, kills: events.length, actors: snap.actors.map(a => ({ name: a.name, team: a.team, money: a.money, kills: a.kills, hp: a.hp, x: a.pos.x, z: a.pos.z, gun: a.weapons[0].id })) }));
}
