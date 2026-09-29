// Frame time of the benchmark views with the frame limiter and vsync off, so GPU cost shows up as ms per frame.
// node tools/qa/veg-fps.mjs [viewName ...]   env: BASE, QUALITY, SECONDS (default 3), VIEWS
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const names = process.argv.slice(2);
const all = JSON.parse(readFileSync(process.env.VIEWS || 'tools/qa/veg-views.json', 'utf8'));
const views = names.length ? Object.fromEntries(names.map(n => [n, all[n]])) : all;
const seconds = Number(process.env.SECONDS || 3);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal', '--disable-frame-rate-limit', '--disable-gpu-vsync'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('pageerror', e.message));
await page.goto(`${process.env.BASE || 'http://127.0.0.1:5176'}/?qa=1${process.env.QUERY || ''}`);
await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 90000 });
await page.evaluate(() => window.__capyQA.start());
await page.evaluate(q => window.__capyQA.quality(q), process.env.QUALITY || 'medium');
await page.addStyleTag({ content: '#app,#confetti,#flash{display:none!important}' });
const rows = [];
for (const [name, view] of Object.entries(views)) {
  await page.evaluate(v => { window.__camOverride = v; }, view);
  const r = await page.evaluate(() => window.__capyQA.pose('plaza'));
  await page.evaluate(() => window.__capyQA.loop(true));
  await page.waitForTimeout(800);                       // settle streaming and LOD picks
  const a = await page.evaluate(() => window.__capyQA.stats().renderedFrames);
  await page.waitForTimeout(seconds * 1000);
  const b = await page.evaluate(() => window.__capyQA.stats().renderedFrames);
  await page.evaluate(() => window.__capyQA.loop(false));
  rows.push(`${name.padEnd(10)} ${((b - a) / seconds).toFixed(0).padStart(4)} fps  ${(seconds * 1000 / (b - a)).toFixed(2).padStart(6)} ms   draws ${String(r.drawCalls).padStart(4)}  tris ${String(r.triangles).padStart(8)}`);
}
console.log(rows.join('\n'));
await browser.close();
