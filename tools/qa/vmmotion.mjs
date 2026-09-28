// Motion strips for the viewmodel: each action sampled over time, HUD hidden.
// node tools/qa/vmmotion.mjs <outDir> <weapon> <action[,action]> [times csv]
// actions: reload, sprint, ads, equip, land, swing-right, hit-left ...
import { chromium } from '@playwright/test';
const [out, weapon, actions, timesCsv] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', e => console.error('pageerror', e.message));
await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?qa=1`);
await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 60000 });
await page.evaluate(() => window.__capyQA.start());
await page.addStyleTag({ content: '#app,#confetti,#flash{display:none!important}' });
for (const action of actions.split(',')) {
  const times = (timesCsv || '0,.1,.2,.3,.45,.6,.75,.9,1.05,1.2,1.4,1.6,1.8,2.0,2.3,2.6').split(',').map(Number);
  for (const [i, t] of times.entries()) {
    await page.evaluate(([w, a, s]) => window.__capyQA.motion(w, a, s), [weapon, action, t]);
    await page.screenshot({ path: `${out}/${weapon}-${action}-${String(i).padStart(2, '0')}.png` });
  }
}
await browser.close();
