import { expect, test } from '@playwright/test';
import type { GameUI } from '../src/ui/ui';
import type { WorldSnapshot } from '../src/shared/types';

type HudReview = Pick<GameUI, 'game' | 'update' | 'event' | 'toggleMap' | 'setPaused'> & { snapshot: WorldSnapshot; hudTime: number };
declare global { interface Window { __hudQA?: HudReview } }

test('Navigation, readable weapon cards and combat outcomes have distinct places', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => localStorage.setItem('uc-onboarded', '1'));
  await page.goto('/?qa=1');
  await page.waitForFunction(() => !!window.__capyQA && !!window.__hudQA);
  await page.evaluate(async () => { await window.__capyQA!.start(); await window.__capyQA!.pose('hud-full'); });
  const map = (await page.locator('#mapWrap').boundingBox())!;
  const status = (await page.locator('#topL').boundingBox())!;
  expect(map.x + map.width).toBeLessThan(320);
  expect(map.y).toBeLessThan(30);
  expect(status.x).toBeGreaterThan(800);
  await expect(page.locator('#hotbar .hs')).toHaveCount(4);
  await expect(page.locator('#hotbar .hs-name')).toHaveText(['M4', 'Sniper', 'Pistola', 'Facão']);
  await expect(page.locator('#hotbar .hs.on .hs-selected')).toBeVisible();
  const ammo = (await page.locator('#ammoBox').boundingBox())!;
  const weapons = (await page.locator('#hotbar').boundingBox())!;
  expect(ammo.y + ammo.height).toBeLessThan(weapons.y);
  for (const art of await page.locator('#hotbar .hs > img, #hotbar .hs > .weapon-icon').all())
    expect((await art.boundingBox())!.width).toBeGreaterThanOrEqual(70);
  for (const label of await page.locator('#hotbar .hs-name').all()) {
    const fit = await label.evaluate(el => {
      const text = el.getBoundingClientRect(), card = el.parentElement!.getBoundingClientRect();
      return { clipped: el.scrollHeight > el.clientHeight + 1, outside: text.bottom > card.bottom - 2 };
    });
    expect(fit).toEqual({ clipped: false, outside: false });
  }
  await page.evaluate(() => window.__hudQA!.event({ type: 'kill', id: 9991, actor: 'practice', target: 'bot-hud-6', weapon: 'm4', distance: 31 }));
  await expect(page.locator('#killConfirm')).toContainText('Eliminou');
  await expect(page.locator('#killConfirm b')).toHaveText('Zeca');
  await expect(page.locator('#killConfirm em')).toHaveText('M4 · 31 m');
  await page.evaluate(() => window.__capyQA!.pose('hud-watch'));
  await expect(page.locator('#dcTitle')).toHaveText('Eliminada por');
  await expect(page.locator('#dcKiller .kc-text > b')).toHaveText('Caju');
  await expect(page.locator('#dcKiller .kc-left')).toContainText('Vida da rival');
  await expect(page.locator('#dcPlacement')).toContainText('Seu lugar');
  await page.evaluate(() => window.__capyQA!.pose('results-correria'));
  await expect(page.locator('#vpanel.show')).toBeVisible();
  await expect(page.locator('#victory .vnum b')).toHaveText('#2');
  await expect(page.locator('#victory .vchampion')).toContainText('CAMPEÃ DA PARTIDA');
  await expect(page.locator('#victory .vmascot')).toHaveAttribute('src', /capy-wave/);
  await expect(page.getByRole('button', { name: 'Jogar de novo' })).toBeEnabled();
  await page.evaluate(() => window.__capyQA!.pose('results'));
  await expect(page.locator('#victory .vnum b')).toHaveText('#1');
  await expect(page.locator('#victory .vmascot')).toHaveAttribute('src', /capy-win/);
});

test('Full-screen match panels clear combat feedback and preserve keyboard dismissal', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => localStorage.setItem('uc-onboarded', '1'));
  await page.goto('/?qa=1');
  await page.waitForFunction(() => !!window.__capyQA && !!window.__hudQA);
  await page.evaluate(async () => { await window.__capyQA!.start(); await window.__capyQA!.pose('hud-full'); window.__hudQA!.toggleMap(true); });
  await expect(page.locator('#bigmap')).toBeVisible();
  await expect(page.locator('#mapWrap')).toBeHidden();
  await expect(page.locator('#matchMoment')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#bigmap')).toBeHidden();
  await expect(page.locator('#mapWrap')).toBeVisible();
  await page.evaluate(() => window.__hudQA!.setPaused(true));
  await expect(page.locator('#pause-panel')).toBeVisible();
  await expect(page.locator('#hotbar')).toBeHidden();
  const small = await page.locator('#pause-panel').evaluate(panel => [...panel.querySelectorAll('*')].filter(el =>
    el.checkVisibility({ checkVisibilityCSS: true }) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent?.trim())
      && parseFloat(getComputedStyle(el).fontSize) < 12).map(el => el.className));
  expect(small).toEqual([]);
  await page.evaluate(() => window.__hudQA!.setPaused(false));
  await expect(page.locator('#hotbar')).toBeVisible();
});
