import { describe, expect, it } from 'vitest';
import { SpectateDirector, TARGET_DOWN_HOLD, cycleTarget, nearestTarget, spectateOrder } from '../src/spectate';
import type { ActorState } from '../src/shared/types';

// Watching after an elimination must always show someone alive, move on when that capybara falls, and let the
// player step both ways through a stable order where friends come before bots.
const actor = (id: string, x: number, extra: Partial<ActorState> = {}): ActorState => ({
  id, name: id, alive: true, connected: true, bot: id.startsWith('bot'), pos: { x, y: 0, z: 0 }, ...extra,
} as ActorState);
const lobby = () => [actor('me', 0, { alive: false }), actor('bot-a', 10), actor('ana', 40), actor('bot-b', 5), actor('rui', 80)];

describe('watch order', () => {
  it('lists living capybaras other than you, people before bots, and never the local player', () => {
    expect(spectateOrder(lobby(), 'me').map(a => a.id)).toEqual(['ana', 'rui', 'bot-a', 'bot-b']);
  });

  it('cycles forward and back with wrap-around', () => {
    const actors = lobby();
    expect(cycleTarget(actors, 'me', 'ana', 1)).toBe('rui');
    expect(cycleTarget(actors, 'me', 'ana', -1)).toBe('bot-b');
    expect(cycleTarget(actors, 'me', 'bot-b', 1)).toBe('ana');
    expect(cycleTarget(actors, 'me', null, -1)).toBe('bot-b');
  });

  it('puts a dropped connection last and prefers connected capybaras when choosing the nearest', () => {
    const actors = [actor('me', 0, { alive: false }), actor('ana', 1, { connected: false }), actor('bot-a', 30)];
    expect(spectateOrder(actors, 'me').map(a => a.id)).toEqual(['bot-a', 'ana']);
    expect(nearestTarget(actors, 'me', { x: 0, y: 0, z: 0 })).toBe('bot-a');
  });

  it('has nobody to watch when everyone else is down', () => {
    const actors = [actor('me', 0, { alive: false }), actor('bot-a', 3, { alive: false })];
    expect(cycleTarget(actors, 'me', null, 1)).toBeNull();
  });
});

describe('spectate director', () => {
  it('starts on your eliminator when it is still standing, otherwise on whoever is nearest to where you fell', () => {
    const d = new SpectateDirector(), actors = lobby();
    d.begin(actors, 'me', 'rui', { x: 0, y: 0, z: 0 });
    expect(d.update(actors, 'me', 0).target).toBe('rui');
    actors[4].alive = false;
    d.begin(actors, 'me', 'rui', { x: 6, y: 0, z: 0 });
    expect(d.update(actors, 'me', 0).target).toBe('bot-b');
    // Storm and fall eliminations have no killer.
    d.begin(actors, 'me', null, { x: 38, y: 0, z: 0 });
    expect(d.target).toBe('ana');
  });

  it('holds on a watched capybara that falls, then follows its eliminator', () => {
    const d = new SpectateDirector(), actors = lobby();
    d.begin(actors, 'me', 'ana', null);
    d.kill('ana', 'bot-a');
    actors[2].alive = false;
    const held = d.update(actors, 'me', 10);
    expect(held.target).toBe('ana');
    expect(held.hold).toMatchObject({ victim: 'ana', killer: 'bot-a', reason: 'down' });
    expect(d.update(actors, 'me', 10 + TARGET_DOWN_HOLD - .01).target).toBe('ana');
    const after = d.update(actors, 'me', 10 + TARGET_DOWN_HOLD);
    expect(after.target).toBe('bot-a');
    expect(after.hold).toBeNull();
  });

  it('names the eliminator even when the kill event lands after the snapshot that showed the fall', () => {
    const d = new SpectateDirector(), actors = lobby();
    d.begin(actors, 'me', 'ana', null);
    actors[2].alive = false;
    expect(d.update(actors, 'me', 1).hold?.killer).toBeNull();
    d.kill('ana', 'rui');
    expect(d.update(actors, 'me', 1.1).hold?.killer).toBe('rui');
    expect(d.update(actors, 'me', 1 + TARGET_DOWN_HOLD).target).toBe('rui');
  });

  it('moves to the nearest capybara when the eliminator of the watched one is also down', () => {
    const d = new SpectateDirector(), actors = lobby();
    d.begin(actors, 'me', 'ana', null);
    d.kill('ana', 'rui'); actors[2].alive = false; actors[4].alive = false;
    d.update(actors, 'me', 0);
    // ana fell at x=40: bot-a (x=10) is nearer than bot-b (x=5).
    expect(d.update(actors, 'me', TARGET_DOWN_HOLD).target).toBe('bot-a');
  });

  it('lets a manual switch cut a hold short and continues the order from the fallen capybara', () => {
    const d = new SpectateDirector(), actors = lobby();
    d.begin(actors, 'me', 'ana', null);
    actors[2].alive = false; d.update(actors, 'me', 0);
    d.cycle(actors, 'me', 1);
    expect(d.update(actors, 'me', .1)).toMatchObject({ target: 'rui', hold: null });
  });

  it('leaves a capybara whose player left for someone else, but keeps a dropped friend when nobody else is left', () => {
    const d = new SpectateDirector(), actors = lobby();
    d.begin(actors, 'me', 'ana', null);
    actors[2].connected = false;
    expect(d.update(actors, 'me', 0).hold?.reason).toBe('left');
    expect(d.update(actors, 'me', TARGET_DOWN_HOLD).target).not.toBe('ana');
    const alone = [actor('me', 0, { alive: false }), actor('ana', 3, { connected: false })];
    d.begin(alone, 'me', 'ana', null);
    expect(d.update(alone, 'me', 5)).toMatchObject({ target: 'ana', hold: null });
  });

  it('reports the position in the watch order for the HUD', () => {
    const d = new SpectateDirector(), actors = lobby();
    d.begin(actors, 'me', 'rui', null);
    expect(d.update(actors, 'me', 0)).toMatchObject({ index: 1, count: 4 });
  });
});
