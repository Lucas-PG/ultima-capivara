import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { terrainHeight } from '../src/shared/terrain';
import { WEAPONS } from '../src/shared/weapons';
import type { PlayerProfile, RoomConfig, WorldSpec } from '../src/shared/types';

// The coconut launcher's role is area denial: its burst must reach players near
// the impact, stop at walls, and fade out by the edge of its radius.
const ground = (x: number, z: number) => ({ x, y: terrainHeight(x, z), z });
const world: WorldSpec = {
  version: 'test', size: 256, objects: [], districts: [], loot: [], chests: [],
  colliders: [{ id: 'wall', min: { x: -3, y: -5, z: -8.2 }, max: { x: 3, y: 6, z: -7.8 }, material: 'stone' }],
  spawns: [{ ...ground(0, 0), mode: 'both', yaw: 0 }],
};
const config: RoomConfig = { mode: 'deathmatch', capacity: 5, bots: false, difficulty: 'normal', duration: 300 };
const ids = ['a', 'near', 'walled', 'far'];
const profiles: PlayerProfile[] = ids.map(id => ({ id, name: id, color: '#123456', ready: true, connected: true }));

describe('coconut launcher', () => {
  it('bursts on landing: hurts nearby players, not those behind a wall or beyond the radius', () => {
    const sim = new Simulation(world, config, profiles, 'c'.repeat(48), 3);
    for (let i = 0; i < 26; i++) sim.step(.25);
    const actors = (sim as any).actors as Map<string, any>;
    const place: Record<string, [number, number]> = { a: [0, 0], near: [1.6, -6], walled: [0, -9.6], far: [7, -6] };
    for (const id of ids) {
      const s = actors.get(id).state; s.pos = ground(...place[id]); s.velocity = { x: 0, y: 0, z: 0 }; s.protectionUntil = 0; s.yaw = 0;
    }
    const shooter = actors.get('a');
    shooter.state.weapons = [{ id: 'coco', ammo: 4, reserve: 8, rarity: 0, box: 0 }]; shooter.state.slot = 0;
    const eye = 1.5, pitch = -Math.atan2(eye, 6);
    const time = sim.snapshot().time;
    sim.input('a', { seq: 1, moveX: 0, moveZ: 0, yaw: 0, pitch, sprint: false, crouch: false, jump: false, fire: true, ads: false, lean: 0, clientTime: time });
    for (let i = 0; i < 8; i++) sim.step(.125);
    const hp = (id: string) => actors.get(id).state.hp;
    expect(sim.drainEvents().some(e => e.type === 'impact' && e.weapon === 'coco')).toBe(true);
    expect(hp('near')).toBeLessThan(100);
    expect(hp('near')).toBeGreaterThan(100 - WEAPONS.coco.damage);
    expect(hp('walled')).toBe(100);
    expect(hp('far')).toBe(100);
    expect(hp('a')).toBe(100);
  });
});
