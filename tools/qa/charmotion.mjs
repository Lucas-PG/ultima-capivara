// Motion strips of the reviewed capybara in the real renderer (tools/blender/review.html).
// node tools/qa/charmotion.mjs <outDir> <weapon|none> <clip,clip> [frames=6] [step=.07] [angle=side] [distance=3.2]
// Each clip first settles for a second, then `frames` stills are taken `step` seconds apart.
// FOCUS (camera height, m) and FOV (degrees) frame a closer look, e.g. FOCUS=.5 FOV=42 for the legs.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const [out, weapon, clips, frames = '6', step = '.07', angle = 'side', distance = '3.2'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const base = process.env.BASE || 'http://127.0.0.1:5176';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 420), height: Number(process.env.H || 520) } });
page.on('pageerror', e => console.error('pageerror', e.message));
const frame = { ...(process.env.FOCUS ? { focus: Number(process.env.FOCUS) } : {}), ...(process.env.FOV ? { fov: Number(process.env.FOV) } : {}) };
const query = new URLSearchParams({ clean: '', color: '#E76F51', x: process.env.X || '84', z: process.env.Z || '-58' });
if (weapon !== 'none') query.set('weapon', weapon);
await page.goto(`${base}/tools/blender/review.html?${query}`);
await page.waitForFunction(() => window.capyReview?.ready, null, { timeout: 120000 });
for (const clip of clips.split(',')) {
  await page.evaluate(o => window.capyReview.shot(o), { clip: 'idle', time: .5, angle, distance: Number(distance), ...frame });
  await page.evaluate(o => window.capyReview.shot(o), { clip, time: Number(process.env.SETTLE ?? 1), angle, distance: Number(distance), ...frame });
  for (let i = 0; i < Number(frames); i++) {
    await page.evaluate(o => window.capyReview.shot(o), { clip, time: Number(step), angle, distance: Number(distance), ...frame });
    await page.screenshot({ path: `${out}/${clip}-${angle}-${String(i).padStart(2, '0')}.png`, timeout: 120000 });
  }
}
await browser.close();
