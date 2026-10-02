// node tools/qa/perf-probe.mjs  (BASE, MODE, SECONDS, QUALITY=low|medium|high): frame intervals and CPU spans over a live practice match.
// Short live perf probe: practice match with bots, standing player, frame intervals over N seconds.
import { chromium } from '@playwright/test';
const base = process.env.BASE || 'http://127.0.0.1:5173', mode = process.env.MODE || 'deathmatch', seconds = Number(process.env.SECONDS || 20);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=gl-egl'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  if (process.env.QUALITY) await page.addInitScript(graphics => { const saved = JSON.parse(localStorage.getItem('uc-v2-settings') || '{}'); localStorage.setItem('uc-v2-settings', JSON.stringify({ ...saved, graphics })); }, process.env.QUALITY);
  await page.goto(`${base}/?networkQa=1&calm&timing=1`);
  await page.locator(`[data-mode="${mode}"]`).click();
  await page.locator('[data-do="practice"]').click();
  await page.waitForFunction(() => { const s = window.__capivara?.inspect(); return s?.snapshot?.phase === 'playing' && !s.renderState.loading && s.snapshot.actors.find(a => !a.bot)?.stage === 'ground'; }, null, { timeout: 120000 });
  await page.evaluate(() => { window.__networkQA.activate(); });
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.__capivara.resetPerf());
  await page.waitForTimeout(seconds * 1000);
  const perf = await page.evaluate(() => window.__capivara.perf());
  const spans = await page.evaluate(() => { const t = window.__capivara.timings(), by = {};
    for (const s of t.spans) if (s.phase === 'playing') (by[s.name] ||= []).push(s.duration);
    const out = {}; for (const [k, v] of Object.entries(by)) { v.sort((a, b) => a - b); out[k] = [v.length, +v[Math.floor(v.length * .5)].toFixed(2), +v[Math.floor(v.length * .95)].toFixed(2)]; } return out; });
  console.log(JSON.stringify({ mode, quality: process.env.QUALITY || 'default', p50: perf.p50, p95: perf.p95, p99: perf.p99, max: perf.max, over33: perf.over33, frames: perf.frames, heap: perf.heapMB, draws: perf.renderer?.drawCalls, tris: perf.renderer?.triangles, longTasks: perf.longTasks?.length, spans }));
} finally { await browser.close(); }
