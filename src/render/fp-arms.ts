import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { applyCharacterStyle } from './materials';

export const FP_ARMS_URL = 'models/fp/fp-arms.glb';
export type Side = 'R' | 'L';
export const FINGERS = ['index', 'middle', 'ring', 'thumb'] as const;
export type Finger = typeof FINGERS[number];
/** Curl in radians per joint (knuckle, middle, tip). */
export type HandCurl = Record<Finger, readonly [number, number, number]>;
/** A hand target in the viewmodel (camera) space. */
export interface HandTarget {
  wrist: THREE.Vector3;
  /** Wrist to knuckles. */
  forward: THREE.Vector3;
  /** Out of the palm. */
  palm: THREE.Vector3;
  curl: HandCurl;
  /** Where the elbow should point (camera space direction). */
  pole: THREE.Vector3;
}

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), tmpD = new THREE.Vector3();
const tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion();
const basis = new THREE.Matrix4(), basis2 = new THREE.Matrix4();

// A frame from a primary axis and a secondary hint; returns the rotation that
// maps the reference (x: primary, y: secondary) onto it.
function frameQuaternion(primary: THREE.Vector3, secondary: THREE.Vector3, out: THREE.Quaternion) {
  const p = tmpA.copy(primary).normalize();
  const s = tmpB.copy(secondary).addScaledVector(p, -secondary.dot(p)).normalize();
  const t = tmpC.crossVectors(p, s);
  basis.makeBasis(p, s, t);
  return out.setFromRotationMatrix(basis);
}

interface ChainBone { bone: THREE.Bone; restWorld: THREE.Quaternion; restLocal: THREE.Quaternion; length: number }
interface FingerBone { bone: THREE.Bone; restLocal: THREE.Quaternion; hinge: THREE.Vector3 }
/** Shared articulation for the world character and first-person paws. */
export class PawPose {
  private readonly fingers = {} as Record<Finger, FingerBone[]>;
  constructor(root: THREE.Object3D, side: Side, prefix = '', skeleton?: THREE.Skeleton) {
    root.updateMatrixWorld(true);
    const bind = (bone: THREE.Bone) => {
      const index = skeleton?.bones.indexOf(bone) ?? -1;
      return index >= 0 ? skeleton!.boneInverses[index].clone().invert() : bone.matrixWorld.clone();
    };
    for (const finger of FINGERS) {
      this.fingers[finger] = [];
      for (let i = 1; i <= 3; i++) {
        const bone = root.getObjectByName(`${prefix}${finger}${i}_${side}`);
        if (!(bone instanceof THREE.Bone)) {
          if (!skeleton) throw new Error(`Pata sem osso ${prefix}${finger}${i}_${side}.`);
          continue;
        }
        const worldMatrix = bind(bone), world = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(worldMatrix));
        const local = skeleton && bone.parent instanceof THREE.Bone
          ? new THREE.Quaternion().setFromRotationMatrix(bind(bone.parent).invert().multiply(worldMatrix)) : bone.quaternion.clone();
        const hinge = finger === 'thumb' ? new THREE.Vector3(-.63, side === 'R' ? -.63 : .63, side === 'R' ? .455 : -.455).normalize()
          : new THREE.Vector3(-1, 0, 0);
        this.fingers[finger].push({ bone, restLocal: local, hinge: hinge.applyQuaternion(world.invert()).normalize() });
      }
    }
  }
  apply(curl: HandCurl) {
    for (const finger of FINGERS) this.fingers[finger].forEach((f, i) =>
      f.bone.quaternion.copy(f.restLocal).multiply(tmpQ.setFromAxisAngle(f.hinge, curl[finger][i])));
  }
}

class Arm {
  readonly upper: ChainBone; readonly fore: ChainBone; readonly hand: ChainBone;
  readonly twist?: ChainBone;
  readonly paw: PawPose;
  // Rest frames (world, arm pointing -Z, palm down).
  private readonly restChain: THREE.Quaternion;
  private readonly restHand: THREE.Quaternion;
  readonly shoulderRest = new THREE.Vector3();
  constructor(readonly root: THREE.Object3D, readonly side: Side) {
    const bone = (name: string) => {
      const found = root.getObjectByName(`${name}_${side}`);
      if (!(found instanceof THREE.Bone)) throw new Error(`Braço sem osso ${name}_${side}.`);
      return found;
    };
    root.updateMatrixWorld(true);
    const chain = (name: string, child: string): ChainBone => {
      const b = bone(name), c = bone(child);
      return { bone: b, restWorld: b.getWorldQuaternion(new THREE.Quaternion()), restLocal: b.quaternion.clone(),
        length: b.getWorldPosition(new THREE.Vector3()).distanceTo(c.getWorldPosition(new THREE.Vector3())) };
    };
    this.upper = chain('upper', 'fore'); this.fore = chain('fore', 'hand'); this.hand = chain('hand', 'middle1');
    if (root.getObjectByName(`fore_twist_${side}`)) this.twist = chain('fore_twist', 'hand');
    this.upper.bone.getWorldPosition(this.shoulderRest);
    // Chain rest frame: along -Z, hinge normal -X (elbow drops under the arm).
    this.restChain = frameQuaternion(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Quaternion());
    // Hand rest frame: fingers -Z, palm -Y.
    this.restHand = frameQuaternion(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0), new THREE.Quaternion());
    this.paw = new PawPose(root, side);
  }

  private setWorld(chain: ChainBone, world: THREE.Quaternion) {
    const parent = chain.bone.parent!;
    parent.getWorldQuaternion(tmpQ2).invert();
    chain.bone.quaternion.copy(tmpQ2).multiply(world);
    chain.bone.updateMatrixWorld(true);
  }

  solve(shoulder: THREE.Vector3, target: HandTarget) {
    const a = this.upper.length, b = this.fore.length;
    const toTarget = tmpD.subVectors(target.wrist, shoulder);
    let d = toTarget.length();
    const reach = (a + b) * .985;
    // Out of reach: slide the (hidden) shoulder toward the paw instead of letting it float.
    const start = new THREE.Vector3().copy(shoulder);
    if (d > reach) { start.addScaledVector(toTarget.normalize(), d - reach); d = reach; }
    d = Math.max(d, Math.abs(a - b) + .02);
    const dir = new THREE.Vector3().subVectors(target.wrist, start).normalize();
    const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    const perp = new THREE.Vector3().copy(target.pole).addScaledVector(dir, -target.pole.dot(dir));
    if (perp.lengthSq() < 1e-8) perp.copy(Y).multiplyScalar(-1);
    perp.normalize();
    const elbow = new THREE.Vector3().copy(start).addScaledVector(dir, a * cosA).addScaledVector(perp, a * sinA);
    // Place the chain root, then orient each segment. Frames carry the bend plane.
    const parent = this.upper.bone.parent!;
    parent.updateMatrixWorld(true);
    this.upper.bone.position.copy(parent.worldToLocal(start.clone()));
    const upperDir = new THREE.Vector3().subVectors(elbow, start);
    const foreDir = new THREE.Vector3().subVectors(target.wrist, elbow);
    const normal = new THREE.Vector3().crossVectors(upperDir, perp).normalize();
    if (normal.lengthSq() < 1e-8) normal.copy(X).multiplyScalar(-1);
    // Hinge axis for both segments is the bend-plane normal (keeps the elbow a true hinge).
    const q = new THREE.Quaternion();
    frameQuaternion(upperDir, normal, q).multiply(tmpQ.copy(this.restChain).invert()).multiply(this.upper.restWorld);
    this.upper.bone.updateMatrixWorld(true); this.setWorld(this.upper, q);
    // The elbow keeps its bend plane. Skin weights distribute the distal roll
    // along a separate twist joint, with a shared wrist loop at the palm.
    const handSide = new THREE.Vector3().crossVectors(target.forward, target.palm).normalize();
    frameQuaternion(foreDir, normal, q)
      .multiply(tmpQ.copy(this.restChain).invert()).multiply(this.fore.restWorld);
    this.setWorld(this.fore, q);
    if (this.twist) {
      const proximal = q.clone();
      const projected = handSide.addScaledVector(foreDir, -handSide.dot(foreDir) / foreDir.lengthSq());
      frameQuaternion(foreDir, projected.lengthSq() > 1e-6 ? projected : normal, q)
        .multiply(tmpQ.copy(this.restChain).invert()).multiply(this.twist.restWorld);
      // Split a large roll across both joints: linear skinning must never blend
      // directly across an almost 180-degree forearm rotation.
      this.setWorld(this.fore, proximal.slerp(q, .5));
      this.setWorld(this.twist, q);
    }
    frameQuaternion(target.forward, target.palm, q).multiply(tmpQ.copy(this.restHand).invert()).multiply(this.hand.restWorld);
    this.setWorld(this.hand, q);
    this.paw.apply(target.curl);
  }
}

// Painted fur: strands follow the arm (rest-pose space, so they never swim while
// the skin deforms), darker roots between clumps, lighter tips catching the key.
// Only warm, saturated vertex colours (fur) receive it; the dark paws stay leathery.
function applyFurStrands(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vRest;
        float furHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float furNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(furHash(i), furHash(i + vec2(1, 0)), f.x), mix(furHash(i + vec2(0, 1)), furHash(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float furMask = smoothstep(.08, .2, vColor.r - vColor.b) * smoothstep(.02, .08, vColor.r);
        float around = atan(vRest.x - sign(vRest.x) * .2, vRest.y);
        vec2 strandUv = vec2(around * 9.0, vRest.z * 38.0);
        float clump = furNoise(strandUv * vec2(1.0, .35));
        float strand = furNoise(strandUv * vec2(4.0, .6) + clump * 2.0);
        float fur = mix(.72, 1.12, smoothstep(.15, .85, clump * .6 + strand * .4));
        diffuseColor.rgb *= mix(1.0, fur, furMask);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float furN = furMask * (furNoise(strandUv * vec2(3.0, .5)) - .5);
          normal = normalize(normal + vec3(furN * .35, furN * .2, 0.0));
        }`);
  };
  material.customProgramCacheKey = () => 'fp-fur-strands-v1';
}

// The arms ship without textures: they use the character's surface atlas (same
// tiles, same UV projection), so the maps are downloaded and uploaded once.
const SURFACE_MAPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'] as const;
function sharedSurfaces(character?: GLTF): THREE.MeshStandardMaterial | null {
  let found: THREE.MeshStandardMaterial | null = null;
  character?.scene.traverse(object => {
    const material = (object as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (!found && material?.userData?.capySurfaceAtlas && material.map) found = material;
  });
  return found;
}

export class ArmsRig {
  readonly group = new THREE.Group();
  readonly right: Arm;
  readonly left: Arm;
  private readonly meshes: THREE.SkinnedMesh[] = [];
  constructor(gltf: GLTF, character?: GLTF) {
    const scene = gltf.scene;
    this.group.name = 'fp-arms';
    this.group.add(scene);
    const surfaces = sharedSurfaces(character);
    scene.traverse(object => {
      if (object instanceof THREE.SkinnedMesh) {
        object.frustumCulled = false; object.castShadow = false;
        const material = object.material as THREE.MeshStandardMaterial;
        if (surfaces && material.userData.sharedSurfaces) for (const key of SURFACE_MAPS) material[key] = surfaces[key];
        material.vertexColors = true; material.roughness = .92; material.metalness = 0;
        if (!material.userData.capySurfaceAtlas) applyFurStrands(material);
        applyCharacterStyle(material, 4);
        this.meshes.push(object);
      }
    });
    this.right = new Arm(scene, 'R');
    this.left = new Arm(scene, 'L');
  }
  setVisible(right: boolean, left: boolean) {
    for (const mesh of this.meshes) mesh.visible = mesh.name.endsWith('R') ? right : left;
  }
  dispose() {
    for (const mesh of this.meshes) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh.skeleton.dispose(); }
  }
}
