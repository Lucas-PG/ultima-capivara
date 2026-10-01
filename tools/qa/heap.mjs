// Heap after loading the island in the QA plaza pose, with a forced GC for comparability.
// node tools/qa/heap.mjs [base]   (prints MB and the largest retained constructors)
import { chromium } from '@playwright/test';
const base = process.argv[2] || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`${base}/?qa=1`);
await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 90000 });
await page.evaluate(() => window.__capyQA.start());
await page.evaluate(() => window.__capyQA.pose('plaza'));
await page.waitForTimeout(3000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.collectGarbage');
const used = await page.evaluate(() => performance.memory.usedJSHeapSize);
console.log('usedJSHeapSize MB', (used / 1048576).toFixed(1));
if (process.env.SNAPSHOT) {
  let chunks = '';
  cdp.on('HeapProfiler.addHeapSnapshotChunk', e => { chunks += e.chunk; });
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  const snap = JSON.parse(chunks), meta = snap.snapshot.meta, F = meta.node_fields.length;
  const nameI = meta.node_fields.indexOf('name'), sizeI = meta.node_fields.indexOf('self_size'), typeI = meta.node_fields.indexOf('type');
  const types = meta.node_types[typeI], by = new Map();
  for (let i = 0; i < snap.nodes.length; i += F) {
    const key = `${types[snap.nodes[i + typeI]]}:${snap.strings[snap.nodes[i + nameI]].slice(0, 40)}`;
    by.set(key, (by.get(key) || 0) + snap.nodes[i + sizeI]);
  }
  for (const [k, v] of [...by].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log((v / 1048576).toFixed(1).padStart(7), k);
}
await browser.close();
