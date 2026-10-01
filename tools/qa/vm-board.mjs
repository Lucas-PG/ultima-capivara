// One view of several weapons on one board, with framing numbers. TUNE='{"m4":{...}}' applies overrides.
// node tools/qa/vm-board.mjs <out.jpg> [weapons csv] [view: hip|ads|right|left|<action>@<s>] [WxH]   (HUD=1 keeps the HUD)
import { chromium } from '@playwright/test';
import sharp from 'sharp';
const [out, list = 'pistol,revolver,smg,m4,shotgun,dmr,sniper,coco,machete', view = 'hip', size = '1280x720'] = process.argv.slice(2);
const [W, H] = size.split('x').map(Number);
const tune = process.env.TUNE ? JSON.parse(process.env.TUNE) : undefined;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', e => console.error('pageerror', e.message));
  await page.addInitScript(() => localStorage.setItem('uc-onboarded', '1'));
  await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?qa=1`);
  await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 90000 });
  await page.evaluate(async () => { await window.__capyQA.start(); window.__capyQA.quality('medium'); });
  await page.waitForFunction(() => !!window.__vmMeasure, null, { timeout: 30000 });
  await page.addStyleTag({ content: process.env.HUD ? '#confetti,#flash{display:none!important}' : '#app,#confetti,#flash{display:none!important}' });
  const shots = [];
  for (const weapon of list.split(',')) {
    await page.evaluate(t => { window.__vmOrbit = undefined; window.__vmTune = t; }, tune);
    const [action, at] = view.split('@');
    if (view === 'ads') await page.evaluate(w => window.__capyQA.pose(`ads-${w}`), weapon);
    else if (!at) await page.evaluate(w => window.__capyQA.pose(`fp-${w}`), weapon);
    else await page.evaluate(([w, a, s]) => window.__capyQA.motion(w, a, s), [weapon, action, +at]);
    const f = await page.evaluate(() => window.__vmMeasure(160));
    const pt = p => p ? `${Math.round(p.x * 100)},${Math.round(p.y * 100)}` : '-';
    const exits = a => a ? Object.entries(a.exits).filter(([, s]) => s).map(([k, s]) => `${k[0]}${Math.round(s.from * 100)}-${Math.round(s.to * 100)}`).join(' ') : '-';
    console.log(`${weapon.padEnd(8)} cover ${(f.coverage * 100).toFixed(1)}% (gun ${(f.weaponCoverage * 100).toFixed(1)} R ${((f.R?.coverage ?? 0) * 100).toFixed(1)} L ${((f.L?.coverage ?? 0) * 100).toFixed(1)}) corr ${(f.corridor * 100).toFixed(1)}%`
      + ` muzzle ${pt(f.muzzle)} sight ${pt(f.sight)} grip ${pt(f.grip)} wL ${pt(f.L?.wrist)} y/p/r ${f.yaw.toFixed(1)}/${f.pitch.toFixed(1)}/${f.roll.toFixed(1)}`
      + ` exits R ${exits(f.R)} L ${exits(f.L)} bend ${f.R?.bend.toFixed(0)}/${f.L?.bend.toFixed(0) ?? '-'} near ${f.nearestVisible.toFixed(3)} cuts ${f.nearCuts}`);
    if (view === 'right' || view === 'left') {
      await page.evaluate(([yaw]) => { const p = window.__vmProbe.holder.position; window.__vmOrbit = { yaw, pitch: .15, distance: .75, target: [p.x - .03, p.y - .05, p.z - .05] }; }, [view === 'right' ? Math.PI / 2 : -Math.PI / 2]);
      await page.evaluate(w => window.__capyQA.pose(`fp-${w}`), weapon);
    }
    await page.waitForTimeout(50);
    shots.push([weapon, await page.screenshot()]);
  }
  const tw = 640, th = Math.round(640 * H / W), cols = 3, rows = Math.ceil(shots.length / cols);
  const tiles = await Promise.all(shots.map(([name, b]) => sharp(b).resize(tw, th).composite([{ input: Buffer.from(
    `<svg width="${tw}" height="${th}"><rect width="${12 + name.length * 10}" height="24" fill="#000a"/><text x="6" y="17" font-size="16" fill="#fff" font-family="sans-serif">${name}</text></svg>`) }]).toBuffer()));
  await sharp({ create: { width: tw * cols, height: th * rows, channels: 3, background: '#222' } })
    .composite(tiles.map((b, i) => ({ input: b, left: (i % cols) * tw, top: Math.floor(i / cols) * th }))).jpeg({ quality: 82 }).toFile(out);
} finally { await browser.close(); }
