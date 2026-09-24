import { PLAYER_COLORS, type Settings } from './shared/types';
import { clamp } from './shared/math';

export const DEFAULT_BINDINGS: Record<string, string> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft',
  jump: 'Space', crouch: 'KeyC', reload: 'KeyR', interact: 'KeyF', leanLeft: 'KeyQ', leanRight: 'KeyE',
};
export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1, fov: 78, graphics: 'medium', reducedMotion: false,
  master: .8, effects: .85, ambience: .45, music: .25, adsToggle: false, bindings: { ...DEFAULT_BINDINGS },
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
    if (typeof value.reducedMotion === 'boolean') result.reducedMotion = value.reducedMotion;
    if (typeof value.adsToggle === 'boolean') result.adsToggle = value.adsToggle;
    if (value.bindings && typeof value.bindings === 'object') for (const key of Object.keys(DEFAULT_BINDINGS)) {
      if (typeof value.bindings[key] === 'string' && /^(Key[A-Z]|Digit[0-9]|Shift(Left|Right)|Control(Left|Right)|Space|Arrow(Up|Down|Left|Right))$/.test(value.bindings[key])) result.bindings[key] = value.bindings[key];
    }
  } catch { /* Blocked storage and old preferences must never prevent playing. */ }
  return result;
}
export function saveSettings(settings: Settings) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* Ephemeral browser mode. */ } }
export function loadProfile(): { name: string; color: string } {
  try { const color = localStorage.getItem('uc-color') || ''; return { name: (localStorage.getItem('uc-nick') || '').replace(/[\x00-\x1f\x7f<>]/g, '').slice(0, 18), color: PLAYER_COLORS.includes(color) ? color : PLAYER_COLORS[0] }; }
  catch { return { name: '', color: '#bd8956' }; }
}
export function saveProfile(name: string, color: string) { try { localStorage.setItem('uc-nick', name); localStorage.setItem('uc-color', color); } catch { /* Optional persistence. */ } }
