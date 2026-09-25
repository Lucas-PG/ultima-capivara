import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { accuracyText, cleanLabel, ELIMINATED_ACTIONS, DEATH_CARD_SECONDS, killCardParts, formatSurvived, RESULTS_ACTIONS_DELAY, HUD_MIN_SCALE, HUD_MIN_TEXT, hudScale, leaveNeedsConfirm, coverImageSet, loadingLabel, nextProgress, publicUrl, TEXT_FLOOR, tipBag } from '../src/ui/hud-logic';
import { fillTip, TIPS } from '../src/ui/tips';
import { WEAPONS } from '../src/shared/weapons';
import { PLAYER_COLORS } from '../src/shared/types';

describe('loading screen', () => {
  it('never moves the progress bar backwards or outside 0..1', () => {
    let p = 0;
    for (const value of [.2, .1, NaN, .5, -3, 4, .9]) p = nextProgress(p, value);
    expect(p).toBe(1);
    expect(nextProgress(.6, .4)).toBe(.6);
    expect(nextProgress(.6, Number.POSITIVE_INFINITY)).toBe(.6);
  });
  it('shows friendly labels in load order and "Pronto!" only when complete', () => {
    expect(loadingLabel(0)).toBe('Desenhando a ilha');
    expect(loadingLabel(.5)).toBe('Escondendo os baús');
    expect(loadingLabel(.999)).toBe('Carregando o avião');
    expect(loadingLabel(1)).toBe('Pronto!');
  });
  it('keeps caller labels short and without a trailing ellipsis', () => {
    expect(cleanLabel('  Rifle (41/42)…  ')).toBe('Rifle (41/42)');
    expect(cleanLabel('x'.repeat(40))).toHaveLength(28);
  });
  it('rotates every tip before repeating one, even across refills', () => {
    const next = tipBag(TIPS, () => .37);
    const firstRound = TIPS.map(() => next());
    expect(new Set(firstRound).size).toBe(TIPS.length);
    expect(next()).not.toBe(firstRound[firstRound.length - 1]);
  });
});

describe('loading tips copy', () => {
  it('has at least 36 unique tips that fit two lines, with no em dash', () => {
    expect(TIPS.length).toBeGreaterThanOrEqual(36);
    expect(new Set(TIPS).size).toBe(TIPS.length);
    for (const tip of TIPS) { expect(tip.length).toBeLessThanOrEqual(110); expect(tip).not.toMatch(/[—–]/); }
  });
  it('replaces key placeholders with the player bindings', () => {
    expect(fillTip('{leanLeft} e {leanRight}', { leanLeft: 'Q', leanRight: 'E' })).toBe('Q e E');
    const keys = { jump: 'Espaço', interact: 'F', leanLeft: 'Q', leanRight: 'E', reload: 'R', crouch: 'C' };
    for (const tip of TIPS) expect(fillTip(tip, keys)).not.toMatch(/\{\w+\}/);
  });
  // Tips quote gameplay numbers; if a retune changes them, the copy must change too.
  it('only states gameplay facts that are true', () => {
    expect(WEAPONS.m4.headMultiplier).toBe(2);
    expect(WEAPONS.sniper.headMultiplier).toBe(2.5);
    expect(WEAPONS.shotgun.range).toBe(35);
    expect(WEAPONS.m4.ammo).toBe(WEAPONS.dmr.ammo);
    for (const weapon of Object.values(WEAPONS)) if (!weapon.melee) expect(weapon.adsSpread).toBeLessThanOrEqual(weapon.spread);
  });
});

describe('hud', () => {
  it('scales from the 1600x900 layout, clamped, times the interface size setting', () => {
    expect(hudScale(1600, 900)).toBe(1);
    expect(hudScale(1920, 1080)).toBe(1.2);
    expect(hudScale(1280, 720)).toBe(HUD_MIN_SCALE);
    expect(hudScale(1920, 1080, 2)).toBe(1.44);
  });
  // Quality bar: no HUD text under 12 px at any supported resolution and interface size (Sentinela found 9.57 px at 720p, 80%).
  it('never renders HUD text under the 12 px floor', () => {
    for (const [w, h] of [[1280, 720], [1366, 768], [1600, 900], [1920, 1080], [2560, 1080], [2560, 1440]])
      for (const size of [.8, .9, 1, 1.1, 1.2]) expect(HUD_MIN_TEXT * hudScale(w, h, size)).toBeGreaterThanOrEqual(TEXT_FLOOR);
    expect(hudScale(1280, 720, .8)).toBe(HUD_MIN_SCALE);
  });
  it('keeps every desktop HUD, loading and results font at or above the 13 px design minimum', () => {
    const css = readFileSync('src/ui/style.css', 'utf8').replace(/@media\(max-width:[^{]*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}/g, '');
    const rules = css.match(/(?:#hud|#loadingOverlay|#victory)[^{}]*\{[^}]*\}/g) || [];
    const small = rules.filter(rule => [...rule.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].some(m => Number(m[1]) < HUD_MIN_TEXT));
    expect(small).toEqual([]);
  });
  it('formats result stats in pt-BR', () => {
    expect(formatSurvived(125.4)).toBe('2:05');
    expect(accuracyText(3, 12)).toBe('25%');
    expect(accuracyText(0, 0)).toBe('–');
  });
  it('keeps player colours as eight distinct kit colours, none of them a fur brown', () => {
    expect(new Set(PLAYER_COLORS).size).toBe(8);
    for (const color of PLAYER_COLORS) expect(color).toMatch(/^#[0-9a-f]{6}$/);
    expect(PLAYER_COLORS).not.toContain('#bd8956');
  });
});

describe('leaving a match', () => {
  // Formiga's smoke test: an eliminated player could only exit through a hidden spectator control.
  it('gives an eliminated battle royale player a visible exit next to spectate', () => {
    expect(ELIMINATED_ACTIONS.map(a => a.do)).toEqual(['spectate', 'leave']);
    expect(ELIMINATED_ACTIONS.find(a => a.do === 'leave')?.label).toBe('Voltar ao menu');
  });
  it('exits in one click when nothing is lost, and confirms when something is', () => {
    expect(leaveNeedsConfirm({ screen: 'game', host: false, phase: 'playing', alive: false, royale: true })).toBe(false);
    expect(leaveNeedsConfirm({ screen: 'game', host: false, phase: 'results', alive: true, royale: true })).toBe(false);
    expect(leaveNeedsConfirm({ screen: 'game', host: false, phase: 'playing', alive: true, royale: true })).toBe(true);
    expect(leaveNeedsConfirm({ screen: 'game', host: false, phase: 'playing', alive: false, royale: false })).toBe(true);
    expect(leaveNeedsConfirm({ screen: 'game', host: true, phase: 'playing', alive: false, royale: true })).toBe(true);
    expect(leaveNeedsConfirm({ screen: 'lobby', host: false })).toBe(true);
    expect(leaveNeedsConfirm({ screen: 'home', host: false })).toBe(false);
  });
});

describe('deploy base', () => {
  // Vite base is './': public files must follow a subpath deploy instead of the origin root.
  it('resolves the cover art under a non-root deployment', () => {
    expect(publicUrl('assets/cover-v2.png', '/ilha/', 'https://exemplo.com/ilha/')).toBe('https://exemplo.com/ilha/assets/cover-v2.png');
    expect(publicUrl('assets/cover-v2.png', './', 'https://exemplo.com/jogos/capivara/index.html')).toBe('https://exemplo.com/jogos/capivara/assets/cover-v2.png');
  });
  it('has no origin-root asset URLs left in the stylesheet', () => {
    expect(readFileSync('src/ui/style.css', 'utf8')).not.toMatch(/url\(\s*['"]?\/(?!\/)/);
  });
});

describe('results screen', () => {
  // Sentinela: the rematch and menu actions were unreachable for 2.2 s behind the victory stamp.
  it('makes the actions reachable within the 400 ms input budget', () => {
    expect(RESULTS_ACTIONS_DELAY).toBeLessThanOrEqual(400);
    const css = readFileSync('src/ui/style.css', 'utf8');
    const panel = css.match(/#victory \.vpanel\{[^}]*transition:([^;}]*)/)?.[1] || '';
    for (const ms of [...panel.matchAll(/(\d*\.?\d+)s/g)].map(m => Number(m[1]) * 1000)) expect(RESULTS_ACTIONS_DELAY + ms).toBeLessThanOrEqual(700);
  });
});

describe('death cam card', () => {
  it('names the killer, weapon and distance in the agreed pt-BR format', () => {
    expect(killCardParts('Tico', 'M4', 23.4)).toEqual({ killer: 'Tico', weapon: 'M4', distance: '23 m' });
    expect(killCardParts('Tico', 'Doze', undefined)?.distance).toBeNull();
  });
  it('has no card for storm or fall deaths, which keep their own lines', () => {
    expect(killCardParts(null, null, 12)).toBeNull();
  });
  // The card must last exactly as long as Brasa's death cam before spectate/respawn takes over.
  it('holds for the death cam duration', () => { expect(DEATH_CARD_SECONDS).toBe(1.8); });
});

describe('hud layout cost', () => {
  // Forja's M1 trace showed 55-98 ms synchronous layouts inside the frame; the HUD must never read layout per tick.
  it('does not read layout-forcing properties in the HUD code', () => {
    for (const file of ['src/ui/ui.ts', 'src/ui/crosshair.ts']) {
      const code = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '');
      expect(code).not.toMatch(/\.(offsetWidth|offsetHeight|clientHeight|clientWidth|scrollHeight|innerText)\b|getBoundingClientRect\(|getComputedStyle\(/);
    }
  });
});

describe('menu download budget', () => {
  // Sentinela measured 6.48 MiB before the menu; the 2.5 MB PNG cover and unused font families were the UI's share.
  it('serves the cover as AVIF/WebP sized to the screen, and a tiny blurred one to the loading screen', () => {
    const url = (f: string) => `/ilha/${f}`;
    expect(coverImageSet(1280, 1, url).cover).toContain('/ilha/assets/cover-1672.avif');
    expect(coverImageSet(800, 1, url).cover).toContain('/ilha/assets/cover-960.avif');
    expect(coverImageSet(800, 2, url).cover).toContain('cover-1672');
    expect(coverImageSet(1920, 1, url).blur).toContain('cover-blur-480.webp');
    for (const f of ['cover-1672', 'cover-960', 'cover-blur-480']) for (const ext of ['avif', 'webp'])
      expect(statSync(`public/assets/${f}.${ext}`).size).toBeLessThan(f === 'cover-1672' ? 260_000 : 120_000);
  });
  it('never references the PNG master or the unused Barlow families from the stylesheet', () => {
    const css = readFileSync('src/ui/style.css', 'utf8');
    expect(css).not.toMatch(/cover-v2\.png|@fontsource\/barlow|'Barlow/);
  });
});

describe('lobby warmup', () => {
  // Forja's lazy renderer warms up when the lobby opens; the host must see a busy, disabled start instead of a dead button.
  it('exposes setRoomLoading on GameUI and never lets the start button be enabled while loading', () => {
    const code = readFileSync('src/ui/ui.ts', 'utf8');
    expect(code).toMatch(/setRoomLoading\(fraction: number \| null\)/);
    expect(code).toMatch(/allReady && !loading \? '' : 'disabled'/);
    expect(code).toMatch(/Carregando a ilha/);
  });
});
