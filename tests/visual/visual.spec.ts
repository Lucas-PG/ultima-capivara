import { test, expect } from '@playwright/test';

test('deterministic game views match recorded baselines', async ({ page }, testInfo) => {
  await page.goto('/?qa=1');
  await page.waitForFunction(() => !!window.__capyQA);
  await page.evaluate(() => window.__capyQA!.start());
  await expect(page.locator('#loadingOverlay')).toHaveCount(0);
  await page.addStyleTag({ content: '#confetti,#flash{display:none!important}' });
  if (!process.env.QA_SMOKE) {
    await page.evaluate(async () => { await window.__capyQA!.pose('plaza'); window.__capyQA!.loading(true); });
    await expect(page.locator('#loadingOverlay')).toBeVisible();
    await expect(page).toHaveScreenshot('loading.png', { animations: 'disabled', threshold: .2, maxDiffPixelRatio: .03 });
    await page.evaluate(() => window.__capyQA!.loading(false));
    await expect(page.locator('#loadingOverlay')).toHaveCount(0);
  }
  const all = await page.evaluate(() => window.__capyQA!.names());
  const names = process.env.QA_SMOKE ? ['plaza', 'fp-pistol', 'hud'] :
    process.env.QA_UI_ONLY ? ['hud', 'pause', 'results'] : all;
  for (const name of names) {
    await page.evaluate((pose: string) => window.__capyQA!.pose(pose), name);
    if (name === 'results') await expect(page.locator('#vpanel')).toHaveClass(/show/);
    if (name === 'pause') await expect(page.locator('#pause-panel')).toBeVisible();
    if (process.env.QA_SMOKE) await page.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: 'disabled' });
    else await expect(page).toHaveScreenshot(`${name}.png`, { animations: 'disabled', threshold: .2, maxDiffPixelRatio: .03 });
  }
});
