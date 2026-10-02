import * as THREE from 'three';
import metrics from '../../public/models/arsenal/metrics.json';
import type { WeaponId } from '../shared/types';
import { heldCurl, type GripSpec } from './viewmodel-specs';
import type { ChoreoSample, HandKey } from './viewmodel-choreo';
import { blendCurl } from './fp-arms';
import { pistolReload, smgReload, REVOLVER_RELOAD } from './viewmodel-anims';

export type ShortGun = 'pistol' | 'smg' | 'revolver';
export type WorldParts = Record<string, THREE.Object3D>;
export const isShortGun = (id: WeaponId | null): id is ShortGun => id === 'pistol' || id === 'smg' || id === 'revolver';
export const shortReload = (id: ShortGun, empty: boolean) => id === 'pistol' ? pistolReload(empty) : id === 'smg' ? smgReload(empty) : REVOLVER_RELOAD;
const fromBlender = (v: readonly number[]) => new THREE.Vector3(v[0], v[2], -v[1]);
const axes = { pistol: fromBlender(metrics.pistol.magAxis).normalize(), smg: fromBlender(metrics.smg.magAxis).normalize(), revolver: fromBlender(metrics.revolver.magAxis).normalize() };
const crane = fromBlender(metrics.revolver.crane), Z = new THREE.Vector3(0, 0, 1);
const loaderSeat = new THREE.Vector3(-.03169, -.00433, 0);

// Geometry and rest transforms are reset by AvatarView before each pose. Keep
// the same mechanical contacts as first person, with shorter belt travel.
export function animateShortWorld(id: ShortGun, parts: WorldParts, sample: ChoreoSample | null, ammo: number, near: boolean) {
  const channel = sample?.parts ?? {}, { slide, mag, release, charge, action, cylinder, rounds } = parts;
  if (slide) slide.position.z += (channel.slide ?? (ammo === 0 ? 1 : 0)) * .028;
  if (release) release.rotation.z += (channel.release ?? 0) * .20;
  if (charge) charge.position.z += (channel.charge ?? 0) * .065;
  if (id === 'smg' && action) action.position.z += (channel.charge ?? 0) * .052;
  if (id === 'revolver' && cylinder) {
    const swing = new THREE.Quaternion().setFromAxisAngle(Z, (channel.swing ?? 0) * 1.3);
    for (const name of ['cylinder', 'crane', 'action', 'rounds', 'case0', 'case1', 'case2', 'case3', 'case4', 'case5']) {
      const part = parts[name]; if (!part) continue;
      part.position.sub(crane).applyQuaternion(swing).add(crane); part.quaternion.copy(swing);
    }
    if (action) action.position.z += (channel.eject ?? 0) * .030;
    const spent = channel.spent ?? 0;
    if (rounds) rounds.visible = near && ((channel.fresh ?? 0) > .5 || spent < .002);
    for (let i = 0; i < 6; i++) {
      const part = parts[`case${i}`]; if (!part) continue;
      part.visible = near && spent > .001 && spent < .995;
      const free = Math.max(0, spent - .18), a = i * Math.PI / 3;
      part.position.z += spent * .20;
      part.position.x += (Math.cos(a) * .045 - .14) * free;
      part.position.y += Math.sin(a) * free * .03 - free * free * .08;
      part.rotation.x += free * (i % 2 ? 2.2 : -1.8); part.rotation.y += free * (i - 2.5) * .55;
      const tip = parts[`live${i}`];
      if (tip) { tip.visible = part.visible && i < ammo; tip.position.copy(part.position); tip.quaternion.copy(part.quaternion); }
    }
  }
  if (mag) {
    const m = sample?.mag;
    mag.visible = near && (m ? m.visible : id !== 'revolver');
    if (m) {
      mag.position.addScaledVector(axes[id], m.out * .55);
      // The loader's seat follows the open crane. Only its approach contracts.
      if (id === 'revolver') mag.position.add(loaderSeat).addScaledVector(new THREE.Vector3().subVectors(m.p, loaderSeat), .55);
      else mag.position.addScaledVector(m.p, .55);
      mag.rotation.set(m.r.x, m.r.y, m.r.z);
    }
    if (id === 'revolver' && rounds && (channel.fresh ?? 0) > .5 && (channel.loaded ?? 0) < .5) {
      rounds.position.copy(mag.position); rounds.quaternion.copy(mag.quaternion); rounds.visible = mag.visible;
    }
  }
}

export function shortWorldGrip(rest: GripSpec, channel: ChoreoSample['L'], parts: WorldParts, weapon: THREE.Object3D, character: THREE.Object3D): GripSpec {
  if (!channel) return rest;
  const resolve = (key: HandKey): GripSpec => {
    const wrist = new THREE.Vector3().fromArray(key.space === 'grip' ? rest.wrist : key.wrist ?? rest.wrist);
    const forward = new THREE.Vector3().fromArray(key.forward ?? rest.forward), palm = new THREE.Vector3().fromArray(key.palm ?? rest.palm);
    if (key.space === 'part' && key.part && parts[key.part]) {
      const part = parts[key.part];
      if (key.followRotation !== false) { wrist.applyQuaternion(part.quaternion); forward.applyQuaternion(part.quaternion); palm.applyQuaternion(part.quaternion); }
      wrist.add(part.position);
    } else if (key.space === 'view') {
      // Camera-space fetch keys become a reachable pouch beside the torso.
      wrist.set(wrist.x * .6, 1.2 + wrist.y * .6, Math.min(-.14, wrist.z - .28)).applyMatrix4(character.matrixWorld);
      weapon.worldToLocal(wrist);
      const rotation = weapon.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(character.getWorldQuaternion(new THREE.Quaternion()));
      forward.applyQuaternion(rotation); palm.applyQuaternion(rotation);
    }
    if (key.offset) wrist.add(new THREE.Vector3().fromArray(key.offset));
    const curl = key.indexed ? heldCurl(rest, 1) : rest.curl;
    return { ...rest, wrist: wrist.toArray(), forward: forward.toArray(), palm: palm.toArray(),
      curl: { ...curl, ...key.curl, indexSpread: key.curl?.indexSpread ?? (key.curl?.index ? 0 : curl.indexSpread) } };
  };
  const a = resolve(channel.a), b = resolve(channel.b), u = channel.u;
  const mix = (v: readonly number[], w: readonly number[]) => new THREE.Vector3().fromArray(v).lerp(new THREE.Vector3().fromArray(w), u).toArray();
  return { ...rest, wrist: mix(a.wrist, b.wrist), forward: mix(a.forward, b.forward), palm: mix(a.palm, b.palm), curl: blendCurl(a.curl, b.curl, u) };
}
