import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { preloadAircraftAsset, makePlane, disposeAircraftAssets } from '../src/render/aircraft';
import { loadAircraftFixture } from './helpers/aircraft-fixture';
import { AvatarView } from '../src/render/avatars';
import { disposeCapybaraAssets, preloadCapybaraAsset } from '../src/render/capybara';
import { WORLD_GRIPS } from '../src/render/world-grips';
import { emptyInput } from '../src/shared/math';
import { wristAngles } from '../src/render/fp-arms';
import { WEAPONS } from '../src/shared/weapons';
import type { ActorState, RenderFrame, WeaponId, WorldSnapshot } from '../src/shared/types';
import { realGeometryAsset } from './helpers/real-viewmodel';
// @ts-expect-error The real-skin adapter is shared with browser evidence.
import { installThirdPersonGripProbe } from '../tools/qa/tp-grip-adapter.mjs';
// @ts-expect-error The signed skin probe also runs inside page.evaluate.
import { measureGrip } from '../tools/qa/grip-measure.mjs';
// @ts-expect-error Identifies triangles of the real shipped trigger, not a proxy.
import { worldTriggerIndices } from '../tools/qa/world-trigger.mjs';
// @ts-expect-error Shared physical contact regions for browser and Node audits.
import { holdingMetrics } from '../tools/qa/holding-metrics.mjs';

const STATES = ['idle', 'aimed', 'walk', 'strafe', 'sprint', 'crouch', 'jump', 'land', 'fire'] as const;
type State = typeof STATES[number];
let view: AvatarView, scene: THREE.Scene;
const probeWindow: { capyReview?: unknown; __tpProbeMeshes?: { geometry: THREE.BufferGeometry }[] } = {};

beforeAll(async () => {
  const context = { measureText: () => ({ width: 160 }), scale() {}, strokeText() {}, fillText() {}, beginPath() {}, arc() {}, fill() {} };
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
  vi.stubGlobal('window', probeWindow);
  await preloadCapybaraAsset(() => realGeometryAsset('models/capybara/capybara.glb'));
  await preloadAircraftAsset(loadAircraftFixture, makePlane());
  scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.6, -3); camera.lookAt(0, 1.3, 0);
  view = new AvatarView(scene, camera); view.resize(1470, 956);
});
afterAll(() => {
  for (const mesh of probeWindow.__tpProbeMeshes ?? []) mesh.geometry.dispose();
  view?.dispose(); disposeCapybaraAssets(); disposeAircraftAssets(); vi.unstubAllGlobals();
});

function fixture(weapon: WeaponId, state: State) {
  // Each state starts from its own mixer, stance springs, recoil and hand caches.
  view.prepare([]);
  const actor = {
    id: 'holding-target', name: 'Capivara', color: '#1fb5a8', pos: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
    alive: true, hp: 100, armor: 0, helmet: 0, kills: 0, stage: 'ground', grounded: true, crouch: false, yaw: 0, pitch: 0, lean: 0,
    weapons: [{ id: weapon, ammo: WEAPONS[weapon].magazine, reserve: 60, rarity: 0, box: 0 }], slot: 0,
    sprint: false, ads: false, reloadUntil: 0, shotSeq: 0,
  } as ActorState;
  const snapshot = { matchId: 'holding', phase: 'playing', actors: [actor], results: [], time: 1 } as unknown as WorldSnapshot;
  const frame: RenderFrame = { snapshot, playerId: 'observer', playing: true, spectateId: null, input: emptyInput(), dt: 1 / 60 };
  const step = (seconds: number) => {
    for (let remaining = seconds; remaining > 1e-8;) {
      frame.dt = Math.min(1 / 60, remaining); remaining -= frame.dt; snapshot.time += frame.dt;
      view.update(frame, 0, snapshot.time);
    }
  };
  step(1.5);
  if (state === 'land') {
    actor.grounded = false; actor.velocity.y = -5; step(.3);
    actor.grounded = true; actor.velocity.y = 0;
  }
  actor.ads = state === 'aimed'; actor.sprint = state === 'sprint'; actor.crouch = state === 'crouch';
  actor.grounded = state !== 'jump';
  actor.velocity = { x: state === 'strafe' ? -3.9 : 0, y: state === 'jump' ? 4 : 0,
    z: state === 'walk' ? -3.9 : state === 'sprint' ? -6.4 : 0 };
  if (state === 'fire') actor.shotSeq!++;
  // Sampling at .6 s would miss the entire .24 s landing pulse.
  step(state === 'fire' ? .08 : state === 'land' ? .1 : .6);
  scene.updateMatrixWorld(true);
  const avatar = view.get(actor.id)!;
  probeWindow.capyReview = { avatar, renderer: { scene } };
  return avatar;
}

function contactRange(value: number, label: string) {
  expect.soft(Number.isFinite(value), `${label} must measure actual skin`).toBe(true);
  expect.soft(value, `${label}, world mm`).toBeGreaterThanOrEqual(-.5);
  expect.soft(value, `${label}, world mm`).toBeLessThanOrEqual(1.5);
}

describe('production world skin holding', () => {
  for (const weapon of Object.keys(WEAPONS) as WeaponId[]) for (const state of STATES) {
    it(`${weapon} ${state}: clearance, closure, trigger and natural wrists`, async () => {
      const avatar = fixture(weapon, state), handgun = weapon === 'pistol' || weapon === 'revolver';
      const leftHolding = weapon !== 'machete' && !(handgun && state === 'sprint');
      const triggerRequired = weapon !== 'machete' && state !== 'sprint';
      const triggerIndices = await worldTriggerIndices(weapon);
      if (weapon !== 'machete') expect(triggerIndices.length, 'actual world trigger triangles').toBeGreaterThan(0);
      const adapter = installThirdPersonGripProbe({ weaponId: weapon, triggerIndices });
      for (const side of ['R', 'L']) expect(adapter.vertices[side], `${side} actual skinned vertices`).toBeGreaterThan(0);
      const wrists: Record<string, ReturnType<typeof wristAngles>> = {};
      const rotation = avatar.weapon.getWorldQuaternion(new THREE.Quaternion());
      for (const side of ['R', 'L'] as const) {
        const grip = WORLD_GRIPS[weapon][side]; if (!grip) continue;
        const wrist = avatar.body.getObjectByName(`paw_${side}`)!.getWorldPosition(new THREE.Vector3());
        const target = new THREE.Vector3().fromArray(grip.wrist).applyMatrix4(avatar.weapon.matrixWorld);
        if (side === 'L' && !leftHolding) {
          if (handgun) expect.soft(wrist.distanceTo(target), 'handgun sprint releases the support paw').toBeGreaterThan(.15);
          continue;
        }
        expect.soft(wrist.distanceTo(target), `${side} fitted wrist residual`).toBeLessThan(.0001);
        wrists[side] = wristAngles(avatar.body.getObjectByName(`arm_${side}`)!.getWorldPosition(new THREE.Vector3()),
          avatar.body.getObjectByName(`forearm_${side}`)!.getWorldPosition(new THREE.Vector3()), wrist,
          new THREE.Vector3().fromArray(grip.forward).applyQuaternion(rotation), new THREE.Vector3().fromArray(grip.palm).applyQuaternion(rotation), side);
      }
      const pose = { active: weapon, weaponScale: avatar.weapon.getWorldScale(new THREE.Vector3()).x,
        visible: { R: true, L: leftHolding }, wrists,
        contacts: { R: 'body', L: leftHolding ? handgun ? 'paw' : 'body' : null, trigger: triggerRequired } };
      const row = await holdingMetrics(weapon, { action: state }, pose, measureGrip);
      for (const side of ['R', 'L'] as const) {
        const free = side === 'L' && !leftHolding ? measureGrip([weapon, side]) : null;
        const whole = free ? free.worst : row[side];
        if (free && whole === Infinity) {
          // A released paw can lie outside the probe's 30 mm surface search.
          // Full-solid containment still runs, so require no nearby face and
          // no vertex inside any rendered weapon solid before accepting it.
          expect.soft(free.trianglesNear, 'released paw has no nearby weapon surface').toBe(0);
          for (const group of Object.values(free.summary) as { inside: number }[])
            expect.soft(group.inside, 'released paw has no contained skin vertices').toBe(0);
        } else expect.soft(Number.isFinite(whole), `${side} whole-skin result`).toBe(true);
        expect.soft(whole, `${side} whole skin versus weapon, world mm`).toBeGreaterThanOrEqual(-.5);
        if (side === 'L' && !leftHolding) continue;
        const contact = row.contacts[side];
        expect(contact, `${side} required holding contact`).toBeDefined();
        expect(contact.surface).toBe(side === 'L' && handgun ? 'paw' : 'body');
        contactRange(contact.gap, `${side} holding contact`);
        contactRange(contact.palm, `${side} palm contact`);
        contactRange(contact.wrap, `${side} holding wrap contact`);
        const wrist = wrists[side];
        expect.soft(Math.abs(wrist.flexion), `${side} wrist flexion`).toBeLessThanOrEqual(45);
        expect.soft(wrist.deviation, `${side} wrist deviation`).toBeGreaterThanOrEqual(-25);
        expect.soft(wrist.deviation, `${side} wrist deviation`).toBeLessThanOrEqual(20);
        expect.soft(Math.abs(wrist.pronation), `${side} wrist roll`).toBeLessThanOrEqual(80);
      }
      if (handgun) {
        expect.soft(row.pair, 'paired paws do not penetrate, world mm').toBeGreaterThanOrEqual(-.5);
        if (leftHolding) contactRange(row.pair, 'paired handgun support');
        else {
          expect(row.contacts.L, 'no support contact during one-handed sprint').toBeUndefined();
          const separated = measureGrip([weapon, 'L', true]);
          if (separated.worst === Infinity) {
            expect.soft(separated.trianglesNear, 'released support paw is beyond the contact search').toBe(0);
            for (const group of Object.values(separated.summary) as { inside: number }[])
              expect.soft(group.inside, 'released support paw stays outside the carrying paw').toBe(0);
          } else expect.soft(Number.isFinite(separated.worst), 'released paw clearance').toBe(true);
        }
      }
      if (triggerRequired) {
        expect(row.trigger, 'actual trigger surface result').toBeDefined();
        expect.soft(Number.isFinite(row.trigger.frontDistance), 'trigger front distance').toBe(true);
        expect.soft(row.trigger.frontDistance, 'trigger front contact, world mm').toBeGreaterThanOrEqual(0);
        expect.soft(row.trigger.frontDistance, 'trigger front contact, world mm').toBeLessThanOrEqual(1.5);
        expect.soft(row.trigger.insideGuard, 'index fingertip stays inside the real trigger guard').toBe(true);
      } else expect(row.trigger).toBeUndefined();
      expect.soft(row.failures, `${weapon} ${state} shared holding audit`).toEqual([]);
    });
  }
});
