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
class Arm {
  readonly upper: ChainBone; readonly fore: ChainBone; readonly hand: ChainBone;
  readonly fingers = {} as Record<Finger, FingerBone[]>;
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
    this.upper.bone.getWorldPosition(this.shoulderRest);
    // Chain rest frame: along -Z, hinge normal -X (elbow drops under the arm).
    this.restChain = frameQuaternion(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Quaternion());
    // Hand rest frame: fingers -Z, palm -Y.
    this.restHand = frameQuaternion(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0), new THREE.Quaternion());
    for (const finger of FINGERS) {
      this.fingers[finger] = [1, 2, 3].map(i => {
        const b = bone(`${finger}${i}`);
        const world = b.getWorldQuaternion(new THREE.Quaternion());
        // Digits curl toward the palm; the thumb folds across it.
        const hingeWorld = finger === 'thumb' ? new THREE.Vector3(-.63, side === 'R' ? -.63 : .63, side === 'R' ? .455 : -.455).normalize()
          : new THREE.Vector3(-1, 0, 0);
        return { bone: b, restLocal: b.quaternion.clone(), hinge: hingeWorld.applyQuaternion(world.clone().invert()).normalize() };
      });
    }
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
    // The forearm twists halfway toward the paw's roll so the wrist never candy-wraps.
    const handSide = new THREE.Vector3().crossVectors(target.forward, target.palm).normalize();
    const foreNormal = new THREE.Vector3().copy(normal).lerp(handSide.multiplyScalar(-1), .45);
    frameQuaternion(foreDir, foreNormal.lengthSq() > 1e-6 ? foreNormal : normal, q)
      .multiply(tmpQ.copy(this.restChain).invert()).multiply(this.fore.restWorld);
    this.setWorld(this.fore, q);
    frameQuaternion(target.forward, target.palm, q).multiply(tmpQ.copy(this.restHand).invert()).multiply(this.hand.restWorld);
    this.setWorld(this.hand, q);
    for (const finger of FINGERS) {
      const bones = this.fingers[finger], curl = target.curl[finger];
      bones.forEach((f, i) => f.bone.quaternion.copy(f.restLocal).multiply(tmpQ.setFromAxisAngle(f.hinge, curl[i])));
    }
  }
}

export class ArmsRig {
  readonly group = new THREE.Group();
  readonly right: Arm;
  readonly left: Arm;
  private readonly meshes: THREE.SkinnedMesh[] = [];
  constructor(gltf: GLTF) {
    const scene = gltf.scene;
    this.group.name = 'fp-arms';
    this.group.add(scene);
    scene.traverse(object => {
      if (object instanceof THREE.SkinnedMesh) {
        object.frustumCulled = false; object.castShadow = false;
        const material = object.material as THREE.MeshStandardMaterial;
        material.vertexColors = true; material.roughness = .92; material.metalness = 0;
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
