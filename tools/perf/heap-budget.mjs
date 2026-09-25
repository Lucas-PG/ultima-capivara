import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// Non-timed memory evidence. Never force GC or infer frame-time performance.
const [sourceHash, base = 'http://127.0.0.1:5182/', secondsArg = '60'] = process.argv.slice(2);
const seconds = Number(secondsArg), budgetBytes = 250_000_000;
if (sourceHash !== execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()) {
  throw new Error('Pass the full hash of the frozen checkout used as cwd and Vite root');
}
if (execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim()) throw new Error('Tracked source must be clean');
if (!(seconds >= 2 && seconds <= 600)) throw new Error('Sample length must be 2..600 seconds');
const out = resolve('output/m1', `heap-${sourceHash.slice(0, 7)}`);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=metal', '--enable-precise-memory-info'] });
const errors = [], fixed = [], matches = [];
async function open(preset) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await context.addInitScript(quality => {
    localStorage.setItem('uc-onboarded', '1');
    localStorage.setItem('uc-v2-settings', JSON.stringify({ graphics: quality, frameLimit: 60 }));
  }, preset);
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    let body = await response.text();
    const from = 'const activeLimit = input.locked ? settings.frameLimit : ended ? 30 : 10;';
    if (!body.includes(from) || !body.includes('if (input.locked || dirtyFrame || ended) {')) throw new Error('Active-render injection mismatch');
    body = body.replace(from, 'const activeLimit = 60;').replace('if (input.locked || dirtyFrame || ended) {', 'if (true) {');
    await route.fulfill({ response, body: body + `
import { installQa as installMemoryQa } from '/tests/visual/qa-hook.ts';
import { DEFAULT_CONFIG as MEMORY_CONFIG } from '/src/shared/types.ts';
installMemoryQa({world,ui,input,settings,begin:async()=>{ensureRenderer();await rendererReady;return renderer;}});
window.__memoryProbe={
  start(){startPractice({...MEMORY_CONFIG,mode:'deathmatch'},profile);},
  leave(){leave();},
  read(){return {screen:ui.screen,loading,actors:snapshot?.actors.length??0,worker:!!worker,
    matchId:snapshot?.matchId??null,time:snapshot?.time??null,frames:renderedFrames,
    resources:renderer?{...renderer.gl.info.memory}:null,stats:renderer?.stats,
    usedJSHeapSize:performance.memory?.usedJSHeapSize??null};}
};` });
  });
  await page.goto(base);
  await page.waitForFunction(() => !!window.__memoryProbe);
  return { context, page, cdp: await context.newCDPSession(page) };
}
async function sample(page, cdp) {
  return { at: new Date().toISOString(), ...await page.evaluate(() => window.__memoryProbe.read()),
    cdp: await cdp.send('Runtime.getHeapUsage') };
}
try {
  for (const preset of ['low', 'medium', 'high']) {
    const { context, page, cdp } = await open(preset);
    await page.evaluate(async () => {
      await window.__capyQA.start(); window.__capyQA.actors(16);
      await window.__capyQA.pose('plaza'); window.__capyQA.loop(true);
    });
    const samples = [];
    for (let i = 0; i < 5; i++) { await page.waitForTimeout(1000); samples.push(await sample(page, cdp)); }
    await page.evaluate(() => window.__capyQA.loop(false));
    fixed.push({ preset, actors: 16, pose: 'plaza', samples, stats: await page.evaluate(() => window.__capyQA.stats()) });
    await context.close();
  }
  const { context, page, cdp } = await open('medium');
  for (let match = 1; match <= 3; match++) {
    await page.evaluate(() => window.__memoryProbe.start());
    await page.waitForFunction(() => { const s = window.__memoryProbe.read(); return !s.loading && s.actors === 8 && s.screen === 'game'; }, null, { timeout: 120000 });
    const samples = [];
    const step = Math.min(5, seconds);
    for (let elapsed = 0; elapsed < seconds; elapsed += step) {
      await page.waitForTimeout(Math.min(step, seconds - elapsed) * 1000);
      samples.push(await sample(page, cdp));
    }
    await page.evaluate(() => window.__memoryProbe.leave());
    await page.waitForTimeout(1000);
    const afterLeave = await sample(page, cdp);
    if (afterLeave.worker || afterLeave.actors || afterLeave.screen !== 'home') throw new Error('Leaving did not clear match state');
    matches.push({ match, mode: 'deathmatch', preset: 'medium', actors: 8, seconds, samples, afterLeave });
    console.log(JSON.stringify({ completedMatch: match, afterLeave }));
  }
  await context.close();
  const samples = [...fixed.flatMap(row => row.samples), ...matches.flatMap(row => row.samples)];
  const measured = samples.every(row => Number.isFinite(row.usedJSHeapSize) && row.usedJSHeapSize > 0);
  const peakBytes = Math.max(...samples.map(row => row.usedJSHeapSize ?? 0));
  const minima = matches.map(row => Math.min(...row.samples.map(s => s.usedJSHeapSize ?? Infinity)));
  const report = { sourceHash, browser: browser.version(), viewport: '1280x720', dpr: 1,
    protocol: { timedRun: false, forcedGc: false, exactBudgetBytes: budgetBytes, restart: 'leave to menu then practice; same renderer',
      note: 'Precise performance.memory is the budget metric. CDP fields are separate diagnostics. Samples do not prove full-match stability or a leak-free heap.' },
    measured, peakBytes, budgetPass: measured && peakBytes <= budgetBytes, matchMinimaBytes: minima,
    minimaGrowthBytes: minima[2] - minima[0], fixed, matches, errors };
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ sourceHash, measured, peakBytes, budgetPass: report.budgetPass, minima, errors, out }));
  if (!report.budgetPass || errors.length) process.exitCode = 1;
} finally { await browser.close(); }
