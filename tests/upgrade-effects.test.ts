import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { EffectsView } from '../src/render/effects';
import { Card } from '../src/render/effects-systems';

it.each([false, true])('keeps local upgrade sparkles outside the aim and respects reduced motion: %s', reducedMotion => {
  const local: Card[] = [], remote: Card[] = [];
  const pool = (cards: Card[]) => ({ spawn: () => { const card = new Card(); cards.push(card); return card; } });
  const effects = Object.assign(Object.create(EffectsView.prototype), {
    frame: { camera: new THREE.PerspectiveCamera(), firstPerson: true, reducedMotion, lowQuality: false },
    cards: pool(remote), fpCards: pool(local), a: new THREE.Vector3(), ring: vi.fn(),
    color: { gold: new THREE.Color('#ffc23d'), goldLight: new THREE.Color('#ffe7a3') },
  });
  const snapshot = { actors: [{ id: 'self', pos: { x: 0, y: 0, z: 0 } }, { id: 'far', pos: { x: 100, y: 0, z: 0 } }] };
  effects.event({ id: 1, type: 'upgrade', actor: 'self', weapon: 'm4', level: 2 }, {}, {}, 'self', snapshot);
  expect(local.length).toBe(reducedMotion ? 2 : 6); expect(remote).toHaveLength(0);
  expect(local.every(card => Math.abs(card.pos.x) >= .29 && card.pos.y < -.15 && card.life < 1)).toBe(true);
  if (reducedMotion) expect(local.every(card => !card.pop && card.vel.length() === 0 && card.spin === 0)).toBe(true);
  effects.event({ id: 2, type: 'upgrade', actor: 'far', weapon: 'machete', level: 7 }, {}, {}, 'self', snapshot);
  expect(remote).toHaveLength(0);
});
