// Per-weapon first-person review sheet: hip, aimed, sprint, fire, inspect and reload keys from
// the eye, plus the hip grip from both sides and below. One labelled JPEG per weapon.
// node tools/qa/fp-arms-sheet.mjs <outDir> [weapons csv] [label]   (BASE env overrides the URL)
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
const FONT = process.env.FONT || '/System/Library/Fonts/Supplemental/Arial.ttf';
const [out, list = 'pistol,revolver,smg,m4,shotgun,dmr,sniper,coco,machete', label = ''] = process.argv.slice(2);
if (!out) throw new Error('Give an output directory.');
mkdirSync(out, { recursive: true });
// [label, action or pose, seconds]; reload keys follow each weapon's own choreography.
const common = [['hip', 'pose'], ['aimed', 'pose-ads'], ['sprint', 'sprint', .6], ['inspect a', 'inspect', .55], ['inspect b', 'inspect', 1.3]];
const reloads = {
  pistol: [['reload empty', 'reload', .35], ['reload empty', 'reload', 1.05], ['reload empty', 'reload', 1.47], ['tactical', 'reload-partial', .6]],
  smg: [['reload empty', 'reload', .45], ['reload empty', 'reload', 1.25], ['reload empty', 'reload', 1.66], ['tactical', 'reload-partial', .7]],
  revolver: [['crane', 'reload', .42], ['ejector', 'reload', .74], ['speedloader', 'reload', 1.45], ['close', 'reload', 1.95]],
  m4: [['reload empty', 'reload', .45], ['reload empty', 'reload', 1.2], ['reload seat', 'reload', 1.92], ['bolt catch', 'reload', 2.15]],
  shotgun: [['fire pump', 'fire', .35], ['shell', 'reload', .15], ['shell', 'reload', .3], ['shell push', 'reload', .4]],
  dmr: [['reload empty', 'reload', .45], ['reload empty', 'reload', 1.3], ['charge', 'reload', 2.25], ['tactical', 'reload-partial', 1.0]],
  sniper: [['fire bolt', 'fire', .75], ['reload bolt', 'reload', .45], ['reload mag', 'reload', 1.6], ['reload bolt home', 'reload', 2.75]],
  coco: [['coco lift', 'reload', .3], ['coco drop', 'reload', .45], ['pump', 'reload', 1.8], ['coco top up', 'reload', 2.2]],
  machete: [['slash', 'swing-right', .12], ['slash', 'swing-left', .14], ['chop', 'chop', .1], ['chop', 'chop', .2]],
};
const orbits = { 'hip right side': [Math.PI / 2, .15, .7], 'hip left side': [-Math.PI / 2, .15, .7], 'hip front': [Math.PI + .35, .1, .85] };
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.error('pageerror', e.message));
  await page.addInitScript(() => localStorage.setItem('uc-onboarded', '1'));
  await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?qa=1`);
  await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 90000 });
  await page.evaluate(async () => { await window.__capyQA.start(); window.__capyQA.quality('medium'); });
  await page.addStyleTag({ content: '#app,#confetti,#flash{display:none!important}' });
  for (const weapon of list.split(',')) {
    const shots = [];
    const shoot = async name => { const file = `${out}/${weapon}-${String(shots.length).padStart(2, '0')}.png`; await page.screenshot({ path: file }); shots.push([file, name]); };
    for (const [name, action, t] of [...common, ...reloads[weapon]]) {
      await page.evaluate(() => { window.__vmOrbit = undefined; });
      if (action === 'pose') await page.evaluate(w => window.__capyQA.pose(`fp-${w}`), weapon);
      else if (action === 'pose-ads') await page.evaluate(w => window.__capyQA.pose(`ads-${w}`), weapon);
      else await page.evaluate(([w, a, s]) => window.__capyQA.motion(w, a, s), [weapon, action, t]);
      await page.waitForTimeout(60);
      await shoot(t === undefined ? name : `${name} ${t}s`);
    }
    for (const [name, v] of Object.entries(orbits)) {
      await page.evaluate(v => { window.__vmOrbit = { yaw: v[0], pitch: v[1], distance: v[2], target: [.08, -.12, -.35] }; }, v);
      await page.evaluate(w => window.__capyQA.pose(`fp-${w}`), weapon);
      await page.waitForTimeout(60);
      await shoot(name);
    }
    await page.evaluate(() => { window.__vmOrbit = undefined; });
    execFileSync('magick', ['montage', ...shots.map(s => s[0]), '-tile', '4x', '-geometry', '480x270+2+2', '-background', '#222', '-font', FONT, `${out}/${weapon}-grid.png`]);
    // Labels at each tile origin.
    const draws = shots.flatMap(([, name], i) => ['-annotate', `+${(i % 4) * 484 + 10}+${Math.floor(i / 4) * 274 + 22}`, `${weapon} ${name}`]);
    execFileSync('magick', [`${out}/${weapon}-grid.png`, '-font', FONT, '-fill', 'white', '-undercolor', '#000a', '-pointsize', '18', ...draws,
      ...(label ? ['-gravity', 'northeast', '-annotate', '+10+8', label] : []), '-quality', '82', `${out}/${weapon}${label ? '-' + label : ''}.jpg`]);
    console.log(weapon, shots.length);
  }
} finally { await browser.close(); }
