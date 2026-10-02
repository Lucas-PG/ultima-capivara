// Frozen, interleaved baseline/candidate samples in one Chrome browser.
// BEFORE=http://127.0.0.1:5193/before AFTER=http://127.0.0.1:5193
// PRESETS=low,medium,high POSES=plaza16,crowd,fight FRAMES=72 ROUNDS=2 CPU_THROTTLE=4
// node tools/qa/paired-pass-bench.mjs <out.json>
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { cpus, freemem, loadavg, totalmem } from 'node:os';

const out = process.argv[2], env = process.env;
if (!out || !env.BEFORE || !env.AFTER) throw new Error('BEFORE, AFTER and an output path are required');
mkdirSync(dirname(out), { recursive: true });
const frames = Number(env.FRAMES || 72), rounds = Number(env.ROUNDS || 2), cpuThrottle = Number(env.CPU_THROTTLE || 4);
const viewport = { width: Number(env.W || 1470), height: Number(env.H || 956), dpr: Number(env.DPR || 2) };
const seed = Number(env.SEED || 20261002), presets = (env.PRESETS || 'low,medium,high').split(',');
const poses = (env.POSES || 'fp-m4,plaza16,vilaStreet,crowd,plane,fight').split(',');
const wide = JSON.parse(readFileSync(new URL('./wide-views.json', import.meta.url), 'utf8'));
const views = { 'fp-m4': ['fp-m4', 1], plaza16: ['plaza', 16], vilaStreet: ['vilaStreet', 1],
  crowd: ['capyFront', 12], plane: ['plaza', 1, wide.plane], fight: ['cocoBlast', 8] };
const cases = env.CASES ? env.CASES.split(',').map(item => item.split(':')) : presets.flatMap(preset => poses.map(name => [preset, name]));
for (const [preset, name] of cases) if (!['low', 'medium', 'high'].includes(preset) || !views[name]) throw new Error(`Unknown case ${preset}:${name}`);
const machineSample = () => ({ measuredAt: new Date().toISOString(), load: loadavg(), freeMemoryMB: Math.round(freemem() / 1048576),
  cpuTimes: cpus().map(cpu => cpu.times), processes: execFileSync('ps', ['-eo', 'pid,ppid,stat,pcpu,comm', '--sort=-pcpu'], { encoding: 'utf8' }).split('\n').slice(0, 21) });
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle',
  process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=gl-egl', '--enable-precise-memory-info',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const rows = [], errors = [], pages = {}, startedAt = new Date().toISOString();
let gpu;
try {
  for (const [variant, base] of [['before', env.BEFORE], ['after', env.AFTER]]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.dpr });
    await context.addInitScript(value => {
      let state = value >>> 0;
      Math.random = () => { state = Math.imul(state ^ (state >>> 16), 2246822507); state = Math.imul(state ^ (state >>> 13), 3266489909); state ^= state >>> 16; return (state >>> 0) / 4294967296; };
      localStorage.setItem('uc-onboarded', '1');
      localStorage.setItem('uc-v2-settings', JSON.stringify({ frameLimit: 60, renderScale: 'auto' }));
    }, seed);
    const page = await context.newPage(); pages[variant] = page;
    const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
    page.on('pageerror', error => { errors.push({ variant, error: error.message }); console.error(variant, error.message); });
    await page.goto(`${base.replace(/\/$/, '')}/?qa=1&gpu=1`);
    await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 120_000 });
    await page.evaluate(async () => { await window.__capyQA.start(); window.__capyQA.loop(false); });
    await page.addStyleTag({ content: '#confetti,#flash{display:none!important}' });
    if (!gpu) gpu = await page.evaluate(() => {
      const gl = document.querySelector('#game').getContext('webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info');
      return { renderer: String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER)), timerQuery: !!gl.getExtension('EXT_disjoint_timer_query_webgl2') };
    });
  }
  for (const [preset, name] of cases) {
    const [pose, actors, camera] = views[name];
    for (const page of Object.values(pages)) {
      await page.bringToFront();
      await page.evaluate(q => window.__capyQA.quality(q), preset);
      await page.evaluate(view => { window.__camOverride = view ?? undefined; }, camera);
      for (let i = 0; i < 2; i++) await page.evaluate(async ([view, count]) => { window.__capyQA.actors(count); await window.__capyQA.pose(view); }, [pose, actors]);
      await page.evaluate(q => window.__capyQA.quality(q), preset);
      await page.waitForTimeout(150);
      await page.evaluate(() => window.__capyQA.bench(12));
    }
    const samples = [];
    for (let round = 0; round < rounds; round++) for (const variant of ['before', 'after', 'after', 'before']) {
      const page = pages[variant]; await page.bringToFront();
      const machineBefore = machineSample();
      const bench = await page.evaluate(n => window.__capyQA.bench(n), frames);
      const machineAfter = machineSample();
      const state = await page.evaluate(() => ({ ...window.__capyQA.stats(), density: window.__capivara.inspect().renderDensity,
        buffer: [document.querySelector('#game').width, document.querySelector('#game').height] }));
      samples.push({ round, variant, bench, state, machineBefore, machineAfter });
      console.log(preset, name, round, variant, bench.medianMs.toFixed(2), 'ms', 'load', machineAfter.load[0].toFixed(2), 'density', state.density);
    }
    const churn = {};
    for (const [variant, page] of Object.entries(pages)) {
      await page.bringToFront();
      churn[variant] = await page.evaluate(() => window.__capyQA.programChurn(12));
    }
    // capyFront adds its close review bot to the requested crowd fixture.
    rows.push({ preset, name, pose, actors, actualActors: actors + (pose === 'capyFront' ? 1 : 0), camera: camera ?? null, samples, churn });
    writeFileSync(out, JSON.stringify({ startedAt, measuredAt: new Date().toISOString(), before: env.BEFORE, after: env.AFTER,
      viewport, gpu, chromeVersion: browser.version(), cpuThrottle, seed, frames, rounds, order: 'A-B-B-A', thermal: null,
      headless: true, densityPinnedBy: 'QA frame budget Infinity, shipped preset ceiling',
      measurementPurpose: env.PURPOSE || 'paired frozen frame cost',
      machine: { platform: process.platform, cpu: cpus()[0]?.model, logicalCpus: cpus().length, totalMemoryMB: Math.round(totalmem() / 1048576) }, rows, errors }, null, 1));
  }
} finally { await browser.close(); }
