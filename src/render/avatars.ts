import * as THREE from 'three';
import { CAPY_BONES, WEAPON_MOUNT, buildCapybaraBody, updateCapybaraBody } from './capybara';
import { itemGeometry, itemMaterial } from './item-geometry';
import { addEllipsoid } from './primitives';
import { WEAPONS } from '../shared/weapons';
import type { ActorState, RenderFrame, WeaponId } from '../shared/types';
import type { AvatarReaction } from './effects';

export const BOT_COLOR = '#ae825e';
interface Avatar {
  color: string; name: string;
  group: THREE.Group; body: THREE.SkinnedMesh; bones: THREE.Bone[]; weapon: THREE.Mesh;
  weaponId: WeaponId | null; chute: THREE.Group; label: THREE.Sprite; phase: number; initialized: boolean; squash: number;
}
function nameSprite(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(35,39,36,.63)'; ctx.roundRect(6, 7, 500, 82, 26); ctx.fill();
  ctx.strokeStyle = 'rgba(255,238,194,.6)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#f8ebcc'; ctx.font = 'bold 39px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(name.slice(0, 22), 256, 48);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false }));
  sprite.scale.set(2.1, .39, 1); sprite.position.y = 2.03; return sprite;
}

export function avatar(color: string, name: string): Avatar {
  const group = new THREE.Group();
  const { body, bones } = buildCapybaraBody(color);
  group.add(body);
  // The held weapon rides on the arms bone, so it aims with the paws.
  const weapon = new THREE.Mesh(new THREE.BufferGeometry(), itemMaterial);
  weapon.position.copy(WEAPON_MOUNT); weapon.castShadow = true; bones[CAPY_BONES.arms].add(weapon);
  const chute = new THREE.Group(); group.add(chute);
  addEllipsoid(chute, '#e6c280', 0, 3.65, 0, 1.9, .32, 1.18);
  for (const x of [-1.6, 1.6]) for (const z of [-.9, .9]) {
    const start = new THREE.Vector3(x, 3.65, z), end = new THREE.Vector3(x * .15, 1.25, z * .15);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), new THREE.LineBasicMaterial({ color: '#f7ebcd' })); chute.add(line);
  }
  const label = nameSprite(name); label.position.y = 2.2; group.add(label);
  return { color, name, group, body, bones, weapon, weaponId: null, chute, label, phase: 0, initialized: false, squash: 0 };
}

export class AvatarView {
  readonly warmupWeapons = new THREE.Group();
  private readonly visuals = new Map<string, Avatar>();
  private readonly ordered: Avatar[] = [];
  private readonly weapons = new Map<WeaponId | null, THREE.BufferGeometry>();
  private readonly target = new THREE.Vector3();
  private readonly tilt = new THREE.Euler();
  private readonly centre = new THREE.Vector3(0, .9, 0);
  private readonly rotatedCentre = new THREE.Vector3();
  private elapsed = 0;
  private cameraBlend = 0;
  constructor(private readonly scene: THREE.Scene, private readonly camera: THREE.PerspectiveCamera) {
    this.weapons.set(null, new THREE.BufferGeometry());
    for (const id of Object.keys(WEAPONS) as WeaponId[]) {
      const geometry = itemGeometry('weapon', id); this.weapons.set(id, geometry);
      this.warmupWeapons.add(new THREE.Mesh(geometry, itemMaterial));
    }
  }
  prepare(actors: readonly ActorState[]) {
    const ids = new Set(actors.map(actor => actor.id));
    for (const [id, visual] of this.visuals) if (!ids.has(id)) this.removeAvatar(id, visual);
    for (const actor of actors) this.ensureAvatar(actor);
  }
  get(id: string) { return this.visuals.get(id); }
  // Authoritative hit/elimination hook. For now a 90 ms squash on hits; the
  // capybara runtime drives flinch, face and death clips from here.
  react(id: string, reaction: AvatarReaction) {
    const visual = this.visuals.get(id);
    if (visual && reaction.kind === 'hit') visual.squash = .09;
  }
  dispose() {
    for (const [id, visual] of this.visuals) this.removeAvatar(id, visual);
    this.warmupWeapons.removeFromParent(); this.warmupWeapons.clear();
    this.weapons.forEach(geometry => geometry.dispose()); this.weapons.clear();
  }

  private removeAvatar(id: string, visual: Avatar) {
    this.scene.remove(visual.group); this.visuals.delete(id);
    this.ordered.splice(this.ordered.indexOf(visual), 1);
    // Body geometry/material and held weapon geometries are shared caches.
    // The v3 skeleton disposer also releases its private mixer and LOD rigs.
    visual.body.skeleton.dispose();
    visual.label.material.map?.dispose(); visual.label.material.dispose();
    visual.chute.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose(); (object.material as THREE.Material).dispose();
      }
    });
  }

  private ensureAvatar(actor: ActorState): Avatar {
    let visual = this.visuals.get(actor.id);
    if (visual && (visual.color !== actor.color || visual.name !== actor.name)) {
      this.removeAvatar(actor.id, visual); visual = undefined;
    }
    if (!visual) { visual = avatar(actor.color, actor.name); visual.weapon.geometry.dispose(); visual.weapon.geometry = this.weapons.get(null)!; this.visuals.set(actor.id, visual); this.ordered.push(visual); this.scene.add(visual.group); }
    return visual;
  }

  update(frame: RenderFrame, cameraBlend: number, elapsed: number) {
    this.cameraBlend = cameraBlend; this.elapsed = elapsed;
    const actors = frame.snapshot?.actors;
    for (const visual of this.ordered) visual.group.visible = false;
    if (!actors) return;
    const viewed = frame.spectateId || frame.playerId;
    for (const actor of actors) {
      const visual = this.ensureAvatar(actor);
      // Everyone still in the plane rides inside it; the viewed capivara stays
      // visible in third person and while the camera eases into its eyes.
      visual.group.visible = actor.alive && actor.stage !== 'plane' &&
        (!frame.playing || actor.id !== viewed || actor.stage !== 'ground' || this.cameraBlend > .35);
      const pos = actor.id === frame.playerId && frame.predicted ? frame.predicted : actor.pos;
      const target = this.target.copy(pos);
      if (!visual.initialized || visual.group.position.distanceToSquared(target) > 144) visual.group.position.copy(target);
      else visual.group.position.lerp(target, Math.min(1, frame.dt * 14));
      visual.initialized = true;
      visual.group.rotation.y = actor.yaw;
      visual.group.scale.setScalar(1);
      visual.bones[CAPY_BONES.armor].scale.setScalar(actor.armor > 0 ? 1 : .0001);
      visual.bones[CAPY_BONES.helmet].scale.setScalar(actor.helmet > 0 ? 1 : .0001);
      visual.chute.visible = actor.stage === 'parachute';
      visual.label.visible = actor.alive && actor.id !== viewed && visual.group.position.distanceToSquared(this.camera.position) < 24 * 24;
      this.poseAvatar(visual, actor, frame.dt);
      if (visual.squash > 0) {
        visual.squash = Math.max(0, visual.squash - frame.dt);
        const k = Math.sin(visual.squash / .09 * Math.PI) * .06;
        visual.group.scale.set(visual.group.scale.x * (1 + k * .6), visual.group.scale.y * (1 - k), visual.group.scale.z * (1 + k * .6));
      }
      const held = actor.weapons[actor.slot]?.id || null;
      if (held !== visual.weaponId) {
        visual.weapon.geometry = this.weapons.get(held)!;
        visual.weaponId = held;
      }
      visual.weapon.visible = actor.stage === 'ground' && !!held;
    }
  }

  // Upright cartoon pose: two-leg walk, knee-bend crouch, aim with head and
  // arms, belly-down freefall and dangling legs under the parachute.
  private poseAvatar(visual: Avatar, actor: ActorState, dt: number) {
    const b = visual.bones, B = CAPY_BONES;
    for (const bone of b) { bone.rotation.set(0, 0, 0); bone.position.copy(bone.userData.rest as THREE.Vector3); }
    const speed = Math.hypot(actor.velocity.x, actor.velocity.z);
    visual.phase += dt * Math.min(13, speed * 2.1);
    visual.group.rotation.set(0, actor.yaw, 0);
    if (updateCapybaraBody(visual.body, actor, dt)) {
      if (actor.crouch) visual.group.scale.setScalar(1.3 / 1.8);
      return;
    }
    const pitch = THREE.MathUtils.clamp(actor.pitch, -1, 1);
    if (actor.stage === 'falling') {
      // Belly down around the body's centre, paws forward, legs trailing.
      const tilt = this.tilt.set(-1.25, 0, Math.sin(visual.phase * .3 + this.elapsed * 2) * .06), centre = this.centre;
      b[B.root].rotation.copy(tilt); b[B.root].position.copy(centre).sub(this.rotatedCentre.copy(centre).applyEuler(tilt));
      b[B.arms].rotation.x = .75; b[B.head].rotation.x = .7;
      const kick = Math.sin(this.elapsed * 5) * .15;
      b[B.thighL].rotation.x = -.35 + kick; b[B.thighR].rotation.x = -.35 - kick;
      b[B.shinL].rotation.x = -.5; b[B.shinR].rotation.x = -.5;
      return;
    }
    if (actor.stage === 'parachute') {
      // Paws up on the lines, legs swinging loosely.
      b[B.arms].rotation.x = 2.75; b[B.head].rotation.x = .15;
      const sway = Math.sin(this.elapsed * 2.2) * .18;
      b[B.thighL].rotation.x = .12 + sway; b[B.thighR].rotation.x = .12 - sway;
      b[B.shinL].rotation.x = -.25 - sway * .5; b[B.shinR].rotation.x = -.25 + sway * .5;
      return;
    }
    const walk = actor.grounded ? Math.min(1, speed / 5) : 0;
    const step = Math.sin(visual.phase);
    if (actor.crouch) {
      // The simulation's crouch is the standing hit shape scaled by 1.3 / 1.8
      // from the feet, so the crouched capivara is drawn exactly that way.
      visual.group.scale.setScalar(1.3 / 1.8);
      const creep = step * .35 * walk;
      b[B.thighL].rotation.x = creep; b[B.thighR].rotation.x = -creep;
    } else {
      b[B.thighL].rotation.x = step * .65 * walk; b[B.thighR].rotation.x = -step * .65 * walk;
      b[B.shinL].rotation.x = -Math.max(0, -Math.cos(visual.phase)) * .8 * walk;
      b[B.shinR].rotation.x = -Math.max(0, Math.cos(visual.phase)) * .8 * walk;
      b[B.root].position.y = Math.abs(Math.cos(visual.phase)) * .045 * walk;
      b[B.torso].rotation.z = step * .05 * walk;
      if (!actor.grounded) { b[B.thighL].rotation.x = .5; b[B.shinL].rotation.x = -.9; b[B.thighR].rotation.x = -.15; b[B.shinR].rotation.x = -.3; }
    }
    const lean = b[B.torso].rotation.x;
    // Hit volumes do not lean, so the body only hints at it.
    b[B.torso].rotation.z += -actor.lean * .05;
    b[B.head].rotation.x = pitch * .55 - lean;
    b[B.arms].rotation.x = pitch - lean + (actor.sprint ? -.55 : 0);
  }

}
