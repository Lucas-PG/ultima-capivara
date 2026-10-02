import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { moveActor, raycastWorld, clearSpawn, hasLineOfSight } from '../src/shared/collision';
import { colliderGrid } from '../src/shared/collider-grid';
import { colliderSpan, containsCollider, intersectsCollider, sweepCollider } from '../src/shared/collider-shape';
import { KIT_PIECES, kitColliders } from '../src/shared/kit-collision';
import { emptyInput } from '../src/shared/math';
import { walkableSegment } from '../src/shared/navigation';
import { createWorld } from '../src/shared/world';
import { CameraRig } from '../src/render/camera';
import { FollowCamera } from '../src/render/follow-camera';
import { DEFAULT_SETTINGS } from '../src/settings';
import { Simulation } from '../src/simulation';
import type { ActorState, KitPlacement, RenderFrame, WorldSpec } from '../src/shared/types';
import type { AvatarView } from '../src/render/avatars';

const ROCKS = ['cliff_rock', 'cliff_rock_low', 'cliff_rock_tall', 'cliff_ledge'];
const FLOOR = 40;
function scene(piece: string, yaw = 0, scale = 1) {
  const placement: KitPlacement = { id: 'stone', piece, x: 0, y: FLOOR, z: 0, yaw, scale };
  const stones = kitColliders(placement);
  const world: WorldSpec = { version: 'rock-test', size: 260, objects: [], districts: [], loot: [], chests: [], pieces: [placement],
    spawns: [{ x: 15, y: FLOOR, z: 15, mode: 'both', yaw: 0 }], colliders: [
      { id: 'floor', min: { x: -30, y: -10, z: -30 }, max: { x: 30, y: FLOOR, z: 30 }, material: 'stone' }, ...stones,
    ] };
  const sim = new Simulation(world, { mode: 'deathmatch', capacity: 2, bots: false, difficulty: 'normal', duration: 300 },
    [{ id: 'me', name: 'Eu', color: '#fff', ready: true, connected: true }], 'rocks', 1);
  const actor = sim.snapshot().actors[0];
  Object.assign(actor, { stage: 'ground', grounded: true, alive: true, pos: { x: 15, y: FLOOR, z: 15 }, velocity: { x: 0, y: 0, z: 0 } });
  return { world, stones, actor };
}
const hitsBody = (actor: ActorState, stones: WorldSpec['colliders']) =>
  stones.find(c => intersectsCollider(c, actor.pos, actor.crouch ? 1.3 : 1.8, .32, .02));

describe('complete coastal stone collision', () => {
  it('gives all placed rock types complete hulls without adding hulls to hollow architecture', () => {
    const world = createWorld();
    for (const rock of world.pieces!.filter(p => p.piece.startsWith('cliff_'))) {
      const shapes = world.colliders.filter(c => c.pieceId === rock.id);
      expect(shapes, rock.id).toHaveLength(KIT_PIECES[rock.piece].collisionHulls!.length);
      expect(shapes.every(c => c.hull && c.hull.length > 6), rock.id).toBe(true);
    }
    expect(world.colliders.filter(c => c.hull).every(c => c.pieceId?.includes('cliff_'))).toBe(true);
  }, 30000);

  it.each(ROCKS)('blocks human and bot walking into %s from every side, including rotated/scaled instances', piece => {
    for (const bot of [false, true]) for (let side = 0; side < 8; side++) {
      const scale = [1, .6, 1.7][side % 3], { actor, world, stones } = scene(piece, .37 + side * .19, scale);
      const angle = side * Math.PI / 4;
      const reach = Math.max(...KIT_PIECES[piece].footprint) * scale / 2 + 2;
      actor.bot = bot; actor.pos = { x: Math.sin(angle) * reach, y: FLOOR, z: Math.cos(angle) * reach };
      let moved = 0;
      for (let tick = 0; tick < 240; tick++) {
        actor.yaw = Math.atan2(actor.pos.x, actor.pos.z);
        const previous = { ...actor.pos };
        moveActor(actor, { ...emptyInput(), moveZ: 1, yaw: actor.yaw, sprint: side % 2 === 0 }, world, 1 / 60);
        moved += Math.hypot(actor.pos.x - previous.x, actor.pos.z - previous.z);
        expect(hitsBody(actor, stones), `${piece}, bot=${bot}, side=${side}, tick=${tick}, pos=${JSON.stringify(actor.pos)}`).toBeUndefined();
      }
      expect(moved).toBeGreaterThan(.5);
    }
  });

  it.each(ROCKS)('uses %s faces for world rays, bot sight, safe spawns and navigation', piece => {
    const { world, stones } = scene(piece, .43, 1.3);
    const c = stones[0], x = (c.min.x + c.max.x) / 2, z = (c.min.z + c.max.z) / 2;
    const span = colliderSpan(c, x, z)!;
    const point = { x, y: (span[0] + span[1]) / 2, z };
    expect(containsCollider(c, point)).toBe(true);
    expect(clearSpawn(point, world)).toBe(false);
    const start = { ...point, x: point.x - 20 }, end = { ...point, x: point.x + 20 };
    const expected = Math.min(...stones.map(solid => sweepCollider(solid, start, { x: 1, y: 0, z: 0 }, 40)));
    expect(raycastWorld(start, { x: 1, y: 0, z: 0 }, 40, world)!.distance).toBeCloseTo(expected, 6);
    expect(colliderGrid(world).ray(start, { x: 1, y: 0, z: 0 }, 40)).toBeCloseTo(expected, 6);
    expect(hasLineOfSight(start, end, world)).toBe(false);
    expect(walkableSegment(world, { x: -12, z }, { x: 12, z })).toBe(false);
    let corners = 0;
    for (const x of [c.min.x + .02, c.max.x - .02]) for (const z of [c.min.z + .02, c.max.z - .02]) {
      if (colliderSpan(c, x, z)) continue;
      expect(sweepCollider(c, { x, y: c.max.y + 2, z }, { x: 0, y: -1, z: 0 }, 20)).toBe(Infinity);
      corners++;
    }
    expect(corners).toBeGreaterThan(0);
  });

  it.each(ROCKS)('keeps the follow and drop camera lens outside %s', piece => {
    const { actor, world, stones } = scene(piece, .63, 1.2);
    const follow = new FollowCamera();
    const camera = new THREE.PerspectiveCamera(), rig = new CameraRig(camera, world, DEFAULT_SETTINGS, { get: () => undefined } as unknown as AvatarView);
    for (let side = 0; side < 24; side++) {
      const angle = side * Math.PI / 12;
      actor.pos = { x: Math.sin(angle) * 8, y: FLOOR, z: Math.cos(angle) * 8 }; actor.yaw = angle + Math.PI;
      follow.reset(); follow.update(world, actor, 1 / 60);
      expect(stones.some(c => containsCollider(c, follow.position, .15))).toBe(false);
      actor.stage = 'parachute'; actor.pos.y = FLOOR + 2;
      const frame = { dt: 1 / 60, input: { ...emptyInput(), yaw: actor.yaw }, playerId: actor.id,
        snapshot: { phase: 'playing', actors: [actor], time: 10 }, playing: true, spectateId: null } as unknown as RenderFrame;
      rig.update(frame, DEFAULT_SETTINGS, side / 60, 0);
      expect(stones.some(c => containsCollider(c, camera.position, .15)), `${piece}, side ${side}, ${JSON.stringify(camera.position)}`).toBe(false);
    }
  });
});
