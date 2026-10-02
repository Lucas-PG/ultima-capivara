import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { applyCharacterStyle } from './materials';

export const FP_ARMS_URL = 'models/fp/fp-arms.glb';
export type Side = 'R' | 'L';
export const FINGERS = ['index', 'middle', 'ring', 'thumb'] as const;
export type Finger = typeof FINGERS[number];
/** Curl in radians per joint (knuckle, middle, tip); `spread` swings the thumb
 * away from the fingers in the palm plane (radians, 0 = the modelled rest). */
export type HandCurl = Record<Finger, readonly [number, number, number]> & {
  spread?: number;
  /** Index knuckle abduction in the palm plane. It lets the trigger digit enter a guard independently
   * of the palm's grip, using the same articulation in the first-person and character rigs. */
  indexSpread?: number;
  /** Axial rotation of the index knuckle, in radians. The unchanged pad can turn inside a guard. */
  indexRoll?: number;
};
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
  /** Keep the wrist natural: the hidden shoulder and the elbow move so the forearm meets the paw inside
   * these limits (degrees, see WristAngles); the given shoulder becomes an anchor the upper arm heads to. */
  natural?: WristLimits;
  /** For the natural arm: true when a point (same space) is out of the eye's view, so an elbow or upper
   * arm there never shows. Without it any natural arm is accepted. */
  hidden?: (point: THREE.Vector3) => boolean;
}
/** Wrist ranges in degrees: [low, high] for flexion (+ toward the palm), deviation (+ toward the thumb)
 * and pronation (+ palm turning down from facing the body's midline). */
export interface WristLimits { flexion: readonly [number, number]; deviation: readonly [number, number]; pronation: readonly [number, number] }
const deg = THREE.MathUtils.radToDeg;

/** Degrees. Flexion + bends the paw toward its palm, extension (-) toward its back; radial deviation +
 * tilts it toward the thumb side, ulnar (-) away; pronation + turns the palm from the anatomical
 * neutral (palm facing the body's midline, thumb up when the forearm points forward) toward facing down,
 * supination (-) toward facing up. */
export interface WristAngles { flexion: number; deviation: number; pronation: number }

/** Wrist angles from the arm's joints and the paw's frame (all in one space). The forearm's own frame
 * comes from the elbow: the forearm axis, and the medial direction (the elbow hinge axis toward the
 * body's midline) taken from the plane the upper arm and forearm fold in. */
export function wristAngles(shoulder: THREE.Vector3, elbow: THREE.Vector3, wrist: THREE.Vector3,
  forward: THREE.Vector3, palm: THREE.Vector3, side: 'R' | 'L', pole?: THREE.Vector3): WristAngles {
  const sign = side === 'R' ? 1 : -1;
  const f = wrist.clone().sub(elbow).normalize(), u = elbow.clone().sub(shoulder).normalize();
  // The forearm folds toward the front of the upper arm; a straight arm falls back on its elbow direction.
  const anterior = f.clone().addScaledVector(u, -f.dot(u));
  if (anterior.lengthSq() < 1e-4 && pole) anterior.copy(pole).negate().addScaledVector(u, -pole.dot(u) * -1);
  anterior.normalize();
  const medial = new THREE.Vector3().crossVectors(anterior, u).multiplyScalar(sign);
  medial.addScaledVector(f, -medial.dot(f)).normalize();
  const h = forward.clone().normalize();
  const p = palm.clone().addScaledVector(h, -palm.dot(h)).normalize();
  // The palm normal and thumb side as seen around the forearm axis.
  const pf = p.clone().addScaledVector(f, -p.dot(f)).normalize();
  const tf = new THREE.Vector3().crossVectors(f, pf).multiplyScalar(sign).normalize();
  const along = h.dot(f);
  const flexion = deg(Math.atan2(h.dot(pf), along)), deviation = deg(Math.atan2(h.dot(tf), along));
  const twist = Math.atan2(new THREE.Vector3().crossVectors(medial, pf).dot(f), medial.dot(pf));
  return { flexion, deviation, pronation: -sign * deg(twist) };
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
  const indexSpread = (a.indexSpread ?? 0) + ((b.indexSpread ?? 0) - (a.indexSpread ?? 0)) * t;
  const indexRoll = (a.indexRoll ?? 0) + ((b.indexRoll ?? 0) - (a.indexRoll ?? 0)) * t;
  return { index: mix(a.index, b.index), middle: mix(a.middle, b.middle), ring: mix(a.ring, b.ring), thumb: mix(a.thumb, b.thumb), spread, indexSpread, indexRoll };
}

interface ChainBone { bone: THREE.Bone; restWorld: THREE.Quaternion; restLocal: THREE.Quaternion; length: number }
interface FingerBone { bone: THREE.Bone; restLocal: THREE.Quaternion; hinge: THREE.Vector3; spread?: THREE.Vector3; axial?: THREE.Vector3 }
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
        let hinge = new THREE.Vector3(-1, 0, 0), spread: THREE.Vector3 | undefined, axial: THREE.Vector3 | undefined;
        if (palm && base && tip) {
          const along = new THREE.Vector3().subVectors(tip, base).normalize();
          if (finger === 'thumb') {
            // The thumb flexes toward the palm and across to the fingers; it spreads in the palm plane.
            const across = new THREE.Vector3().subVectors(middle1!, base).addScaledVector(along, -new THREE.Vector3().subVectors(middle1!, base).dot(along)).normalize();
            hinge = new THREE.Vector3().crossVectors(along, palm.clone().multiplyScalar(.8).addScaledVector(across, .6)).normalize();
            spread = palm.clone();
            if (new THREE.Vector3().crossVectors(spread, along).dot(across) > 0) spread.negate();
            if (i === 1) spread.applyQuaternion(world.clone().invert()).normalize(); else spread = undefined;
          } else {
            hinge = new THREE.Vector3().crossVectors(along, palm).normalize();
            if (finger === 'index' && i === 1) {
              spread = palm.clone().multiplyScalar(side === 'R' ? 1 : -1).applyQuaternion(world.clone().invert()).normalize();
              axial = along.clone().multiplyScalar(side === 'R' ? 1 : -1).applyQuaternion(world.clone().invert()).normalize();
            }
          }
        }
        this.fingers[finger].push({ bone, restLocal: local, hinge: hinge.applyQuaternion(world.invert()).normalize(), spread, axial });
      }
    }
  }
  apply(curl: HandCurl) {
    for (const finger of FINGERS) this.fingers[finger].forEach((f, i) => {
      f.bone.quaternion.copy(f.restLocal);
      const spread = finger === 'index' ? curl.indexSpread : curl.spread;
      if (f.spread && spread) f.bone.quaternion.multiply(tmpQ.setFromAxisAngle(f.spread, spread));
      f.bone.quaternion.multiply(tmpQ.setFromAxisAngle(f.hinge, curl[finger][i]));
      if (f.axial && curl.indexRoll) f.bone.quaternion.multiply(tmpQ.setFromAxisAngle(f.axial, THREE.MathUtils.clamp(curl.indexRoll, -.65, .65)));
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

  /** The shoulder and elbow direction that put the forearm in line with the paw (inside the target's
   * wrist limits), the upper arm heading toward the given anchor. Shoulders are hidden, so they may move. */
  private naturalArm(anchor: THREE.Vector3, target: HandTarget, limits: WristLimits) {
    const a = this.upper.length, b = this.fore.length, sign = this.side === 'R' ? 1 : -1;
    const W = target.wrist, h = new THREE.Vector3().copy(target.forward).normalize();
    const p = new THREE.Vector3().copy(target.palm).addScaledVector(h, -target.palm.dot(h)).normalize();
    const t = new THREE.Vector3().crossVectors(h, p).multiplyScalar(sign);
    // The forearm the plain IK would give (anchor shoulder, authored elbow direction).
    const reachPoint = new THREE.Vector3().subVectors(W, anchor);
    const d = Math.min(Math.max(reachPoint.length(), Math.abs(a - b) + .02), (a + b) * .985);
    const dir = reachPoint.normalize(), start = new THREE.Vector3().copy(W).addScaledVector(dir, -d);
    const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
    const side = new THREE.Vector3().copy(target.pole).addScaledVector(dir, -target.pole.dot(dir));
    if (side.lengthSq() < 1e-8) side.set(0, -1, 0);
    side.normalize();
    const elbow0 = new THREE.Vector3().copy(start).addScaledVector(dir, a * cosA).addScaledVector(side, a * Math.sqrt(1 - cosA * cosA));
    const f0 = new THREE.Vector3().subVectors(W, elbow0).normalize();
    // Wrist bend as wristAngles measures it, and the forearm that gives a wanted bend (a few corrections).
    const rad = THREE.MathUtils.degToRad, bendOf = (f: THREE.Vector3) => {
      const pf = tmpD.copy(p).addScaledVector(f, -p.dot(f)).normalize(), along = h.dot(f);
      const tf = new THREE.Vector3().crossVectors(f, pf).multiplyScalar(sign).normalize();
      return [Math.atan2(h.dot(pf), along), Math.atan2(h.dot(tf), along)];
    };
    const forearmFor = (goalF: number, goalD: number, out: THREE.Vector3) => {
      let a1 = goalF, a2 = goalD;
      for (let i = 0; i < 10; i++) {
        out.copy(h).addScaledVector(p, -Math.tan(a1)).addScaledVector(t, -Math.tan(a2)).normalize();
        const [fx, dv] = bendOf(out); a1 += goalF - fx; a2 += goalD - dv;
      }
      return out.copy(h).addScaledVector(p, -Math.tan(a1)).addScaledVector(t, -Math.tan(a2)).normalize();
    };
    const [fx0, dv0] = bendOf(f0);
    const fl = [rad(limits.flexion[0]), rad(limits.flexion[1])], dl = [rad(limits.deviation[0]), rad(limits.deviation[1])];
    // Candidates: the default bend clamped into the limits first, then (if it shows the elbow or the
    // upper arm) a grid over the allowed bends; the one closest to the default that keeps both hidden wins.
    const goals: [number, number][] = [[THREE.MathUtils.clamp(fx0, fl[0], fl[1]), THREE.MathUtils.clamp(dv0, dl[0], dl[1])]];
    if (target.hidden) for (let i = 0; i <= 6; i++) for (let j = 0; j <= 4; j++)
      goals.push([fl[0] + (fl[1] - fl[0]) * i / 6, dl[0] + (dl[1] - dl[0]) * j / 4]);
    const wrap = (x: number) => ((x + 540) % 360) - 180;
    const f = new THREE.Vector3(), elbow = new THREE.Vector3(), u = new THREE.Vector3(), shoulder = new THREE.Vector3(), probe = new THREE.Vector3();
    // How much of the hidden arm would show: the elbow (with the cuff just past it) counts .5, each
    // point along the upper arm 2, anything right at the eye 5. An upper arm across the view is worse than
    // a strained wrist; an elbow at the frame's edge is not.
    const shows = (e: THREE.Vector3, sh: THREE.Vector3) => {
      if (!target.hidden) return 0;
      let n = target.hidden(e) ? 0 : .5;
      for (const s of [.3, .65, 1]) { probe.copy(e).lerp(sh, s); n += target.hidden(probe) ? 0 : probe.length() < .12 ? 5 : 2; }
      return n;
    };
    // The authored arm competes too: what it shows, plus its wrist strain (10 per 30 degrees outside the limits).
    const authored = wristAngles(start, elbow0, W, target.forward, target.palm, this.side);
    const strain = (v: number, [lo, hi]: readonly [number, number]) => Math.max(0, lo - v, v - hi);
    let best: { shoulder: THREE.Vector3; pole: THREE.Vector3 } | null = null;
    // Past the hard limits (the solve limits plus their margin, WRIST_LIMITS) the strain costs more than a showing upper arm (three points).
    const hard = (v: number, [lo, hi]: readonly [number, number], m: number) => v < lo - m || v > hi + m ? 60 : 0;
    let bestScore = shows(elbow0, start) * 10 + (strain(authored.flexion, limits.flexion) + strain(authored.deviation, limits.deviation) + strain(authored.pronation, limits.pronation)) / 3
      + hard(authored.flexion, limits.flexion, 5) + hard(authored.deviation, limits.deviation, 4) + hard(authored.pronation, limits.pronation, 6);
    if (bestScore === 0) return null;
    for (const [k, [gf, gd]] of goals.entries()) {
      if (k === 0 && Math.abs(gf - fx0) < 1e-9 && Math.abs(gd - dv0) < 1e-9) f.copy(f0); else forearmFor(gf, gd, f);
      elbow.copy(W).addScaledVector(f, -b);
      // The upper arm heads to the anchor, kept bent (45 to 158 degrees at the elbow: straighter would exceed the IK reach).
      u.subVectors(anchor, elbow);
      if (u.lengthSq() < 1e-8) u.copy(side).negate();
      u.normalize();
      const bend = Math.acos(THREE.MathUtils.clamp(u.dot(f), -1, 1));
      if (bend < rad(45) || bend > rad(158)) {
        const across = new THREE.Vector3().copy(u).addScaledVector(f, -u.dot(f));
        if (across.lengthSq() < 1e-8) across.copy(side);
        across.normalize();
        const goal = THREE.MathUtils.clamp(bend, rad(45), rad(158));
        u.copy(f).multiplyScalar(Math.cos(goal)).addScaledVector(across, Math.sin(goal)).normalize();
      }
      // Forearm roll: turn the upper arm about the forearm until the paw's pronation is inside its range
      // (pronation follows the turn one to one, so a slope probe and a step suffice).
      const pronation = (turn: number) => {
        shoulder.copy(elbow).addScaledVector(probe.copy(u).applyAxisAngle(f, turn), a);
        return wristAngles(shoulder, elbow, W, target.forward, target.palm, this.side).pronation;
      };
      const p0 = pronation(0), slope = wrap(pronation(.05) - p0) / .05;
      const turnFor = (want: number) => Math.abs(slope) < 1e-3 ? 0 : wrap(want - p0) / slope;
      let turn = turnFor(THREE.MathUtils.clamp(p0, limits.pronation[0], limits.pronation[1]));
      for (let i = 0; i < 2; i++) { const now = pronation(turn); const want = THREE.MathUtils.clamp(now, limits.pronation[0], limits.pronation[1]); if (want === now) break; turn += turnFor(want) - turnFor(now); }
      // The upper arm closest to the anchor first; if it shows, other turns across the allowed roll.
      const turns = [turn];
      if (target.hidden) for (let i = 0; i <= 6; i++) turns.push(turn + turnFor(limits.pronation[0] + (limits.pronation[1] - limits.pronation[0]) * i / 6) - turnFor(THREE.MathUtils.clamp(p0, limits.pronation[0], limits.pronation[1])));
      for (const [n, option] of turns.entries()) {
        pronation(option);
        const score = shows(elbow, shoulder) * 10 + f.angleTo(f0) + .3 * Math.abs(option - turn);
        if (score < bestScore) {
          bestScore = score;
          const pole = new THREE.Vector3().subVectors(elbow, shoulder), line = new THREE.Vector3().subVectors(W, shoulder).normalize();
          best = { shoulder: shoulder.clone(), pole: pole.addScaledVector(line, -pole.dot(line)).normalize() };
        }
        if (bestScore < 5 && n === 0) break;
      }
      if (k === 0 && bestScore < 5) break;
    }
    return best;
  }

  solve(shoulder: THREE.Vector3, target: HandTarget) {
    const a = this.upper.length, b = this.fore.length;
    if (target.natural) {
      // No natural arm that keeps the elbow and upper arm out of view: keep the authored one.
      const arm = this.naturalArm(shoulder, target, target.natural);
      if (arm) { shoulder = arm.shoulder; target = { ...target, pole: arm.pole }; }
    }
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
// as a pelt instead of a tube. The strand and lock fields are the world
// character's (capybara-fur.ts) at the first-person paw scale (1 / 1.3), so the
// forearm reads as the same pelt. The count follows the graphics preset.
export const FUR_SHELLS = 12;
const PAW_SCALE = 1 / 1.3;
const FUR_LENGTH = .015 * PAW_SCALE;
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
        // World-character units: fine strands (about 1 x 9 mm) gathered into combed locks
        // (about 13 x 40 mm) along the comb (-z, toward the paw), as on the world character.
        vec3 furW = vFurRest / ${PAW_SCALE.toFixed(6)};
        float furLock = furNoise3(vec3(furW.x / .013, furW.y / .013, -furW.z / .040));
        float furStrand = furNoise3(vec3(furW.x / .0011, furW.y / .0011, -furW.z / .009) + 31.0);
        float furKeep = furStrand * .55 + furLock * .70 - .10;
        if (furKeep < mix(.32, .95, vFurShell)) discard;
        diffuseColor.rgb *= mix(.84, 1.12, vFurShell);`);
  };
  material.customProgramCacheKey = () => 'fp-fur-shells-v3';
  const shells = new THREE.SkinnedMesh(geometry, material);
  shells.name = `${mesh.name}_fur`; shells.frustumCulled = false; shells.castShadow = false;
  shells.bind(mesh.skeleton, mesh.bindMatrix);
  return shells;
}

// First-person forearm girth. The world character's forearm (about 12 cm across mid-forearm at the
// first-person scale) fills much of the lower screen this close to the eye, so the viewmodel draws it
// slimmer: a first-person-only cheat, like the viewmodel distortions of Valve's and Unreal's
// first-person rendering. Target skin radius (metres) from the elbow (t = 0) toward the wrist
// (t = 1); the cuff and upper arm scale with the forearm just below the cuff, the taper is kept, and
// the wrist, paw and digits keep the character's own shape.
export const FP_FOREARM_GIRTH: readonly (readonly [number, number])[] = [[.2, .052], [.5, .049], [.85, .047]];
const GIRTH_FREE = .97;
const girthAt = (t: number) => {
  const g = FP_FOREARM_GIRTH;
  if (t <= g[0][0]) return g[0][1];
  for (let i = 1; i < g.length; i++) if (t <= g[i][0]) return g[i - 1][1] + (g[i][1] - g[i - 1][1]) * (t - g[i - 1][0]) / (g[i][0] - g[i - 1][0]);
  return g[g.length - 1][1];
};
/** Scales the forearm's skin toward its bone axis in the bind pose (vertex positions only; weights,
 * normals, maps and the fur pelt follow). Returns the radial scale used at mid-forearm. */
export function slimForearm(mesh: THREE.SkinnedMesh, side: Side): number {
  const bone = (name: string) => mesh.skeleton.bones.find(b => b.name === `${name}_${side}`);
  const fore = bone('fore'), hand = bone('hand');
  if (!fore || !hand) return 1;
  mesh.updateMatrixWorld(true);
  const elbow = mesh.worldToLocal(fore.getWorldPosition(new THREE.Vector3())), wrist = mesh.worldToLocal(hand.getWorldPosition(new THREE.Vector3()));
  const axis = wrist.clone().sub(elbow), length = axis.length(); axis.normalize();
  const geometry = mesh.geometry, source = geometry.getAttribute('position'), count = source.count;
  const skinIndex = geometry.getAttribute('skinIndex'), skinWeight = geometry.getAttribute('skinWeight');
  if (!skinIndex || !skinWeight || length < 1e-6) return 1;
  const digit = new Set(mesh.skeleton.bones.map((b, i) => /^(index|middle|ring|thumb)\d_/.test(b.name) ? i : -1).filter(i => i >= 0));
  const rest = Array.from({ length: count }, (_, i) => mesh.getVertexPosition(i, new THREE.Vector3()));
  const along = (p: THREE.Vector3) => p.clone().sub(elbow).dot(axis) / length;
  const dominant = (i: number) => { let best = 0, w = -1; for (let k = 0; k < 4; k++) { const wk = skinWeight.getComponent(i, k); if (wk > w) { w = wk; best = skinIndex.getComponent(i, k); } } return best; };
  // Median skin radius per section, so the scale keeps each section's own shape (locks, oval wrist).
  const STEP = .05, bins = new Map<number, number[]>();
  rest.forEach((p, i) => {
    if (digit.has(dominant(i))) return;
    const t = along(p), r = p.clone().sub(elbow).addScaledVector(axis, -t * length).length(), key = Math.round(t / STEP);
    if (t > -.5 && t < 1.1) (bins.get(key) ?? bins.set(key, []).get(key)!).push(r);
  });
  const median = (t: number) => {
    const values = bins.get(Math.round(t / STEP)); if (!values?.length) return 0;
    values.sort((a, b) => a - b); return values[values.length >> 1];
  };
  const scaleAt = (t: number) => {
    const clampT = Math.max(FP_FOREARM_GIRTH[0][0], Math.min(FP_FOREARM_GIRTH[FP_FOREARM_GIRTH.length - 1][0], t));
    const r = median(clampT), s = r > 0 ? THREE.MathUtils.clamp(girthAt(clampT) / r, .55, 1) : 1;
    const free = THREE.MathUtils.smoothstep(t, FP_FOREARM_GIRTH[FP_FOREARM_GIRTH.length - 1][0], GIRTH_FREE);
    return s + (1 - s) * free;
  };
  // Rest skinning is one affine map for every bone; invert it to move geometry-space positions.
  const index0 = skinIndex.getComponent(0, 0);
  const restMap = new THREE.Matrix4().copy(mesh.bindMatrixInverse).multiply(mesh.skeleton.bones[index0].matrixWorld)
    .multiply(mesh.skeleton.boneInverses[index0]).multiply(mesh.bindMatrix);
  const inverse = restMap.clone().invert().setPosition(0, 0, 0);
  const positions = new Float32Array(count * 3), v = new THREE.Vector3(), delta = new THREE.Vector3();
  rest.forEach((p, i) => {
    v.fromBufferAttribute(source, i);
    const t = along(p);
    if (t < GIRTH_FREE && !digit.has(dominant(i))) {
      const radial = p.clone().sub(elbow).addScaledVector(axis, -t * length);
      delta.copy(radial).multiplyScalar(scaleAt(t) - 1).applyMatrix4(inverse);
      v.add(delta);
    }
    v.toArray(positions, i * 3);
  });
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return scaleAt(.5);
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
      if (!(globalThis as { __fpFullGirth?: boolean }).__fpFullGirth) slimForearm(mesh, side);
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
