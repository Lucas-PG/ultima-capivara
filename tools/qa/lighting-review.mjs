// Identical cameras, deterministic stills and short frame samples at every preset.
// BASE=http://127.0.0.1:5176 node tools/qa/lighting-review.mjs <outDir>
// RANGE_ONLY=1 captures only the eye-level player distance checks.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const out = process.argv[2];
const views = {
  plaza: null,
  // The Capela stair seen from its foot (the old capela camera sat inside a roof).
  stair: [-36, 4.5, 72, -72, 15, 66, 65],
  vista: [-64, 17.5, 62, 20, 2, 10, 65],
  street: [-30, 3.82, -35.5, 30, 3.82, -35.5, 65],
  river: [70, 14, 30, 10, 3, 10, 65],
  engenho: [-91, 4.22, 24.5, -100, 3.5, 14, 65],
  palafitas: [80, 2.77, 80, 96, 2.5, 97, 65],
  sun: [0, 28, 120, -60, 60, 20, 65],
};
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', `--use-angle=${process.platform === 'darwin' ? 'metal' : 'gl-egl'}`] });
const rows = [], rangeRows = [], errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('uc-v2-settings', JSON.stringify({ reducedMotion: true })));
  await page.goto(`${process.env.BASE || 'http://127.0.0.1:5176'}/?qa=1`);
  await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 90000 });
  await page.evaluate(() => window.__capyQA.start());
  await page.addStyleTag({ content: '#app,#confetti,#flash{display:none!important}' });
  for (const quality of ['low', 'medium', 'high']) {
    await page.evaluate(q => window.__capyQA.quality(q), quality);
    for (const [name, view] of (process.env.RANGE_ONLY ? [] : Object.entries(views))) {
      await page.evaluate(v => { window.__camOverride = v ?? undefined; }, view);
      for (let i = 0; i < 3; i++) await page.evaluate(() => window.__capyQA.pose('plaza'));
      await page.screenshot({ path: `${out}/${quality}-${name}.jpg`, quality: 86 });
      const result = await page.evaluate(async () => {
        const intervals = []; let previous = 0;
        window.__capyQA.loop(true);
        await new Promise(resolve => {
          const frame = now => { if (previous) intervals.push(now - previous); previous = now;
            if (intervals.length >= 90) resolve(); else requestAnimationFrame(frame); };
          requestAnimationFrame(frame);
        });
        window.__capyQA.loop(false);
        intervals.sort((a, b) => a - b);
        return { ...window.__capyQA.stats(), p50: intervals[45], p95: intervals[85], p99: intervals[89], bench: await window.__capyQA.bench(40) };
      });
      rows.push({ quality, name, view, ...result }); console.log(quality, name, result.drawCalls, result.triangles, result.p50.toFixed(1), result.p95.toFixed(1), 'frame', result.bench.medianMs.toFixed(2), 'gpu', result.bench.gpuMedianMs?.toFixed(2), result.bench.gpuP90Ms?.toFixed(2));
    }
    // Eye-level silhouettes at known distances along Rua Direita.
    for (const distance of [20, 40, 60]) {
      await page.evaluate(d => {
        window.__capyQA.actors(2, [{ x: -30 + d, z: -35.5 }]);
        window.__camOverride = [-30, 3.82, -35.5, 30, 3.82, -35.5, 65];
      }, distance);
      for (let i = 0; i < 3; i++) await page.evaluate(() => window.__capyQA.pose('plaza'));
      await page.screenshot({ path: `${out}/${quality}-range-${distance}.jpg`, quality: 90 });
      rangeRows.push({ quality, distance, camera: [-30, 3.82, -35.5, 30, 3.82, -35.5, 65], actor: [-30 + distance, -35.5] });
    }
    await page.evaluate(() => window.__capyQA.actors(1));
  }
} finally { await browser.close(); }
writeFileSync(`${out}/metrics.json`, JSON.stringify({ viewport: [1280, 720], views, errors, rows, rangeRows }, null, 2) + '\n');
if (errors.length) throw new Error(errors.join('\n'));
