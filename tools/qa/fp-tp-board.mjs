// First-person versus third-person board: per weapon, the first-person hip view and a close
// orbit of the firing paw (top row) next to the world character holding the same weapon, seen
// over its right shoulder and close at the firing paw (bottom row), in the same daylight.
// node tools/qa/fp-tp-board.mjs <out.jpg> [weapons csv]   (BASE env overrides the URL)
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
const [out, list = 'm4,pistol,shotgun,machete'] = process.argv.slice(2);
const dir = `${dirname(out)}/fp-tp-frames`; mkdirSync(dir, { recursive: true });
const FONT = process.env.FONT || '/System/Library/Fonts/Supplemental/Arial.ttf';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
const tiles = [];
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', e => console.error('pageerror', e.message));
  await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?qa=1`);
  await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 90000 });
  await page.evaluate(async () => { await window.__capyQA.start(); window.__capyQA.quality('medium'); });
  await page.addStyleTag({ content: '#app,#confetti,#flash{display:none!important}' });
  const top = [], bottom = [];
  for (const weapon of list.split(',')) {
    const shot = async (name, row) => { const file = `${dir}/${weapon}-${name}.png`; await page.screenshot({ path: file }); row.push([file, `${weapon} ${name}`]); };
    await page.evaluate(() => { window.__camOverride = undefined; window.__vmOrbit = undefined; });
    await page.evaluate(w => window.__capyQA.pose(`fp-${w}`), weapon); await shot('first person', top);
    // Close on the firing paw from the gun's right, behind and above, at the third-person close-up's
    // lens (40 degrees) and 1 / 1.3 of its distance: equal size on screen means equal proportion.
    await page.evaluate(w => { window.__vmTune = { [w]: { fov: 40 } }; }, weapon);
    await page.evaluate(() => {
      const vm = window.__vmProbe, V = vm.holder.position.constructor;
      const t = vm.holder.getWorldPosition(new V());
      const d = new V(1, .3, .3).normalize().applyQuaternion(vm.holder.quaternion);
      window.__vmOrbit = { yaw: Math.atan2(d.x, d.z), pitch: Math.asin(d.y), distance: .56 / 1.3, target: t.toArray() };
    });
    await page.evaluate(w => window.__capyQA.pose(`fp-${w}`), weapon); await shot('first person paw', top);
    await page.evaluate(() => { window.__vmOrbit = undefined; window.__vmTune = undefined; });
    // The world character (tools/qa/tpmotion.mjs stands it at 84, ground, -58 facing -x): over its
    // right shoulder, then close at the firing paw from its right; a treadmill walk keeps the gun up.
    await page.evaluate(() => { window.__camOverride = [84.25, 3.95 + 1.62, -58.48, 83.70, 3.95 + 1.24, -58.10, 50]; });
    await page.evaluate(w => window.__capyQA.tpMotion(w, 'walk', .6), weapon); await shot('third person', bottom);
    await page.evaluate(() => { window.__camOverride = [83.86, 3.95 + 1.42, -58.62, 83.70, 3.95 + 1.26, -58.11, 40]; });
    await page.evaluate(w => window.__capyQA.tpMotion(w, 'walk', .6), weapon); await shot('third person paw', bottom);
  }
  const all = [...top, ...bottom];
  execFileSync('magick', ['montage', ...all.map(t => t[0]), '-tile', `${top.length}x`, '-geometry', '480x270+2+2', '-background', '#222', '-font', FONT, `${dir}/grid.png`]);
  const draws = all.flatMap(([, name], i) => ['-annotate', `+${(i % top.length) * 484 + 10}+${Math.floor(i / top.length) * 274 + 22}`, name]);
  execFileSync('magick', [`${dir}/grid.png`, '-font', FONT, '-fill', 'white', '-undercolor', '#000a', '-pointsize', '18', ...draws, '-quality', '82', out]);
  tiles.push(out);
} finally { await browser.close(); }
console.log('board', tiles[0]);
