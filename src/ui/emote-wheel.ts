// Pointer-lock wheel geometry. A neutral centre lets the player release without emoting.
export const EMOTE_DEADZONE = 28, EMOTE_RADIUS = 132;
export function emoteChoice(x: number, y: number, count: number): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || count < 1 || Math.hypot(x, y) < EMOTE_DEADZONE) return null;
  const turn = Math.PI * 2, angle = (Math.atan2(y, x) + Math.PI / 2 + turn) % turn;
  return Math.round(angle / turn * count) % count;
}
