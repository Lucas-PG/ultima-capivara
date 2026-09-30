import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CombatCamera } from '../src/render/combat-camera';

// Camera feedback must read as impact without ever pulling the view off the
// target for long: small peaks, a fast return, off when the setting is off.
function run(feedback: CombatCamera, frames: number, amount = 1) {
  const angles: number[] = [], fovs: number[] = [];
  for (let i = 0; i < frames; i++) {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9);
    feedback.apply(camera, 1 / 60, amount);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    angles.push(THREE.MathUtils.radToDeg(forward.angleTo(new THREE.Vector3(0, 0, -1))));
    fovs.push(camera.fov / 60 - 1);
  }
  return { angles, fovs };
}

describe('combat camera feedback', () => {
  it('kicks a shot a fraction of a degree and settles within a quarter second', () => {
    for (const weapon of ['pistol', 'm4', 'shotgun', 'sniper'] as const) {
      const feedback = new CombatCamera();
      feedback.shot(weapon, 0);
      const { angles, fovs } = run(feedback, 30);
      expect(Math.max(...angles), weapon).toBeGreaterThan(.03);
      expect(Math.max(...angles), weapon).toBeLessThan(.6);
      expect(Math.min(...fovs), weapon).toBeLessThan(0);
      expect(angles[15], weapon).toBeLessThan(Math.max(...angles) * .35);
    }
  });

  it('shakes hard near a coconut blast, less far away, and stops', () => {
    const near = new CombatCamera(), far = new CombatCamera();
    near.blast(2); far.blast(12);
    const a = run(near, 120), b = run(far, 120);
    expect(Math.max(...a.angles)).toBeGreaterThan(Math.max(...b.angles) * 2);
    expect(Math.max(...a.angles)).toBeLessThan(3);
    expect(a.angles.at(-1)!).toBeLessThan(.02);
  });

  it('does nothing with camera shake off, and a quarter with reduced motion', () => {
    const off = new CombatCamera(), reduced = new CombatCamera(), full = new CombatCamera();
    for (const f of [off, reduced, full]) { f.hurt(40, .8); f.shot('shotgun', 0); }
    expect(Math.max(...run(off, 20, 0).angles)).toBe(0);
    const r = Math.max(...run(reduced, 20, .25).angles), full1 = Math.max(...run(full, 20, 1).angles);
    expect(r).toBeLessThan(full1 * .4);
  });
});
