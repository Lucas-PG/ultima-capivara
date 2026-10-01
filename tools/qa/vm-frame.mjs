// Framing numbers of the live viewmodel: muzzle, sight and paw screen positions, gun angles against the
// view, screen coverage (weapon and each arm), where each arm leaves the frame, elbow bend, the closest
// visible vertex and near-plane cuts. States: "hip" (hip and aimed) or "all" (every sampled state, as in
// fp-clearance.mjs). TUNE='{"m4":{...}}' applies window.__vmTune overrides (hip, sprint, shoulders, fov...).
// node tools/qa/vm-frame.mjs <out.json|-> [weapons csv] [hip|all] [WxH]   (BASE env overrides the URL)
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const [out = '-', list = 'pistol,revolver,smg,m4,shotgun,dmr,sniper,coco,machete', mode = 'hip', size = '1280x720'] = process.argv.slice(2);
const [width, height] = size.split('x').map(Number);
const RELOAD = { pistol: 1.8, smg: 2, m4: 2.5, shotgun: .55, dmr: 2.6, sniper: 3, revolver: 2.3, coco: 2.8 };
const range = (end, dt) => Array.from({ length: Math.floor(end / dt) + 1 }, (_, i) => +(i * dt).toFixed(3));
function states(w) {
  const s = [['hip', 0], ['ads', 0]];
  if (mode === 'hip') return s;
  s.push(...[.15, .3, .6].map(t => ['sprint', t]), ...[.05, .15, .3].map(t => ['ads', t]), ...range(1.8, .1).map(t => ['inspect', t]), ...range(.5, .05).map(t => ['equip', t]));
  if (w === 'machete') return [...s, ...range(.6, .05).map(t => ['swing-right', t]), ...range(.6, .05).map(t => ['swing-left', t]), ...range(.6, .05).map(t => ['chop', t])];
  s.push(...range(w === 'sniper' ? 1.3 : w === 'shotgun' ? 1.1 : .3, .05).map(t => ['fire', t]), ...range(RELOAD[w] + .1, .05).map(t => ['reload', t]));
  if (['pistol', 'smg', 'm4', 'dmr', 'sniper', 'revolver', 'coco'].includes(w)) s.push(...range(RELOAD[w] + .1, .1).map(t => ['reload-partial', t]));
  if (w === 'shotgun') s.push(...range(2.4, .05).map(t => ['reload-chain', t]));
  return s;
}
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
      if (t === 0 && (action === 'hip' || action === 'ads')) await page.evaluate(([w, a]) => window.__capyQA.pose(`${a === 'ads' ? 'ads' : 'fp'}-${w}`), [weapon, action]);
      else await page.evaluate(([w, a, s]) => window.__capyQA.motion(w, a, s), [weapon, action, t]);
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
    if (mode === 'all') {
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
