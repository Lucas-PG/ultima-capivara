import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { WEAPONS } from '../shared/weapons';
import { MELEE_SECONDS, sampleMelee, sampleHeavyMelee } from '../shared/weapon-presentation';
import { EMOTES, EMOTE_IDS } from '../shared/emotes';
import { TRAMPOLINE_IMPULSE } from '../shared/collision';
import type { ActorState, EmoteId } from '../shared/types';
import type { AvatarReaction } from './effects';
import { applyCharacterStyle } from './materials';
import { VIEW_SPECS, type GripSpec } from './viewmodel-specs';
import { PawPose, blendCurl, type HandCurl } from './fp-arms';
import type { WeaponId } from '../shared/types';
import { m4Reload } from './viewmodel-anims';
import { isShortGun, shortReload, animateShortWorld, shortWorldGrip, type WorldParts } from './short-world-parts';
import { newSample, sampleChoreo, type ChoreoSample, type HandKey } from './viewmodel-choreo';

// Bone layout shared with GameRenderer.updateAvatars():
// 0 root · 1 torso (pivots at the hips) · 2 head · 3 arms + held weapon (shoulders)
// 4 spare · 5/6 thighs (left/right) · 7/8 shins · 9 armour vest · 10 helmet.
export const CAPY_BONES = { root: 0, torso: 1, head: 2, arms: 3, thighL: 5, thighR: 6, shinL: 7, shinR: 8, armor: 9, helmet: 10 } as const;
// World-space bind pivots (model faces -Z, feet at y = 0, eyes at ~1.62).
const PIVOT = {
  torso: new THREE.Vector3(0, .62, 0), head: new THREE.Vector3(0, 1.3, -.02), arms: new THREE.Vector3(0, 1.17, -.04),
  hip: .62, knee: .33, legX: .15,
};
// Where the held weapon sits, in the arms bone's local space.
export const WEAPON_MOUNT = new THREE.Vector3(.1, -.12, -.36);

export function buildCapybaraBody(color: string): { body: THREE.SkinnedMesh; bones: THREE.Bone[]; dispose: () => void } {
  // Every avatar must be final when it enters the scene, never replaced later.
  if (!characterAsset) throw new Error('A capivara v3 ainda não está pronta.');
  const { torso, head, arms, thighL, thighR, shinL, shinR, armor, helmet } = CAPY_BONES;
  // The empty carrier retains the held-weapon socket; all visible art comes from the GLB.
  const source = characterAsset.scene.getObjectByName('Capybara_LOD0') as THREE.SkinnedMesh;
  const body = new THREE.SkinnedMesh(new THREE.BufferGeometry(), characterMaterial(source.material as THREE.MeshStandardMaterial, color));
  // A fixed sphere that holds every pose (freefall, parachute arms) keeps
  // off-screen capybaras out of both the colour and the shadow pass.
  body.castShadow = true; body.receiveShadow = true;
  body.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .95, 0), 1.9);

  const bones = Array.from({ length: 11 }, () => new THREE.Bone());
  const [root] = bones;
  const attach = (child: number, parent: THREE.Bone, world: THREE.Vector3, parentWorld: THREE.Vector3) => {
    bones[child].position.copy(world).sub(parentWorld); parent.add(bones[child]);
  };
  const origin = new THREE.Vector3();
  attach(torso, root, PIVOT.torso, origin);
  attach(head, bones[torso], PIVOT.head, PIVOT.torso);
  attach(arms, bones[torso], PIVOT.arms, PIVOT.torso);
  attach(4, root, origin, origin);
  attach(armor, bones[torso], PIVOT.torso, PIVOT.torso);
  attach(helmet, bones[head], PIVOT.head, PIVOT.head);
  for (const [side, thigh, shin] of [[-1, thighL, shinL], [1, thighR, shinR]] as const) {
    const hip = new THREE.Vector3(side * PIVOT.legX, PIVOT.hip, 0), knee = new THREE.Vector3(side * PIVOT.legX, PIVOT.knee, 0);
    attach(thigh, root, hip, origin);
    attach(shin, bones[thigh], knee, hip);
  }
  for (const bone of bones) bone.userData.rest = bone.position.clone();
  body.add(root); body.bind(new THREE.Skeleton(bones));
  installCharacter(body, bones, color);
  // The geometry is shared: it is released with the renderer, not per avatar.
  return { body, bones, dispose: () => {} };
}

// Geometry, atlas, and clips are shared; poses are private.
export const CAPYBARA_ASSET_URL = `${import.meta.env.BASE_URL}models/capybara/capybara.glb`;
let characterAsset: GLTF | null = null;
let characterAtlasColumns: 4 | 16 = 16;
let characterHeadTop = 1.85;
/** Rest-pose crown, measured once from the loaded mesh rather than the hit sphere. */
export function capybaraHeadTop(): number { return characterHeadTop; }
export function capybaraHasClip(name: string): boolean { return !!characterAsset?.animations.some(clip => clip.name === name); }
let characterLoading: Promise<void> | null = null;
let characterGeneration = 0;
const characterInstances = new WeakMap<THREE.SkinnedMesh, CharacterInstance>();
const characterMaterials = new Map<string, THREE.MeshStandardMaterial>();


// Authored vertex colour and UV detail share the bandana's team mask.
function teamMaterial(source: THREE.MeshStandardMaterial, tint: THREE.Color): THREE.MeshStandardMaterial {
  const material = source.clone();
  material.vertexColors = true;
  if (!material.userData.capySurfaceAtlas) { material.roughness = .86; material.metalness = 0; }
  const team = new THREE.Color(tint).convertSRGBToLinear();
  material.userData.teamColor = team;
  material.onBeforeCompile = shader => {
    shader.uniforms.teamColor = { value: team };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float teamMask; varying float vTeam;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTeam = teamMask;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 teamColor; varying float vTeam;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        // Keep the painted light (AO) of the authored teal, swap only its hue.
        float teamShade = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722)) / .36;
        diffuseColor.rgb = mix(diffuseColor.rgb, teamColor * clamp(teamShade, .35, 1.3), vTeam);`);
  };
  material.customProgramCacheKey = () => 'capivara-team-v4';
  return applyCharacterStyle(material, 4);
}

function characterMaterial(source: THREE.MeshStandardMaterial, color: string): THREE.MeshStandardMaterial {
  const tint = new THREE.Color(color), key = `${source.uuid}:${tint.getHexString()}`;
  const cached = characterMaterials.get(key);
  if (cached) return cached;
  const material = teamMaterial(source, tint); material.name = `Capivara_team_${tint.getHexString()}`;
  material.addEventListener('dispose', () => characterMaterials.delete(key));
  characterMaterials.set(key, material);
  return material;
}
interface CharacterInstance {
  scene: THREE.Group; mixer: THREE.AnimationMixer; actions: Record<string, THREE.AnimationAction>;
  faceActions: (THREE.AnimationAction | undefined)[];
  active: string; weights: Record<string, number>; targets: Record<string, number>; grounded: boolean; swimming: boolean; swimBlend: number; landing: number; crouchOffset: number; spine?: THREE.Bone; crown: THREE.Vector3; crownScratch: THREE.Vector3; expression: CapybaraExpression; forcedExpression: CapybaraExpression | null; faceTime: number;
  hitTime: number; hitX: number; hitZ: number; deathTime: number; deathSide: number; emoteTime: number; unarmed: number; head: THREE.Bone; arms: THREE.Bone[]; root: THREE.Bone; elapsed: number;
  legacyBones: THREE.Bone[]; skeleton: THREE.Skeleton; poseBones: THREE.Bone[]; baseRotations: THREE.Quaternion[];
  relaxBones: THREE.Bone[]; relaxedArms: THREE.Quaternion[]; armBlends: THREE.Quaternion[];
  gesture: EmoteId | null; gestureDeadline: number; gestureElapsed: number; gestureBlend: number;
  bounceSeq: number | null;
  hold?: { pawR: THREE.Bone; restInv: THREE.Quaternion; armL: THREE.Bone; forearmL: THREE.Bone; pawL: THREE.Bone };
  gestureJoints: Partial<Record<'forearm_L' | 'forearm_R' | 'paw_L' | 'paw_R' | 'thigh_L' | 'thigh_R' | 'shin_L' | 'shin_R' | 'foot_L' | 'foot_R', THREE.Bone>>;
}

export function preloadCapybaraAsset(load?: (url: string) => Promise<GLTF>): Promise<void> {
  if (!characterLoading) {
    const generation = characterGeneration;
    characterLoading = (async () => {
      const asset = await (load ? load(CAPYBARA_ASSET_URL) : new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(CAPYBARA_ASSET_URL));
      if (generation !== characterGeneration) {
        disposeCharacterSource(asset);
        throw new Error('Carregamento da capivara cancelado após descarte.');
      }
      try {
        for (const name of ['root', 'head', 'arm_L', 'arm_R']) {
          if (!(asset.scene.getObjectByName(name) instanceof THREE.Bone)) throw new Error(`Capivara v3 inválida: osso ${name}.`);
        }
        for (const name of ['idle', 'run', 'jump']) {
          if (!asset.animations.some(clip => clip.name === name)) throw new Error(`Capivara v3 inválida: animação ${name}.`);
        }
        for (let i = 0; i < 3; i++) {
          if (!(asset.scene.getObjectByName(`Capybara_LOD${i}`) instanceof THREE.SkinnedMesh)) throw new Error(`Capivara v3 inválida: LOD ${i}.`);
        }
        let paintedAtlas = false;
        asset.scene.traverse(object => {
          if (object.userData.paintAtlas === '4x4') paintedAtlas = true;
          if (!(object instanceof THREE.SkinnedMesh)) return;
          const mask = object.geometry.getAttribute('_team') ?? object.geometry.getAttribute('_TEAM');
          if (mask) { object.geometry.setAttribute('teamMask', mask); object.geometry.deleteAttribute('_team'); object.geometry.deleteAttribute('_TEAM'); }
          else if (!object.geometry.getAttribute('teamMask')) object.geometry.setAttribute('teamMask', new THREE.BufferAttribute(new Float32Array(object.geometry.getAttribute('position').count), 1));
          object.castShadow = true; object.receiveShadow = true;
          object.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .95, 0), 1.9);
        });
        asset.scene.updateMatrixWorld(true);
        const source = asset.scene.getObjectByName('Capybara_LOD0') as THREE.SkinnedMesh;
        source.skeleton.update();
        const bounds = new THREE.Box3().setFromObject(source, true);
        if (Number.isFinite(bounds.max.y)) characterHeadTop = bounds.max.y;
        characterAtlasColumns = paintedAtlas ? 4 : 16;
        characterAsset = asset;
      } catch (error) {
        disposeCharacterSource(asset);
        throw error;
      }
    })();
  }
  return characterLoading;
}

function disposeCharacterSource(asset: GLTF): void {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>(), skeletons = new Set<THREE.Skeleton>();
  asset.scene.traverse(object => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    geometries.add(object.geometry); skeletons.add(object.skeleton);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  geometries.forEach(geometry => geometry.dispose()); skeletons.forEach(skeleton => skeleton.dispose());
  materials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose());
}

/** Renderer-level cleanup, after per-avatar skeleton disposal. Never call for one actor. */
export function disposeCapybaraAssets(): void {
  characterGeneration++;
  if (characterAsset) disposeCharacterSource(characterAsset);
  characterAsset = null; characterLoading = null; characterAtlasColumns = 16;
  characterMaterials.forEach(material => material.dispose());
}

export type CapybaraExpression = 'neutral' | 'determined' | 'hit' | 'stunned' | 'victory' | 'blink';
const FACE_EXPRESSIONS: readonly CapybaraExpression[] = ['neutral', 'determined', 'hit', 'stunned', 'victory', 'blink'];

/** Explicit emotes and review poses share the same facial blend as combat. */
export function setCapybaraExpression(body: THREE.SkinnedMesh, expression: CapybaraExpression | null): void {
  const runtime = characterInstances.get(body);
  if (runtime) runtime.forcedExpression = expression;
}

/** Authoritative events include armor-only hits and arrive before some snapshots. */
export function reactCapybara(body: THREE.SkinnedMesh, reaction: AvatarReaction): void {
  const runtime = characterInstances.get(body);
  if (!runtime || runtime.deathTime >= 0) return;
  const group = body.parent, yaw = group?.rotation.y || 0;
  const dx = reaction.from ? reaction.from.x - (group?.position.x || 0) : 0;
  const dz = reaction.from ? reaction.from.z - (group?.position.z || 0) : -1;
  const length = Math.hypot(dx, dz) || 1;
  const x = (Math.cos(yaw) * dx - Math.sin(yaw) * dz) / length;
  const z = (Math.sin(yaw) * dx + Math.cos(yaw) * dz) / length;
  runtime.emoteTime = 0;
  if (reaction.kind === 'death') {
    runtime.deathTime = 0; runtime.deathSide = x < 0 ? -1 : 1;
    runtime.hitTime = 0; runtime.expression = 'stunned'; runtime.faceTime = 0;
  } else {
    const strength = Math.min(1, Math.max(.35, reaction.amount / 35));
    runtime.hitTime = .22; runtime.hitX = -z * .07 * strength; runtime.hitZ = x * .07 * strength;
    runtime.expression = 'hit'; runtime.faceTime = .38;
  }
}

export function resetCapybaraPose(body: THREE.SkinnedMesh): void {
  const runtime = characterInstances.get(body);
  if (!runtime) return;
  runtime.hitTime = runtime.faceTime = runtime.emoteTime = 0; runtime.deathTime = -1;
  runtime.gesture = null; runtime.gestureDeadline = runtime.gestureElapsed = runtime.gestureBlend = 0;
  runtime.bounceSeq = null;
  runtime.expression = 'neutral'; runtime.forcedExpression = null;
  for (const action of runtime.faceActions) action?.setEffectiveWeight(0);
  for (const [name, action] of Object.entries(runtime.actions)) if (!name.startsWith('face_')) { action.stop(); action.reset().setEffectiveWeight(name === 'idle' ? 1 : 0).play(); }
  for (const name of Object.keys(runtime.weights)) runtime.weights[name] = name === 'idle' ? 1 : 0;
  runtime.active = 'idle'; runtime.grounded = true; runtime.swimming = false; runtime.swimBlend = 0; runtime.landing = 0;
  runtime.scene.rotation.set(0, 0, 0); runtime.scene.position.set(0, 0, 0);
}

/** Results-only winner celebration. The caller guards match identity. */
export function celebrateCapybara(body: THREE.SkinnedMesh): void {
  const runtime = characterInstances.get(body);
  if (!runtime || runtime.deathTime >= 0) return;
  runtime.emoteTime = 1.8; runtime.expression = 'victory'; runtime.faceTime = 1.8;
}

export function capybaraIsDead(body: THREE.SkinnedMesh): boolean {
  return (characterInstances.get(body)?.deathTime ?? -1) >= 0;
}
export function capybaraCorpseVisible(body: THREE.SkinnedMesh): boolean {
  const time = characterInstances.get(body)?.deathTime ?? -1;
  return time >= 0 && time < 2.4;
}

function installCharacter(body: THREE.SkinnedMesh, legacyBones: THREE.Bone[], color: string): void {
  if (!characterAsset || characterInstances.has(body)) return;
  const scene = cloneSkeleton(characterAsset.scene) as THREE.Group;
  const meshes: THREE.SkinnedMesh[] = [];
  scene.traverse(object => { if (object instanceof THREE.SkinnedMesh) meshes.push(object); });
  meshes.sort((a, b) => a.name.localeCompare(b.name));
  const skeleton = meshes[0].skeleton;
  const lod = new THREE.LOD(); lod.name = 'Capivara_LOD'; scene.add(lod);
  // Quantization uses a scene-wide grid, so all LODs retain one shared skin.
  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    mesh.material = characterMaterial(mesh.material as THREE.MeshStandardMaterial, color);
    if (mesh.skeleton !== skeleton) mesh.skeleton.dispose();
    mesh.skeleton = skeleton;
    lod.addLevel(mesh, [0, 12, 28][i], .1);
  }
  const mixer = new THREE.AnimationMixer(scene);
  const actions: Record<string, THREE.AnimationAction> = {};
  const neutral = characterAsset.animations.find(clip => clip.name === 'face_neutral');
  for (const clip of characterAsset.animations) {
    const facial = clip.name.startsWith('face_') && neutral;
    let playable = facial ? THREE.AnimationUtils.makeClipAdditive(clip.clone(), 0, neutral) : clip;
    if (clip.name === 'reload_tp') {
      playable = clip.clone(); playable.tracks = playable.tracks.filter(track => /arm_|forearm_|paw_/.test(track.name));
      THREE.AnimationUtils.makeClipAdditive(playable, 0, characterAsset.animations.find(action => action.name === 'idle'));
    }
    actions[clip.name] = mixer.clipAction(playable);
    if (facial) actions[clip.name].setEffectiveWeight(0).play();
  }
  for (const name of ['jump', 'boing', 'land', 'death', 'reload_tp']) if (actions[name]) {
    actions[name].setLoop(THREE.LoopOnce, 1); actions[name].clampWhenFinished = true;
  }
  for (const name of EMOTE_IDS) if (actions[name]) {
    actions[name].setLoop(EMOTES[name].loop ? THREE.LoopRepeat : THREE.LoopOnce, EMOTES[name].loop ? Infinity : 1);
    actions[name].clampWhenFinished = !EMOTES[name].loop;
  }
  const weights: Record<string, number> = {}, targets: Record<string, number> = {};
  for (const [name, action] of Object.entries(actions)) if (!name.startsWith('face_')) {
    weights[name] = name === 'idle' ? 1 : 0; targets[name] = 0; action.setEffectiveWeight(weights[name]).play();
  }
  const runtime: CharacterInstance = {
    scene, mixer, actions, weights, targets, grounded: true, swimming: false, swimBlend: 0, landing: 0, crouchOffset: 0,
    gesture: null, gestureDeadline: 0, gestureElapsed: 0, gestureBlend: 0, gestureJoints: {},
    bounceSeq: null,
    spine: scene.getObjectByName('spine') as THREE.Bone | undefined, crown: new THREE.Vector3(0, characterHeadTop, 0), crownScratch: new THREE.Vector3(), faceActions: FACE_EXPRESSIONS.map(name => actions[`face_${name}`]), active: 'idle', expression: 'neutral', forcedExpression: null, faceTime: 0,
    hitTime: 0, hitX: 0, hitZ: 0, deathTime: -1, deathSide: 1, emoteTime: 0, unarmed: 0, elapsed: 0, skeleton, legacyBones, poseBones: [], baseRotations: [], relaxBones: [], relaxedArms: [], armBlends: [],
    head: scene.getObjectByName('head') as THREE.Bone,
    root: scene.getObjectByName('root') as THREE.Bone,
    arms: [scene.getObjectByName('arm_L') as THREE.Bone, scene.getObjectByName('arm_R') as THREE.Bone],
  };
  scene.updateMatrixWorld(true); runtime.head.worldToLocal(runtime.crown);
  // Unarmed rest: the upper arm swings down along the barrel, then the elbow
  // eases open so the paw rests on the belly side instead of a raised bent arm.
  const forearms: THREE.Bone[] = [], relaxedForearms: THREE.Quaternion[] = [];
  for (let i = 0; i < runtime.arms.length; i++) {
    const arm = runtime.arms[i], side = i === 0 ? 'L' : 'R', sign = i === 0 ? -1 : 1;
    const forearm = scene.getObjectByName(`forearm_${side}`), paw = scene.getObjectByName(`paw_${side}`);
    if (!(forearm instanceof THREE.Bone) || !paw) continue;
    const shoulder = arm.getWorldPosition(new THREE.Vector3()), elbow = forearm.getWorldPosition(new THREE.Vector3());
    const hand = paw.getWorldPosition(new THREE.Vector3());
    const elbowTarget = new THREE.Vector3(sign * .297, .944, -.065), handTarget = new THREE.Vector3(sign * .313, .769, -.265);
    const parent = arm.parent!.getWorldQuaternion(new THREE.Quaternion());
    const swing = new THREE.Quaternion().setFromUnitVectors(elbow.clone().sub(shoulder).normalize(), elbowTarget.clone().sub(shoulder).normalize());
    const relaxedArmWorld = swing.clone().multiply(arm.getWorldQuaternion(new THREE.Quaternion()));
    const forearmDirection = hand.clone().sub(elbow).applyQuaternion(swing).normalize();
    const open = new THREE.Quaternion().setFromUnitVectors(forearmDirection, handTarget.clone().sub(elbowTarget).normalize());
    runtime.relaxBones.push(arm); runtime.relaxedArms.push(parent.clone().invert().multiply(swing).multiply(parent));
    forearms.push(forearm); relaxedForearms.push(relaxedArmWorld.clone().invert().multiply(open).multiply(relaxedArmWorld));
  }
  runtime.relaxBones.push(...forearms); runtime.relaxedArms.push(...relaxedForearms);
  runtime.armBlends = runtime.relaxBones.map(() => new THREE.Quaternion());
  for (const name of ['forearm_L', 'forearm_R', 'paw_L', 'paw_R', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'foot_L', 'foot_R'] as const) {
    const bone = scene.getObjectByName(name);
    if (bone instanceof THREE.Bone) runtime.gestureJoints[name] = bone;
  }
  runtime.poseBones = [...new Set([runtime.head, runtime.root, ...runtime.arms, ...forearms, ...Object.values(runtime.gestureJoints)])];
  runtime.baseRotations = runtime.poseBones.map(bone => bone.quaternion.clone());
  characterInstances.set(body, runtime);
  // Keep the old skeleton as the compatibility weapon socket; only its mesh goes.
  body.add(scene);
  body.name = 'Capivara_v3';
  const overlay = typeof location !== 'undefined' && new URLSearchParams(location.search).has('capyHitboxes') ? createCapybaraHitboxOverlay() : null;
  if (overlay) body.add(overlay);
  const originalDispose = body.skeleton.dispose.bind(body.skeleton);
  body.skeleton.dispose = () => {
    mixer.stopAllAction(); mixer.uncacheRoot(scene); skeleton.dispose();
    body.geometry.dispose(); characterInstances.delete(body); originalDispose();
    overlay?.traverse(object => {
      if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); }
    });
  };
}

export function createCapybaraHitboxOverlay(): THREE.Group {
  const group = new THREE.Group(); group.name = 'Hitboxes_normais';
  const head = new THREE.Mesh(new THREE.SphereGeometry(.25, 20, 12), new THREE.MeshBasicMaterial({ color: '#ff427b', wireframe: true, depthTest: false, transparent: true, opacity: .55 }));
  head.position.set(0, 1.6, -.04);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, 1.42, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#46e8ff', wireframe: true, depthTest: false, transparent: true, opacity: .4 }));
  body.position.y = .71;
  group.add(head, body); return group;
}

/** Animate the loaded rig without allocating per update. */
export function updateCapybaraBody(body: THREE.SkinnedMesh, actor: ActorState, dt: number, simulationTime = 0): boolean {
  const runtime = characterInstances.get(body);
  if (!runtime) return false;
  const { mixer, actions, head, root, arms, legacyBones } = runtime;
  const speed = Math.hypot(actor.velocity.x, actor.velocity.z);
  const dead = runtime.deathTime >= 0;
  const step = Math.max(0, Math.min(dt, .1));
  const bouncing = !!actions.boing && !dead && !actor.swimming && actor.stage === 'ground' &&
    !actor.grounded && actor.bounceProtected && actor.velocity.y > 0;
  if (bouncing && runtime.bounceSeq !== actor.bounceSeq) {
    runtime.bounceSeq = actor.bounceSeq;
    const clip = actions.boing;
    clip.reset().play();
    // A remote capy may first appear halfway up. Enter the matching part of
    // the rise instead of replaying its tuck at the apex. Never change physics.
    clip.time = Math.min(clip.getClip().duration, .55 * THREE.MathUtils.clamp(1 - actor.velocity.y / TRAMPOLINE_IMPULSE, 0, 1));
  }
  const gesture = !dead && !actor.swimming && actor.grounded && actor.stage === 'ground' && actor.emoteUntil > simulationTime ? actor.emote : null;
  if (gesture && (gesture !== runtime.gesture || actor.emoteUntil !== runtime.gestureDeadline)) {
    runtime.gesture = gesture; runtime.gestureDeadline = actor.emoteUntil;
    runtime.gestureElapsed = Math.max(0, EMOTES[gesture].duration - (actor.emoteUntil - simulationTime));
    const clip = actions[gesture];
    if (clip) {
      clip.reset().play();
      const rate = EMOTES[gesture].loop ? 1 : clip.getClip().duration / EMOTES[gesture].duration;
      clip.setEffectiveTimeScale(rate); clip.time = runtime.gestureElapsed * rate;
    }
  }
  runtime.gestureElapsed += step;
  runtime.gestureBlend = THREE.MathUtils.damp(runtime.gestureBlend, gesture ? 1 : 0, 14, step);
  const targets = runtime.targets;
  for (const name of Object.keys(targets)) targets[name] = 0;
  const weight = (name: string, amount: number, fallback = 'run') => {
    const available = actions[name] ? name : actions[fallback] ? fallback : 'idle';
    targets[available] += amount;
  };
  if (dead) {
    weight('death', 1, 'idle');
    if (runtime.active !== 'death' && actions.death) actions.death.reset().play();
    runtime.active = 'death';
  } else if (gesture) {
    weight(gesture, 1, gesture === 'sit' || gesture === 'chill' ? 'crouch_idle' : 'idle'); runtime.landing = 0;
  } else if (actor.swimming) { weight('idle', 1); runtime.landing = 0; }
  else if (runtime.emoteTime > 0) weight('idle', 1);
  else if (actor.stage !== 'ground' || !actor.grounded) {
    const airborne = bouncing ? 'boing' : actor.velocity.y < (actor.bounceProtected && actions.boing ? 0 : -.15) ? 'fall' : 'jump';
    weight(airborne, 1, 'jump');
    if (runtime.grounded && airborne !== 'boing') actions[actions[airborne] ? airborne : 'jump'].reset().play();
  } else {
    if (!runtime.grounded && !runtime.swimming && actions.land) { runtime.landing = .24; actions.land.reset().play(); }
    const moving = THREE.MathUtils.smoothstep(speed, .05, .35);
    if (actor.crouch) { weight('crouch_idle', 1 - moving, 'idle'); weight('crouch_walk', moving); }
    else {
      weight('idle', 1 - moving);
      const run = THREE.MathUtils.smoothstep(speed, 3.9, 6.4), walking = moving * (1 - run);
      const x = Math.cos(actor.yaw) * actor.velocity.x - Math.sin(actor.yaw) * actor.velocity.z;
      const forward = -Math.sin(actor.yaw) * actor.velocity.x - Math.cos(actor.yaw) * actor.velocity.z;
      const total = Math.abs(x) + Math.abs(forward) || 1;
      weight(x < 0 ? 'strafe_l' : 'strafe_r', walking * Math.abs(x) / total);
      weight(forward < 0 ? 'backpedal' : 'walk', walking * Math.abs(forward) / total);
      weight('run', moving * run);
    }
    if (runtime.landing > 0 && actions.land) {
      const landing = runtime.landing / .24 * .65;
      for (const name of Object.keys(targets)) targets[name] *= 1 - landing;
      targets.land = landing; runtime.landing = Math.max(0, runtime.landing - step);
    }
  }
  runtime.grounded = actor.grounded;
  runtime.swimming = actor.swimming;
  runtime.swimBlend = THREE.MathUtils.damp(runtime.swimBlend, actor.swimming && !dead ? 1 : 0, 9, step);
  for (const [name, action] of Object.entries(actions)) if (!name.startsWith('face_') && name !== 'reload_tp') {
    const target = targets[name] || 0;
    if (target > 0 && runtime.weights[name] < .001 && name !== 'death' && name !== 'land' && name !== 'boing' && name !== gesture) action.reset().play();
    runtime.weights[name] = THREE.MathUtils.damp(runtime.weights[name], target, 18, step);
    action.setEffectiveWeight(runtime.weights[name]);
    const nominal = name === 'run' ? 6.4 : name === 'crouch_walk' ? 2.1 : ['walk', 'backpedal', 'strafe_l', 'strafe_r'].includes(name) ? 3.9 : 0;
    if (nominal) action.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / nominal, .18, 1.8));
  }
  const reload = actions.reload_tp, held = actor.weapons[actor.slot];
  if (reload) {
    const active = !dead && !bouncing && !!held && actor.reloadUntil > simulationTime;
    reload.setEffectiveWeight(THREE.MathUtils.damp(reload.getEffectiveWeight(), active ? 1 : 0, 20, step));
    reload.paused = true;
    if (active) reload.time = reload.getClip().duration * THREE.MathUtils.clamp(1 - (actor.reloadUntil - simulationTime) / (WEAPONS[held.id].reload || 1), 0, 1);
  }
  for (let i = 0; i < runtime.poseBones.length; i++) runtime.poseBones[i].quaternion.copy(runtime.baseRotations[i]);
  if (runtime.spine) runtime.spine.position.y += runtime.crouchOffset;
  runtime.faceTime = Math.max(0, runtime.faceTime - step);
  runtime.hitTime = Math.max(0, runtime.hitTime - step);
  runtime.emoteTime = Math.max(0, runtime.emoteTime - step);
  if (dead) { runtime.deathTime += step; runtime.expression = 'stunned'; }
  else if (!runtime.faceTime) runtime.expression = bouncing || gesture === 'wave' || gesture === 'dance' || gesture === 'victory' ? 'victory' : actor.ads ? 'determined' : 'neutral';
  const expression = runtime.forcedExpression || runtime.expression;
  for (let i = 0; i < FACE_EXPRESSIONS.length; i++) {
    const action = runtime.faceActions[i];
    if (action) action.setEffectiveWeight(THREE.MathUtils.damp(action.getEffectiveWeight(), expression === FACE_EXPRESSIONS[i] ? 1 : 0, 24, step));
  }
  runtime.elapsed += step; mixer.update(step);
  const heldRig = holdRigs.get(body);
  if (heldRig) { heldRig.R.fingers.apply(RELAXED_PAW); heldRig.L.fingers.apply(RELAXED_PAW); }
  // Deepen the upper-body crouch to the existing head volume while leaving
  // authored feet, limb lengths and the whole-avatar scale intact.
  runtime.crouchOffset = THREE.MathUtils.damp(runtime.crouchOffset, !dead && !bouncing && actor.crouch && actions.crouch_idle && !(gesture && actions[gesture]) ? .29 : 0, 18, step);
  if (runtime.spine) runtime.spine.position.y -= runtime.crouchOffset;
  for (let i = 0; i < runtime.poseBones.length; i++) runtime.baseRotations[i].copy(runtime.poseBones[i].quaternion);
  const bounceWeight = runtime.weights.boing || 0;
  const pitch = dead || gesture ? 0 : THREE.MathUtils.clamp(actor.pitch, -1, 1) * (1 - bounceWeight);
  head.rotateX(pitch * .45);
  const resting = dead || runtime.emoteTime > 0 || (gesture && !actions[gesture]) || (!actor.weapons[actor.slot] && actor.stage === 'ground' && !actor.swimming);
  runtime.unarmed = THREE.MathUtils.damp(runtime.unarmed, resting ? 1 - bounceWeight : 0, 12, step);
  // Compact resting arms without changing the authored combat reach or sockets.
  for (const arm of arms) arm.scale.setScalar(1 - .05 * runtime.unarmed);
  for (let i = 0; i < arms.length; i++) arms[i].rotateX((pitch * .65 + (actor.sprint ? -.18 : 0)) * (1 - runtime.unarmed));
  // Swing into the side-of-hip rest target in parent space, avoiding hands
  // buried in the belly when rotating only around the upper-arm local X axis.
  for (let i = 0; i < runtime.relaxBones.length; i++) {
    runtime.armBlends[i].identity().slerp(runtime.relaxedArms[i], runtime.unarmed);
    runtime.relaxBones[i].quaternion.premultiply(runtime.armBlends[i]);
  }
  legacyBones[CAPY_BONES.arms].rotation.x = pitch + (actor.sprint ? -.18 : 0);
  legacyBones[CAPY_BONES.arms].position.y = legacyBones[CAPY_BONES.arms].userData.rest.y + runtime.swimBlend * .22;
  runtime.scene.rotation.set(0, 0, 0); runtime.scene.position.set(0, 0, 0);
  // Tread around the shared floating root. The head remains in its hit volume;
  // the free paw sculls while the weapon paw stays above the surface.
  if (runtime.swimBlend > .001) {
    const swim = runtime.swimBlend, stroke = runtime.elapsed * (2.8 + Math.min(speed, 2.5) * .7);
    root.rotateX(swim * .07); head.rotateX(-swim * .07);
    runtime.scene.position.y = Math.sin(runtime.elapsed * 2.1) * .012 * swim;
    arms[0].rotateX(swim * (.25 + Math.sin(stroke) * .24));
    arms[0].rotateZ(swim * (.45 + Math.cos(stroke) * .2));
    arms[1].rotateX(swim * (held ? -.25 : .25 - Math.sin(stroke) * .24));
    if (!held) arms[1].rotateZ(-swim * (.45 - Math.cos(stroke) * .2));
  }
  if (actor.stage === 'falling') {
    runtime.scene.rotation.x = -1.25;
    runtime.scene.position.set(0, .9 * (1 - Math.cos(-1.25)), -.9 * Math.sin(-1.25));
  } else if (actor.stage === 'parachute') {
    for (const arm of arms) arm.rotateX(2.4);
    root.rotation.z += Math.sin(runtime.elapsed * 2.2) * .025;
  }
  if (runtime.hitTime > 0) {
    const recoil = Math.sin(Math.PI * runtime.hitTime / .22);
    head.rotateX(runtime.hitX * recoil); head.rotateZ(runtime.hitZ * recoil);
  }
  if (runtime.emoteTime > 0) {
    const time = 1.8 - runtime.emoteTime;
    const weight = THREE.MathUtils.smoothstep(time, 0, .2) * THREE.MathUtils.smoothstep(runtime.emoteTime, 0, .25);
    for (let i = 0; i < arms.length; i++) arms[i].rotateZ((i === 0 ? 1 : -1) * weight * (1.1 + .12 * Math.sin(time * 9)));
  }
  if (!dead && runtime.gesture && !actions[runtime.gesture] && runtime.gestureBlend > .001) {
    const g = runtime.gesture, t = runtime.gestureElapsed, w = runtime.gestureBlend, joints = runtime.gestureJoints;
    if (g === 'wave') {
      arms[1].rotateZ(-1.55 * w); joints.forearm_R?.rotateX(-.35 * w);
      joints.paw_R?.rotateZ(Math.sin(t * 8) * .28 * w); head.rotateZ(Math.sin(t * 3) * .035 * w);
    } else if (g === 'victory') {
      const cheer = .5 + .5 * Math.sin(t * 5);
      for (let i = 0; i < arms.length; i++) arms[i].rotateZ((i === 0 ? 1 : -1) * (1.5 + cheer * .23) * w);
      head.rotateX(-.07 * w); root.rotateZ(Math.sin(t * 2.5) * .035 * w);
    } else if (g === 'dance') {
      const beat = Math.sin(t * Math.PI * 3), sway = Math.sin(t * Math.PI * 1.5);
      root.rotateZ(sway * .065 * w); head.rotateZ(-sway * .08 * w);
      for (let i = 0; i < arms.length; i++) {
        const sign = i === 0 ? 1 : -1, side = i === 0 ? 'L' : 'R';
        arms[i].rotateZ(sign * (.38 + beat * .22) * w); arms[i].rotateX(sign * sway * .2 * w);
        joints[`thigh_${side}`]?.rotateX(sign * beat * .14 * w);
        joints[`shin_${side}`]?.rotateX(-Math.max(0, sign * beat) * .2 * w);
        joints[`foot_${side}`]?.rotateX((-sign * beat * .14 + Math.max(0, sign * beat) * .2) * w);
      }
      runtime.scene.position.y += Math.abs(beat) * .022 * w;
    } else {
      // Crouch_idle supplies a grounded seated-height fallback until the
      // authored sit/chill clips arrive. Never shrink the rig or move its root.
      head.rotateX((g === 'chill' ? -.08 : .025) * w);
      head.rotateZ((g === 'chill' ? .10 : Math.sin(t * 1.5) * .02) * w);
      arms[0].rotateX(.22 * w); arms[1].rotateX((g === 'chill' ? .4 : .22) * w);
      joints.forearm_L?.rotateX(-.25 * w); joints.forearm_R?.rotateX(-.25 * w);
    }
  }
  if (dead && !actions.death) {
    // A soft side flop around the feet, then a small settling bounce. No blood.
    const fall = THREE.MathUtils.smoothstep(runtime.deathTime, 0, .65);
    const settle = runtime.deathTime > .65 ? Math.sin((runtime.deathTime - .65) * 16) * Math.exp(-(runtime.deathTime - .65) * 8) * .04 : 0;
    runtime.scene.rotation.set(0, 0, runtime.deathSide * (fall * 1.48 + settle));
    runtime.scene.position.set(0, fall * .31, 0);
    for (let i = 0; i < arms.length; i++) arms[i].rotateZ((i === 0 ? -1 : 1) * fall * .3);
  }
  return true;
}

/** Follow the posed crown without a per-frame skinned-vertex bounds scan. */
export function capybaraCrownHeight(body: THREE.SkinnedMesh): number {
  const runtime = characterInstances.get(body);
  if (!runtime) return characterHeadTop;
  runtime.head.updateWorldMatrix(true, false);
  runtime.crownScratch.copy(runtime.crown); runtime.head.localToWorld(runtime.crownScratch);
  return body.worldToLocal(runtime.crownScratch).y;
}

// Third-person weapon handling. The gun is placed against the chest (rifles at
// the right shoulder, pistols out in both paws) in the spine's frame, so body
// lean and gait carry it; both arms then reach its first-person grips by IK.
// Aim pitch, sprint carry and a short reload are posed here, procedurally.
const ikA = new THREE.Vector3(), ikB = new THREE.Vector3(), ikC = new THREE.Vector3(), ikT = new THREE.Vector3(), ikE = new THREE.Vector3();
const ikQ = new THREE.Quaternion(), ikQ2 = new THREE.Quaternion(), ikD = new THREE.Vector3(), ikD2 = new THREE.Vector3();
const holdMatrix = new THREE.Matrix4(), holdQuat = new THREE.Quaternion(), holdEuler = new THREE.Euler(0, 0, 0, 'YXZ'), holdPos = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1), ikMatrix = new THREE.Matrix4();
function aimBone(bone: THREE.Bone, from: THREE.Vector3, to: THREE.Vector3, want: THREE.Vector3) {
  ikD.subVectors(to, from).normalize(); ikD2.subVectors(want, from).normalize();
  if (ikD.dot(ikD2) > .99999) return;
  ikQ.setFromUnitVectors(ikD, ikD2);
  bone.getWorldQuaternion(ikQ2); ikQ2.premultiply(ikQ);
  bone.parent!.getWorldQuaternion(ikQ).invert();
  bone.quaternion.copy(ikQ).multiply(ikQ2);
  bone.updateMatrixWorld(true);
}
interface ArmChain { upper: THREE.Bone; fore: THREE.Bone; twist?: THREE.Bone; twistBind?: THREE.Quaternion; restAxis: THREE.Vector3; paw: THREE.Bone; pawBind: THREE.Quaternion; fingers: PawPose }
function reachArm(arm: ArmChain, target: THREE.Vector3, pole: THREE.Vector3, gun: THREE.Quaternion, grip: GripSpec) {
  arm.upper.getWorldPosition(ikA); arm.fore.getWorldPosition(ikB); arm.paw.getWorldPosition(ikC);
  const l1 = ikA.distanceTo(ikB), l2 = ikB.distanceTo(ikC);
  const dir = ikE.subVectors(target, ikA), distance = dir.length(), reach = Math.min(distance, (l1 + l2) * .999);
  dir.divideScalar(Math.max(distance, 1e-6));
  const cos = THREE.MathUtils.clamp((l1 * l1 + reach * reach - l2 * l2) / (2 * l1 * reach), -1, 1);
  const bend = ikD2.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
  const elbow = holdPos.copy(ikA).addScaledVector(dir, l1 * cos).addScaledVector(bend, l1 * Math.sqrt(1 - cos * cos));
  aimBone(arm.upper, ikA, ikB, elbow);
  arm.fore.getWorldPosition(ikB); arm.paw.getWorldPosition(ikC);
  aimBone(arm.fore, ikB, ikC, target);
  // Use the same wrist-to-knuckle direction and palm contact as the viewmodel.
  const forward = new THREE.Vector3().fromArray(grip.forward).normalize();
  const palm = new THREE.Vector3().fromArray(grip.palm).addScaledVector(forward, -forward.dot(new THREE.Vector3().fromArray(grip.palm))).normalize();
  if (arm.twist && arm.twistBind) {
    const axis = new THREE.Vector3().subVectors(target, ikB).normalize();
    const side = new THREE.Vector3().crossVectors(forward, palm).applyQuaternion(gun);
    side.addScaledVector(axis, -side.dot(axis)).normalize();
    const restSide = new THREE.Vector3(-1, 0, 0).addScaledVector(arm.restAxis, arm.restAxis.x).normalize();
    const desired = new THREE.Matrix4().makeBasis(axis, side, new THREE.Vector3().crossVectors(axis, side));
    const rest = new THREE.Matrix4().makeBasis(arm.restAxis, restSide, new THREE.Vector3().crossVectors(arm.restAxis, restSide));
    const world = new THREE.Quaternion().setFromRotationMatrix(desired.multiply(rest.invert())).multiply(arm.twistBind);
    const proximal = arm.fore.getWorldQuaternion(new THREE.Quaternion()).slerp(world, .5);
    arm.fore.parent!.getWorldQuaternion(ikQ).invert(); arm.fore.quaternion.copy(ikQ).multiply(proximal); arm.fore.updateMatrixWorld(true);
    arm.twist.parent!.getWorldQuaternion(ikQ).invert(); arm.twist.quaternion.copy(ikQ).multiply(world); arm.twist.updateMatrixWorld(true);
  }
  const targetFrame = new THREE.Matrix4().makeBasis(forward, palm, new THREE.Vector3().crossVectors(forward, palm));
  const restFrame = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0), new THREE.Vector3(-1, 0, 0));
  ikQ2.setFromRotationMatrix(targetFrame.multiply(restFrame.invert())).premultiply(gun).multiply(arm.pawBind);
  arm.paw.parent!.getWorldQuaternion(ikQ).invert();
  arm.paw.quaternion.copy(ikQ).multiply(ikQ2);
  arm.fingers.apply(grip.curl);
  arm.paw.updateMatrixWorld(true);
}
type HoldClass = 'rifle' | 'pistol' | 'melee';
const HOLD_CLASS: Record<WeaponId, HoldClass> = { pistol: 'pistol', revolver: 'pistol', smg: 'rifle', m4: 'rifle', shotgun: 'rifle', dmr: 'rifle', sniper: 'rifle', coco: 'rifle', machete: 'melee' };
// Gun origin (the firing paw's web) in character space at rest, and its extra yaw/roll.
const HOLD_POSE: Record<HoldClass, { pos: readonly [number, number, number]; yaw: number; roll: number }> = {
  rifle: { pos: [.12, 1.17, -.345], yaw: .06, roll: 0 },
  pistol: { pos: [.03, 1.22, -.40], yaw: 0, roll: 0 },
  melee: { pos: [.3, .98, -.2], yaw: 0, roll: 0 },
};
interface HoldRig { spine: THREE.Bone; charQuat: THREE.Quaternion; R: ArmChain; L: ArmChain; reloadEnd: number; reloadEmpty: boolean; sample: ChoreoSample }
const RELAXED_PAW: HandCurl = { index: [.12, .18, .1], middle: [.18, .22, .1], ring: [.2, .25, .1], thumb: [.18, .12, .06] };
const holdRigs = new WeakMap<THREE.SkinnedMesh, HoldRig>();
const worldCut = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, smear: 0, kick: 0 };
const FREE_MELEE_PAW: GripSpec = { wrist: [-.24, 1.10, -.24], forward: [.18, .12, -1], palm: [.2, -.95, -.05], curl: RELAXED_PAW, pole: [-.8, -1, .1] };
export function holdWeapon(body: THREE.SkinnedMesh, weapon: THREE.Object3D, actor: ActorState, simulationTime: number,
  strike?: { time: number; side: number; heavy: boolean }): void {
  const runtime = characterInstances.get(body);
  if (!runtime) return;
  let rig = holdRigs.get(body);
  if (!rig) {
    const bone = (name: string) => runtime.scene.getObjectByName(name) as THREE.Bone;
    const bind = (b: THREE.Bone) => runtime.skeleton.boneInverses[runtime.skeleton.bones.indexOf(b)].clone().invert();
    const spine = bone('spine'); if (!spine) return;
    const chain = (side: 'L' | 'R'): ArmChain => {
      const paw = bone(`paw_${side}`);
      const fore = bone(`forearm_${side}`), twist = bone(`forearm_twist_${side}`);
      // Mesh quantization is folded into inverse bind matrices. Strip its scale
      // before extracting rotations; otherwise a "quaternion" stretches IK.
      const rotation = (joint: THREE.Bone) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(bind(joint)));
      return { upper: bone(`arm_${side}`), fore, twist, twistBind: twist ? rotation(twist) : undefined,
        restAxis: new THREE.Vector3().setFromMatrixPosition(bind(paw)).sub(new THREE.Vector3().setFromMatrixPosition(bind(fore))).normalize(),
        paw, pawBind: rotation(paw), fingers: new PawPose(runtime.scene, side, 'paw_', runtime.skeleton) };
    };
    rig = { spine, charQuat: new THREE.Quaternion(), R: chain('R'), L: chain('L'), reloadEnd: 0, reloadEmpty: false, sample: newSample() };
    holdRigs.set(body, rig);
  }
  if (weapon.parent !== rig.spine) rig.spine.add(weapon);
  const id = actor.weapons[actor.slot]?.id;
  if (!id || !actor.alive || actor.stage !== 'ground' || (actor.emote && actor.emoteUntil > simulationTime)) return;
  const hold = HOLD_CLASS[id], pose = HOLD_POSE[hold], grips = VIEW_SPECS[id].grips;
  // Aim, sprint carry and reload tilt, all about the shoulders.
  const pitch = THREE.MathUtils.clamp(actor.pitch, -1, 1) * .85;
  const sprint = actor.sprint && !actor.swimming ? 1 : 0;
  const reload = actor.reloadUntil > simulationTime ? 1 - (actor.reloadUntil - simulationTime) / Math.max(.3, WEAPONS[id].reload || 1) : -1;
  if (reload < 0) rig.reloadEnd = 0;
  if (reload >= 0 && actor.reloadUntil !== rig.reloadEnd) { rig.reloadEnd = actor.reloadUntil; rig.reloadEmpty = actor.weapons[actor.slot]!.ammo === 0; }
  const short = isShortGun(id), parts = weapon.userData.shortParts as WorldParts | undefined;
  const keys = short ? shortReload(id, rig.reloadEmpty) : id === 'm4' ? m4Reload(rig.reloadEmpty) : null;
  const sample = keys && reload >= 0 ? sampleChoreo(keys, reload, rig.sample) : null;
  const tilt = reload >= 0 && !keys ? Math.sin(Math.PI * THREE.MathUtils.clamp(reload, 0, 1)) : 0;
  const lowReady = sprint * (hold === 'pistol' ? .9 : .55);
  holdEuler.set(pitch - lowReady + tilt * .25, pose.yaw + sprint * (hold === 'rifle' ? .55 : .2) + tilt * .25, pose.roll - tilt * (hold === 'pistol' ? .5 : .7), 'YXZ');
  const cutting = id === 'machete' && strike && strike.time < MELEE_SECONDS;
  if (cutting) {
    if (strike.heavy) sampleHeavyMelee(strike.time, worldCut); else sampleMelee(strike.time, strike.side, worldCut);
    holdEuler.x -= worldCut.pitch * 1.5; holdEuler.y += worldCut.yaw * 1.4; holdEuler.z += worldCut.roll * .65;
  }
  if (sample) { holdEuler.x += sample.r.x * .8; holdEuler.y += sample.r.y * .8; holdEuler.z += sample.r.z * .8; }
  holdQuat.setFromEuler(holdEuler);
  // Pivot at shoulder height so aiming swings the muzzle, not the stock.
  const pivot = ikT.set(.08, 1.22, 0);
  holdPos.set(pose.pos[0], pose.pos[1], pose.pos[2]).sub(pivot).applyQuaternion(holdQuat).add(pivot);
  holdPos.y -= sprint * .06 + tilt * .05; holdPos.x -= sprint * (hold === 'rifle' ? .06 : 0);
  if (sample) holdPos.addScaledVector(sample.p, .55);
  if (cutting) { holdPos.x += worldCut.x * .6; holdPos.y += worldCut.y * .6; holdPos.z += worldCut.z * .6; }
  // Character frame -> world, then into the spine's current frame. The chest's
  // own bob and crouch (the spine's height above its rest) carry the gun.
  const character = body.parent ?? body;
  character.updateWorldMatrix(true, false); rig.spine.updateWorldMatrix(true, false);
  const spineY = character.worldToLocal(rig.spine.getWorldPosition(ikB)).y;
  holdPos.y += spineY - .6;
  holdMatrix.compose(holdPos, holdQuat, ONE).premultiply(character.matrixWorld).premultiply(ikMatrix.copy(rig.spine.matrixWorld).invert());
  holdMatrix.decompose(weapon.position, weapon.quaternion, weapon.scale);
  weapon.updateWorldMatrix(true, false);
  if (short && parts) animateShortWorld(id, parts, sample, actor.weapons[actor.slot]!.ammo, weapon.userData.shortPartsVisible);
  const magazine = weapon.getObjectByName('m4_mag');
  if (magazine && sample?.mag) {
    const m = sample.mag;
    // Same contact phases, shorter travel into the character's belt pouch.
    magazine.position.set(0, .02, -.071).addScaledVector(new THREE.Vector3(0, -.993, -.119), m.out * .52).addScaledVector(m.p, .42);
    magazine.quaternion.setFromEuler(new THREE.Euler(m.r.x, m.r.y, m.r.z));
    magazine.visible &&= m.visible; magazine.updateWorldMatrix(true, false);
  }
  const gunQuat = weapon.getWorldQuaternion(ikQ2.clone());
  // Poles: elbows drop down and out to each side (in the character's frame).
  body.parent?.getWorldQuaternion(rig.charQuat);
  const poleR = ikD.set(.8, -1, .3).normalize().applyQuaternion(rig.charQuat).clone();
  const poleL = ikD.set(-.8, -1, .2).normalize().applyQuaternion(rig.charQuat).clone();
  const target = (grip: { wrist: readonly number[] }) => new THREE.Vector3(grip.wrist[0], grip.wrist[1], grip.wrist[2]).applyMatrix4(weapon.matrixWorld);
  if (short && parts) {
    const right = shortWorldGrip(grips.R, sample?.R ?? null, parts, weapon, character);
    reachArm(rig.R, target(right), poleR, gunQuat, right);
    if (grips.L) { const left = shortWorldGrip(grips.L, sample?.L ?? null, parts, weapon, character); reachArm(rig.L, target(left), poleL, gunQuat, left); }
    return;
  }
  reachArm(rig.R, target(grips.R), poleR, gunQuat, grips.R);
  if (!grips.L) return;
  if (id === 'machete') {
    const free = new THREE.Vector3().fromArray(FREE_MELEE_PAW.wrist).applyMatrix4(character.matrixWorld);
    reachArm(rig.L, free, poleL, rig.charQuat, FREE_MELEE_PAW);
    return;
  }
  let leftGrip = grips.L;
  if (sample?.L && magazine) {
    const resolve = (key: HandKey): GripSpec => {
      if (key.space === 'grip') return grips.L!;
      const wrist = new THREE.Vector3().fromArray(key.wrist ?? grips.L!.wrist);
      const forward = new THREE.Vector3().fromArray(key.forward ?? grips.L!.forward);
      const palm = new THREE.Vector3().fromArray(key.palm ?? grips.L!.palm);
      if (key.space === 'part') {
        wrist.applyQuaternion(magazine.quaternion).add(magazine.position);
        forward.applyQuaternion(magazine.quaternion); palm.applyQuaternion(magazine.quaternion);
      }
      return { wrist: wrist.toArray(), forward: forward.toArray(), palm: palm.toArray(), curl: { ...grips.L!.curl, ...key.curl }, pole: grips.L!.pole };
    };
    const a = resolve(sample.L.a), b = resolve(sample.L.b), u = sample.L.u;
    const mix = (v: readonly number[], w: readonly number[]) => new THREE.Vector3().fromArray(v).lerp(new THREE.Vector3().fromArray(w), u).toArray();
    const curl = blendCurl(a.curl, b.curl, u);
    leftGrip = { wrist: mix(a.wrist, b.wrist), forward: mix(a.forward, b.forward), palm: mix(a.palm, b.palm), curl, pole: grips.L.pole };
  }
  const support = target(leftGrip);
  if (tilt > 0) {
    // The support paw drops to the belt for a fresh magazine and comes back.
    const fetch = Math.sin(Math.PI * THREE.MathUtils.clamp((reload - .15) / .6, 0, 1));
    const belt = ikE.set(-.18, .85, -.12).applyQuaternion(rig.charQuat).add(body.getWorldPosition(new THREE.Vector3()));
    support.lerp(belt, fetch);
  }
  reachArm(rig.L, support, poleL, gunQuat, leftGrip);
}
