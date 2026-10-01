// Review board for candidate grips: per weapon, the eye view (hip and aimed) and close orbits
// around each paw, with the measured worst clearance of both paws. One labelled JPEG per weapon.
// node tools/qa/grip-board.mjs <outDir> '<json {weapon: {R?: grip, L?: grip, hip?, shoulders?}}>' [label]
// A value "@file.json" reads the grips from a fit output ({final: {grip}}) or a plain grip file.
import { mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { measureGrip } from './grip-measure.mjs';
const [out, specArg, label = ''] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const FONT = process.env.FONT || '/System/Library/Fonts/Supplemental/Arial.ttf';
const load = v => typeof v === 'string' && v.startsWith('@') ? (j => j.final?.grip ?? j)(JSON.parse(readFileSync(v.slice(1), 'utf8'))) : v;
const spec = JSON.parse(specArg.startsWith('@') ? readFileSync(specArg.slice(1), 'utf8') : specArg);
// Orbit directions in weapon space (x right, y up, -z to the muzzle), turned into camera-space orbits.
const orbits = { 'gun right': [1, .25, .15], 'gun left': [-1, .25, .15], 'gun below': [.15, -1, .25], 'gun front': [.1, .15, -1], 'gun top': [.15, 1, .2] };
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.error('pageerror', e.message));
  await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?qa=1`);
  await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 90000 });
  await page.evaluate(async () => { await window.__capyQA.start(); window.__capyQA.quality('medium'); });
  await page.addStyleTag({ content: '#app,#confetti,#flash{display:none!important}' });
  for (const [weapon, raw] of Object.entries(spec)) {
    const { R, L, sides = 'RL', ...rest } = raw;
    const tune = { ...rest, grips: { ...(R ? { R: load(R) } : {}), ...(L ? { L: load(L) } : {}) } };
    await page.evaluate(([w, t]) => { window.__vmTune = { [w]: t }; window.__vmOrbit = undefined; }, [weapon, tune]);
    const shots = [];
    const shoot = async name => { const file = `${out}/${weapon}-${shots.length}.png`; await page.screenshot({ path: file }); shots.push([file, name]); };
    await page.evaluate(w => window.__capyQA.pose(`fp-${w}`), weapon); await shoot('hip eye');
    await page.evaluate(w => window.__capyQA.pose(`ads-${w}`), weapon); await shoot('aimed');
    await page.evaluate(w => window.__capyQA.pose(`fp-${w}`), weapon);
    const worst = {};
    for (const side of sides) {
      const m = await page.evaluate(measureGrip, [weapon, side]);
      worst[side] = m.worst;
      const where = Object.entries(m.summary).sort((a, b) => a[1].min - b[1].min)[0];
      console.log(weapon, side, 'worst', m.worst, 'at', where?.[0], JSON.stringify(m.digits));
      for (const [name, v] of Object.entries(orbits)) {
        await page.evaluate(([v, t]) => {
          const q = window.__vmProbe.holder.quaternion, V = window.__vmProbe.holder.position.constructor;
          const d = new V(...v).normalize().applyQuaternion(q);
          window.__vmOrbit = { yaw: Math.atan2(d.x, d.z), pitch: Math.asin(d.y), distance: .3, target: t };
        }, [v, m.centroid]);
        await page.evaluate(w => window.__capyQA.pose(`fp-${w}`), weapon);
        await shoot(`${side} ${name} (worst ${m.worst} mm)`);
      }
      await page.evaluate(() => { window.__vmOrbit = undefined; });
    }
    execFileSync('magick', ['montage', ...shots.map(s => s[0]), '-tile', '4x', '-geometry', '480x270+2+2', '-background', '#222', '-font', FONT, `${out}/${weapon}-grid.png`]);
    const draws = shots.flatMap(([, name], i) => ['-annotate', `+${(i % 4) * 484 + 10}+${Math.floor(i / 4) * 274 + 22}`, `${weapon} ${name}`]);
    execFileSync('magick', [`${out}/${weapon}-grid.png`, '-font', FONT, '-fill', 'white', '-undercolor', '#000a', '-pointsize', '18', ...draws,
      ...(label ? ['-gravity', 'northeast', '-annotate', '+10+8', label] : []), '-quality', '80', `${out}/${weapon}${label ? '-' + label : ''}.jpg`]);
  }
} finally { await browser.close(); }
