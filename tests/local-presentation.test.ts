import { describe, expect, it } from 'vitest';
import { LocalPresentation } from '../src/render/local-presentation';
import { emptyInput } from '../src/shared/math';
import type { ActorState } from '../src/shared/types';

const actor = (): ActorState => ({
  id: 'local', name: 'Capivara', color: '#bd8956', bot: false, connected: true,
  pos: { x: 0, y: 0, z: 0 }, velocity: { x: 3, y: 0, z: 0 }, yaw: 0, pitch: 0, lean: 0,
  hp: 100, armor: 0, helmet: 0, alive: true, grounded: true, crouch: false, sprint: false, ads: false,
  stage: 'ground', kills: 0, deaths: 0, damage: 0, weapons: [{ id: 'pistol', ammo: 4, reserve: 20, rarity: 0 }], slot: 0,
  consumables: { bandage: 0, medkit: 0, guarana: 0, acai: 0, rapadura: 0 }, reloadUntil: 0, useUntil: 0,
  using: null, respawnAt: 0, protectionUntil: 0, lastInput: 0, shotHeat: 0, swimming: false, wetUntil: 0,
  emote: null, emoteUntil: 0,
});

describe('local presentation without simulation changes', () => {
  it('does not restore weapon poses while an authoritative emote is still active', () => {
    const state = actor(), view = new LocalPresentation(); state.emote = 'wave'; state.emoteUntil = 4;
    expect(view.sample(state, { ...emptyInput(), ads: true, lean: 1, sprint: true, moveZ: 1 }, 1, .016, 1))
      .toMatchObject({ emote: 'wave', ads: false, sprint: false, lean: 0 });
  });
  it('keeps the predicted swimming restrictions even with live aim, sprint and lean held', () => {
    const state = actor(), view = new LocalPresentation(); state.swimming = true; state.grounded = false;
    const before = structuredClone(state);
    const rendered = view.sample(state, { ...emptyInput(), ads: true, sprint: true, lean: 1, moveZ: 1, yaw: 1.2 }, 1, .016, 1);
    expect(rendered).toMatchObject({ swimming: true, ads: false, sprint: false, lean: 0, yaw: 1.2 });
    expect(state).toEqual(before);
  });
  it('renders intermediate positions at 120 Hz while preserving the 60 Hz actor', () => {
    const state = actor(), view = new LocalPresentation(), input = emptyInput();
    view.reconcile(state); state.pos.x = .05; view.tick(state);
    const before = structuredClone(state);
    expect(view.sample(state, input, 0, 0, 1).pos.x).toBeCloseTo(0);
    expect(view.sample(state, input, .5, 1 / 120, 1).pos.x).toBeCloseTo(.025);
    expect(view.sample(state, input, 1, 1 / 120, 1).pos.x).toBeCloseTo(.05);
    expect(state).toEqual(before);
  });

  it('keeps a mid-tick correction continuous and settles within about 100 ms', () => {
    const state = actor(), view = new LocalPresentation(), input = emptyInput();
    view.reconcile(state); state.pos.x = .1; view.tick(state);
    const visible = view.sample(state, input, .4, 0, 1).pos.x;
    state.pos.x -= .25; view.reconcile(state);
    expect(view.sample(state, input, .4, 0, 1).pos.x).toBeCloseTo(visible);
    const corrected = visible - .25;
    expect(Math.abs(view.sample(state, input, .4, .1, 1).pos.x - corrected)).toBeLessThan(.013);
    expect(state.pos.x).toBeCloseTo(-.15);
  });

  it('never smears teleports, death, respawn or a stage transition', () => {
    const state = actor(), view = new LocalPresentation(), input = emptyInput();
    view.reconcile(state); state.pos.x = 20; view.reconcile(state);
    expect(view.sample(state, input, .1, .016, 1).pos.x).toBe(20);
    for (const change of [{ alive: false }, { alive: true }, { stage: 'parachute' as const }]) {
      Object.assign(state, change); state.pos.x += 1; view.reconcile(state);
      expect(view.sample(state, input, .1, .016, 1).pos.x).toBe(state.pos.x);
    }
  });

  it('uses immediate aim and sprint intent while respecting predicted crouch clearance', () => {
    const state = actor(), view = new LocalPresentation(), input = { ...emptyInput(), ads: true, yaw: 1, pitch: .2 };
    const before = structuredClone(state);
    expect(view.sample(state, input, 1, .016, 1)).toMatchObject({ ads: true, yaw: 1, pitch: .2 });
    input.ads = false; input.sprint = true; input.moveZ = 1;
    expect(view.sample(state, input, 1, .016, 1).sprint).toBe(true);
    state.crouch = true;
    expect(view.sample(state, input, 1, .016, 1).sprint).toBe(false);
    expect(state).toEqual({ ...before, crouch: true });
  });

  it('anticipates a valid reload visually and expires rejected intent without changing ammo', () => {
    const state = actor(), view = new LocalPresentation(), input = emptyInput();
    view.reconcile(state); view.action({ type: 'reload', id: 1 }, state, 10);
    expect(view.sample(state, input, 1, .016, 10.01).reloadUntil).toBeCloseTo(11.8);
    expect(view.sample(state, input, 1, .016, 10.31).reloadUntil).toBe(0);
    expect(state.reloadUntil).toBe(0); expect(state.weapons[0].ammo).toBe(4);
  });
});
