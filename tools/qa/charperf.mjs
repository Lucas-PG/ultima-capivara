// Frame timing of the QA plaza with N capybaras on the dev server (medium unless PRESET is set).
// node tools/qa/charperf.mjs [actors=16] [ms=5000]
import { chromium } from '@playwright/test';
const [count = '16', ms = '5000'] = process.argv.slice(2);
const base = process.env.BASE || 'http://127.0.0.1:5176';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.error('pageerror', e.message));
await page.goto(`${base}/?qa=1`);
await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 90000 });
await page.evaluate(() => window.__capyQA.start());
const result = await page.evaluate(async ([n, ms, preset, pose]) => {
  window.__capyQA.actors(n); window.__capyQA.quality(preset); await window.__capyQA.pose(pose);
  await new Promise(r => setTimeout(r, 800));
  const intervals = []; const before = window.__capyQA.stats().renderedFrames;
  window.__capyQA.loop(true);
  await new Promise(resolve => { let prev = 0, began = 0; const tick = now => { if (!began) began = now; if (prev) intervals.push(now - prev); prev = now; if (now - began >= ms) resolve(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  window.__capyQA.loop(false);
  const s = [...intervals].sort((a, b) => a - b), q = f => +s[Math.floor((s.length - 1) * f)].toFixed(1);
  const stats = window.__capyQA.stats();
  return { frames: intervals.length, p50: q(.5), p95: q(.95), max: q(1), drawCalls: stats.drawCalls, triangles: stats.triangles, rendered: stats.renderedFrames - before,
    heapMB: +((performance.memory?.usedJSHeapSize || 0) / 1048576).toFixed(1) };
}, [Number(count), Number(ms), process.env.PRESET || 'medium', process.env.POSE || 'plaza']);
console.log(JSON.stringify(result));
await browser.close();
