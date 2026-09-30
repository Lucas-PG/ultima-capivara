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
import { attachFurShells, disposeFurShells, updateFurShells } from './capybara-fur';
import characterMetrics from '../../public/models/capybara/metrics.json';

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
/** The character ships once per graphics quality (High 4K maps, Medium 2K, Low 1K): same mesh,
 * rig and clips, self-contained files, so a player downloads and uploads only their own tier. */
export type CapybaraTier = 'low' | 'medium' | 'high';
const CHARACTER_TIERS = (characterMetrics as { tiers?: Partial<Record<CapybaraTier, { path: string; bytes: number }>> }).tiers ?? {};
export function capybaraAssetEntry(tier: CapybaraTier = 'medium'): { path: string; bytes: number } {
  const entry = CHARACTER_TIERS[tier];
  return entry ? { path: entry.path, bytes: entry.bytes } : { path: 'models/capybara/capybara.glb', bytes: characterMetrics.bytes };
}
let characterAsset: GLTF | null = null;
let characterAtlasColumns: 4 | 16 = 16;
let characterHeadTop = 1.85;
// The highest point of the rest mesh: the posed crown follows it on the head bone. The ear tips
// (the highest ear-skinned points) follow their own bones, since the ears flick and swing.
const characterCrownPoint = new THREE.Vector3(0, 1.85, 0);
const characterEarTip = new THREE.Vector3(.13, 1.82, .05);
const characterChestRest = new THREE.Vector3(0, 1.06, 0);
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
  // v6 paints the team cloth neutral grey and marks it per texel in the ORM map's red channel
  // (occlusion is already in the albedo), so the scarf edge stays crisp at any distance.
  const texelMask = material.userData.capyCharacterV6 === true && !!material.metalnessMap;
  material.onBeforeCompile = shader => {
    shader.uniforms.teamColor = { value: team };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float teamMask; varying float vTeam;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTeam = teamMask;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 teamColor; varying float vTeam;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float teamAmount = ${texelMask ? 'texture2D(metalnessMap, vMetalnessMapUv).r' : 'vTeam'};
        // Far away the mipmapped texel mask blurs into the fur around the cloth, and a golden team
        // colour then reads as more fur: the vertex mask takes over (crisp by geometry), and the
        // cloth carries a little of its own colour as light, so it keeps its hue in shade at 60 m.
        float teamFar = smoothstep(18.0, 45.0, length(vViewPosition));
        teamAmount = mix(teamAmount, vTeam, teamFar);
        // Keep the painted light (folds, weave, AO) of the authored cloth, swap only its hue.
        float teamShade = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722)) / .36;
        diffuseColor.rgb = mix(diffuseColor.rgb, teamColor * clamp(mix(teamShade, 1.0, teamFar), .35, 1.3), teamAmount);
        totalEmissiveRadiance += teamColor * teamAmount * teamFar * .45;`);
  };
  material.customProgramCacheKey = () => `capivara-team-v7:${texelMask}`;
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
  active: string; weights: Record<string, number>; targets: Record<string, number>; grounded: boolean; swimming: boolean; swimBlend: number; landing: number; spine?: THREE.Bone; crown: THREE.Vector3; crownTips: { bone: THREE.Bone; local: THREE.Vector3 }[]; crownScratch: THREE.Vector3; expression: CapybaraExpression; forcedExpression: CapybaraExpression | null; faceTime: number;
  hitTime: number; hitX: number; hitZ: number; deathTime: number; deathSide: number; emoteTime: number; unarmed: number; head: THREE.Bone; arms: THREE.Bone[]; root: THREE.Bone; elapsed: number;
  legacyBones: THREE.Bone[]; skeleton: THREE.Skeleton; poseBones: THREE.Bone[]; baseRotations: THREE.Quaternion[];
  relaxBones: THREE.Bone[]; relaxedArms: THREE.Quaternion[]; armBlends: THREE.Quaternion[];
  gesture: EmoteId | null; gestureDeadline: number; gestureElapsed: number; gestureBlend: number;
  bounceSeq: number | null; gaitPhase: number;
  legs?: { thigh: THREE.Bone; shin: THREE.Bone; foot: THREE.Bone }[];
  dangles: Dangle[]; lastForward: number; lastSide: number; lastLift: number; aim: number; aimHold: number; lastShot: number;
  fur: THREE.SkinnedMesh | null; chest?: THREE.Bone;
  hold?: { pawR: THREE.Bone; restInv: THREE.Quaternion; armL: THREE.Bone; forearmL: THREE.Bone; pawL: THREE.Bone };
  gestureJoints: Partial<Record<'forearm_L' | 'forearm_R' | 'paw_L' | 'paw_R' | 'thigh_L' | 'thigh_R' | 'shin_L' | 'shin_R' | 'foot_L' | 'foot_R', THREE.Bone>>;
}

export function preloadCapybaraAsset(load?: (url: string) => Promise<GLTF>, tier: CapybaraTier = 'medium'): Promise<void> {
  if (!characterLoading) {
    const generation = characterGeneration;
    characterLoading = (async () => {
      const url = `${import.meta.env.BASE_URL}${capybaraAssetEntry(tier).path}`;
      const asset = await (load ? load(url) : new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url));
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
        // Over every LOD: the coarse far mesh stands a little taller at the ears.
        let highest = -Infinity, highestEar = -Infinity;
        const vertex = new THREE.Vector3();
        for (let level = 0; level < 3; level++) {
          const mesh = asset.scene.getObjectByName(`Capybara_LOD${level}`) as THREE.SkinnedMesh, position = mesh.geometry.getAttribute('position');
          const joints = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight');
          const ears = new Set(mesh.skeleton.bones.flatMap((bone, i) => /^ear_[LR]$/.test(bone.name) ? [i] : []));
          mesh.skeleton.update();
          for (let i = 0; i < position.count; i++) {
            mesh.getVertexPosition(i, vertex); vertex.applyMatrix4(mesh.matrixWorld);
            if (vertex.y > highest) { highest = vertex.y; characterCrownPoint.set(Math.abs(vertex.x), vertex.y, vertex.z); }
            let ear = 0;
            for (let j = 0; j < 4; j++) if (ears.has(joints.getComponent(i, j))) ear += weights.getComponent(i, j);
            if (ear > .5 && vertex.y > highestEar) { highestEar = vertex.y; characterEarTip.set(Math.abs(vertex.x), vertex.y, vertex.z); }
          }
        }
        characterHeadTop = highest;
        // Rest chest in character space: held guns follow its offset from here.
        (asset.scene.getObjectByName('chest') ?? asset.scene.getObjectByName('spine'))?.getWorldPosition(characterChestRest);
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
  asset.scene.traverse(object => { if (object instanceof THREE.SkinnedMesh) disposeFurShells(object.geometry); });
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

/** Close-range pelt: only capybaras near the camera draw their fur shells. */
export function setCapybaraViewDistance(body: THREE.SkinnedMesh, distance: number): void {
  const fur = characterInstances.get(body)?.fur;
  if (fur) updateFurShells(fur, distance);
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
  const fur = attachFurShells(meshes[0]);
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
    scene, mixer, actions, weights, targets, grounded: true, swimming: false, swimBlend: 0, landing: 0,
    gesture: null, gestureDeadline: 0, gestureElapsed: 0, gestureBlend: 0, gestureJoints: {},
    bounceSeq: null, gaitPhase: 0, dangles: [], lastForward: 0, lastSide: 0, lastLift: 0, aim: 1, aimHold: 0, lastShot: -1, fur, chest: scene.getObjectByName('chest') as THREE.Bone | undefined,
    spine: scene.getObjectByName('spine') as THREE.Bone | undefined, crown: characterCrownPoint.clone().setX(0), crownTips: [], crownScratch: new THREE.Vector3(), faceActions: FACE_EXPRESSIONS.map(name => actions[`face_${name}`]), active: 'idle', expression: 'neutral', forcedExpression: null, faceTime: 0,
    hitTime: 0, hitX: 0, hitZ: 0, deathTime: -1, deathSide: 1, emoteTime: 0, unarmed: 0, elapsed: 0, skeleton, legacyBones, poseBones: [], baseRotations: [], relaxBones: [], relaxedArms: [], armBlends: [],
    head: scene.getObjectByName('head') as THREE.Bone,
    root: scene.getObjectByName('root') as THREE.Bone,
    arms: [scene.getObjectByName('arm_L') as THREE.Bone, scene.getObjectByName('arm_R') as THREE.Bone],
  };
  scene.updateMatrixWorld(true); runtime.head.worldToLocal(runtime.crown);
  // The ear tips follow both ears (they flick and swing on their own bones).
  for (const [side, sign] of [['L', -1], ['R', 1]] as const) {
    const ear = scene.getObjectByName(`ear_${side}`);
    if (ear instanceof THREE.Bone) runtime.crownTips.push({ bone: ear, local: ear.worldToLocal(characterEarTip.clone().setX(sign * characterEarTip.x)) });
  }
  // Unarmed rest: the upper arm swings down along the barrel, then the elbow
  // eases open so the paw rests on the belly side instead of a raised bent arm.
  const forearms: THREE.Bone[] = [], relaxedForearms: THREE.Quaternion[] = [];
  for (let i = 0; i < runtime.arms.length; i++) {
    const arm = runtime.arms[i], side = i === 0 ? 'L' : 'R', sign = i === 0 ? -1 : 1;
    const forearm = scene.getObjectByName(`forearm_${side}`), paw = scene.getObjectByName(`paw_${side}`);
    if (!(forearm instanceof THREE.Bone) || !paw) continue;
    const shoulder = arm.getWorldPosition(new THREE.Vector3()), elbow = forearm.getWorldPosition(new THREE.Vector3());
    const hand = paw.getWorldPosition(new THREE.Vector3());
    // Arms hang clear of the body, elbows slightly out and bent, paws beside the thighs.
    const elbowTarget = new THREE.Vector3(sign * .425, 1.005, .005), handTarget = new THREE.Vector3(sign * .455, .775, -.105);
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
  // The mixer only writes a property when its value changes, so every bone posed procedurally
  // afterwards (the head, arms and the held-weapon stance on spine, chest and neck) is restored
  // to the last mixer output first; otherwise constant tracks would accumulate those offsets.
  const stance = ['spine', 'chest', 'neck'].map(name => scene.getObjectByName(name)).filter((bone): bone is THREE.Bone => bone instanceof THREE.Bone);
  const legBones = ['L', 'R'].map(side => ['thigh', 'shin', 'foot'].map(part => scene.getObjectByName(`${part}_${side}`)));
  if (legBones.flat().every(bone => bone instanceof THREE.Bone)) {
    runtime.legs = legBones.map(([thigh, shin, foot]) => ({ thigh: thigh as THREE.Bone, shin: shin as THREE.Bone, foot: foot as THREE.Bone }));
    // The sole under each toe hinge, in the foot bone's bind frame (as the gait authoring plants it).
    for (let i = 0; i < 2; i++) runtime.legs[i].foot.worldToLocal(FOOT_CONTACT[i].fromArray(characterMetrics.footContact[i ? 'R' : 'L']));
  }
  for (const [name, swing, sway, bob, limit, stiffness] of DANGLES) {
    const bone = scene.getObjectByName(name);
    if (bone instanceof THREE.Bone) runtime.dangles.push({ bone, swing, sway, bob, limit, stiffness, x: 0, z: 0, vx: 0, vz: 0 });
  }
  runtime.poseBones = [...new Set([runtime.head, runtime.root, ...stance, ...runtime.arms, ...forearms, ...Object.values(runtime.gestureJoints), ...runtime.dangles.map(dangle => dangle.bone)])];
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
    (fur?.material as THREE.Material | undefined)?.dispose();
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

// Gait clips (metrics: stance speed in m per clip second, stance share of the cycle and the
// travel direction as right, forward). Walking and crouching come in eight directions each.
const GAIT_SPEED: Record<string, number> = characterMetrics.locomotionSpeed;
const GAIT_CONTACT: Record<string, number> = (characterMetrics as { locomotionContact?: Record<string, number> }).locomotionContact ?? {};
const GAIT_DIRECTION: Record<string, number[]> = (characterMetrics as { locomotionDirection?: Record<string, number[]> }).locomotionDirection ??
  { walk: [0, 1], backpedal: [0, -1], strafe_l: [-1, 0], strafe_r: [1, 0], run: [0, 1], crouch_walk: [0, 1] };
const GAITS = Object.keys(GAIT_SPEED);
const WALK_FAMILY = GAITS.filter(name => name !== 'run' && !name.startsWith('crouch_'));
const CROUCH_FAMILY = GAITS.filter(name => name.startsWith('crouch_') && name !== 'crouch_idle');

/** Spreads `amount` over a family's clips by direction: the two nearest share it by angle. */
function directionalWeights(family: readonly string[], actions: Record<string, THREE.AnimationAction>, x: number, forward: number,
  amount: number, add: (name: string, amount: number) => void): void {
  const present = family.filter(name => actions[name] && GAIT_DIRECTION[name]);
  if (!present.length || amount <= 0) return;
  const heading = Math.atan2(x, forward), width = Math.PI * 2 / present.length;
  let total = 0;
  const shares = present.map(name => {
    const [r, f] = GAIT_DIRECTION[name];
    let diff = Math.abs(Math.atan2(r, f) - heading); if (diff > Math.PI) diff = Math.PI * 2 - diff;
    const share = Math.max(0, 1 - diff / width); total += share; return share;
  });
  present.forEach((name, i) => { if (shares[i] > 0) add(name, amount * shares[i] / total); });
}

/**
 * Planted feet at any speed and blend: every gait clip plays at one shared phase (mid-stance of
 * the left foot at 0), advanced by the travelled distance over the blended stride (the weighted
 * sum of each clip's metres per cycle along its own direction), so a stance foot moves under the
 * body exactly as fast as the actor.
 */
function advanceGait(runtime: CharacterInstance, speed: number, step: number): void {
  let weight = 0, mx = 0, mf = 0;
  for (const name of GAITS) {
    const action = runtime.actions[name], w = runtime.weights[name] || 0;
    if (!action || w <= 0) continue;
    const metres = GAIT_SPEED[name] * action.getClip().duration, [r, f] = GAIT_DIRECTION[name] ?? [0, 1];
    weight += w; mx += w * metres * r; mf += w * metres * f;
  }
  const stride = Math.hypot(mx, mf);
  if (weight > 1e-4 && stride > 1e-4) runtime.gaitPhase = (runtime.gaitPhase + step * speed * weight / stride) % 1;
  for (const name of GAITS) {
    const action = runtime.actions[name];
    if (!action) continue;
    action.paused = true;
    action.time = ((runtime.gaitPhase + (GAIT_CONTACT[name] ?? .5) / 2) % 1) * action.getClip().duration;
  }
}

// Loose things that lag behind the body: bandana tails, hip rag, rolled blanket, pack, ears.
// [bone, swing per m/s of forward speed, sway per m/s sideways, kick per m/s2 of vertical
// acceleration, limit (rad), stiffness]. A damped spring per bone, no cloth simulation.
interface Dangle { bone: THREE.Bone; swing: number; sway: number; bob: number; limit: number; stiffness: number; x: number; z: number; vx: number; vz: number }
const DANGLES: readonly (readonly [string, number, number, number, number, number])[] = [
  ['scarf_L', .060, .050, .010, .7, 70], ['scarf_R', .052, .050, .012, .7, 80], ['hipcloth', -.045, .040, -.012, .6, 55],
  ['bedroll', .008, .006, .004, .12, 120], ['pack', .006, .004, .003, .08, 140], ['ear_L', -.020, .010, -.006, .5, 160], ['ear_R', -.020, .010, -.006, .5, 160],
];

function swingDangles(runtime: CharacterInstance, actor: ActorState, step: number): void {
  if (!runtime.dangles.length || step <= 0) return;
  const side = Math.cos(actor.yaw) * actor.velocity.x - Math.sin(actor.yaw) * actor.velocity.z;
  const forward = -Math.sin(actor.yaw) * actor.velocity.x - Math.cos(actor.yaw) * actor.velocity.z;
  // Accelerations kick the springs (a start, a stop, a landing); steady speed holds a lean.
  const clamp = (value: number) => THREE.MathUtils.clamp(value, -40, 40);
  const pushF = clamp((forward - runtime.lastForward) / step), pushS = clamp((side - runtime.lastSide) / step), pushY = clamp((actor.velocity.y - runtime.lastLift) / step);
  runtime.lastForward = forward; runtime.lastSide = side; runtime.lastLift = actor.velocity.y;
  for (const d of runtime.dangles) {
    const targetX = d.swing * forward, targetZ = d.sway * side;
    const damping = 2 * Math.sqrt(d.stiffness) * .45;
    d.vx += ((targetX - d.x) * d.stiffness - d.vx * damping - d.swing * pushF * 1.5 - d.bob * pushY) * step;
    d.vz += ((targetZ - d.z) * d.stiffness - d.vz * damping - d.sway * pushS * 1.5) * step;
    d.x = THREE.MathUtils.clamp(d.x + d.vx * step, -d.limit, d.limit); d.z = THREE.MathUtils.clamp(d.z + d.vz * step, -d.limit, d.limit);
    d.bone.rotateX(d.x); d.bone.rotateZ(d.z);
  }
}

const FOOT_CONTACT = [new THREE.Vector3(), new THREE.Vector3()];
const _hip = new THREE.Vector3(), _knee = new THREE.Vector3(), _ankle = new THREE.Vector3(), _toe = new THREE.Vector3();
const _target = new THREE.Vector3(), _axis = new THREE.Vector3(), _bend = new THREE.Vector3(), _v = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _foot = new THREE.Quaternion();

/**
 * Blending two planted-foot clips (a forward and a side step on a diagonal) interpolates the leg
 * rotations, and the foot swings along an arc below both authored positions. Lift any sole that
 * went under the contact plane back onto it with a two-bone solve that keeps the knee's plane and
 * the foot's world orientation.
 */
function groundFeet(runtime: CharacterInstance): void {
  const legs = runtime.legs;
  if (!legs) return;
  runtime.scene.updateMatrixWorld(true);
  const ground = _v.setFromMatrixPosition(runtime.scene.matrixWorld).y + .0015;
  for (let i = 0; i < 2; i++) {
    const { thigh, shin, foot } = legs[i];
    foot.localToWorld(_toe.copy(FOOT_CONTACT[i]));
    const deficit = ground - _toe.y;
    if (deficit < .001) continue;
    thigh.getWorldPosition(_hip); shin.getWorldPosition(_knee); foot.getWorldPosition(_ankle);
    foot.getWorldQuaternion(_foot);
    _target.copy(_ankle).y += deficit;
    const a = _hip.distanceTo(_knee), b = _knee.distanceTo(_ankle);
    const d = Math.min(_target.distanceTo(_hip), a + b - 1e-4);
    _axis.subVectors(_target, _hip).normalize();
    // Knee direction: the current knee's offset from the hip-ankle line.
    _bend.subVectors(_knee, _hip); _bend.addScaledVector(_axis, -_bend.dot(_axis)).normalize();
    const along = (a * a - b * b + d * d) / (2 * d), out = Math.sqrt(Math.max(0, a * a - along * along));
    const knee = _v.copy(_hip).addScaledVector(_axis, along).addScaledVector(_bend, out);
    // Swing the thigh onto the new knee, then the shin onto the target, in world space.
    _q.setFromUnitVectors(_knee.sub(_hip).normalize(), knee.sub(_hip).normalize());
    thigh.getWorldQuaternion(_qa); thigh.parent!.getWorldQuaternion(_qb);
    thigh.quaternion.copy(_qb.invert().multiply(_q.multiply(_qa)));
    thigh.updateMatrixWorld(true);
    shin.getWorldPosition(_knee); foot.getWorldPosition(_ankle);
    _q.setFromUnitVectors(_ankle.sub(_knee).normalize(), _target.sub(_knee).normalize());
    shin.getWorldQuaternion(_qa); shin.parent!.getWorldQuaternion(_qb);
    shin.quaternion.copy(_qb.invert().multiply(_q.multiply(_qa)));
    shin.updateMatrixWorld(true);
    shin.getWorldQuaternion(_qb);
    foot.quaternion.copy(_qb.invert().multiply(_foot));
    foot.updateMatrixWorld(true);
  }
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
    const airborne = actor.stage === 'falling' && actions.skydive ? 'skydive' : actor.stage === 'parachute' && actions.parachute ? 'parachute'
      : bouncing ? 'boing' : actor.velocity.y < (actor.bounceProtected && actions.boing ? 0 : -.15) ? 'fall' : 'jump';
    weight(airborne, 1, 'jump');
    if (runtime.grounded && airborne !== 'boing') actions[actions[airborne] ? airborne : 'jump'].reset().play();
  } else {
    if (!runtime.grounded && !runtime.swimming && actions.land) { runtime.landing = .24; actions.land.reset().play(); }
    const moving = THREE.MathUtils.smoothstep(speed, .05, .35);
    // Directional gaits blend by heading (see directionalWeights and advanceGait).
    const x = Math.cos(actor.yaw) * actor.velocity.x - Math.sin(actor.yaw) * actor.velocity.z;
    const forward = -Math.sin(actor.yaw) * actor.velocity.x - Math.cos(actor.yaw) * actor.velocity.z;
    const add = (name: string, amount: number) => { targets[name] = (targets[name] || 0) + amount; };
    if (actor.crouch) {
      weight('crouch_idle', 1 - moving, 'idle');
      directionalWeights(CROUCH_FAMILY, actions, x, forward, moving, add);
    } else {
      // Holding a gun: the staggered, knees-bent stance that leans into it.
      const gun = actor.weapons[actor.slot];
      weight(gun && HOLD_CLASS[gun.id] !== 'melee' ? 'idle_armed' : 'idle', 1 - moving, 'idle');
      // The run clip follows the sprint itself (heavy guns sprint slower than 6.4 m/s): a steady
      // walk and run mix would put one clip's stance foot on the other's swing.
      const run = actor.sprint ? 1 : 0, walking = moving * (1 - run);
      directionalWeights(WALK_FAMILY, actions, x, forward, walking, add);
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
  }
  advanceGait(runtime, speed, step);
  const reload = actions.reload_tp, held = actor.weapons[actor.slot];
  if (reload) {
    const active = !dead && !bouncing && !!held && actor.reloadUntil > simulationTime;
    reload.setEffectiveWeight(THREE.MathUtils.damp(reload.getEffectiveWeight(), active ? 1 : 0, 20, step));
    reload.paused = true;
    if (active) reload.time = reload.getClip().duration * THREE.MathUtils.clamp(1 - (actor.reloadUntil - simulationTime) / (WEAPONS[held.id].reload || 1), 0, 1);
  }
  for (let i = 0; i < runtime.poseBones.length; i++) runtime.poseBones[i].quaternion.copy(runtime.baseRotations[i]);
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
  for (let i = 0; i < runtime.poseBones.length; i++) runtime.baseRotations[i].copy(runtime.poseBones[i].quaternion);
  if (!dead && !gesture && !actor.swimming && actor.stage === 'ground' && actor.grounded) groundFeet(runtime);
  swingDangles(runtime, actor, step);
  const bounceWeight = runtime.weights.boing || 0;
  const pitch = dead || gesture ? 0 : THREE.MathUtils.clamp(actor.pitch, -1, 1) * (1 - bounceWeight);
  // The aim pitch runs through the whole upper body; the head (and its hit volume) barely moves.
  runtime.spine?.rotateX(pitch * .03); runtime.chest?.rotateX(pitch * .06);
  head.rotateX(pitch * .40);
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
    if (!actions.parachute) for (const arm of arms) arm.rotateX(2.4);
    root.rotation.z += Math.sin(runtime.elapsed * 2.2) * .025;
  }
  if (runtime.hitTime > 0) {
    // A flinch away from the shot: the chest snaps back and the head follows, the gun with them.
    const recoil = Math.sin(Math.PI * runtime.hitTime / .22);
    head.rotateX(runtime.hitX * recoil); head.rotateZ(runtime.hitZ * recoil);
    runtime.chest?.rotateX(runtime.hitX * recoil * 2.4); runtime.chest?.rotateZ(runtime.hitZ * recoil * 2);
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
  let top = body.worldToLocal(runtime.crownScratch).y;
  for (const tip of runtime.crownTips) {
    tip.bone.updateWorldMatrix(false, false);
    runtime.crownScratch.copy(tip.local); tip.bone.localToWorld(runtime.crownScratch);
    top = Math.max(top, body.worldToLocal(runtime.crownScratch).y);
  }
  return top;
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
  // The world paw's longer, thicker digits close less far around the same grip.
  const c = grip.curl, k = TP_CURL, scaled = (v: readonly [number, number, number]) => [v[0] * k, v[1] * k, v[2] * k] as const;
  arm.fingers.apply({ index: scaled(c.index), middle: scaled(c.middle), ring: scaled(c.ring), thumb: scaled(c.thumb), spread: c.spread });
  arm.paw.updateMatrixWorld(true);
}
type HoldClass = 'rifle' | 'heavy' | 'pistol' | 'melee';
const HOLD_CLASS: Record<WeaponId, HoldClass> = { pistol: 'pistol', revolver: 'pistol', smg: 'rifle', m4: 'rifle', shotgun: 'heavy', dmr: 'rifle', sniper: 'heavy', coco: 'heavy', machete: 'melee' };
/** Held world weapons are scaled to the world paw (a big leathery hand, about 1.8 times the
 * first-person paw): at this scale the first-person grip specs, placed in weapon space, put the
 * larger palm on the same surfaces, with a small wrist offset (tpGripOffset) for the rest. */
export const TP_WEAPON_SCALE = 1.3;
const TP_GRIP_BACK = .008, TP_GRIP_OUT = .010, TP_CURL = .9;
/** Where the world paw's wrist goes for a first-person grip, relative to that grip's wrist (in the
 * grip's own space): backed off along the digits and out of the palm, for the larger hand. */
export function tpGripOffset(forward: readonly number[], palm: readonly number[]): THREE.Vector3 {
  const f = new THREE.Vector3().fromArray(forward).normalize(), p = new THREE.Vector3().fromArray(palm).normalize();
  return f.multiplyScalar(-TP_GRIP_BACK).addScaledVector(p, -TP_GRIP_OUT);
}
// The gun origin (the firing paw's web) in character space at rest, its extra yaw/roll, and the
// upper-body twist: long guns are held in a bladed stance (left shoulder forward, the head
// turned back to the aim) so the stock sits in the right shoulder and the support paw reaches
// the handguard close to the body, as in the holding reference.
interface HoldPose { pos: readonly [number, number, number]; yaw: number; roll: number; twist: number; poleR: readonly [number, number, number]; poleL: readonly [number, number, number] }
const HOLD_POSE: Record<HoldClass, HoldPose> = {
  rifle: { pos: [.105, 1.285, -.30], yaw: 0, roll: 0, twist: -.44, poleR: [.9, -1, .45], poleL: [-.5, -1, -.1] },
  heavy: { pos: [.11, 1.27, -.285], yaw: 0, roll: 0, twist: -.5, poleR: [.9, -1, .45], poleL: [-.5, -1, -.1] },
  pistol: { pos: [.025, 1.32, -.50], yaw: 0, roll: 0, twist: -.14, poleR: [.8, -1, .2], poleL: [-.8, -1, .1] },
  melee: { pos: [.30, 1.02, -.24], yaw: 0, roll: 0, twist: 0, poleR: [.8, -1, .3], poleL: [-.8, -1, .2] },
};
interface HoldRig { chest: THREE.Bone; spine: THREE.Bone; neck: THREE.Bone; head: THREE.Bone; chestRest: THREE.Vector3; charQuat: THREE.Quaternion; R: ArmChain; L: ArmChain; reloadEnd: number; reloadEmpty: boolean; sample: ChoreoSample; twist: number }
const RELAXED_PAW: HandCurl = { index: [.12, .18, .1], middle: [.18, .22, .1], ring: [.2, .25, .1], thumb: [.18, .12, .06] };
const holdRigs = new WeakMap<THREE.SkinnedMesh, HoldRig>();
const worldCut = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, smear: 0, kick: 0 };
const FREE_MELEE_PAW: GripSpec = { wrist: [-.27, 1.02, -.20], forward: [.18, .12, -1], palm: [.2, -.95, -.05], curl: RELAXED_PAW, pole: [-.8, -1, .1] };
const UP = new THREE.Vector3(0, 1, 0), twistQ = new THREE.Quaternion(), twistAxis = new THREE.Vector3();
const WEAPON_SCALE = new THREE.Vector3(TP_WEAPON_SCALE, TP_WEAPON_SCALE, TP_WEAPON_SCALE);
/** Yaw a bone about the character's up axis (given in world space), in its parent's frame. */
function yawBone(bone: THREE.Bone, up: THREE.Vector3, angle: number) {
  if (Math.abs(angle) < 1e-5) return;
  bone.parent!.getWorldQuaternion(ikQ).invert();
  twistAxis.copy(up).applyQuaternion(ikQ);
  bone.quaternion.premultiply(twistQ.setFromAxisAngle(twistAxis, angle));
}
export function holdWeapon(body: THREE.SkinnedMesh, weapon: THREE.Object3D, actor: ActorState, simulationTime: number,
  strike?: { time: number; side: number; heavy: boolean }, dt = 1 / 60): void {
  const runtime = characterInstances.get(body);
  if (!runtime) return;
  let rig = holdRigs.get(body);
  if (!rig) {
    const bone = (name: string) => runtime.scene.getObjectByName(name) as THREE.Bone;
    const bind = (b: THREE.Bone) => runtime.skeleton.boneInverses[runtime.skeleton.bones.indexOf(b)].clone().invert();
    const chest = bone('chest') ?? bone('spine'); if (!chest) return;
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
    const chestRest = characterChestRest.clone();
    rig = { chest, spine: bone('spine'), neck: bone('neck'), head: bone('head'), chestRest, charQuat: new THREE.Quaternion(), R: chain('R'), L: chain('L'),
      reloadEnd: 0, reloadEmpty: false, sample: newSample(), twist: NaN };
    holdRigs.set(body, rig);
  }
  if (weapon.parent !== rig.chest) rig.chest.add(weapon);
  const id = actor.weapons[actor.slot]?.id;
  const armed = !!id && actor.alive && actor.stage === 'ground' && !(actor.emote && actor.emoteUntil > simulationTime);
  const hold = id ? HOLD_CLASS[id] : 'rifle', pose = HOLD_POSE[hold];
  const sprint = armed && actor.sprint && !actor.swimming ? 1 : 0;
  // The bladed stance eases in and out; sprinting squares the shoulders to carry across the body.
  const step = Math.max(0, Math.min(dt, .1));
  const twistTarget = armed && !actor.swimming ? pose.twist * (1 - .75 * sprint) : 0;
  // A new avatar starts in its stance; later changes (draw, sprint) ease in.
  rig.twist = Number.isNaN(rig.twist) ? twistTarget : THREE.MathUtils.damp(rig.twist, twistTarget, 10, step);
  const character = body.parent ?? body;
  character.updateWorldMatrix(true, false);
  if (Math.abs(rig.twist) > 1e-4 && rig.spine && rig.neck && rig.head) {
    character.getWorldQuaternion(rig.charQuat);
    const up = ikE.copy(UP).applyQuaternion(rig.charQuat);
    rig.spine.updateWorldMatrix(true, false);
    yawBone(rig.spine, up, rig.twist * .4); rig.spine.updateMatrixWorld(true);
    yawBone(rig.chest, up, rig.twist * .6); rig.chest.updateMatrixWorld(true);
    yawBone(rig.neck, up, -rig.twist * .45); rig.neck.updateMatrixWorld(true);
    yawBone(rig.head, up, -rig.twist * .55); rig.head.updateMatrixWorld(true);
  }
  if (!id || !armed) return;
  const grips = VIEW_SPECS[id].grips;
  // Aim, sprint carry and reload tilt, all about the shoulders.
  const pitch = THREE.MathUtils.clamp(actor.pitch, -1, 1) * .85;
  const reload = actor.reloadUntil > simulationTime ? 1 - (actor.reloadUntil - simulationTime) / Math.max(.3, WEAPONS[id].reload || 1) : -1;
  if (reload < 0) rig.reloadEnd = 0;
  if (reload >= 0 && actor.reloadUntil !== rig.reloadEnd) { rig.reloadEnd = actor.reloadUntil; rig.reloadEmpty = actor.weapons[actor.slot]!.ammo === 0; }
  const short = isShortGun(id), parts = weapon.userData.shortParts as WorldParts | undefined;
  const keys = short ? shortReload(id, rig.reloadEmpty) : id === 'm4' ? m4Reload(rig.reloadEmpty) : null;
  const sample = keys && reload >= 0 ? sampleChoreo(keys, reload, rig.sample) : null;
  const tilt = reload >= 0 && !keys ? Math.sin(Math.PI * THREE.MathUtils.clamp(reload, 0, 1)) : 0;
  const long = hold === 'rifle' || hold === 'heavy';
  // Standing quiet, the gun rests at low ready (muzzle down across the body); moving, aiming,
  // firing or reloading brings it up into the shoulder, and it stays there a moment.
  const shot = actor.shotSeq ?? 0, speed = Math.hypot(actor.velocity.x, actor.velocity.z);
  const fired = runtime.lastShot >= 0 && shot !== runtime.lastShot;
  if (actor.ads || fired || reload >= 0 || speed > .4 || actor.crouch) runtime.aimHold = 1.4;
  runtime.lastShot = shot; runtime.aimHold = Math.max(0, runtime.aimHold - step);
  runtime.aim = THREE.MathUtils.damp(runtime.aim, runtime.aimHold > 0 ? 1 : 0, runtime.aimHold > 0 ? 16 : 5, step);
  const rest = (1 - runtime.aim) * (1 - sprint) * (hold === 'melee' ? 0 : 1);
  const lowReady = sprint * (hold === 'pistol' ? .9 : .55) + rest * (hold === 'pistol' ? .55 : .40);
  holdEuler.set(pitch * (1 - .6 * rest) - lowReady + tilt * .25, pose.yaw + sprint * (long ? .55 : .2) + rest * (long ? .30 : .05) + tilt * .25, pose.roll - tilt * (hold === 'pistol' ? .5 : .7), 'YXZ');
  const cutting = id === 'machete' && strike && strike.time < MELEE_SECONDS;
  if (cutting) {
    if (strike.heavy) sampleHeavyMelee(strike.time, worldCut); else sampleMelee(strike.time, strike.side, worldCut);
    holdEuler.x -= worldCut.pitch * 1.5; holdEuler.y += worldCut.yaw * 1.4; holdEuler.z += worldCut.roll * .65;
  }
  // Reloads keep the gun low at the chest: the first-person lift toward the eye would cover the face.
  if (sample) { holdEuler.x += sample.r.x * .45; holdEuler.y += sample.r.y * .8; holdEuler.z += sample.r.z * .8; }
  holdQuat.setFromEuler(holdEuler);
  // Pivot at shoulder height so aiming swings the muzzle, not the stock.
  const pivot = ikT.set(.08, 1.30, 0);
  holdPos.set(pose.pos[0], pose.pos[1], pose.pos[2]).sub(pivot).applyQuaternion(holdQuat).add(pivot);
  holdPos.y -= sprint * .06 + tilt * .05 + rest * (long ? .07 : .10); holdPos.x -= sprint * (long ? .06 : 0) + rest * (long ? .03 : 0);
  if (sample) { holdPos.addScaledVector(sample.p, .55); holdPos.y -= .03 * Math.sin(Math.PI * THREE.MathUtils.clamp(reload, 0, 1)); }
  if (cutting) { holdPos.x += worldCut.x * .6; holdPos.y += worldCut.y * .6; holdPos.z += worldCut.z * .6; }
  // Character frame -> world, then into the chest's current frame. The chest's own bob,
  // breath and crouch (its offset from rest) carry the gun.
  rig.chest.updateWorldMatrix(true, false);
  holdPos.add(character.worldToLocal(rig.chest.getWorldPosition(ikB)).sub(rig.chestRest));
  holdMatrix.compose(holdPos, holdQuat, WEAPON_SCALE).premultiply(character.matrixWorld).premultiply(ikMatrix.copy(rig.chest.matrixWorld).invert());
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
  const poleR = ikD.set(pose.poleR[0], pose.poleR[1], pose.poleR[2]).normalize().applyQuaternion(rig.charQuat).clone();
  const poleL = ikD.set(pose.poleL[0], pose.poleL[1], pose.poleL[2]).normalize().applyQuaternion(rig.charQuat).clone();
  // The grip specs place the first-person paw. The world paw is its own, larger hand: its palm
  // sits further from the wrist and deeper below it, so the wrist backs off the gun by that much.
  const target = (grip: { wrist: readonly number[]; forward: readonly number[]; palm: readonly number[] }) =>
    new THREE.Vector3(grip.wrist[0], grip.wrist[1], grip.wrist[2]).add(tpGripOffset(grip.forward, grip.palm)).applyMatrix4(weapon.matrixWorld);
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
