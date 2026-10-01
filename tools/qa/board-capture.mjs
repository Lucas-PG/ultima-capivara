// Captures the review cameras at real resolution (1470x956 CSS at deviceScaleFactor 2) from a served
// VITE_QA=1 build, in a fixed order so time-driven motion (wind, water) matches between two builds.
// node tools/qa/board-capture.mjs <outDir>   BASE=http://127.0.0.1:4187  PRESETS=medium,high  HEADED=1
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const [out] = process.argv.slice(2);
if (!out) throw new Error('Usage: node tools/qa/board-capture.mjs <outDir>');
mkdirSync(out, { recursive: true });
const env = process.env, base = env.BASE || 'http://127.0.0.1:4187', presets = (env.PRESETS || 'medium,high').split(',');
const wide = JSON.parse(readFileSync(new URL('./wide-views.json', import.meta.url), 'utf8'));
// name: [QA pose, capybaras, camera override]
const BOARD_ALL = {
  'fp-m4': ['fp-m4', 1], 'fp-shotgun': ['fp-shotgun', 1], 'fp-pistol': ['fp-pistol', 1], 'fp-machete': ['fp-machete', 1], 'ads-dmr': ['ads-dmr', 1],
  plaza: ['plaza', 1], street: ['vilaStreet', 1], morro: ['morroStreet', 1], harbour: ['district-porto', 1], crowd: ['capyFront', 12],
  plane: ['plaza', 1, 'plane'], fight: ['cocoBlast', 8],
};
const BOARD = env.POSES ? Object.fromEntries(env.POSES.split(',').map(name => [name, BOARD_ALL[name]])) : BOARD_ALL;
const browser = await chromium.launch({ headless: env.HEADED !== '1', channel: 'chrome',
  args: ['--use-gl=angle', '--use-angle=metal', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
try {
  const page = await browser.newPage({ viewport: { width: 1470, height: 956 }, deviceScaleFactor: 2 });
  page.on('pageerror', error => console.error('pageerror', error.message));
  await page.addInitScript(() => localStorage.setItem('uc-onboarded', '1'));
  await page.goto(`${base}/?qa=1${env.QUERY || ''}`);
  await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 120_000 });
  await page.evaluate(() => window.__capyQA.start());
  await page.addStyleTag({ content: '#confetti,#flash{display:none!important}' });
  // DENSITY=2: the after build at the screen's native density, to compare like for like with the old build.
  if (env.DENSITY) await page.evaluate(d => window.__capyQA.density(d), Number(env.DENSITY));
  for (const preset of presets) {
    await page.evaluate(q => window.__capyQA.quality(q), preset);
    for (const [name, [pose, actors, camera]] of Object.entries(BOARD)) {
      await page.evaluate(view => { window.__camOverride = view ?? undefined; }, camera ? wide[camera] : null);
      for (let i = 0; i < 2; i++) await page.evaluate(async ([p, n]) => { window.__capyQA.actors(n); await window.__capyQA.pose(p); }, [pose, actors]);
      // A fresh preset application restores the preset's full render density before the capture.
      await page.evaluate(q => window.__capyQA.quality(q), preset);
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${out}/${preset}-${name}.png` });
      const size = await page.evaluate(() => [document.querySelector('#game').width, document.querySelector('#game').height]);
      console.log(preset, name, size.join('x'));
    }
  }
} finally { await browser.close(); }
