import { PLAYER_COLORS, type EmoteId } from '../shared/types';
const paths: Record<string, string> = {
  box: '<path d="M3 9h18v10H3z"/><path d="M3 9l2-4h14l2 4"/><path d="M3 13h18"/><rect x="10.5" y="11.5" width="3" height="3.5" rx=".8"/>',
  play: '<path d="m9 5 12 7-12 7z"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  link: '<path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 4 1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m2 4a5 5 0 0 1 4 5v2"/>',
  crosshair: '<circle cx="12" cy="12" r="7"/><path d="M12 1v6m0 10v6M1 12h6m10 0h6"/>',
  crown: '<path d="m3 6 5 4 4-7 4 7 5-4-2 13H5zM6 22h12"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  settings: '<path d="m10 2-.6 3-2 .9L4.6 5 2 9l2.4 2v2L2 15l2.6 4 2.8-.9 2 .9.6 3h4l.6-3 2-.9 2.8.9 2.6-4-2.4-2v-2L22 9l-2.6-4-2.8.9-2-.9-.6-3z"/><circle cx="12" cy="12" r="3"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  shield: '<path d="m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5z"/>',
  heart: '<path d="M20 4a6 6 0 0 0-8 1 6 6 0 0 0-8-1c-7 6 8 17 8 17S27 10 20 4z"/>',
  sound: '<path d="M3 9h4l5-5v16l-5-5H3zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  leaf: '<path d="M20 3C9 1 2 7 5 16c9 5 16-2 15-13ZM3 22 16 8"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 4-5 14 0 18 5-4 5-14 0-18"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  flag: '<path d="M5 22V3c5-4 9 4 15 0v11c-6 4-10-4-15 0"/>',
  mouse: '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 2v7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
};
// Painted cartoon icons (Oficina, public/assets/ui/icon-*.webp) replace the line glyphs they exist for; small functional
// glyphs (arrows, check, close, link) stay as strokes.
const PAINTED: Record<string, string> = { play: 'play', plus: 'plus', users: 'users', settings: 'gear', crown: 'crown', clock: 'clock', heart: 'heart', shield: 'shield', globe: 'globe', leaf: 'leaf', crosshair: 'crosshair', eye: 'eye' };
export function icon(name: string, cls = '') {
  if (PAINTED[name]) return `<img class="icon picon ${cls}" src="${uiArt(`icon-${PAINTED[name]}`)}" alt="" aria-hidden="true" draggable="false">`;
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.leaf}</svg>`;
}
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
// Capybara sticker: fur is always the capybara brown; the player colour is the bandana (style bible §3.7).
// Painted UI sprites cut from the approved final-art sheets by scripts/build-ui-art.mjs.
// Absolute against the document: a relative url() inside a CSS custom property resolves
// against the stylesheet that consumes it (dist/assets/), not the page.
export const uiArt = (name: string) => {
  const path = `${import.meta.env.BASE_URL}assets/ui/${name}.webp`;
  return typeof document === 'undefined' ? path : new URL(path, document.baseURI).href;
};
// Original painted-sticker silhouettes describe the gesture, rather than an unrelated item.
const EMOTE_DRAWINGS: Partial<Record<EmoteId, string>> = {
  sit: '<ellipse cx="40" cy="72" rx="28" ry="4" fill="#3a241822" stroke="none"/><path d="m23 34-8 34q0 4 6 4l13-35m14 0 12 35q6 0 6-4l-8-34" fill="#a66737"/><path d="M27 55h28" fill="none"/><path d="M12 26q1-9 28-9t28 9v12q-1 9-28 9T12 38Z" fill="#bf8344"/><ellipse cx="40" cy="26" rx="28" ry="10" fill="#f1c575"/><path d="M22 24q17-4 35 0M28 30q12 2 23-1" stroke="#bb8347" stroke-width="2" fill="none"/>',
  chill: '<ellipse cx="40" cy="72" rx="34" ry="4" fill="#3a241822" stroke="none"/><path d="m9 70 3-48h7l-2 48m46 0-2-48h7l3 48" fill="#b57a42"/><path d="m15 30 5 4m40 0 6-4" fill="none"/><path d="M20 34q21 14 40 0-2 30-23 30Q23 61 20 34Z" fill="#36baaa"/><path d="M22 36q18 18 36 2M26 48q13 15 28 1" fill="none" stroke="#fff1d6" stroke-width="3"/><path d="M32 18h11L32 29h11M50 7h14L50 21h14" fill="none" stroke="#3a2418" stroke-width="4"/>',
  dance: '<path d="M23 22v23m0-22 17-6v22" fill="none" stroke-width="5"/><ellipse cx="17" cy="46" rx="8" ry="6" fill="#ffc23d"/><ellipse cx="34" cy="40" rx="8" ry="6" fill="#ffc23d"/><path d="m52 16 8 4m2 10 8 2M10 14l-4-5" stroke="#e2623a" fill="none"/><path d="M27 53q9-7 14 1l3 13q-4 9-18 2-7-4 1-16Z" fill="#e2623a"/><path d="M52 43q8-5 13 4l5 12q0 9-14 5-10-3-4-21Z" fill="#1fb5a8"/><path d="m29 58 5-2m22-7 5 2" stroke="#fff1d6" fill="none"/>',
};
export function emoteIcon(id: EmoteId) {
  const drawing = EMOTE_DRAWINGS[id];
  return drawing ? `<svg class="emote-art" viewBox="0 0 80 80" stroke="#3a2418" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawing}</svg>` : `<img src="${uiArt(id === 'wave' ? 'capy-wave' : 'capy-win')}" alt="" draggable="false">`;
}
export function capybara(color = '#1fb5a8') {
  const kit = /^#[0-9a-f]{6}$/i.test(color) ? color : '#1fb5a8';
  // Kit colours have a painted portrait with the bandana in that colour; wrapped in the same 80x80 SVG so every
  // avatar slot keeps its size rules. Any other colour falls back to the drawn sticker.
  if ((PLAYER_COLORS as readonly string[]).includes(kit.toLowerCase())) return `<svg class="capy-avatar" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="39" fill="${kit}33"/><image href="${uiArt(`capy-${kit.slice(1).toLowerCase()}`)}" x="0" y="0" width="80" height="80" style="clip-path:circle(39px at 40px 40px)"/></svg>`;
  return `<svg class="capy-avatar" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="39" fill="${kit}33"/><g stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"><circle cx="27" cy="19" r="6" fill="#b8743a"/><circle cx="45" cy="16" r="5.5" fill="#b8743a"/><path d="M13 43c0-16 12-26 28-26 12 0 20 5 24 13 3 5 3 10 3 15 0 9-6 15-15 15H29c-10 0-16-7-16-17Z" fill="#b8743a"/><path d="M49 28h10c5 0 9 4 9 9v9c0 6-5 10-11 10h-8Z" fill="#8a5230"/><path d="M17 58h44l-18 17Z" fill="${kit}"/></g><path d="M22 34c3-6 9-9 16-9" fill="none" stroke="#d39a47" stroke-width="3" stroke-linecap="round"/><ellipse cx="62" cy="36" rx="2.4" ry="3" fill="${INK}"/><circle cx="42" cy="33" r="3.6" fill="#1a120c"/><circle cx="43.2" cy="31.8" r="1.2" fill="#fff"/><path d="M56 49q4 2 8-1" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/></svg>`;
}

// Sticker HUD art, carried over from the first version of the game (reference/legacy.html).
const INK = '#16120e';
const WEAPON_PATHS: Record<string, string> = {
  smg: '<path d="M14 9 H64 V16 H56 L54 26 H47 L49 16 H40 L37 22 H30 L32 16 H26 L18 19 H10 Z"/><rect x="64" y="11" width="10" height="3"/><rect x="30" y="4" width="10" height="4"/>',
  dmr: '<path d="M2 11 L18 9 H26 V7 H70 V9 H99 V11 H70 V16 H60 V25 H55 L53 16 H44 L40 27 H33 L36 16 H28 L22 20 H6 Z"/><rect x="32" y="1" width="26" height="5" rx="2"/>',
  machete: '<path d="M18 21 Q55 3 97 7 Q72 19 34 22 Z"/><rect x="2" y="18" width="18" height="7" rx="2"/>',
  pistol: '<path d="M20 6h46v9H40l-3 3-3 14H22l3-14h-5z"/><rect x="62" y="8" width="6" height="3"/>',
  revolver: '<path d="M22 8h8v-2h10v2h36v6H44v4h-4l-3 3-4 11H22l4-12-4-2z"/><circle cx="38" cy="12" r="6"/><rect x="72" y="4" width="3" height="4"/>',
  coco: '<path d="M4 12 L20 8 H30 V5 H84 V19 H44 L40 27 H33 L35 19 H24 L8 22 Z"/><rect x="50" y="1" width="4" height="5"/><circle cx="90" cy="12" r="7"/>',
  shotgun: '<path d="M2 12 L22 8 H40 V6 H96 V11 H66 V14 H44 L40 22 H33 L35 14 H24 L6 22 Z"/><rect x="48" y="12" width="14" height="5"/>',
  m4: '<path d="M2 11 L18 9 H26 V7 H64 V9 H82 V11 H96 V13 H80 V16 H64 L60 17 V26 H55 L53 17 H44 L40 29 H33 L36 17 H28 L22 20 H6 Z"/><rect x="36" y="3" width="10" height="4"/>',
  sniper: '<path d="M2 13 L20 9 H34 V8 H66 V10 H99 V12 H66 V15 H44 L40 24 H33 L35 15 H22 L6 22 Z"/><rect x="34" y="2" width="24" height="5" rx="2"/><rect x="40" y="7" width="3" height="2"/><rect x="50" y="7" width="3" height="2"/>',
};
// Silhouettes use currentColor so the HUD decides their tint.
export const weaponIcon = (id: string) => WEAPON_PATHS[id] ? `<svg class="weapon-icon" viewBox="0 0 100 32" aria-hidden="true"><g fill="currentColor">${WEAPON_PATHS[id]}</g></svg>` : '';
export const CONSUMABLE_ICONS: Record<string, string> = {
  bandage: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="6" fill="#fff4d6" stroke="${INK}" stroke-width="2"/><line x1="8" y1="6" x2="8" y2="18" stroke="#e5412d" stroke-width="2.4"/><line x1="16" y1="6" x2="16" y2="18" stroke="#e5412d" stroke-width="2.4"/></svg>`,
  medkit: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5" fill="#fff4d6" stroke="${INK}" stroke-width="2"/><path d="M12 7.5v9M7.5 12h9" stroke="#e5412d" stroke-width="3"/></svg>`,
  guarana: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2" fill="#2f8a3a" stroke="${INK}" stroke-width="2"/><rect x="7" y="9" width="10" height="5" fill="#fff4d6" stroke="${INK}" stroke-width="1.5"/></svg>`,
  acai: `<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="#3a2418" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M6 23c0-8 8-14 18-14s18 6 18 14Z" fill="#6b2a86"/><path d="M12 18c2-3 5-5 9-5.5" stroke="#b77bd1" stroke-width="3" fill="none"/><circle cx="30" cy="15" r="3.6" fill="#fff1a8" stroke-width="2.2"/><circle cx="36" cy="19" r="3" fill="#fff1a8" stroke-width="2.2"/><path d="M20 19h4" stroke="#ffc23d" stroke-width="3"/><path d="M5 23h38l-4 14c-1 3.5-3.5 5-7 5H16c-3.5 0-6-1.5-7-5Z" fill="#fff4d6"/><path d="M11 28h26" stroke="#f1ddb0" stroke-width="3"/></g></svg>`,
  rapadura: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="10" rx="1.5" fill="#a8642a" stroke="${INK}" stroke-width="2"/><path d="M4.5 10.5 H19.5" stroke="#d09048" stroke-width="2"/></svg>`,
};
export const HUD_ART = {
  swimming: `<svg class="swim-icon" viewBox="0 0 44 40" aria-hidden="true"><g stroke="#3a2418" stroke-width="2.5" stroke-linejoin="round"><circle cx="12" cy="10" r="4" fill="#ba7946"/><circle cx="30" cy="9" r="4" fill="#ba7946"/><path d="M7 25V18c0-8 5-11 14-11s16 5 16 14v7Z" fill="#cf965b"/><path d="M24 18h9c4 0 6 3 6 7v4H24Z" fill="#e6b77b"/><path d="M3 27q5-5 10 0t10 0t10 0t8 0v8H3Z" fill="#45c5c3"/></g><circle cx="21" cy="16" r="2" fill="#3a2418"/><circle cx="34" cy="22" r="1.5" fill="#3a2418"/><path d="M5 34q5-4 10 0t10 0t10 0" fill="none" stroke="#fff4d6" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  shield: `<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M11 2 L19 5 V11 C19 16 15 19 11 20.5 C7 19 3 16 3 11 V5 Z" fill="#2f9df4" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
  heart: `<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M11 19.5 C5 15 2 11.5 2 8 C2 5 4.2 3 6.8 3 C8.6 3 10 4 11 5.6 C12 4 13.4 3 15.2 3 C17.8 3 20 5 20 8 C20 11.5 17 15 11 19.5 Z" fill="#e5412d" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
  burst: `<svg viewBox="-24 -24 48 48" aria-hidden="true"><polygon points="0,-23 6,-10 20,-15 12,-3 23,6 9,8 11,22 0,12 -11,22 -9,8 -23,6 -12,-3 -20,-15 -6,-10" fill="#e5412d" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><text x="0" y="8" text-anchor="middle" font-family="Dela Gothic One,Arial Black,sans-serif" font-size="20" fill="#fff4d6" stroke="${INK}" stroke-width="1">!</text></svg>`,
  helmet: `<svg width="18" height="16" viewBox="0 0 18 16" aria-hidden="true"><path d="M2 12 Q2 2 9 2 Q16 2 16 12 Z" fill="#4a5234" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><rect x="1" y="11" width="16" height="3" rx="1" fill="#2a2e22" stroke="${INK}" stroke-width="1.5"/></svg>`,
  safeArrow: `<svg width="22" height="22" viewBox="-11 -11 22 22" aria-hidden="true"><path id="safeArrow" d="M0,-9 L7,7 L0,3 L-7,7Z" fill="${INK}"/></svg>`,
  stance: `<svg width="52" height="56" viewBox="0 0 60 62" aria-hidden="true"><line x1="6" y1="58" x2="54" y2="58" stroke="currentColor" stroke-width="3" stroke-linecap="round" /><text x="3" y="12" fill="#6f5c40" font-family="Dela Gothic One,Arial Black,sans-serif" font-size="11">Q</text><text x="49" y="12" fill="#6f5c40" font-family="Dela Gothic One,Arial Black,sans-serif" font-size="11">E</text><g id="figure"><g id="torso"><line x1="30" y1="56" x2="30" y2="23" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><circle cx="30" cy="13" r="7.5" fill="#ffb81c" stroke="${INK}" stroke-width="2.5"/></g></g></svg>`,
};
// HUD item art: painted icons (public/assets/ui/icon-<name>.webp, same family as the heart and shield) where they exist,
// drawn stickers otherwise. Every item, heal and gear piece reads the same in the bag, the pickup pop and the prompt.
const ITEM_PAINTED: Record<string, string> = {};
const ITEM_DRAWN: Record<string, string> = {
  bandage: `<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="#3a2418" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M30 33h11c2.5 0 4-1.5 4-4" fill="#fff4d6"/><circle cx="21" cy="24" r="15" fill="#fff4d6"/><path d="M12 13.5 26 37.5M18 10.5l13 23" stroke="#e2623a" stroke-width="4"/><circle cx="21" cy="24" r="15" fill="none"/><circle cx="21" cy="24" r="5" fill="#f1ddb0"/><path d="M12 17a10 10 0 0 1 7-5" fill="none" stroke="#fff" stroke-width="3" opacity=".85"/></g></svg>`,
  medkit: `<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="#3a2418" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M18 11V8.5c0-1.5 1-2.5 2.5-2.5h7c1.5 0 2.5 1 2.5 2.5V11" fill="none" stroke-width="3.5"/><rect x="5" y="11" width="38" height="30" rx="7" fill="#fff4d6"/><path d="M5 34h38v0a7 7 0 0 1-7 7H12a7 7 0 0 1-7-7Z" fill="#f1ddb0" stroke="none"/><rect x="5" y="11" width="38" height="30" rx="7" fill="none"/><path d="M20.5 17h7v6h6v7h-6v6h-7v-6h-6v-7h6Z" fill="#e2623a"/><path d="M10 16h10" stroke="#fff" stroke-width="3" opacity=".9"/></g></svg>`,
  guarana: `<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="#3a2418" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M13 9c0-2 1.5-3 3.5-3h15C33.5 6 35 7 35 9v31c0 2-1.5 3-3.5 3h-15c-2 0-3.5-1-3.5-3Z" fill="#3f8f4a"/><path d="M13 17h22v13H13Z" fill="#fff4d6"/><circle cx="21" cy="24" r="4" fill="#e2623a" stroke-width="2.2"/><circle cx="28" cy="23" r="4" fill="#e2623a" stroke-width="2.2"/><circle cx="21" cy="24" r="1.6" fill="#3a2418" stroke="none"/><circle cx="28" cy="23" r="1.6" fill="#3a2418" stroke="none"/><path d="M16 11v3M16 34v5" stroke="#9be08a" stroke-width="3"/><path d="M18 6V3.5h12V6" fill="#c9c2b2"/></g></svg>`,
  acai: `<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="#3a2418" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M5 22h38l-4 15c-1 3.5-3.5 5-7 5H16c-3.5 0-6-1.5-7-5Z" fill="#fff4d6"/><path d="M5 22c0-5 8-9 19-9s19 4 19 9Z" fill="#5b2470"/><circle cx="17" cy="16" r="4.5" fill="#fff1a8" stroke-width="2.4"/><circle cx="28" cy="15" r="4.5" fill="#fff1a8" stroke-width="2.4"/><path d="M32 19h6M11 20h3M22 19h3" stroke="#ffc23d" stroke-width="3"/><path d="M12 27h24" stroke="#f1ddb0" stroke-width="3"/></g></svg>`,
  rapadura: `<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="#3a2418" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M6 17 24 9l18 8v15l-18 8-18-8Z" fill="#b8692b"/><path d="M6 17l18 8 18-8M24 25v15" fill="none"/><path d="M24 25 42 17v15l-18 8Z" fill="#8c4a1c" stroke="none"/><path d="M6 17l18 8 18-8M24 25v15M6 17 24 9l18 8v15l-18 8-18-8Z" fill="none"/><path d="M12 16l12-5" stroke="#e6a35e" stroke-width="3"/><path d="M14 28.5v6M18 30.5v6" stroke="#e6c58a" stroke-width="2.5"/></g></svg>`,
  armor: `<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="#3a2418" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M15 6h5c1 3 2.5 4.5 4 4.5S27 9 28 6h5l8 6-3 8-3-2v22c0 1.5-1 2.5-2.5 2.5h-17C14 42.5 13 41.5 13 40V18l-3 2-3-8Z" fill="#2f9df4"/><rect x="16" y="24" width="7" height="7" rx="1.5" fill="#1f6fb4" stroke-width="2.4"/><rect x="25" y="24" width="7" height="7" rx="1.5" fill="#1f6fb4" stroke-width="2.4"/><path d="M24 12v28" stroke="#1f6fb4" stroke-width="2.4" stroke-dasharray="3 3"/><path d="M16 13l3 4" stroke="#9ad4ff" stroke-width="3"/></g></svg>`,
  helmet: `<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="#3a2418" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M6 32C6 18 13 9 24 9s18 9 18 23Z" fill="#6d7a3d"/><path d="M3 31h42v4c0 1.5-1 2.5-2.5 2.5h-37C4 37.5 3 36.5 3 35Z" fill="#4c5629"/><path d="M13 24c1-6 5-10 11-11" stroke="#a9b56a" stroke-width="3.5" fill="none"/><rect x="15" y="20" width="18" height="7" rx="3.5" fill="#1fb5a8" stroke-width="2.4"/></g></svg>`,
  ammo: `<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="#3a2418" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M14 21V9.5a3 3 0 0 1 6 0V21M21 21V7.5a3 3 0 0 1 6 0V21M28 21V9.5a3 3 0 0 1 6 0V21" fill="#ffc23d"/><rect x="7" y="20" width="34" height="21" rx="4" fill="#6d7a3d"/><rect x="18" y="26" width="12" height="7" rx="2" fill="#4c5629" stroke-width="2.4"/><path d="M11 25v11" stroke="#a9b56a" stroke-width="3"/></g></svg>`,
  storm: `<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="#3a2418" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M13 31a8 8 0 0 1-1-16A11 11 0 0 1 33 12a8.5 8.5 0 0 1 2 19Z" fill="#8a4dff"/><path d="M14 19a6 6 0 0 1 6-4" stroke="#c9a8ff" stroke-width="3" fill="none"/><path d="m25 26-6 10h6l-3 9 10-13h-6l3-6Z" fill="#ffc23d" stroke-width="2.6"/></g></svg>`,
  parachute: `<svg viewBox="0 0 48 48" aria-hidden="true"><g stroke="#3a2418" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><path d="M4 22a20 16 0 0 1 40 0c-3-2-6.5-2-10 0-3-2-6.5-2-10 0-3-2-6.5-2-10 0-3.5-2-7-2-10 0Z" fill="#ffc23d"/><path d="M14 22c0-9 4-15 10-16 6 1 10 7 10 16-3-2-6.5-2-10 0-3-2-6.5-2-10 0Z" fill="#1fb5a8"/><path d="m5 22 15 16M43 22 28 38M24 22v15" fill="none" stroke-width="2"/><rect x="18" y="36" width="12" height="8" rx="2" fill="#a96b38"/></g></svg>`,
};
export const itemIcon = (kind: string, cls = '') => ITEM_PAINTED[kind]
  ? `<img class="item-art ${cls}" src="${uiArt(`icon-${ITEM_PAINTED[kind]}`)}" alt="" aria-hidden="true" draggable="false">`
  : `<span class="item-art ${cls}">${ITEM_DRAWN[kind] ?? ''}</span>`;
