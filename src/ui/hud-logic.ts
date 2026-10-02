import { BINDABLE_CODE, CONTROL_ACTIONS, DEFAULT_BINDINGS, type ControlGroup } from '../controls';
import type { ConsumableId } from '../shared/types';
export { rebind as remapBinding } from '../controls';
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
// The smallest HUD text is 14 px and the quality bar floor is 12 px, so the effective scale never drops under 12/14,
// whatever the resolution or the interface size setting.
export const HUD_MIN_TEXT = 14, TEXT_FLOOR = 12;
export const HUD_MIN_SCALE = Math.ceil(TEXT_FLOOR / HUD_MIN_TEXT * 1000) / 1000;
export const hudScale = (width: number, height: number, user = 1) => {
  const viewport = Math.min(1.35, Math.min(width / 1600, height / 900)), size = Math.min(1.2, Math.max(.8, user));
  return +Math.max(HUD_MIN_SCALE, viewport * size).toFixed(3);
};
// Bottom row in layout px: the vitals sticker at the left and the 405 px weapon row at the right.
// Windows narrower than HUD_CENTRED_WIDTH layout px use two weapon rows beside a slimmer vitals card.
// Font size stays at the same readability floor in either arrangement.
export const HUD_CENTRED_WIDTH = 600, HUD_PHONE_WIDTH = 640;
export const hudNarrow = (width: number, scale: number) => width / scale < HUD_CENTRED_WIDTH;
// Short windows (21:9 laptops, phones on their side) keep the kill feed to two lines so it never reaches the weapons.
export const HUD_SHORT_HEIGHT = 640;
export const hudShort = (height: number, scale: number) => height / scale < HUD_SHORT_HEIGHT;

// Heals, mirrored from the simulation (USE_TIME, startConsume and finishConsume in src/simulation/index.ts): what each one restores,
// up to which cap, and when the host refuses it. The HUD previews the result on the bar and names it on pickup.
export const HEALS: readonly ConsumableId[] = ['bandage', 'medkit', 'guarana', 'acai', 'rapadura'];
export const HEAL_INFO: Record<ConsumableId, { name: string; stat: 'hp' | 'armor'; amount: number; cap: number; time: number; effect: string }> = {
  bandage: { time: 2.5, name: 'Bandagem', stat: 'hp', amount: 15, cap: 75, effect: '+15 de vida' },
  medkit: { time: 5, name: 'Kit médico', stat: 'hp', amount: 100, cap: 100, effect: 'vida cheia' },
  guarana: { time: 2, name: 'Guaraná', stat: 'hp', amount: 30, cap: 100, effect: '+30 aos poucos' },
  acai: { time: 3, name: 'Açaí', stat: 'armor', amount: 25, cap: 100, effect: '+25 de colete' },
  rapadura: { time: 1.5, name: 'Rapadura', stat: 'hp', amount: 10, cap: 100, effect: '+10 de vida' },
};
export const canUseHeal = (item: ConsumableId, hp: number, armor: number) =>
  item === 'bandage' ? hp < 75 : item === 'medkit' || item === 'rapadura' ? hp < 100 : item === 'acai' ? armor < 100 : true;
// Where the bar ends up when the heal finishes (guaraná heals over time: its preview is where it is heading).
export function healTarget(item: ConsumableId, hp: number, armor: number) {
  const info = HEAL_INFO[item], from = info.stat === 'hp' ? hp : armor;
  return { stat: info.stat, from, to: Math.max(from, Math.min(info.cap, from + info.amount)) };
}
// The heal the HUD singles out right now (a gold ring, a bounce at low health): the one that does the most good for
// what is missing, never one the host would refuse. Health comes first; açaí once health is not in danger.
export function suggestedHeal(counts: Partial<Record<ConsumableId, number>>, hp: number, armor: number): ConsumableId | null {
  const has = (item: ConsumableId) => (counts[item] ?? 0) > 0 && canUseHeal(item, hp, armor);
  const order: ConsumableId[] = hp < 50 ? ['medkit', 'bandage', 'guarana', 'rapadura', 'acai']
    : hp < 75 ? ['bandage', 'guarana', 'rapadura', 'medkit', 'acai']
    : hp < 100 ? ['acai', 'rapadura', 'guarana', 'medkit'] : ['acai'];
  return order.find(has) ?? null;
}
// Vitals tone: the health bar warms from green to gold to red as it drops, and pulses under 30.
export const LOW_HEALTH = 30;
export const healthTone = (hp: number) => hp < LOW_HEALTH ? 'low' : hp < 60 ? 'hurt' : 'ok';
// Heals gained since the last HUD tick (a pickup the event did not name, a chest drop): each one gets its pop.
export const healGains = (before: Partial<Record<ConsumableId, number>> | null, after: Partial<Record<ConsumableId, number>>) =>
  before ? HEALS.filter(item => (after[item] ?? 0) > (before[item] ?? 0)) : [];
// Pickup pop copy: big and specific for heals (what it does and how many you carry), short for the rest.
export function pickupCopy(kind: string, count = 0, weaponName = '', rarityName = '') {
  if ((HEALS as readonly string[]).includes(kind)) {
    const info = HEAL_INFO[kind as ConsumableId];
    return { tone: 'heal', title: `+1 ${info.name}`, detail: `${info.effect} · ${count} na bolsa` };
  }
  if (kind === 'weapon') return { tone: 'weapon', title: weaponName || 'Arma', detail: rarityName ? `${rarityName} · na mão` : 'na mão' };
  if (kind === 'armor') return { tone: 'gear', title: '+50 de colete', detail: 'colete vestido' };
  if (kind === 'helmet') return { tone: 'gear', title: 'Capacete', detail: 'cachola protegida' };
  if (kind === 'ammo') return { tone: 'ammo', title: '+ Munição', detail: 'pente extra' };
  return { tone: 'gear', title: 'Equipamento', detail: '' };
}

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
// Eliminated in battle royale, the menu (Esc) offers two actions side by side. Watching is the primary one (it
// recaptures the mouse); the exit never hides.
export const ELIMINATED_ACTIONS = [
  { do: 'resume', label: 'Continuar assistindo', primary: true },
  { do: 'leave', label: 'Voltar ao menu', primary: false },
] as const;

// Kind one-liners: the death card still explains what happened, without teasing the player.
export const ELIMINATION_LINES = [
  'Foi de base... acontece.', 'Capivara também cansa.', 'Pausa técnica para um cochilo.',
  'A grama estava tão confortável.', 'Uma soneca. Depois, revanche.', 'Respira. A próxima é sua.',
  'Foi buscar um lanchinho.', 'Hoje a rede chamou primeiro.', 'Até capivara precisa de intervalo.',
  'Os planos eram bons. A ilha improvisou.',
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
export const BINDING_LABELS: Record<string, string> = Object.fromEntries(CONTROL_ACTIONS.map(a => [a.id, a.label]));
const GROUP_TITLES: Record<ControlGroup, string> = { movement: 'Movimento', combat: 'Combate', items: 'Armas e curas', interface: 'Interface' };
export const BINDING_GROUPS = Object.entries(GROUP_TITLES).map(([group, title]) => ({
  title, actions: CONTROL_ACTIONS.filter(a => a.group === group).map(a => a.id),
}));
export const CONSUMABLE_ACTIONS = ['useBandage', 'useMedkit', 'useGuarana', 'useAcai', 'useRapadura'] as const;
// Esc stays reserved for the menu; the bindable codes are settings.ts BINDABLE_CODE (Brasa's binding model).
export const isBindableCode = (code: string) => BINDABLE_CODE.test(code);
// An empty string is an explicit 'unbound' (an old save whose key a new default would have doubled); only a missing
// action falls back to its default.
export const bindingOf = (bindings: Record<string, string>, action: string) => bindings[action] ?? DEFAULT_BINDINGS[action] ?? '';
// While a chip waits for input, only a press on that chip becomes a mouse binding; a press anywhere else (Fechar, another
// row, the backdrop) cancels the capture, so closing the dialog can never steal the left button from 'fire'.
export const captureMousePress = (onCapturingChip: boolean, button: number): string | null => onCapturingChip ? `Mouse${button}` : null;
export const unboundActions = (bindings: Record<string, string>, actions: readonly string[]) => actions.filter(action => !bindingOf(bindings, action));
const MOUSE_LABELS = ['Mouse esq.', 'Mouse meio', 'Mouse dir.', 'Mouse 4', 'Mouse 5'];
const ARROWS: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
export function keyLabel(code: string): string {
  if (!code) return 'Sem tecla';
  if (/^Mouse[0-4]$/.test(code)) return MOUSE_LABELS[Number(code.slice(5))];
  if (ARROWS[code]) return ARROWS[code];
  if (code === 'Backquote') return '\'';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/(Left|Right)$/, '').replace('Space', 'Espaço').replace('Control', 'Ctrl');
}

// Weapon boxes that just received a different gun (or rarity), so their tab can pop; nothing on the first tick.
export const freshBoxes = (before: readonly string[] | null, after: readonly string[]) =>
  after.map((key, box) => !!before && !!key && key !== before[box]);
// Where a picked-up heal lands in the bag, in layout px from the bottom-left corner of the window: slot centres on the
// bag's grid (rows fill from the top, so the last row sits on the bag's baseline).
export const BAG_LEFT = 20;
export function bagSlotCentre(index: number, carried: number, layout: { size: number; gap: number; perRow: number; bottom: number }) {
  const pitch = layout.size + layout.gap, col = index % layout.perRow, row = Math.floor(index / layout.perRow);
  const rowsAbove = Math.ceil(Math.max(carried, index + 1) / layout.perRow) - 1 - row;
  return { x: BAG_LEFT + col * pitch + layout.size / 2, fromBottom: layout.bottom + layout.size / 2 + rowsAbove * pitch };
}
