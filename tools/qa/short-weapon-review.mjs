// 1280x720 medium-preset contact and motion review, using real Chrome/ANGLE Metal.
// BASE=http://127.0.0.1:5178 node tools/qa/short-weapon-review.mjs <out> <weapon> <actions csv> [normalised times csv] [views csv]
// Actions: hip, ads, sprint, inspect, reload, reload-partial, swing-right, swing-left, hit-right.
// Views: eye, right, left, top. MEASURE=0 skips the expensive per-vertex clearance pass.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { measureGrip } from './grip-measure.mjs';
const [out, weapon, actions = 'hip,ads', timeCsv = '0,.15,.3,.45,.6,.7,.82,.94,1', viewCsv = 'eye'] = process.argv.slice(2);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => { throw e; });
const results = [];
try {
  await page.goto(`${process.env.BASE || 'http://127.0.0.1:5178'}/?qa=1`);
  await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 90000 });
  await page.evaluate(() => window.__capyQA.start());
  await page.evaluate(() => window.__capyQA.quality('medium'));
  await page.addStyleTag({ content: '#app,#confetti,#flash{display:none!important}' });
  const durations = await page.evaluate(async () => {
    const { WEAPONS } = await import('/src/shared/weapons.ts');
    return Object.fromEntries(Object.entries(WEAPONS).map(([id, def]) => [id, def.reload]));
  });
  for (const action of actions.split(',')) {
    const times = ['hip', 'ads'].includes(action) ? [0] : timeCsv.split(',').map(Number);
    for (const t of times) {
      await page.evaluate(() => { window.__vmOrbit = undefined; });
      if (['hip', 'ads'].includes(action)) await page.evaluate(([w, a]) => window.__capyQA.pose(`${a === 'ads' ? 'ads' : 'fp'}-${w}`), [weapon, action]);
      else await page.evaluate(([w, a, s]) => window.__capyQA.motion(w, a, s), [weapon, action, t * (action.startsWith('reload') ? durations[weapon] : action === 'inspect' ? 1.8 : action.includes('right') || action.includes('left') || action === 'chop' ? .46 : 1)]);
      const frame = { action, t, paws: {} };
      if (process.env.MEASURE !== '0') for (const side of ['R', 'L']) {
        const result = await page.evaluate(measureGrip, [weapon, side]);
        frame.paws[side] = { worst: result.worst, digits: result.digits, summary: result.summary };
        console.log(`${weapon} ${action} ${t} ${side}: ${result.worst} mm`);
      }
      results.push(frame);
      for (const view of viewCsv.split(',')) {
        if (view !== 'eye') await page.evaluate(v => {
          const vm = window.__vmProbe, V = vm.holder.position.constructor;
          const target = vm.holder.localToWorld(new V(0, -.02, -.04));
          window.__vmOrbit = { target: target.toArray(), yaw: v === 'right' ? Math.PI / 2 : v === 'left' ? -Math.PI / 2 : .15, pitch: v === 'top' ? 1.3 : .18, distance: .53 };
          window.__capyQA.quality('medium');
        }, view);
        if (view === 'eye' && viewCsv.split(',')[0] !== 'eye') throw new Error('Eye view must be first');
        await page.screenshot({ path: `${out}/${weapon}-${action}-${String(Math.round(t * 100)).padStart(3, '0')}-${view}.png` });
      }
      await writeFile(`${out}/${weapon}-clearance.json`, JSON.stringify(results, null, 2) + '\n');
    }
  }
} finally { await browser.close(); }
