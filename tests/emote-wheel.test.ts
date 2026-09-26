import { describe, expect, it } from 'vitest';
import { emoteChoice, EMOTE_DEADZONE } from '../src/ui/emote-wheel';

describe('emote wheel selection', () => {
  it('leaves the center neutral and rejects invalid pointer movement', () => {
    expect(emoteChoice(0, 0, 5)).toBeNull();
    expect(emoteChoice(EMOTE_DEADZONE - 1, 0, 5)).toBeNull();
    expect(emoteChoice(NaN, 100, 5)).toBeNull();
    expect(emoteChoice(0, Infinity, 5)).toBeNull();
  });
  it('maps each visible sticker to its clockwise gesture, starting above the player', () => {
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      expect(emoteChoice(Math.sin(angle) * 120, -Math.cos(angle) * 120, 5)).toBe(i);
    }
    expect(emoteChoice(-1, -100, 5)).toBe(0);
    expect(emoteChoice(1, -100, 5)).toBe(0);
  });
});
