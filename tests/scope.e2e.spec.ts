import { expect, test } from '@playwright/test';

test('Both scopes flash for local fire, keep the reticle and clear between shots', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => localStorage.setItem('uc-onboarded', '1'));
  await page.goto('/?qa=1');
  await page.waitForFunction(() => !!window.__capyQA);
  await page.evaluate(() => window.__capyQA!.start());
  for (const weapon of ['dmr', 'sniper'] as const) {
    await page.evaluate(w => window.__capyQA!.pose(`ads-${w}`), weapon);
    const scope = page.locator('#scope-overlay'), flash = scope.locator('.scope-flash');
    await expect(scope).toBeVisible(); await expect(scope).toHaveAttribute('data-kind', weapon);
    const shoot = (actor: string) => page.evaluate(({ actor, weapon }) => {
      window.__capyQA!.event({ type: 'shot', id: 1, actor, weapon,
        origin: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: -30 }, hit: false });
      const animation = document.querySelector('.scope-flash')!.getAnimations()[0];
      if (animation) { animation.pause(); animation.currentTime = 25; }
    }, { actor, weapon });
    await shoot('bot'); await expect(flash).toHaveCSS('opacity', '0');
    await shoot('practice');
    expect(await flash.evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(.1);
    await expect(scope.locator('em')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`scope-${weapon}.png`) });
    await flash.evaluate(el => el.getAnimations().forEach(a => a.finish()));
    await expect(flash).toHaveCSS('opacity', '0');
    await page.evaluate(w => window.__capyQA!.pose(`fp-${w}`), weapon);
    await shoot('practice'); await expect(scope).toBeHidden();
    await expect(flash).toHaveCSS('opacity', '0');
  }
});
