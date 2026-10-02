// Read original floating-point pass outputs for NaN/Inf without replacing shaders.
// A QA fixture scans plane/drop/glide camera views at preset floors, ceilings and
// viewport transitions inside the same allocation. These readbacks are diagnostic
// interventions and must never be used as frame-time samples.
// BASE= BUILD= PRESETS=low,medium,high DPRS=1,2 node tools/qa/finite-output.mjs <out.json> [shotsDir]
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadavg } from 'node:os';
import { installFiniteDiagnostics } from './finite-diagnostics.mjs';
import { angle, browserName, captureRenderErrors, firefoxForceEGL, firefoxForceWebGL, launchRenderBrowser, throttleRenderPage, vulkanNative } from './render-browser.mjs';

const [out, shots] = process.argv.slice(2), env = process.env, base = env.BASE, build = env.BUILD;
if (!out || !base || !build) throw new Error('BASE, BUILD and an output path are required');
mkdirSync(dirname(out), { recursive: true }); if (shots) mkdirSync(shots, { recursive: true });
const rendererModule = readdirSync(join(build, 'assets')).find(name => /^renderer-.*\.js$/.test(name));
if (!rendererModule) throw new Error('Built renderer module missing');
const presets = (env.PRESETS || 'low,medium,high').split(','), dprs = (env.DPRS || '1,2').split(',').map(Number);
const ranges = { low: [.5, .75], medium: [.6, 1.25], high: [.75, 2] };
const cameras = {
  plane: ['plane', [-60, 95, -95, 10, 0, 10, 60], 80],
  drop: ['falling', [-4.5, 48, 5, -8, 5, -30, 60], 40],
  glide: ['parachute', [-4.5, 9, 1, -8, 10, -40, 60], 5],
  hill: ['parachute', [-22, 12, -14, -28, 19, -65, 60], 8],
};
const selected = (env.CAMERAS || Object.keys(cameras).join(',')).split(','), rows = [], errors = [], hardware = [], controls = [];
const cpuThrottle = Number(env.CPU_THROTTLE || 1);
let browser;
try { browser = await launchRenderBrowser(); }
catch (error) {
  writeFileSync(out, JSON.stringify({ measuredAt: new Date().toISOString(), base, build, browser: browserName, angle, firefoxForceWebGL, firefoxForceEGL, vulkanNative,
    startupError: error.message, hardware, controls, errors, rows }, null, 2));
  throw error;
}
try {
  for (const dpr of dprs) {
    const page = await browser.newPage({ viewport: { width: 1470, height: 956 }, deviceScaleFactor: dpr });
    await throttleRenderPage(page, cpuThrottle);
    captureRenderErrors(page, errors);
    await page.addInitScript(seed => {
      localStorage.setItem('uc-onboarded', '1'); let state = seed >>> 0;
      Math.random = () => { state = Math.imul(state ^ (state >>> 16), 2246822507); state = Math.imul(state ^ (state >>> 13), 3266489909); state ^= state >>> 16; return (state >>> 0) / 4294967296; };
    }, Number(env.SEED || 20261002));
    await page.goto(`${base}/?qa=1`);
    await page.waitForFunction(() => !!window.__capyQA, null, { timeout: 120_000 });
    await installFiniteDiagnostics(page, `${base}/assets/${rendererModule}`);
    await page.evaluate(() => {
      window.__finiteStarted = false;
      window.__capyQA.start().then(() => { window.__finiteStarted = true; }, error => { window.__finiteStartupError = String(error); });
    });
    await page.waitForFunction(() => window.__finiteStarted || window.__finiteStartupError, null, { timeout: 180_000 });
    const startupError = await page.evaluate(() => window.__finiteStartupError);
    if (startupError) throw new Error(startupError);
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: '#confetti,#flash{display:none!important}' });
    for (const preset of presets) {
      await page.evaluate(q => window.__capyQA.quality(q), preset);
      const [floor, limit] = ranges[preset], ceiling = Math.min(dpr, limit), minimum = Math.min(floor, ceiling);
      const transitions = [['ceiling', ceiling], ['floor', minimum], ['midpoint', (minimum + ceiling) / 2], ['ceiling-again', ceiling]];
      for (const camera of selected) {
        const [stage, view, altitude] = cameras[camera];
        await page.evaluate(view => { window.__camOverride = view; }, view);
        for (let i = 0; i < 2; i++) await page.evaluate(() => window.__capyQA.pose('plaza'));
        await page.evaluate(([stage, altitude]) => {
          const frame = structuredClone(window.__finiteFrame), snapshot = frame.snapshot, me = snapshot.actors.find(actor => actor.id === frame.playerId);
          snapshot.config.mode = 'battle-royale'; me.stage = stage; me.grounded = false; me.pos.y = altitude;
          me.velocity = { x: 0, y: stage === 'falling' ? -10 : -2, z: 0 }; frame.dt = 0;
          window.__finiteRenderer.update(frame);
        }, [stage, altitude]);
        if (!hardware.some(row => row.dpr === dpr)) hardware.push({ dpr, ...await page.evaluate(() => window.__finiteHardware()) });
        if (env.NEGATIVE_CONTROL === '1' && !controls.some(row => row.dpr === dpr)) controls.push({ dpr, ...await page.evaluate(() => window.__finiteNegativeControl()) });
        for (const [transition, density] of transitions) {
          const result = await page.evaluate(density => {
            const renderer = window.__finiteRenderer;
            renderer.dynamicResolution.density = density;
            renderer.pipeline.setRenderSize(Math.round(1470 * density), Math.round(956 * density));
            renderer.update(window.__finiteFrame);
            return window.__finiteRead();
          }, density);
          const row = { preset, dpr, camera, stage, transition, density, load: loadavg(), ...result }; rows.push(row);
          if (!result.readings.world?.floating) throw new Error('World floating-point target was not read');
          const invalid = Object.values(result.readings).reduce((sum, reading) => sum + (reading.nonFinitePixels || 0), 0);
          console.log(JSON.stringify({ preset, dpr, camera, transition, density, load: row.load[0], invalid }));
          if (shots) {
            // Let the compositor settle before the screenshot, as board-capture
            // does. The simulation, render frame and density stay frozen here.
            await page.waitForTimeout(250);
            await page.screenshot({ path: join(shots, `${preset}-dpr${dpr}-${camera}-${transition}.png`), animations: 'disabled' });
          }
        }
      }
    }
    await page.close();
  }
} finally {
  writeFileSync(out, JSON.stringify({ measuredAt: new Date().toISOString(), base, build, browser: browserName, angle, firefoxForceWebGL, firefoxForceEGL, vulkanNative, version: browser.version(), cpuThrottle, viewport: { width: 1470, height: 956 },
    diagnostic: 'Original shaders, floating target readbacks; synthetic QA stages, not live performance samples', hardware, controls, errors, rows }, null, 2));
  await browser.close();
}
const failures = rows.filter(row => Object.values(row.readings).some(reading => reading.error || reading.nonFinitePixels));
const expected = presets.length * dprs.length * selected.length * 4;
if (errors.length || failures.length || rows.length !== expected) { console.error(`${failures.length} invalid output cases, ${errors.length} browser errors, ${rows.length}/${expected} cases`); process.exitCode = 1; }
