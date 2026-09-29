import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { applyCharacterStyle } from './materials';

export const FP_ARMS_URL = 'models/fp/fp-arms.glb';
export type Side = 'R' | 'L';
export const FINGERS = ['index', 'middle', 'ring', 'thumb'] as const;
export type Finger = typeof FINGERS[number];
/** Curl in radians per joint (knuckle, middle, tip); `spread` swings the thumb
 * away from the fingers in the palm plane (radians, 0 = the modelled rest). */
export type HandCurl = Record<Finger, readonly [number, number, number]> & { spread?: number };
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

/** Per-joint linear blend of two paw poses (thumb spread included). */
export function blendCurl(a: HandCurl, b: HandCurl, t: number): HandCurl {
  const mix = (x: readonly [number, number, number], y: readonly [number, number, number]) => [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t] as const;
  const spread = (a.spread ?? 0) + ((b.spread ?? 0) - (a.spread ?? 0)) * t;
  return { index: mix(a.index, b.index), middle: mix(a.middle, b.middle), ring: mix(a.ring, b.ring), thumb: mix(a.thumb, b.thumb), spread };
}

interface ChainBone { bone: THREE.Bone; restWorld: THREE.Quaternion; restLocal: THREE.Quaternion; length: number }
interface FingerBone { bone: THREE.Bone; restLocal: THREE.Quaternion; hinge: THREE.Vector3; spread?: THREE.Vector3 }
/** Shared articulation for the world character and first-person paws. Joint
 * axes come from the bind geometry itself (digit directions and the palm they
 * curl toward), so both rigs flex the same way whatever their export frame. */
export class PawPose {
  private readonly fingers = {} as Record<Finger, FingerBone[]>;
  constructor(root: THREE.Object3D, side: Side, prefix = '', skeleton?: THREE.Skeleton) {
    root.updateMatrixWorld(true);
    const bind = (bone: THREE.Bone) => {
      const index = skeleton?.bones.indexOf(bone) ?? -1;
      return index >= 0 ? skeleton!.boneInverses[index].clone().invert() : bone.matrixWorld.clone();
    };
    const find = (name: string) => { const bone = root.getObjectByName(`${prefix}${name}_${side}`); return bone instanceof THREE.Bone ? bone : null; };
    const at = (name: string) => { const bone = find(name); return bone ? new THREE.Vector3().setFromMatrixPosition(bind(bone)) : null; };
    // Palm normal: the side the digits curl toward. The left paw mirrors the right.
    const index1 = at('index1'), ring1 = at('ring1'), middle1 = at('middle1'), middle3 = at('middle3');
    let palm: THREE.Vector3 | null = null;
    if (index1 && ring1 && middle1 && middle3) {
      const along = new THREE.Vector3().subVectors(middle3, middle1).normalize();
      palm = new THREE.Vector3().subVectors(index1, ring1).cross(along).multiplyScalar(side === 'R' ? 1 : -1).normalize();
    }
    for (const finger of FINGERS) {
      this.fingers[finger] = [];
      const base = at(`${finger}1`), tip = at(`${finger}3`);
      for (let i = 1; i <= 3; i++) {
        const bone = find(`${finger}${i}`);
        if (!bone) {
          if (!skeleton) throw new Error(`Pata sem osso ${prefix}${finger}${i}_${side}.`);
          continue;
        }
        const worldMatrix = bind(bone), world = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(worldMatrix));
        const local = skeleton && bone.parent instanceof THREE.Bone
          ? new THREE.Quaternion().setFromRotationMatrix(bind(bone.parent).invert().multiply(worldMatrix)) : bone.quaternion.clone();
        let hinge = new THREE.Vector3(-1, 0, 0), spread: THREE.Vector3 | undefined;
        if (palm && base && tip) {
          const along = new THREE.Vector3().subVectors(tip, base).normalize();
          if (finger === 'thumb') {
            // The thumb flexes toward the palm and across to the fingers; it spreads in the palm plane.
            const across = new THREE.Vector3().subVectors(middle1!, base).addScaledVector(along, -new THREE.Vector3().subVectors(middle1!, base).dot(along)).normalize();
            hinge = new THREE.Vector3().crossVectors(along, palm.clone().multiplyScalar(.8).addScaledVector(across, .6)).normalize();
            spread = palm.clone();
            if (new THREE.Vector3().crossVectors(spread, along).dot(across) > 0) spread.negate();
            if (i === 1) spread.applyQuaternion(world.clone().invert()).normalize(); else spread = undefined;
          } else hinge = new THREE.Vector3().crossVectors(along, palm).normalize();
        }
        this.fingers[finger].push({ bone, restLocal: local, hinge: hinge.applyQuaternion(world.invert()).normalize(), spread });
      }
    }
  }
  apply(curl: HandCurl) {
    for (const finger of FINGERS) this.fingers[finger].forEach((f, i) => {
      f.bone.quaternion.copy(f.restLocal);
      if (f.spread && curl.spread) f.bone.quaternion.multiply(tmpQ.setFromAxisAngle(f.spread, curl.spread));
      f.bone.quaternion.multiply(tmpQ.setFromAxisAngle(f.hinge, curl[finger][i]));
    });
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

// Shell fur: the fur faces repeated as offset shells in one skinned draw. Each
// shell keeps only the strands of a 3D noise field anchored to the bind pose,
// thinning toward the tips and combed toward the paw, so the silhouette reads
// as a pelt instead of a tube. The count follows the graphics preset.
export const FUR_SHELLS = 12;
const FUR_LENGTH = .0055;
function furShellMesh(mesh: THREE.SkinnedMesh, base: THREE.MeshStandardMaterial): THREE.SkinnedMesh | null {
  const source = mesh.geometry, index = source.index;
  if (!index) return null;
  // The pelt is baked as a `_fur` length per vertex (0 on pads, claws and cloth).
  const furLength = source.getAttribute('_fur');
  if (!furLength) return null;
  const grows = (v: number) => furLength.getX(v) > .02;
  const fur: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    if (grows(a) && grows(b) && grows(c)) fur.push(a, b, c);
  }
  const used = [...new Set(fur)], remap = new Map(used.map((v, i) => [v, i]));
  const geometry = new THREE.BufferGeometry();
  // Plain floats: the source streams are quantised (and possibly interleaved);
  // getComponent returns the decoded value.
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const size = attribute.itemSize, array = new Float32Array(used.length * FUR_SHELLS * size);
    used.forEach((v, i) => { for (let k = 0; k < size; k++) array[i * size + k] = attribute.getComponent(v, k); });
    for (let s = 1; s < FUR_SHELLS; s++) array.copyWithin(s * used.length * size, 0, used.length * size);
    geometry.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  // Bind-pose position in metres (quantisation lives in the inverse bind
  // matrices): the strand field stays glued to the skin as it deforms.
  const rest = new Float32Array(used.length * FUR_SHELLS * 3), p = new THREE.Vector3();
  used.forEach((v, i) => {
    mesh.getVertexPosition(v, p);
    for (let s = 0; s < FUR_SHELLS; s++) p.toArray(rest, (s * used.length + i) * 3);
  });
  geometry.setAttribute('furRest', new THREE.BufferAttribute(rest, 3));
  const shell = new Float32Array(used.length * FUR_SHELLS);
  for (let s = 0; s < FUR_SHELLS; s++) shell.fill((s + 1) / FUR_SHELLS, s * used.length, (s + 1) * used.length);
  geometry.setAttribute('furShell', new THREE.BufferAttribute(shell, 1));
  const lengths = new Float32Array(used.length * FUR_SHELLS);
  used.forEach((v, i) => { for (let s = 0; s < FUR_SHELLS; s++) lengths[s * used.length + i] = furLength.getX(v); });
  geometry.setAttribute('furLength', new THREE.BufferAttribute(lengths, 1));
  const indices = new Uint32Array(fur.length * FUR_SHELLS);
  for (let s = 0; s < FUR_SHELLS; s++) fur.forEach((v, i) => { indices[s * fur.length + i] = s * used.length + remap.get(v)!; });
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.userData.shellIndices = fur.length;
  const material = base.clone();
  const uniforms = { uFurLength: { value: FUR_LENGTH }, uFurSpan: { value: 1 } };
  material.userData.furSpan = 1;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.uniforms.uFurSpan = { get value() { return material.userData.furSpan; } };
    shader.vertexShader = `attribute float furShell;\nattribute float furLength;\nattribute vec3 furRest;\nuniform float uFurLength, uFurSpan;\nvarying float vFurShell;\nvarying vec3 vFurRest;\n${shader.vertexShader}`
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        float shellHeight = min(1.0, furShell * uFurSpan);
        vFurShell = shellHeight; vFurRest = furRest;
        vec3 furComb = vec3(0.0, 0.0, -1.0);
        #ifdef USE_SKINNING
          furComb = normalize((skinMatrix * vec4(furComb, 0.0)).xyz);
        #endif
        vec3 furUp = normalize(objectNormal);
        float furReach = uFurLength * furLength;
        transformed += furUp * shellHeight * furReach + (furComb - furUp * dot(furComb, furUp)) * shellHeight * shellHeight * furReach * .9;`);
    shader.fragmentShader = `varying float vFurShell;\nvarying vec3 vFurRest;
      float furHash3(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float furNoise3(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(furHash3(i), furHash3(i + vec3(1, 0, 0)), f.x), mix(furHash3(i + vec3(0, 1, 0)), furHash3(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(furHash3(i + vec3(0, 0, 1)), furHash3(i + vec3(1, 0, 1)), f.x), mix(furHash3(i + vec3(0, 1, 1)), furHash3(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
      ${shader.fragmentShader}`
      .replace('#include <color_fragment>', `#include <color_fragment>
        float furStrand = furNoise3(vFurRest * 760.0) * .72 + furNoise3(vFurRest * 170.0) * .38;
        if (furStrand < mix(.42, .9, vFurShell)) discard;
        diffuseColor.rgb *= mix(.62, 1.14, vFurShell);`);
  };
  material.customProgramCacheKey = () => 'fp-fur-shells-v1';
  const shells = new THREE.SkinnedMesh(geometry, material);
  shells.name = `${mesh.name}_fur`; shells.frustumCulled = false; shells.castShadow = false;
  shells.bind(mesh.skeleton, mesh.bindMatrix);
  return shells;
}

export class ArmsRig {
  readonly group = new THREE.Group();
  readonly right: Arm;
  readonly left: Arm;
  private readonly meshes: THREE.SkinnedMesh[] = [];
  private readonly shells: THREE.SkinnedMesh[] = [];
  private readonly sides = new Map<THREE.SkinnedMesh, Side>();
  constructor(gltf: GLTF) {
    const scene = gltf.scene;
    this.group.name = 'fp-arms';
    this.group.add(scene);
    scene.updateMatrixWorld(true);
    scene.traverse(object => { if (object instanceof THREE.SkinnedMesh && !object.name.endsWith('_fur')) this.meshes.push(object); });
    for (const mesh of this.meshes) {
      mesh.frustumCulled = false; mesh.castShadow = false;
      // The arms carry their own baked sculpt maps (colour, normal, roughness).
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.vertexColors = false;
      const side: Side = mesh.name.endsWith('R') ? 'R' : 'L';
      this.sides.set(mesh, side);
      let shells = (mesh.parent!.getObjectByName(`${mesh.name}_fur`) as THREE.SkinnedMesh | undefined) ?? null;
      if (!shells && (shells = furShellMesh(mesh, material))) {
        applyCharacterStyle(shells.material as THREE.MeshStandardMaterial, 4);
        mesh.parent!.add(shells);
      }
      if (shells) { this.shells.push(shells); this.sides.set(shells, side); }
      applyCharacterStyle(material, 4);
    }
    this.right = new Arm(scene, 'R');
    this.left = new Arm(scene, 'L');
  }
  /** Shells drawn (0 turns the fur off); fewer shells spread over the same length. */
  setFurShells(count: number) {
    const drawn = Math.max(0, Math.min(FUR_SHELLS, Math.round(count)));
    for (const shells of this.shells) {
      shells.geometry.setDrawRange(0, shells.geometry.userData.shellIndices * drawn);
      shells.userData.hidden = drawn === 0;
      if (drawn === 0) shells.visible = false;
      (shells.material as THREE.MeshStandardMaterial).userData.furSpan = FUR_SHELLS / Math.max(1, drawn);
    }
  }
  setVisible(right: boolean, left: boolean) {
    for (const mesh of [...this.meshes, ...this.shells]) mesh.visible = (this.sides.get(mesh) === 'R' ? right : left) && !mesh.userData.hidden;
  }
  dispose() {
    for (const mesh of [...this.meshes, ...this.shells]) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
    for (const mesh of this.meshes) mesh.skeleton.dispose();
  }
}
