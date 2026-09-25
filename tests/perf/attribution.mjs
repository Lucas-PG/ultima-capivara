import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const [label, url] = process.argv.slice(2);
if (!label || !url) throw new Error('Usage: node tests/perf/attribution.mjs <label> <url>');
const target = new URL(url);
target.searchParams.set('timing', '1');
const flags = ['--use-gl=angle', '--use-angle=metal', '--enable-precise-memory-info',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: flags });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.setDefaultTimeout(120_000);
await page.addInitScript(() => localStorage.setItem('uc-v2-settings', JSON.stringify({ graphics: 'medium', frameLimit: 60 })));
const errors = [], warnings = [];
page.on('pageerror', error => errors.push({ at: Date.now(), message: error.message }));
page.on('console', message => { if (['error', 'warning'].includes(message.type())) warnings.push({ at: Date.now(), type: message.type(), text: message.text() }); });
await page.route('**/src/main.ts*', async route => {
  const response = await route.fetch();
  let body = await response.text();
  const limit = 'const activeLimit = input.locked ? settings.frameLimit : ended ? 30 : 10;';
  const gate = 'if (input.locked || dirtyFrame || ended) {';
  if (!body.includes(limit) || !body.includes(gate)) throw new Error('Renderer gate changed; update attribution injection');
  body = body.replace(limit, 'const activeLimit = 60;').replace(gate, 'if (true) {');
  body += `\nconst __qaSamples = { raf: [], longTasks: [], closestInteraction: [], acceptSnapshot: [], soundUpdate: [], rendererUpdate: [], uiUpdate: [], equip: [] };
let __qaLastRaf = 0, __qaArmed = false;
const __qaSupported = globalThis.PerformanceObserver?.supportedEntryTypes ?? [];
const __qaObserverSupport = { longtask: __qaSupported.includes('longtask'), gc: __qaSupported.includes('gc') };
if (__qaObserverSupport.longtask) new PerformanceObserver(list => {
  for (const entry of list.getEntries()) __qaSamples.longTasks.push({ at: entry.startTime, ms: entry.duration,
    attribution: entry.attribution?.map(a => ({ name: a.name, entryType: a.entryType, containerType: a.containerType, containerName: a.containerName })) ?? [] });
}).observe({ type: 'longtask', buffered: true });
requestAnimationFrame(function __qaTick(now) {
  if (__qaLastRaf) __qaSamples.raf.push({ at: now, ms: now - __qaLastRaf });
  __qaLastRaf = now; requestAnimationFrame(__qaTick);
});
function __qaWrap(object, key, bucket) {
  const original = object[key];
  object[key] = function (...args) {
    const at = performance.now();
    try { return original.apply(this, args); }
    finally { __qaSamples[bucket].push({ at, ms: performance.now() - at }); }
  };
}
window.__qaAttribution = {
  graphics() { return settings.graphics; },
  observerSupport() { return __qaObserverSupport; },
  state() { return { frames: renderedFrames, screen: ui.screen, phase: snapshot?.phase, tick: snapshot?.tick,
    actors: snapshot?.actors.length, loading, readyToReveal, playing, pointerLocked: !!document.pointerLockElement,
    inputLocked: input.locked, stats: renderer?.stats }; },
  arm() {
    if (!renderer || !snapshot) throw new Error('Match not ready');
    if (__qaArmed) return;
    const originalClosest = closestInteraction;
    closestInteraction = function (...args) {
      const at = performance.now();
      try { return originalClosest.apply(this, args); }
      finally { __qaSamples.closestInteraction.push({ at, ms: performance.now() - at }); }
    };
    const originalAccept = acceptSnapshot;
    acceptSnapshot = function (...args) {
      const at = performance.now();
      try { return originalAccept.apply(this, args); }
      finally { __qaSamples.acceptSnapshot.push({ at, ms: performance.now() - at }); }
    };
    __qaWrap(sound, 'update', 'soundUpdate');
    __qaWrap(renderer, 'update', 'rendererUpdate');
    __qaWrap(renderer.weaponView, 'update', 'equip');
    __qaWrap(ui, 'update', 'uiUpdate');
    __qaArmed = true;
  },
  reset() { for (const entries of Object.values(__qaSamples)) entries.length = 0; __qaLastRaf = 0; },
  sample() { return { timeOrigin: performance.timeOrigin, now: performance.now(), state: this.state(),
    samples: Object.fromEntries(Object.entries(__qaSamples).map(([key, value]) => [key, [...value]])),
    timings: window.__capivara?.timings?.() ?? null }; },
};`;
  await route.fulfill({ response, body });
});

const summarize = list => {
  const ms = list.map(x => x.ms).sort((a, b) => a - b);
  return { count: ms.length, p95: +(ms[Math.floor((ms.length - 1) * .95)] || 0).toFixed(2),
    max: +(ms.at(-1) || 0).toFixed(2), over50: ms.filter(n => n > 50).length };
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await page.goto(target.href, { waitUntil: 'domcontentloaded' });
  if (await page.evaluate(() => window.__qaAttribution?.graphics()) !== 'medium') throw new Error('Medium preset was not applied');
  if (!(await page.evaluate(() => window.__capivara?.timings?.().enabled))) throw new Error('Native timing probe was not enabled');
  await page.locator('[data-do="practice"]').click();
  await page.waitForFunction(() => window.__qaAttribution?.state().frames > 10 && !window.__qaAttribution.state().loading,
    { timeout: 90_000 });
  await page.evaluate(() => { document.exitPointerLock?.(); window.__qaAttribution.arm(); window.__qaAttribution.reset(); });
  const preflightStart = await page.evaluate(() => window.__qaAttribution.state());
  await sleep(10_000);
  const preflightEnd = await page.evaluate(() => window.__qaAttribution.state());
  if (preflightEnd.frames - preflightStart.frames < 500) throw new Error('Active renderer preflight failed: fewer than 500 frames in 10 seconds');
  const segments = [];
  for (let segment = 1; segment <= 6; segment++) {
    await page.evaluate(() => { window.__qaAttribution.reset(); window.__capivara.resetPerf(); });
    const before = await page.evaluate(() => window.__qaAttribution.state());
    await sleep(30_000);
    const data = await page.evaluate(() => window.__qaAttribution.sample());
    const frames = data.state.frames - before.frames;
    if (frames < 1500) throw new Error('Active renderer assertion failed in segment ' + segment + ': ' + frames);
    if (data.timings.droppedSpans || data.timings.droppedTasks) throw new Error('Native timing ring lost entries in segment ' + segment);
    segments.push({ segment, before, frames, ...data });
  }
  const gpu = await page.evaluate(() => {
    const gl = document.querySelector('#game')?.getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return { vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl?.getParameter(gl.VENDOR),
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) };
  });
  const observerSupport = await page.evaluate(() => window.__qaAttribution.observerSupport());
  const summary = segments.map(row => ({ segment: row.segment, before: row.before, after: row.state, frames: row.frames,
    methods: Object.fromEntries(Object.entries(row.samples).map(([key, list]) => [key, summarize(list)])),
    gaps: row.samples.raf.filter(x => x.ms > 50), longTasks: row.samples.longTasks,
    nativeTiming: { enabled: row.timings.enabled, spans: row.timings.spans.length,
      longTasks: row.timings.longTasks.length, droppedSpans: row.timings.droppedSpans, droppedTasks: row.timings.droppedTasks } }));
  const output = { label, url: target.href, at: new Date().toISOString(), browserChannel: 'chrome', browser: browser.version(), gpu,
    viewport: '1280x720', graphicsPreset: 'medium', launchFlags: flags, forcedRendering: true, observerSupport,
    segmentMs: 30000, errors, warnings, preflight: { before: preflightStart, after: preflightEnd }, summary, segments };
  const file = '/Users/lucas_gaspe/dev/capivara-team/reviews/forja-' + label + '-attribution.json';
  await writeFile(file, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ file, label, gpu, errors, warnings, preflightFrames: preflightEnd.frames - preflightStart.frames, summary }));
} finally { await browser.close(); }
