import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [phase, url, sourceHash] = process.argv.slice(2);
if (!['before', 'after'].includes(phase) || !url || !sourceHash) {
  throw new Error('Usage: node tests/visual/forja-m1-capture.mjs before|after <exact-checkout-url> <source-hash>');
}
const injection = await readFile(new URL('./forja-m1-inject.js', import.meta.url), 'utf8');
const output = process.env.FORJA_M1_OUTPUT || '/Users/lucas_gaspe/dev/capivara-team/reviews';
const selected = process.env.FORJA_M1_POSES?.split(',').filter(Boolean) || null;
const viewports = process.env.FORJA_M1_VIEWPORTS === '720'
  ? [{ width: 1280, height: 720 }] : [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }];
await mkdir(output, { recursive: true });
const flags = ['--use-gl=angle', '--use-angle=metal'];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: flags });
const report = { phase, url, sourceHash, capturedAt: new Date().toISOString(),
  browser: browser.version(), flags, preset: 'medium', deviceScaleFactor: 1, images: [], errors: [] };
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    await context.addInitScript(() => localStorage.setItem('uc-v2-settings', JSON.stringify({ graphics: 'medium', frameLimit: 60 })));
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push({ viewport, message: error.message }));
    page.on('response', response => {
      if (response.status() >= 400 && /fontsource|\.woff2?(?:\?|$)/.test(response.url())) {
        report.errors.push({ viewport, message: `Font HTTP ${response.status()}: ${response.url()}` });
      }
    });
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      const body = await response.text();
      if (!body.includes('let renderer') || !body.includes('function ensureRenderer')) {
        throw new Error('Frozen main entry changed; inspect route injection before capture');
      }
      await route.fulfill({ response, body: `${body}\n${injection}\n` });
    });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => document.fonts.ready);
    if (report.errors.length) throw new Error(`Font or page error before ${phase} poses: ${JSON.stringify(report.errors)}`);
    await page.waitForFunction(() => !!window.__m1Pose, { timeout: 30000 });
    await page.evaluate(() => window.__m1Pose.start());
    const available = await page.evaluate(() => window.__m1Pose.names());
    if (selected?.some(name => !available.includes(name))) throw new Error(`Unknown selected pose: ${selected}`);
    const names = selected || available;
    for (const name of names) {
      const pose = await page.evaluate(name => window.__m1Pose.pose(name), name);
      await page.waitForTimeout(100);
      const path = resolve(output, `forja-m1-${name}-${phase}-${viewport.height}.png`);
      await page.screenshot({ path, animations: 'disabled' });
      report.images.push({ path, viewport, ...pose });
    }
    await context.close();
  }
  if (report.errors.length) throw new Error(`${report.errors.length} browser errors during ${phase} capture`);
} finally {
  await browser.close();
  const path = resolve(output, `forja-m1-pose-${phase}.json`);
  await writeFile(path, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ path, count: report.images.length, errors: report.errors }));
}
