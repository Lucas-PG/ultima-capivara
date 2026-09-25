import { BINDABLE_CODE } from '../settings';
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

// Lobby start button (host): while the island warms up it is disabled and busy with real progress;
// otherwise it is enabled only when everyone is ready and connected.
export function startButtonState(allReady: boolean, roomLoading: number | null) {
  const loading = roomLoading !== null;
  return { loading, disabled: loading || !allReady, primary: allReady && !loading, pct: loading ? Math.round(Math.min(1, Math.max(0, roomLoading!)) * 100) : 0 };
}

// Key remap (quality bar: remapping covers every action). Codes are KeyboardEvent.code, or 'Mouse' + button index.
// Defaults mirror settings.ts DEFAULT_BINDINGS once Brasa's full binding model lands; until then they are the fallback
// for actions input.ts still reads as fixed keys, so every HUD hint shows the key that actually works.
export const BINDING_DEFAULTS: Record<string, string> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', jump: 'Space', crouch: 'KeyC', leanLeft: 'KeyQ', leanRight: 'KeyE',
  fire: 'Mouse0', ads: 'Mouse2', reload: 'KeyR', interact: 'KeyF', inspect: 'KeyI',
  slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', slot4: 'Digit4',
  useBandage: 'Digit5', useMedkit: 'Digit6', useGuarana: 'Digit7', useAcai: 'Digit8', useRapadura: 'Digit9',
  scoreboard: 'Tab', map: 'KeyM',
};
export const BINDING_LABELS: Record<string, string> = {
  forward: 'Frente', back: 'Trás', left: 'Esquerda', right: 'Direita', sprint: 'Correr', jump: 'Pular / paraquedas', crouch: 'Agachar',
  leanLeft: 'Espiar à esquerda', leanRight: 'Espiar à direita', fire: 'Atirar', ads: 'Mirar', reload: 'Recarregar', interact: 'Pegar / abrir',
  inspect: 'Inspecionar arma', slot1: 'Arma 1', slot2: 'Arma 2', slot3: 'Arma 3', slot4: 'Arma 4',
  useBandage: 'Usar bandagem', useMedkit: 'Usar kit médico', useGuarana: 'Tomar guaraná', useAcai: 'Tomar açaí', useRapadura: 'Comer rapadura',
  scoreboard: 'Placar', map: 'Mapa da ilha',
};
export const BINDING_GROUPS: readonly { title: string; actions: readonly string[] }[] = [
  { title: 'Movimento', actions: ['forward', 'back', 'left', 'right', 'sprint', 'jump', 'crouch', 'leanLeft', 'leanRight'] },
  { title: 'Combate', actions: ['fire', 'ads', 'reload', 'interact', 'inspect'] },
  { title: 'Armas e curas', actions: ['slot1', 'slot2', 'slot3', 'slot4', 'useBandage', 'useMedkit', 'useGuarana', 'useAcai', 'useRapadura'] },
  { title: 'Interface', actions: ['scoreboard', 'map'] },
];
export const CONSUMABLE_ACTIONS = ['useBandage', 'useMedkit', 'useGuarana', 'useAcai', 'useRapadura'] as const;
// Esc stays reserved for the menu; the bindable codes are settings.ts BINDABLE_CODE (Brasa's binding model).
export const isBindableCode = (code: string) => BINDABLE_CODE.test(code);
// An empty string is an explicit 'unbound' (an old save whose key a new default would have doubled); only a missing
// action falls back to its default.
export const bindingOf = (bindings: Record<string, string>, action: string) => bindings[action] ?? BINDING_DEFAULTS[action] ?? '';
export const unboundActions = (bindings: Record<string, string>, actions: readonly string[]) => actions.filter(action => !bindingOf(bindings, action));
// Binding a code already used by another action swaps them, so no two actions ever share a key.
export function remapBinding(bindings: Record<string, string>, action: string, code: string): Record<string, string> {
  if (!isBindableCode(code)) return bindings;
  const next = { ...bindings }, previous = bindingOf(bindings, action);
  for (const other of Object.keys(next)) if (other !== action && next[other] === code) next[other] = previous;
  next[action] = code;
  return next;
}
const MOUSE_LABELS = ['Mouse esq.', 'Mouse meio', 'Mouse dir.', 'Mouse 4', 'Mouse 5'];
const ARROWS: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
export function keyLabel(code: string): string {
  if (!code) return 'Sem tecla';
  if (/^Mouse[0-4]$/.test(code)) return MOUSE_LABELS[Number(code.slice(5))];
  if (ARROWS[code]) return ARROWS[code];
  if (code === 'Backquote') return '\'';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/(Left|Right)$/, '').replace('Space', 'Espaço').replace('Control', 'Ctrl');
}
