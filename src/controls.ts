import type { Settings } from './shared/types';

// The controls data model: every bindable action with its default and label,
// the rebinding rule, save sanitising, and the feel options a settings screen
// edits. The input layer (src/input.ts) reads only these ids.

export type ControlGroup = 'movement' | 'combat' | 'items' | 'interface';
export interface ControlAction { id: string; label: string; group: ControlGroup; default: string }

export const CONTROL_ACTIONS: readonly ControlAction[] = [
  { id: 'forward', label: 'Frente', group: 'movement', default: 'KeyW' },
  { id: 'back', label: 'Trás', group: 'movement', default: 'KeyS' },
  { id: 'left', label: 'Esquerda', group: 'movement', default: 'KeyA' },
  { id: 'right', label: 'Direita', group: 'movement', default: 'KeyD' },
  { id: 'sprint', label: 'Correr', group: 'movement', default: 'ShiftLeft' },
  { id: 'jump', label: 'Pular / paraquedas', group: 'movement', default: 'Space' },
  { id: 'crouch', label: 'Agachar', group: 'movement', default: 'KeyC' },
  { id: 'leanLeft', label: 'Espiar à esquerda', group: 'movement', default: 'KeyQ' },
  { id: 'leanRight', label: 'Espiar à direita', group: 'movement', default: 'KeyE' },
  { id: 'fire', label: 'Atirar', group: 'combat', default: 'Mouse0' },
  { id: 'ads', label: 'Mirar', group: 'combat', default: 'Mouse2' },
  { id: 'reload', label: 'Recarregar', group: 'combat', default: 'KeyR' },
  { id: 'melee', label: 'Golpe de facão', group: 'combat', default: 'KeyV' },
  { id: 'lastWeapon', label: 'Arma anterior', group: 'combat', default: 'KeyX' },
  { id: 'interact', label: 'Pegar / abrir', group: 'combat', default: 'KeyF' },
  { id: 'drop', label: 'Soltar arma', group: 'combat', default: 'KeyG' },
  { id: 'inspect', label: 'Inspecionar arma', group: 'combat', default: 'KeyI' },
  { id: 'slot1', label: 'Primária 1', group: 'items', default: 'Digit1' },
  { id: 'slot2', label: 'Primária 2', group: 'items', default: 'Digit2' },
  { id: 'slot3', label: 'Pistola', group: 'items', default: 'Digit3' },
  { id: 'slot4', label: 'Facão', group: 'items', default: 'Digit4' },
  { id: 'useBandage', label: 'Usar bandagem', group: 'items', default: 'Digit5' },
  { id: 'useMedkit', label: 'Usar kit médico', group: 'items', default: 'Digit6' },
  { id: 'useGuarana', label: 'Tomar guaraná', group: 'items', default: 'Digit7' },
  { id: 'useAcai', label: 'Tomar açaí', group: 'items', default: 'Digit8' },
  { id: 'useRapadura', label: 'Comer rapadura', group: 'items', default: 'Digit9' },
  { id: 'scoreboard', label: 'Placar', group: 'interface', default: 'Tab' },
  { id: 'map', label: 'Mapa da ilha', group: 'interface', default: 'KeyM' },
  { id: 'emote', label: 'Gestos (segurar)', group: 'interface', default: 'KeyB' },
];

export const DEFAULT_BINDINGS: Record<string, string> = Object.fromEntries(CONTROL_ACTIONS.map(action => [action.id, action.default]));
// Keys by KeyboardEvent.code, mouse buttons as 'Mouse' + event.button. Escape stays reserved for the menu.
export const BINDABLE_CODE = /^(Key[A-Z]|Digit[0-9]|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Space|Tab|Backquote|Arrow(Up|Down|Left|Right)|Mouse[0-4])$/;

/**
 * Binds `code` to `action`. A code already used by another action moves to it
 * the action's previous code (a swap), so one press never triggers two actions.
 */
export function rebind(bindings: Record<string, string>, action: string, code: string): Record<string, string> {
  if (!BINDABLE_CODE.test(code) || !(action in DEFAULT_BINDINGS)) return bindings;
  const next = { ...bindings }, previous = next[action] ?? DEFAULT_BINDINGS[action];
  for (const other of Object.keys(next)) if (other !== action && next[other] === code) next[other] = previous;
  next[action] = code;
  return next;
}

/**
 * Saved bindings merged over the defaults. Invalid codes are dropped. An action
 * the save does not know yet keeps its default only if no saved binding already
 * uses that code; otherwise it stays unbound ('').
 */
export function sanitizeBindings(saved: unknown): Record<string, string> {
  const result = { ...DEFAULT_BINDINGS };
  if (!saved || typeof saved !== 'object') return result;
  const value = saved as Record<string, unknown>;
  const valid = (code: unknown): code is string => typeof code === 'string' && BINDABLE_CODE.test(code);
  const taken = new Set<string>();
  for (const key of Object.keys(DEFAULT_BINDINGS)) if (valid(value[key])) { result[key] = value[key]; taken.add(value[key]); }
  for (const key of Object.keys(DEFAULT_BINDINGS)) if (!valid(value[key]) && taken.has(result[key])) result[key] = '';
  return result;
}

/** First-person weapon size at the hip: [min, max, slider step]; 1 is the researched framing. */
export const WEAPON_SIZE_RANGE = [.8, 1.2, .05] as const;
/** Feel options (booleans and multipliers) with their ranges, for the settings screen and save validation. */
export type ControlOptionKey = 'adsToggle' | 'crouchToggle' | 'sprintToggle' | 'invertY' | 'adsSensitivity' | 'scopeSensitivity' | 'cameraShake' | 'weaponSize';
export interface ControlOption { key: ControlOptionKey; label: string; help: string; min?: number; max?: number; step?: number; /** Shown with the view options (field of view) instead of the controls. */ view?: boolean }
export const CONTROL_OPTIONS: readonly ControlOption[] = [
  { key: 'adsToggle', label: 'Alternar mira com um clique', help: 'Um clique mira, outro solta.' },
  { key: 'crouchToggle', label: 'Alternar agachar', help: 'Aperte uma vez para agachar e outra para levantar.' },
  { key: 'sprintToggle', label: 'Alternar corrida', help: 'Corre até parar, mirar, atirar ou agachar.' },
  { key: 'invertY', label: 'Inverter o mouse na vertical', help: 'Mouse para cima olha para baixo.' },
  { key: 'adsSensitivity', label: 'Sensibilidade mirando', help: 'Multiplica a sensibilidade com a mira de ferro.', min: .3, max: 2, step: .05 },
  { key: 'scopeSensitivity', label: 'Sensibilidade na luneta', help: 'Multiplica a sensibilidade na Carabina e na Sniper.', min: .3, max: 2, step: .05 },
  { key: 'cameraShake', label: 'Tremor da câmera', help: 'Tranco dos tiros, explosões e impactos na câmera.', min: 0, max: 1, step: .05 },
  { key: 'weaponSize', label: 'Tamanho da arma', help: 'Menor libera mais tela; maior aproxima a arma e as patas. Mirando, fica sempre igual.', min: WEAPON_SIZE_RANGE[0], max: WEAPON_SIZE_RANGE[1], step: WEAPON_SIZE_RANGE[2], view: true },
];
export const DEFAULT_CONTROL_OPTIONS: Pick<Settings, ControlOptionKey> = {
  adsToggle: false, crouchToggle: false, sprintToggle: false, invertY: false, adsSensitivity: 1, scopeSensitivity: 1, cameraShake: 1, weaponSize: 1,
};
export function sanitizeControlOptions(saved: Record<string, unknown>): Pick<Settings, ControlOptionKey> {
  const result = { ...DEFAULT_CONTROL_OPTIONS };
  for (const option of CONTROL_OPTIONS) {
    const value = saved[option.key];
    if (option.min === undefined) { if (typeof value === 'boolean') (result[option.key] as boolean) = value; }
    else if (typeof value === 'number' && Number.isFinite(value)) (result[option.key] as number) = Math.min(option.max!, Math.max(option.min, value));
  }
  return result;
}
