// Tries a framing override for one weapon: prints the framing numbers and writes one board of views.
// node tools/qa/vm-try.mjs <out.jpg> <weapon> '<tune json, as window.__vmTune[weapon]>' [views csv]
// Views: hip, ads, right, left (hip from both sides), or <action>@<seconds> (sprint@.6, reload@1.2, inspect@.55 ...).
import { chromium } from '@playwright/test';
import sharp from 'sharp';
const [out, weapon, tuneJson = '{}', viewsCsv = 'hip,ads,right,left'] = process.argv.slice(2);
const tune = JSON.parse(tuneJson);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
const W = 1280, H = 720;
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', e => console.error('pageerror', e.message));
  await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?qa=1`);
  await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 90000 });
  await page.evaluate(async () => { await window.__capyQA.start(); window.__capyQA.quality('medium'); });
  await page.waitForFunction(() => !!window.__vmMeasure, null, { timeout: 30000 });
  await page.addStyleTag({ content: '#app,#confetti,#flash{display:none!important}' });
  const shots = [];
  for (const view of viewsCsv.split(',')) {
    await page.evaluate(([w, t]) => { window.__vmOrbit = undefined; window.__vmTune = Object.keys(t).length ? { [w]: t } : undefined; }, [weapon, tune]);
    const [action, at] = view.split('@');
    if (view === 'hip' || view === 'right' || view === 'left') await page.evaluate(w => window.__capyQA.pose(`fp-${w}`), weapon);
    else if (view === 'ads') await page.evaluate(w => window.__capyQA.pose(`ads-${w}`), weapon);
    else await page.evaluate(([w, a, s]) => window.__capyQA.motion(w, a, s), [weapon, action, +at]);
    const f = await page.evaluate(() => window.__vmMeasure(160));
    const pt = p => p ? `${Math.round(p.x * 100)},${Math.round(p.y * 100)}` : '-';
    const exits = a => a ? Object.entries(a.exits).filter(([, s]) => s).map(([k, s]) => `${k[0]}${Math.round(s.from * 100)}-${Math.round(s.to * 100)}`).join(' ') : '-';
    if (view !== 'right' && view !== 'left') console.log(`${view.padEnd(12)} cover ${(f.coverage * 100).toFixed(1)}% (gun ${(f.weaponCoverage * 100).toFixed(1)} R ${((f.R?.coverage ?? 0) * 100).toFixed(1)} L ${((f.L?.coverage ?? 0) * 100).toFixed(1)}) corridor ${(f.corridor * 100).toFixed(1)}%`
      + ` muzzle ${pt(f.muzzle)} sight ${pt(f.sight)} grip ${pt(f.grip)} wristL ${pt(f.L?.wrist)} yaw ${f.yaw.toFixed(1)} pitch ${f.pitch.toFixed(1)} roll ${f.roll.toFixed(1)}`
      + ` exits R ${exits(f.R)} L ${exits(f.L)} bend R ${f.R?.bend.toFixed(0)} L ${f.L?.bend.toFixed(0) ?? '-'} near ${f.nearestVisible.toFixed(3)} cuts ${f.nearCuts}`);
    if (view === 'right' || view === 'left') {
      await page.evaluate(([yaw]) => { const p = window.__vmProbe.holder.position; window.__vmOrbit = { yaw, pitch: .15, distance: .75, target: [p.x - .03, p.y - .05, p.z - .05] }; }, [view === 'right' ? Math.PI / 2 : -Math.PI / 2]);
      await page.evaluate(w => window.__capyQA.pose(`fp-${w}`), weapon);
    }
    await page.waitForTimeout(50);
    shots.push(await page.screenshot());
  }
  const tw = 960, th = 540, cols = 2, rows = Math.ceil(shots.length / cols);
  const tiles = await Promise.all(shots.map(b => sharp(b).resize(tw, th).toBuffer()));
  await sharp({ create: { width: tw * cols, height: th * rows, channels: 3, background: '#222' } })
    .composite(tiles.map((b, i) => ({ input: b, left: (i % cols) * tw, top: Math.floor(i / cols) * th }))).jpeg({ quality: 82 }).toFile(out);
} finally { await browser.close(); }
