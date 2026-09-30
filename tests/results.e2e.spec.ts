import { expect, test } from '@playwright/test';

test('Respawn-mode results count falls, not a time alive everyone shares, and never crown a survivor', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => localStorage.setItem('uc-onboarded', '1'));
  await page.goto('/?qa=1');
  await page.waitForFunction(() => !!window.__capyQA);
  await page.evaluate(async () => { await window.__capyQA!.start(); await window.__capyQA!.pose('results-correria'); });
  const panel = page.locator('#vpanel.show');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.vstats')).toContainText('Quedas');
  await expect(panel.locator('.vstats')).not.toContainText('Tempo vivo');
  await expect(panel.locator('.vawards')).not.toContainText('Sobrevivente');
  await expect(panel.locator('.vplace')).toContainText('2');
  // The battle royale card still reports how long you lasted.
  await page.evaluate(() => window.__capyQA!.pose('results'));
  await expect(page.locator('#vpanel.show .vstats')).toContainText('Tempo vivo');
});
