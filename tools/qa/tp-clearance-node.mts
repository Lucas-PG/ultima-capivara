import * as THREE from 'three';
import { preloadAircraftAsset, makePlane, disposeAircraftAssets } from '../../src/render/aircraft';
import { loadAircraftFixture } from '../../tests/helpers/aircraft-fixture';
import { writeFile } from 'node:fs/promises';
import { AvatarView } from '../../src/render/avatars';
import { preloadCapybaraAsset, disposeCapybaraAssets } from '../../src/render/capybara';
import { WORLD_GRIPS } from '../../src/render/world-grips';
import { wristAngles } from '../../src/render/fp-arms';
import { WEAPONS } from '../../src/shared/weapons';
import { emptyInput } from '../../src/shared/math';
import type { ActorState, RenderFrame, WeaponId, WorldSnapshot } from '../../src/shared/types';
import { realGeometryAsset } from '../../tests/helpers/real-viewmodel';
import { installThirdPersonGripProbe } from './tp-grip-adapter.mjs';
import { worldTriggerIndices } from './world-trigger.mjs';
import { measureGrip } from './grip-measure.mjs';
import { holdingMetrics } from './holding-metrics.mjs';

const context = { measureText: () => ({ width: 160 }), scale() {}, strokeText() {}, fillText() {}, beginPath() {}, arc() {}, fill() {} };
Object.assign(globalThis, { window: globalThis, document: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } });
await preloadCapybaraAsset(() => realGeometryAsset('models/capybara/capybara.glb'));
await preloadAircraftAsset(loadAircraftFixture, makePlane());
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
camera.position.set(0, 1.6, -3); camera.lookAt(0, 1.3, 0);
const view = new AvatarView(scene, camera); view.resize(1470, 956);
const output: Record<string, unknown[]> = {};
try {
  for (const weapon of (process.argv[3]?.split(',') ?? Object.keys(WEAPONS)) as WeaponId[]) {
    const triggerIndices = await worldTriggerIndices(weapon), rows: unknown[] = [];
    output[weapon] = rows;
    for (const state of ['idle', 'aimed', 'walk', 'strafe', 'sprint', 'crouch', 'jump', 'land', 'fire']) {
      view.prepare([]);
      const actor = { id: 'qa', name: 'Capivara', color: '#1fb5a8', pos: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
        alive: true, hp: 100, armor: 0, helmet: 0, kills: 0, stage: 'ground', grounded: true, crouch: false, yaw: 0, pitch: 0, lean: 0,
        weapons: [{ id: weapon, ammo: WEAPONS[weapon].magazine, reserve: 60, rarity: 0, box: 0 }], slot: 0, sprint: false, ads: false, reloadUntil: 0, shotSeq: 0 } as ActorState;
      const snapshot = { matchId: 'holding', phase: 'playing', actors: [actor], results: [], time: 1 } as unknown as WorldSnapshot;
      const frame: RenderFrame = { snapshot, playerId: 'observer', playing: true, spectateId: null, input: emptyInput(), dt: 1 / 60 };
      const step = (seconds: number) => { for (let t = 0; t < seconds - 1e-9; t += frame.dt) { frame.dt = Math.min(1 / 60, seconds - t); snapshot.time += frame.dt; view.update(frame, 0, snapshot.time); } };
      step(1.5);
      if (state === 'land') {
        actor.grounded = false; actor.velocity.y = -5; step(.3);
        actor.grounded = true; actor.velocity.y = 0;
      }
      actor.ads = state === 'aimed'; actor.sprint = state === 'sprint'; actor.crouch = state === 'crouch'; actor.grounded = state !== 'jump';
      actor.velocity = { x: state === 'strafe' ? -3.9 : 0, y: state === 'jump' ? 4 : 0, z: state === 'walk' ? -3.9 : state === 'sprint' ? -6.4 : 0 };
      if (state === 'fire') actor.shotSeq!++;
      // Keep the sample inside the actual .24 s landing pulse.
      step(state === 'fire' ? .08 : state === 'land' ? .1 : .6); scene.updateMatrixWorld(true);
      const avatar = view.get(actor.id)!;
      Object.assign(globalThis, { capyReview: { avatar, renderer: { scene } } });
      installThirdPersonGripProbe({ weaponId: weapon, triggerIndices });
      const wrists: Record<string, unknown> = {};
      for (const side of ['R', 'L'] as const) {
        const grip = WORLD_GRIPS[weapon][side]; if (!grip) continue;
        const rotation = avatar.weapon.getWorldQuaternion(new THREE.Quaternion());
        wrists[side] = wristAngles(avatar.body.getObjectByName(`arm_${side}`)!.getWorldPosition(new THREE.Vector3()),
          avatar.body.getObjectByName(`forearm_${side}`)!.getWorldPosition(new THREE.Vector3()), avatar.body.getObjectByName(`paw_${side}`)!.getWorldPosition(new THREE.Vector3()),
          new THREE.Vector3().fromArray(grip.forward).applyQuaternion(rotation), new THREE.Vector3().fromArray(grip.palm).applyQuaternion(rotation), side);
      }
      const handgun = weapon === 'pistol' || weapon === 'revolver';
      const left = weapon !== 'machete' && !(handgun && state === 'sprint');
      const pose = { active: weapon, weaponScale: 1.3, visible: { R: true, L: left }, wrists,
        contacts: { R: 'body', L: left ? handgun ? 'paw' : 'body' : null, trigger: weapon !== 'machete' && state !== 'sprint' } };
      const row = await holdingMetrics(weapon, { action: state }, pose, measureGrip);
      rows.push(row);
      console.log(weapon, state, JSON.stringify({ R: row.R, L: row.L, contacts: row.contacts, trigger: row.trigger, failures: row.failures }));
    }
    await writeFile(process.argv[2], JSON.stringify(output, null, 2) + '\n');
  }
} finally { view.dispose(); disposeCapybaraAssets(); disposeAircraftAssets(); }
