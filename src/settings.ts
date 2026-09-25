import { PLAYER_COLORS, type Settings } from './shared/types';
import { clamp } from './shared/math';

export const DEFAULT_BINDINGS: Record<string, string> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft',
  jump: 'Space', crouch: 'KeyC', reload: 'KeyR', interact: 'KeyF', leanLeft: 'KeyQ', leanRight: 'KeyE', inspect: 'KeyI',
  fire: 'Mouse0', ads: 'Mouse2', slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', slot4: 'Digit4',
  useBandage: 'Digit5', useMedkit: 'Digit6', useGuarana: 'Digit7', useAcai: 'Digit8', useRapadura: 'Digit9',
  scoreboard: 'Tab', map: 'KeyM',
};
// Keys by KeyboardEvent.code, mouse buttons as 'Mouse' + event.button. Escape stays reserved for the menu.
export const BINDABLE_CODE = /^(Key[A-Z]|Digit[0-9]|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Space|Tab|Backquote|Arrow(Up|Down|Left|Right)|Mouse[0-4])$/;
export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1, fov: 78, graphics: 'medium', frameLimit: 60, reducedMotion: false,
  master: .8, effects: .85, ambience: .45, music: .25, adsToggle: false, bindings: { ...DEFAULT_BINDINGS }, adaptive: true,
  showFps: false, uiScale: 1, crosshairColor: 'white', hitPalette: 'default',
};
const STORAGE_KEY = 'uc-v2-settings';
export function loadSettings(): Settings {
  const result = structuredClone(DEFAULT_SETTINGS);
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    const value = stored || JSON.parse(localStorage.getItem('uc-settings') || '{}');
    for (const key of ['sensitivity', 'fov', 'master', 'effects', 'ambience', 'music'] as const) {
      const number = key === 'sensitivity' ? value.sensitivity ?? value.sens : value[key];
      if (typeof number === 'number' && Number.isFinite(number)) result[key] = clamp(number, key === 'fov' ? 60 : key === 'sensitivity' ? .2 : 0, key === 'fov' ? 105 : key === 'sensitivity' ? 3 : 1);
    }
    if (['low', 'medium', 'high'].includes(value.graphics)) result.graphics = value.graphics;
    if (value.frameLimit === 30 || value.frameLimit === 60) result.frameLimit = value.frameLimit;
    if (typeof value.reducedMotion === 'boolean') result.reducedMotion = value.reducedMotion;
    if (typeof value.adsToggle === 'boolean') result.adsToggle = value.adsToggle;
    if (typeof value.adaptive === 'boolean') result.adaptive = value.adaptive;
    if (typeof value.showFps === 'boolean') result.showFps = value.showFps;
    if (typeof value.uiScale === 'number' && Number.isFinite(value.uiScale)) result.uiScale = clamp(value.uiScale, .8, 1.2);
    if (['white', 'yellow', 'cyan', 'magenta'].includes(value.crosshairColor)) result.crosshairColor = value.crosshairColor;
    if (value.hitPalette === 'default' || value.hitPalette === 'colorblind') result.hitPalette = value.hitPalette;
    if (value.bindings && typeof value.bindings === 'object') {
      const valid = (code: unknown): code is string => typeof code === 'string' && BINDABLE_CODE.test(code);
      const taken = new Set<string>();
      for (const key of Object.keys(DEFAULT_BINDINGS)) if (valid(value.bindings[key])) { result.bindings[key] = value.bindings[key]; taken.add(value.bindings[key]); }
      // An action the save does not know yet keeps its default only if no saved binding already uses
      // that code; otherwise it stays unbound, so one press never triggers two actions.
      for (const key of Object.keys(DEFAULT_BINDINGS)) if (!valid(value.bindings[key]) && taken.has(result.bindings[key])) result.bindings[key] = '';
    }
  } catch { /* Blocked storage and old preferences must never prevent playing. */ }
  return result;
}
export function saveSettings(settings: Settings) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* Ephemeral browser mode. */ } }
export function loadProfile(): { name: string; color: string } {
  try { const color = localStorage.getItem('uc-color') || ''; return { name: (localStorage.getItem('uc-nick') || '').replace(/[\x00-\x1f\x7f<>]/g, '').slice(0, 18), color: PLAYER_COLORS.includes(color) ? color : PLAYER_COLORS[0] }; }
  catch { return { name: '', color: PLAYER_COLORS[0] }; }
}
export function saveProfile(name: string, color: string) { try { localStorage.setItem('uc-nick', name); localStorage.setItem('uc-color', color); } catch { /* Optional persistence. */ } }

// Legacy adaptive difficulty record: a factor in [-1, 1] nudged after each practice match.
const ADAPT_KEY = 'uc-v2-adapt';
export function loadAdapt(): number {
  try { const value = Number(localStorage.getItem(ADAPT_KEY)); return Number.isFinite(value) ? clamp(value, -1, 1) : 0; } catch { return 0; }
}
// Legacy finishMatch(): win → braver bots; finishing in the bottom part → milder.
export function recordPlacement(place: number, entrants: number, win: boolean): number {
  const f = (place - 1) / Math.max(1, entrants - 1);
  let a = loadAdapt();
  if (win) a += .25; else if (f > .6) a -= .25; else if (f > .35) a -= .1; else a += .08;
  a = clamp(a, -1, 1);
  try { localStorage.setItem(ADAPT_KEY, String(a)); } catch { /* Optional persistence. */ }
  return a;
}
// Legacy adaptNote().
export function adaptNote(settings: { adaptive: boolean }): string {
  if (!settings.adaptive) return '';
  const a = loadAdapt();
  if (Math.abs(a) < .05) return 'Ajuste automático: no ponto.';
  return `Ajuste automático: bichos ${Math.round(Math.abs(a) * 20)}% mais ${a < 0 ? 'mansos' : 'bravos'} por causa das últimas partidas.`;
}
