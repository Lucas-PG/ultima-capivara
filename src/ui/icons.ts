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
