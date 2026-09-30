import { expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { ADS_ZOOM, shotSpread } from '../src/shared/weapons';
import type { ActorState, WeaponId } from '../src/shared/types';
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
  me.weapons = [{ id: 'smg', ammo: 25, reserve: 75, rarity: 0, box: 0 }];
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

  spread.reset();
  me.sprint = true;
  const sprintHip = spread.gap(me, settings, 900, 4000);
  expect(spread.gap(me, settings, 900, 4200)).toBe(sprintHip);
  expect(spread.ticksOpacity).toBe(1);
  spread.reset();
  me.sprint = false;
  me.weapons[0] = { id: 'machete', ammo: 0, reserve: 0, rarity: 0, box: 3 };
  spread.gap(me, settings, 900, 5000);
  spread.gap(me, settings, 900, 5200);
  expect(spread.ticksOpacity).toBe(1);
});


it('matches a projected spread cone at horizontal FOV limits, each lens and player stance', () => {
  for (const weapon of ['pistol', 'smg', 'm4', 'dmr', 'sniper'] as WeaponId[]) {
    for (const fov of [80, 100, 120]) for (const height of [360, 720]) {
      for (const stance of ['hip', 'ads', 'crouch', 'swim']) {
        const ads = stance === 'ads' ? 1 : 0;
        const me = { id: 'a', weapons: [{ id: weapon }], slot: 0, shotHeat: 0, grounded: true,
          velocity: { x: 0, y: 0, z: 0 }, ads: !!ads, sprint: false, reloadUntil: 0,
          crouch: stance === 'crouch', swimming: stance === 'swim' } as ActorState;
        const spread = new CrosshairSpread(), settings = { ...DEFAULT_SETTINGS, fov, reducedMotion: true };
        let gap = 0;
        for (let t = 1000; t <= 2000; t += 100) gap = spread.gap(me, settings, height, t);
        // Independent 16:9 horizontal-to-vertical conversion, then the camera's zoom contract.
        const vertical = 2 * Math.atan(Math.tan(fov * Math.PI / 360) * 9 / 16);
        const zoom = 1 + ads * (ADS_ZOOM[weapon] - 1);
        const lens = weapon === 'm4' ? 2 * Math.atan(Math.tan(vertical / 2) / zoom) : vertical / zoom;
        const camera = new PerspectiveCamera(lens * 180 / Math.PI, 16 / 9, .07, 850);
        const cone = shotSpread(weapon, ads, 0, false, 0, me.swimming, me.crouch);
        const edge = new Vector3(0, Math.tan(cone * Math.PI / 180), -1).project(camera);
        const projected = Math.min(48 * height / 1080, Math.max(4 * height / 1080, edge.y * height / 2));
        expect(gap, `${weapon}/${stance}/${fov}/${height}`).toBeCloseTo(projected, 5);
      }
    }
  }
});
