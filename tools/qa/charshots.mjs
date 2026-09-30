// Character review stills from the real renderer (tools/blender/review.html), one browser session.
// node tools/qa/charshots.mjs <outDir> <spec> [spec...]
// spec: name:key=value,key=value  keys: angle (front|side|back|left|three-quarter), distance, clip, time,
// head (1), lod (0-2), clay (1), expression, weapon, color, overlay (1)
// Weapon and colour are page-level: shots are grouped by them, one page load per group.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const [out, ...specs] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const base = process.env.BASE || 'http://127.0.0.1:5176';
const parsed = specs.map(spec => {
  const [name, rest = ''] = spec.split(':');
  const options = Object.fromEntries(rest.split(',').filter(Boolean).map(pair => pair.split('=')));
  return { name, options };
});
const groups = new Map();
for (const shot of parsed) {
  const key = `${shot.options.weapon || ''}|${shot.options.color || ''}|${shot.options.x || ''}|${shot.options.z || ''}|${shot.options.range || ''}|${shot.options.lighting || ''}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(shot);
}
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 960), height: Number(process.env.H || 720) } });
page.on('pageerror', e => console.error('pageerror', e.message));
for (const [key, shots] of groups) {
  const [weapon, color, x, z, range, lighting] = key.split('|');
  const query = new URLSearchParams({ clean: '' });
  if (weapon) query.set('weapon', weapon);
  query.set('color', color ? `#${color}` : '#E76F51');
  query.set('x', x || '84'); query.set('z', z || '-58');
  if (range) query.set('range', range);
  if (lighting) query.set('lighting', lighting);
  await page.goto(`${base}/tools/blender/review.html?${query}`);
  await page.waitForFunction(() => window.capyReview?.ready, null, { timeout: 120000 });
  for (const { name, options } of shots) {
    const o = {
      angle: options.angle || 'three-quarter', distance: Number(options.distance || 3), clip: options.clip || 'idle',
      time: Number(options.time || .3), head: options.head === '1', clay: options.clay === '1', overlay: options.overlay === '1',
      expression: options.expression || null, lod: options.lod === undefined ? undefined : Number(options.lod),
      fov: options.fov === undefined ? undefined : Number(options.fov),
      focus: options.focus === undefined ? undefined : Number(options.focus),
      tx: options.tx === undefined ? undefined : Number(options.tx), tz: options.tz === undefined ? undefined : Number(options.tz),
    };
    const result = await page.evaluate(o => window.capyReview.shot(o), o);
    await page.screenshot({ path: `${out}/${name}.png` });
    console.log(name, JSON.stringify(result));
  }
}
await browser.close();
