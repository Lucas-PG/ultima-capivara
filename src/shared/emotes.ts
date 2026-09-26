import type { EmoteId, InputFrame } from './types';

export const EMOTE_IDS = ['wave', 'dance', 'victory', 'sit', 'chill'] as const;
export const EMOTE_LOOK_EPSILON = .0001;
export const EMOTES: Record<EmoteId, { label: string; duration: number; loop: boolean }> = {
  wave: { label: 'Acenar', duration: 3, loop: false },
  dance: { label: 'Dançar', duration: 8, loop: true },
  victory: { label: 'Vitória', duration: 4, loop: false },
  sit: { label: 'Sentar', duration: 12, loop: true },
  chill: { label: 'Relaxar', duration: 12, loop: true },
};
export const isEmote = (value: unknown): value is EmoteId => typeof value === 'string' && Object.hasOwn(EMOTES, value);
export const emoteInput = (input: InputFrame) => input.moveX !== 0 || input.moveZ !== 0 || input.jump || input.fire ||
  input.sprint || input.crouch || input.ads || input.lean !== 0;
