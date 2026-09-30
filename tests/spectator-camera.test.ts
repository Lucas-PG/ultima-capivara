import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig } from '../src/render/camera';
import { FOLLOW, FollowCamera, clearDistance, sweepBox } from '../src/render/follow-camera';
import { DEFAULT_SETTINGS } from '../src/settings';
import { emptyInput } from '../src/shared/math';
import { terrainHeight } from '../src/shared/terrain';
import type { ActorState, Collider, RenderFrame, Settings, WorldSnapshot, WorldSpec } from '../src/shared/types';

// The spectator camera is what an eliminated friend looks at for minutes: it must follow smoothly from over the
// watched capybara's shoulder, never show the inside of a wall or the ground, and travel (not cut) between targets.
const ground = (x: number, z: number) => terrainHeight(x, z);
const world = (colliders: Collider[] = []): WorldSpec => ({ version: 'spectator', size: 260, colliders, objects: [], spawns: [], loot: [], chests: [], districts: [] });
const box = (id: string, min: [number, number, number], max: [number, number, number]): Collider =>
  ({ id, material: 'stone', min: { x: min[0], y: min[1], z: min[2] }, max: { x: max[0], y: max[1], z: max[2] } });
const inside = (p: THREE.Vector3, c: Collider, pad = 0) => p.x > c.min.x - pad && p.x < c.max.x + pad && p.y > c.min.y - pad && p.y < c.max.y + pad && p.z > c.min.z - pad && p.z < c.max.z + pad;
const target = (x: number, z: number, yaw = 0, pitch = 0) => ({ pos: { x, y: ground(x, z), z }, yaw, pitch, crouch: false, swimming: false, alive: true });

describe('follow camera', () => {
  it('sits behind and over the right shoulder, looking where the target looks', () => {
    const cam = new FollowCamera(), t = target(0, 0);
    cam.update(world(), t, 1 / 60);
    // yaw 0 faces -z: behind is +z, right is +x.
    expect(cam.position.z).toBeGreaterThan(t.pos.z + FOLLOW.distance * .8);
    expect(cam.position.x).toBeGreaterThan(t.pos.x + .3);
    expect(cam.position.y).toBeGreaterThan(t.pos.y + 1);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    expect(forward.z).toBeLessThan(-.95);
  });

  it('pulls in at once in front of a wall behind the target and never ends inside it', () => {
    const y = ground(0, 0), wall = box('wall', [-6, y - 1, 1.2], [6, y + 5, 1.6]);
    const cam = new FollowCamera(), t = target(0, 0);
    cam.update(world([wall]), t, 1 / 60);
    expect(cam.position.z).toBeLessThan(wall.min.z);
    expect(inside(cam.position, wall, .15)).toBe(false);
    // Straight behind, the lens would have had under 1.3 m; it starts reframed instead.
    expect(clearDistance(world([wall]), { x: t.pos.x + FOLLOW.shoulder, y: t.pos.y + FOLLOW.height, z: 0 }, { x: 0, y: 0, z: 1 }, FOLLOW.distance, FOLLOW.probe)).toBeLessThan(1.3);
  });

  // The integration pass measured the watched capybara off screen 6% of the time: the lens squeezed
  // inside a metre of a target backed against a wall, so the body was hidden and the view was a wall.
  const inView = (cam: FollowCamera, t: ReturnType<typeof target>) => {
    const head = new THREE.Vector3(t.pos.x, t.pos.y + 1.2, t.pos.z).sub(cam.position), forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    return head.angleTo(forward) < .55;
  };
  it('rises over a low wall the target backs into, keeping the body in view', () => {
    const y = ground(0, 0), muro = box('muro', [-8, y - 1, .45], [8, y + 1.35, .75]);
    const cam = new FollowCamera(), t = target(0, 0);
    cam.update(world([muro]), t, 1 / 60);
    for (let i = 0; i < 60; i++) cam.update(world([muro]), t, 1 / 60);
    expect(cam.reach).toBeGreaterThan(1.6);
    expect(inside(cam.position, muro, .1)).toBe(false);
    expect(cam.position.y).toBeGreaterThan(muro.max.y);
    expect(inView(cam, t)).toBe(true);
  });

  it('swings along a tall wall the target backs into, and glides home once it steps away', () => {
    const y = ground(0, 0), wall = box('wall', [-8, y - 1, .45], [8, y + 6, .75]), walled = world([wall]);
    const cam = new FollowCamera(), t = target(0, 0);
    cam.update(walled, t, 1 / 60);
    const path: THREE.Vector3[] = [];
    for (let i = 0; i < 180; i++) { cam.update(walled, t, 1 / 60); path.push(cam.position.clone()); }
    expect(cam.reach).toBeGreaterThan(1.6);
    expect(cam.position.z).toBeLessThan(wall.min.z);
    expect(inView(cam, t)).toBe(true);
    // Settled, not hunting between framings.
    const last = path.slice(-60), moved = Math.max(...last.slice(1).map((p, i) => p.distanceTo(last[i])));
    expect(moved).toBeLessThan(.01);
    // The target walks out into the open: the camera eases back behind it without a cut.
    let jump = 0, previous = cam.position.clone(), open = t;
    for (let i = 1; i <= 240; i++) {
      // Walking at 3 m/s: 5 cm a frame, 6 m in two seconds, then standing.
      open = target(0, -Math.min(6, i * .05));
      cam.update(walled, open, 1 / 60); jump = Math.max(jump, cam.position.distanceTo(previous) - .05); previous = cam.position.clone();
    }
    expect(jump).toBeLessThan(.25);
    expect(cam.position.z).toBeGreaterThan(open.pos.z + FOLLOW.distance * .8);
    expect(Math.abs(cam.position.x - open.pos.x - FOLLOW.shoulder)).toBeLessThan(.15);
  });

  it('eases back out after the wall is gone instead of jumping', () => {
    const y = ground(0, 0), wall = box('wall', [-6, y - 1, 1.2], [6, y + 5, 1.6]);
    const cam = new FollowCamera(), t = target(0, 0);
    cam.update(world([wall]), t, 1 / 60);
    const blocked = cam.reach, open = world();
    cam.update(open, t, 1 / 60);
    expect(cam.reach - blocked).toBeLessThan(FOLLOW.pullOutSpeed / 60 + 1e-6);
    for (let i = 0; i < 120; i++) cam.update(open, t, 1 / 60);
    expect(cam.reach).toBeCloseTo(FOLLOW.distance, 1);
  });

  it('keeps the shoulder pivot inside the room when the target hugs a wall on its right', () => {
    const y = ground(0, 0), wall = box('side', [.3, y - 1, -6], [.8, y + 5, 6]);
    const cam = new FollowCamera(), t = target(0, 0);
    cam.update(world([wall]), t, 1 / 60);
    expect(cam.position.x).toBeLessThan(wall.min.x);
  });

  it('stays above the ground when looking up from a slope', () => {
    const cam = new FollowCamera();
    for (const [x, z] of [[-60, 40], [20, -70], [70, 10], [0, 0]]) {
      cam.reset();
      for (let i = 0; i < 30; i++) cam.update(world(), target(x, z, 1.1, 1.3), 1 / 60);
      expect(cam.position.y).toBeGreaterThan(ground(cam.position.x, cam.position.z) + .2);
    }
  });

  it('damps a 20 Hz aim step instead of snapping the view', () => {
    const cam = new FollowCamera();
    cam.update(world(), target(0, 0, 0), 1 / 60);
    const before = new THREE.Quaternion().copy(cam.quaternion);
    cam.update(world(), target(0, 0, .5), 1 / 60);
    const turned = 2 * Math.acos(Math.min(1, Math.abs(before.dot(cam.quaternion))));
    expect(turned).toBeGreaterThan(.02);
    expect(turned).toBeLessThan(.2);
    for (let i = 0; i < 60; i++) cam.update(world(), target(0, 0, .5), 1 / 60);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    expect(Math.atan2(-forward.x, -forward.z)).toBeCloseTo(.5, 2);
  });

  it('orbits with the mouse and drifts back behind the target after a short idle', () => {
    const cam = new FollowCamera(), t = target(0, 0);
    cam.update(world(), t, 1 / 60);
    cam.orbit(Math.PI / 2, 0);
    cam.update(world(), t, 1 / 60);
    // A quarter turn to the left puts the camera on the target's right-hand side (+x).
    expect(cam.position.x).toBeGreaterThan(2);
    for (let i = 0; i < 60 * (FOLLOW.orbitIdle + 3); i++) cam.update(world(), t, 1 / 60);
    expect(cam.position.z).toBeGreaterThan(2.5);
  });

  it('frames a fallen target from above and slowly circles it', () => {
    const cam = new FollowCamera(), t = { ...target(0, 0), alive: false };
    cam.update(world(), t, 1 / 60);
    const start = cam.position.clone();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    expect(forward.y).toBeLessThan(-.3);
    for (let i = 0; i < 120; i++) cam.update(world(), t, 1 / 60);
    expect(cam.position.distanceTo(start)).toBeGreaterThan(.5);
  });

  it('sweeps a sphere, not a ray, so a lens that grazes an edge is stopped', () => {
    const hit = sweepBox({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 5, { x: .1, y: -1, z: 2 }, { x: 1, y: 1, z: 3 }, .2);
    expect(hit).toBeCloseTo(1.8, 5);
    expect(clearDistance(world([box('edge', [.1, ground(0, 0), 2], [1, ground(0, 0) + 3, 3])]), { x: 0, y: ground(0, 0) + 1.5, z: 0 }, { x: 0, y: 0, z: 1 }, 5, .2)).toBeLessThan(2);
  });
});

describe('camera rig while spectating', () => {
  const actor = (id: string, x: number, z: number, extra: Partial<ActorState> = {}): ActorState => ({
    id, name: id, alive: true, connected: true, bot: true, pos: { x, y: ground(x, z), z }, velocity: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0, lean: 0, stage: 'ground', grounded: true, crouch: false, swimming: false, emote: null, emoteUntil: 0,
    weapons: [{ id: 'm4', ammo: 30, reserve: 90, rarity: 0, box: 0 }], slot: 0, ...extra,
  } as ActorState);
  function rig(settings: Settings = DEFAULT_SETTINGS) {
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, .07, 850); camera.rotation.order = 'YXZ';
    return new CameraRig(camera, world(), settings, { get: () => undefined } as never);
  }
  const frame = (actors: ActorState[], spectateId: string | null, remote?: Map<string, ActorState>, phase = 'playing', results: unknown[] = []): RenderFrame => ({
    snapshot: { actors, matchId: 'm', phase, results, time: 20 } as unknown as WorldSnapshot, playerId: 'me', spectateId, dt: 1 / 60, playing: true,
    input: emptyInput(), remoteActors: remote,
  });

  it('follows the interpolated pose of the watched capybara, not the 20 Hz snapshot', () => {
    const r = rig(), me = actor('me', 0, 0, { alive: false }), bot = actor('bot', 20, 0);
    const smooth = actor('bot', 21, 0);
    r.update(frame([me, bot], 'bot', new Map([['bot', smooth]])), DEFAULT_SETTINGS, 0, 0);
    expect(r.camera.position.x).toBeGreaterThan(21);
    expect(r.lastActor?.pos.x).toBe(21);
  });

  it('travels to a new target along an arc over the roofs instead of cutting', () => {
    const r = rig(), me = actor('me', 0, 0, { alive: false }), a = actor('a', -40, 0), b = actor('b', 40, 0);
    let t = 0;
    for (let i = 0; i < 60; i++) r.update(frame([me, a, b], 'a'), DEFAULT_SETTINGS, t += 1 / 60, 0);
    const from = r.camera.position.clone();
    r.update(frame([me, a, b], 'b'), DEFAULT_SETTINGS, t += 1 / 60, 0);
    expect(r.camera.position.distanceTo(from)).toBeLessThan(4);
    let peak = -Infinity;
    for (let i = 0; i < 90; i++) { r.update(frame([me, a, b], 'b'), DEFAULT_SETTINGS, t += 1 / 60, 0); peak = Math.max(peak, r.camera.position.y); }
    expect(peak).toBeGreaterThan(from.y + 5);
    expect(r.camera.position.x).toBeGreaterThan(40);
  });

  it('flies over a hill between two targets instead of through it', () => {
    // A 30 m tall block between the two watched capybaras stands in for a hill or a roof.
    const blockY = ground(0, 0);
    const blocked = world([box('hill', [-6, blockY - 2, -40], [6, blockY + 30, 40])]);
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, .07, 850); camera.rotation.order = 'YXZ';
    const r = new CameraRig(camera, blocked, DEFAULT_SETTINGS, { get: () => undefined } as never);
    const me = actor('me', 0, 0, { alive: false }), a = actor('a', -30, 0, { yaw: -Math.PI / 2 }), b = actor('b', 30, 0, { yaw: Math.PI / 2 });
    let t = 0;
    for (let i = 0; i < 60; i++) r.update(frame([me, a, b], 'a'), DEFAULT_SETTINGS, t += 1 / 60, 0);
    for (let i = 0; i < 90; i++) {
      r.update(frame([me, a, b], 'b'), DEFAULT_SETTINGS, t += 1 / 60, 0);
      const p = r.camera.position;
      expect(p.x > -6.3 && p.x < 6.3 && p.y < blockY + 30.3).toBe(false);
    }
  });

  it('cuts to a new target with reduced motion', () => {
    const settings = { ...DEFAULT_SETTINGS, reducedMotion: true }, r = rig(settings);
    const me = actor('me', 0, 0, { alive: false }), a = actor('a', -40, 0), b = actor('b', 40, 0);
    r.update(frame([me, a, b], 'a'), settings, 0, 0);
    r.update(frame([me, a, b], 'b'), settings, 1 / 60, 0);
    expect(r.camera.position.x).toBeGreaterThan(40);
  });

  it('cuts back into the eyes on a respawn instead of swooping from the death cam', () => {
    const r = rig(), me = actor('me', 0, 0), killer = actor('killer', 0, -20);
    let t = 0;
    r.update(frame([me, killer], null), DEFAULT_SETTINGS, t, 0);
    r.startDeathCam({ victimEye: { x: 0, y: ground(0, 0) + 1.62, z: 0 }, killerId: 'killer', killerPos: killer.pos, duration: 1.8 });
    const dead = { ...me, alive: false };
    for (let i = 0; i < 150; i++) r.update(frame([dead, killer], null), DEFAULT_SETTINGS, t += 1 / 60, 0);
    // The shot keeps tracking the eliminator after its beat.
    const forward = r.camera.getWorldDirection(new THREE.Vector3());
    expect(forward.z).toBeLessThan(-.8);
    const spawn = actor('me', 60, 60);
    r.update(frame([spawn, killer], null), DEFAULT_SETTINGS, t += 1 / 60, 0);
    expect(r.camera.position.distanceTo(new THREE.Vector3(60, ground(60, 60) + 1.62, 60))).toBeLessThan(.05);
  });

  it('orbits the champion on the results screen', () => {
    const r = rig(), me = actor('me', 0, 0, { alive: false }), champ = actor('champ', 10, 10);
    const results = [{ id: 'champ', winner: true }, { id: 'me', winner: false }];
    let t = 0;
    for (let i = 0; i < 200; i++) r.update(frame([me, champ], null, undefined, 'results', results), DEFAULT_SETTINGS, t += 1 / 60, 0);
    const look = new THREE.Vector3(10, ground(10, 10) + .95, 10).sub(r.camera.position).normalize();
    expect(r.camera.getWorldDirection(new THREE.Vector3()).dot(look)).toBeGreaterThan(.99);
    expect(r.camera.position.distanceTo(new THREE.Vector3(10, ground(10, 10), 10))).toBeGreaterThan(3);
    expect(r.lastActor).toBeUndefined();
  });
});
