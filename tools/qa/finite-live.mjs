// Diagnostic plane/drop/glide scans using real practice simulation and ordinary input.
// Optional forced viewport densities exercise the shipped floor/ceiling transitions
// without changing simulation state. Readbacks are not performance measurements.
// BASE= BUILD= PRESETS=low,medium,high DPRS=1,2 DURATION=40 node tools/qa/finite-live.mjs <out.json> [shotsDir]
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadavg } from 'node:os';
import { installFiniteDiagnostics } from './finite-diagnostics.mjs';
import { startDriver, stopDriver } from '../../tests/perf/live-driver.mjs';
import { angle, browserName, captureRenderErrors, firefoxForceEGL, firefoxForceWebGL, launchRenderBrowser, throttleRenderPage, vulkanNative } from './render-browser.mjs';

const [out, shots] = process.argv.slice(2), env = process.env, base = env.BASE, build = env.BUILD;
if (!out || !base || !build) throw new Error('BASE, BUILD and an output path are required');
mkdirSync(dirname(out), { recursive: true }); if (shots) mkdirSync(shots, { recursive: true });
const rendererModule = readdirSync(join(build, 'assets')).find(name => /^renderer-.*\.js$/.test(name));
if (!rendererModule) throw new Error('Built renderer module missing');
const presets = (env.PRESETS || 'low,medium,high').split(','), dprs = (env.DPRS || '1,2').split(',').map(Number);
const ranges = { low: [.5, .75], medium: [.6, 1.25], high: [.75, 2] };
const rows = [], errors = [], hardware = [], cpuThrottle = Number(env.CPU_THROTTLE || 1), duration = Number(env.DURATION || 40);
let browser;
try { browser = await launchRenderBrowser(); }
catch (error) {
  writeFileSync(out, JSON.stringify({ measuredAt: new Date().toISOString(), base, build, browser: browserName, angle, firefoxForceWebGL, firefoxForceEGL, vulkanNative,
    startupError: error.message, hardware, errors, rows }, null, 2));
  throw error;
}
try {
  for (const dpr of dprs) for (const preset of presets) {
    const page = await browser.newPage({ viewport: { width: 1470, height: 956 }, deviceScaleFactor: dpr });
    captureRenderErrors(page, errors);
    await throttleRenderPage(page, cpuThrottle);
    await page.addInitScript(graphics => localStorage.setItem('uc-v2-settings', JSON.stringify({ graphics, graphicsChosen: true, frameLimit: 60 })), preset);
    await page.goto(`${base}/?networkQa=1&calm`);
    await page.waitForFunction(() => !!window.__networkQA, null, { timeout: 120_000 });
    await installFiniteDiagnostics(page, `${base}/assets/${rendererModule}`);
    await page.locator('[data-mode="battle-royale"]').click(); await page.locator('[data-do="practice"]').click();
    await page.waitForFunction(() => !!window.__finiteRenderer && !!window.__capivara?.inspect().snapshot && !window.__capivara.inspect().renderState.loading, null, { timeout: 180_000 });
    hardware.push({ preset, dpr, ...await page.evaluate(() => window.__finiteHardware()) });
    await page.evaluate(() => window.__networkQA.activate());
    await startDriver(page, { drop: { x: -8, z: -19 }, chuteAltitude: 75 });
    const seen = new Set(), [floor, limit] = ranges[preset], ceiling = Math.min(dpr, limit), minimum = Math.min(floor, ceiling);
    const transitions = [['ceiling', ceiling], ['floor', minimum], ['midpoint', (minimum + ceiling) / 2], ['ceiling-again', ceiling]];
    const started = Date.now(); let index = 0;
    while (Date.now() - started < duration * 1000) {
      const [transition, density] = transitions[index++ % transitions.length];
      const result = await page.evaluate(([density, force]) => {
        const renderer = window.__finiteRenderer, frame = window.__finiteFrame, inspect = window.__capivara.inspect();
        const me = inspect.snapshot.actors.find(actor => !actor.bot);
        if (force) {
          renderer.dynamicResolution.density = density;
          renderer.pipeline.setRenderSize(Math.round(1470 * density), Math.round(956 * density));
          renderer.update({ ...frame, dt: 0 });
        }
        return { phase: inspect.snapshot.phase, stage: me.stage, pos: me.pos, time: inspect.snapshot.time,
          renderDensity: renderer.renderDensity, ...window.__finiteRead() };
      }, [density, env.FORCE_TRANSITIONS !== '0']);
      const row = { preset, dpr, t: (Date.now() - started) / 1000, transition, density, load: loadavg(), ...result }; rows.push(row);
      if (!result.readings.world?.floating) throw new Error('World floating-point target was not read');
      const invalid = Object.values(result.readings).reduce((sum, reading) => sum + (reading.nonFinitePixels || 0), 0);
      const key = `${result.stage}-${transition}`;
      if (!seen.has(key) || invalid) {
        seen.add(key); console.log(JSON.stringify({ preset, dpr, stage: result.stage, transition, load: row.load[0], invalid }));
        if (shots) await page.screenshot({ path: join(shots, `${preset}-dpr${dpr}-${key}${invalid ? '-invalid' : ''}.png`), animations: 'disabled' });
      }
      if (result.stage === 'ground' && ['plane', 'falling', 'parachute'].every(stage => [...seen].some(key => key.startsWith(stage)))) break;
      await page.waitForTimeout(250);
    }
    await stopDriver(page); await page.close();
  }
} finally {
  writeFileSync(out, JSON.stringify({ measuredAt: new Date().toISOString(), base, build, browser: browserName, angle, firefoxForceWebGL, firefoxForceEGL, vulkanNative, version: browser.version(), cpuThrottle, viewport: { width: 1470, height: 956 },
    diagnostic: 'Live practice and ordinary input; original shader readbacks and optional forced viewport transitions, not frame-time samples',
    forceTransitions: env.FORCE_TRANSITIONS !== '0', hardware, errors, rows }, null, 2));
  await browser.close();
}
const failures = rows.filter(row => Object.values(row.readings).some(reading => reading.error || reading.nonFinitePixels));
const missingStages = [];
for (const preset of presets) for (const dpr of dprs) for (const stage of ['plane', 'falling', 'parachute']) {
  if (!rows.some(row => row.preset === preset && row.dpr === dpr && row.stage === stage)) missingStages.push({ preset, dpr, stage });
}
if (errors.length || failures.length || missingStages.length) { console.error(JSON.stringify({ invalidCases: failures.length, browserErrors: errors.length, missingStages })); process.exitCode = 1; }
