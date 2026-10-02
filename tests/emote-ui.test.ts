import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/settings';
import { GameUI } from '../src/ui/ui';

const fixture = (actor: Record<string, unknown> = {}) => ({
  screen: 'game', localId: 'me', modal: null, settings: DEFAULT_SETTINGS,
  snapshot: { phase: 'playing', time: 10, actors: [{ id: 'me', alive: true, stage: 'ground', grounded: true, swimming: false, using: null, reloadUntil: 0, ...actor }] },
  root: { querySelector: () => null }, el: () => ({ hidden: true }),
  toggleMap: vi.fn(), toggle: vi.fn(), show: vi.fn(), selectEmote: vi.fn(), style: vi.fn(), text: vi.fn(),
});

describe('gesture availability', () => {
  it('opens for a grounded player once the reload is finished', () => {
    const ui = fixture({ reloadUntil: 9 });
    expect(GameUI.prototype.openEmoteWheel.call(ui as unknown as GameUI)).toBe(true);
    expect(ui.show).toHaveBeenCalledWith('emoteWheel', true);
    expect(ui.toggle).toHaveBeenCalledWith(expect.any(Object), 'emote-open', true);
    GameUI.prototype.closeEmoteWheel.call(ui as unknown as GameUI);
    expect(ui.show).toHaveBeenLastCalledWith('emoteWheel', false);
    expect(ui.toggle).toHaveBeenLastCalledWith(expect.any(Object), 'emote-open', false);
  });
  it.each([{ grounded: false }, { swimming: true }, { using: 'bandage' }, { reloadUntil: 11 }, { alive: false }])('does not offer a gesture the host cannot perform: %j', actor => {
    const ui = fixture(actor);
    expect(GameUI.prototype.openEmoteWheel.call(ui as unknown as GameUI)).toBe(false);
    expect(ui.show).not.toHaveBeenCalled();
  });
});
