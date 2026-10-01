// Real play conditions: a QA production build (VITE_QA=1 npm run build, served by vite preview), a headed
// Chrome window at 1470x956 CSS pixels with deviceScaleFactor 2 (ANGLE Metal), a live practice match with
// bots driven through the real input layer, sustained. Records display frame intervals, GPU time per pass
// (timer queries), CPU spans, heap, GC pauses, the machine load and the thermal pressure next to every sample.
//
// node tools/qa/real-perf.mjs <out.json>
//   BASE=http://127.0.0.1:4187  QUALITY=low|medium|high  MODE=battle-royale|deathmatch  DURATION=300
//   GPU=1 (timer queries, default on)  TIMING=1 (CPU spans, default on)  HEADLESS=1  W=1470 H=956 DPR=2
//   TRACE_AT=60,240 (10 s GC traces at those match seconds)  SETTINGS='{"renderScale":1}' (extra saved settings)
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadavg } from 'node:os';

const out = process.argv[2];
if (!out) throw new Error('Usage: node tools/qa/real-perf.mjs <out.json>');
mkdirSync(dirname(out), { recursive: true });
const env = process.env;
const base = env.BASE || 'http://127.0.0.1:4187', quality = env.QUALITY || 'medium', mode = env.MODE || 'deathmatch';
const seconds = Number(env.DURATION || 300), width = Number(env.W || 1470), height = Number(env.H || 956), dpr = Number(env.DPR || 2);
const gpu = env.GPU !== '0', timingOn = env.TIMING !== '0';
const traceAt = (env.TRACE_AT ?? '60').split(',').filter(Boolean).map(Number);
const extraSettings = JSON.parse(env.SETTINGS || '{}');

const thermal = () => { try { return Number(execSync('notifyutil -g com.apple.system.thermalpressurelevel').toString().trim().split(/\s+/).pop()); } catch { return null; } };
const machine = () => ({ load: loadavg().map(n => +n.toFixed(2)), thermal: thermal() });

const browser = await chromium.launch({ headless: env.HEADLESS === '1', channel: 'chrome',
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
  await page.evaluate(() => {
    const q = window.__networkQA, { world, nav, collision, weapons } = q.driver;
    const d = { routeAt: 0, waypoint: null, direct: false, lastJump: 0, lastAction: 0, switchedAt: 0, watchedAt: 0, drop: null, anchor: null, wanderUntil: 0, wanderYaw: 0, yaw: 0 };
    const tap = code => { q.key(code, true); q.key(code, false); };
    const step = () => {
      const i = window.__capivara.inspect(), s = i.snapshot;
      if (!s) return;
      const me = s.actors.find(a => !a.bot), now = s.time;
      if (s.phase !== 'playing' || !me.alive) {
        q.key('KeyW', false); q.key('ShiftLeft', false); q.key('Mouse2', false);
        if (s.phase === 'playing' && s.config.mode === 'battle-royale' && now - d.watchedAt > 12) { tap('Space'); d.watchedAt = now; }
        return;
      }
      if (me.stage !== 'ground') {
        if (me.stage === 'plane') d.drop = null;
        d.drop ||= s.loot.filter(l => l.active && l.kind === 'weapon' && !['pistol', 'machete'].includes(l.weapon) &&
          Math.hypot(l.x - s.zone.nextX, l.z - s.zone.nextZ) < s.zone.nextRadius * .7)
          .sort((a, b) => Math.hypot(a.x - me.pos.x, a.z - me.pos.z) - Math.hypot(b.x - me.pos.x, b.z - me.pos.z))[0] || { x: s.zone.nextX, z: s.zone.nextZ };
        const dx = d.drop.x - me.pos.x, dz = d.drop.z - me.pos.z, far = Math.hypot(dx, dz);
        if (me.stage === 'plane') { if (far < 45 || now > 11) tap('Space'); return; }
        q.look(Math.atan2(-dx, -dz), -.6);
        q.key('KeyW', far > 4);
        if (me.stage === 'falling' && me.pos.y < 25) tap('Space');
        return;
      }
      if (!i.clientInput.locked) q.activate();
      const eye = { ...me.pos, y: me.pos.y + (me.crouch ? 1.02 : 1.62) };
      const enemies = s.actors.filter(a => a.bot && a.alive && a.stage === 'ground')
        .map(a => ({ a, distance: Math.hypot(a.pos.x - me.pos.x, a.pos.z - me.pos.z) })).sort((a, b) => a.distance - b.distance);
      const enemy = enemies.find(e => e.distance < 55 && collision.hasLineOfSight(eye, { ...e.a.pos, y: e.a.pos.y + 1.1 }, world));
      const held = me.weapons[me.slot], def = held && weapons.WEAPONS[held.id];
      if (s.config.mode !== 'corrente' && !me.swimming && now - d.switchedAt > 2) {
        const best = me.weapons.find(w => w.box < 2 && (w.ammo > 0 || w.reserve > 0));
        if (best && best !== held) { tap(`Digit${best.box + 1}`); d.switchedAt = now; }
      }
      if (held && held.ammo === 0 && held.reserve > 0 && !me.reloadUntil) tap('KeyR');
      if (now - d.lastAction > 1) {
        if (!document.querySelector('#prompt')?.hidden) tap('KeyF');
        if (me.hp < 65) { tap('Digit6'); tap('Digit5'); } else if (me.armor < 30) tap('Digit8');
        d.lastAction = now;
      }
      const loot = s.config.mode !== 'corrente' && !me.weapons.some(w => w.box < 2 && (w.ammo || w.reserve))
        ? s.loot.filter(l => l.active && l.kind === 'weapon' && !['pistol', 'machete'].includes(l.weapon))
          .sort((a, b) => Math.hypot(a.x - me.pos.x, a.z - me.pos.z) - Math.hypot(b.x - me.pos.x, b.z - me.pos.z))[0] : null;
      const outside = s.config.mode === 'battle-royale' && Math.hypot(me.pos.x - s.zone.nextX, me.pos.z - s.zone.nextZ) > s.zone.nextRadius - 5;
      const goal = outside ? { x: s.zone.nextX, y: 0, z: s.zone.nextZ } : loot || enemy?.a.pos || enemies[0]?.a.pos;
      if (goal && now >= d.routeAt) {
        d.waypoint = nav.navigationWaypoint(world, me.pos, goal, s.config.mode !== 'battle-royale') || goal;
        d.direct = nav.walkableSegment(world, me.pos, goal, s.config.mode !== 'battle-royale');
        d.routeAt = now + .8;
      }
      const fighting = !!enemy && !outside && !loot && !!def && (d.direct || enemy.distance < 9) && (enemy.distance < 30 || !def.melee);
      const target = fighting ? { ...enemy.a.pos, y: enemy.a.pos.y + 1.25 } : d.waypoint ? { ...d.waypoint, y: eye.y } : null;
      if (!d.anchor || Math.hypot(me.pos.x - d.anchor.x, me.pos.z - d.anchor.z) > 1.5) d.anchor = { x: me.pos.x, z: me.pos.z, at: now };
      if (!fighting && goal && now - d.anchor.at > 4 && !(d.wanderUntil > now)) { d.wanderUntil = now + 2.5; d.wanderYaw = Math.random() * Math.PI * 2; d.anchor.at = now; }
      if (d.wanderUntil > now && !fighting) { q.look(d.wanderYaw, 0); if (now - d.lastJump > .7) { tap('Space'); d.lastJump = now; } }
      else if (target) {
        const dx = target.x - me.pos.x, dz = target.z - me.pos.z;
        // Turn toward the target over a few ticks like a mouse would, instead of snapping.
        const want = Math.atan2(-dx, -dz), turn = Math.atan2(Math.sin(want - d.yaw), Math.cos(want - d.yaw));
        d.yaw += turn * .45;
        q.look(d.yaw, Math.atan2(target.y - eye.y, Math.hypot(dx, dz)));
      }
      q.key('KeyW', !!goal && (!fighting || enemy.distance > (def.melee ? 1.3 : 9)));
      q.key('ShiftLeft', !!goal && !fighting);
      q.key('Mouse2', fighting && !def.melee && enemy.distance > 12);
      if (fighting && enemy.distance < (def.melee ? 2 : def.range)) q.fire();
      if (goal && Math.hypot(me.velocity.x, me.velocity.z) < .2 && now - d.lastJump > 2) { tap('Space'); d.lastJump = now; }
    };
    window.__perfDriver = setInterval(() => { try { step(); } catch (error) { console.error('driver', error.message); } }, 50);
  });

  const cdp = await context.newCDPSession(page);
  const started = Date.now(), samples = [], gcTraces = [];
  let rafFrom = await page.evaluate(() => window.__rafTimes.count), lastRendered = await page.evaluate(() => window.__capivara.inspect().renderedFrames);
  await page.evaluate(() => { window.__capivara.resetPerf(); window.__capivara.gpu(true); });
  const traced = new Set();
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
        stats: i.renderer, gpu: window.__capivara.gpu(true), spans, longTasks: t.longTasks.map(task => Math.round(task.duration)),
        heapMB: heap ? +(heap / 1048576).toFixed(1) : null, drawingBuffer: (() => { const c = document.querySelector('#game'); return [c.width, c.height]; })() };
    }, rafFrom);
    rafFrom += sample.times.length;
    const intervals = []; for (let k = 1; k < sample.times.length; k++) intervals.push(+(sample.times[k] - sample.times[k - 1]).toFixed(2));
    const cpu = {}; for (const [name, values] of Object.entries(sample.spans)) cpu[name] = { n: values.length, sum: +values.reduce((a, b) => a + b, 0).toFixed(2), max: +Math.max(...values).toFixed(2) };
    samples.push({ t: +elapsed.toFixed(1), ...machine(), intervals, renderedFrames: sample.rendered - lastRendered, phase: sample.phase, stage: sample.stage, alive: sample.alive,
      alivePlayers: sample.alivePlayers, pos: sample.pos, draws: sample.stats?.drawCalls, triangles: sample.stats?.triangles, gpu: sample.gpu, cpu, longTasks: sample.longTasks, heapMB: sample.heapMB, drawingBuffer: sample.drawingBuffer });
    lastRendered = sample.rendered;
    if (samples.length % 30 === 0) console.log(JSON.stringify({ t: Math.round(elapsed), phase: sample.phase, stage: sample.stage, thermal: samples.at(-1).thermal, load: samples.at(-1).load[0],
      fps: +(samples.slice(-30).reduce((a, s) => a + s.renderedFrames, 0) / 30).toFixed(1), gpu: sample.gpu.total?.mean, buffer: sample.drawingBuffer }));
    if (sample.phase === 'results') { console.log('match reached results at', Math.round(elapsed), 's'); break; }
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
  await page.evaluate(() => clearInterval(window.__perfDriver));
  writeFileSync(out, JSON.stringify({ measuredAt: new Date().toISOString(), base, quality, mode, seconds, viewport: { width, height, dpr }, gpu: gpuName,
    gpuTiming: gpu, cpuTiming: timingOn, headless: env.HEADLESS === '1', settings: extraSettings, menuMs: Math.round(menuMs), firstFrameMs: Math.round(firstFrameMs), errors, resources, gcTraces, samples }));
  console.log('wrote', out);
} finally { await browser.close(); }
