// Identical cameras, deterministic stills and short frame samples at every preset.
// BASE=http://127.0.0.1:5176 node tools/qa/lighting-review.mjs <outDir>
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const out = process.argv[2];
const views = {
  plaza: null,
  capela: [-72, 18, 66, -20, 3, 30, 65],
  river: [70, 14, 30, 10, 3, 10, 65],
  engenho: [-91, 4.22, 24.5, -100, 3.5, 14, 65],
  palafitas: [80, 2.77, 80, 96, 2.5, 97, 65],
  sun: [0, 28, 120, -60, 60, 20, 65],
};
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const rows = [], errors = [];
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
    for (const [name, view] of Object.entries(views)) {
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
        return { ...window.__capyQA.stats(), p50: intervals[45], p95: intervals[85], p99: intervals[89] };
      });
      rows.push({ quality, name, view, ...result }); console.log(quality, name, result.drawCalls, result.triangles, result.p50.toFixed(1), result.p95.toFixed(1));
    }
  }
} finally { await browser.close(); }
writeFileSync(`${out}/metrics.json`, JSON.stringify({ viewport: [1280, 720], views, errors, rows }, null, 2) + '\n');
if (errors.length) throw new Error(errors.join('\n'));
