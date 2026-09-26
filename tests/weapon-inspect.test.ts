import * as THREE from 'three';
import { Spring } from '../src/render/spring';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { ActorState, WeaponId } from '../src/shared/types';
import { createReloadPose, MELEE_SECONDS, MELEE_CONTACT } from '../src/shared/weapon-presentation';

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
  const smear = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  smear.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
  const view = Object.assign(Object.create(WeaponView.prototype), {
    holder, scene, models: { pistol: model(), smg: model(), machete: model() }, active: 'pistol', ads: 0, draw: 0, kick: 0, reloadEnd: 0,
    recoil: new Spring(), recoilYaw: new Spring(), swayX: new Spring(), swayY: new Spring(), land: new Spring(),
    lastYaw: undefined, lastPitch: 0, grounded: true, swimming: false, swimPose: 0, verticalSpeed: 0, sprintPose: 0, holster: 0,
    gait: 0, breathingTime: 0, shotLife: 0, flashLife: 0, flash: { visible: false }, shells: [], disposed: false,
    inspectTime: -1, inspectAllowed: false, restPosition: new THREE.Vector3(), restRotation: new THREE.Euler(),
    reloadPose: createReloadPose(), reloadTarget: createReloadPose(), palm: new THREE.Vector3(), palmRotated: new THREE.Vector3(),
    bobAmount: 0, wallPose: 0, meleeTime: MELEE_SECONDS, meleeSide: -1, meleeHit: false, meleeStop: 0,
    meleePose: {}, smear, trailBase: new THREE.Vector3(), trailTip: new THREE.Vector3(), lastTrailBase: new THREE.Vector3(), lastTrailTip: new THREE.Vector3(),
  }) as InstanceType<typeof WeaponView>;
  const actor = { alive: true, stage: 'ground', weapons: [{ id: 'pistol', rarity: 0 }, { id: 'smg', rarity: 0 }], slot: 0,
    reloadUntil: 0, ads: false, sprint: false, velocity: { x: 0, y: 0, z: 0 } } as ActorState;
  const step = (dt = 1 / 60) => view.update(actor, dt, DEFAULT_SETTINGS, 0, 1);
  return { view, actor, holder, step };
}

describe('first-person inspect', () => {
  it('keeps the pistol usable above the water and never aims or inspects while swimming', async () => {
    const h = await harness(); h.actor.grounded = true; h.step();
    const dryY = h.holder.position.y;
    h.actor.swimming = true; h.actor.grounded = false; h.actor.ads = true;
    for (let i = 0; i < 60; i++) h.step();
    expect(h.view.adsAmount).toBe(0); expect(h.view.inspect()).toBe(false);
    expect(h.holder.position.y).toBeGreaterThan(dryY + .02);
    expect(h.holder.position.toArray().every(Number.isFinite)).toBe(true);
  });
  it('starts only after an eligible live update and returns smoothly to the hip pose', async () => {
    const h = await harness(); expect(h.view.inspect()).toBe(false); h.step();
    const position = h.holder.position.clone(), rotation = h.holder.rotation.clone();
    expect(h.view.inspect()).toBe(true);
    for (let i = 0; i < 48; i++) h.step();
    expect(h.holder.rotation.y).toBeLessThan(rotation.y - .45);
    for (let i = 0; i < 49; i++) h.step();
    expect(h.holder.position.distanceTo(position)).toBeLessThan(.007);
    expect(h.holder.rotation.y).toBeCloseTo(rotation.y);
  });
  it.each(['ads', 'sprint', 'reload', 'switch', 'death', 'air', 'emote'] as const)('combat state %s cancels inspection', async state => {
    const h = await harness(); h.step(); h.view.inspect();
    for (let i = 0; i < 48; i++) h.step();
    if (state === 'ads') h.actor.ads = true;
    if (state === 'emote') { h.actor.emote = 'wave'; h.actor.emoteUntil = 4; }
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
    h.view.inspect(); for (let i = 0; i < 48; i++) h.step();
    const position = (h.view as any).restPosition.clone(), rotation = (h.view as any).restRotation.clone();
    // A melee shot uses the same cancellation path without emitting a shell.
    h.view.shot('machete' as WeaponId);
    expect(h.holder.position.equals(position)).toBe(true);
    expect(h.holder.rotation.equals(rotation)).toBe(true);
    expect(h.view.inspect()).toBe(false);
  });

  it('uses the fired weapon muzzle even while the previous weapon is holstering', async () => {
    const h = await harness(); h.step(); h.actor.slot = 1; h.step();
    expect(h.view.weapon).toBe('pistol');
    h.view.shot('smg');
    expect(h.view.weapon).toBe('smg');
    expect((h.view as any).models.pistol.group.visible).toBe(false);
    expect((h.view as any).models.smg.group.visible).toBe(true);
  });

  it('returns the magazine, supporting paw and trigger finger to rest after cancelled reload or firing', async () => {
    const h = await harness(), model = (h.view as any).models.pistol;
    model.magazine = new THREE.Group(); model.magazine.name = 'mag';
    model.support.name = 'grip_l'; model.triggerFinger = new THREE.Group(); model.gripFingers = new THREE.Group();
    h.actor.reloadUntil = 1.8;
    h.view.update(h.actor, 1 / 60, DEFAULT_SETTINGS, 0, .7);
    expect(model.magazine.position.y).toBeLessThan(-.2);
    expect(model.support.position.y).toBeLessThan(-.1);
    h.actor.reloadUntil = 0;
    h.view.update(h.actor, 1 / 60, DEFAULT_SETTINGS, 0, .71);
    // Cancel smoothly from the held magazine instead of teleporting the paw.
    expect(model.magazine.position.y).toBeLessThan(-.05);
    for (let i = 0; i < 30; i++) h.step();
    expect(model.magazine.position.y).toBe(0);
    expect(model.support.position.length()).toBe(0);
    h.view.shot('pistol'); h.step();
    expect(model.triggerFinger.position.y).toBeLessThan(0);
    for (let i = 0; i < 30; i++) h.step();
    expect(model.triggerFinger.position.length()).toBe(0);
  });

  it('pauses only the confirmed blade contact, alternates swings and leaves aiming/input untouched', async () => {
    const h = await harness(), view = h.view as any;
    h.actor.weapons[0].id = 'machete'; h.actor.yaw = .7; h.actor.pitch = -.1;
    for (let i = 0; i < 60; i++) h.step();
    h.view.shot('machete', true);
    for (let i = 0; i < 9; i++) h.step();
    expect(view.meleeTime).toBeCloseTo(MELEE_CONTACT, 8);
    const hitPose = h.holder.rotation.clone(), side = view.meleeSide;
    h.step(); expect(view.meleeTime).toBeCloseTo(MELEE_CONTACT, 8);
    expect(h.holder.rotation.y).toBeCloseTo(hitPose.y, 8);
    expect(h.actor.yaw).toBe(.7); expect(h.actor.pitch).toBe(-.1);
    for (let i = 0; i < 25; i++) h.step();
    expect(view.meleeTime).toBe(MELEE_SECONDS);
    h.view.shot('machete', false); expect(view.meleeSide).toBe(-side);
    for (let i = 0; i < 9; i++) h.step();
    expect(view.meleeTime).toBeGreaterThan(MELEE_CONTACT);
    expect(view.smear.visible).toBe(true);
    const segment = [...view.smear.geometry.getAttribute('position').array];
    h.step(0);
    expect([...view.smear.geometry.getAttribute('position').array]).toEqual(segment);
  });

  it('loads a painted shotgun through its support paw even though it has no detachable magazine alias', async () => {
    const h = await harness(), view = h.view as any, model = view.models.pistol;
    model.magazine = new THREE.Group(); model.magazine.name = 'shotgun_magazine';
    model.painted = {}; model.rarity = 0;
    const shell = new THREE.Object3D(); shell.name = 'reload-prop'; model.support.add(shell);
    view.models.shotgun = model; view.active = 'shotgun';
    h.actor.weapons[0].id = 'shotgun'; h.actor.reloadUntil = 2;
    h.view.update(h.actor, 1 / 60, DEFAULT_SETTINGS, 0, 1.63);
    expect(model.support.position.y).toBeLessThan(-.1);
    expect(model.magazine.position.length()).toBe(0); expect(shell.visible).toBe(true);
    h.view.update(h.actor, 1 / 60, DEFAULT_SETTINGS, 0, 2);
    expect(model.support.position.length()).toBe(0); expect(shell.visible).toBe(false);
  });

  it('suppresses melee trail, hit-stop and camera kick in reduced motion and resets on hide', async () => {
    const h = await harness(), view = h.view as any;
    h.actor.weapons[0].id = 'machete'; for (let i = 0; i < 60; i++) h.step();
    h.view.shot('machete', true);
    for (let i = 0; i < 9; i++) h.view.update(h.actor, 1 / 60, { ...DEFAULT_SETTINGS, reducedMotion: true }, 0, 1);
    expect(view.meleeTime).toBeGreaterThan(MELEE_CONTACT); expect(view.smear.visible).toBe(false);
    const camera = new THREE.PerspectiveCamera(), original = camera.quaternion.clone();
    h.view.cameraFeedback(camera, true); expect(camera.quaternion.equals(original)).toBe(true);
    h.actor.alive = false; h.step();
    expect(view.meleeTime).toBe(MELEE_SECONDS); expect(view.meleeStop).toBe(0); expect(view.smear.visible).toBe(false);
    h.actor.alive = true; h.step(); expect(view.holder.visible).toBe(true);
    expect(Object.values(view.meleePose).every(value => value === 0)).toBe(true);
  });
});
