// Medium-preset, 1280x720 review of gameplay and mechanical poses, with the same
// full-resolution clearance measurement as grip-probe. No e2e suite involved.
// BASE=http://127.0.0.1:5177 node tools/qa/weapon-review.mjs <out> <id>
//   [actions csv] [views csv] [normalized sample times csv]
// Optional TUNE=<JSON live spec override>, MEASURE=0 to capture only.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { measure } from './weapon-contact.mjs';
const [out, weapon, actionsCsv = 'hip,ads,sprint,inspect,reload,reload-partial,fire', viewsCsv = 'eye,left,right,below', timesCsv = '.12,.3,.5,.65,.78,.9'] = process.argv.slice(2);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const report = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.error(e.message));
  await page.goto(`${process.env.BASE || 'http://127.0.0.1:5177'}/?qa=1`);
  await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 60000 });
  await page.evaluate(async () => { await window.__capyQA.start(); window.__capyQA.quality('medium'); });
  // Keep the actual scope overlay, which is part of scoped ADS presentation.
  await page.addStyleTag({ content: '#hud>:not(#scope-overlay),#confetti,#flash{display:none!important}' });
  if (process.env.TUNE) await page.evaluate(([w, tune]) => { window.__vmTune = { [w]: tune }; }, [weapon, JSON.parse(process.env.TUNE)]);
  const reload = await page.evaluate(async w => (await import('/src/shared/weapons.ts')).WEAPONS[w].reload, weapon);
  const views = { eye: null, left: [-Math.PI / 2, .1, .8], right: [Math.PI / 2, .12, .8], below: [.4, -1, .75], top: [.2, 1.2, .8] };
  for (const action of actionsCsv.split(',')) {
    const times = ['hip', 'ads', 'sprint', 'inspect', 'world', 'tp'].includes(action) ? [action === 'inspect' ? .9 : .7] : timesCsv.split(',').map(Number);
    for (const phase of times) {
      const seconds = action.startsWith('reload') ? phase * reload : action === 'fire' ? phase * (weapon === 'sniper' ? 1.1 : .72) : phase;
      const pose = async () => {
        if (['hip', 'ads', 'world', 'tp'].includes(action)) await page.evaluate(p => window.__capyQA.pose(p), `${action === 'hip' ? 'fp' : action}-${weapon}`);
        else await page.evaluate(([w, a, t]) => window.__capyQA.motion(w, a, t), [weapon, action, seconds]);
      };
      await page.evaluate(() => { window.__vmOrbit = undefined; });
      await pose();
      const row = { weapon, action, phase, seconds };
      if (process.env.MEASURE !== '0' && !['world', 'tp'].includes(action)) {
        row.R = await page.evaluate(measure, [weapon, 'R']);
        row.L = await page.evaluate(measure, [weapon, 'L']);
        console.log(`${weapon} ${action} ${phase}: R ${row.R.worst} mm, L ${row.L.worst} mm`);
      }
      for (const view of process.env.CAPTURE === '0' ? [] : viewsCsv.split(',')) {
        if (['ads', 'world', 'tp'].includes(action) && view !== 'eye') continue;
        await page.evaluate(v => { window.__vmOrbit = v ? { yaw: v[0], pitch: v[1], distance: v[2], target: [.03, -.09, -.43] } : undefined; }, views[view]);
        await pose();
        await page.screenshot({ path: `${out}/${weapon}-${action}-${String(phase).replace('.', '_')}-${view}.png` });
      }
      report.push(row);
      await writeFile(`${out}/${weapon}-contact.json`, JSON.stringify(report, null, 2) + '\n');
    }
  }
} finally { await browser.close(); }
