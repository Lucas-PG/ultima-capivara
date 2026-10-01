// Worst paw-to-gun skin clearance over every first-person state of each weapon: hip, aimed,
// sprint, fire (pump and bolt strokes), draw, inspect and every reload, both paws, plus
// paw-to-paw for the two-handed handgun holds. Millimetres, negative = inside.
// node tools/qa/fp-clearance.mjs <out.json> [weapons csv] [step s]   (BASE env overrides the URL)
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { measureGrip } from './grip-measure.mjs';
const [out, list = 'pistol,revolver,smg,m4,shotgun,dmr,sniper,coco,machete', stepArg = '.05'] = process.argv.slice(2);
const step = +stepArg;
const RELOAD = { pistol: 1.8, smg: 2, m4: 2.5, shotgun: .55, dmr: 2.6, sniper: 3, revolver: 2.3, coco: 2.8 };
const range = (end, dt = step) => Array.from({ length: Math.floor(end / dt) + 1 }, (_, i) => +(i * dt).toFixed(3));
function states(w) {
  const s = [['hip', 0], ['ads', 0], ...[.15, .3, .6].map(t => ['sprint', t]), ...[.05, .15, .3].map(t => ['ads', t])];
  if (w === 'machete') return [...s, ...range(.6).map(t => ['swing-right', t]), ...range(.6).map(t => ['swing-left', t]), ...range(.6).map(t => ['chop', t]),
    ...range(1.8, .1).map(t => ['inspect', t]), ...range(.5).map(t => ['equip', t])];
  s.push(...range(w === 'sniper' ? 1.3 : w === 'shotgun' ? 1.1 : .3).map(t => ['fire', t]));
  s.push(...range(1.8, .1).map(t => ['inspect', t]), ...range(.5).map(t => ['equip', t]));
  s.push(...range(RELOAD[w] + .1).map(t => ['reload', t]));
  if (['pistol', 'smg', 'm4', 'dmr', 'sniper', 'revolver', 'coco'].includes(w)) s.push(...range(RELOAD[w] + .1).map(t => ['reload-partial', t]));
  if (w === 'shotgun') s.push(...range(2.4).map(t => ['reload-chain', t]));
  return s;
}
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const report = {};
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', e => console.error('pageerror', e.message));
  await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?qa=1`);
  await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 90000 });
  await page.evaluate(async () => { await window.__capyQA.start(); window.__capyQA.quality('medium'); });
  for (const weapon of list.split(',')) {
    const rows = [];
    for (const [action, t] of states(weapon)) {
      await page.evaluate(() => { window.__vmOrbit = undefined; window.__vmTune = undefined; });
      if (action === 'hip' || (action === 'ads' && t === 0)) await page.evaluate(([w, a]) => window.__capyQA.pose(`${a === 'ads' ? 'ads' : 'fp'}-${w}`), [weapon, action]);
      else await page.evaluate(([w, a, s]) => window.__capyQA.motion(w, a, s), [weapon, action, t]);
      const row = { action, t };
      for (const side of ['R', 'L']) {
        const visible = await page.evaluate(side => window.__vmProbe.arms.meshes.find(m => m.name.endsWith(side)).visible, side);
        if (!visible) continue;
        const m = await page.evaluate(measureGrip, [weapon, side]);
        row[side] = m.worst; row[`${side}at`] = Object.entries(m.summary).sort((a, b) => a[1].min - b[1].min)[0]?.[0];
      }
      if (weapon === 'pistol' || weapon === 'revolver') row.pair = (await page.evaluate(measureGrip, [weapon, 'L', true])).worst;
      rows.push(row);
    }
    const worst = key => rows.reduce((best, r) => r[key] !== undefined && r[key] < best.v ? { v: r[key], at: `${r.action} ${r.t}${r[`${key}at`] ? ' ' + r[`${key}at`] : ''}` } : best, { v: Infinity, at: '' });
    report[weapon] = { R: worst('R'), L: worst('L'), pair: worst('pair'), rows };
    const bad = rows.filter(r => ['R', 'L', 'pair'].some(k => r[k] !== undefined && r[k] < -.5));
    console.log(weapon, 'R', report[weapon].R.v, report[weapon].R.at, '| L', report[weapon].L.v, report[weapon].L.at,
      report[weapon].pair.v !== Infinity ? `| pair ${report[weapon].pair.v} ${report[weapon].pair.at}` : '', `| ${bad.length}/${rows.length} below -0.5`);
    for (const r of bad) console.log('   ', r.action, r.t, 'R', r.R, r.Rat ?? '', 'L', r.L, r.Lat ?? '', r.pair !== undefined ? `pair ${r.pair}` : '');
  }
} finally { await browser.close(); await writeFile(out, JSON.stringify(report, null, 1) + '\n'); }
