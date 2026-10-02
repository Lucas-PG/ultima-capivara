import * as THREE from 'three';
import { AvatarView } from '../../src/render/avatars';
import { wristAngles } from '../../src/render/fp-arms';
import { emptyInput } from '../../src/shared/math';
import { WEAPONS } from '../../src/shared/weapons';
import type { ActorState, RenderFrame, WeaponId, WorldSnapshot } from '../../src/shared/types';

/** Replay the same ready settle and advancing reload used by the visual evidence. */
export function poseWorldReload(view: AvatarView, scene: THREE.Scene, weapon: WeaponId, phase: number, empty: boolean) {
  view.prepare([]);
  const actor = { id: 'reload-audit', name: 'Capivara', color: '#1fb5a8', pos: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
    alive: true, hp: 100, armor: 0, helmet: 0, kills: 0, stage: 'ground', grounded: true, crouch: false, yaw: 0, pitch: 0, lean: 0,
    weapons: [{ id: weapon, ammo: empty ? 0 : 3, reserve: 60, rarity: 0, box: 0 }], slot: 0, sprint: false, ads: false, reloadUntil: 0, shotSeq: 0 } as ActorState;
  const snapshot = { matchId: 'reload-audit', phase: 'playing', actors: [actor], results: [], time: 1 } as unknown as WorldSnapshot;
  const frame: RenderFrame = { snapshot, playerId: 'observer', playing: true, spectateId: null, input: emptyInput(), dt: 1 / 60 };
  const step = (seconds: number) => { for (let remaining = seconds; remaining > 1e-8;) {
    frame.dt = Math.min(1 / 60, remaining); remaining -= frame.dt; snapshot.time += frame.dt; view.update(frame, 0, snapshot.time);
  } };
  step(1.5); actor.reloadUntil = snapshot.time + WEAPONS[weapon].reload;
  if (phase) step(phase * WEAPONS[weapon].reload); else { frame.dt = 0; view.update(frame, 0, snapshot.time); }
  scene.updateMatrixWorld(true);
  return view.get(actor.id)!;
}

/** Recover the actual posed paw frame from the shipped skeleton, not a socket target. */
export function worldWristAngles(body: THREE.Object3D) {
  const source = body.getObjectByName('Capybara_LOD0') as THREE.SkinnedMesh;
  return Object.fromEntries((['R', 'L'] as const).map(side => {
    const bone = (n: string) => source.skeleton.bones.find(b => b.name === `${n}_${side}`)!;
    const bind = (n: string) => source.skeleton.boneInverses[source.skeleton.bones.indexOf(bone(n))].clone().invert();
    const bindQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(bind('paw')));
    const forward = new THREE.Vector3(0, 1, 0).applyQuaternion(bindQ).normalize();
    const across = new THREE.Vector3().setFromMatrixPosition(bind('paw_ring1')).sub(new THREE.Vector3().setFromMatrixPosition(bind('paw_index1'))).normalize();
    const palm = new THREE.Vector3().crossVectors(forward, across).multiplyScalar(side === 'R' ? 1 : -1).normalize();
    const rotation = bone('paw').getWorldQuaternion(new THREE.Quaternion()).multiply(bindQ.invert());
    forward.applyQuaternion(rotation); palm.applyQuaternion(rotation);
    return [side, wristAngles(bone('arm').getWorldPosition(new THREE.Vector3()), bone('forearm').getWorldPosition(new THREE.Vector3()),
      bone('paw').getWorldPosition(new THREE.Vector3()), forward, palm, side)];
  }));
}
