// Captures VFX review frames and frame strips from tools/vfx/index.html.
// Usage: node tools/vfx/capture.mjs <scenario|all> [width] [height] [outDir]
// Needs the dev server: npx vite --host 127.0.0.1 --port 5185 --strictPort
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { SCENARIOS } from './scenarios.mjs';

const [name = 'all', width = '1280', height = '720', out = '/Users/lucas_gaspe/dev/capivara-team/reviews'] = process.argv.slice(2);
const size = `${width}x${height}`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) }, deviceScaleFactor: 1 });
page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') console.log(`[${message.type()}]`, message.text()); });
page.on('pageerror', error => console.log('[pageerror]', error.message));
await page.goto('http://127.0.0.1:5185/tools/vfx/index.html');
await page.waitForFunction(() => '__vfx' in window);
await page.evaluate(() => window.__vfx.init('medium'));

const vfx = (method, ...args) => page.evaluate(([m, a]) => window.__vfx[m](...a), [method, args]);
const run = async item => { if (!item.call) return vfx('event', item); const result = await vfx(item.call, ...item.args); if (process.env.VFX_DEBUG) console.log(item.call, JSON.stringify(result)); return result; };
const list = name === 'all' ? Object.keys(SCENARIOS) : name.split(',');
for (const key of list) {
  const scenario = SCENARIOS[key];
  if (!scenario) throw new Error(`Unknown scenario ${key}`);
  const stats = await vfx('scene', scenario.scene);
  if (scenario.warmup) for (const e of scenario.warmup) await run(e);
  if (scenario.warmup) await vfx('step', 90);
  const frames = [];
  const tmp = join(out, `.tmp-${key}`); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp);
  for (const e of scenario.events || []) await run(e);
  let frame = 0;
  for (const shot of scenario.frames) {
    if (shot.events) for (const e of shot.events) await run(e);
    if (shot.patch) for (const [id, patch] of Object.entries(shot.patch)) await vfx('actor', id, patch);
    await vfx('step', shot.at - frame); frame = shot.at;
    const file = join(tmp, `${String(frames.length).padStart(2, '0')}.png`);
    await page.screenshot({ path: file });
    frames.push(file);
  }
  if (scenario.still !== undefined) execFileSync('cp', [frames[scenario.still], join(out, `brasa-m1b-${key}-${size}.png`)]);
  // KEEP=1 also saves every full-resolution frame, named by its time in ms.
  if (process.env.KEEP) frames.forEach((f, i) => execFileSync('cp', [f, join(out, `brasa-m1b-${key}-${Math.round(scenario.frames[i].at * 1000 / 60)}ms-${size}.png`)]));
  if (frames.length > 1) {
    execFileSync('montage', [...frames.flatMap((f, i) => ['-label', `${Math.round(scenario.frames[i].at * 1000 / 60)} ms`, f]),
      '-tile', `${Math.min(4, frames.length)}x`, '-geometry', `${Math.round(Number(width) / 2)}x${Math.round(Number(height) / 2)}+4+4`,
      '-font', '/System/Library/Fonts/Supplemental/Arial.ttf', '-pointsize', '18', '-background', '#16120e', '-fill', '#f8f0d9', join(out, `brasa-m1b-${key}-strip-${size}.png`)]);
  }
  rmSync(tmp, { recursive: true, force: true });
  console.log(key, size, JSON.stringify(stats));
}
await browser.close();
