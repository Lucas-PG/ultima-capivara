// After the results and "Jogar de novo", the new match must show the whole HUD again.
// node tools/qa/rematch-check.mjs <outDir> <battle-royale|deathmatch|corrente>   (BASE overrides the URL)
// Battle royale and Corrente are ended early with the QA damage hook (the player eliminates every bot);
// Correria runs its whole clock.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
const [out, mode = 'corrente'] = process.argv.slice(2);
if (!out) throw new Error('Give a worktree-local output directory.');
mkdirSync(out, { recursive: true });
const PLATES = ['compass', 'mapWrap', 'topL', 'vitals', 'hotbar', 'wpnbox'];
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => { console.error('pageerror', e.message); process.exitCode = 1; });
  await page.addInitScript(() => localStorage.setItem('uc-onboarded', '1'));
  await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?networkQa=1&calm`);
  await page.locator(`[data-mode="${mode}"]`).click();
  await page.locator('[data-do="practice"]').click();
  const playing = () => page.waitForFunction(() => { const s = window.__capivara?.inspect(); return s?.snapshot?.phase === 'playing' && !s.renderState.loading; }, null, { timeout: 120000 });
  const hud = () => page.evaluate(ids => ({ hud: document.getElementById('hud')?.className, shown: ids.filter(id => { const el = document.getElementById(id); return !!el && !el.hidden && el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true }) && el.getBoundingClientRect().width > 2; }) }), PLATES);
  await playing();
  await page.evaluate(() => window.__networkQA.activate());
  await page.waitForTimeout(2500);
  console.log(mode, 'first match', JSON.stringify(await hud()));
  const started = Date.now();
  while (Date.now() - started < 600000) {
    const phase = await page.evaluate(mode => {
      const i = window.__capivara.inspect(), s = i.snapshot, me = s.actors.find(a => !a.bot);
      if (s.phase === 'playing' && mode !== 'deathmatch' && me?.alive) {
        const bot = s.actors.find(a => a.bot && a.alive && a.stage === 'ground' && !(a.protectionUntil > s.time));
        if (bot) window.__capivara.qaDamage(bot.id, 10000, me.id, me.weapons[me.slot]?.id || 'pistol');
      }
      return s.phase;
    }, mode);
    if (phase === 'results') break;
    await page.waitForTimeout(mode === 'deathmatch' ? 5000 : 700);
  }
  await page.locator('#vpanel.show').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${mode}-results.jpg`, quality: 80 });
  await page.locator('[data-do="rematch"]').click();
  await page.waitForFunction(() => window.__capivara.inspect().snapshot?.phase !== 'results', null, { timeout: 60000 });
  await playing();
  await page.evaluate(() => window.__networkQA.activate());
  await page.waitForTimeout(3000);
  const after = await hud();
  await page.screenshot({ path: `${out}/${mode}-rematch.jpg`, quality: 80 });
  console.log(mode, 'after rematch', JSON.stringify(after));
  if (after.hud?.includes('ended') || after.shown.length < PLATES.length) { console.error(`${mode}: the HUD is incomplete after the rematch`); process.exitCode = 1; }
} finally { await browser.close(); }
