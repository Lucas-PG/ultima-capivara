import { test, expect, chromium } from '@playwright/test';

// "Taxa da tela" draws once per display refresh: 120 on a ProMotion MacBook Pro, 144 or 240 on a
// gaming monitor. Everything the player sees must move the same at any of those rates.

test('first-person motion and the camera land on the same pose at 60, 120 and 144 fps', async ({ browser }) => {
  test.setTimeout(400_000);
  const cases: [string, string, number][] = [['m4', 'reload', 1.3], ['m4', 'fire', .45], ['shotgun', 'sprint', 1], ['machete', 'swing-right', .5], ['pistol', 'land', .6], ['sniper', 'ads', .7]];
  // One fresh page per rate runs the same sequence, so time-driven sway starts from the same clock.
  const runs: { camera: number[]; viewmodel: number[] }[][] = [];
  for (const hz of [60, 120, 144]) {
    const page = await browser.newPage();
    await page.goto('/?qa=1');
    await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 120_000 });
    await page.evaluate(() => window.__capyQA!.start());
    const states = [];
    for (const [weapon, action, seconds] of cases) states.push(await page.evaluate(async ([w, a, s, rate]) => {
      await window.__capyQA!.motion(w as never, a as never, s as number, rate as number);
      return window.__capyQA!.viewState();
    }, [weapon, action, seconds, hz] as const));
    runs.push(states);
    await page.close();
  }
  cases.forEach(([weapon, action], index) => {
    const reference = runs[0][index];
    for (const run of runs.slice(1)) {
      const state = run[index];
      expect(state.viewmodel.length, `${weapon} ${action}`).toBe(reference.viewmodel.length);
      // Millimetres and thousandths of a radian: the same pose, sampled at a different rate.
      expect(Math.max(...state.camera.map((value, i) => Math.abs(value - reference.camera[i]))), `${weapon} ${action} camera`).toBeLessThan(.01);
      expect(Math.max(...state.viewmodel.map((value, i) => Math.abs(value - reference.viewmodel[i]))), `${weapon} ${action} first-person model`).toBeLessThan(.02);
    }
  });
});

test('draws at the display rate when it is above 60, and holds the 60 and 30 caps', async ({ baseURL }) => {
  test.setTimeout(300_000);
  // Without vsync and the frame-rate limit, requestAnimationFrame runs as fast as the page can draw:
  // a stand-in for a fast high-refresh display on this 60 Hz laptop.
  const browser = await chromium.launch({ channel: process.platform === 'darwin' ? 'chrome' : undefined,
    args: ['--disable-gpu-vsync', '--disable-frame-rate-limit', ...(process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : [])] });
  try {
    const rates: Record<string, number> = {};
    for (const limit of [0, 60, 30]) {
      const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
      await context.addInitScript(cap => localStorage.setItem('uc-v2-settings', JSON.stringify({ graphics: 'low', renderScale: .5, graphicsChosen: true, frameLimit: cap, frameLimitChosen: true })), limit);
      const page = await context.newPage();
      await page.goto(`${baseURL}/?networkQa=1&calm`);
      await page.locator('[data-mode="deathmatch"]').click();
      await page.locator('[data-do="practice"]').click();
      await page.waitForFunction(() => { const i = window.__capivara?.inspect(); return i?.snapshot?.phase === 'playing' && !i.renderState.loading; }, null, { timeout: 180_000 });
      await page.evaluate(() => (window as unknown as { __networkQA: { activate(): void } }).__networkQA.activate());
      await page.waitForTimeout(3000);
      const [frames, at] = await page.evaluate(() => [window.__capivara!.inspect().renderedFrames, performance.now()]);
      await page.waitForTimeout(5000);
      const [after, end] = await page.evaluate(() => [window.__capivara!.inspect().renderedFrames, performance.now()]);
      rates[limit] = (after - frames) / ((end - at) / 1000);
      await context.close();
    }
    console.log(JSON.stringify(rates));
    expect(rates[0]).toBeGreaterThan(75);
    expect(rates[60]).toBeLessThan(63); expect(rates[60]).toBeGreaterThan(50);
    expect(rates[30]).toBeLessThan(32); expect(rates[30]).toBeGreaterThan(26);
  } finally { await browser.close(); }
});
