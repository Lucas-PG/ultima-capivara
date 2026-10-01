// node tools/qa/alloc-probe.mjs  (BASE, MODE, SECONDS): allocation sampling over a live practice match, by function.
// Allocation sampling over a live practice match: which functions produce the garbage.
import { chromium } from '@playwright/test';
const base = process.env.BASE || 'http://127.0.0.1:5173', mode = process.env.MODE || 'deathmatch', seconds = Number(process.env.SECONDS || 15);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
try {
  const page = await browser.newPage({ viewport: { width: Number(process.env.W || 1280), height: Number(process.env.H || 720) }, deviceScaleFactor: Number(process.env.DPR || 1) });
  await page.goto(`${base}/?networkQa=1&calm`);
  await page.locator(`[data-mode="${mode}"]`).click();
  await page.locator('[data-do="practice"]').click();
  await page.waitForFunction(() => { const s = window.__capivara?.inspect(); return s?.snapshot?.phase === 'playing' && !s.renderState.loading && s.snapshot.actors.find(a => !a.bot)?.stage === 'ground'; }, null, { timeout: 120000 });
  await page.evaluate(() => window.__networkQA.activate());
  await page.waitForTimeout(3000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  const heapBefore = await page.evaluate(() => performance.memory?.usedJSHeapSize);
  // Include what the collectors already freed: the garbage is what causes the pauses.
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 16384, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  // Walk and turn so the frame does real work.
  await page.evaluate(() => { window.__networkQA.key('KeyW', true); });
  const frames0 = await page.evaluate(() => window.__capivara.inspect().renderedFrames);
  for (let i = 0; i < seconds; i++) { await page.evaluate(i => window.__networkQA.look(i * .7, 0), i); await page.waitForTimeout(1000); }
  const frames1 = await page.evaluate(() => window.__capivara.inspect().renderedFrames);
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  const self = new Map();
  const walk = (node, stack) => { const f = node.callFrame, name = `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/').replace(/\?.*$/, '')}:${f.lineNumber + 1}`;
    self.set(name, (self.get(name) || 0) + node.selfSize); for (const c of node.children) walk(c, stack); };
  walk(profile.head, []);
  const total = [...self.values()].reduce((a, b) => a + b, 0), frames = frames1 - frames0;
  console.log(`sampled ${(total / 1048576).toFixed(1)} MB over ${frames} frames (${(total / frames / 1024).toFixed(1)} KB/frame)`);
  for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log((v / 1048576).toFixed(2).padStart(7), 'MB', (v / frames / 1024).toFixed(1).padStart(6), 'KB/f', k);
} finally { await browser.close(); }
