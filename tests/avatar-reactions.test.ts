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
  it('anchors labels 35 cm over the loaded crown, including crouched avatars', () => {
    const h = harness();
    for (const crouch of [false, true]) {
      h.actor.crouch = crouch;
      camera.position.set(0, crouch ? 1.15 : 1.6, 3);
      camera.lookAt(0, crouch ? 1.15 : 1.6, 0);
      h.advance(.6);
      h.visual.group.updateMatrixWorld(true);
      h.visual.body.traverse(object => { if (object instanceof THREE.SkinnedMesh) object.skeleton.update(); });
      const crown = new THREE.Box3().setFromObject(h.rig, true).max.y;
      const anchor = h.visual.label.getWorldPosition(new THREE.Vector3()).y;
      expect(h.visual.label.visible).toBe(true);
      expect(Math.abs(anchor - crown - .35)).toBeLessThan(.015);
    }
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
    h.advance(.7);
    expect(h.actor.alive).toBe(true); expect(capybaraIsDead(h.visual.body)).toBe(true);
    expect(h.visual.group.visible).toBe(true); expect(Math.abs(h.rig.rotation.z)).toBeGreaterThan(1.3);
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
