// Captures a weapon under several live spec overrides in one session.
// node tools/qa/vmtune.mjs <outDir> <weapon> '<json: {name: override}>' [views: eye,side,...] [ads]
import { chromium } from '@playwright/test';
const [out, weapon, variantsJson, viewList = 'eye,side,below', mode = 'fp'] = process.argv.slice(2);
const variants = JSON.parse(variantsJson);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('pageerror', e.message));
await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?qa=1`);
await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 60000 });
await page.evaluate(async () => { await window.__capyQA.start(); window.__capyQA.quality('medium'); });
await page.addStyleTag({ content: '#app,#confetti,#flash{display:none!important}' });
const target = JSON.parse(process.env.TARGET || '[0.1,-0.15,-0.4]'), D = +(process.env.DIST || 1);
const views = { eye: null, side: [Math.PI / 2, .1, .75], left: [-Math.PI / 2, .1, .75], below: [.5, -.9, .7], front: [Math.PI - .35, .15, .9], top: [.2, 1.2, .8], rear: [.35, .35, .5] };
for (const [name, override] of Object.entries(variants)) {
  await page.evaluate(([w, o]) => { window.__vmTune = { [w]: o }; }, [weapon, override]);
  for (const view of viewList.split(',')) {
    await page.evaluate(([v, target, D]) => { window.__vmOrbit = v ? { yaw: v[0], pitch: v[1], distance: v[2] * D, target } : undefined; }, [views[view], target, D]);
    await page.evaluate(p => window.__capyQA.pose(p), `${mode}-${weapon}`);
    await page.waitForTimeout(80);
    await page.screenshot({ path: `${out}/${weapon}-${name}-${view}.png` });
  }
}
await browser.close();
