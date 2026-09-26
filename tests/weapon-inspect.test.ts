import * as THREE from 'three';
import { Spring } from '../src/render/spring';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { ActorState, WeaponId } from '../src/shared/types';

beforeAll(() => {
  const noop = () => {};
  const context = { fillRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, ellipse: noop, fill: noop,
    createRadialGradient: () => ({ addColorStop: noop }) };
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
});
afterAll(() => vi.unstubAllGlobals());

async function harness() {
  const { WeaponView } = await import('../src/render/weapons');
  const holder = new THREE.Group(), scene = new THREE.Scene(); scene.add(holder);
  const model = () => {
    const group = new THREE.Group(), muzzle = new THREE.Object3D(), eject = new THREE.Object3D();
    group.add(muzzle, eject); holder.add(group);
    return { group, muzzle, eject, support: new THREE.Group(), sightY: .1, hipX: .2, adsZ: -.3 };
  };
  const view = Object.assign(Object.create(WeaponView.prototype), {
    holder, scene, models: { pistol: model(), smg: model() }, active: 'pistol', ads: 0, draw: 0, kick: 0, reloadEnd: 0,
    recoil: new Spring(), recoilYaw: new Spring(), swayX: new Spring(), swayY: new Spring(), land: new Spring(),
    lastYaw: undefined, lastPitch: 0, grounded: true, verticalSpeed: 0, sprintPose: 0, holster: 0,
    gait: 0, shotLife: 0, flashLife: 0, flash: { visible: false }, shells: [], disposed: false,
    inspectTime: -1, inspectAllowed: false, restPosition: new THREE.Vector3(), restRotation: new THREE.Euler(),
  }) as InstanceType<typeof WeaponView>;
  const actor = { alive: true, stage: 'ground', weapons: [{ id: 'pistol', rarity: 0 }, { id: 'smg', rarity: 0 }], slot: 0,
    reloadUntil: 0, ads: false, sprint: false, velocity: { x: 0, y: 0, z: 0 } } as ActorState;
  const step = (dt = 1 / 60) => view.update(actor, dt, DEFAULT_SETTINGS, 0, 1);
  return { view, actor, holder, step };
}

describe('first-person inspect', () => {
  it('starts only after an eligible live update and returns smoothly to the hip pose', async () => {
    const h = await harness(); expect(h.view.inspect()).toBe(false); h.step();
    const position = h.holder.position.clone(), rotation = h.holder.rotation.clone();
    expect(h.view.inspect()).toBe(true);
    for (let i = 0; i < 48; i++) h.step();
    expect(h.holder.rotation.y).toBeLessThan(rotation.y - .45);
    for (let i = 0; i < 49; i++) h.step();
    expect(h.holder.position.distanceTo(position)).toBeLessThan(1e-6);
    expect(h.holder.rotation.y).toBeCloseTo(rotation.y);
  });
  it.each(['ads', 'sprint', 'reload', 'switch', 'death', 'air'] as const)('combat state %s cancels inspection', async state => {
    const h = await harness(); h.step(); h.view.inspect();
    for (let i = 0; i < 48; i++) h.step();
    if (state === 'ads') h.actor.ads = true;
    if (state === 'sprint') h.actor.sprint = true;
    if (state === 'reload') h.actor.reloadUntil = 3;
    if (state === 'switch') h.actor.slot = 1;
    if (state === 'death') h.actor.alive = false;
    if (state === 'air') h.actor.stage = 'falling';
    h.step();
    expect((h.view as any).inspectTime).toBe(-1);
    if (state !== 'switch') expect(h.view.inspect()).toBe(false);
  });
  it('a shot clears the inspection transform before VFX read the muzzle', async () => {
    const h = await harness(); h.step();
    const position = h.holder.position.clone(), rotation = h.holder.rotation.clone();
    h.view.inspect(); for (let i = 0; i < 48; i++) h.step();
    // A melee shot uses the same cancellation path without emitting a shell.
    h.view.shot('machete' as WeaponId);
    expect(h.holder.position.equals(position)).toBe(true);
    expect(h.holder.rotation.equals(rotation)).toBe(true);
    expect(h.view.inspect()).toBe(false);
  });
});
