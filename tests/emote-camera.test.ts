import * as THREE from 'three';
import { expect, it } from 'vitest';
import { CameraRig } from '../src/render/camera';
import { DEFAULT_SETTINGS } from '../src/settings';
import { emptyInput } from '../src/shared/math';
import { terrainHeight } from '../src/shared/terrain';
import type { ActorState, RenderFrame, WorldSpec } from '../src/shared/types';

function fixture(blocked = false, reducedMotion = false) {
  const y = terrainHeight(-1, -10);
  const actor = { id: 'me', alive: true, pos: { x: -1, y, z: -10 }, velocity: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0, lean: 0, stage: 'ground', grounded: true, crouch: false, swimming: false,
    emote: null, emoteUntil: 0, weapons: [{ id: 'pistol' }], slot: 0 } as ActorState;
  const world = { version: 'camera-emote', size: 260, colliders: blocked ? [
    { id: 'front-wall', material: 'stone', min: { x: -5, y, z: -12 }, max: { x: 3, y: y + 3, z: -11 } },
  ] : [], objects: [], spawns: [], loot: [], chests: [], districts: [] } as WorldSpec;
  const settings = { ...DEFAULT_SETTINGS, reducedMotion }, camera = new THREE.PerspectiveCamera(settings.fov, 16 / 9, .07, 850);
  const rig = new CameraRig(camera, world, settings, { get: () => undefined } as any);
  const frame = { snapshot: { actors: [actor], time: 10 }, playerId: actor.id, input: emptyInput(), dt: 1 / 60,
    playing: true, spectateId: null } as RenderFrame;
  const step = (count = 1) => { for (let i = 0; i < count; i++) rig.update(frame, settings, i / 60, 0); };
  return { actor, camera, rig, step };
}

it('shows the local gesture from the front and returns to the eyes after cancellation without moving the actor', () => {
  const h = fixture(); h.step(); const firstPerson = h.camera.position.clone(), state = structuredClone(h.actor);
  h.actor.emote = 'wave'; h.actor.emoteUntil = 13; h.step(60);
  expect(h.camera.position.z).toBeLessThan(h.actor.pos.z - 2);
  const look = new THREE.Vector3(h.actor.pos.x, h.actor.pos.y + 1.02, h.actor.pos.z).sub(h.camera.position).normalize();
  expect(h.camera.getWorldDirection(new THREE.Vector3()).dot(look)).toBeGreaterThan(.999);
  h.actor.emote = null; h.actor.emoteUntil = 0; h.step(60);
  expect(h.camera.position.distanceTo(firstPerson)).toBeLessThan(.005);
  expect(h.actor).toEqual(state);
});

it('uses a clear alternate side when a wall blocks the preferred face view', () => {
  const h = fixture(true, true); h.step(); h.actor.emote = 'dance'; h.actor.emoteUntil = 18; h.step();
  expect(h.camera.position.z).toBeGreaterThan(h.actor.pos.z + 2);
  expect(h.rig.cameraBlend).toBe(0);
});
