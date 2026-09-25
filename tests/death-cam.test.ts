import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig } from '../src/render/camera';
import { DEFAULT_SETTINGS } from '../src/settings';
import { terrainHeight } from '../src/shared/terrain';
import type { ActorState, RenderFrame, Settings, WorldSnapshot } from '../src/shared/types';

// The death cam frames your eliminator for a fixed beat, then gets out of the
// way: it never runs for a spectated capybara and never survives a respawn.
const at = (x: number, z: number) => ({ x, y: terrainHeight(x, z), z });
function rig(settings: Settings = DEFAULT_SETTINGS, colliders: { id: string; min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number }; material: 'stone' }[] = []) {
  const killer = new THREE.Group(); killer.position.copy(at(0, -20) as THREE.Vector3); killer.visible = true;
  const avatars = { get: (id: string) => id === 'killer' ? { group: killer } : undefined };
  const camera = new THREE.PerspectiveCamera(settings.fov, 16 / 9, .07, 850); camera.rotation.order = 'YXZ';
  const world = { version: 't', size: 256, colliders, objects: [], spawns: [], loot: [], chests: [], districts: [] };
  return new CameraRig(camera, world, settings, avatars as never);
}
const me = (alive: boolean): ActorState => ({ id: 'me', alive, pos: at(0, 0), velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, lean: 0, stage: 'ground',
  grounded: true, crouch: false, sprint: false, ads: false, weapons: [{ id: 'm4', ammo: 1, reserve: 1, rarity: 0 }], slot: 0 } as unknown as ActorState);
const frame = (alive: boolean, spectateId: string | null = null, dt = 1 / 60): RenderFrame => ({
  snapshot: { actors: [me(alive)], matchId: 'm' } as unknown as WorldSnapshot, playerId: 'me', spectateId, dt, playing: true,
  input: { yaw: 0, pitch: 0 } as RenderFrame['input'],
});
const run = (r: CameraRig, f: RenderFrame, seconds: number) => { for (let t = 0; t < seconds; t += f.dt) r.update(f, DEFAULT_SETTINGS, (r as any).elapsed + f.dt, 0); };
const start = (r: CameraRig) => r.startDeathCam({ victimEye: { x: 0, y: terrainHeight(0, 0) + 1.62, z: 0 }, killerId: 'killer', killerPos: at(0, -20), duration: 1.8 });

describe('death cam', () => {
  it('waits for the dead snapshot when the reliable kill overtakes the snapshot channel', () => {
    const r = rig();
    r.update(frame(true), DEFAULT_SETTINGS, 0, 0);
    start(r);
    run(r, frame(true), .4);
    expect(r.deathCamActive).toBe(true);
    // The intermediate dead snapshot was dropped. Its replacement starts the full beat.
    r.update(frame(false), DEFAULT_SETTINGS, .5, 0);
    r.update(frame(false), DEFAULT_SETTINGS, 2.2, 0);
    expect(r.deathCamActive).toBe(true);
    expect(r.camera.position.y).toBeGreaterThan(terrainHeight(0, 0) + 2.5);
    r.update(frame(false), DEFAULT_SETTINGS, 2.31, 0);
    expect(r.deathCamActive).toBe(false);
  });

  it('starts normally when the dead snapshot arrives before the kill event', () => {
    const r = rig();
    r.update(frame(false), DEFAULT_SETTINGS, .3, 0);
    start(r);
    r.update(frame(false), DEFAULT_SETTINGS, .4, 0);
    r.update(frame(false), DEFAULT_SETTINGS, 2.1, 0);
    expect(r.deathCamActive).toBe(true);
    r.update(frame(false), DEFAULT_SETTINGS, 2.21, 0);
    expect(r.deathCamActive).toBe(false);
  });

  it('expires an armed kill if no dead snapshot arrives, without taking over the living camera', () => {
    const r = rig();
    r.update(frame(true), DEFAULT_SETTINGS, 0, 0);
    const eye = r.camera.position.clone();
    start(r);
    run(r, frame(true), 3.1);
    expect(r.deathCamActive).toBe(false);
    expect(r.camera.position.distanceTo(eye)).toBeLessThan(1e-6);
  });

  it('rises out of the victim and turns to frame the eliminator, then ends after its duration', () => {
    const r = rig();
    r.update(frame(true), DEFAULT_SETTINGS, 0, 0);
    start(r);
    run(r, frame(false), .6);
    expect(r.deathCamActive).toBe(true);
    const cam = r.camera, forward = cam.getWorldDirection(new THREE.Vector3());
    const toKiller = new THREE.Vector3(0, terrainHeight(0, -20) + 1.2, -20).sub(cam.position).normalize();
    expect(forward.dot(toKiller)).toBeGreaterThan(.99);
    expect(cam.position.y).toBeGreaterThan(terrainHeight(0, 0) + 2.5);
    expect(cam.fov).toBeLessThan(DEFAULT_SETTINGS.fov);
    run(r, frame(false), 1.3);
    expect(r.deathCamActive).toBe(false);
  });

  it('cuts straight to the final framing with reduced motion', () => {
    const settings = { ...DEFAULT_SETTINGS, reducedMotion: true }, r = rig(settings);
    start(r);
    r.update(frame(false), settings, 1 / 60, 0);
    const first = r.camera.position.clone();
    r.update(frame(false), settings, .5, 0);
    expect(r.camera.position.distanceTo(first)).toBeLessThan(1e-6);
  });

  it('is dropped when you respawn or when the view belongs to a spectated capybara', () => {
    const r = rig();
    start(r); run(r, frame(false), .2);
    r.update(frame(true), DEFAULT_SETTINGS, (r as any).elapsed + 1 / 60, 0);
    expect(r.deathCamActive).toBe(false);
    start(r); r.update(frame(false, 'other'), DEFAULT_SETTINGS, (r as any).elapsed + 1 / 60, 0);
    expect(r.deathCamActive).toBe(false);
  });

  it('stays under a wide ceiling that spans far beyond the victim instead of rising through it', () => {
    const floor = terrainHeight(0, 0), ceiling = floor + 2.6;
    const r = rig(DEFAULT_SETTINGS, [{ id: 'roof', min: { x: -10, y: ceiling, z: -10 }, max: { x: 10, y: ceiling + .3, z: 10 }, material: 'stone' }]);
    start(r); run(r, frame(false), .8);
    expect(r.camera.position.y).toBeLessThan(ceiling);
  });

  it('keeps its full beat on its own frame clock when frames are slow and clamped', () => {
    const r = rig();
    start(r);
    r.update(frame(false), DEFAULT_SETTINGS, 0, 0);
    // 10 fps with the renderer's 0.05 s clamp: 1.8 s of camera clock takes 36 frames.
    const slow = frame(false, null, .05);
    for (let i = 0; i < 35; i++) r.update(slow, DEFAULT_SETTINGS, (r as any).elapsed + .05, 0);
    expect(r.deathCamActive).toBe(true);
    r.update(slow, DEFAULT_SETTINGS, (r as any).elapsed + .06, 0);
    expect(r.deathCamActive).toBe(false);
  });
});
