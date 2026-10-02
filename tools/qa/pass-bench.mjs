// GPU cost per render pass and per scene group at real resolution, on the QA poses (VITE_QA=1 build, served).
// Every pass is timed alone on an idle GPU (timer queries after a sync), so the numbers add up to a frame.
// node tools/qa/pass-bench.mjs <out.json> [shotsDir]
//   BASE=http://127.0.0.1:4187  PRESETS=low,medium,high  POSES=fp-m4,plaza16,...  AB=terrain,vegetation,...  W=1470 H=956 DPR=2
//   SETTINGS='{"renderScale":1}' (extra saved settings)  FRAMES=24  DENSITY=1 (override the presets' pixel ratio cap)
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadavg } from 'node:os';

const [out, shots] = process.argv.slice(2);
if (!out) throw new Error('Usage: node tools/qa/pass-bench.mjs <out.json> [shotsDir]');
mkdirSync(dirname(out), { recursive: true });
if (shots) mkdirSync(shots, { recursive: true });
const env = process.env, base = env.BASE || 'http://127.0.0.1:4187', frames = Number(env.FRAMES || 24);
const width = Number(env.W || 1470), height = Number(env.H || 956), dpr = Number(env.DPR || 2);
const presets = (env.PRESETS || 'low,medium,high').split(',');
// name: [QA pose, capybaras, camera override from wide-views.json]
const POSES = {
  'fp-m4': ['fp-m4', 1], 'fp-shotgun': ['fp-shotgun', 1], 'fp-sniper-ads': ['ads-dmr', 1], plaza16: ['plaza', 16], vilaStreet: ['vilaStreet', 1],
  morroStreet: ['morroStreet', 1], porto: ['district-porto', 1], crowd: ['capyFront', 12], plane: ['plaza', 1, 'plane'], fight: ['cocoBlast', 8],
  morroRoofs: ['morroRoofs', 1], praia: ['district-praia', 1], capela: ['district-capela', 1],
};
const poses = (env.POSES || Object.keys(POSES).join(',')).split(',');
const thermal = () => { if (process.platform !== 'darwin') return null; try { return Number(execSync('notifyutil -g com.apple.system.thermalpressurelevel').toString().trim().split(/\s+/).pop()); } catch { return null; } };
const wide = JSON.parse((await import('node:fs')).readFileSync(new URL('./wide-views.json', import.meta.url), 'utf8'));

const browser = await chromium.launch({ headless: env.HEADED !== '1', channel: 'chrome',
  args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=gl-egl', '--enable-precise-memory-info', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--window-size=${width},${height + 90}`] });
const rows = [];
let gpuName;
try {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
  await context.addInitScript(extra => {
    const saved = JSON.parse(localStorage.getItem('uc-v2-settings') || '{}');
    localStorage.setItem('uc-v2-settings', JSON.stringify({ ...saved, frameLimit: 60, ...extra }));
  }, JSON.parse(env.SETTINGS || '{}'));
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(env.CPU_THROTTLE || 1) });
  page.on('pageerror', error => console.error('pageerror', error.message));
  await page.goto(`${base}/?qa=1&gpu=1`);
  await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 120_000 });
  await page.evaluate(() => window.__capyQA.start());
  gpuName = await page.evaluate(() => {
    const gl = document.querySelector('#game').getContext('webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER)), timerQuery: !!gl.getExtension('EXT_disjoint_timer_query_webgl2') };
  });
  await page.addStyleTag({ content: '#confetti,#flash{display:none!important}' });
  if (env.DENSITY) await page.evaluate(d => window.__capyQA.density(d), Number(env.DENSITY));
  for (const preset of presets) {
    await page.evaluate(q => window.__capyQA.quality(q), preset);
    for (const name of poses) {
      const [pose, actors, camera] = POSES[name];
      await page.evaluate(([view]) => { window.__camOverride = view ?? undefined; }, [camera ? wide[camera] : null]);
      // Two poses settle LOD, far batches and ground cover before measuring.
      for (let i = 0; i < 2; i++) await page.evaluate(async ([p, n]) => { window.__capyQA.actors(n); await window.__capyQA.pose(p); }, [pose, actors]);
      // Re-applying the preset resets the dynamic resolution to the preset's own scale.
      await page.evaluate(q => window.__capyQA.quality(q), preset);
      await page.waitForTimeout(300);
      const bench = await page.evaluate(n => window.__capyQA.bench(n), frames);
      const passes = await page.evaluate(n => window.__capyQA.passes(n), frames);
      const stats = await page.evaluate(() => ({ ...window.__capyQA.stats(), buffer: [document.querySelector('#game').width, document.querySelector('#game').height] }));
      const attribution = [];
      for (const toggle of (env.AB || '').split(',').filter(Boolean)) {
        const result = await page.evaluate(([t, n]) => window.__capyQA.ab(t, n, 5), [toggle, Math.max(6, frames >> 1)]);
        attribution.push(result); console.log('   ', name, toggle, `${result.costMs} ms of ${result.baseMs}`, JSON.stringify(result.rounds));
      }
      if (shots) await page.screenshot({ path: `${shots}/${preset}-${name}.png` });
      const churn = await page.evaluate(() => window.__capyQA.programChurn(12));
      const row = { preset, name, pose, actors, camera: camera ?? null, load: loadavg()[0], thermal: thermal(), bench, passes, stats, attribution, churn };
      rows.push(row);
      console.log(preset.padEnd(7), name.padEnd(14), `frame ${bench.medianMs.toFixed(1)} ms gpu ${bench.gpuMedianMs?.toFixed(1)} ms`,
        `passes ${passes.total.mean.toFixed(1)} ms`, Object.entries(passes.passes).map(([k, v]) => `${k} ${v.mean.toFixed(1)}`).join(' '),
        `draws ${stats.drawCalls} tris ${(stats.triangles / 1e6).toFixed(2)}M buffer ${stats.buffer.join('x')} thermal ${row.thermal}`);
    }
  }
  await page.evaluate(() => { window.__camOverride = undefined; });
} finally {
  writeFileSync(out, JSON.stringify({ measuredAt: new Date().toISOString(), base, viewport: { width, height, dpr }, gpu: gpuName, cpuThrottle: Number(env.CPU_THROTTLE || 1), frames, rows }, null, 1));
  await browser.close();
}
