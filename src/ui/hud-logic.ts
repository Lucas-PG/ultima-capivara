// Pure HUD rules shared by the UI and its tests: loading progress, tip rotation, interface scale and result formatting.

// Loading copy (style bible §13.1): friendly pt-BR, never technical, in load order.
export const LOADING_LABELS: readonly (readonly [number, string])[] = [
  [.15, 'Desenhando a ilha'], [.3, 'Plantando os coqueiros'], [.45, 'Enchendo o mar'], [.6, 'Escondendo os baús'],
  [.75, 'Engraxando as armas'], [.9, 'Chamando a turma'], [1, 'Carregando o avião'],
];
export const loadingLabel = (fraction: number) => fraction >= 1 ? 'Pronto!' : (LOADING_LABELS.find(([limit]) => fraction < limit) ?? LOADING_LABELS[LOADING_LABELS.length - 1])[1];

// The bar never goes back: invalid or smaller values keep the previous fraction.
export function nextProgress(previous: number, fraction: number): number {
  if (!Number.isFinite(fraction)) return previous;
  return Math.max(previous, Math.min(1, Math.max(0, fraction)));
}
// Labels stay short and clean whatever the caller sends: no trailing ellipsis, at most 28 characters.
export const cleanLabel = (label: string) => label.trim().replace(/(\.\.\.|…)+$/, '').trim().slice(0, 28);

// Shuffled bag: every tip is shown once before any repeats, and a refill never starts with the tip just shown.
export function tipBag<T>(items: readonly T[], random: () => number = Math.random) {
  let bag: T[] = [], last: T | undefined;
  return () => {
    if (!bag.length) {
      bag = [...items];
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
      if (bag.length > 1 && bag[bag.length - 1] === last) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
    }
    last = bag.pop()!;
    return last;
  };
}

// The HUD is laid out at 1600x900; it follows the smaller viewport ratio, times the player's "Tamanho da interface".
// The smallest HUD text is 13 px and the quality bar floor is 12 px, so the effective scale never drops under 12/13,
// whatever the resolution or the interface size setting.
export const HUD_MIN_TEXT = 13, TEXT_FLOOR = 12;
export const HUD_MIN_SCALE = Math.ceil(TEXT_FLOOR / HUD_MIN_TEXT * 1000) / 1000;
export const hudScale = (width: number, height: number, user = 1) => {
  const viewport = Math.min(1.35, Math.min(width / 1600, height / 900)), size = Math.min(1.2, Math.max(.8, user));
  return +Math.max(HUD_MIN_SCALE, viewport * size).toFixed(3);
};

// Public files resolve against the deploy base (Vite base './'), never the origin root, so subpath deploys keep them.
export const publicUrl = (file: string, base: string = import.meta.env.BASE_URL, page: string = location.href) =>
  new URL(`${base.endsWith('/') ? base : `${base}/`}${file}`, page).href;

// pt-BR formatting for the results screen.
export const formatSurvived = (seconds: number) => { const s = Math.max(0, Math.round(seconds)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const accuracyText = (hits: number, shots: number) => shots > 0 ? `${Math.round(Math.min(1, hits / shots) * 100)}%` : '–';
export const ordinal = (place: number) => `${place}º`;

// Leaving asks for confirmation only when something is lost: an online host closes the room for everyone,
// the lobby gives up a seat, or the player is still in the match (alive, or waiting to respawn in Correria).
// Out of a battle royale, or on the results screen, the exit is one click.
export interface LeaveContext { screen: 'home' | 'lobby' | 'game' | 'results'; host: boolean; phase?: string; alive?: boolean; royale?: boolean }
export function leaveNeedsConfirm(c: LeaveContext): boolean {
  if (c.screen === 'home') return false;
  if (c.host || c.screen === 'lobby') return true;
  if (c.phase === 'results') return false;
  return !(c.royale && c.alive === false);
}
// Eliminated in battle royale: two buttons, always visible together. Watching is the primary action; the exit never hides.
export const ELIMINATED_ACTIONS = [
  { do: 'spectate', label: 'Assistir a próxima capivara', primary: true },
  { do: 'leave', label: 'Voltar ao menu', primary: false },
] as const;

// Results: the rematch/menu actions become visible and clickable this soon after the match ends (quality bar: at most 400 ms).
export const RESULTS_ACTIONS_DELAY = 300;

// Death cam card (Brasa's M1 death cam): shown from the kill event for the camera's duration, then the spectate or
// respawn UI takes over. Mirrors DEATH_CAM_SECONDS in src/shared/death-cam.ts on v3/gameplay; switch to that import
// once it lands so the card and the camera can never drift apart.
export const DEATH_CARD_SECONDS = 1.8;
// "Tico te pegou · M4 · 23 m". Storm and fall kills have no killer and keep their own lines (null here).
export function killCardParts(killer: string | null | undefined, weaponName: string | null, distance: number | null | undefined) {
  if (!killer || !weaponName) return null;
  return { killer, weapon: weaponName, distance: Number.isFinite(distance) ? `${Math.max(0, Math.round(distance!))} m` : null };
}

// Menu cover: AVIF with a WebP fallback (scripts/build-cover.mjs), sized to the screen's device pixels so small
// screens never download the desktop art. The loading screen blurs its backdrop, so it gets the tiny soft variant.
export function coverImageSet(cssWidth: number, dpr = 1, url: (file: string) => string = file => publicUrl(file)) {
  const name = cssWidth * dpr > 1100 ? 'cover-1672' : 'cover-960';
  const set = (n: string) => `image-set(url("${url(`assets/${n}.avif`)}") type("image/avif"), url("${url(`assets/${n}.webp`)}") type("image/webp"))`;
  return { cover: set(name), blur: set('cover-blur-480') };
}
