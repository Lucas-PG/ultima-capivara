import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';

test('deterministic game views match recorded baselines', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('uc-onboarded', '1'));
  await page.goto('/?qa=1');
  await page.waitForFunction(() => !!window.__capyQA);
  await page.evaluate(() => window.__capyQA!.start());
  await expect(page.locator('#loadingOverlay')).toHaveCount(0);
  await page.addStyleTag({ content: '#confetti,#flash{display:none!important}' });
  // Review mode writes candidates only. Copy them to baselines after inspecting every image.
  const review = process.env.QA_REVIEW_DIR;
  if (review) mkdirSync(review, { recursive: true });
  const capture = async (name: string) => {
    // Same file names as toHaveScreenshot, which turns underscores into hyphens.
    if (review) await page.screenshot({ path: join(review, name.replace(/_/g, '-')), animations: 'disabled' });
    else await expect(page).toHaveScreenshot(name, { animations: 'disabled', threshold: .2, maxDiffPixelRatio: .03 });
  };
  if (!process.env.QA_SMOKE) {
    await page.evaluate(async () => { await window.__capyQA!.pose('plaza'); window.__capyQA!.loading(true); });
    await expect(page.locator('#loadingOverlay')).toBeVisible();
    await capture('loading.png');
    await page.evaluate(() => window.__capyQA!.loading(false));
    await expect(page.locator('#loadingOverlay')).toHaveCount(0);
  }
  const all = await page.evaluate(() => window.__capyQA!.names());
  const names = process.env.QA_NAMES ? process.env.QA_NAMES.split(',') : process.env.QA_SMOKE ? ['plaza', 'fp-pistol', 'hud'] :
    process.env.QA_UI_ONLY ? ['hud', 'pause', 'results'] : all;
  for (const name of names) {
    await page.evaluate((pose: string) => window.__capyQA!.pose(pose), name);
    if (name.startsWith('results')) {
      await expect(page.locator('#vpanel')).toHaveClass(/show/);
      await page.waitForFunction(() => [...document.querySelectorAll('#vpanel [data-count]')].every(el => el.textContent === el.getAttribute('data-count') && (el.classList.contains('done') || document.body.classList.contains('reduce-motion'))));
    }
    if (name === 'pause') await expect(page.locator('#pause-panel')).toBeVisible();
    if (process.env.QA_SMOKE) await page.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: 'disabled' });
    else await capture(`${name}.png`);
  }
});
