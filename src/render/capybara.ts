import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { WEAPONS } from '../shared/weapons';
import type { ActorState } from '../shared/types';
import type { AvatarReaction } from './effects';
import palette from './capybara-palette.json';
import { applyCharacterStyle } from './materials';
import { createPaintedCharacterAtlas } from './character-atlas';

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
let characterLoading: Promise<void> | null = null;
let characterGeneration = 0;
const characterInstances = new WeakMap<THREE.SkinnedMesh, CharacterInstance>();
const characterMaterials = new Map<string, THREE.MeshStandardMaterial>();

function shadeBandana(color: THREE.Color): THREE.Color {
  const base = new THREE.Color('#1FB5A8'), shade = new THREE.Color('#12877E');
  return color.clone().multiply(new THREE.Color(shade.r / base.r, shade.g / base.g, shade.b / base.b));
}

function characterMaterial(source: THREE.MeshStandardMaterial, color: string): THREE.MeshStandardMaterial {
  const tint = new THREE.Color(color), key = `${source.uuid}:${tint.getHexString()}`;
  const cached = characterMaterials.get(key);
  if (cached) return cached;
  // The same authored atlas drives Blender and runtime. Only bandana colours change.
  const colors = palette.map(hex => parseInt(hex, 16));
  colors[5] = tint.getHex(); colors[6] = shadeBandana(tint).getHex();
  let atlas: THREE.DataTexture;
  if (characterAtlasColumns === 4) atlas = createPaintedCharacterAtlas(colors);
  else {
    const pixels = new Uint8Array(16 * 16 * 4);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const hex = colors[x], offset = (y * 16 + x) * 4;
      pixels.set([hex >> 16 & 255, hex >> 8 & 255, hex & 255, 255], offset);
    }
    atlas = new THREE.DataTexture(pixels, 16, 16);
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.magFilter = atlas.minFilter = THREE.NearestFilter;
    atlas.generateMipmaps = false; atlas.needsUpdate = true;
  }
  const material = applyCharacterStyle(source.clone(), characterAtlasColumns); material.map = atlas;
  material.name = `Capivara_bandana_${tint.getHexString()}`;
  material.addEventListener('dispose', () => { atlas.dispose(); characterMaterials.delete(key); });
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
  runtime.expression = 'neutral'; runtime.forcedExpression = null;
  for (const action of runtime.faceActions) action?.setEffectiveWeight(0);
  for (const [name, action] of Object.entries(runtime.actions)) if (!name.startsWith('face_')) { action.stop(); action.reset().setEffectiveWeight(name === 'idle' ? 1 : 0).play(); }
  for (const name of Object.keys(runtime.weights)) runtime.weights[name] = name === 'idle' ? 1 : 0;
  runtime.active = 'idle'; runtime.grounded = true; runtime.landing = 0;
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
  for (const name of ['jump', 'land', 'death', 'reload_tp']) if (actions[name]) {
    actions[name].setLoop(THREE.LoopOnce, 1); actions[name].clampWhenFinished = true;
  }
  const weights: Record<string, number> = {}, targets: Record<string, number> = {};
  for (const [name, action] of Object.entries(actions)) if (!name.startsWith('face_')) {
    weights[name] = name === 'idle' ? 1 : 0; targets[name] = 0; action.setEffectiveWeight(weights[name]).play();
  }
  const runtime: CharacterInstance = {
    scene, mixer, actions, weights, targets, grounded: true, swimming: false, swimBlend: 0, landing: 0, crouchOffset: 0,
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
  runtime.poseBones = [runtime.head, runtime.root, ...runtime.arms, ...forearms];
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
  } else if (actor.swimming) { weight('idle', 1); runtime.landing = 0; }
  else if (runtime.emoteTime > 0) weight('idle', 1);
  else if (actor.stage !== 'ground' || !actor.grounded) {
    const airborne = actor.velocity.y < -.15 ? 'fall' : 'jump';
    weight(airborne, 1, 'jump');
    if (runtime.grounded) actions[actions[airborne] ? airborne : 'jump'].reset().play();
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
    if (target > 0 && runtime.weights[name] < .001 && name !== 'death' && name !== 'land') action.reset().play();
    runtime.weights[name] = THREE.MathUtils.damp(runtime.weights[name], target, 18, step);
    action.setEffectiveWeight(runtime.weights[name]);
    const nominal = name === 'run' ? 6.4 : name === 'crouch_walk' ? 2.1 : ['walk', 'backpedal', 'strafe_l', 'strafe_r'].includes(name) ? 3.9 : 0;
    if (nominal) action.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / nominal, .18, 1.8));
  }
  const reload = actions.reload_tp, held = actor.weapons[actor.slot];
  if (reload) {
    const active = !dead && !!held && actor.reloadUntil > simulationTime;
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
  else if (!runtime.faceTime) runtime.expression = actor.ads ? 'determined' : 'neutral';
  const expression = runtime.forcedExpression || runtime.expression;
  for (let i = 0; i < FACE_EXPRESSIONS.length; i++) {
    const action = runtime.faceActions[i];
    if (action) action.setEffectiveWeight(THREE.MathUtils.damp(action.getEffectiveWeight(), expression === FACE_EXPRESSIONS[i] ? 1 : 0, 24, step));
  }
  runtime.elapsed += step; mixer.update(step);
  // Deepen the upper-body crouch to the existing head volume while leaving
  // authored feet, limb lengths and the whole-avatar scale intact.
  runtime.crouchOffset = THREE.MathUtils.damp(runtime.crouchOffset, !dead && actor.crouch && actions.crouch_idle ? .29 : 0, 18, step);
  if (runtime.spine) runtime.spine.position.y -= runtime.crouchOffset;
  for (let i = 0; i < runtime.poseBones.length; i++) runtime.baseRotations[i].copy(runtime.poseBones[i].quaternion);
  const pitch = dead ? 0 : THREE.MathUtils.clamp(actor.pitch, -1, 1);
  head.rotateX(pitch * .45);
  const resting = dead || runtime.emoteTime > 0 || (!actor.weapons[actor.slot] && actor.stage === 'ground' && !actor.swimming);
  runtime.unarmed = THREE.MathUtils.damp(runtime.unarmed, resting ? 1 : 0, 12, step);
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
