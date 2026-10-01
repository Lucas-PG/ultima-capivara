// Real play conditions: a QA production build (VITE_QA=1 npm run build, served by vite preview), a headed
// Chrome window at 1470x956 CSS pixels with deviceScaleFactor 2 (ANGLE Metal), a live practice match with
// bots driven through the real input layer, sustained. Records display frame intervals, GPU time per pass
// (timer queries), CPU spans, heap, GC pauses, the machine load and the thermal pressure next to every sample.
//
// node tools/qa/real-perf.mjs <out.json>
//   BASE=http://127.0.0.1:4187  QUALITY=low|medium|high  MODE=battle-royale|deathmatch  DURATION=300
//   GPU=1 (timer queries, default on)  TIMING=1 (CPU spans, default on)  HEADED=1 (a visible window; default headless)  W=1470 H=956 DPR=2
//   TRACE_AT=60,240 (10 s GC traces at those match seconds)  SETTINGS='{"renderScale":1}' (extra saved settings)
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadavg } from 'node:os';
import { startDriver, stopDriver } from '../../tests/perf/live-driver.mjs';

const out = process.argv[2];
if (!out) throw new Error('Usage: node tools/qa/real-perf.mjs <out.json>');
mkdirSync(dirname(out), { recursive: true });
const env = process.env;
const base = env.BASE || 'http://127.0.0.1:4187', quality = env.QUALITY || 'medium', mode = env.MODE || 'deathmatch';
const seconds = Number(env.DURATION || 300), width = Number(env.W || 1470), height = Number(env.H || 956), dpr = Number(env.DPR || 2);
const gpu = env.GPU !== '0', timingOn = env.TIMING !== '0';
const traceAt = (env.TRACE_AT ?? '60').split(',').filter(Boolean).map(Number);
const profileAt = (env.PROFILE_AT ?? '').split(',').filter(Boolean).map(Number);
const allocAt = (env.ALLOC_AT ?? '').split(',').filter(Boolean).map(Number);
const extraSettings = JSON.parse(env.SETTINGS || '{}');

const thermal = () => { try { return Number(execSync('notifyutil -g com.apple.system.thermalpressurelevel').toString().trim().split(/\s+/).pop()); } catch { return null; } };
const machine = () => ({ load: loadavg().map(n => +n.toFixed(2)), thermal: thermal() });

const browser = await chromium.launch({ headless: env.HEADED !== '1', channel: 'chrome',
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-precise-memory-info', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--window-size=${width},${height + 90}`] });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
  await context.addInitScript(([graphics, extra]) => {
    const saved = JSON.parse(localStorage.getItem('uc-v2-settings') || '{}');
    localStorage.setItem('uc-v2-settings', JSON.stringify({ ...saved, graphics, frameLimit: 60, ...extra }));
    // Display cadence from an independent rAF loop, stored without allocating per frame.
    const times = new Float64Array(1 << 20); let count = 0;
    const tick = now => { if (count < times.length) times[count++] = now; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    window.__rafTimes = { read(from) { return Array.from(times.subarray(from, count)); }, get count() { return count; } };
  }, [quality, extraSettings]);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const query = `networkQa=1&calm${gpu ? '&gpu=1' : ''}${timingOn ? '&timing=1' : ''}`;
  await page.goto(`${base}/?${query}`);
  await page.locator('[data-do="practice"]').waitFor({ timeout: 120_000 });
  const menuMs = await page.evaluate(() => performance.now());
  await page.locator(`[data-mode="${mode}"]`).click();
  const clickAt = await page.evaluate(() => performance.now());
  await page.locator('[data-do="practice"]').click();
  await page.waitForFunction(() => { const i = window.__capivara?.inspect(); return i?.snapshot && !i.renderState.loading; }, null, { timeout: 180_000 });
  const firstFrameMs = await page.evaluate(start => performance.now() - start, clickAt);
  const gpuName = await page.evaluate(() => {
    const gl = document.querySelector('#game').getContext('webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER)), drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      timerQuery: !!gl.getExtension('EXT_disjoint_timer_query_webgl2') };
  });
  await page.evaluate(() => { window.__networkQA.activate(); window.__networkQA.key('KeyH', true); window.__networkQA.key('KeyH', false); });

  // The driver plays inside the page at 20 Hz through the real input layer (no health, damage or time overrides).
  await startDriver(page);

  const cdp = await context.newCDPSession(page);
  const started = Date.now(), samples = [], gcTraces = [];
  let rafFrom = await page.evaluate(() => window.__rafTimes.count), lastRendered = await page.evaluate(() => window.__capivara.inspect().renderedFrames);
  await page.evaluate(() => { window.__capivara.resetPerf(); window.__capivara.gpu(true); });
  const traced = new Set(), profiled = new Set(), profiles = [], sampledAlloc = new Set(), allocations = [];
  while ((Date.now() - started) / 1000 < seconds) {
    await page.waitForTimeout(1000);
    const elapsed = (Date.now() - started) / 1000;
    const sample = await page.evaluate(from => {
      const times = window.__rafTimes.read(from), i = window.__capivara.inspect(), s = i.snapshot, me = s?.actors.find(a => !a.bot);
      const spans = {}, t = window.__capivara.timings();
      for (const span of t.spans) (spans[span.name] ||= []).push(span.duration);
      window.__capivara.resetPerf();
      const heap = performance.memory?.usedJSHeapSize;
      return { times, rendered: i.renderedFrames, phase: s?.phase, stage: me?.stage, alive: me?.alive, mode: s?.config.mode, actors: s?.actors.length,
        alivePlayers: s?.actors.filter(a => a.alive).length, pos: me && { x: +me.pos.x.toFixed(1), y: +me.pos.y.toFixed(1), z: +me.pos.z.toFixed(1) },
        stats: i.renderer, density: i.renderDensity, gpuEstimate: i.gpuEstimate, gpu: window.__capivara.gpu(true), spans, longTasks: t.longTasks.map(task => Math.round(task.duration)),
        heapMB: heap ? +(heap / 1048576).toFixed(1) : null, drawingBuffer: (() => { const c = document.querySelector('#game'); return [c.width, c.height]; })() };
    }, rafFrom);
    rafFrom += sample.times.length;
    const intervals = []; for (let k = 1; k < sample.times.length; k++) intervals.push(+(sample.times[k] - sample.times[k - 1]).toFixed(2));
    const cpu = {}; for (const [name, values] of Object.entries(sample.spans)) cpu[name] = { n: values.length, sum: +values.reduce((a, b) => a + b, 0).toFixed(2), max: +Math.max(...values).toFixed(2) };
    samples.push({ t: +elapsed.toFixed(1), ...machine(), intervals, renderedFrames: sample.rendered - lastRendered, phase: sample.phase, stage: sample.stage, alive: sample.alive,
      alivePlayers: sample.alivePlayers, pos: sample.pos, draws: sample.stats?.drawCalls, triangles: sample.stats?.triangles, density: sample.density, gpuEstimate: sample.gpuEstimate, gpu: sample.gpu, cpu, longTasks: sample.longTasks, heapMB: sample.heapMB, drawingBuffer: sample.drawingBuffer });
    lastRendered = sample.rendered;
    if (samples.length % Number(env.LOG_EVERY || 30) === 0) console.log(JSON.stringify({ t: Math.round(elapsed), phase: sample.phase, stage: sample.stage, thermal: samples.at(-1).thermal, load: samples.at(-1).load[0],
      fps: +(samples.slice(-30).reduce((a, s) => a + s.renderedFrames, 0) / 30).toFixed(1), density: sample.density, gpu: sample.gpuEstimate && +sample.gpuEstimate.toFixed(1), buffer: sample.drawingBuffer }));
    if (sample.phase === 'results') { console.log('match reached results at', Math.round(elapsed), 's'); break; }
    // PROFILE_AT: a 6 s main-thread CPU profile, summarised by self time per function.
    const profileDue = profileAt.find(at => elapsed >= at && !profiled.has(at));
    if (profileDue !== undefined) {
      profiled.add(profileDue);
      await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
      await page.waitForTimeout(6000);
      const { profile } = await cdp.send('Profiler.stop');
      const self = new Map(), dt = profile.timeDeltas, byId = new Map(profile.nodes.map(n => [n.id, n]));
      let total = 0;
      profile.samples.forEach((id, i) => { const f = byId.get(id).callFrame, key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}:${f.columnNumber + 1}`; self.set(key, (self.get(key) || 0) + dt[i] / 1000); total += dt[i] / 1000; });
      const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => [k, +v.toFixed(1)]);
      profiles.push({ at: profileDue, totalMs: Math.round(total), top });
      console.log('profiled', profileDue, JSON.stringify(top.slice(0, 12)));
    }
    // ALLOC_AT: 10 s of allocation sampling, the collected garbage included, summarised by function.
    const allocDue = allocAt.find(at => elapsed >= at && !sampledAlloc.has(at));
    if (allocDue !== undefined) {
      sampledAlloc.add(allocDue);
      await cdp.send('HeapProfiler.enable');
      const before = await page.evaluate(() => window.__capivara.inspect().renderedFrames);
      await cdp.send('HeapProfiler.startSampling', { samplingInterval: 8192, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      await page.waitForTimeout(10_000);
      const { profile } = await cdp.send('HeapProfiler.stopSampling');
      const frames = (await page.evaluate(() => window.__capivara.inspect().renderedFrames)) - before;
      const self = new Map();
      const walk = node => { const f = node.callFrame, key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}:${f.columnNumber + 1}`;
        self.set(key, (self.get(key) || 0) + node.selfSize); for (const child of node.children) walk(child); };
      walk(profile.head);
      const total = [...self.values()].reduce((a, b) => a + b, 0);
      const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => [k, +(v / Math.max(1, frames) / 1024).toFixed(2)]);
      allocations.push({ at: allocDue, frames, kbPerFrame: +(total / Math.max(1, frames) / 1024).toFixed(1), top });
      console.log('allocations', allocDue, (total / Math.max(1, frames) / 1024).toFixed(1), 'KB/frame', JSON.stringify(top.slice(0, 12)));
    }
    const due = traceAt.find(at => elapsed >= at && !traced.has(at));
    if (due !== undefined) {
      traced.add(due);
      const events = [];
      cdp.on('Tracing.dataCollected', ({ value }) => { for (const event of value) if (/GC|Scavenge|MarkCompact/i.test(event.name) && event.dur) events.push({ name: event.name, ms: event.dur / 1000, ts: event.ts, tid: event.tid }); });
      await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'v8', 'disabled-by-default-v8.gc'] }, transferMode: 'ReportEvents' });
      await page.waitForTimeout(10_000);
      const done = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
      await cdp.send('Tracing.end'); await done;
      cdp.removeAllListeners('Tracing.dataCollected');
      const byName = {}; for (const event of events) { const entry = byName[event.name] ||= { n: 0, total: 0, max: 0 }; entry.n++; entry.total += event.ms; entry.max = Math.max(entry.max, event.ms); }
      gcTraces.push({ at: due, seconds: 10, byName });
    }
  }
  const resources = await page.evaluate(() => window.__capivara.resources());
  await stopDriver(page);
  writeFileSync(out, JSON.stringify({ measuredAt: new Date().toISOString(), base, quality, mode, seconds, viewport: { width, height, dpr }, gpu: gpuName,
    gpuTiming: gpu, cpuTiming: timingOn, headless: env.HEADED !== '1', settings: extraSettings, menuMs: Math.round(menuMs), firstFrameMs: Math.round(firstFrameMs), errors, resources, gcTraces, profiles, allocations, samples }));
  console.log('wrote', out);
} finally { await browser.close(); }
