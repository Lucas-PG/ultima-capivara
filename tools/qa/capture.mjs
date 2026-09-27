// Captures named QA poses from a running VITE_QA=1 server into a folder.
// Usage: node tools/qa/capture.mjs <outDir> pose1 pose2 ...  (BASE env overrides the URL)
import { chromium } from '@playwright/test';
const [out, ...poses] = process.argv.slice(2);
const base = process.env.BASE || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('pageerror', e.message));
await page.goto(`${base}/?qa=1${process.env.QUERY || ""}`);
await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 60000 });
await page.evaluate(() => window.__capyQA.start());
await page.addStyleTag({ content: '#confetti,#flash{display:none!important}' });
const list = poses.length ? poses : await page.evaluate(() => window.__capyQA.names());
for (const name of list) {
  try {
    const r = await page.evaluate(p => window.__capyQA.pose(p), name);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${out}/${name}.png` });
    console.log(name, r.drawCalls, r.triangles);
  } catch (e) { console.error(name, e.message.split('\n')[0]); }
}
await browser.close();
