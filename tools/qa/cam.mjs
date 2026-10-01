// Free-camera stills of the world (HUD hidden).
// node tools/qa/cam.mjs <outDir> '<json {name: [x,y,z,tx,ty,tz,fov?]}>' [quality]
import { chromium } from '@playwright/test';
const [out, json, quality = 'medium'] = process.argv.slice(2);
const views = JSON.parse(json);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('pageerror', e.message));
await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?qa=1${process.env.QUERY || ''}`);
await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 60000 });
await page.evaluate(() => window.__capyQA.start());
await page.evaluate(q => window.__capyQA.quality(q), quality);
await page.addStyleTag({ content: '#app,#confetti,#flash{display:none!important}' });
for (const [name, view] of Object.entries(views)) {
  await page.evaluate(v => { window.__camOverride = v; }, view);
  await page.evaluate(() => window.__capyQA.pose('plaza'));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__capyQA.pose('plaza'));
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${out}/${name}.png` });
}
await browser.close();
