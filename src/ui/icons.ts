const paths: Record<string, string> = {
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
export function icon(name: string, cls = '') { return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.leaf}</svg>`; }
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
export function capybara(color = '#bd8956') {
  const safe = /^#[0-9a-f]{6}$/i.test(color) ? color : '#bd8956';
  return `<svg class="capy-avatar" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="39" fill="${safe}22"/><g fill="${safe}" stroke="#172820" stroke-width="2"><circle cx="22" cy="24" r="9"/><circle cx="56" cy="24" r="9"/><path d="M15 40c0-18 45-23 51-1 6 18-3 28-23 28S12 59 15 40Z"/></g><path d="M34 42c0-9 31-10 32 4 0 12-10 15-20 12-8-2-12-7-12-16" fill="#e5bf87" opacity=".6"/><circle cx="30" cy="36" r="3.4" fill="#172820"/><circle cx="58" cy="42" r="2.5" fill="#172820"/><path d="M46 54q8 3 12-2" fill="none" stroke="#172820" stroke-width="2" stroke-linecap="round"/></svg>`;
}

// Sticker HUD art, carried over from the first version of the game (reference/legacy.html).
const INK = '#16120e';
const WEAPON_PATHS: Record<string, string> = {
  smg: '<path d="M14 9 H64 V16 H56 L54 26 H47 L49 16 H40 L37 22 H30 L32 16 H26 L18 19 H10 Z"/><rect x="64" y="11" width="10" height="3"/><rect x="30" y="4" width="10" height="4"/>',
  dmr: '<path d="M2 11 L18 9 H26 V7 H70 V9 H99 V11 H70 V16 H60 V25 H55 L53 16 H44 L40 27 H33 L36 16 H28 L22 20 H6 Z"/><rect x="32" y="1" width="26" height="5" rx="2"/>',
  machete: '<path d="M18 21 Q55 3 97 7 Q72 19 34 22 Z"/><rect x="2" y="18" width="18" height="7" rx="2"/>',
  slingshot: '<path d="M50 31 V18 L39 4 M50 18 L61 4" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><path d="M39 5 Q50 17 61 5" fill="none" stroke="#e5412d" stroke-width="2.5"/>',
  pistol: '<path d="M20 6h46v9H40l-3 3-3 14H22l3-14h-5z"/><rect x="62" y="8" width="6" height="3"/>',
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
  acai: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10 H21 L18 20 H6 Z" fill="#fff4d6" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><ellipse cx="12" cy="10" rx="9" ry="3" fill="#4a1a5a" stroke="${INK}" stroke-width="2"/><circle cx="14.5" cy="8.6" r="2" fill="#f0d060" stroke="${INK}" stroke-width="1.2"/></svg>`,
  rapadura: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="10" rx="1.5" fill="#a8642a" stroke="${INK}" stroke-width="2"/><path d="M4.5 10.5 H19.5" stroke="#d09048" stroke-width="2"/></svg>`,
};
export const HUD_ART = {
  shield: `<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M11 2 L19 5 V11 C19 16 15 19 11 20.5 C7 19 3 16 3 11 V5 Z" fill="#2f9df4" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
  heart: `<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M11 19.5 C5 15 2 11.5 2 8 C2 5 4.2 3 6.8 3 C8.6 3 10 4 11 5.6 C12 4 13.4 3 15.2 3 C17.8 3 20 5 20 8 C20 11.5 17 15 11 19.5 Z" fill="#e5412d" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
  burst: `<svg viewBox="-24 -24 48 48" aria-hidden="true"><polygon points="0,-23 6,-10 20,-15 12,-3 23,6 9,8 11,22 0,12 -11,22 -9,8 -23,6 -12,-3 -20,-15 -6,-10" fill="#e5412d" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><text x="0" y="8" text-anchor="middle" font-family="Dela Gothic One,Arial Black,sans-serif" font-size="20" fill="#fff4d6" stroke="${INK}" stroke-width="1">!</text></svg>`,
  helmet: `<svg width="18" height="16" viewBox="0 0 18 16" aria-hidden="true"><path d="M2 12 Q2 2 9 2 Q16 2 16 12 Z" fill="#4a5234" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><rect x="1" y="11" width="16" height="3" rx="1" fill="#2a2e22" stroke="${INK}" stroke-width="1.5"/></svg>`,
  safeArrow: `<svg width="22" height="22" viewBox="-11 -11 22 22" aria-hidden="true"><path id="safeArrow" d="M0,-9 L7,7 L0,3 L-7,7Z" fill="${INK}"/></svg>`,
  stance: `<svg width="52" height="56" viewBox="0 0 60 62" aria-hidden="true"><line x1="6" y1="58" x2="54" y2="58" stroke="currentColor" stroke-width="3" stroke-linecap="round" /><text x="3" y="12" fill="#6f5c40" font-family="Dela Gothic One,Arial Black,sans-serif" font-size="11">Q</text><text x="49" y="12" fill="#6f5c40" font-family="Dela Gothic One,Arial Black,sans-serif" font-size="11">E</text><g id="figure"><g id="torso"><line x1="30" y1="56" x2="30" y2="23" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><circle cx="30" cy="13" r="7.5" fill="#ffb81c" stroke="${INK}" stroke-width="2.5"/></g></g></svg>`,
};
