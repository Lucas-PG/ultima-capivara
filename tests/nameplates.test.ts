import { describe, expect, it } from 'vitest';
import { nameplateFontSize, nameplateHit, NameplateVisibility, stackNameplate, type Nameplate } from '../src/render/nameplates';
import type { ActorState } from '../src/shared/types';

const actor = { pos: { x: 0, y: 0, z: -10 }, yaw: 0, crouch: false } as ActorState;
const origin = { x: 0, y: 1.6, z: 0 }, forward = { x: 0, y: 0, z: -1 };
function advance(state: NameplateVisibility, seconds: number, aim = true, visible = true) {
  for (let i = 0; i < Math.round(seconds * 60); i++) state.update(aim, visible, 1 / 60);
  return state.opacity;
}

describe('enemy nameplate acquisition and readability', () => {
  it('requires continuous aim, then fades in, holds on aim loss and fades out', () => {
    const state = new NameplateVisibility();
    expect(advance(state, .2)).toBe(0);
    advance(state, .1, false);
    expect(advance(state, .3)).toBeCloseTo(0);
    expect(advance(state, .15)).toBe(1);
    expect(advance(state, .2, false)).toBe(1);
    expect(advance(state, .3, false)).toBe(0);
  });
  it('restores an acquired label during hold or fade without a second acquisition', () => {
    for (const away of [.2, .4]) {
      const state = new NameplateVisibility(); advance(state, .45); advance(state, away, false);
      expect(state.opacity).toBeGreaterThan(0);
      expect(state.update(true, true, 1 / 60)).toBe(1);
    }
  });
  it('does not acquire through a wall, and loss of sight skips the hold', () => {
    const state = new NameplateVisibility();
    expect(advance(state, 1, true, false)).toBe(0);
    advance(state, .45);
    expect(advance(state, .05, false, false)).toBeCloseTo(2 / 3);
    expect(advance(state, .15, false, false)).toBe(0);
    expect(advance(state, .2)).toBe(0);
  });
  it('clamps screen text at both ends and preserves at least 12 px at 720p', () => {
    expect(nameplateFontSize(1080, 1.5)).toBeCloseTo(16.8);
    expect(nameplateFontSize(1080, 3)).toBeCloseTo(16.8);
    expect(nameplateFontSize(1080, 10)).toBe(14);
    // The distance clamp reaches exactly 0.8 at 1080; the 720 minimum takes precedence.
    expect(nameplateFontSize(1080, 40)).toBeCloseTo(11.2);
    expect(nameplateFontSize(1080, 60)).toBeCloseTo(11.2);
    for (const distance of [3, 10, 30, 60]) expect(nameplateFontSize(720, distance)).toBeGreaterThanOrEqual(12);
  });
  it('uses head and body volumes, accounts for crouch and rejects actors behind the camera', () => {
    expect(nameplateHit(origin, forward, actor, actor.pos)).toBeLessThan(10);
    expect(nameplateHit({ ...origin, y: .9 }, forward, actor, actor.pos)).toBeLessThan(10);
    expect(nameplateHit({ ...origin, x: 1 }, forward, actor, actor.pos)).toBe(Infinity);
    expect(nameplateHit(origin, forward, { ...actor, crouch: true }, actor.pos)).toBe(Infinity);
    expect(nameplateHit({ ...origin, y: 1.6 * 1.3 / 1.8 }, forward, { ...actor, crouch: true }, actor.pos)).toBeLessThan(10);
    expect(nameplateHit(origin, forward, actor, { x: 0, y: 0, z: 10 })).toBe(Infinity);
  });
  it('stacks four colliding labels above the head without overlap', () => {
    const placed: Nameplate[] = [];
    for (let i = 0; i < 4; i++) {
      const plate = { bounds: { x: i * 10, y: 100, width: 100, height: 24 } } as Nameplate;
      stackNameplate(plate, placed, placed.length);
      for (const previous of placed) expect(plate.bounds.y + 24).toBeLessThanOrEqual(previous.bounds.y - 2);
      placed.push(plate);
    }
  });
});
