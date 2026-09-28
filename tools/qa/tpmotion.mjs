// Third-person motion strips of the reviewed capybara from a free camera.
// node tools/qa/tpmotion.mjs <outDir> <weapon> <actions csv> [times csv] [camera: side|front|back|three]
import { chromium } from '@playwright/test';
const [out, weapon, actions, timesCsv = '.1,.25,.4,.55,.7,.85,1.0,1.2', cam = 'three'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: +(process.env.W || 800), height: +(process.env.H || 600) } });
page.on('pageerror', e => console.error('pageerror', e.message));
await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?qa=1`);
await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 60000 });
await page.evaluate(() => window.__capyQA.start());
await page.addStyleTag({ content: '#app,#confetti,#flash{display:none!important}' });
// The reviewed capybara stands at (84, ground, -58) facing -x.
const views = { side: [84, 1.1, -53.2], front: [79.4, 1.2, -58], back: [88.6, 1.3, -58], three: [80.6, 1.6, -54.4] };
const [cx, cy, cz] = views[cam];
for (const action of actions.split(',')) for (const [i, t] of timesCsv.split(',').map(Number).entries()) {
  await page.evaluate(([x, y, z, fov]) => { window.__camOverride = [x, 3.95 + y, z, 84, 4.75, -58, fov]; }, [cx, cy, cz, +(process.env.FOV || 30)]);
  await page.evaluate(([w, a, s]) => window.__capyQA.tpMotion(w, a, s), [weapon, action, t]);
  await page.screenshot({ path: `${out}/${weapon}-${action}-${String(i).padStart(2, '0')}.png` });
}
await browser.close();
