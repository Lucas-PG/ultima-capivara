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
// The .92 floor keeps the smallest HUD text (13 px) at 12 px on a 1280x720 screen (quality bar minimum).
export const HUD_MIN_SCALE = .92;
export const hudScale = (width: number, height: number, user = 1) =>
  +(Math.min(1.35, Math.max(HUD_MIN_SCALE, Math.min(width / 1600, height / 900))) * Math.min(1.2, Math.max(.8, user))).toFixed(3);

// pt-BR formatting for the results screen.
export const formatSurvived = (seconds: number) => { const s = Math.max(0, Math.round(seconds)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const accuracyText = (hits: number, shots: number) => shots > 0 ? `${Math.round(Math.min(1, hits / shots) * 100)}%` : '–';
export const ordinal = (place: number) => `${place}º`;
