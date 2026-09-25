import { test, expect, type Response } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, platform, release, arch } from 'node:os';
import { resolve } from 'node:path';

type Download = { url: string; bytes: number; gzipBytes: number; phase: 'menu' | 'match' };
type Sample = { avgFps: number; p95FrameMs: number; p95Fps: number; maxFrameMs: number; over50: number; frames: number; renderedFrames: number; drawCalls: number; triangles: number; heapMB: number | null; gpuRenderer: string };
type Preset = 'low' | 'medium' | 'high';
const presets: Preset[] = ['low', 'medium', 'high'];

test('measures all quality presets in a rendered match', async ({ browser }) => {
  const rows: { preset: Preset; sample: Sample; beforeMenu: number; beforeMenuGzip: number; beforeMatch: number; beforeMatchGzip: number }[] = [];
  for (const preset of presets) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await context.addInitScript((quality: Preset) => localStorage.setItem('uc-v2-settings', JSON.stringify({ graphics: quality, frameLimit: 60 })), preset);
    const downloadPage = await context.newPage();
    const downloads: Download[] = [];
    const pending: Promise<void>[] = [];
    let phase: Download['phase'] = 'menu';
    const recordResponse = (response: Response) => {
      if (!response.url().startsWith('http://127.0.0.1:4186/')) return;
      const responsePhase = phase;
      pending.push((async () => {
        try {
          const body = await response.body();
          downloads.push({ url: response.url(), bytes: body.length, gzipBytes: gzipSync(body).length, phase: responsePhase });
        } catch { /* A cancelled request contributes no downloaded bytes. */ }
      })());
    };
    context.on('response', recordResponse);
    await downloadPage.goto('/', { waitUntil: 'domcontentloaded' });
    await downloadPage.locator('[data-do="practice"]').waitFor();
    const beforeMenu = pending.length;
    phase = 'match';
    await Promise.all(pending.slice(0, beforeMenu));
    await downloadPage.locator('[data-do="practice"]').click();
    await expect(downloadPage.locator('#hud')).toBeVisible();
    await expect(downloadPage.locator('#loadingOverlay')).toHaveCount(0);
    await downloadPage.waitForLoadState('networkidle');
    await Promise.all(pending);
    await downloadPage.close();
    context.off('response', recordResponse);

    const page = await context.newPage();
    await page.goto('/?qa=1', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__capyQA);
    await page.evaluate(() => window.__capyQA!.start());
    await page.evaluate(async (quality: Preset) => { window.__capyQA!.actors(16); window.__capyQA!.quality(quality); await window.__capyQA!.pose('plaza'); }, preset);
    await page.waitForTimeout(500);
    const sample = await page.evaluate(async (ms) => {
      const intervals: number[] = [];
      const before = window.__capyQA!.stats().renderedFrames;
      window.__capyQA!.loop(true);
      await new Promise<void>(resolve => {
        let previous = 0, began = 0;
        const tick = (now: number) => {
          if (!began) began = now;
          if (previous) intervals.push(now - previous);
          previous = now;
          if (now - began >= ms) resolve(); else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      window.__capyQA!.loop(false);
      const sorted = [...intervals].sort((a, b) => a - b);
      const mean = intervals.reduce((sum, n) => sum + n, 0) / intervals.length;
      const p95 = sorted[Math.floor((sorted.length - 1) * .95)];
      const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
      const stats = window.__capyQA!.stats();
      const gl = document.querySelector<HTMLCanvasElement>('#game')?.getContext('webgl2');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      const gpuRenderer = gl ? String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : 'WebGL unavailable';
      return { avgFps: +(1000 / mean).toFixed(1), p95FrameMs: +p95.toFixed(1), p95Fps: +(1000 / p95).toFixed(1),
        maxFrameMs: +sorted.at(-1)!.toFixed(1), over50: intervals.filter(n => n > 50).length, frames: intervals.length,
        ...stats, renderedFrames: stats.renderedFrames - before, heapMB: heap == null ? null : +(heap / 1048576).toFixed(1), gpuRenderer };
    }, process.env.QA_SMOKE ? 1000 : 5000);
    expect(sample.frames).toBeGreaterThan(0);
    expect(sample.renderedFrames).toBeGreaterThan(sample.frames * .8);
    expect(sample.drawCalls).toBeGreaterThan(0);
    expect(sample.triangles).toBeGreaterThan(0);
    const sum = (set: Download[], key: 'bytes' | 'gzipBytes') => set.reduce((n, item) => n + item[key], 0);
    rows.push({ preset, sample, beforeMenu: sum(downloads.filter(item => item.phase === 'menu'), 'bytes'),
      beforeMenuGzip: sum(downloads.filter(item => item.phase === 'menu'), 'gzipBytes'),
      beforeMatch: sum(downloads, 'bytes'), beforeMatchGzip: sum(downloads, 'gzipBytes') });
    await context.close();
  }
  const output = resolve('tests/perf/results');
  await mkdir(output, { recursive: true });
  const report = { measuredAt: new Date().toISOString(), environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model,
    browser: browser.version(), gpuRenderer: rows[0]?.sample.gpuRenderer, viewport: '1280x720', deviceScaleFactor: 1,
    sampleMs: process.env.QA_SMOKE ? 1000 : 5000 }, rows };
  await writeFile(resolve(output, 'latest.json'), JSON.stringify(report, null, 2));
  const md = ['# QA performance measurement', '', `Measured: ${report.measuredAt}`, `Environment: ${report.environment.cpu}, ${report.environment.platform} ${report.environment.release}, Chromium ${report.environment.browser}, ${report.environment.gpuRenderer}, 1280×720`, '',
    '| Preset | Avg FPS | p95 frame ms | Max ms | >50 ms | Draw calls | Triangles | Heap MB | Menu gzip MB | Match raw MB |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map(r => `| ${r.preset} | ${r.sample.avgFps} | ${r.sample.p95FrameMs} | ${r.sample.maxFrameMs} | ${r.sample.over50} | ${r.sample.drawCalls} | ${r.sample.triangles} | ${r.sample.heapMB ?? 'n/a'} | ${(r.beforeMenuGzip / 1048576).toFixed(2)} | ${(r.beforeMatch / 1048576).toFixed(2)} |`), '',
    'FPS is derived from real requestAnimationFrame intervals while the renderer draws the frozen seeded practice scene. Download totals count same-origin response bodies through each milestone; menu gzip is a local gzip equivalent. Draw calls and triangles come from renderer.info, including shadow work.', ''];
  await writeFile(resolve(output, 'latest.md'), md.join('\n'));
});
