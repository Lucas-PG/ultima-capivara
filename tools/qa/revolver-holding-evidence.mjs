// Selected changed-state captures. Raw images stay outside the repository; only comparison boards ship.
// BASE=http://127.0.0.1:5193 node tools/qa/revolver-holding-evidence.mjs <private output directory>
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { poseHoldingState } from './fp-state.mjs';

const [out] = process.argv.slice(2);
if (!out) throw new Error('Give a private output directory.');
const states = [
  ['cylinder-closed', 'reload', .276], ['cylinder-open', 'reload', .391],
  ['cylinder-transfer', 'reload', .312960494], ['ejector', 'reload', .736], ['loader', 'reload', 1.5525],
  ['cylinder-close', 'reload', 2.024], ['support-return', 'reload', 2.18],
  ['inspect', 'inspect', 1.2], ['draw', 'draw', .2], ['holster', 'holster', .06],
];
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
const captures = [];
try {
  const page = await browser.newPage({ viewport: { width: 1470, height: 956 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => localStorage.setItem('uc-onboarded', '1'));
  await page.goto(`${process.env.BASE || 'http://127.0.0.1:5193'}/?qa=1`);
  await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 90000 });
  await page.evaluate(async () => { await window.__capyQA.start(); window.__capyQA.quality('medium'); });
  const gpu = await page.evaluate(() => {
    const gl = document.querySelector('canvas')?.getContext('webgl2');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl && debug ? { vendor: gl.getParameter(debug.UNMASKED_VENDOR_WEBGL), renderer: gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) } : null;
  });
  await writeFile(`${out}/metadata.json`, JSON.stringify({ capturedAt: new Date().toISOString(),
    source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    sourceHash: createHash('sha256').update(await readFile('src/render/viewmodel-anims.ts')).digest('hex'),
    browser: browser.version(), viewport: [1470, 956], deviceScaleFactor: 1, gpu }, null, 2) + '\n');
  await page.addStyleTag({ content: '#confetti,#flash{display:none!important}' });
  for (const [id, action, t] of states.filter(([id]) => !process.env.ONLY || process.env.ONLY.split(',').includes(id))) {
    for (const [side, yaw] of [['eye', null], ['left', -Math.PI / 2], ['right', Math.PI / 2]]) {
      await poseHoldingState(page, 'revolver', action, t);
      if (yaw !== null) {
        await page.evaluate(yaw => {
          const vm = window.__vmProbe, p = vm.holder.position;
          window.__vmOrbit = { yaw, pitch: .12, distance: .65, target: [p.x - .025, p.y - .015, p.z - .02] };
        }, yaw);
        await page.evaluate(([action, t]) => window.__capyQA.motion('revolver',
          action === 'holster' ? 'equip' : action === 'draw' ? 'sprint' : action, t), [action, t]);
      }
      await page.waitForTimeout(80);
      const path = `${out}/${id}-${side}.png`;
      await page.screenshot({ path });
      captures.push({ id, action, t, side, path });
    }
    console.log(id);
  }
} finally {
  await browser.close();
  await writeFile(`${out}/index.json`, JSON.stringify(captures, null, 2) + '\n');
}
