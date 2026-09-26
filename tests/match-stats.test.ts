import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/simulation';
import { fastPart, gearPart, rebuildFrame, worldPart } from '../src/network/codec';
import { terrainHeight } from '../src/shared/terrain';
import { WEAPONS } from '../src/shared/weapons';
import { WORLD_VERSION, type WeaponId, type WorldSpec } from '../src/shared/types';

function match() {
  const y = terrainHeight(0, 0);
  const world: WorldSpec = { version: WORLD_VERSION, size: 256, objects: [], districts: [], colliders: [], loot: [], chests: [],
    spawns: [{ x: 0, y, z: 0, yaw: 0, mode: 'both' }, { x: 0, y, z: -5, yaw: 0, mode: 'both' }] };
  const sim = new Simulation(world, { mode: 'deathmatch', capacity: 2, bots: false, difficulty: 'normal', duration: 300 },
    ['a', 'b'].map(id => ({ id, name: id.toUpperCase(), color: '#123456', ready: true, connected: true })), 'a'.repeat(48), 7);
  const runtime = sim as any, shooter = runtime.actors.get('a'), target = runtime.actors.get('b');
  const fire = (distance: number, weapon: WeaponId = 'pistol') => {
    shooter.state.pos = { x: 0, y, z: 0 }; target.state.pos = { x: 0, y, z: -distance };
    shooter.state.weapons = [{ id: weapon, ammo: WEAPONS[weapon].magazine, reserve: 0, rarity: 0 }];
    shooter.state.slot = 0; shooter.nextShot = 0; shooter.wasFiring = false; target.history = [];
    runtime.fire(shooter, 0, undefined, { dir: { x: 0, y: 0, z: -1 }, cone: 0 });
  };
  return { sim, runtime, shooter, target, fire };
}

describe('authoritative longest successful ranged shot', () => {
  it('records a nonlethal armour hit, keeps the farthest range and replicates it in results', () => {
    const { sim, runtime, shooter, target, fire } = match();
    target.state.protectionUntil = 0; target.state.armor = 100;
    fire(25);
    expect(target.state.hp).toBe(100);
    expect(target.state.armor).toBeLessThan(100);
    expect(shooter.longestShot).toBeGreaterThan(24);
    const longest = shooter.longestShot;
    fire(5);
    expect(shooter.longestShot).toBe(longest);
    runtime.respawn(shooter);
    runtime.finish();
    const snapshot = sim.snapshot(), result = snapshot.results.find(r => r.id === 'a')!;
    expect(result.longestShot).toBe(Math.round(longest * 10) / 10);
    expect(result.kills).toBe(0);
    const received = rebuildFrame(fastPart(snapshot), JSON.parse(JSON.stringify(worldPart(snapshot))), gearPart(snapshot));
    expect(received?.results.find(r => r.id === 'a')?.longestShot).toBe(result.longestShot);
  });

  it('leaves zero for spawn-protected hits, melee, self damage and environmental damage', () => {
    const { sim, runtime, shooter, target, fire } = match();
    fire(25);
    expect(target.state.hp).toBe(100);
    target.state.protectionUntil = 0;
    fire(1, 'machete');
    expect(target.state.hp).toBeLessThan(100);
    runtime.damage(target, 1, 'a', 'storm', false, 500);
    runtime.damage(target, 1, 'a', 'fall', false, 500);
    shooter.state.protectionUntil = 0;
    runtime.damage(shooter, 1, 'a', 'pistol', false, 500);
    runtime.finish();
    expect(sim.snapshot().results.map(r => r.longestShot)).toEqual([0, 0]);
  });

  it('measures a projectile from its firing origin even after the shooter moves', () => {
    const { runtime, shooter, target, fire } = match();
    target.state.protectionUntil = 0;
    fire(10, 'slingshot');
    shooter.state.pos.x = 100;
    for (let i = 0; i < 30; i++) runtime.updateProjectiles();
    expect(target.state.hp).toBeLessThan(100);
    expect(shooter.longestShot).toBeGreaterThan(9);
    expect(shooter.longestShot).toBeLessThan(10);
  });
});
