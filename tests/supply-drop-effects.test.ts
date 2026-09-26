import * as THREE from 'three';
import { expect, it } from 'vitest';
import { EffectsView } from '../src/render/effects';
import { Card } from '../src/render/effects-systems';

it.each([false, true])('keeps delivery landing effects pooled and bounded (Low: %s)', lowQuality => {
  const cards: Card[] = [];
  const effects = Object.assign(Object.create(EffectsView.prototype), {
    frame: { camera: new THREE.PerspectiveCamera(), firstPerson: false, reducedMotion: false, lowQuality },
    cards: { spawn: () => { const card = new Card(); cards.push(card); return card; } }, a: new THREE.Vector3(),
    color: { gold: new THREE.Color('#E7B85D'), goldLight: new THREE.Color('#FFDEAA') },
    surface: { sand: { puff: new THREE.Color('#f2d9a0'), puffLight: new THREE.Color('#f8e6ba') } },
  });
  const pos = { x: 2, y: 0, z: 1 }, base = { id: 1, type: 'supply' as const, drop: 'tucano-1', district: 'vila', pos };
  effects.event({ ...base, stage: 'incoming' }, {} as never, {} as never, 'self'); expect(cards).toHaveLength(0);
  effects.event({ ...base, stage: 'landed' }, {} as never, {} as never, 'self');
  const count = lowQuality ? 3 : 8;
  expect(cards).toHaveLength(count);
  expect(cards.every(card => card.life <= .6 && card.alpha <= .3 && card.size1 <= .8 && card.minPx === 0)).toBe(true);
  effects.event({ ...base, pos: { x: 100, y: 0, z: 0 }, stage: 'landed' }, {} as never, {} as never, 'self');
  expect(cards).toHaveLength(count);
  effects.frame.reducedMotion = true;
  for (const stage of ['landed', 'opened'] as const) effects.event({ ...base, stage }, {} as never, {} as never, 'self');
  expect(cards).toHaveLength(count);
  effects.frame.reducedMotion = false;
  effects.event({ ...base, stage: 'opened' }, {} as never, {} as never, 'self');
  expect(cards.length).toBe(count + (lowQuality ? 4 : 8));
});
