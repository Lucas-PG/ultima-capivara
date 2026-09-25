// Frame-time probe for the effects module: same scene, firefight on and off.
// Usage: node tools/vfx/perf.mjs [width] [height] [preset]
import { chromium } from '@playwright/test';
const [width = '1280', height = '720', preset = 'medium'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto('http://127.0.0.1:5185/tools/vfx/index.html');
await page.waitForFunction(() => '__vfx' in window);
await page.evaluate(p => window.__vfx.init(p), preset);
const bots = Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, x: -41 + Math.cos(i / 8 * Math.PI * 2) * 11, z: 26 + Math.sin(i / 8 * Math.PI * 2) * 7, yaw: i, weapon: 'm4' }));
await page.evaluate(b => window.__vfx.scene({ x: -41, z: 14, yaw: Math.PI, pitch: -.05, weapon: 'm4', actors: b }), bots);
const run = on => page.evaluate(f => window.__vfx.perf(600, f), on);
await run(false);
const results = { preset, size: `${width}x${height}`, baseline: await run(false), firefight: await run(true), baselineAgain: await run(false) };
console.log(JSON.stringify(results, null, 1));
await browser.close();
