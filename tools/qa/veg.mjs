// Vegetation review stills with draw-call and triangle counts.
// node tools/qa/veg.mjs <outDir> [viewName ...]
//   views come from tools/qa/veg-views.json ({name: [x,y,z,tx,ty,tz,fov]}); with no names all are shot.
//   env: BASE (default http://127.0.0.1:5176), QUALITY (low|medium|high), QUERY (extra query string),
//        VIEWS (path to another views json), NOSHOT=1 (stats only)
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const [out, ...names] = process.argv.slice(2);
const all = JSON.parse(readFileSync(process.env.VIEWS || 'tools/qa/veg-views.json', 'utf8'));
const views = names.length ? Object.fromEntries(names.map(n => [n, all[n]])) : all;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('pageerror', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('console.error', m.text().slice(0, 300)); });
await page.goto(`${process.env.BASE || 'http://127.0.0.1:5176'}/?qa=1${process.env.QUERY || ''}`);
await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 90000 });
await page.evaluate(() => window.__capyQA.start());
await page.evaluate(q => window.__capyQA.quality(q), process.env.QUALITY || 'medium');
await page.addStyleTag({ content: '#app,#confetti,#flash{display:none!important}' });
const rows = [];
for (const [name, view] of Object.entries(views)) {
  if (!view) { console.error('unknown view', name); continue; }
  await page.evaluate(v => { window.__camOverride = v; }, view);
  await page.evaluate(() => window.__capyQA.pose('plaza'));
  await page.waitForTimeout(250);
  const r = await page.evaluate(() => window.__capyQA.pose('plaza'));
  await page.waitForTimeout(100);
  if (!process.env.NOSHOT) await page.screenshot({ path: `${out}/${name}.png` });
  rows.push(`${name.padEnd(10)} draws ${String(r.drawCalls).padStart(4)}  tris ${String(r.triangles).padStart(8)}`);
}
console.log(rows.join('\n'));
await browser.close();
