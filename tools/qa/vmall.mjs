// Every weapon's first-person view (hip, ADS) plus an outside view of the grip.
// node tools/qa/vmall.mjs <outDir> [weapons csv] [views csv: hip,ads,side,left]
import { chromium } from '@playwright/test';
const [out, list = 'pistol,revolver,smg,m4,shotgun,coco,dmr,sniper,machete', viewsCsv = 'hip,ads,side'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.error('pageerror', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('console', m.text()); });
await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?qa=1`);
await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 60000 });
await page.evaluate(() => window.__capyQA.start());
await page.addStyleTag({ content: '#app,#confetti,#flash{display:none!important}' });
const orbit = { side: [Math.PI / 2, .15, .7], left: [-Math.PI / 2, .15, .7], below: [.4, -.8, .7], top: [0, 1.3, .7] };
for (const weapon of list.split(',')) {
  for (const view of viewsCsv.split(',')) {
    await page.evaluate(v => { window.__vmOrbit = v ? { yaw: v[0], pitch: v[1], distance: v[2], target: [.08, -.12, -.35] } : undefined; }, orbit[view] ?? null);
    await page.evaluate(p => window.__capyQA.pose(p), `${view === 'ads' ? 'ads' : 'fp'}-${weapon}`);
    await page.waitForTimeout(60);
    await page.screenshot({ path: `${out}/${weapon}-${view}.png` });
  }
}
await browser.close();
