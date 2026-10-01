// First-person lab: each weapon from the player's eye and from outside the rig.
// node tools/qa/vmlab.mjs <outDir> <weapon> [ads]   (needs the VITE_QA=1 dev server)
import { chromium } from '@playwright/test';
const [out, weapon = 'pistol', mode = 'fp'] = process.argv.slice(2);
const base = process.env.BASE || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('pageerror', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('console', m.text()); });
await page.goto(`${base}/?qa=1`);
await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 60000 });
await page.evaluate(() => window.__capyQA.start());
await page.addStyleTag({ content: '#app,#confetti,#flash{display:none!important}' });
await page.evaluate(p => window.__capyQA.pose(p), `${mode === 'ads' ? 'ads' : 'fp'}-${weapon}`);
await page.waitForTimeout(150);
await page.screenshot({ path: `${out}/${weapon}-${mode}-eye.png` });
const views = { side: [Math.PI / 2, .1, .75], left: [-Math.PI / 2, .1, .75], below: [.5, -.9, .7], front: [Math.PI - .35, .15, .9], top: [.2, 1.2, .8] };
for (const [name, [yaw, pitch, distance]] of Object.entries(views)) {
  await page.evaluate(([yaw, pitch, distance]) => { window.__vmOrbit = { yaw, pitch, distance, target: [.1, -.15, -.35] }; }, [yaw, pitch, distance]);
  await page.evaluate(p => window.__capyQA.pose(p), `${mode === "ads" ? "ads" : "fp"}-${weapon}`);
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${out}/${weapon}-${mode}-${name}.png` });
}
await browser.close();
