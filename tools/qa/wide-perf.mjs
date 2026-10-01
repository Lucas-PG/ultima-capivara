// Draw calls and triangles of the wide views and the elevated QA poses, at one preset.
// node tools/qa/wide-perf.mjs [quality] [outDir]   (BASE env overrides the URL; views from tools/qa/wide-views.json)
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const [quality = 'medium', out] = process.argv.slice(2);
const views = JSON.parse(readFileSync(new URL('./wide-views.json', import.meta.url), 'utf8'));
const poses = ['lighthouseBalcony', 'fortWallNorth', 'morroRoofs', 'lajeRoof', 'vilaStreet', 'district-morro', 'district-capela', 'district-engenho', 'district-palafitas'];
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('pageerror', e.message));
await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?qa=1`);
await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 60000 });
await page.evaluate(() => window.__capyQA.start());
await page.evaluate(q => window.__capyQA.quality(q), quality);
await page.addStyleTag({ content: '#app,#confetti,#flash{display:none!important}' });
const rows = [];
const measure = async (name, pose) => {
  // Two poses settle LOD, far batches and ground-cover culling before the counted frame.
  for (let i = 0; i < 2; i++) { await page.evaluate(p => window.__capyQA.pose(p), pose); await page.waitForTimeout(150); }
  const stats = await page.evaluate(p => window.__capyQA.pose(p), pose);
  rows.push([name, stats.drawCalls, stats.triangles]);
  if (out) await page.screenshot({ path: `${out}/${name}.png` });
};
for (const [name, view] of Object.entries(views)) {
  await page.evaluate(v => { window.__camOverride = v; }, view);
  await measure(name, 'plaza');
}
await page.evaluate(() => { window.__camOverride = undefined; });
for (const pose of poses) await measure(pose, pose);
for (const [name, draws, tris] of rows) console.log(name.padEnd(18), String(draws).padStart(4), (tris / 1e6).toFixed(2) + 'M');
await browser.close();
