// A grip override seen from the eye and from orbits around the support or firing paw: one board.
// node tools/qa/vm-pose-views.mjs <out.jpg> <weapon> '<tune json>' [side L|R] [views csv: eye,left,right,below,front,top,back] [fp|ads]
import { chromium } from '@playwright/test';
import sharp from 'sharp';
const [out, weapon, tuneJson = '{}', side = 'L', viewsCsv = 'eye,left,below,front', mode = 'fp'] = process.argv.slice(2);
const tune = JSON.parse(tuneJson);
const orbits = { left: [-Math.PI / 2 + .2, .15, .32], right: [Math.PI / 2 - .2, .15, .32], below: [.2, -1.1, .3], front: [Math.PI + .25, .1, .34], top: [.3, 1.2, .3], back: [.3, .25, .32] };
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.error('pageerror', e.message));
  await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?qa=1`);
  await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 90000 });
  await page.evaluate(async () => { await window.__capyQA.start(); window.__capyQA.quality('medium'); });
  await page.addStyleTag({ content: '#app,#confetti,#flash{display:none!important}' });
  const shots = [];
  for (const view of viewsCsv.split(',')) {
    await page.evaluate(([w, t]) => { window.__vmOrbit = undefined; window.__vmTune = Object.keys(t).length ? { [w]: t } : undefined; }, [weapon, tune]);
    await page.evaluate(p => window.__capyQA.pose(p), `${mode}-${weapon}`);
    if (view !== 'eye') {
      await page.evaluate(([v, s]) => { const p = window.__vmProbe.arms[s === 'L' ? 'left' : 'right'].hand.bone.getWorldPosition(window.__vmProbe.holder.position.clone());
        window.__vmOrbit = { yaw: v[0], pitch: v[1], distance: v[2], target: [p.x, p.y, p.z] }; }, [orbits[view], side]);
      await page.evaluate(p => window.__capyQA.pose(p), `${mode}-${weapon}`);
    }
    await page.waitForTimeout(40);
    shots.push([view, await page.screenshot()]);
  }
  const tw = 640, th = 360, cols = Math.min(3, shots.length), rows = Math.ceil(shots.length / cols);
  const tiles = await Promise.all(shots.map(([name, b]) => sharp(b).resize(tw, th).composite([{ input: Buffer.from(`<svg width="${tw}" height="${th}"><rect width="80" height="22" fill="#000a"/><text x="5" y="16" font-size="15" fill="#fff" font-family="sans-serif">${name}</text></svg>`) }]).toBuffer()));
  await sharp({ create: { width: tw * cols, height: th * rows, channels: 3, background: '#222' } }).composite(tiles.map((b, i) => ({ input: b, left: (i % cols) * tw, top: Math.floor(i / cols) * th }))).jpeg({ quality: 82 }).toFile(out);
} finally { await browser.close(); }
