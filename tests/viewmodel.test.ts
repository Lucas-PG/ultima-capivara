import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { ActorState, WeaponId } from '../src/shared/types';
import { MELEE_CONTACT, MELEE_SECONDS } from '../src/shared/weapon-presentation';
import { WEAPONS } from '../src/shared/weapons';

// Synthetic stand-ins for the Blender assets: the same bone and socket names,
// so the real WeaponView, arm IK and choreography run end to end.
function armsAsset() {
  const scene = new THREE.Group();
  for (const side of ['R', 'L'] as const) {
    const bones: THREE.Bone[] = [];
    const bone = (name: string, parent: THREE.Object3D, position: [number, number, number]) => {
      const b = new THREE.Bone(); b.name = `${name}_${side}`; b.position.set(...position); parent.add(b); bones.push(b); return b;
    };
    const upper = bone('upper', scene, [side === 'R' ? .2 : -.2, 0, 0]);
    const fore = bone('fore', upper, [0, 0, -.245]), hand = bone('hand', fore, [0, 0, -.2]);
    for (const [finger, x] of [['index', -.028], ['middle', 0], ['ring', .028], ['thumb', -.04]] as const) {
      const f1 = bone(`${finger}1`, hand, [x, 0, -.1]), f2 = bone(`${finger}2`, f1, [0, 0, -.03]), f3 = bone(`${finger}3`, f2, [0, 0, -.025]);
      void f3;
    }
    const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(.1, .1, .5), new THREE.MeshStandardMaterial());
    mesh.name = `arm_${side}`; scene.add(mesh); mesh.bind(new THREE.Skeleton(bones));
  }
  return { scene } as never;
}
function weaponAsset(id: WeaponId) {
  const scene = new THREE.Group(), root = new THREE.Group(); root.name = id; scene.add(root);
  const add = (name: string, position: [number, number, number], mesh = false) => {
    const object = mesh ? new THREE.Mesh(new THREE.BoxGeometry(.03, .03, .1), new THREE.MeshStandardMaterial()) : new THREE.Object3D();
    object.name = `${id}_${name}`; object.position.set(...position); root.add(object); return object;
  };
  add('body', [0, 0, 0], true); add('mag', [0, .02, -.02], true); add('slide', [0, .05, 0], true);
  add('muzzle', [0, .05, -.3]); add('eject', [.02, .05, -.05]); add('sight', [0, .08, .03]);
  return { scene } as never;
}
async function harness() {
  const { WeaponView } = await import('../src/render/weapons');
  const loader = { gltf: async (url: string) => url.includes('fp-arms') ? armsAsset() : weaponAsset(url.split('/').pop()!.replace('.glb', '') as WeaponId) };
  const view = new WeaponView(loader as never);
  await view.assets;
  const actor = { alive: true, stage: 'ground', grounded: true, swimming: false, crouch: false, lean: 0, yaw: 0, pitch: 0,
    weapons: [{ id: 'pistol', rarity: 0, ammo: 17, reserve: 34, box: 2 }, { id: 'smg', rarity: 0, ammo: 25, reserve: 50, box: 0 }, { id: 'machete', rarity: 0, ammo: 0, reserve: 0, box: 3 }],
    slot: 0, reloadUntil: 0, ads: false, sprint: false, velocity: { x: 0, y: 0, z: 0 }, emote: null, emoteUntil: 0 } as unknown as ActorState;
  let time = 1;
  const step = (dt = 1 / 60, settings = DEFAULT_SETTINGS) => { time += dt; view.update(actor, dt, settings, 0, time); };
  const holder = (view as unknown as { holder: THREE.Group }).holder;
  return { view, actor, holder, step, now: () => time };
}

describe('first-person viewmodel', () => {
  it('keeps a sidearm above the waterline and never aims or inspects while swimming', async () => {
    const h = await harness(); for (let i = 0; i < 30; i++) h.step();
    const dryY = h.holder.position.y;
    h.actor.swimming = true; h.actor.grounded = false; h.actor.ads = true;
    for (let i = 0; i < 90; i++) h.step();
    expect(h.view.adsAmount).toBe(0); expect(h.view.inspect()).toBe(false);
    expect(h.holder.position.y).toBeGreaterThan(dryY + .01);
  });

  it('inspects only after a live eligible update and returns exactly to the hip pose', async () => {
    const h = await harness(); expect(h.view.inspect()).toBe(false);
    for (let i = 0; i < 60; i++) h.step();
    const rest = h.holder.position.clone();
    expect(h.view.inspect()).toBe(true);
    for (let i = 0; i < 50; i++) h.step();
    expect(h.holder.position.distanceTo(rest)).toBeGreaterThan(.02);
    for (let i = 0; i < 70; i++) h.step();
    expect(h.holder.position.distanceTo(rest)).toBeLessThan(.005);
  });

  for (const state of ['ads', 'sprint', 'reload', 'switch', 'death', 'air', 'emote'] as const) it(`${state} cancels inspection`, async () => {
    const h = await harness(); for (let i = 0; i < 30; i++) h.step();
    expect(h.view.inspect()).toBe(true); h.step();
    if (state === 'ads') h.actor.ads = true;
    if (state === 'sprint') { h.actor.sprint = true; h.actor.velocity.z = -6; }
    if (state === 'reload') h.actor.reloadUntil = h.now() + 1;
    if (state === 'switch') h.actor.slot = 1;
    if (state === 'death') h.actor.alive = false;
    if (state === 'air') h.actor.grounded = false;
    if (state === 'emote') { h.actor.emote = 'wave'; h.actor.emoteUntil = h.now() + 2; }
    h.step();
    expect((h.view as unknown as { inspectTime: number }).inspectTime).toBe(-1);
  });

  it('a confirmed shot restores the rest transform before effects read the muzzle', async () => {
    const h = await harness(); for (let i = 0; i < 30; i++) h.step();
    const position = h.holder.position.clone();
    h.view.inspect(); for (let i = 0; i < 40; i++) h.step();
    h.view.shot('pistol');
    expect(h.holder.position.distanceTo(position)).toBeLessThan(.01);
    expect(h.view.inspect()).toBe(false);
  });

  it('fires from the shot weapon even while the previous one is still holstering', async () => {
    const h = await harness(); for (let i = 0; i < 10; i++) h.step();
    h.actor.slot = 1; h.step();
    expect(h.view.weapon).toBe('pistol');
    h.view.shot('smg');
    expect(h.view.weapon).toBe('smg');
  });

  it('draws a newly selected weapon at the hip even if the previous one was fully aimed', async () => {
    const h = await harness(); h.actor.ads = true; for (let i = 0; i < 60; i++) h.step();
    expect(h.view.adsAmount).toBeGreaterThan(.99);
    h.actor.slot = 1;
    for (let i = 0; i < 30 && h.view.weapon !== 'smg'; i++) h.step();
    expect(h.view.weapon).toBe('smg'); expect(h.view.adsAmount).toBeLessThan(.05);
  });

  it('the pistol reload takes the magazine out, seats a fresh one and leaves every part at rest', async () => {
    const h = await harness(); for (let i = 0; i < 20; i++) h.step();
    const mag = h.holder.getObjectByName('pistol_mag')!, rest = mag.position.clone();
    h.actor.reloadUntil = h.now() + WEAPONS.pistol.reload;
    let travelled = 0;
    while (h.now() < h.actor.reloadUntil) { h.step(); travelled = Math.max(travelled, mag.position.distanceTo(rest)); }
    expect(travelled).toBeGreaterThan(.05);
    h.actor.reloadUntil = 0; h.step();
    expect(mag.position.distanceTo(rest)).toBeLessThan(1e-6);
    expect(mag.visible).toBe(true);
  });

  it('pauses only on confirmed blade contact and alternates swing sides', async () => {
    const h = await harness(); h.actor.slot = 2; for (let i = 0; i < 40; i++) h.step();
    const view = h.view as unknown as { meleeTime: number; meleeSide: number };
    h.view.shot('machete', true);
    for (let i = 0; i < 9; i++) h.step();
    expect(view.meleeTime).toBeCloseTo(MELEE_CONTACT, 6);
    for (let i = 0; i < 40; i++) h.step();
    expect(view.meleeTime).toBe(MELEE_SECONDS);
    const side = view.meleeSide; h.view.shot('machete', false); expect(view.meleeSide).toBe(-side);
  });

  it('reduced motion suppresses the melee trail, hit-stop and camera kick', async () => {
    const h = await harness(); h.actor.slot = 2; for (let i = 0; i < 40; i++) h.step();
    const settings = { ...DEFAULT_SETTINGS, reducedMotion: true };
    h.view.shot('machete', true);
    for (let i = 0; i < 12; i++) h.step(1 / 60, settings);
    const view = h.view as unknown as { meleeTime: number; smear: THREE.Mesh };
    expect(view.meleeTime).toBeGreaterThan(MELEE_CONTACT); expect(view.smear.visible).toBe(false);
    const camera = new THREE.PerspectiveCamera(), before = camera.quaternion.clone();
    h.view.cameraFeedback(camera, true); expect(camera.quaternion.equals(before)).toBe(true);
  });

  it('paws hold the grip: the right wrist stays at the authored grip through sway and bob', async () => {
    const h = await harness();
    h.actor.velocity.z = -3.9;
    for (let i = 0; i < 90; i++) { h.actor.yaw += .01; h.step(); }
    const view = h.view as unknown as { targetR: { wrist: THREE.Vector3 }; holder: THREE.Group };
    const expected = new THREE.Vector3(.03, 0, .092).applyMatrix4(view.holder.matrixWorld);
    expect(view.targetR.wrist.distanceTo(expected)).toBeLessThan(1e-6);
  });

  it('plays each reload Foley cue once, in the order the mechanism moves', async () => {
    const h = await harness(); for (let i = 0; i < 20; i++) h.step();
    const cues: string[] = [];
    h.view.onFoley = cue => cues.push(cue);
    h.actor.reloadUntil = h.now() + WEAPONS.pistol.reload;
    while (h.now() < h.actor.reloadUntil) h.step(1 / 30);
    h.actor.reloadUntil = 0; for (let i = 0; i < 5; i++) h.step();
    expect(cues).toEqual(['mag-out', 'mag-drop', 'mag-in', 'slide-back', 'slide-home']);
  });
});
