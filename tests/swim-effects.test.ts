import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { EffectsView } from '../src/render/effects';
import { WATER_LEVEL } from '../src/shared/water';

function harness(lowQuality = false, reducedMotion = false) {
  const ripple = vi.fn(), drops = vi.fn();
  const effects = Object.assign(Object.create(EffectsView.prototype), {
    frame: { camera: new THREE.PerspectiveCamera(), avatars: { get: () => undefined }, lowQuality, reducedMotion },
    waterTime: 0, waterActors: new Map(), a: new THREE.Vector3(), waterRipple: (pos: THREE.Vector3, ...rest: number[]) => ripple(pos.clone(), ...rest),
    waterDrops: (pos: THREE.Vector3, ...rest: number[]) => drops(pos.clone(), ...rest),
  });
  return { effects, ripple, drops };
}

it('anchors a bounded wake at the shared surface using local prediction, then stops when dry', () => {
  const { effects, ripple } = harness();
  const snapshot = { id: 'self', alive: true, swimming: false, wetUntil: 0, pos: { x: 0, y: -1.15, z: 2 }, velocity: { x: 0, y: 0, z: 1 } };
  const predicted = { ...snapshot, swimming: true };
  for (let i = 0; i < 180; i++) { effects.waterTime += 1 / 60; effects.updateWater([snapshot], 30, predicted); }
  expect(ripple.mock.calls.length).toBeGreaterThanOrEqual(5); expect(ripple.mock.calls.length).toBeLessThan(9);
  expect(ripple.mock.calls.every(call => call[0].y === WATER_LEVEL)).toBe(true);
  const count = ripple.mock.calls.length; predicted.swimming = false;
  effects.waterTime += 1; effects.updateWater([snapshot], 30, predicted);
  expect(ripple.mock.calls).toHaveLength(count); expect(effects.waterActors.size).toBe(0);
});

it('keeps a water-entry ring at Low and suppresses spray for reduced motion', () => {
  for (const reduced of [false, true]) {
    const { effects, ripple, drops } = harness(true, reduced);
    effects.event({ type: 'water', id: 1, actor: 'self', pos: { x: 0, y: -1.15, z: 2 }, entering: true }, {}, {}, 'self');
    expect(ripple).toHaveBeenCalledOnce(); expect(ripple.mock.calls[0][0].y).toBe(WATER_LEVEL);
    expect(drops.mock.calls[0][1]).toBe(reduced ? 0 : 3);
  }
});
