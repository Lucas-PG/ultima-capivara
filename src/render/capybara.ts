import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { ActorState } from '../shared/types';
import { releaseAfterUpload } from './memory';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import palette from './capybara-palette.json';

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

// All capybaras share one vertex-coloured material (one program, one upload).
let sharedMaterial: THREE.MeshStandardMaterial | null = null;
const capybaraMaterial = () => {
  if (!sharedMaterial) {
    sharedMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78, metalness: 0 });
    sharedMaterial.addEventListener('dispose', () => { sharedMaterial = null; });
  }
  return sharedMaterial;
};

// Geometry is built once per bandana colour and shared by every capybara wearing it
// (all bots share one); each avatar only owns its skeleton. Building 21 bodies
// on the first snapshot used to stall the first match frame.
const geometryCache = new Map<string, THREE.BufferGeometry>();
export function precacheCapybaras(colors: readonly string[]) { colors.forEach(capybaraGeometry); }
function capybaraGeometry(color: string): THREE.BufferGeometry {
  const cached = geometryCache.get(color);
  if (cached) return cached;
  // Flat, vivid cartoon colours: few tones, no fine texture to shimmer.
  const fur = new THREE.Color('#B8743A');
  const dark = new THREE.Color('#7A4424');
  const muzzle = new THREE.Color('#D39A47');
  const belly = new THREE.Color('#E8C08A');
  const bandana = new THREE.Color(color), bandanaShade = shadeBandana(bandana);
  const blush = muzzle.clone().lerp(new THREE.Color('#ee8a7c'), .45);
  const earInner = fur.clone().lerp(new THREE.Color('#e3a393'), .55);
  // Resolution tuned for 21 capybaras on screen: the toon ramp and ink
  // outline read as smooth at these counts (about half the old triangles).
  const sphere = new THREE.SphereGeometry(1, 16, 11);
  const small = new THREE.SphereGeometry(1, 10, 7);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  const roundedBox = new RoundedBoxGeometry(1, 1, 1, 2, .3);
  const parts: THREE.BufferGeometry[] = [];
  const add = (base: THREE.BufferGeometry, tint: THREE.Color | string, matrix: THREE.Matrix4, bone: number) => {
    const geometry = base.index ? base.toNonIndexed() : base.clone();
    geometry.applyMatrix4(matrix);
    const shade = typeof tint === 'string' ? new THREE.Color(tint) : tint;
    const count = geometry.getAttribute('position').count;
    const colors = new Float32Array(count * 3), indices = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = shade.r; colors[i * 3 + 1] = shade.g; colors[i * 3 + 2] = shade.b;
      indices[i * 4] = bone; weights[i * 4] = 1;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    parts.push(geometry);
  };
  const place = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rotation = new THREE.Euler()) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(sx, sy, sz));
  const ball = (tint: THREE.Color | string, bone: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotation?: THREE.Euler) =>
    add(sx > .12 ? sphere : small, tint, place(x, y, z, sx, sy, sz, rotation), bone);
  const block = (tint: THREE.Color | string, bone: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotation?: THREE.Euler) =>
    add(roundedBox, tint, place(x, y, z, sx, sy, sz, rotation), bone);
  const limb = (tint: THREE.Color | string, bone: number, from: THREE.Vector3, to: THREE.Vector3, radius: number) => {
    const direction = to.clone().sub(from);
    add(cylinder, tint, new THREE.Matrix4().compose(from.clone().add(to).multiplyScalar(.5),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()),
      new THREE.Vector3(radius, direction.length(), radius)), bone);
  };
  const ring = (tint: THREE.Color | string, bone: number, y: number, z: number, rx: number, rz: number, tube: number, height: number) => {
    const torus = new THREE.TorusGeometry(1, tube, 6, 20);
    add(torus, tint, place(0, y, z, rx, rz, height, new THREE.Euler(Math.PI / 2, 0, 0)), bone);
    torus.dispose();
  };
  const { torso, head, arms, thighL, thighR, shinL, shinR, armor, helmet } = CAPY_BONES;

  // Proportions follow the simulation's hit shapes, like the legacy build:
  // head inside a r .25 sphere at (0, 1.6, -.04); body and legs inside a
  // r .3 upright cylinder up to 1.42. Only the arms and the gun reach out.

  // Legs: short and chunky, two bones each so the knees bend when walking.
  for (const [side, thigh, shin] of [[-1, thighL, shinL], [1, thighR, shinR]] as const) {
    const x = side * PIVOT.legX;
    ball(fur, thigh, x, .48, .01, .13, .19, .13);
    ball(fur, shin, x, .2, 0, .115, .17, .115);
    ball(dark, shin, x, .06, -.06, .12, .07, .18);
  }

  // Torso: a round plush pear with a pale belly.
  ball(fur, torso, 0, .9, 0, .3, .42, .28);
  ball(belly, torso, 0, .85, -.15, .22, .29, .12);
  // Teal collar and bandana: the squad colour, always on.
  ring(bandana, torso, 1.27, 0, .2, .18, .35, .25);
  const cone = new THREE.ConeGeometry(.5, 1, 4);
  add(cone, bandana, place(0, 1.14, -.19, .24, .2, .08, new THREE.Euler(-.2, Math.PI / 4, Math.PI)), torso);
  cone.dispose();
  ball(bandanaShade, torso, 0, 1.22, -.21, .045, .04, .035);
  // Leather belt with a buckle and a side holster.
  ring('#6d4a31', torso, .72, 0, .26, .23, .15, .4);
  block('#e2b05e', torso, 0, .72, -.27, .09, .07, .035);
  block('#5a3f2c', torso, .24, .62, .1, .07, .18, .16);

  // Head: round cranium, soft square snout, high-set eyes, buck teeth, ears.
  ball(fur, head, 0, 1.64, 0, .22, .2, .21);
  block(muzzle, head, 0, 1.54, -.14, .3, .18, .2);
  ball(dark, head, 0, 1.6, -.235, .09, .04, .03);
  ball('#fff7e6', head, -.03, 1.615, -.262, .022, .009, .008);
  ball(dark, head, 0, 1.47, -.24, .06, .01, .01);
  for (const side of [-1, 1]) {
    block('#fff6e4', head, side * .018, 1.43, -.235, .034, .055, .02);
    ball('#2d2019', head, side * .032, 1.595, -.262, .015, .01, .008);
    ball(blush, head, side * .12, 1.5, -.2, .045, .025, .02, new THREE.Euler(0, side * -.6, 0));
    // Eyes face out and forward; offsets follow that normal so nothing sinks in.
    const nx = side * .7, nz = -.71, face = new THREE.Euler(0, side * -.78, 0);
    const at = (d: number, up = 0, across = 0) => [side * .13 + nx * d - nz * across * side, 1.7 + up, -.15 + nz * d + nx * across * side] as const;
    ball('#fdf6e8', head, ...at(0), .055, .062, .026, face);
    ball('#1b140f', head, ...at(.016), .043, .052, .017, face);
    ball('#ffffff', head, ...at(.03, .018, -.012), .013, .015, .006, face);
    ball(dark, head, side * .15, 1.8, .03, .06, .065, .04, new THREE.Euler(0, 0, side * -.3));
    ball(earInner, head, side * .153, 1.8, .005, .036, .04, .015, new THREE.Euler(0, 0, side * -.3));
  }

  // Arms reach forward to the weapon: teal sleeve, fur forearm, tape wrap, paw.
  // They share one bone so the arms and the gun aim together.
  const hands = [new THREE.Vector3(.13, 1.04, -.4), new THREE.Vector3(-.04, 1.06, -.6)];
  for (const [i, side] of [[0, 1], [1, -1]] as const) {
    const shoulder = new THREE.Vector3(side * .25, 1.17, -.02), hand = hands[i];
    const elbow = shoulder.clone().lerp(hand, .5).add(new THREE.Vector3(side * .06, -.08, 0));
    ball('#35a39c', arms, shoulder.x, shoulder.y, shoulder.z, .12, .12, .12);
    limb('#35a39c', arms, shoulder, elbow, .1);
    ball('#2b8a85', arms, elbow.x, elbow.y, elbow.z, .1, .1, .1);
    limb(fur, arms, elbow, hand, .08);
    limb('#efdcb0', arms, elbow.clone().lerp(hand, .62), elbow.clone().lerp(hand, .8), .086);
    ball(fur, arms, hand.x, hand.y, hand.z, .085, .075, .09);
  }

  // Armour (bone 9): a snug khaki vest with two chest pouches.
  ball('#66714f', armor, 0, .98, 0, .315, .28, .295);
  for (const side of [-1, 1]) {
    block('#7d8a60', armor, side * .12, .95, -.27, .13, .12, .05);
    block('#e2b05e', armor, side * .12, 1.0, -.297, .05, .025, .012);
  }
  block('#6d4a31', armor, 0, 1.08, .28, .34, .05, .035);
  // Helmet (bone 10): a round dome with a brim and a brass badge.
  ball('#5a7064', helmet, 0, 1.76, 0, .235, .11, .225);
  block('#48594f', helmet, 0, 1.71, -.19, .3, .035, .1);
  block('#e2b05e', helmet, 0, 1.78, -.215, .05, .045, .015);

  const geometry = mergeGeometries(parts, false);
  parts.forEach(item => item.dispose());
  sphere.dispose(); small.dispose(); cylinder.dispose(); roundedBox.dispose();
  if (!geometry) throw new Error('Cannot merge capybara geometry');
  geometry.computeBoundingSphere(); parts.length = 0; releaseAfterUpload(geometry);
  geometryCache.set(color, geometry);
  geometry.addEventListener('dispose', () => geometryCache.delete(color));
  return geometry;
}

export function buildCapybaraBody(color: string): { body: THREE.SkinnedMesh; bones: THREE.Bone[]; dispose: () => void } {
  // An opted-in avatar must be final when it enters the scene, never replaced later.
  if (capybaraV3Enabled() && !characterAsset) throw new Error('A capivara v3 ainda não está pronta.');
  const geometry = capybaraGeometry(color);
  const { torso, head, arms, thighL, thighR, shinL, shinR, armor, helmet } = CAPY_BONES;
  const body = new THREE.SkinnedMesh(geometry, capybaraMaterial());
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
  if (capybaraV3Enabled()) installCharacter(body, bones, color);
  // The geometry is shared: it is released with the renderer, not per avatar.
  return { body, bones, dispose: () => {} };
}

// Opt-in asset path. Geometry, atlas, and clips are shared; poses are private.
export const CAPYBARA_ASSET_URL = `${import.meta.env.BASE_URL}models/capybara/capybara.glb`;
export const capybaraV3Enabled = () => typeof location !== 'undefined' && new URLSearchParams(location.search).get('capy') === 'v3';
let characterAsset: GLTF | null = null;
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
  const material = source.clone(); material.map = atlas;
  material.name = `Capivara_bandana_${tint.getHexString()}`;
  material.addEventListener('dispose', () => { atlas.dispose(); characterMaterials.delete(key); });
  characterMaterials.set(key, material);
  return material;
}
interface CharacterInstance {
  scene: THREE.Group; mixer: THREE.AnimationMixer; actions: Record<string, THREE.AnimationAction>;
  faceActions: (THREE.AnimationAction | undefined)[];
  active: string; expression: CapybaraExpression; forcedExpression: CapybaraExpression | null; faceTime: number;
  lastHP: number; lastKills: number; unarmed: number; head: THREE.Bone; arms: THREE.Bone[]; root: THREE.Bone; elapsed: number;
  legacyBones: THREE.Bone[]; skeleton: THREE.Skeleton; poseBones: THREE.Bone[]; baseRotations: THREE.Quaternion[];
  relaxedArms: THREE.Quaternion[]; armBlends: THREE.Quaternion[];
}

export function preloadCapybaraAsset(load?: (url: string) => Promise<GLTF>): Promise<void> {
  if (!capybaraV3Enabled()) return Promise.resolve();
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
  geometryCache.forEach(geometry => geometry.dispose());
  sharedMaterial?.dispose();
}

export type CapybaraExpression = 'neutral' | 'determined' | 'hit' | 'stunned' | 'victory' | 'blink';
const FACE_EXPRESSIONS: readonly CapybaraExpression[] = ['neutral', 'determined', 'hit', 'stunned', 'victory', 'blink'];

/** Explicit emotes and review poses share the same facial blend as combat. */
export function setCapybaraExpression(body: THREE.SkinnedMesh, expression: CapybaraExpression | null): void {
  const runtime = characterInstances.get(body);
  if (runtime) runtime.forcedExpression = expression;
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
    lastHP: NaN, lastKills: NaN, unarmed: 0, elapsed: 0, skeleton, legacyBones, poseBones: [], baseRotations: [], relaxedArms: [], armBlends: [],
    head: scene.getObjectByName('head') as THREE.Bone,
    root: scene.getObjectByName('root') as THREE.Bone,
    arms: [scene.getObjectByName('arm_L') as THREE.Bone, scene.getObjectByName('arm_R') as THREE.Bone],
  };
  scene.updateMatrixWorld(true);
  for (let i = 0; i < runtime.arms.length; i++) {
    const arm = runtime.arms[i], paw = scene.getObjectByName(i === 0 ? 'paw_L' : 'paw_R');
    if (!paw) { runtime.relaxedArms.push(new THREE.Quaternion()); runtime.armBlends.push(new THREE.Quaternion()); continue; }
    const shoulder = arm.getWorldPosition(new THREE.Vector3());
    const from = paw.getWorldPosition(new THREE.Vector3()).sub(shoulder).normalize();
    const to = new THREE.Vector3(i === 0 ? -.35 : .35, .7, -.02).sub(shoulder).normalize();
    const parent = arm.parent!.getWorldQuaternion(new THREE.Quaternion());
    const worldSwing = new THREE.Quaternion().setFromUnitVectors(from, to);
    runtime.relaxedArms.push(parent.clone().invert().multiply(worldSwing).multiply(parent));
    runtime.armBlends.push(new THREE.Quaternion());
  }
  runtime.poseBones = [runtime.head, runtime.root, ...runtime.arms];
  runtime.baseRotations = runtime.poseBones.map(bone => bone.quaternion.clone());
  characterInstances.set(body, runtime);
  // Keep the old skeleton as the compatibility weapon socket; only its mesh goes.
  body.geometry = new THREE.BufferGeometry();
  body.add(scene);
  body.name = 'Capivara_v3';
  const originalDispose = body.skeleton.dispose.bind(body.skeleton);
  body.skeleton.dispose = () => {
    mixer.stopAllAction(); mixer.uncacheRoot(scene); skeleton.dispose();
    body.geometry.dispose(); characterInstances.delete(body); originalDispose();
  };
  if (new URLSearchParams(location.search).has('capyHitboxes')) body.add(createCapybaraHitboxOverlay());
}

export function createCapybaraHitboxOverlay(): THREE.Group {
  const group = new THREE.Group(); group.name = 'Hitboxes_normais';
  const head = new THREE.Mesh(new THREE.SphereGeometry(.25, 20, 12), new THREE.MeshBasicMaterial({ color: '#ff427b', wireframe: true, depthTest: false, transparent: true, opacity: .55 }));
  head.position.set(0, 1.6, -.04);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, 1.42, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#46e8ff', wireframe: true, depthTest: false, transparent: true, opacity: .4 }));
  body.position.y = .71;
  group.add(head, body); return group;
}

/** Returns true when the opt-in rig owns this pose. No allocations per update. */
export function updateCapybaraBody(body: THREE.SkinnedMesh, actor: ActorState, dt: number): boolean {
  const runtime = characterInstances.get(body);
  if (!runtime) return false;
  const { mixer, actions, head, root, arms, legacyBones } = runtime;
  const speed = Math.hypot(actor.velocity.x, actor.velocity.z);
  const next = actor.stage !== 'ground' || !actor.grounded ? 'jump' : speed > .35 ? 'run' : 'idle';
  if (next !== runtime.active) {
    actions[runtime.active].fadeOut(.15);
    actions[next].reset().fadeIn(.15).play(); runtime.active = next;
  }
  actions.run.timeScale = Math.max(.4, Math.min(1.7, speed / 6));
  for (let i = 0; i < runtime.poseBones.length; i++) runtime.poseBones[i].quaternion.copy(runtime.baseRotations[i]);
  const step = Math.min(dt, .1);
  runtime.faceTime = Math.max(0, runtime.faceTime - step);
  if (actor.hp < runtime.lastHP) { runtime.expression = 'hit'; runtime.faceTime = .38; }
  else if (actor.kills > runtime.lastKills) { runtime.expression = 'victory'; runtime.faceTime = .8; }
  runtime.lastHP = actor.hp; runtime.lastKills = actor.kills;
  if (!actor.alive) { runtime.expression = 'stunned'; runtime.faceTime = .5; }
  else if (!runtime.faceTime) runtime.expression = actor.ads ? 'determined' : 'neutral';
  const expression = runtime.forcedExpression || runtime.expression;
  for (let i = 0; i < FACE_EXPRESSIONS.length; i++) {
    const action = runtime.faceActions[i];
    if (action) action.setEffectiveWeight(THREE.MathUtils.damp(action.getEffectiveWeight(), expression === FACE_EXPRESSIONS[i] ? 1 : 0, 24, step));
  }
  runtime.elapsed += step; mixer.update(step);
  for (let i = 0; i < runtime.poseBones.length; i++) runtime.baseRotations[i].copy(runtime.poseBones[i].quaternion);
  const pitch = THREE.MathUtils.clamp(actor.pitch, -1, 1);
  head.rotateX(pitch * .45);
  const resting = !actor.weapons[actor.slot] && actor.stage === 'ground';
  runtime.unarmed = THREE.MathUtils.damp(runtime.unarmed, resting ? 1 : 0, 12, step);
  for (let i = 0; i < arms.length; i++) {
    arms[i].rotateX((pitch * .65 + (actor.sprint ? -.18 : 0)) * (1 - runtime.unarmed));
    // Swing into the side-of-hip rest target in parent space, avoiding hands
    // buried in the belly when rotating only around the upper-arm local X axis.
    runtime.armBlends[i].identity().slerp(runtime.relaxedArms[i], runtime.unarmed);
    arms[i].quaternion.premultiply(runtime.armBlends[i]);
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
  return true;
}
