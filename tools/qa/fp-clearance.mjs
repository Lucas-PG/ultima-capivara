// Signed skin clearance and active carrying contacts for every first-person holding state.
// node tools/qa/fp-clearance.mjs <out.json> [weapons csv] [step s]
// BASE overrides URL; ACTIONS filters actions; ENFORCE=1 fails on a collision or detached carrying paw.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { measureGrip } from './grip-measure.mjs';
import { poseHoldingState } from './fp-state.mjs';
import { HOLDING_WEAPONS, holdingStates } from './holding-states.mjs';
import { triggerInGuard, TRIGGER_FACE } from './trigger-guard.mjs';
const [out, list = HOLDING_WEAPONS.join(','), stepArg = '.05'] = process.argv.slice(2);
if (!out) throw new Error('Give an output JSON path.');
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
const report = {};
let failed = 0;
const carryingBones = ['hand', 'middle1', 'middle2', 'middle3', 'ring1', 'ring2', 'ring3', 'thumb1', 'thumb2', 'thumb3'];
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
      const row = { ...state, contacts: {}, wrists: pose.wrists };
      // The beginning of a draw and the end of a holster intentionally show the other weapon.
      if (pose.active !== weapon) { row.inactive = pose.active; rows.push(row); continue; }
      for (const side of ['R', 'L']) {
        if (!pose.visible[side]) continue;
        const m = await page.evaluate(measureGrip, [weapon, side]);
        row[side] = m.worst; row[`${side}at`] = Object.entries(m.summary).sort((a, b) => a[1].min - b[1].min)[0]?.[0];
        row[`${side}skin`] = m.summary;
        const surface = pose.contacts?.[side];
        if (surface) {
          const cm = await page.evaluate(measureGrip, [weapon, side, surface === 'paw', { surface: surface === 'paw' ? undefined : surface,
            bones: side === 'R' && surface === 'body' ? carryingBones : undefined }]);
          row.contacts[side] = { surface, gap: cm.worst, skin: cm.summary };
          if (surface === 'body' || surface === 'pump' || surface === 'paw') {
            for (const region of ['palm', 'wrap']) {
              const m = await page.evaluate(measureGrip, [weapon, side, surface === 'paw', { surface: surface === 'paw' ? undefined : surface, region,
                bones: side === 'R' && surface === 'body' ? carryingBones : undefined }]);
              row.contacts[side][region] = m.worst;
            }
          }
        }
      }
      if (weapon === 'pistol' || weapon === 'revolver') row.pair = (await page.evaluate(measureGrip, [weapon, 'L', true])).worst;
      if (pose.contacts?.trigger) {
        const trigger = await page.evaluate(measureGrip, [weapon, 'R', false, TRIGGER_FACE]);
        row.trigger = { gap: trigger.worst, insideGuard: triggerInGuard(weapon, trigger.digits.index?.tip), digits: trigger.digits, skin: trigger.summary };
      }
      row.failures = [];
      for (const key of ['R', 'L', 'pair']) if (row[key] !== undefined && row[key] < -.5) row.failures.push(`${key} penetrates ${row[key]} mm`);
      for (const [side, contact] of Object.entries(row.contacts)) if (contact.gap < -.5 || contact.gap > 1.5 || !Number.isFinite(contact.gap)) row.failures.push(`${side} ${contact.surface} contact ${contact.gap} mm`);
      if (row.trigger && (row.trigger.gap < -.5 || row.trigger.gap > 1.5 || !Number.isFinite(row.trigger.gap))) row.failures.push(`trigger contact ${row.trigger.gap} mm`);
      if (row.trigger && !row.trigger.insideGuard) row.failures.push('trigger digit outside guard');
      failed += row.failures.length > 0 ? 1 : 0;
      rows.push(row);
    }
    const worst = key => rows.reduce((best, r) => r[key] !== undefined && r[key] < best.v ? { v: r[key], at: `${r.action} ${r.t} ${r[`${key}at`] ?? ''}` } : best, { v: Infinity, at: '' });
    const bad = rows.filter(r => r.failures?.length);
    report[weapon] = { R: worst('R'), L: worst('L'), pair: worst('pair'), failed: bad.length, rows };
    console.log(weapon, 'R', report[weapon].R.v, report[weapon].R.at, '| L', report[weapon].L.v, report[weapon].L.at, `| ${bad.length}/${rows.length} fail`);
    for (const r of bad.slice(0, 16)) console.log(' ', r.action, r.t, r.failures.join('; '));
    await writeFile(out, JSON.stringify(report, null, 1) + '\n');
  }
} finally { await browser.close(); await writeFile(out, JSON.stringify(report, null, 1) + '\n'); }
if (failed && process.env.ENFORCE) process.exitCode = 1;
