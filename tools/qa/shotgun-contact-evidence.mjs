// Selected changed-state evidence. Raw frames remain outside the repository.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { poseHoldingState } from './fp-state.mjs';
const out = process.argv[2];
if (!out) throw new Error('Provide the private capture directory');
await mkdir(out, { recursive: true });
const states = process.argv[3] ? JSON.parse(await readFile(process.argv[3], 'utf8')) : [
  ['pistol', 'draw', .25], ['pistol', 'reload', .3], ['pistol', 'reload', 1.15],
  ['shotgun', 'draw', .25], ['shotgun', 'holster', .025], ['shotgun', 'inspect', 1.7],
  ['shotgun', 'fire', .2], ['shotgun', 'reload', .25], ['shotgun', 'reload', .385],
];
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=gl-egl'] });
const captures = [];
try {
  const page = await browser.newPage({ viewport: { width: 1470, height: 956 } });
  await page.addInitScript(() => localStorage.setItem('uc-onboarded', '1'));
  await page.goto(`${process.env.BASE || 'http://127.0.0.1:5194'}/?qa=1`);
  await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 90000 });
  await page.evaluate(async () => { await window.__capyQA.start(); window.__capyQA.quality('medium'); });
  for (const [weapon, action, t] of states) for (const [angle, yaw] of [['eye', null], ['left', -Math.PI / 2], ['right', Math.PI / 2]]) {
    await page.evaluate(() => { window.__vmOrbit = undefined; window.__vmActor = undefined; });
    await poseHoldingState(page, weapon, action, t);
    if (yaw !== null) {
      await page.evaluate(yaw => {
        const p = window.__vmProbe.holder.position;
        window.__vmOrbit = { yaw, pitch: .15, distance: .7, target: [p.x - .02, p.y - .04, p.z + .1] };
      }, yaw);
      await page.evaluate(([w, a, seconds]) => window.__capyQA.motion(w, a === 'holster' ? 'equip' : a === 'draw' ? 'sprint' : a, seconds), [weapon, action, t]);
    }
    await page.waitForTimeout(60);
    const file = `${weapon}-${action}-${t}-${angle}.png`;
    await page.screenshot({ path: `${out}/${file}` });
    captures.push({ weapon, action, t, angle, file });
  }
} finally { await browser.close(); }
await writeFile(`${out}/index.json`, JSON.stringify(captures, null, 2) + '\n');
console.log(`Captured ${captures.length} frames`);
