import * as THREE from 'three';
import { applyCharacterStyle } from './materials';
import { CAPY_BONES, WEAPON_MOUNT, buildCapybaraBody, updateCapybaraBody } from './capybara';
import { itemGeometry, itemMaterial } from './item-geometry';
import { addEllipsoid } from './primitives';
import { WEAPONS } from '../shared/weapons';
import type { ActorState, RenderFrame, WeaponId } from '../shared/types';

export const BOT_COLOR = '#ae825e';
interface Avatar {
  color: string; name: string;
  group: THREE.Group; body: THREE.SkinnedMesh; bones: THREE.Bone[]; weapon: THREE.Mesh;
  weaponId: WeaponId | null; chute: THREE.Group; label: THREE.Sprite; initialized: boolean;
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
  // Include every preloaded LOD, preserving its own visibility and skinning.
  body.traverse(object => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    object.layers.enable(1);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof THREE.MeshStandardMaterial) applyCharacterStyle(material);
    }
  });
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
  return { color, name, group, body, bones, weapon, weaponId: null, chute, label, initialized: false };
}

export class AvatarView {
  readonly warmupWeapons = new THREE.Group();
  private readonly visuals = new Map<string, Avatar>();
  private readonly ordered: Avatar[] = [];
  private readonly weapons = new Map<WeaponId | null, THREE.BufferGeometry>();
  private readonly target = new THREE.Vector3();
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
    this.cameraBlend = cameraBlend;
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
      const held = actor.weapons[actor.slot]?.id || null;
      if (held !== visual.weaponId) {
        visual.weapon.geometry = this.weapons.get(held)!;
        visual.weaponId = held;
      }
      visual.weapon.visible = actor.stage === 'ground' && !!held;
    }
  }

  private poseAvatar(visual: Avatar, actor: ActorState, dt: number) {
    for (const bone of visual.bones) { bone.rotation.set(0, 0, 0); bone.position.copy(bone.userData.rest as THREE.Vector3); }
    updateCapybaraBody(visual.body, actor, dt);
    // Match the simulation's crouched hit shape, scaled from the feet.
    if (actor.crouch) visual.group.scale.setScalar(1.3 / 1.8);
  }
}
