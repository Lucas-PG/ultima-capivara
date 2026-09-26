import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/settings';
import { Spring } from '../src/render/spring';
import { Simulation } from '../src/simulation';
import { terrainHeight } from '../src/shared/terrain';
import type { WorldSpec } from '../src/shared/types';
import { createReloadPose, MELEE_SECONDS } from '../src/shared/weapon-presentation';

afterEach(() => vi.unstubAllGlobals());

it('starts a newly selected weapon at hip even if the previous sight was fully aimed', async () => {
  const noop = () => {};
  const context = { fillRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, ellipse: noop, fill: noop,
    createRadialGradient: () => ({ addColorStop: noop }) };
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
  const { WeaponView } = await import('../src/render/weapons');
  const world: WorldSpec = { version: 'ads-switch', size: 256, objects: [], districts: [], loot: [], chests: [], colliders: [],
    spawns: [{ x: 0, y: terrainHeight(0, 0), z: 0, yaw: 0, mode: 'both' }] };
  const sim = new Simulation(world, { mode: 'deathmatch', capacity: 1, bots: false, difficulty: 'normal', duration: 300 },
    [{ id: 'a', name: 'A', color: '#111111', ready: true, connected: true }], 'ads-switch', 1);
  const actor = sim.snapshot().actors[0];
  actor.weapons = [{ id: 'smg', ammo: 25, reserve: 75, rarity: 0 }, { id: 'm4', ammo: 30, reserve: 90, rarity: 0 }];
  actor.slot = 1;
  actor.ads = true;
  const model = () => ({ group: { visible: true, rotation: { x: 0, z: 0 } }, support: { position: { set: noop }, rotation: { x: 0 } }, sightY: .1, hipX: .2, adsZ: -.3 });
  const view = Object.create(WeaponView.prototype) as any;
  Object.assign(view, {
    holder: new THREE.Group(), inspectTime: -1, inspectAllowed: false, restPosition: new THREE.Vector3(), restRotation: new THREE.Euler(),
    models: { smg: model(), m4: model() }, active: 'smg', ads: 1, draw: 0, kick: 0, reloadEnd: 0,
    recoil: new Spring(), recoilYaw: new Spring(), swayX: new Spring(), swayY: new Spring(), land: new Spring(),
    lastYaw: undefined, lastPitch: 0, grounded: true, swimming: false, swimPose: 0, verticalSpeed: 0, sprintPose: 0, holster: 0,
    gait: 0, breathingTime: 0, shotLife: 0, flashLife: 0, flash: { visible: false }, shells: [], furColor: actor.color,
    reloadPose: createReloadPose(), reloadTarget: createReloadPose(), palm: new THREE.Vector3(), palmRotated: new THREE.Vector3(),
    bobAmount: 0, wallPose: 0, meleeTime: MELEE_SECONDS, meleeSide: -1, meleeHit: false, meleeStop: 0,
    meleePose: {}, smear: { visible: false },
  });
  view.update(actor, 1 / 60, DEFAULT_SETTINGS, 0, 0);
  expect(view.weapon).toBe('smg');
  for (let i = 0; i < 10 && view.weapon !== 'm4'; i++) view.update(actor, 1 / 60, DEFAULT_SETTINGS, 0, 0);
  expect(view.weapon).toBe('m4');
  expect(view.adsAmount).toBeGreaterThan(0);
  expect(view.adsAmount).toBeLessThan(.1);
  for (let i = 0; i < 60; i++) view.update(actor, 1 / 60, DEFAULT_SETTINGS, 0, 0);
  expect(view.adsAmount).toBe(1);
});
