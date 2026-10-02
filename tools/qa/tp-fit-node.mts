// Fit the shipped world-character skin against the unchanged world arsenal.
// Bundle with esbuild and import.meta.env.DEV=false; jobs and outputs stay private.
import * as THREE from 'three';
import { preloadAircraftAsset, makePlane, disposeAircraftAssets } from '../../src/render/aircraft';
import { loadAircraftFixture } from '../../tests/helpers/aircraft-fixture';
import { readFile, writeFile } from 'node:fs/promises';
import { AvatarView } from '../../src/render/avatars';
import { preloadCapybaraAsset, disposeCapybaraAssets } from '../../src/render/capybara';
import { WORLD_GRIPS } from '../../src/render/world-grips';
import { isShortGun, shortReload } from '../../src/render/short-world-parts';
import { worldReload } from '../../src/render/world-reload';
import { newSample, sampleChoreo, type HandKey } from '../../src/render/viewmodel-choreo';
import { wristAngles } from '../../src/render/fp-arms';
import { WEAPONS } from '../../src/shared/weapons';
import { emptyInput } from '../../src/shared/math';
import type { ActorState, RenderFrame, WeaponId, WorldSnapshot } from '../../src/shared/types';
import { realGeometryAsset } from '../../tests/helpers/real-viewmodel';
import { installThirdPersonGripProbe } from './tp-grip-adapter.mjs';
import { worldTriggerIndices } from './world-trigger.mjs';
import { worldContactIndices } from './world-contact.mjs';
import { fitGrip } from './grip-fit-core.mjs';
import { installGripSearch } from './grip-search.mjs';
import { measureGrip } from './grip-measure.mjs';
import { triggerInGuard, TRIGGER_FACE } from './trigger-guard.mjs';

const context = { measureText: () => ({ width: 160 }), scale() {}, strokeText() {}, fillText() {}, beginPath() {}, arc() {}, fill() {} };
Object.assign(globalThis, { window: globalThis, document: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) }, __vmWristAngles: wristAngles });
installGripSearch();
await preloadCapybaraAsset(() => realGeometryAsset('models/capybara/capybara.glb'));
await preloadAircraftAsset(loadAircraftFixture, makePlane());
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
camera.position.set(0, 1.6, -3); camera.lookAt(0, 1.3, 0);
const avatars = new AvatarView(scene, camera); avatars.resize(1470, 956);
const jobs = JSON.parse(await readFile(process.argv[2], 'utf8'));
try {
  for (const job of jobs) {
    const weapon = job.weapon as WeaponId, original = WORLD_GRIPS[weapon];
    const grips = structuredClone(original);
    for (const [side, path] of Object.entries(job.tuneFrom ?? {})) grips[side as 'R' | 'L'] = JSON.parse(await readFile(path as string, 'utf8')).final.grip;
    WORLD_GRIPS[weapon] = grips;
    const phase = job.reloadPhase as number | undefined, empty = job.empty !== false;
    const keys = phase === undefined ? null : worldReload(weapon, empty);
    if (phase !== undefined && (phase < 0 || phase >= 1)) throw new Error('Reload fitting needs phase in [0, 1)');
    const baseline = keys ? structuredClone(sampleChoreo(keys, phase!, newSample())[job.intent.side as 'R' | 'L']) : null;
    const originalKeys = keys?.map(key => ({ key, hand: key[job.intent.side as 'R' | 'L'] }));
    // This process alone replaces the support channel. All moving parts and
    // gun/body choreography remain at the actual requested reload phase.
    for (const entry of originalKeys ?? []) entry.key[job.intent.side as 'R' | 'L'] = { space: 'grip' };
    avatars.prepare([]);
    const actor = { id: 'fit', name: 'Capivara', color: '#1fb5a8', pos: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
      alive: true, hp: 100, armor: 0, helmet: 0, kills: 0, stage: 'ground', grounded: true, crouch: false, yaw: 0, pitch: 0, lean: 0,
      weapons: [{ id: weapon, ammo: phase !== undefined && empty ? 0 : WEAPONS[weapon].magazine, reserve: 60, rarity: 0, box: 0 }], slot: 0,
      sprint: false, ads: job.action !== 'idle', reloadUntil: 0, shotSeq: 0 } as ActorState;
    const snapshot = { matchId: 'fit', phase: 'playing', actors: [actor], results: [], time: 1 } as unknown as WorldSnapshot;
    const frame: RenderFrame = { snapshot, playerId: 'observer', playing: true, spectateId: null, input: emptyInput(), dt: 1 / 60 };
    for (let i = 0; i < 90; i++) {
      snapshot.time += frame.dt;
      if (phase !== undefined) actor.reloadUntil = snapshot.time + WEAPONS[weapon].reload * (1 - phase);
      avatars.update(frame, 0, snapshot.time);
    }
    frame.dt = 0;
    const avatar = avatars.get(actor.id)!;
    Object.assign(globalThis, { capyReview: { avatar, renderer: { scene } } });
    const indices = await worldTriggerIndices(weapon);
    const contactName = job.bakedPart === 'body' ? 'bodyContact' : job.bakedPart;
    const contactIndices = job.bakedPart ? { [contactName]: await worldContactIndices(weapon, job.bakedPart) } : undefined;
    installThirdPersonGripProbe({ weaponId: weapon, triggerIndices: indices, contactIndices });
    const vm = (globalThis as any).__vmProbe, model = vm.models[weapon];
    const source = avatar.body.getObjectByName('Capybara_LOD0') as THREE.SkinnedMesh;
    const arm = (side: 'R' | 'L') => ({ upper: { bone: avatar.body.getObjectByName(`arm_${side}`) },
      fore: { bone: avatar.body.getObjectByName(`forearm_${side}`) }, hand: { bone: avatar.body.getObjectByName(`paw_${side}`) } });
    vm.arms.group = avatar.body; vm.arms.left = arm('L'); vm.arms.right = arm('R');
    vm.targetR = { forward: new THREE.Vector3(), palm: new THREE.Vector3() }; vm.targetL = { forward: new THREE.Vector3(), palm: new THREE.Vector3() };
    model.grips = grips;
    // The extra named trigger contains only triangles already in the body. It
    // supplies a contact target; it does not change or render the weapon mesh.
    const trigger = model.parts.trigger;
    model.parts.body = avatar.weapon;
    model.group = { traverse(callback: (o: unknown) => void) { avatar.weapon.traverse(callback); if (trigger) callback(trigger); if (job.bakedPart) callback(model.parts[contactName]); },
      getObjectByName: avatar.weapon.getObjectByName.bind(avatar.weapon) };
    vm.solveArms = (_model: unknown, next: typeof grips) => {
      WORLD_GRIPS[weapon] = next;
      avatars.update(frame, 0, snapshot.time); scene.updateMatrixWorld(true);
      const rotation = avatar.weapon.getWorldQuaternion(new THREE.Quaternion());
      for (const side of ['R', 'L'] as const) if (next[side]) {
        vm[`target${side}`].forward.fromArray(next[side]!.forward).applyQuaternion(rotation);
        vm[`target${side}`].palm.fromArray(next[side]!.palm).applyQuaternion(rotation);
      }
      source.skeleton.update();
    };
    vm.solveArms(model, grips);
    if (job.intent.part) {
      const part = model.parts[job.intent.part];
      if (!part) throw new Error(`Missing moving part ${weapon}/${job.intent.part}`);
      for (let parent = part; parent; parent = parent.parent) if (!parent.visible) throw new Error(`Part ${weapon}/${job.intent.part} is hidden at phase ${phase}`);
    }
    measureGrip([weapon, job.intent.side]);
    const baselineKey = baseline?.a as HandKey | undefined;
    let start = job.startFrom ? JSON.parse(await readFile(job.startFrom, 'utf8')).final.grip : job.start ?? ((baselineKey?.space === 'part' || baselineKey?.space === 'gun') ? {
      ...grips[job.intent.side as 'R' | 'L'], ...baselineKey, curl: { ...grips[job.intent.side as 'R' | 'L']!.curl, ...baselineKey.curl }, pole: baselineKey.pole ?? grips[job.intent.side as 'R' | 'L']!.pole,
    } : grips[job.intent.side as 'R' | 'L']);
    if (job.seedNeutral && job.intent.part) {
      // An optional search seed straightens the actual arm while preserving the
      // posed palm centre. It changes no runtime pose or measured surface.
      const part = model.parts[job.intent.part], partFrame = part.matrixWorld.clone();
      if (job.intent.followRotation === false) partFrame.copy(avatar.weapon.matrixWorld).setPosition(part.getWorldPosition(new THREE.Vector3()));
      const localToGun = avatar.weapon.matrixWorld.clone().invert().multiply(partFrame);
      const toPart = partFrame.clone().invert(), rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(localToGun));
      const candidate = { ...start, part: undefined,
        wrist: new THREE.Vector3(...start.wrist).applyMatrix4(localToGun).toArray(),
        forward: new THREE.Vector3(...start.forward).applyQuaternion(rotation).toArray(),
        palm: new THREE.Vector3(...start.palm).applyQuaternion(rotation).toArray(),
        indexed: { index: start.curl.index, indexSpread: start.curl.indexSpread ?? 0, indexRoll: start.curl.indexRoll ?? 0 } };
      vm.solveArms(model, { ...grips, [job.intent.side]: candidate });
      const chain = arm(job.intent.side), shoulder = chain.upper.bone!.getWorldPosition(new THREE.Vector3()),
        elbow = chain.fore.bone!.getWorldPosition(new THREE.Vector3()), wrist = chain.hand.bone!.getWorldPosition(new THREE.Vector3());
      const forward = wrist.clone().sub(elbow).normalize(), upper = elbow.clone().sub(shoulder).normalize();
      const anterior = forward.clone().addScaledVector(upper, -forward.dot(upper)).normalize();
      const palm = new THREE.Vector3().crossVectors(anterior, upper).multiplyScalar(job.intent.side === 'R' ? 1 : -1).normalize();
      const posedPart = part.matrixWorld.clone();
      if (job.intent.followRotation === false) posedPart.copy(avatar.weapon.matrixWorld).setPosition(part.getWorldPosition(new THREE.Vector3()));
      toPart.copy(posedPart).invert();
      forward.transformDirection(toPart); palm.transformDirection(toPart);
      const mesh = vm.arms.meshes.find((m: THREE.SkinnedMesh) => m.name.endsWith(job.intent.side));
      const centroid = new THREE.Vector3(), point = new THREE.Vector3(); let count = 0;
      const skinIndex = mesh.geometry.attributes.skinIndex, skinWeight = mesh.geometry.attributes.skinWeight;
      for (let i = 0; i < skinIndex.count; i++) {
        let influence = 0;
        for (let k = 1; k < 4; k++) if (skinWeight.getComponent(i, k) > skinWeight.getComponent(i, influence)) influence = k;
        if (mesh.skeleton.bones[skinIndex.getComponent(i, influence)].name !== `hand_${job.intent.side}`) continue;
        mesh.bindPalmPosition(i, point);
        if (point.y >= -.006 || point.z >= -.012) continue;
        centroid.add(mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld).applyMatrix4(toPart)); count++;
      }
      if (!count) throw new Error('Neutral seed has no actual palm vertices');
      centroid.divideScalar(count);
      const oldForward = new THREE.Vector3(...start.forward).normalize(), oldPalm = new THREE.Vector3(...start.palm);
      oldPalm.addScaledVector(oldForward, -oldPalm.dot(oldForward)).normalize();
      const oldFrame = new THREE.Matrix4().makeBasis(oldForward, oldPalm, new THREE.Vector3().crossVectors(oldForward, oldPalm));
      const newFrame = new THREE.Matrix4().makeBasis(forward, palm, new THREE.Vector3().crossVectors(forward, palm));
      const offset = centroid.clone().sub(new THREE.Vector3(...start.wrist)).applyMatrix4(oldFrame.invert()).applyMatrix4(newFrame);
      start = { ...start, wrist: centroid.sub(offset).toArray(), forward: forward.toArray(), palm: palm.toArray() };
    }
    const result = fitGrip([weapon, job.intent, start, job.evals ?? 1200]);
    // Reinstall the independent audit adapter after fitting, so part ancestry
    // and canonical regions match the browser evidence exactly.
    installThirdPersonGripProbe({ weaponId: weapon, triggerIndices: indices, contactIndices });
    const side = job.intent.side, opposing = !job.intent.part && side === 'L' && (weapon === 'pistol' || weapon === 'revolver');
    const contactOptions = job.measureSurface ? { surface: job.measureSurface } : job.intent.part ? { surface: job.intent.part } : {};
    result.skin = measureGrip([weapon, side]);
    if (job.intent.withPaw) result.pair = measureGrip([weapon, side, true]);
    result.contact = measureGrip([weapon, side, opposing, contactOptions]);
    result.regions = Object.fromEntries(['palm', 'wrap'].map(region => [region, measureGrip([weapon, side, opposing, { ...contactOptions, region }]).worst]));
    const target = vm[`target${side}`], chain = arm(side);
    result.wrist = wristAngles(chain.upper.bone!.getWorldPosition(new THREE.Vector3()), chain.fore.bone!.getWorldPosition(new THREE.Vector3()),
      chain.hand.bone!.getWorldPosition(new THREE.Vector3()), target.forward, target.palm, side);
    result.rig = Object.fromEntries(Object.entries(chain).map(([name, joint]) => [name, joint.bone!.getWorldPosition(new THREE.Vector3()).toArray()]));
    if (phase !== undefined) {
      result.carryingSkin = measureGrip([weapon, 'R']);
      result.calibration = { reloadPhase: phase, empty, weaponScale: 1.3, units: 'world millimetres',
        gripFrame: job.intent.followRotation === false ? 'part origin with weapon axes' : 'part local', originalHandKeys: baseline,
        originalStart: structuredClone(start), fittedHandKey: { ...result.final.grip, space: 'part', part: job.intent.part,
          followRotation: job.intent.followRotation !== false } };
    }
    if (side === 'R' && weapon !== 'machete') {
      result.trigger = measureGrip([weapon, side, false, TRIGGER_FACE]);
      result.insideGuard = triggerInGuard(weapon, result.trigger.digits.index?.tip, 1.3);
    }
    if (job.output) await writeFile(job.output, JSON.stringify(result, null, 2) + '\n');
    console.log('CHECK', weapon, side, JSON.stringify({ skin: result.skin.worst, pair: result.pair?.worst, regions: result.regions, wrist: result.wrist,
      carrying: result.carryingSkin?.worst, trigger: result.trigger?.nearestSurfaceDistance, guard: result.insideGuard }));
    WORLD_GRIPS[weapon] = original;
    for (const entry of originalKeys ?? []) {
      if (entry.hand) entry.key[job.intent.side as 'R' | 'L'] = entry.hand; else delete entry.key[job.intent.side as 'R' | 'L'];
    }
  }
} finally { avatars.dispose(); disposeCapybaraAssets(); disposeAircraftAssets(); }
