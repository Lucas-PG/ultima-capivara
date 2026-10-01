import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadavg } from 'node:os';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { startDriver, stopDriver } from './live-driver.mjs';

// Real play conditions, so a Retina regression cannot hide behind the 1280x720 test again: the
// production (QA) build, a 1470x956 CSS viewport at deviceScaleFactor 2 (a full-screen Chrome on a
// MacBook Air), a live practice Correria with bots driven through the real input layer. On Medium
// the shipped game measured 18 fps here before the resolution pass. Thresholds leave room for a
// warm, loaded laptop; tools/qa/real-perf.mjs runs the sustained five-minute version.
type Preset = 'low' | 'medium' | 'high';
const LIMITS: Record<Preset, { fps: number; p95: number; hitches: number } | null> = {
  low: { fps: 55, p95: 20, hitches: 5 },
  medium: { fps: 50, p95: 25, hitches: 5 },
  // High is reported, not gated: it trades frame rate for detail by design.
  high: null,
};
const SECONDS = process.env.QA_SMOKE ? 10 : 40;
const thermal = () => { try { return Number(execFileSync('notifyutil', ['-g', 'com.apple.system.thermalpressurelevel']).toString().trim().split(/\s+/).pop()); } catch { return null; } };

test('holds the frame rate at real play conditions on a Retina laptop', async ({ browser }) => {
  test.setTimeout(900_000);
  const rows = [];
  for (const preset of ['medium', 'low', 'high'] as Preset[]) {
    const context = await browser.newContext({ viewport: { width: 1470, height: 956 }, deviceScaleFactor: 2 });
    await context.addInitScript((graphics: Preset) => {
      localStorage.setItem('uc-v2-settings', JSON.stringify({ graphics, frameLimit: 60, graphicsChosen: true }));
      const times = new Float64Array(1 << 18); let count = 0;
      const tick = (now: number) => { if (count < times.length) times[count++] = now; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      (window as unknown as { __rafTimes: unknown }).__rafTimes = { read: (from: number) => Array.from(times.subarray(from, count)), get count() { return count; } };
    }, preset);
    const page = await context.newPage();
    await page.goto('/?networkQa=1&calm', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-do="practice"]').waitFor({ timeout: 120_000 });
    const menuMs = await page.evaluate(() => performance.now());
    await page.locator('[data-mode="deathmatch"]').click();
    const clickedAt = await page.evaluate(() => performance.now());
    await page.locator('[data-do="practice"]').click();
    await page.waitForFunction(() => { const i = window.__capivara?.inspect(); return i?.snapshot?.phase === 'playing' && !i.renderState.loading; }, null, { timeout: 180_000 });
    const firstFrameMs = await page.evaluate(start => performance.now() - start, clickedAt);
    await page.evaluate(() => { const q = (window as unknown as { __networkQA: { activate(): void } }).__networkQA; q.activate(); });
    await startDriver(page);
    await page.waitForTimeout(10_000);
    const from = await page.evaluate(() => (window as unknown as { __rafTimes: { count: number } }).__rafTimes.count);
    const renderedBefore = await page.evaluate(() => window.__capivara!.inspect().renderedFrames as number);
    await page.waitForTimeout(SECONDS * 1000);
    const sample = await page.evaluate(start => ({ times: (window as unknown as { __rafTimes: { read(from: number): number[] } }).__rafTimes.read(start),
      rendered: window.__capivara!.inspect().renderedFrames as number, density: window.__capivara!.inspect().renderDensity as number,
      stats: window.__capivara!.inspect().renderer }), from);
    await stopDriver(page);
    await context.close();
    const intervals = sample.times.slice(1).map((t, i) => t - sample.times[i]), sorted = [...intervals].sort((a, b) => a - b);
    const elapsed = intervals.reduce((a, b) => a + b, 0) / 1000, worst = sorted.slice(Math.floor(sorted.length * .99));
    const row = { preset, fps: +((sample.rendered - renderedBefore) / elapsed).toFixed(1), p50: +sorted[Math.floor(sorted.length * .5)].toFixed(1),
      p95: +sorted[Math.floor(sorted.length * .95)].toFixed(1), low1: +(1000 / (worst.reduce((a, b) => a + b, 0) / worst.length)).toFixed(1),
      hitches: intervals.filter(n => n > 50).length, max: +sorted.at(-1)!.toFixed(1), density: sample.density, draws: sample.stats?.drawCalls,
      menuMs: Math.round(menuMs), firstFrameMs: Math.round(firstFrameMs), load: +loadavg()[0].toFixed(2), thermal: thermal() };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  const output = resolve('tests/perf/results');
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'real-latest.json'), JSON.stringify({ measuredAt: new Date().toISOString(), viewport: '1470x956', deviceScaleFactor: 2, seconds: SECONDS, rows }, null, 2));
  for (const row of rows) {
    const limit = LIMITS[row.preset];
    if (!limit) continue;
    expect(row.fps, `${row.preset} average fps`).toBeGreaterThanOrEqual(limit.fps);
    expect(row.p95, `${row.preset} p95 frame ms`).toBeLessThanOrEqual(limit.p95);
    expect(row.hitches, `${row.preset} frames over 50 ms`).toBeLessThanOrEqual(limit.hitches);
  }
});
