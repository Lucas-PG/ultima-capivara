// Signed skin clearance and active carrying contacts for every first-person holding state.
// node tools/qa/fp-clearance.mjs <out.json> [weapons csv] [step s]
// BASE overrides URL; ACTIONS filters actions; ENFORCE=1 fails on a collision or detached carrying paw.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { measureGrip } from './grip-measure.mjs';
import { poseHoldingState } from './fp-state.mjs';
import { HOLDING_WEAPONS, holdingStates } from './holding-states.mjs';
import { holdingMetrics, holdingSummary } from './holding-metrics.mjs';
const [out, list = HOLDING_WEAPONS.join(','), stepArg = '.05'] = process.argv.slice(2);
if (!out) throw new Error('Give an output JSON path.');
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
const report = {};
let failed = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1470, height: 956 } });
  page.on('pageerror', e => console.error('pageerror', e.message));
  await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?qa=1`);
  await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 90000 });
  await page.evaluate(async () => { await window.__capyQA.start(); window.__capyQA.quality('medium'); });
  for (const weapon of list.split(',')) {
    const rows = [];
    for (const state of holdingStates(weapon, +stepArg).filter(s => !process.env.ACTIONS || process.env.ACTIONS.split(',').includes(s.action))) {
      const { action, t } = state;
      await poseHoldingState(page, weapon, action, t);
      const pose = await page.evaluate(() => ({ active: window.__vmProbe.active, contacts: window.__vmProbe.holdingContacts,
        wrists: window.__vmWrists?.(), visible: Object.fromEntries(['R', 'L'].map(s => [s, window.__vmProbe.arms.meshes.find(m => m.name.endsWith(s)).visible])) }));
      const row = await holdingMetrics(weapon, state, pose, args => page.evaluate(measureGrip, args));
      failed += row.failures?.length > 0 ? 1 : 0;
      rows.push(row);
    }
    const bad = rows.filter(r => r.failures?.length);
    report[weapon] = holdingSummary(rows);
    console.log(weapon, 'R', report[weapon].R.v, report[weapon].R.at, '| L', report[weapon].L.v, report[weapon].L.at, `| ${bad.length}/${rows.length} fail`);
    for (const r of bad.slice(0, 16)) console.log(' ', r.action, r.t, r.failures.join('; '));
    await writeFile(out, JSON.stringify(report, null, 1) + '\n');
  }
} finally { await browser.close(); await writeFile(out, JSON.stringify(report, null, 1) + '\n'); }
if (failed && process.env.ENFORCE) process.exitCode = 1;
