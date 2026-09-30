import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { AvatarView } from '../src/render/avatars';
import { capybaraIsDead, disposeCapybaraAssets, preloadCapybaraAsset } from '../src/render/capybara';
import { emptyInput } from '../src/shared/math';
import type { ActorState, RenderFrame, WorldSnapshot } from '../src/shared/types';

let view: AvatarView, camera: THREE.PerspectiveCamera;
beforeEach(async () => {
  const context = { measureText: () => ({ width: 160 }), scale() {}, strokeText() {}, fillText() {}, beginPath() {}, arc() {}, fill() {} };
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
  vi.stubGlobal('self', globalThis);
  vi.stubGlobal('createImageBitmap', async () => ({ width: 16, height: 16, close() {} }));
  const bytes = await readFile('public/models/capybara/capybara.glb');
  await preloadCapybaraAsset(() => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ''));
  camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.6, 5); camera.lookAt(0, 1.6, 0);
  view = new AvatarView(new THREE.Scene(), camera); view.resize(1280, 720);
});
afterEach(() => { view?.dispose(); disposeCapybaraAssets(); vi.unstubAllGlobals(); });

function harness() {
  const actor = { id: 'target', name: 'Capivara', color: '#1fb5a8', pos: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
    alive: true, hp: 100, armor: 100, helmet: 0, kills: 0, stage: 'ground', grounded: true, crouch: false, yaw: 0, pitch: 0, lean: 0,
    weapons: [], slot: 0, sprint: false, ads: false } as unknown as ActorState;
  const snapshot = { matchId: 'first', phase: 'playing', actors: [actor], results: [] } as unknown as WorldSnapshot;
  const frame: RenderFrame = { snapshot, playerId: 'observer', playing: true, spectateId: null, input: emptyInput(), dt: 1 / 60 };
  let elapsed = 0;
  const advance = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) view.update(frame, 0, elapsed += frame.dt); };
  advance(.3);
  const visual = view.get(actor.id)!;
  const rig = visual.body.getObjectByName('Capivara_LOD')!.parent!;
  const mouth = visual.body.getObjectByName('mouth_cavity')!;
  return { actor, snapshot, frame, visual, rig, mouth, advance };
}

describe('authoritative character reactions', () => {
  it('keeps short-gun magazines attached to the support paw and chambers only after an empty reload', async () => {
    const { pistolReload, smgReload } = await import('../src/render/viewmodel-anims');
    const { WEAPONS } = await import('../src/shared/weapons');
    const h = harness();
    for (const id of ['pistol', 'smg'] as const) {
      h.actor.weapons = [{ id, ammo: 0, reserve: 60, rarity: 0, box: 0 }];
      const duration = WEAPONS[id].reload;
      h.actor.reloadUntil = 10 + duration;
      const keys = id === 'pistol' ? pistolReload(true) : smgReload(true);
      const contact = keys.find(k => k.L?.space === 'part' && k.L.part === 'mag' && k.mag?.out === 0)!.L!.wrist!;
      for (const phase of id === 'pistol' ? [.42, .55, .67] : [.17, .29, .57, .68]) {
        h.snapshot.time = 10 + phase * duration; view.update(h.frame, 0, h.snapshot.time); h.visual.group.updateMatrixWorld(true);
        const mag = h.visual.weapon.getObjectByName(`${id}_mag`)!;
        const expected = new THREE.Vector3().fromArray(contact).applyMatrix4(mag.matrixWorld);
        expect(h.visual.body.getObjectByName('paw_L')!.getWorldPosition(new THREE.Vector3()).distanceTo(expected), `${id} magazine contact ${phase}`).toBeLessThan(.015);
        expect(mag.visible).toBe(true);
      }
      const part = h.visual.weapon.getObjectByName(`${id}_${id === 'pistol' ? 'slide' : 'charge'}`)!;
      const phase = id === 'pistol' ? .81 : .845;
      h.snapshot.time = 10 + phase * duration; view.update(h.frame, 0, h.snapshot.time);
      const pulled = part.position.z;
      h.snapshot.time = 10 + .90 * duration; view.update(h.frame, 0, h.snapshot.time);
      expect(pulled - part.position.z).toBeGreaterThan(id === 'pistol' ? .025 : .06);
      h.actor.weapons[0].ammo = 3; h.actor.reloadUntil = 20 + duration;
      h.snapshot.time = 20 + phase * duration; view.update(h.frame, 0, h.snapshot.time);
      expect(part.position.z).toBeCloseTo(part.userData.rest.z);
      camera.position.z = 18; view.update(h.frame, 0, h.snapshot.time);
      expect(h.visual.weapon.geometry.name).toBe(`painted-world:${id}:far`);
      for (const child of h.visual.weapon.children) expect(child.visible).toBe(false);
      camera.position.z = 5;
    }
  });

  it('swings the world revolver cylinder, ejects six cases and leaves loaded rounds in the chambers', () => {
    const h = harness(); h.actor.weapons = [{ id: 'revolver', ammo: 0, reserve: 24, rarity: 0, box: 0 }]; h.actor.reloadUntil = 12.3;
    const pose = (phase: number) => { h.snapshot.time = 10 + phase * 2.3; view.update(h.frame, 0, h.snapshot.time); h.visual.group.updateMatrixWorld(true); };
    pose(.17);
    const part = (name: string) => h.visual.weapon.getObjectByName(`revolver_${name}`)!;
    expect(part('cylinder').position.x).toBeLessThan(-.025);
    pose(.35); expect(part('action').position.z - part('action').userData.rest.z).toBeCloseTo(.03);
    for (let i = 0; i < 6; i++) expect(part(`case${i}`).visible).toBe(true);
    pose(.60); expect(part('rounds').position.distanceTo(part('mag').position)).toBeLessThan(1e-6);
    pose(.676); const loaded = part('rounds').position.clone();
    pose(.73); expect(part('rounds').position.distanceTo(loaded)).toBeLessThan(1e-6);
    expect(part('rounds').position.distanceTo(part('mag').position)).toBeGreaterThan(.04);
    pose(.90); expect(part('cylinder').position.distanceTo(part('cylinder').userData.rest)).toBeLessThan(.001);
    expect(part('mag').visible).toBe(false);
    for (let i = 0; i < 6; i++) expect(part(`case${i}`).visible).toBe(false);
    h.actor.reloadUntil = 0; pose(1);
    expect(part('rounds').visible).toBe(true); expect(part('mag').visible).toBe(false);
    h.actor.weapons[0].ammo = 3; h.actor.reloadUntil = 22.3;
    h.snapshot.time = 20 + .35 * 2.3; view.update(h.frame, 0, h.snapshot.time);
    const tips = Array.from({ length: 6 }, (_, i) => part(`live${i}`));
    expect(tips.filter(p => p.visible)).toHaveLength(3);
    for (let i = 0; i < 3; i++) expect(tips[i].position.distanceTo(part(`case${i}`).position)).toBeLessThan(1e-6);
  });

  it('shows both machete cuts and the third overhead chop while keeping the free paw clear and returning to carry', async () => {
    const { VIEW_SPECS } = await import('../src/render/viewmodel-specs');
    const h = harness(); h.actor.weapons = [{ id: 'machete', ammo: 0, reserve: 0, rarity: 0, box: 0 }]; h.advance(.1);
    const weapon = h.visual.weapon, start = weapon.getWorldPosition(new THREE.Vector3());
    const left = h.visual.body.getObjectByName('paw_L')!, right = h.visual.body.getObjectByName('paw_R')!;
    const free = left.getWorldPosition(new THREE.Vector3()), windHeights: number[] = [], sides: number[] = [];
    for (let cut = 0; cut < 3; cut++) {
      view.attack(h.actor.id); sides.push(h.visual.strike.side); h.advance(5 / 60);
      weapon.updateWorldMatrix(true, true);
      windHeights.push(new THREE.Vector3(0, 0, -.45).applyMatrix4(weapon.matrixWorld).y);
      h.advance(.10); weapon.updateWorldMatrix(true, true);
      const contact = new THREE.Vector3().fromArray(VIEW_SPECS.machete.grips.R.wrist).applyMatrix4(weapon.matrixWorld);
      expect(right.getWorldPosition(new THREE.Vector3()).distanceTo(contact)).toBeLessThan(.015);
      expect(left.getWorldPosition(new THREE.Vector3()).distanceTo(free)).toBeLessThan(.015);
      expect(weapon.getWorldPosition(new THREE.Vector3()).distanceTo(start)).toBeGreaterThan(.07);
      h.advance(.5);
      expect(weapon.getWorldPosition(new THREE.Vector3()).distanceTo(start)).toBeLessThan(.02);
    }
    expect(sides).toEqual([1, -1, 1]);
    expect(windHeights[2]).toBeGreaterThan(Math.max(windHeights[0], windHeights[1]) + .08);
    view.attack(h.actor.id); view.respawn(h.actor.id); expect(h.visual.strike.count).toBe(0);
  });

  it('keeps the nearby M4 magazine in the support paw throughout removal and insertion, with a combined far LOD', async () => {
    const { M4_MAG_HAND } = await import('../src/render/viewmodel-anims');
    const h = harness(); h.actor.weapons = [{ id: 'm4', ammo: 0, reserve: 60, rarity: 0, box: 0 }];
    h.actor.reloadUntil = 3.5;
    const mag = h.visual.weapon.getObjectByName('m4_mag')!;
    for (const phase of [.22, .30, .39, .52, .60, .69]) {
      h.snapshot.time = 1 + phase * 2.5;
      view.update(h.frame, 0, h.snapshot.time);
      h.visual.group.updateMatrixWorld(true);
      const expected = new THREE.Vector3().fromArray(M4_MAG_HAND.wrist!).applyMatrix4(mag.matrixWorld);
      const paw = h.visual.body.getObjectByName('paw_L')!.getWorldPosition(new THREE.Vector3());
      expect(paw.distanceTo(expected), `contact at ${phase}`).toBeLessThan(.008);
      expect(mag.visible).toBe(true);
    }
    h.snapshot.time = 2.15; view.update(h.frame, 0, h.snapshot.time); expect(mag.visible).toBe(false);
    camera.position.z = 18; view.update(h.frame, 0, h.snapshot.time);
    expect(h.visual.weapon.geometry.name).toBe('painted-world:m4:far'); expect(mag.visible).toBe(false);
    camera.position.z = 5; h.actor.reloadUntil = 0; view.update(h.frame, 0, h.snapshot.time);
    expect(h.visual.weapon.geometry.name).toBe('painted-world:m4:nearBody'); expect(mag.visible).toBe(true);
    expect(mag.position.toArray()).toEqual([0, .02, -.071]);
  });

  it('squashes then stretches a trampoline capy around the feet without moving its actor, and clears the cue', () => {
    const h = harness(); h.actor.grounded = false; h.actor.velocity.y = 12;
    const state = structuredClone(h.actor), root = h.visual.group.position.clone();
    view.bounce(h.actor.id); h.advance(.05);
    expect(h.visual.body.scale.y).toBeLessThan(.92);
    expect(h.visual.body.scale.x * h.visual.body.scale.y * h.visual.body.scale.z).toBeCloseTo(1);
    h.visual.group.updateMatrixWorld(true);
    expect(h.visual.body.localToWorld(new THREE.Vector3()).distanceTo(root)).toBeLessThan(1e-6);
    h.advance(.17);
    expect(h.visual.body.scale.y).toBeGreaterThan(1.1);
    expect(h.visual.group.scale.toArray()).toEqual([1, 1, 1]);
    expect(h.visual.group.position.equals(root)).toBe(true); expect(h.actor).toEqual(state);
    h.advance(.4); expect(h.visual.body.scale.toArray()).toEqual([1, 1, 1]);
    view.bounce(h.actor.id); h.advance(.05); view.respawn(h.actor.id);
    expect(h.visual.body.scale.toArray()).toEqual([1, 1, 1]);
    view.bounce(h.actor.id); h.snapshot.matchId = 'after-bounce'; h.advance(1 / 60);
    expect(h.visual.body.scale.toArray()).toEqual([1, 1, 1]);
    view.bounce(h.actor.id); view.update(h.frame, 0, 1, true);
    expect(h.visual.body.scale.toArray()).toEqual([1, 1, 1]);
    h.advance(.1); expect(h.visual.body.scale.toArray()).toEqual([1, 1, 1]);
  });

  it('simplifies a distant held pistol without changing its socket and avoids LOD flicker', () => {
    const h = harness(); h.actor.weapons = [{ id: 'pistol', ammo: 12, reserve: 24, rarity: 0, box: 2 }];
    h.advance(1 / 60);
    const near = h.visual.weapon.geometry, socket = h.visual.weapon.position.clone();
    camera.position.set(0, 1.6, 18); h.advance(1 / 60);
    const far = h.visual.weapon.geometry;
    expect(far.getAttribute('position').count).toBeLessThan(near.getAttribute('position').count * .5);
    camera.position.z = 13; h.advance(1 / 60);
    expect(h.visual.weapon.geometry).toBe(far);
    camera.position.z = 11; h.advance(1 / 60);
    expect(h.visual.weapon.geometry).toBe(near);
    // The hold pose breathes with the idle clip; the LOD swap itself must not move the gun.
    expect(h.visual.weapon.position.distanceTo(socket)).toBeLessThan(.02);
    expect(h.actor.weapons[0].id).toBe('pistol');
  });

  it('anchors labels 35 cm over the loaded crown, including crouched avatars', () => {
    const h = harness();
    for (const crouch of [false, true]) {
      h.actor.crouch = crouch;
      camera.position.set(0, crouch ? 1.15 : 1.6, 3);
      camera.lookAt(0, crouch ? 1.15 : 1.6, 0);
      h.advance(.6);
      expect(h.visual.group.scale.toArray()).toEqual([1, 1, 1]);
      h.visual.group.updateMatrixWorld(true);
      h.visual.body.traverse(object => { if (object instanceof THREE.SkinnedMesh) object.skeleton.update(); });
      const crown = new THREE.Box3().setFromObject(h.rig, true).max.y;
      const anchor = h.visual.label.getWorldPosition(new THREE.Vector3()).y;
      expect(h.visual.label.visible).toBe(true);
      expect(Math.abs(anchor - crown - .35)).toBeLessThan(.015);
    }
  });
  it('shortens resting arms without accumulating scale or changing combat reach', () => {
    const h = harness(), arm = h.visual.body.getObjectByName('arm_R')!;
    h.advance(2);
    expect(arm.scale.x).toBeCloseTo(.95, 4);
    h.advance(2);
    expect(arm.scale.x).toBeCloseTo(.95, 4);
    h.actor.weapons = [{ id: 'm4', ammo: 30, reserve: 90, rarity: 0, box: 0 }];
    h.advance(2);
    expect(arm.scale.x).toBeCloseTo(1, 4);
  });
  it('reacts to armor-only damage without an HP delta and does not replay it from a later snapshot', () => {
    const h = harness(), neutral = h.mouth.scale.y;
    view.react(h.actor.id, { kind: 'hit', head: false, amount: 25, from: { x: 3, y: 1.6, z: -2 } });
    h.advance(.1);
    expect(h.actor.hp).toBe(100);
    expect(h.mouth.scale.y).toBeGreaterThan(neutral + .2);
    h.advance(.8); const recovered = h.mouth.scale.y;
    h.actor.hp = 75; h.actor.kills++;
    h.advance(.1);
    expect(h.mouth.scale.y).toBeLessThan(recovered + .02);
  });
  it('holds death through a still-alive snapshot, shows a flop, and resets on the respawn event', () => {
    const h = harness();
    view.react(h.actor.id, { kind: 'death', head: false, weapon: 'm4', from: { x: 3, y: 1, z: 0 } });
    h.advance(1.3);
    expect(h.actor.alive).toBe(true); expect(capybaraIsDead(h.visual.body)).toBe(true);
    expect(h.visual.group.visible).toBe(true);
    h.visual.group.updateMatrixWorld(true);
    h.visual.body.traverse(object => { if (object instanceof THREE.SkinnedMesh) object.skeleton.update(); });
    const corpse = new THREE.Box3().setFromObject(h.rig, true);
    expect(corpse.max.y - corpse.min.y).toBeLessThan(1.1);
    expect(h.rig.rotation.z).toBe(0); // Authored fall is not doubled by the legacy flop.
    h.actor.alive = false; h.advance(.1);
    view.respawn(h.actor.id);
    // A respawn event can precede its alive snapshot: the old dead snapshot must not replay death.
    h.advance(.1); expect(capybaraIsDead(h.visual.body)).toBe(false);
    h.actor.alive = true; h.actor.pos.x = 4; h.advance(1 / 60);
    expect(h.rig.rotation.z).toBe(0); expect(h.visual.group.visible).toBe(true);
    expect(h.visual.group.position.x).toBe(4);
  });
  it('does not render the local corpse inside the camera before death-cam pullback', () => {
    const h = harness(); h.frame.playerId = h.actor.id; camera.position.set(0, 1.62, 0);
    view.react(h.actor.id, { kind: 'death', head: false, weapon: 'm4', from: null });
    h.advance(.1); expect(h.visual.group.visible).toBe(false);
    h.actor.alive = false; camera.position.set(0, 2, 3);
    h.advance(.1); expect(h.visual.group.visible).toBe(true);
  });
  it('expires the corpse and accepts an observed dead-to-alive snapshot when an event was missed', () => {
    const h = harness(); h.actor.alive = false; h.advance(.8);
    expect(h.visual.group.visible).toBe(true);
    h.advance(2); expect(h.visual.group.visible).toBe(false);
    h.actor.alive = true; h.advance(1 / 60);
    expect(h.visual.group.visible).toBe(true); expect(capybaraIsDead(h.visual.body)).toBe(false);
    expect(h.rig.rotation.z).toBe(0);
  });
  it('celebrates only a results winner once, including a downed winner, and resets on a new match', () => {
    const h = harness(); h.actor.kills = 12; h.advance(.5); expect(h.visual.celebrated).toBe(false);
    h.actor.alive = false; h.advance(.3);
    h.snapshot.phase = 'results'; h.snapshot.results = [{ id: h.actor.id, winner: true }] as WorldSnapshot['results'];
    h.frame.playing = false; h.advance(.5);
    expect(h.visual.celebrated).toBe(true); expect(capybaraIsDead(h.visual.body)).toBe(false); expect(h.visual.group.visible).toBe(true);
    h.advance(2); const resting = h.mouth.scale.y;
    h.advance(1); expect(h.mouth.scale.y).toBeCloseTo(resting, 2);
    h.snapshot.matchId = 'second'; h.snapshot.phase = 'playing'; h.snapshot.results = []; h.actor.alive = true;
    h.advance(.2); expect(h.visual.celebrated).toBe(false); expect(h.rig.rotation.z).toBe(0);
  });
});
