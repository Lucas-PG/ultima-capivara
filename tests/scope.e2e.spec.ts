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
    // The lens fills the screen height (it used to be a 63% peephole on a black screen), its posts reach the rim,
    // and the plates on the lens axis step aside while the corner plates stay.
    const lens = await scope.evaluate(el => parseFloat(getComputedStyle(el, '::after').width));
    expect(lens / 720).toBeGreaterThan(.86); expect(lens / 720).toBeLessThan(.94);
    expect(await scope.locator('i').evaluate(el => (el as HTMLElement).offsetWidth)).toBeCloseTo(lens, 0);
    expect(await scope.locator('.scope-flash').evaluate(el => (el as HTMLElement).offsetWidth)).toBeCloseTo(lens, 0);
    await expect(page.locator('#compass')).toHaveCSS('opacity', '0'); await expect(page.locator('#hotbar')).toHaveCSS('opacity', '0');
    await expect(page.locator('#vitals')).toBeVisible(); await expect(page.locator('#wpnbox')).toHaveCSS('opacity', '1');
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
    await expect(page.locator('#compass')).toHaveCSS('opacity', '1');
  }
});
