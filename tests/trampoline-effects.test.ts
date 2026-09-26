import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { EffectsView } from '../src/render/effects';
import { Card } from '../src/render/effects-systems';
import { GameRenderer } from '../src/render/renderer';

vi.mock('../src/render/weapons', () => ({ WeaponView: vi.fn() }));

it.each([false, true])('keeps contact dust small, pooled and close to the launch surface (Low: %s)', lowQuality => {
  const cards: Card[] = [];
  const effects = Object.assign(Object.create(EffectsView.prototype), {
    frame: { camera: new THREE.PerspectiveCamera(), firstPerson: true, reducedMotion: false, lowQuality },
    cards: { spawn: () => { const card = new Card(); cards.push(card); return card; } },
    surface: { sand: { puff: new THREE.Color('#f2d9a0'), puffLight: new THREE.Color('#f8e6ba') } },
  });
  const pos = { x: 2, y: 1.32, z: 1 };
  effects.event({ id: 1, type: 'bounce', actor: 'self', pos }, {}, {}, 'self');
  expect(cards).toHaveLength(lowQuality ? 2 : 5);
  expect(cards.every(card => card.pos.y > pos.y && card.pos.y < pos.y + .15 &&
    card.life < .5 && card.alpha < .3 && card.size1 < .5 && card.minPx === 0)).toBe(true);
  effects.event({ id: 2, type: 'bounce', actor: 'far', pos: { x: 100, y: 0, z: 0 } }, {}, {}, 'self');
  expect(cards).toHaveLength(lowQuality ? 2 : 5);
  effects.frame.reducedMotion = true;
  effects.event({ id: 3, type: 'bounce', actor: 'self', pos }, {}, {}, 'self');
  expect(cards).toHaveLength(lowQuality ? 2 : 5);
});

it('routes the authoritative contact to the mat and effect systems once', () => {
  const renderer = Object.assign(Object.create(GameRenderer.prototype), {
    lastFrame: { playerId: 'self', snapshot: null }, worldView: { bounce: vi.fn() },
    effects: { event: vi.fn() }, avatars: {}, weaponView: {},
  });
  const event = { id: 5, type: 'bounce', actor: 'self', pos: { x: 2, y: 1.32, z: 1 } };
  renderer.event(event);
  expect(renderer.worldView.bounce).toHaveBeenCalledExactlyOnceWith(event.pos);
  expect(renderer.effects.event).toHaveBeenCalledExactlyOnceWith(event, renderer.avatars, renderer.weaponView, 'self', null);
});
