// Browser input-to-next-paint timing in live practice Correria (VITE_QA=1 build, served), at real resolution.
// Trusted mouse presses (CDP Input.dispatchMouseEvent: the shot is predicted in the press handler, so
// its muzzle flash is in the next frame drawn) are timed by the browser's Event Timing API: from the
// browser event timestamp to the next reported paint after its handler ran (8 ms granularity,
// durations below 16 ms omitted). This does not measure a monitor or actual photon latency.
// Reported: input delay, handler time, and the remaining browser duration. The live bot driver
// keeps a real fight going around the shooter.
// node tools/qa/latency-probe.mjs <out.json>   BASE=  QUALITY=medium  DURATION=40  QUERY='&ctx=desync'  HEADED=1  SETTINGS='{}'
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadavg } from 'node:os';
import { startDriver, stopDriver } from '../../tests/perf/live-driver.mjs';

const out = process.argv[2];
if (!out) throw new Error('Usage: node tools/qa/latency-probe.mjs <out.json>');
mkdirSync(dirname(out), { recursive: true });
const env = process.env, base = env.BASE || 'http://127.0.0.1:4187', quality = env.QUALITY || 'medium', seconds = Number(env.DURATION || 40);
const cpuThrottle = Number(env.CPU_THROTTLE || 1), pinDensity = env.PIN_DENSITY === '1';
const browser = await chromium.launch({ headless: env.HEADED !== '1', channel: 'chrome',
  args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=gl-egl', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', ...(env.ARGS ? env.ARGS.split(' ') : [])] });
try {
  const context = await browser.newContext({ viewport: { width: 1470, height: 956 }, deviceScaleFactor: Number(env.DPR || 2) });
  await context.addInitScript(([graphics, extra]) => {
    localStorage.setItem('uc-v2-settings', JSON.stringify({ graphics, graphicsChosen: true, ...extra }));
    window.__eventTiming = [];
    new PerformanceObserver(list => { for (const entry of list.getEntries()) if (['mousedown', 'pointerdown'].includes(entry.name))
      window.__eventTiming.push({ name: entry.name, start: entry.startTime, processingStart: entry.processingStart, processingEnd: entry.processingEnd, duration: entry.duration }); })
      .observe({ type: 'event', durationThreshold: 16, buffered: true });
    const times = []; const tick = now => { times.push(now); requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    window.__rafTimes = times;
  }, [quality, JSON.parse(env.SETTINGS || '{}')]);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
  await page.goto(`${base}/?networkQa=1&calm${env.QUERY || ''}`);
  await page.waitForFunction(() => !!window.__networkQA);
  if (pinDensity) await page.evaluate(() => window.__networkQA.pinPresetDensity());
  await page.locator('[data-mode="deathmatch"]').click();
  await page.locator('[data-do="practice"]').click();
  await page.waitForFunction(() => { const i = window.__capivara?.inspect(); return i?.snapshot?.phase === 'playing' && !i.renderState.loading; }, null, { timeout: 180_000 });
  await page.evaluate(() => window.__networkQA.activate());
  const attributes = await page.evaluate(() => document.querySelector('#game').getContext('webgl2').getContextAttributes());
  await startDriver(page);
  await page.waitForTimeout(8000);
  await page.evaluate(() => { window.__eventTiming.length = 0; window.__rafTimes.length = 0; });
  const machineSamples = [], end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    machineSamples.push({ at: new Date().toISOString(), load: loadavg() });
    const x = 735 + (Math.random() - .5) * 40, y = 478 + (Math.random() - .5) * 40;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await page.waitForTimeout(40 + Math.random() * 30);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await page.waitForTimeout(250 + Math.random() * 200);
  }
  const result = await page.evaluate(() => ({ events: window.__eventTiming.filter(e => e.name === 'mousedown'), raf: window.__rafTimes.slice(),
    density: window.__capivara.inspect().renderDensity }));
  await stopDriver(page);
  const pct = (values, q) => { const s = [...values].sort((a, b) => a - b); return +(s[Math.min(s.length - 1, Math.floor(s.length * q))] ?? 0).toFixed(1); };
  const events = result.events, intervals = result.raf.slice(1).map((t, i) => t - result.raf[i]);
  const summary = { quality, query: env.QUERY || '', cpuThrottle, pinDensity, headless: env.HEADED !== '1', attributes: { alpha: attributes.alpha, desynchronized: attributes.desynchronized },
    presses: events.length, fps: +(1000 / (intervals.reduce((a, b) => a + b, 0) / Math.max(1, intervals.length))).toFixed(1), density: result.density,
    toNextPaint: { p50: pct(events.map(e => e.duration), .5), p90: pct(events.map(e => e.duration), .9), mean: +(events.reduce((a, e) => a + e.duration, 0) / Math.max(1, events.length)).toFixed(1) },
    inputDelay: { p50: pct(events.map(e => e.processingStart - e.start), .5), p90: pct(events.map(e => e.processingStart - e.start), .9) },
    handler: { p50: pct(events.map(e => e.processingEnd - e.processingStart), .5) },
    afterHandler: { p50: pct(events.map(e => e.start + e.duration - e.processingEnd), .5), p90: pct(events.map(e => e.start + e.duration - e.processingEnd), .9) },
    load: loadavg()[0], durationThreshold: 16, timingGranularity: 8 };
  writeFileSync(out, JSON.stringify({ ...summary, machineSamples, events }, null, 1));
  console.log(JSON.stringify(summary));
} finally { await browser.close(); }
