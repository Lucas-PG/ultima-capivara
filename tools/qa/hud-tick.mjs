// HUD tick micro-benchmark: GameUI.update on a busy QA pose (hud-full), forced past the 75 ms throttle, N times.
// node tools/qa/hud-tick.mjs   (BASE, N=300, NOMAP=1 leaves the minimap out). Reports the median and p95 of one full HUD write, minimap included.
import { chromium } from '@playwright/test';
const base = process.env.BASE || 'http://127.0.0.1:5173', n = Number(process.env.N || 300);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
try {
  const page = await browser.newPage({ viewport: { width: 1470, height: 956 } });
  await page.addInitScript(() => localStorage.setItem('uc-onboarded', '1'));
  await page.goto(`${base}/?qa=1`);
  await page.waitForFunction(() => !!window.__capyQA && !!window.__hudQA, null, { timeout: 60000 });
  await page.evaluate(() => window.__capyQA.start());
  await page.evaluate(() => window.__capyQA.pose('hud-full'));
  const noMap = !!process.env.NOMAP;
  const result = await page.evaluate(([count, noMap]) => {
    const ui = window.__hudQA, s = structuredClone(ui.snapshot), me = s.actors.find(a => a.id === 'practice'), times = [];
    if (noMap) ui.drawMap = () => {};
    for (let i = 0; i < count; i++) {
      // Something changes every tick, as in a fight: health, the clock, the player's position.
      me.hp = 40 + (i % 50); s.time += .075; me.pos.x += .05; s.zone.timeLeft = Math.max(0, s.zone.timeLeft - .075);
      ui.hudTime = 0; const t0 = performance.now(); ui.update(s, 'practice', 0, false, 60, null); times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    return { n: count, p50: +times[Math.floor(count * .5)].toFixed(3), p95: +times[Math.floor(count * .95)].toFixed(3) };
  }, [n, noMap]);
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
