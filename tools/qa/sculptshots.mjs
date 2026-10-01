// Stills of the SDF sculpt preview (tools/blender/sculpt-preview.html), one browser.
// node tools/qa/sculptshots.mjs <outDir> <ply url> view[:clay] [view...]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const [out, ply, ...views] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const base = process.env.BASE || 'http://127.0.0.1:5176';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 640), height: Number(process.env.H || 720) } });
page.on('pageerror', e => console.error('pageerror', e.message));
for (const spec of views) {
  const [view, flag] = spec.split(':');
  await page.goto(`${base}/tools/blender/sculpt-preview.html?ply=${encodeURIComponent(ply)}&view=${view}${flag === 'clay' ? '&clay' : ''}`);
  await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
  await page.screenshot({ path: `${out}/${view}${flag ? '-' + flag : ''}.png` });
}
await browser.close();
