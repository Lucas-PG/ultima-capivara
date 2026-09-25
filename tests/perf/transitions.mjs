import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const [label, url] = process.argv.slice(2);
if (!label || !url) throw new Error('Usage: node tests/perf/transitions.mjs <label> <url>');
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: [
  '--use-gl=angle', '--use-angle=metal', '--enable-precise-memory-info',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.setDefaultTimeout(120_000);
await page.addInitScript(() => localStorage.setItem('uc-v2-settings', JSON.stringify({ graphics: 'medium', frameLimit: 60 })));
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/src/main.ts*', async route => {
  const response = await route.fetch();
  let body = await response.text();
  const limit = 'const activeLimit = input.locked ? settings.frameLimit : ended ? 30 : 10;';
  const gate = 'if (input.locked || dirtyFrame || ended) {';
  if (!body.includes(limit) || !body.includes(gate)) throw new Error('Renderer gate changed; update trace injection');
  body = body.replace(limit, 'const activeLimit = 60;').replace(gate, 'if (true) {');
  body += `\nconst __traceCpu = [], __traceRaf = [], __traceEquip = [], __traceLong = [], __traceGc = []; let __traceLastRaf = 0, __traceWrapped = false;
const __traceEntryTypes = globalThis.PerformanceObserver?.supportedEntryTypes ?? [];
const __traceSupported = { longtask: __traceEntryTypes.includes('longtask'), gc: __traceEntryTypes.includes('gc') };
if (__traceSupported.longtask) new PerformanceObserver(list => { for (const entry of list.getEntries()) __traceLong.push({at:entry.startTime,ms:entry.duration}); }).observe({type:'longtask',buffered:true});
if (__traceSupported.gc) new PerformanceObserver(list => { for (const entry of list.getEntries()) __traceGc.push({at:entry.startTime,ms:entry.duration}); }).observe({type:'gc',buffered:true});
requestAnimationFrame(function __traceTick(now) {
  if (__traceLastRaf) __traceRaf.push({at: now, ms: now - __traceLastRaf});
  __traceLastRaf = now; requestAnimationFrame(__traceTick);
});
window.__qaTrace = {
  graphics() { return settings.graphics; },
  observerSupport() { return __traceSupported; },
  arm() {
    if (!renderer) throw new Error('Renderer not ready');
    if (__traceWrapped) return;
    const update = renderer.update.bind(renderer);
    renderer.update = frame => { const at = performance.now(); update(frame); __traceCpu.push({at, ms: performance.now() - at}); };
    const equip = renderer.weaponView.update.bind(renderer.weaponView);
    renderer.weaponView.update = (...args) => { const at = performance.now(); equip(...args); __traceEquip.push({at, ms: performance.now() - at}); };
    __traceWrapped = true;
  },
  reset() { __traceCpu.length = 0; __traceRaf.length = 0; __traceEquip.length = 0; __traceLong.length = 0; __traceGc.length = 0; },
  sample() { return { cpu: [...__traceCpu], raf: [...__traceRaf], equip: [...__traceEquip], longTasks: [...__traceLong], gc: [...__traceGc], frames: renderedFrames, stats: renderer?.stats }; },
  setWeapon(id) {
    const at = performance.now();
    if (!snapshot) throw new Error('No snapshot');
    worker?.terminate(); worker = null;
    const me = snapshot.actors.find(a => a.id === playerId);
    me.stage = 'ground'; me.alive = true; me.ads = false;
    me.weapons = [{id, ammo: 20, reserve: 80, rarity: 0}]; me.slot = 0;
    dirtyFrame = true;
    return performance.now() - at;
  },
  shot() {
    const at = performance.now();
    const me = snapshot.actors.find(a => a.id === playerId);
    renderer.event({type:'shot',id:9999,actor:playerId,weapon:me.weapons[me.slot].id,
      origin:{...me.pos},end:{x:me.pos.x,y:me.pos.y+1.5,z:me.pos.z-12},hit:false});
    return performance.now() - at;
  },
};`;
  await route.fulfill({ response, body });
});

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (await page.evaluate(() => window.__qaTrace?.graphics()) !== 'medium') throw new Error('Medium preset was not applied');
  await page.locator('[data-do="practice"]').click();
  await page.waitForFunction(() => window.__qaTrace && window.__capivara?.inspect()?.snapshot, { timeout: 90_000 });
  await page.waitForFunction(() => window.__capivara.inspect().renderedFrames > 10, { timeout: 90_000 });
  await page.evaluate(() => { window.__qaTrace.arm(); window.__qaTrace.reset(); });
  const transition = await page.evaluate(async () => {
    const stages = []; let last = '', groundAt = 0;
    const began = performance.now();
    while (performance.now() - began < 60_000) {
      const state = window.__capivara.inspect(), me = state.snapshot?.actors.find(a => a.id === 'practice');
      if (me?.stage !== last) { stages.push({ at: performance.now(), stage: me?.stage, frames: state.renderedFrames }); last = me?.stage; }
      if (me?.stage === 'ground') { groundAt = performance.now(); break; }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    return { stages, groundAt, ...window.__qaTrace.sample() };
  });
  if (!transition.groundAt || transition.frames <= transition.stages[0].frames) throw new Error('Transition lacked active rendered frames');
  await page.evaluate(() => window.__qaTrace.setWeapon('pistol'));
  await page.waitForTimeout(300);
  const shotHandlerMs = await page.evaluate(() => { window.__qaTrace.reset(); return window.__qaTrace.shot(); });
  await page.waitForTimeout(1500);
  const firstShot = await page.evaluate(() => window.__qaTrace.sample());
  const swaps = [];
  const sweeps = Number(process.env.SWEEPS || 1);
  for (let sweep = 1; sweep <= sweeps; sweep++) for (const weapon of ['pistol', 'smg', 'm4', 'shotgun', 'dmr', 'sniper', 'machete', 'slingshot']) {
    await page.evaluate(() => window.__qaTrace.reset());
    const handlerMs = await page.evaluate(id => window.__qaTrace.setWeapon(id), weapon);
    await page.waitForTimeout(1000);
    swaps.push({ sweep, weapon, handlerMs, ...await page.evaluate(() => window.__qaTrace.sample()) });
  }
  const gpu = await page.evaluate(() => {
    const gl = document.querySelector('#game')?.getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return { vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl?.getParameter(gl.VENDOR),
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) };
  });
  const summarize = (list) => {
    const ms = list.map(x => x.ms).sort((a, b) => a - b);
    return { count: ms.length, p95: +(ms[Math.floor((ms.length - 1) * .95)] || 0).toFixed(2),
      max: +(ms.at(-1) || 0).toFixed(2), over50: ms.filter(n => n > 50).length };
  };
  const observerSupport = await page.evaluate(() => window.__qaTrace.observerSupport());
  const summary = sample => ({ cpu: summarize(sample.cpu), raf: summarize(sample.raf), equip: summarize(sample.equip),
    longTasks: observerSupport.longtask ? summarize(sample.longTasks) : null,
    gc: observerSupport.gc ? summarize(sample.gc) : null, frames: sample.frames, stats: sample.stats });
  const landingWindow = list => list.filter(x => Math.abs(x.at - transition.groundAt) <= 1000);
  const output = { label, url, at: new Date().toISOString(), browserChannel: 'chrome', browser: browser.version(), gpu, errors,
    launchFlags: ['ANGLE Metal', 'precise memory', 'background timers unthrottled'],
    graphicsPreset: await page.evaluate(() => window.__qaTrace.graphics()), observerSupport,
    forcedRendering: true, viewport: '1280x720', stages: transition.stages,
    transition: summary(transition), landing: { cpu: summarize(landingWindow(transition.cpu)), raf: summarize(landingWindow(transition.raf)) },
    firstShot: { handlerMs: shotHandlerMs, ...summary(firstShot) },
    swaps: swaps.map(row => ({ sweep: row.sweep, weapon: row.weapon, handlerMs: row.handlerMs, ...summary(row) })) };
  const file = `/Users/lucas_gaspe/dev/capivara-team/reviews/forja-${label}-active.json`;
  await writeFile(file, JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output));
} finally { await browser.close(); }
