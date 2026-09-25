import { test, expect } from '@playwright/test';

type MaskCase = { kind?: string; samples: number; rot?: number; distance?: number; gap?: number | null; silhouette?: number; inside: number; holes: number; leaks: number };

test('character mask fills visible skins and slopes without leaking through nearby cover or beyond 150 m', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/visual/character-mask.html');
  await page.waitForFunction(() => Array.isArray((window as Window & { result?: MaskCase[] }).result));
  const cases = await page.evaluate(() => (window as Window & { result?: MaskCase[] }).result!);
  await testInfo.attach('mask-fill.json', { body: JSON.stringify(cases, null, 2), contentType: 'application/json' });
  expect(errors).toEqual([]);
  expect(cases).toHaveLength(92);
  for (const sample of cases) {
    const label = JSON.stringify(sample);
    if (sample.kind === 'skinned-face' || (sample.gap === null && sample.distance! < 150)) {
      expect(sample.inside, `reference pixels: ${label}`).toBeGreaterThan(0);
      // The skinned mesh has MSAA coverage differences at overlapping part boundaries.
      // Require 99.5% over the whole skin, and 99.9% on each continuous plane.
      expect(1 - sample.holes / sample.inside, `visible fill: ${label}`).toBeGreaterThan(sample.kind === 'skinned-face' ? .995 : .999);
    } else expect(sample.leaks, `hidden mask: ${label}`).toBe(0);
  }
});
