import * as THREE from 'three';
import { applyCharacterStyle } from './materials';
import { CAPY_BONES, WEAPON_MOUNT, buildCapybaraBody, updateCapybaraBody, reactCapybara, resetCapybaraPose, capybaraIsDead, capybaraCorpseVisible, capybaraHeadTop, capybaraCrownHeight, celebrateCapybara } from './capybara';
import { itemGeometry, itemMaterial } from './item-geometry';
import { addEllipsoid } from './primitives';
import { WEAPONS } from '../shared/weapons';
import type { AvatarReaction } from './effects';
import { Nameplate, nameplateFontSize, nameplateHit, stackNameplate } from './nameplates';
import type { ActorState, RenderFrame, WeaponId, WorldSpec } from '../shared/types';

export const BOT_COLOR = '#ae825e';
interface Avatar {
  color: string; name: string;
  group: THREE.Group; body: THREE.SkinnedMesh; bones: THREE.Bone[]; weapon: THREE.Mesh;
  weaponId: WeaponId | null; chute: THREE.Group; label: THREE.Sprite; plate: Nameplate; targetable: boolean; initialized: boolean; awaitingAlive: boolean; sawDead: boolean; celebrated: boolean;
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
  const plate = new Nameplate(name, color), label = plate.sprite; group.add(label);
  return { color, name, group, body, bones, weapon, weaponId: null, chute, label, plate, targetable: false, initialized: false, awaitingAlive: false, sawDead: false, celebrated: false };
}

export class AvatarView {
  readonly warmupWeapons = new THREE.Group();
  private readonly visuals = new Map<string, Avatar>();
  private readonly ordered: Avatar[] = [];
  private readonly weapons = new Map<WeaponId | null, THREE.BufferGeometry>();
  private readonly target = new THREE.Vector3();
  private cameraBlend = 0;
  private matchId: string | null = null;
  private width = 1;
  private height = 1;
  private readonly forward = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly packed: Nameplate[] = [];
  resize(width: number, height: number) { this.width = Math.max(1, width); this.height = Math.max(1, height); }
  constructor(private readonly scene: THREE.Scene, private readonly camera: THREE.PerspectiveCamera, private readonly world?: WorldSpec) {
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
  react(id: string, reaction: AvatarReaction) {
    const visual = this.visuals.get(id);
    if (visual) {
      if (reaction.kind === 'death') visual.awaitingAlive = false;
      reactCapybara(visual.body, reaction);
    }
  }
  respawn(id: string) {
    const visual = this.visuals.get(id);
    if (!visual) return;
    resetCapybaraPose(visual.body); visual.initialized = false; visual.sawDead = false; visual.awaitingAlive = true;
  }
  dispose() {
    for (const [id, visual] of this.visuals) this.removeAvatar(id, visual);
    this.warmupWeapons.removeFromParent(); this.warmupWeapons.clear();
    this.weapons.forEach(geometry => geometry.dispose()); this.weapons.clear();
  }

  private removeAvatar(id: string, visual: Avatar) {
    this.scene.remove(visual.group); this.visuals.delete(id); this.packed.length = 0;
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
    for (const visual of this.ordered) { visual.group.visible = false; visual.targetable = false; }
    if (!actors) return;
    const matchId = frame.snapshot!.matchId;
    if (this.matchId !== null && this.matchId !== matchId) {
      for (const visual of this.ordered) {
        resetCapybaraPose(visual.body); visual.initialized = false; visual.sawDead = false; visual.awaitingAlive = false; visual.celebrated = false;
      }
    }
    this.matchId = matchId;
    const viewed = frame.spectateId || frame.playerId;
    this.camera.updateMatrixWorld(); this.camera.getWorldDirection(this.forward);
    this.up.setFromMatrixColumn(this.camera.matrixWorld, 1);
    let aimed: Avatar | null = null, nearest = Infinity;
    for (const state of actors) {
      const actor = frame.remoteActors?.get(state.id) ?? state;
      const visual = this.ensureAvatar(actor);
      let winner = false;
      if (frame.snapshot!.phase === 'results') {
        for (const result of frame.snapshot!.results) if (result.id === actor.id && result.winner) { winner = true; break; }
      }
      if (winner && !visual.celebrated) {
        // A deathmatch winner can be down when the clock ends; results are presentation only.
        resetCapybaraPose(visual.body); celebrateCapybara(visual.body); visual.sawDead = false; visual.celebrated = true;
      }
      if (!actor.alive && !winner && !visual.awaitingAlive) {
        visual.sawDead = true;
        if (!capybaraIsDead(visual.body)) reactCapybara(visual.body, { kind: 'death', head: false, weapon: 'fall', from: null });
      } else if (actor.alive) {
        if (visual.sawDead) this.respawn(actor.id);
        if (visual.awaitingAlive) visual.initialized = false;
        visual.awaitingAlive = false;
      }
      const dead = capybaraIsDead(visual.body);
      // Everyone still in the plane rides inside it; the viewed capivara stays
      // visible in third person and while the camera eases into its eyes.
      visual.group.visible = dead ? capybaraCorpseVisible(visual.body) : (actor.alive || winner) && actor.stage !== 'plane' &&
        (!frame.playing || actor.id !== viewed || actor.stage !== 'ground' || this.cameraBlend > .35);
      const pos = actor.id === frame.playerId && frame.predicted ? frame.predicted : actor.pos;
      const target = this.target.copy(pos);
      if (frame.remoteActors?.has(actor.id) || !visual.initialized || visual.group.position.distanceToSquared(target) > 144) visual.group.position.copy(target);
      else visual.group.position.lerp(target, Math.min(1, frame.dt * 14));
      visual.initialized = true;
      visual.group.rotation.y = actor.yaw;
      visual.group.scale.setScalar(1);
      visual.bones[CAPY_BONES.armor].scale.setScalar(actor.armor > 0 ? 1 : .0001);
      visual.bones[CAPY_BONES.helmet].scale.setScalar(actor.helmet > 0 ? 1 : .0001);
      visual.chute.visible = !dead && actor.stage === 'parachute';
      this.poseAvatar(visual, actor, frame.dt, frame.snapshot?.time ?? 0);
      const held = actor.weapons[actor.slot]?.id || null;
      if (held !== visual.weaponId) {
        visual.weapon.geometry = this.weapons.get(held)!;
        visual.weaponId = held;
      }
      visual.weapon.visible = !dead && actor.stage === 'ground' && !!held;
      const plate = visual.plate, scale = visual.group.scale.y;
      plate.head.copy(visual.group.position);
      plate.head.x -= Math.sin(actor.yaw) * .04 * scale;
      plate.head.y += 1.6 * (actor.crouch ? 1.3 / 1.8 : scale); plate.head.z -= Math.cos(actor.yaw) * .04 * scale;
      plate.distance = plate.head.distanceTo(this.camera.position);
      // The local kill event can beat the dead snapshot and the camera pullback.
      // Keep the corpse out of the camera until it has left the standing head.
      if (dead && frame.playing && actor.id === viewed && plate.distance < .5) visual.group.visible = false;
      visual.targetable = !dead && actor.alive && actor.id !== viewed && actor.stage === 'ground' && plate.distance <= 60;
      if (visual.targetable) {
        const hit = nameplateHit(this.camera.position, this.forward, actor, visual.group.position);
        if (hit < nearest && plate.canSee(this.camera, this.world, elapsed)) { nearest = hit; aimed = visual; }
      }
    }
    let packedCount = 0;
    for (const visual of this.ordered) {
      const plate = visual.plate, label = visual.label;
      const visible = visual.targetable && plate.distance > 1.5 &&
        (visual === aimed || plate.visibility.opacity > 0) && plate.canSee(this.camera, this.world, elapsed);
      const opacity = plate.visibility.update(visual === aimed, visible, frame.dt);
      label.material.opacity = opacity * THREE.MathUtils.clamp((plate.distance - 1.5) / .5, 0, 1);
      label.visible = visual.group.visible && label.material.opacity > 0;
      if (!label.visible) continue;
      const scale = visual.group.scale.y, fontScale = nameplateFontSize(this.height, plate.distance) / 14;
      const pixelsToUnits = 2 / (this.height * this.camera.projectionMatrix.elements[5]);
      label.scale.set(plate.width * fontScale * pixelsToUnits / scale, plate.height * fontScale * pixelsToUnits / scale, 1);
      const crownHeight = capybaraCrownHeight(visual.body);
      label.position.set(0, crownHeight + .35 / scale, 0);
      plate.projected.copy(visual.group.position); plate.projected.y += crownHeight * scale + .35;
      const m = this.camera.matrixWorldInverse.elements;
      const depth = -(m[2] * plate.projected.x + m[6] * plate.projected.y + m[10] * plate.projected.z + m[14]);
      plate.projected.project(this.camera);
      if (depth <= 0 || plate.projected.z > 1) { label.visible = false; continue; }
      plate.bounds.width = plate.width * fontScale; plate.bounds.height = plate.height * fontScale;
      plate.bounds.x = (plate.projected.x + 1) * .5 * this.width - plate.bounds.width / 2;
      plate.bounds.y = (1 - plate.projected.y) * .5 * this.height - plate.bounds.height;
      const shift = stackNameplate(plate, this.packed, packedCount);
      const lift = shift * pixelsToUnits * depth / scale;
      const cos = Math.cos(visual.group.rotation.y), sin = Math.sin(visual.group.rotation.y);
      label.position.x += (cos * this.up.x - sin * this.up.z) * lift;
      label.position.y += this.up.y * lift;
      label.position.z += (sin * this.up.x + cos * this.up.z) * lift;
      this.packed[packedCount++] = plate;
    }
  }

  private poseAvatar(visual: Avatar, actor: ActorState, dt: number, simulationTime: number) {
    for (const bone of visual.bones) { bone.rotation.set(0, 0, 0); bone.position.copy(bone.userData.rest as THREE.Vector3); }
    updateCapybaraBody(visual.body, actor, dt, simulationTime);
  }
}
