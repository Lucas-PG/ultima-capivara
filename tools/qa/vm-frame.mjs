// Framing numbers of the live viewmodel: muzzle, sight and paw screen positions, gun angles against the
// view, screen coverage (weapon and each arm), where each arm leaves the frame, elbow bend, the closest
// visible vertex and near-plane cuts. States: "hip" (hip and aimed) or "all" (every sampled state, as in
// fp-clearance.mjs). TUNE='{"m4":{...}}' applies window.__vmTune overrides (hip, sprint, shoulders, fov...).
// node tools/qa/vm-frame.mjs <out.json|-> [weapons csv] [hip|all] [WxH]   (BASE env overrides the URL)
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { WRIST_LIMITS } from '../../src/render/viewmodel-targets.ts';
import { holdingStates } from './holding-states.mjs';
import { poseHoldingState } from './fp-state.mjs';
const [out = '-', list = 'pistol,revolver,smg,m4,shotgun,dmr,sniper,coco,machete', mode = 'hip', size = '1280x720'] = process.argv.slice(2);
const [width, height] = size.split('x').map(Number);
const states = weapon => mode === 'hip' ? [['hip', 0], ['aimed', 0]] : holdingStates(weapon).map(({ action, t }) => [action, t]);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
const report = {};
const r2 = v => Math.round(v * 1000) / 1000;
try {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', e => console.error('pageerror', e.message));
  await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?qa=1`);
  await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 90000 });
  await page.evaluate(async () => { await window.__capyQA.start(); window.__capyQA.quality('medium'); });
  await page.waitForFunction(() => !!window.__vmMeasure, null, { timeout: 30000 });
  const tune = process.env.TUNE ? JSON.parse(process.env.TUNE) : undefined;
  for (const weapon of list.split(',')) {
    const rows = [];
    for (const [action, t] of states(weapon)) {
      await page.evaluate(tune => { window.__vmOrbit = undefined; window.__vmTune = tune; }, tune);
      await poseHoldingState(page, weapon, action, t);
      if (await page.evaluate(() => window.__vmProbe.active) !== weapon) continue;
      const f = await page.evaluate(() => window.__vmMeasure(160));
      rows.push({ action, t, ...f });
    }
    const hip = rows[0], ads = rows[1];
    const fmt = p => p ? `${Math.round(p.x * 100)},${Math.round(p.y * 100)}` : '-';
    const exits = a => a ? Object.entries(a.exits).filter(([, s]) => s).map(([k, s]) => `${k[0]}${Math.round(s.from * 100)}-${Math.round(s.to * 100)}`).join(' ') : '-';
    console.log(`${weapon.padEnd(8)} hip cover ${(hip.coverage * 100).toFixed(1)}% (gun ${(hip.weaponCoverage * 100).toFixed(1)} R ${((hip.R?.coverage ?? 0) * 100).toFixed(1)} L ${((hip.L?.coverage ?? 0) * 100).toFixed(1)}) corridor ${(hip.corridor * 100).toFixed(1)}%`
      + ` | muzzle ${fmt(hip.muzzle)} sight ${fmt(hip.sight)} grip ${fmt(hip.grip)} wristL ${fmt(hip.L?.wrist)} | yaw ${hip.yaw.toFixed(1)} pitch ${hip.pitch.toFixed(1)} roll ${hip.roll.toFixed(1)}`
      + ` | exits R ${exits(hip.R)} L ${exits(hip.L)} | bend R ${hip.R?.bend.toFixed(0)} L ${hip.L?.bend.toFixed(0) ?? '-'} | near ${hip.nearestVisible.toFixed(3)} cuts ${hip.nearCuts}`
      + ` | ads sight ${fmt(ads.sight)} cover ${(ads.coverage * 100).toFixed(1)}% L ${((ads.L?.coverage ?? 0) * 100).toFixed(1)}%`);
    const w = (r, side) => r[side]?.wristAngles;
    const fmtW = a => a ? `${a.flexion.toFixed(0)}/${a.deviation.toFixed(0)}/${a.pronation.toFixed(0)}` : '-';
    console.log(`   wrist (flex/dev/pron) hip R ${fmtW(w(hip, 'R'))} L ${fmtW(w(hip, 'L'))} | aimed R ${fmtW(w(ads, 'R'))} L ${fmtW(w(ads, 'L'))}`);
    if (mode === 'all') {
      for (const side of ['R', 'L']) {
        const rows2 = rows.filter(r => w(r, side));
        if (!rows2.length) continue;
        const worst = key => rows2.reduce((b, r) => Math.abs(w(r, side)[key]) > Math.abs(w(b, side)[key]) ? r : b, rows2[0]);
        const out = rows2.filter(r => ['flexion', 'deviation', 'pronation'].some(k => w(r, side)[k] < WRIST_LIMITS[k][0] || w(r, side)[k] > WRIST_LIMITS[k][1]));
        console.log(`   ${side} worst: ` + ['flexion', 'deviation', 'pronation'].map(k => { const r = worst(k); return `${k} ${w(r, side)[k].toFixed(0)} (${r.action} ${r.t})`; }).join(', ')
          + ` | ${out.length}/${rows2.length} outside the limits${out.length ? ': ' + out.slice(0, 8).map(r => `${r.action} ${r.t} ${fmtW(w(r, side))}`).join('; ') : ''}`);
      }
      const worstNear = rows.reduce((w, r) => r.nearestVisible < w.nearestVisible ? r : w, rows[0]);
      const cuts = rows.filter(r => r.nearCuts > 0);
      const maxCover = rows.reduce((w, r) => r.coverage > w.coverage ? r : w, rows[0]);
      const bends = rows.flatMap(r => [r.R?.bend, r.L?.bend]).filter(v => v !== undefined);
      console.log(`   ${rows.length} states: nearest ${worstNear.nearestVisible.toFixed(3)} m (${worstNear.action} ${worstNear.t}), near cuts in ${cuts.length}${cuts.length ? ` (${cuts.slice(0, 6).map(r => `${r.action} ${r.t}`).join(', ')})` : ''},`
        + ` max cover ${(maxCover.coverage * 100).toFixed(1)}% (${maxCover.action} ${maxCover.t}), elbow bend ${Math.min(...bends).toFixed(0)} to ${Math.max(...bends).toFixed(0)}`);
    }
    report[weapon] = rows.map(r => ({ ...r, coverage: r2(r.coverage), weaponCoverage: r2(r.weaponCoverage), corridor: r2(r.corridor) }));
  }
} finally {
  await browser.close();
  if (out !== '-') await writeFile(out, JSON.stringify(report, null, 1) + '\n');
}
