import { expect, it } from 'vitest';
import { CrosshairSpread } from '../src/ui/crosshair';
import { DEFAULT_SETTINGS } from '../src/settings';
import { Simulation } from '../src/simulation';
import { terrainHeight } from '../src/shared/terrain';
import type { WorldSpec } from '../src/shared/types';

it('projects burst beyond still spread, ADS inside hip spread, and fades only iron-sight ticks', () => {
  const world: WorldSpec = { version: 'hud-test', size: 256, objects: [], districts: [], loot: [], chests: [], colliders: [],
    spawns: [{ x: 0, y: terrainHeight(0, 0), z: 0, yaw: 0, mode: 'both' }] };
  const sim = new Simulation(world, { mode: 'deathmatch', capacity: 1, bots: false, difficulty: 'normal', duration: 300 },
    [{ id: 'a', name: 'A', color: '#111111', ready: true, connected: true }], 'hud-test', 1);
  const me = sim.snapshot().actors[0];
  me.weapons = [{ id: 'smg', ammo: 25, reserve: 75, rarity: 0 }];
  me.slot = 0;
  const spread = new CrosshairSpread();
  const settings = { ...DEFAULT_SETTINGS };
  const still = spread.gap(me, settings, 900, 1000);
  spread.onShot('smg', 1001);
  const burst = spread.gap(me, settings, 900, 1001);
  expect(burst).toBeGreaterThan(still);
  const recovering = spread.gap(me, settings, 900, 1121);
  expect(recovering).toBeLessThan(burst);
  expect(recovering).toBeGreaterThan(still);

  spread.reset();
  me.ads = true;
  spread.gap(me, settings, 900, 2000);
  spread.gap(me, settings, 900, 2081);
  expect(spread.ticksOpacity).toBe(1);
  spread.gap(me, settings, 900, 2121);
  expect(spread.ticksOpacity).toBeCloseTo(.5);
  const ads = spread.gap(me, settings, 900, 2161);
  expect(ads).toBeLessThan(still);
  expect(spread.ticksOpacity).toBe(0);

  spread.reset();
  settings.reducedMotion = true;
  spread.gap(me, settings, 900, 3000);
  spread.gap(me, settings, 900, 3090);
  expect(spread.ticksOpacity).toBe(0);
});
