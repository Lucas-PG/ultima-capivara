// HUD cost in a live practice match: the 'hud' timing span (GameUI.update, JS only) plus the page's style
// recalculation and layout time from the DevTools protocol, which is where a DOM HUD really costs.
// node tools/qa/hud-perf.mjs   (BASE, MODE=battle-royale|deathmatch|corrente, SECONDS, W, H, DPR)
import { chromium } from '@playwright/test';
const base = process.env.BASE || 'http://127.0.0.1:5173', mode = process.env.MODE || 'deathmatch', seconds = Number(process.env.SECONDS || 20);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
try {
  const page = await browser.newPage({ viewport: { width: Number(process.env.W || 1470), height: Number(process.env.H || 956) }, deviceScaleFactor: Number(process.env.DPR || 1) });
  await page.goto(`${base}/?networkQa=1&calm&timing=1`);
  await page.locator(`[data-mode="${mode}"]`).click();
  await page.locator('[data-do="practice"]').click();
  await page.waitForFunction(() => { const s = window.__capivara?.inspect(); return s?.snapshot?.phase === 'playing' && !s.renderState.loading && s.snapshot.actors.find(a => !a.bot)?.stage === 'ground'; }, null, { timeout: 180000 });
  await page.evaluate(() => { window.__networkQA.activate(); window.__networkQA.key('KeyH', true); window.__networkQA.key('KeyH', false); });
  await page.waitForTimeout(3000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  await page.evaluate(() => window.__capivara.resetPerf());
  const before = await metrics();
  // A slow turn keeps the compass and minimap busy, like a player looking around.
  const turn = setInterval(() => page.evaluate(() => window.__networkQA.look?.(performance.now() / 4000 % (Math.PI * 2), -.05)).catch(() => {}), 100);
  await page.waitForTimeout(seconds * 1000);
  clearInterval(turn);
  const after = await metrics();
  const perf = await page.evaluate(() => window.__capivara.perf());
  const spans = await page.evaluate(() => { const t = window.__capivara.timings(), by = {};
    for (const s of t.spans) if (s.phase === 'playing') (by[s.name] ||= []).push(s.duration);
    const out = {}; for (const [k, v] of Object.entries(by)) { v.sort((a, b) => a - b); out[k] = { n: v.length, p50: +v[Math.floor(v.length * .5)].toFixed(3), p95: +v[Math.floor(v.length * .95)].toFixed(3), max: +v[v.length - 1].toFixed(3) }; } return out; });
  const frames = Math.max(1, perf.frames);
  const per = key => +((after[key] - before[key]) * 1000 / frames).toFixed(3);
  console.log(JSON.stringify({ mode, frames, p50: perf.p50, p95: perf.p95, hud: spans.hud, styleMsPerFrame: per('RecalcStyleDuration'), layoutMsPerFrame: per('LayoutDuration'),
    layouts: after.LayoutCount - before.LayoutCount, styleRecalcs: after.RecalcStyleCount - before.RecalcStyleCount, nodes: after.Nodes }));
} finally { await browser.close(); }
