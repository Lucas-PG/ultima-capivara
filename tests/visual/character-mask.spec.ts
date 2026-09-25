import { test, expect } from '@playwright/test';

type MaskCase = { distance: number; blocked: boolean; inside: number; holes: number; leaks: number };

test('character mask fills visible slopes without showing through foreground or beyond 150 m', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/visual/character-mask.html');
  await page.waitForFunction(() => Array.isArray((window as Window & { result?: MaskCase[] }).result));
  const cases = await page.evaluate(() => (window as Window & { result?: MaskCase[] }).result!);
  await testInfo.attach('mask-fill.json', { body: JSON.stringify(cases, null, 2), contentType: 'application/json' });
  expect(errors).toEqual([]);
  for (const sample of cases) {
    if (!sample.blocked && sample.distance < 150) {
      expect(sample.inside, `reference face at ${sample.distance} m`).toBeGreaterThan(1000);
      expect(1 - sample.holes / sample.inside, `visible fill at ${sample.distance} m`).toBeGreaterThan(.999);
    } else expect(sample.leaks, `hidden mask at ${sample.distance} m, occluder=${sample.blocked}`).toBe(0);
  }
});
