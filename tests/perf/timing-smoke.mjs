import { chromium } from '@playwright/test';

const [base] = process.argv.slice(2);
if (!base) throw new Error('Usage: node tests/perf/timing-smoke.mjs <frozen-dev-server-url>');
const browser = await chromium.launch({ headless: true, channel: 'chrome',
  args: ['--use-gl=angle', '--use-angle=metal'] });
const cases = [];
try {
  for (const enabled of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const url = new URL(base);
    url.searchParams.set('timing', enabled ? '1' : '0');
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__capivara?.timings);
    await page.locator('[data-do="practice"]').click();
    await page.locator('#hud').waitFor({ state: 'visible', timeout: 60000 });
    if (enabled) {
      await page.waitForFunction(() => window.__capivara.timings().spans.some(span => span.name === 'shader-compile-world'),
        null, { timeout: 60000 });
    }
    const probe = await page.evaluate(() => {
      const before = window.__capivara.timings();
      window.__capivara.resetPerf();
      const after = window.__capivara.timings();
      return { before: { enabled: before.enabled, names: [...new Set(before.spans.map(span => span.name))],
        count: before.spans.length, droppedSpans: before.droppedSpans, longTaskSupported: before.longTaskSupported },
        after: { count: after.spans.length, droppedSpans: after.droppedSpans } };
    });
    if (probe.before.enabled !== enabled || (enabled && probe.before.count === 0) ||
      (!enabled && probe.before.count !== 0) || probe.after.count !== 0 || errors.length) {
      throw new Error(JSON.stringify({ enabled, probe, errors }));
    }
    cases.push({ enabled, probe, errors });
    await context.close();
  }
  console.log(JSON.stringify({ browser: browser.version(), cases }));
} finally {
  await browser.close();
}
