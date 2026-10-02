import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WeaponId } from '../../src/shared/types';
import { WRIST_LIMITS } from '../../src/render/viewmodel-targets';
import { holdingFixture } from '../../tools/qa/fp-state-node';
// @ts-expect-error The same numerical audit runs against browser and Node geometry.
import { holdingMetrics } from '../../tools/qa/holding-metrics.mjs';
// @ts-expect-error The probe reads actual posed skin vertices and weapon triangles.
import { measureGrip } from '../../tools/qa/grip-measure.mjs';
// @ts-expect-error Reuse the capture audit's authored state times.
import { HOLDING_WEAPONS, holdingStates } from '../../tools/qa/holding-states.mjs';

type State = { action: string; t: number };
type Pose = ReturnType<Awaited<ReturnType<typeof holdingFixture>>['pose']>;
type Contact = { surface: string; gap: number; palm: number; wrap: number };
type Metrics = {
  R: number; L?: number; Rat?: string; Lat?: string; pair?: number; inactive?: string; failures: string[];
  contacts: Partial<Record<'R' | 'L', Contact>>;
  trigger?: { frontDistance: number; insideGuard: boolean };
};

// Sample both ends of locomotion and the aim/landing transitions. The denser
// evidence sweep uses the same states; this matrix stays small enough for CI.
const readySamples: readonly (readonly [string, number])[] = [
  ['hip', 0], ['aimed', 0], ['ads', .1], ['unaim', .1],
  ['walk', .2], ['walk', .5], ['strafe', .2], ['strafe', .5],
  ['crouch', .15], ['jump', .2], ['jump', .5], ['land', .05], ['land', .2],
];
const ids = HOLDING_WEAPONS as WeaponId[];
const supportSurface = (id: WeaponId) => id === 'machete' ? null :
  id === 'pistol' || id === 'revolver' ? 'paw' : id === 'shotgun' || id === 'coco' ? 'pump' : 'body';

function statesFor(id: WeaponId): State[] {
  const available = new Map<string, State>(holdingStates(id).map((state: State) => [`${state.action}:${state.t}`, state]));
  // At 50 ms the sniper is already releasing its firing paw for the bolt. The
  // shot itself checks the pulled trigger before that separate manipulation.
  const samples = [...readySamples, ['sprint', .1], ['sprint', .6], ...(id === 'machete' ? [] : [['fire', 0]])];
  return samples.map(([action, t]) => {
    const state = available.get(`${action}:${t}`);
    if (!state) throw new Error(`Missing holding audit sample: ${id} ${action} ${t}`);
    return state;
  });
}

function assertContact(contact: Contact | undefined, surface: string, label: string) {
  expect(contact, `${label} has an active contact`).toBeDefined();
  expect(contact!.surface, `${label} uses its actual holding surface`).toBe(surface);
  for (const region of ['gap', 'palm', 'wrap'] as const) {
    expect(Number.isFinite(contact![region]), `${label} ${region} has measured skin`).toBe(true);
    expect(contact![region], `${label} ${region} penetration in mm`).toBeGreaterThanOrEqual(-.5);
    expect(contact![region], `${label} ${region} separation in mm`).toBeLessThanOrEqual(1.5);
  }
}

function assertReadyHold(id: WeaponId, state: State, pose: Pose, row: Metrics) {
  const label = `${id} ${state.action} ${state.t}`;
  expect(pose.active, `${label} measures the requested weapon`).toBe(id);
  expect(row.inactive, `${label} is not an ignored transition`).toBeUndefined();
  expect(pose.visible.R, `${label} firing paw is present`).toBe(true);
  expect(row.failures, `${label}: ${row.failures?.join('; ')}; R at ${row.Rat}, L at ${row.Lat}`).toEqual([]);
  expect(row.R, `${label} firing skin penetration in mm`).toBeGreaterThanOrEqual(-.5);
  assertContact(row.contacts.R, 'body', `${label} R`);

  const oneHandedSprint = state.action === 'sprint' && (id === 'pistol' || id === 'revolver');
  const support = oneHandedSprint ? null : supportSurface(id);
  if (support) {
    expect(pose.visible.L, `${label} support paw is present`).toBe(true);
    expect(row.L, `${label} support skin penetration in mm`).toBeGreaterThanOrEqual(-.5);
    assertContact(row.contacts.L, support, `${label} L`);
  } else expect(row.contacts.L, `${label} free paw has no invented contact`).toBeUndefined();
  if (id === 'pistol' || id === 'revolver') expect(row.pair, `${label} paw overlap in mm`).toBeGreaterThanOrEqual(-.5);

  const triggerReady = id !== 'machete' && state.action !== 'sprint';
  expect(pose.contacts.trigger, `${label} readiness matches the action`).toBe(triggerReady);
  if (triggerReady) {
    expect(row.trigger, `${label} measures actual trigger skin`).toBeDefined();
    expect(row.trigger!.insideGuard, `${label} distal index occupies the guard opening`).toBe(true);
    expect(Number.isFinite(row.trigger!.frontDistance), `${label} front face distance is finite`).toBe(true);
    expect(row.trigger!.frontDistance, `${label} unsigned trigger distance in mm`).toBeGreaterThanOrEqual(0);
    expect(row.trigger!.frontDistance, `${label} trigger front contact in mm`).toBeLessThanOrEqual(1.5);
  } else expect(row.trigger, `${label} does not claim trigger contact`).toBeUndefined();

  for (const side of ['R', 'L'] as const) {
    if (!pose.visible[side]) continue;
    const wrist = pose.wrists[side];
    expect(wrist, `${label} ${side} wrist comes from the posed arm`).not.toBeNull();
    for (const axis of ['flexion', 'deviation', 'pronation'] as const) {
      expect(Number.isFinite(wrist![axis]), `${label} ${side} ${axis} is finite`).toBe(true);
      // The shared audit permits 0.01 degree for numerical rotation error.
      expect(wrist![axis], `${label} ${side} ${axis}`).toBeGreaterThanOrEqual(WRIST_LIMITS[axis][0] - .01);
      expect(wrist![axis], `${label} ${side} ${axis}`).toBeLessThanOrEqual(WRIST_LIMITS[axis][1] + .01);
    }
  }
}

// The matrix is split across holding-ready-1..3.test.ts so CI can run the
// parts in parallel. Every weapon falls in exactly one part by its index.
export const READY_PARTS = 3;

export function describeReadyHolds(part: number) {
  describe('shipped holding skin through ready and movement states', () => {
    let fixture: Awaited<ReturnType<typeof holdingFixture>>;
    beforeAll(async () => { fixture = await holdingFixture(); }, 120_000);
    afterAll(() => fixture?.dispose());

    for (const id of ids.filter((_, i) => i % READY_PARTS === part)) describe(id, () => {
      for (const state of statesFor(id)) it(`${state.action} at ${state.t}s preserves contact and natural wrists`, async () => {
        const pose = fixture.pose(id, state.action, state.t);
        const row = await holdingMetrics(id, state, pose, measureGrip) as Metrics;
        assertReadyHold(id, state, pose, row);
      }, 30_000);
    });

    if (part === 0) it('rejects a displaced real paw while its contact metadata remains unchanged', async () => {
      const state = { action: 'hip', t: 0 }, pose = fixture.pose('smg', state.action, state.t);
      const attached = await holdingMetrics('smg', state, pose, measureGrip) as Metrics;
      expect(attached.failures).toEqual([]);
      const rig = fixture.view as unknown as { arms: { meshes: THREE.SkinnedMesh[] }; holder: THREE.Group };
      const mesh = rig.arms.meshes.find(arm => arm.name.endsWith('R'))!;
      const hand = mesh.skeleton.bones.find(bone => bone.name === 'hand_R')!;
      expect(hand, 'negative control moves the actual firing-paw bone').toBeDefined();
      const original = hand.position.clone();
      const world = hand.getWorldPosition(new THREE.Vector3());
      const away = new THREE.Vector3(.025, 0, 0).applyQuaternion(rig.holder.getWorldQuaternion(new THREE.Quaternion()));
      hand.position.copy(hand.parent!.worldToLocal(world.add(away)));
      hand.updateMatrixWorld(true);
      try {
        const displaced = await holdingMetrics('smg', state, pose, measureGrip) as Metrics;
        expect(pose.contacts.R).toBe('body');
        expect(pose.contacts.trigger).toBe(true);
        expect(displaced.failures.length, 'real skin movement is rejected without a metadata change').toBeGreaterThan(0);
        expect(displaced.failures.some(failure => failure.startsWith('R body') || failure.startsWith('trigger'))).toBe(true);
        expect(displaced.trigger!.insideGuard).toBe(false);
        expect(displaced.contacts.R!.palm, 'the moved palm leaves the grip').toBeGreaterThan(1.5);
      } finally {
        hand.position.copy(original);
        hand.updateMatrixWorld(true);
      }
    }, 30_000);
  });
}
