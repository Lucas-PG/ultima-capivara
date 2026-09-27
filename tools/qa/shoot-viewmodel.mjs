// node tools/qa/shoot-viewmodel.mjs out.png [query]
import { chromium } from '@playwright/test';
const [out, query = ''] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 2560, height: 720 } });
page.on('pageerror', e => console.error('pageerror', e.message));
page.on('console', m => { if (m.type() === 'error') console.error('console', m.text()); });
await page.goto(`http://127.0.0.1:5173/tools/qa/viewmodel.html?${query}`);
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
await page.locator('canvas').screenshot({ path: out });
await browser.close();
