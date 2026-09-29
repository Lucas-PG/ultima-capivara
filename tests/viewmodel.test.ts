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
    const fore = bone('fore', upper, [0, 0, -.245]), twist = bone('fore_twist', fore, [0, 0, 0]), hand = bone('hand', twist, [0, 0, -.2]);
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
  if (id === 'm4') { root.getObjectByName('m4_mag')!.position.z = -.071; add('bolt', [0, .062, -.062], true); add('release', [-.019, .026, -.01], true); }
  if (id === 'shotgun') { add('pump', [0, .031, -.277], true); root.getObjectByName('shotgun_mag')!.position.set(0, .012, -.067); }
  if (id === 'sniper') { add('bolt', [0, .074, .061], true); root.getObjectByName('sniper_mag')!.position.set(0, .023, -.108); }
  if (id === 'dmr') { add('charge', [.023, .074, -.061], true); root.getObjectByName('dmr_mag')!.position.set(0, .022, -.081); }
  if (id === 'coco') {
    add('pump', [0, .012, -.226], true); root.getObjectByName('coco_mag')!.position.set(0, .246, -.002);
    add('load1', [0, .246, -.092], true); add('load2', [0, .246, -.182], true);
  }
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

  // Aiming must put the sight line on the crosshair: otherwise shots leave the
  // screen centre while the gun points elsewhere, or the gun's body blocks the view.
  it('every gun at full aim puts its aim point on the view axis with the authored pitch', async () => {
    const { VIEW_SPECS } = await import('../src/render/viewmodel-specs');
    for (const id of Object.keys(VIEW_SPECS).filter(id => id !== 'machete') as WeaponId[]) {
      const h = await harness(); const spec = VIEW_SPECS[id];
      h.actor.weapons = [{ id, rarity: 0, ammo: 5, reserve: 10, box: 0 }] as ActorState['weapons'];
      for (let i = 0; i < 40; i++) h.step();
      h.actor.ads = true; for (let i = 0; i < 90; i++) h.step();
      expect(h.view.adsAmount, id).toBeGreaterThan(.99);
      const aim = new THREE.Vector3(...(spec.adsEye ?? [0, .08, .03])).multiplyScalar(spec.scale);
      h.holder.updateMatrix();
      const onScreen = aim.applyMatrix4(h.holder.matrix);
      expect(Math.hypot(onScreen.x, onScreen.y), id).toBeLessThan(.004);
      expect(onScreen.z, id).toBeCloseTo(-spec.adsDistance, 2);
      const muzzle = new THREE.Vector3(0, 0, -1).applyQuaternion(h.holder.quaternion);
      expect(Math.atan2(muzzle.y, -muzzle.z), id).toBeCloseTo(spec.adsPitch ?? 0, 1);
    }
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
    const expected = new THREE.Vector3(.033, -.024, .052).applyMatrix4(view.holder.matrixWorld);
    expect(view.targetR.wrist.distanceTo(expected)).toBeLessThan(1e-6);
  });

  it('rolls the forearms toward the gripping palms instead of twisting the wrist skin backwards', async () => {
    const h = await harness(); h.actor.weapons = [{ id: 'm4', rarity: 0, ammo: 30, reserve: 60, box: 0 }];
    for (let i = 0; i < 60; i++) h.step();
    const view = h.view as unknown as { arms: import('../src/render/fp-arms').ArmsRig; targetR: import('../src/render/fp-arms').HandTarget; targetL: import('../src/render/fp-arms').HandTarget };
    for (const [arm, target] of [[view.arms.right, view.targetR], [view.arms.left, view.targetL]] as const) {
      const fore = arm.fore.bone, hand = arm.hand.bone;
      const axis = hand.getWorldPosition(new THREE.Vector3()).sub(fore.getWorldPosition(new THREE.Vector3())).normalize();
      const expected = new THREE.Vector3().crossVectors(target.forward, target.palm);
      expected.addScaledVector(axis, -expected.dot(axis)).normalize();
      const actual = new THREE.Vector3(-1, 0, 0).applyQuaternion(arm.twist!.restWorld.clone().invert()).applyQuaternion(arm.twist!.bone.getWorldQuaternion(new THREE.Quaternion()));
      actual.addScaledVector(axis, -actual.dot(axis)).normalize();
      expect(actual.dot(expected)).toBeGreaterThan(.5);
    }
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

  for (const fps of [30, 60, 120]) for (const empty of [false, true]) it(`keeps M4 magazine contact and reload timing at ${fps} FPS (${empty ? 'empty' : 'partial'})`, async () => {
    const { M4_MAG_HAND } = await import('../src/render/viewmodel-anims');
    const h = await harness(); h.actor.weapons = [{ id: 'm4', rarity: 0, ammo: empty ? 0 : 14, reserve: 60, box: 0 }];
    for (let i = 0; i < fps; i++) h.step(1 / fps);
    const cues: string[] = []; h.view.onFoley = cue => cues.push(cue);
    const start = h.now(); h.actor.reloadUntil = start + WEAPONS.m4.reload; h.actor.ads = true; h.actor.velocity.z = -3;
    const internal = h.view as unknown as { targetL: import('../src/render/fp-arms').HandTarget; arms: import('../src/render/fp-arms').ArmsRig };
    const mag = h.view.scene.getObjectByName('m4_mag')!, bolt = h.view.scene.getObjectByName('m4_bolt')!;
    let contacts = 0;
    while (h.now() < start + 2.5) {
      h.step(1 / fps, { ...DEFAULT_SETTINGS, reducedMotion: fps === 120 });
      const phase = (h.now() - start) / 2.5;
      expect(h.actor.weapons[0]!.ammo).toBe(empty ? 0 : 14);
      if (phase > .21 && phase < .70) {
        const expected = new THREE.Vector3().fromArray(M4_MAG_HAND.wrist!).applyMatrix4(mag.matrixWorld);
        expect(internal.targetL.wrist.distanceTo(expected)).toBeLessThan(1e-6);
        expect(internal.arms.left.hand.bone.getWorldPosition(new THREE.Vector3()).distanceTo(expected)).toBeLessThan(1e-5);
        contacts++;
      }
      if (!empty) expect(bolt.position.z).toBeCloseTo(-.062, 6);
    }
    expect(contacts).toBeGreaterThan(20);
    expect(cues).toEqual(empty ? ['mag-out', 'mag-in', 'slide-home'] : ['mag-out', 'mag-in']);
    h.actor.reloadUntil = 0;
    for (let i = 0; i < fps / 2; i++) h.step(1 / fps);
    expect(mag.visible).toBe(true); expect(mag.position.distanceTo(new THREE.Vector3(0, .02, -.071))).toBeLessThan(1e-6);
    expect(h.view.adsAmount).toBe(1);
    h.view.dispose();
  });

  it('restarts magazine handling and Foley on consecutive M4 reloads without re-equipping', async () => {
    const h = await harness(); h.actor.weapons = [{ id: 'm4', rarity: 0, ammo: 0, reserve: 90, box: 0 }];
    for (let i = 0; i < 60; i++) h.step();
    const cues: string[] = []; h.view.onFoley = cue => cues.push(cue);
    for (const ammo of [0, 14, 0]) {
      h.actor.weapons[0].ammo = ammo;
      h.actor.reloadUntil = h.now() + WEAPONS.m4.reload;
      while (h.now() < h.actor.reloadUntil) h.step();
      h.actor.reloadUntil = 0; h.step();
      const mag = h.view.scene.getObjectByName('m4_mag')!;
      expect(mag.visible).toBe(true);
      expect(mag.position.distanceTo(new THREE.Vector3(0, .02, -.071))).toBeLessThan(1e-6);
    }
    expect(cues).toEqual(['mag-out', 'mag-in', 'slide-home', 'mag-out', 'mag-in', 'mag-out', 'mag-in', 'slide-home']);
    h.view.dispose();
  });

  for (const cancel of ['cancel', 'death', 'switch'] as const) it(`restores M4 mechanisms after ${cancel} during a hidden-magazine phase`, async () => {
    const h = await harness(); h.actor.weapons[0] = { id: 'm4', rarity: 0, ammo: 0, reserve: 60, box: 0 };
    for (let i = 0; i < 60; i++) h.step();
    h.actor.reloadUntil = h.now() + 2.5;
    for (let i = 0; i < 69; i++) h.step();
    const mag = h.view.scene.getObjectByName('m4_mag')!, bolt = h.view.scene.getObjectByName('m4_bolt')!;
    expect(mag.visible).toBe(false);
    if (cancel === 'death') h.actor.alive = false;
    else if (cancel === 'switch') h.actor.slot = 1;
    else h.actor.reloadUntil = 0;
    h.step();
    expect(mag.visible).toBe(true); expect(mag.position.distanceTo(new THREE.Vector3(0, .02, -.071))).toBeLessThan(1e-6);
    expect(bolt.position.z).toBeCloseTo(-.062, 6);
    h.view.dispose();
  });
});

describe('long-gun mechanisms', () => {
  async function equip(id: WeaponId, ammo: number) {
    const h = await harness(); h.actor.weapons = [{ id, rarity: 0, ammo, reserve: 30, box: 0 }];
    for (let i = 0; i < 60; i++) h.step();
    const cues: string[] = []; h.view.onFoley = cue => cues.push(cue);
    return { ...h, cues };
  }

  for (const id of ['dmr', 'sniper'] as const) for (const empty of [false, true]) it(`${id} ${empty ? 'empty' : 'tactical'} reload preserves support and chamber state`, async () => {
    const { VIEW_SPECS } = await import('../src/render/viewmodel-specs');
    const h = await equip(id, empty ? 0 : 3), start = h.now();
    const part = h.view.scene.getObjectByName(`${id}_${id === 'sniper' ? 'bolt' : 'charge'}`)!;
    const rest = part.position.clone(), rotation = part.quaternion.clone();
    const state = h.view as unknown as { targetR: import('../src/render/fp-arms').HandTarget; targetL: import('../src/render/fp-arms').HandTarget };
    let motion = 0;
    h.actor.reloadUntil = start + WEAPONS[id].reload;
    while (h.now() < h.actor.reloadUntil) {
      h.step(); h.holder.updateMatrixWorld(true);
      motion = Math.max(motion, part.position.distanceTo(rest));
      const phase = (h.now() - start) / WEAPONS[id].reload;
      if (empty && id === 'sniper' && phase > .25 && phase < .89) {
        expect(part.quaternion.angleTo(rotation)).toBeCloseTo(1.1, 5);
        expect(part.position.z - rest.z).toBeCloseTo(.075, 5);
      }
      if (!empty) {
        expect(part.position.distanceTo(rest)).toBeLessThan(1e-7);
        expect(part.quaternion.angleTo(rotation)).toBeLessThan(1e-7);
      }
      const gripR = new THREE.Vector3(...VIEW_SPECS[id].grips.R.wrist).applyMatrix4(h.holder.matrixWorld);
      const gripL = new THREE.Vector3(...VIEW_SPECS[id].grips.L!.wrist).applyMatrix4(h.holder.matrixWorld);
      if (empty && id === 'dmr' && part.position.distanceTo(rest) > .001)
        expect(state.targetL.wrist.distanceTo(gripL)).toBeLessThan(1e-6);
      // A heavy rifle must always retain at least one hand on its main grip.
      expect(Math.min(state.targetR.wrist.distanceTo(gripR), state.targetL.wrist.distanceTo(gripL))).toBeLessThan(1e-6);
    }
    if (empty) expect(motion).toBeGreaterThan(.06);
    expect(h.cues.filter(cue => cue === 'mag-in')).toHaveLength(1);
    expect(h.cues.filter(cue => cue === 'mag-out')).toHaveLength(1);
    expect(h.cues.filter(cue => cue === (id === 'sniper' ? 'bolt-back' : 'slide-back'))).toHaveLength(empty ? 1 : 0);
    h.actor.reloadUntil = 0; h.step();
    expect(part.position.distanceTo(rest)).toBeLessThan(1e-7);
    h.view.dispose();
  });

  it('keeps the sniper firing paw attached to the turning and translating bolt knob', async () => {
    const { SNIPER_BOLT_HAND } = await import('../src/render/viewmodel-anims');
    const { weaponShotDuration } = await import('../src/shared/weapon-presentation');
    const h = await equip('sniper', 4);
    const bolt = h.view.scene.getObjectByName('sniper_bolt')!;
    const state = h.view as unknown as { targetR: import('../src/render/fp-arms').HandTarget };
    h.view.shot('sniper');
    let contacts = 0;
    for (let t = 0; t < weaponShotDuration('sniper') + .1; t += 1 / 120) {
      h.step(1 / 120);
      const phase = (t + 1 / 120) / weaponShotDuration('sniper');
      if (phase > .23 && phase < .83) {
        const anchor = new THREE.Vector3(...SNIPER_BOLT_HAND.wrist!).applyMatrix4(bolt.matrixWorld);
        expect(state.targetR.wrist.distanceTo(anchor)).toBeLessThan(1e-6); contacts++;
      }
    }
    expect(contacts).toBeGreaterThan(40);
    expect(h.cues).toEqual(['bolt-open', 'bolt-back', 'bolt-home']);
    h.view.dispose();
  });

  for (const initial of [0, 3]) it(`loads six shotgun shells from ${initial} and racks only after an empty sequence`, async () => {
    const h = await equip('shotgun', initial), pump = h.view.scene.getObjectByName('shotgun_pump')!;
    const rest = pump.position.z;
    h.actor.reloadUntil = h.now() + WEAPONS.shotgun.reload;
    let cycles = 0, travel = 0;
    while (h.actor.weapons[0].ammo < 6) {
      if (h.now() + 1 / 120 >= h.actor.reloadUntil) {
        h.actor.weapons[0].ammo++; cycles++;
        h.actor.reloadUntil = h.actor.weapons[0].ammo < 6 ? h.actor.reloadUntil + WEAPONS.shotgun.reload : 0;
      }
      h.step(1 / 120);
      travel = Math.max(travel, pump.position.z - rest);
    }
    for (let i = 0; i < 65; i++) { h.step(1 / 120); travel = Math.max(travel, pump.position.z - rest); }
    expect(cycles).toBe(6 - initial);
    expect(h.cues.filter(cue => cue === 'shell-in')).toHaveLength(6 - initial);
    expect(h.cues.filter(cue => cue === 'pump-back')).toHaveLength(initial === 0 ? 1 : 0);
    expect(h.cues.filter(cue => cue === 'pump-home')).toHaveLength(initial === 0 ? 1 : 0);
    expect(travel).toBeCloseTo(initial === 0 ? .085 : 0, 3);
    expect(pump.position.z).toBeCloseTo(rest, 7);
    h.view.dispose();
  });

  for (const ammo of [0, 1, 2, 3]) it(`refills exactly ${4 - ammo} coconuts and preserves the chamber when it contains a round`, async () => {
    const h = await equip('coco', ammo);
    const mag = h.view.scene.getObjectByName('coco_mag')!, middle = h.view.scene.getObjectByName('coco_load1')!, front = h.view.scene.getObjectByName('coco_load2')!;
    expect(Number(mag.visible) + Number(middle.visible) + Number(front.visible)).toBe(Math.max(0, ammo - 1));
    h.actor.reloadUntil = h.now() + WEAPONS.coco.reload;
    while (h.now() < h.actor.reloadUntil) h.step(1 / 120);
    expect(h.cues.filter(cue => cue === 'coconut-in')).toHaveLength(4 - ammo);
    expect(h.cues.filter(cue => cue === 'pump-back')).toHaveLength(ammo === 0 ? 1 : 0);
    expect(h.cues.filter(cue => cue === 'pump-home')).toHaveLength(ammo === 0 ? 1 : 0);
    h.actor.reloadUntil = 0; h.actor.weapons[0].ammo = 4; h.step();
    expect(mag.visible && middle.visible && front.visible).toBe(true);
    h.view.dispose();
  });
});
