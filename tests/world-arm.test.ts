import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { worldElbow } from '../src/render/world-arm';
import { wristAngles } from '../src/render/fp-arms';

const v = (xyz: number[]) => new THREE.Vector3().fromArray(xyz);

describe('world arm elbow choice', () => {
  it('keeps both measured arm lengths while finding a natural support wrist', () => {
    const shoulder = v([-.2411094, 1.2232016, -.0946360]);
    const wrist = v([.0350893, 1.2072622, -.5234641]);
    const authored = v([-.0953588, 1.0996291, -.3259710]);
    const forward = v([.5861770, -.1664386, -.7929023]);
    const palm = v([.2624631, .9649046, -.0085104]);
    const upper = shoulder.distanceTo(authored), fore = authored.distanceTo(wrist), elbow = new THREE.Vector3();
    const angle = worldElbow(shoulder, wrist, upper, fore, v([-.5, -1, -.1]), forward, palm, 'L', elbow);
    expect(shoulder.distanceTo(elbow)).toBeCloseTo(upper, 7);
    expect(wrist.distanceTo(elbow)).toBeCloseTo(fore, 7);
    const a = wristAngles(shoulder, elbow, wrist, forward, palm, 'L');
    expect(Math.abs(a.flexion)).toBeLessThanOrEqual(45);
    expect(a.deviation).toBeGreaterThanOrEqual(-25);
    expect(a.deviation).toBeLessThanOrEqual(20);
    expect(Math.abs(a.pronation)).toBeLessThanOrEqual(80);
    const continued = new THREE.Vector3();
    worldElbow(shoulder, wrist, upper, fore, v([-.5, -1, -.1]), forward, palm, 'L', continued, angle);
    expect(continued.distanceTo(elbow)).toBeLessThan(1e-7);
  });

  it.each([[0, 0, 0], [0, 0, -.000001], [0, 0, -2]])('stays finite with degenerate reach %j', (...xyz) => {
    const elbow = new THREE.Vector3();
    worldElbow(new THREE.Vector3(), v(xyz), .3, .26, v([0, 0, -1]), v([0, 0, -1]), v([0, -1, 0]), 'R', elbow);
    expect(elbow.toArray().every(Number.isFinite)).toBe(true);
    expect(elbow.length()).toBeCloseTo(.3, 7);
  });
});
