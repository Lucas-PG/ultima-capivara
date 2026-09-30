import * as THREE from 'three';
import { Spring } from './spring';
import type { WeaponId } from '../shared/types';

// Camera feedback for combat, applied on top of the first-person view after
// the rig has placed it. Everything here is presentation: aim (input yaw and
// pitch) never moves, so the crosshair stays true to where rounds go. Shots
// give a small kick and FOV punch, damage a flinch toward the side it came
// from, blasts a decaying shake (trauma squared, smooth noise), eliminations a
// short zoom pop. Scaled by the camera-shake setting; reduced motion keeps a
// quarter of it. Magnitudes stay small: a pistol kick peaks near 0.1 degrees,
// a sniper's near 0.5, and a shot's FOV punch at 0.4 to 3 percent.

interface ShotFeel { fov: number; kick: number }
const SHOT: Record<WeaponId, ShotFeel> = {
  pistol: { fov: .007, kick: .16 }, revolver: { fov: .016, kick: .4 }, smg: { fov: .004, kick: .07 }, m4: { fov: .006, kick: .11 },
  shotgun: { fov: .028, kick: .6 }, dmr: { fov: .014, kick: .34 }, sniper: { fov: .032, kick: .7 }, coco: { fov: .02, kick: .45 }, machete: { fov: 0, kick: 0 },
};
const TRAUMA_DECAY = 1.5;
const SHAKE_PITCH = THREE.MathUtils.degToRad(1.1), SHAKE_YAW = THREE.MathUtils.degToRad(.9), SHAKE_ROLL = THREE.MathUtils.degToRad(1.8);
// Sum of incommensurate sines: smooth, non-repeating noise in [-1, 1] per channel.
const noise = (t: number, seed: number) => (Math.sin(t * 23.1 + seed) * .5 + Math.sin(t * 37.7 + seed * 1.7) * .3 + Math.sin(t * 61.3 + seed * 2.9) * .2);

export class CombatCamera {
  private readonly pitch = new Spring();
  private readonly yaw = new Spring();
  private readonly roll = new Spring();
  private readonly fov = new Spring();
  private trauma = 0;
  private time = 0;
  private side = 1;

  /** The local player's own round (predicted or confirmed, once). */
  shot(weapon: WeaponId, ads: number) {
    const feel = SHOT[weapon], steady = 1 - .4 * Math.min(1, Math.max(0, ads));
    this.pitch.impulse(feel.kick * steady);
    this.roll.impulse(feel.kick * .5 * (this.side = -this.side) * steady);
    // A critically damped spring kicked at v peaks at v / (f e): 60 = 22 e turns `fov` into the peak fraction.
    this.fov.impulse(-feel.fov * 60 * steady);
  }

  /** Damage taken; `bearing` is the attacker's direction relative to the view (radians, + to the right), or null. */
  hurt(amount: number, bearing: number | null) {
    const k = Math.min(1, amount / 40);
    this.trauma = Math.min(1, this.trauma + .12 + .28 * k);
    this.pitch.impulse(.35 * k);
    // A hit from the left tips the view to the right, away from it.
    if (bearing !== null) { this.roll.impulse(-Math.sin(bearing) * .9 * k); this.yaw.impulse(-Math.sin(bearing) * .25 * k); }
  }

  /** An explosion `distance` metres from the camera. */
  blast(distance: number) {
    if (distance > 16) return;
    const k = (1 - distance / 16) ** 2;
    this.trauma = Math.min(1, this.trauma + .9 * k);
    this.fov.impulse(.8 * k);
  }

  /** The local player's elimination of someone: a short zoom pop. */
  kill() { this.fov.impulse(-.55); }

  clear() { for (const spring of [this.pitch, this.yaw, this.roll, this.fov]) spring.reset(); this.trauma = 0; }

  /** Applies the feedback to the posed camera. `amount` is the shake setting (0 to 1), already reduced for reduced motion. */
  apply(camera: THREE.PerspectiveCamera, dt: number, amount: number) {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * dt);
    const pitch = this.pitch.update(0, 32, dt), yaw = this.yaw.update(0, 26, dt), roll = this.roll.update(0, 24, dt), fov = this.fov.update(0, 22, dt);
    if (amount <= 0) return;
    // Spring values are angles in radians (and a fraction of the FOV); shake follows trauma squared.
    const shake = this.trauma * this.trauma;
    camera.rotateX((pitch + noise(this.time, 1.3) * SHAKE_PITCH * shake) * amount);
    camera.rotateY((yaw + noise(this.time, 4.1) * SHAKE_YAW * shake) * amount);
    camera.rotateZ((roll + noise(this.time, 7.9) * SHAKE_ROLL * shake) * amount);
    if (Math.abs(fov) > 1e-5) { camera.fov *= 1 + fov * amount; camera.updateProjectionMatrix(); }
  }
}
