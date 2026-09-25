import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { ActorState } from '../shared/types';
import type { AvatarReaction } from './effects';
import palette from './capybara-palette.json';
import { applyCharacterStyle } from './materials';

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
  // The same authored atlas drives Blender and runtime. Only cloth columns change.
  const colors = palette.map(hex => parseInt(hex, 16));
  colors[5] = tint.getHex(); colors[6] = shadeBandana(tint).getHex();
  const pixels = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const hex = colors[x], offset = (y * 16 + x) * 4;
    pixels.set([hex >> 16 & 255, hex >> 8 & 255, hex & 255, 255], offset);
  }
  const atlas = new THREE.DataTexture(pixels, 16, 16);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.magFilter = atlas.minFilter = THREE.NearestFilter;
  atlas.generateMipmaps = false; atlas.needsUpdate = true;
  const material = applyCharacterStyle(source.clone()); material.map = atlas;
  material.name = `Capivara_bandana_${tint.getHexString()}`;
  material.addEventListener('dispose', () => { atlas.dispose(); characterMaterials.delete(key); });
  characterMaterials.set(key, material);
  return material;
}
interface CharacterInstance {
  scene: THREE.Group; mixer: THREE.AnimationMixer; actions: Record<string, THREE.AnimationAction>;
  faceActions: (THREE.AnimationAction | undefined)[];
  active: string; expression: CapybaraExpression; forcedExpression: CapybaraExpression | null; faceTime: number;
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
        asset.scene.traverse(object => {
          if (!(object instanceof THREE.SkinnedMesh)) return;
          object.castShadow = true; object.receiveShadow = true;
          object.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .95, 0), 1.9);
        });
        asset.scene.updateMatrixWorld(true);
        const source = asset.scene.getObjectByName('Capybara_LOD0') as THREE.SkinnedMesh;
        source.skeleton.update();
        const bounds = new THREE.Box3().setFromObject(source, true);
        if (Number.isFinite(bounds.max.y)) characterHeadTop = bounds.max.y;
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
  characterAsset = null; characterLoading = null;
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
  runtime.actions[runtime.active].stop(); runtime.actions.idle.reset().play(); runtime.active = 'idle';
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
    const playable = facial ? THREE.AnimationUtils.makeClipAdditive(clip.clone(), 0, neutral) : clip;
    actions[clip.name] = mixer.clipAction(playable);
    if (facial) actions[clip.name].setEffectiveWeight(0).play();
  }
  actions.jump.setLoop(THREE.LoopOnce, 1); actions.jump.clampWhenFinished = true;
  actions.idle.play();
  const runtime: CharacterInstance = {
    scene, mixer, actions, faceActions: FACE_EXPRESSIONS.map(name => actions[`face_${name}`]), active: 'idle', expression: 'neutral', forcedExpression: null, faceTime: 0,
    hitTime: 0, hitX: 0, hitZ: 0, deathTime: -1, deathSide: 1, emoteTime: 0, unarmed: 0, elapsed: 0, skeleton, legacyBones, poseBones: [], baseRotations: [], relaxBones: [], relaxedArms: [], armBlends: [],
    head: scene.getObjectByName('head') as THREE.Bone,
    root: scene.getObjectByName('root') as THREE.Bone,
    arms: [scene.getObjectByName('arm_L') as THREE.Bone, scene.getObjectByName('arm_R') as THREE.Bone],
  };
  scene.updateMatrixWorld(true);
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
export function updateCapybaraBody(body: THREE.SkinnedMesh, actor: ActorState, dt: number): boolean {
  const runtime = characterInstances.get(body);
  if (!runtime) return false;
  const { mixer, actions, head, root, arms, legacyBones } = runtime;
  const speed = Math.hypot(actor.velocity.x, actor.velocity.z);
  const dead = runtime.deathTime >= 0;
  const next = dead || runtime.emoteTime > 0 ? 'idle' : actor.stage !== 'ground' || !actor.grounded ? 'jump' : speed > .35 ? 'run' : 'idle';
  if (next !== runtime.active) {
    actions[runtime.active].fadeOut(.15);
    actions[next].reset().fadeIn(.15).play(); runtime.active = next;
  }
  actions.run.timeScale = Math.max(.4, Math.min(1.7, speed / 6));
  for (let i = 0; i < runtime.poseBones.length; i++) runtime.poseBones[i].quaternion.copy(runtime.baseRotations[i]);
  const step = Math.max(0, Math.min(dt, .1));
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
  for (let i = 0; i < runtime.poseBones.length; i++) runtime.baseRotations[i].copy(runtime.poseBones[i].quaternion);
  const pitch = dead ? 0 : THREE.MathUtils.clamp(actor.pitch, -1, 1);
  head.rotateX(pitch * .45);
  const resting = dead || runtime.emoteTime > 0 || (!actor.weapons[actor.slot] && actor.stage === 'ground');
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
  runtime.scene.rotation.set(0, 0, 0); runtime.scene.position.set(0, 0, 0);
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
  if (dead) {
    // A soft side flop around the feet, then a small settling bounce. No blood.
    const fall = THREE.MathUtils.smoothstep(runtime.deathTime, 0, .65);
    const settle = runtime.deathTime > .65 ? Math.sin((runtime.deathTime - .65) * 16) * Math.exp(-(runtime.deathTime - .65) * 8) * .04 : 0;
    runtime.scene.rotation.set(0, 0, runtime.deathSide * (fall * 1.48 + settle));
    runtime.scene.position.set(0, fall * .31, 0);
    for (let i = 0; i < arms.length; i++) arms[i].rotateZ((i === 0 ? -1 : 1) * fall * .3);
  }
  return true;
}
