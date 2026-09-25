import { Simulation } from '../src/simulation';
import { terrainHeight } from '../src/shared/terrain';
import { RECOIL } from '../src/shared/weapons';
import type { RoomConfig, WorldSpec } from '../src/shared/types';

const world: WorldSpec = {
  version: 'recoil-trial', size: 256, objects: [], districts: [], loot: [], chests: [],
  colliders: [{ id: 'target-plane', min: { x: -50, y: -50, z: -20.1 }, max: { x: 50, y: 50, z: -20 }, material: 'stone' }],
  spawns: [{ x: 0, y: terrainHeight(0, 0), z: 0, mode: 'both', yaw: 0 }],
};
const config: RoomConfig = { mode: 'deathmatch', capacity: 1, bots: false, difficulty: 'normal', duration: 300 };

function group(pattern: 'before' | 'after') {
  const sim = new Simulation(world, config, [{ id: 'a', name: 'A', color: '#fff', ready: true, connected: true }], `recoil-${pattern}`, 71839);
  sim.step(3.1);
  const actor = (sim as any).actors.get('a');
  actor.state.weapons[0] = { id: 'm4', ammo: 30, reserve: 90, rarity: 0 };
  actor.state.slot = 0; actor.state.ads = true; actor.adsAmount = 1;
  let pitch = 0, yaw = 0;
  const impacts: { x: number; y: number }[] = [];
  for (let i = 0; i < 10; i++) {
    actor.state.pitch = pitch; actor.state.yaw = yaw;
    (sim as any).fire(actor);
    const shot = sim.drainEvents().find(event => event.type === 'shot' && event.actor === 'a');
    if (shot?.type !== 'shot') throw new Error(`Missing shot ${i + 1}`);
    const ray = { x: shot.end.x - shot.origin.x, y: shot.end.y - shot.origin.y, z: shot.end.z - shot.origin.z };
    const factor = -20 / ray.z;
    impacts.push({ x: ray.x * factor, y: ray.y * factor });
    pitch += (pattern === 'before' ? .011 : RECOIL.m4.pitch) * .7;
    if (pattern === 'after') yaw += RECOIL.m4.yaw * (i % 2 ? 1 : -1) * .7;
    sim.step(.1);
  }
  const rms = Math.sqrt(impacts.reduce((sum, hit) => sum + hit.x ** 2 + hit.y ** 2, 0) / impacts.length);
  const radius = Math.max(...impacts.map(hit => Math.hypot(hit.x, hit.y)));
  return { first: +Math.hypot(impacts[0].x, impacts[0].y).toFixed(3), rms: +rms.toFixed(3), radius: +radius.toFixed(3), impacts };
}

for (const pattern of ['before', 'after'] as const) console.log(pattern, JSON.stringify(group(pattern)));
