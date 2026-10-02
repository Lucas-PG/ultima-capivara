import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const out = process.argv[2] || 'docs/overhaul/evidence/codex-gamemodes';
mkdirSync(out, { recursive: true });
const base = process.env.BASE || 'http://127.0.0.1:5199';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=gl-egl'] });
const errors = [], checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('uc-onboarded', '1'); localStorage.setItem('uc-v2-settings', JSON.stringify({ reducedMotion: true })); });
  const inspect = () => page.evaluate(() => window.__capivara.inspect());
  const shot = async name => {
    await page.screenshot({ path: `${out}/${name}.jpg`, quality: 87 });
    checks.push(await page.evaluate(name => {
      const targets = ['#round-hud', '.round-shop', '.round-result', '.round-team-size'].flatMap(s => [...document.querySelectorAll(s)]).filter(e => e.checkVisibility());
      return { name, size: [innerWidth, innerHeight], mode: window.__capivara?.inspect().snapshot?.config.mode,
        round: window.__capivara?.inspect().snapshot?.round,
        boxes: targets.map(e => { const r=e.getBoundingClientRect(); return { element: e.id || e.className, rect: [r.x,r.y,r.width,r.height], overflowX: e.scrollWidth > e.clientWidth + 2 }; }) };
    }, name));
    console.log(name);
  };
  await page.goto(`${base}/?networkQa=1`); await page.evaluate(() => document.fonts.ready);
  await shot('mode-selection-1920x1080');
  await page.setViewportSize({ width: 1280, height: 720 }); await shot('mode-selection-1280x720');
  await page.locator('[data-mode=squads]').click(); await page.locator('[data-do=host]').click();
  await shot('squads-room-options-1280x720');
  await page.setViewportSize({ width: 390, height: 844 }); await shot('squads-room-options-390x844');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  for (const mode of (process.env.MODES || 'duel,squads').split(',')) {
    if (mode !== 'duel') await page.goto(`${base}/?networkQa=1`);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.locator(`[data-mode=${mode}]`).click();
    if (mode === 'squads') await page.getByRole('button', { name: '3 contra 3', exact: true }).click();
    await page.locator('[data-do=practice]').click();
    await page.waitForFunction(() => window.__capivara?.inspect().snapshot?.phase === 'playing' && !window.__capivara.inspect().renderState.loading, null, { timeout: 60000 });
    await page.evaluate(() => window.__networkQA.activate());
    if (mode === 'squads') {
      await page.waitForFunction(() => { const b=document.querySelector('[data-open-shop]'); return b && !b.disabled; }, null, { timeout: 10000 });
      console.log('opening shop', JSON.stringify({ round:(await inspect()).snapshot.round, time:(await inspect()).snapshot.time }));
      await page.keyboard.press('KeyO'); await page.locator('.round-shop').waitFor();
      await shot('squads-buy-1920x1080');
      await page.setViewportSize({ width: 390, height: 844 }); await shot('squads-buy-390x844');
      await page.getByRole('button', { name: 'Comprar Colete por 650 moedas', exact: true }).click();
      await page.waitForFunction(() => window.__capivara.inspect().snapshot.actors.find(a => a.id === 'practice').money === 150);
    }
    await page.waitForFunction(() => window.__capivara.inspect().snapshot.round.phase === 'live', null, { timeout: 20000 });
    if (mode === 'squads') {
      await page.waitForFunction(() => !document.querySelector('.round-shop'));
      await page.waitForFunction(() => window.__capivara.inspect().clientInput.locked, null, { timeout: 5000 });
      checks.push({ name: 'automatic-shop-close', locked: (await inspect()).clientInput.locked, pointerLocked: await page.evaluate(() => !!document.pointerLockElement) });
    }
    await page.evaluate(() => window.__networkQA.activate());
    for (const [w,h] of [[1920,1080],[1280,720],[390,844],[844,390]]) {
      await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(250); await shot(`${mode}-live-${w}x${h}`);
    }
    if (mode === 'duel') {
      await page.setViewportSize({ width: 1280, height: 720 });
      for (let n=0; n<6; n++) {
        if ((await inspect()).snapshot.phase === 'results') break;
        await page.waitForFunction(() => { const s=window.__capivara.inspect().snapshot; return s.phase === 'results' || s.round.phase === 'live'; }, null, { timeout: 20000 });
        if ((await inspect()).snapshot.phase === 'results') break;
        await page.evaluate(() => { const qa=window.__capivara; for (const a of qa.inspect().snapshot.actors) if (a.team === 1) qa.qaDamage(a.id, 1000, 'practice', 'pistol'); });
        await page.waitForFunction(() => { const s=window.__capivara.inspect().snapshot; return s.phase === 'results' || s.round.phase === 'over'; });
        await page.waitForFunction(() => { const s=window.__capivara.inspect().snapshot; return s.phase === 'results' || s.round.phase === 'buy'; }, null, { timeout: 10000 });
      }
      await page.waitForFunction(() => window.__capivara.inspect().snapshot.phase === 'results');
      await page.waitForTimeout(1200); await shot('duel-result-1280x720');
    }
  }
  writeFileSync(`${out}/browser-checks.json`, JSON.stringify({ errors, checks }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); }
