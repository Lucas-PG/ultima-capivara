// Bot behaviour frame strips from the live simulation (tools/vfx/review.ts live API).
// Usage: node tools/vfx/clips.mjs <clip|all> [width] [height]
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const OUT = '/Users/lucas_gaspe/dev/capivara-team/reviews';
const CLIPS = {
  // A bot about 11 m away engages: alert tell, strafing bursts, then a reload that sends it to cover.
  'bot-duel-vila': { seed: 3, human: { x: -41, z: 20, yaw: Math.PI, pitch: -.04 }, bot: { x: -38, z: 31 }, every: 12, frames: 36 },
  'bot-duel-porto': { seed: 5, human: { x: -74, z: -60, yaw: Math.PI / 2, pitch: -.04 }, bot: { x: -86, z: -62 }, every: 12, frames: 36 },
  'bot-duel-plaza': { seed: 8, human: { x: -30, z: 45, yaw: Math.PI, pitch: -.04 }, bot: { x: -27, z: 56 }, every: 12, frames: 36 },
};
const [name = 'all', width = '1280', height = '720'] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) }, deviceScaleFactor: 1 });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto('http://127.0.0.1:5185/tools/vfx/index.html');
await page.waitForFunction(() => '__vfx' in window);
await page.evaluate(() => window.__vfx.init('medium'));
for (const key of name === 'all' ? Object.keys(CLIPS) : name.split(',')) {
  const clip = CLIPS[key];
  await page.evaluate(c => window.__vfx.scene({ x: c.human.x, z: c.human.z, yaw: c.human.yaw, pitch: c.human.pitch, mode: 'deathmatch', weapon: 'm4' }), clip);
  await page.evaluate(c => window.__vfx.live(c), clip);
  const tmp = join(OUT, `.tmp-${key}`); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp);
  const files = [], labels = [];
  for (let i = 0; i < clip.frames; i++) {
    const state = await page.evaluate(n => window.__vfx.liveStep(n), clip.every);
    const file = join(tmp, `${String(i).padStart(2, '0')}.png`);
    await page.screenshot({ path: file }); files.push(file);
    labels.push(`${((i + 1) * clip.every / 60).toFixed(1)} s ${state.mode}${state.reloading ? ' reload' : ''}`);
    console.log(key, labels.at(-1), JSON.stringify(state.pos));
  }
  execFileSync('montage', [...files.flatMap((f, i) => ['-label', labels[i], f]), '-tile', '6x', '-geometry', `${Math.round(Number(width) / 3)}x${Math.round(Number(height) / 3)}+3+3`,
    '-font', '/System/Library/Fonts/Supplemental/Arial.ttf', '-pointsize', '14', '-background', '#16120e', '-fill', '#f8f0d9', join(OUT, `brasa-m1b-${key}-strip-${width}x${height}.png`)]);
  rmSync(tmp, { recursive: true, force: true });
}
await browser.close();
