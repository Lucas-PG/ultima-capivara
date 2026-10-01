import { PLAYER_COLORS, type Settings, type WeaponId } from './shared/types';
import { ADS_ZOOM } from './shared/weapons';
import { clamp } from './shared/math';
import { DEFAULT_BINDINGS, DEFAULT_CONTROL_OPTIONS, sanitizeBindings, sanitizeControlOptions } from './controls';

// The action list, defaults and rebinding rules live in the controls model.
export { BINDABLE_CODE, DEFAULT_BINDINGS } from './controls';
export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1, fov: 100, graphics: 'medium', renderScale: 'auto', frameLimit: 60, reducedMotion: false,
  master: .8, effects: .85, ambience: .45, music: .5, bindings: { ...DEFAULT_BINDINGS }, adaptive: true, ...DEFAULT_CONTROL_OPTIONS,
  showFps: false, uiScale: 1, crosshairColor: 'white', hitPalette: 'default',
  damageNumbers: true,
};
const STORAGE_KEY = 'uc-v2-settings';
export function loadSettings(): Settings {
  const result = structuredClone(DEFAULT_SETTINGS);
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    const value = stored || JSON.parse(localStorage.getItem('uc-settings') || '{}');
    for (const key of ['sensitivity', 'fov', 'master', 'effects', 'ambience', 'music'] as const) {
      let number = key === 'sensitivity' ? value.sensitivity ?? value.sens : value[key];
      // Before the procedural score, .25 was the default. A version marker lets
      // players deliberately choose .25 again without another migration.
      if (key === 'music' && value.musicMix !== 2 && number === .25) number = DEFAULT_SETTINGS.music;
      // Saves before v3 stored a vertical field of view; convert it to the horizontal (16:9) scale.
      if (key === 'fov' && typeof number === 'number' && value.fovScale !== 'horizontal') number = horizontalFov(number);
      if (typeof number === 'number' && Number.isFinite(number)) result[key] = clamp(number, key === 'fov' ? FOV_RANGE[0] : key === 'sensitivity' ? SENSITIVITY_RANGE[0] : 0, key === 'fov' ? FOV_RANGE[1] : key === 'sensitivity' ? SENSITIVITY_RANGE[1] : 1);
    }
    if (['low', 'medium', 'high'].includes(value.graphics)) result.graphics = value.graphics;
    if (value.frameLimit === 30 || value.frameLimit === 60) result.frameLimit = value.frameLimit;
    if (['auto', 1, .75, .5].includes(value.renderScale)) result.renderScale = value.renderScale;
    if (typeof value.reducedMotion === 'boolean') result.reducedMotion = value.reducedMotion;
    Object.assign(result, sanitizeControlOptions(value));
    if (typeof value.adaptive === 'boolean') result.adaptive = value.adaptive;
    if (typeof value.showFps === 'boolean') result.showFps = value.showFps;
    if (typeof value.damageNumbers === 'boolean') result.damageNumbers = value.damageNumbers;
    if (typeof value.uiScale === 'number' && Number.isFinite(value.uiScale)) result.uiScale = clamp(value.uiScale, .8, 1.2);
    if (['white', 'yellow', 'cyan', 'magenta'].includes(value.crosshairColor)) result.crosshairColor = value.crosshairColor;
    if (value.hitPalette === 'default' || value.hitPalette === 'colorblind') result.hitPalette = value.hitPalette;
    result.bindings = sanitizeBindings(value.bindings);
  } catch { /* Blocked storage and old preferences must never prevent playing. */ }
  return result;
}
export function saveSettings(settings: Settings) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, fovScale: 'horizontal', musicMix: 2 })); } catch { /* Ephemeral browser mode. */ } }
// Field of view is shown and stored as horizontal degrees at 16:9 (Hor+: wider screens see more).
export const FOV_RANGE = [80, 120] as const;
/** Mouse sensitivity multiplier: [min, max, slider step]. */
export const SENSITIVITY_RANGE = [.2, 3, .05] as const;
export const verticalFov = (horizontal: number) => 2 * Math.atan(Math.tan(horizontal * Math.PI / 360) / (16 / 9)) * 180 / Math.PI;
export const horizontalFov = (vertical: number) => 2 * Math.atan(Math.tan(vertical * Math.PI / 360) * (16 / 9)) * 180 / Math.PI;
/** The camera and reticle share the rendered lens, including the existing scope zoom contract. */
export function aimedFov(horizontal: number, weapon: WeaponId | null, ads: number): number {
  const base = verticalFov(horizontal), zoom = 1 + ads * ((weapon ? ADS_ZOOM[weapon] : 1) - 1);
  return weapon === 'm4' ? 2 * Math.atan(Math.tan(base * Math.PI / 360) / zoom) * 180 / Math.PI : base / zoom;
}
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
