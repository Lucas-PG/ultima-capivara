// Headless live-match driver for playtests and captures (needs a VITE_QA=1 dev server).
// node tools/qa/play.mjs <outDir> <mode> '<steps json>'
// Full rounds: ["match",timeoutSeconds,captureEverySeconds] ["rematch"]. Reports record natural results.
// Steps: ["wait",s] ["key","KeyW",s?] ["tap","Digit3"] ["look",yaw,pitch] ["fire",n] ["shot","name"] ["eval","js"] ["hunt",s,every] ["defend",s,every,ads?]
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const [out, mode = 'deathmatch', stepsJson = '[]'] = process.argv.slice(2);
const steps = JSON.parse(stepsJson);
if (!out) throw new Error('Give a worktree-local output directory.');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.BUNDLED ? {} : { channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const size = { width: Math.min(1280, Number(process.env.W || 1280)), height: Math.min(720, Number(process.env.H || 720)) };
const page = await browser.newPage({ viewport: size, ...(process.env.VIDEO ? { recordVideo: { dir: process.env.VIDEO, size } } : {}) });
const errors = [];
page.on('pageerror', e => { errors.push(e.message); console.error('pageerror', e.message); });
try {
if (['low', 'medium', 'high'].includes(process.env.QUALITY)) await page.addInitScript(graphics => {
  const saved = JSON.parse(localStorage.getItem('uc-v2-settings') || '{}');
  localStorage.setItem('uc-v2-settings', JSON.stringify({ ...saved, graphics }));
}, process.env.QUALITY);
await page.goto(`${process.env.BASE || 'http://127.0.0.1:5173'}/?networkQa=1&calm${process.env.QUERY || ''}`);
await page.locator(`[data-mode="${mode}"]`).click();
await page.locator('[data-do="practice"]').click();
await page.waitForFunction(() => { const s = window.__capivara?.inspect(); return s?.snapshot && !s.renderState.loading; }, null, { timeout: 90000 });
await page.evaluate(() => { window.__networkQA.activate(); window.__networkQA.key('KeyH', true); window.__networkQA.key('KeyH', false); });
const me = () => page.evaluate(() => { const i = window.__capivara.inspect(); const a = i.snapshot.actors.find(x => !x.bot); return { hp: a.hp, alive: a.alive, slot: a.slot, weapons: a.weapons.map(w => `${w.box}:${w.id}:${w.ammo}/${w.reserve}`), pos: a.pos, kills: a.kills }; });
let matchNumber = 0;
// Plays through the real input layer and worker, with no health, damage or time overrides.
// Navigation only chooses where to walk; the host still resolves every action.
async function fullMatch(timeout, captureEvery) {
  const number = ++matchNumber, started = Date.now(), samples = [], milestones = new Set(), stalls = [], profiled = new Set();
  let nextLog = 0, nextCapture = 0, lastSample = 0, index = 0;
  await page.evaluate(async () => {
    const [{ createWorld }, nav, collision, weapons] = await Promise.all([
      import('/src/shared/world.ts'), import('/src/shared/navigation.ts'), import('/src/shared/collision.ts'), import('/src/shared/weapons.ts'),
    ]);
    window.__playDriver = { world: createWorld(), nav, collision, weapons, routeAt: 0, waypoint: null, lastJump: 0, lastAction: 0, switchedAt: 0, watchedAt: 0, drop: null, anchor: null, wanderUntil: 0, wanderYaw: 0 };
  });
  try {
  while ((Date.now() - started) / 1000 < timeout) {
    const step = page.evaluate(() => {
      const d = window.__playDriver, i = window.__capivara.inspect(), s = i.snapshot;
      if (!s) throw new Error('The match disappeared before results');
      const me = s.actors.find(a => !a.bot), now = s.time, input = window.__networkQA;
      const tap = code => { input.key(code, true); input.key(code, false); };
      const hold = (code, on) => input.key(code, on);
      const state = { time: +now.toFixed(1), phase: s.phase, alive: me.alive, hp: Math.round(me.hp), stage: me.stage, renderedFrames: i.renderedFrames,
        entrants: s.actors.length, kills: me.kills, deaths: me.deaths, level: me.weaponLevel, remaining: s.remaining, weapon: me.weapons[me.slot]?.id,
        ammo: me.weapons[me.slot]?.ammo, pos: me.pos, supplies: s.supplyDrops?.length || 0,
        storm: s.zone.phase, outside: Math.hypot(me.pos.x - s.zone.x, me.pos.z - s.zone.z) > s.zone.radius,
        spectator: i.spectateId, camera: i.camera, audio: window.__capivara.audio(),
        hud: { hp: document.querySelector('#hpTxt')?.textContent, entrants: document.querySelector('#hAlive')?.textContent, scope: !document.querySelector('#scope-overlay')?.hidden,
          watch: !document.querySelector('#specBar')?.hidden, prompt: !document.querySelector('#prompt')?.hidden },
        results: s.phase === 'results' ? s.results : undefined };
      if (s.phase !== 'playing' || !me.alive) {
        hold('KeyW', false); hold('ShiftLeft', false); hold('Mouse2', false);
        if (s.phase === 'playing' && s.config.mode === 'battle-royale' && now - d.watchedAt > 12) { tap('Space'); d.watchedAt = now; }
        return state;
      }
      if (me.stage !== 'ground') {
        // Drop like a player: leave the plane over a weapon inside the safe zone, then glide to it.
        if (me.stage === 'plane') d.drop = null;
        d.drop ||= s.loot.filter(l => l.active && l.kind === 'weapon' && !['pistol', 'machete'].includes(l.weapon) &&
          Math.hypot(l.x - s.zone.nextX, l.z - s.zone.nextZ) < s.zone.nextRadius * .7)
          .sort((a, b) => Math.hypot(a.x - me.pos.x, a.z - me.pos.z) - Math.hypot(b.x - me.pos.x, b.z - me.pos.z))[0] || { x: s.zone.nextX, z: s.zone.nextZ };
        const dx = d.drop.x - me.pos.x, dz = d.drop.z - me.pos.z, far = Math.hypot(dx, dz);
        if (me.stage === 'plane') { if (far < 45 || now > 11) tap('Space'); return state; }
        input.look(Math.atan2(-dx, -dz), -.6);
        hold('KeyW', far > 4);
        if (me.stage === 'falling' && me.pos.y < 25) tap('Space');
        return state;
      }
      // Reacquire input after respawn. QA lock drives the same controls as pointer lock.
      if (!i.clientInput.locked) input.activate();
      const eye = { ...me.pos, y: me.pos.y + (me.crouch ? 1.02 : 1.62) };
      const enemies = s.actors.filter(a => a.bot && a.alive && a.stage === 'ground')
        .map(a => ({ a, distance: Math.hypot(a.pos.x - me.pos.x, a.pos.z - me.pos.z) })).sort((a, b) => a.distance - b.distance);
      const enemy = enemies.find(e => e.distance < 55 && d.collision.hasLineOfSight(eye, { ...e.a.pos, y: e.a.pos.y + 1.1 }, d.world));
      const held = me.weapons[me.slot], def = held && d.weapons.WEAPONS[held.id];
      if (s.config.mode !== 'corrente' && !me.swimming && now - d.switchedAt > 2) {
        const best = me.weapons.find(w => w.box < 2 && (w.ammo > 0 || w.reserve > 0));
        if (best && best !== held) { tap(`Digit${best.box + 1}`); d.switchedAt = now; }
      }
      if (held && held.ammo === 0 && held.reserve > 0 && !me.reloadUntil) tap('KeyR');
      if (now - d.lastAction > 1) {
        if (!document.querySelector('#prompt')?.hidden) tap('KeyF');
        if (me.hp < 65) { tap('Digit6'); tap('Digit5'); }
        else if (me.armor < 30) tap('Digit8');
        d.lastAction = now;
      }
      const loot = s.config.mode !== 'corrente' && !me.weapons.some(w => w.box < 2 && (w.ammo || w.reserve))
        ? s.loot.filter(l => l.active && l.kind === 'weapon' && !['pistol', 'machete'].includes(l.weapon))
          .sort((a, b) => Math.hypot(a.x - me.pos.x, a.z - me.pos.z) - Math.hypot(b.x - me.pos.x, b.z - me.pos.z))[0] : null;
      const outside = s.config.mode === 'battle-royale' && Math.hypot(me.pos.x - s.zone.nextX, me.pos.z - s.zone.nextZ) > s.zone.nextRadius - 5;
      const goal = outside ? { x: s.zone.nextX, y: 0, z: s.zone.nextZ } : loot || enemy?.a.pos || enemies[0]?.a.pos;
      if (goal && now >= d.routeAt) {
        d.waypoint = d.nav.navigationWaypoint(d.world, me.pos, goal, s.config.mode !== 'battle-royale') || goal;
        d.direct = d.nav.walkableSegment(d.world, me.pos, goal, s.config.mode !== 'battle-royale');
        d.routeAt = now + .8;
      }
      // Seeing across the river does not make its bank a route to the target.
      const fighting = !!enemy && !outside && !loot && !!def && (d.direct || enemy.distance < 9) && (enemy.distance < 30 || !def.melee);
      const target = fighting ? { ...enemy.a.pos, y: enemy.a.pos.y + 1.25 } : d.waypoint ? { ...d.waypoint, y: eye.y } : null;
      // A route the navigation graph does not know (a walled roof terrace, a pier end): wander out like a lost player.
      if (!d.anchor || Math.hypot(me.pos.x - d.anchor.x, me.pos.z - d.anchor.z) > 1.5) d.anchor = { x: me.pos.x, z: me.pos.z, at: now };
      if (!fighting && goal && now - d.anchor.at > 4 && !(d.wanderUntil > now)) { d.wanderUntil = now + 2.5; d.wanderYaw = Math.random() * Math.PI * 2; d.anchor.at = now; }
      if (d.wanderUntil > now && !fighting) { input.look(d.wanderYaw, 0); if (now - d.lastJump > .7) { tap('Space'); d.lastJump = now; } }
      else if (target) {
        const dx = target.x - me.pos.x, dz = target.z - me.pos.z;
        input.look(Math.atan2(-dx, -dz), Math.atan2(target.y - eye.y, Math.hypot(dx, dz)));
      }
      hold('KeyW', !!goal && (!fighting || enemy.distance > (def.melee ? 1.3 : 9)));
      hold('ShiftLeft', !!goal && !fighting);
      hold('Mouse2', fighting && !def.melee && enemy.distance > 12);
      if (fighting && enemy.distance < (def.melee ? 2 : def.range)) input.fire();
      // Free a walker from a small prop using an ordinary jump, never teleportation.
      if (goal && Math.hypot(me.velocity.x, me.velocity.z) < .2 && now - d.lastJump > 2) { tap('Space'); d.lastJump = now; }
      return state;
    });
    // A stall is measured, and its processes sampled, before the round is given up.
    let watchdog, stalledAt = 0;
    const state = await Promise.race([step, new Promise(resolve => { watchdog = setTimeout(resolve, 15000); })]).finally(() => clearTimeout(watchdog)) ?? await (async () => {
      stalledAt = Date.now(); console.error(`stall: no answer from the page for 15 s at ${Math.round((stalledAt - started) / 1000)} s`);
      if (process.env.SAMPLE) for (const kind of ['renderer', 'gpu-process']) try {
        // The busiest helper of that type under this driver's own browser.
        const chrome = execSync(`ps -axo pid,ppid,command | awk '$2 == ${process.pid} && /Chrome/ {print $1}' | head -1`).toString().trim();
        const pid = execSync(`ps -axo pid,ppid,%cpu,command | awk '$2 == ${chrome || 0}' | grep -- '--type=${kind}' | sort -k3 -nr | head -1 | awk '{print $1}'`).toString().trim();
        if (pid) execSync(`sample ${pid} 3 -file ${out}/stall-${stalls.length}-${kind}.txt`, { stdio: 'ignore' });
      } catch (error) { console.error('sampling failed', error.message.split('\n')[0]); }
      const late = await Promise.race([step, new Promise(resolve => setTimeout(resolve, 90000))]);
      if (!late) throw new Error('The live page stopped responding for 105 seconds');
      return late;
    })();
    if (stalledAt) { stalls.push({ at: Math.round((stalledAt - started) / 1000) - 15, seconds: Math.round((Date.now() - stalledAt) / 1000) + 15, time: state.time }); console.error('recovered', JSON.stringify(stalls.at(-1))); }
    if (Date.now() - lastSample > 2000 || state.phase === 'results') {
      if (samples.length % 5 === 0) state.resources = await page.evaluate(() => ({ ...window.__capivara.resources(), heapMB: window.__capivara.perf().heapMB }));
      samples.push(state); lastSample = Date.now();
    }
    // PROFILE_AT=60,240: a 4 s main-thread CPU profile at those match seconds, summarised by self time.
    const profileAt = (process.env.PROFILE_AT || '').split(',').filter(Boolean).map(Number);
    if (profileAt.length && state.phase === 'playing' && profileAt.some(at => state.time >= at && !profiled.has(at))) {
      const at = profileAt.find(at => state.time >= at && !profiled.has(at)); profiled.add(at);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
      const before = await page.evaluate(() => window.__capivara.inspect().renderedFrames);
      await page.waitForTimeout(4000);
      const { profile } = await cdp.send('Profiler.stop');
      const after = await page.evaluate(() => window.__capivara.inspect().renderedFrames);
      const self = new Map(), dt = profile.timeDeltas, total = dt.reduce((a, b) => a + b, 0) / 1000;
      const byId = new Map(profile.nodes.map(n => [n.id, n]));
      profile.samples.forEach((id, i) => { const f = byId.get(id).callFrame, key = `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber + 1}`; self.set(key, (self.get(key) || 0) + dt[i] / 1000); });
      const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${v.toFixed(0).padStart(6)} ms  ${k}`);
      const extra = await page.evaluate(() => ({ perf: window.__capivara.perf(), audio: window.__capivara.audio(), inspect: (() => { const i = window.__capivara.inspect(); return { renderer: i.renderer, pending: i.pending, actors: i.snapshot?.actors.length, loot: i.snapshot?.loot.length }; })() }));
      writeFileSync(`${out}/profile-${number}-${at}.txt`, `match ${number} at ${state.time}s: ${((after - before) / 4).toFixed(1)} fps over ${total.toFixed(0)} ms profiled\n${top.join('\n')}\n${JSON.stringify({ ...extra, perf: { ...extra.perf, longTasks: undefined } })}\n`);
      console.log('profiled', number, at, ((after - before) / 4).toFixed(1), 'fps');
      await cdp.detach();
    }
    const elapsed = (Date.now() - started) / 1000;
    if (elapsed >= nextLog) { console.log(`match-${number}`, JSON.stringify({ elapsed: Math.round(elapsed), ...state, audio: undefined, camera: undefined, results: undefined, resources: samples.findLast(x => x.resources)?.resources })); nextLog += 30; }
    const milestone = state.phase === 'results' ? 'results' : !state.alive ? state.spectator ? 'spectating' : 'death' : state.deaths ? 'respawn' : state.supplies ? 'supply' : state.stage;
    const capture = process.env.CAPTURES !== 'none' && (process.env.CAPTURES !== 'results' || state.phase === 'results');
    if (capture && (!milestones.has(milestone) || elapsed >= nextCapture)) {
      milestones.add(milestone); nextCapture = elapsed + captureEvery;
      if (state.phase === 'results') {
        await page.locator('#vpanel.show').waitFor();
        await page.waitForFunction(() => [...document.querySelectorAll('#vpanel [data-count]')].every(el => el.textContent === el.getAttribute('data-count')));
      }
      // A starved page can take longer than a screenshot allows; the round itself goes on.
      await page.screenshot({ path: `${out}/match-${number}-${String(index++).padStart(2, '0')}-${milestone}.jpg`, type: 'jpeg', quality: 85, timeout: 60000 })
        .catch(error => console.error('screenshot skipped', error.message.split('\n')[0]));
    }
    if (state.phase === 'results') {
      const report = { mode, number, duration: elapsed, errors, stalls, perf: await page.evaluate(() => window.__capivara.perf()), samples, results: state.results };
      writeFileSync(`${out}/match-${number}.json`, JSON.stringify(report, null, 2));
      console.log('completed', JSON.stringify({ mode, number, duration: Math.round(elapsed), results: state.results, perf: report.perf, errors }));
      return;
    }
    await page.waitForTimeout(100);
  }
  } catch (error) {
    writeFileSync(`${out}/match-${number}-incomplete.json`, JSON.stringify({ mode, samples, errors, stalls, failure: error.message }, null, 2));
    throw error;
  }
  writeFileSync(`${out}/match-${number}-incomplete.json`, JSON.stringify({ mode, samples, errors }, null, 2));
  throw new Error(`Match ${number} did not reach results within ${timeout}s`);
}
for (const step of steps) {
  const [kind, a, b] = step;
  if (kind === 'match') { await fullMatch(a || 900, b || 60); continue; }
  if (kind === 'rematch') {
    const previous = await page.evaluate(() => window.__capivara.inspect().snapshot.matchId);
    await page.locator('[data-do=rematch]').click();
    await page.waitForFunction(id => { const i = window.__capivara.inspect(); return i.snapshot?.matchId !== id && !i.renderState.loading; }, previous, { timeout: 90000 });
    await page.evaluate(() => window.__networkQA.activate()); continue;
  }
  if (kind === 'wait') await page.waitForTimeout(a * 1000);
  else if (kind === 'key') { await page.evaluate(c => window.__networkQA.key(c, true), a); await page.waitForTimeout((b ?? .1) * 1000); await page.evaluate(c => window.__networkQA.key(c, false), a); }
  else if (kind === 'tap') { await page.evaluate(c => { window.__networkQA.key(c, true); window.__networkQA.key(c, false); }, a); }
  else if (kind === 'look') await page.evaluate(([y, p]) => { window.__qaYaw = y; window.__qaPitch = p; window.__networkQA.look(y, p); }, [a, b]);
  else if (kind === 'down' || kind === 'up') await page.evaluate(([c, d]) => window.__networkQA.key(c, d), [a, kind === 'down']);
  else if (kind === 'mdown' || kind === 'mup') await page.evaluate(([button, d]) => document.dispatchEvent(new MouseEvent(d ? 'mousedown' : 'mouseup', { button, bubbles: true })), [a, kind === 'mdown']);
  // ["turn", dyaw, seconds, dpitch?]: rotate the view smoothly by dyaw radians.
  else if (kind === 'turn') {
    const n = Math.max(1, Math.round(b * 30));
    for (let i = 0; i < n; i++) { await page.evaluate(([dy, dp]) => { const f = window.__capivara.input?.frame; window.__networkQA.look((window.__qaYaw ??= 0) + dy, (window.__qaPitch ??= 0) + dp); window.__qaYaw += dy; window.__qaPitch += dp; }, [a / n, (step[3] ?? 0) / n]); await page.waitForTimeout(33); }
  }
  else if (kind === 'fire') for (let i = 0; i < a; i++) { await page.evaluate(() => window.__networkQA.fire()); await page.waitForTimeout(90); }
  else if (kind === 'shot') await page.screenshot({ path: `${out}/${a}.png` });
  else if (kind === 'me') console.log(a || 'me', JSON.stringify(await me()));
  else if (kind === 'eval') console.log(JSON.stringify(await page.evaluate(a)));
  // ["spectate", maximumSeconds=900, captureEvery=30]: watch a complete match.
  // The QA damage removes only the observer; bots use the ordinary worker clock.
  else if (kind === 'spectate') {
    const samples = [], end = Date.now() + (a ?? 900) * 1000; let next = 0, frame = 0;
    while (Date.now() < end) {
      const sample = await page.evaluate(() => {
        const i = window.__capivara.inspect(), s = i.snapshot, me = s.actors.find(x => !x.bot);
        if (me?.alive && s.time > 4) window.__capivara.qaDamage(me.id, 10000);
        return { time: s.time, phase: s.phase, spectateId: i.spectateId, remaining: s.remaining,
          actors: s.actors.filter(x => x.bot).map(x => ({ id: x.id, pos: x.pos, hp: x.hp, kills: x.kills, deaths: x.deaths,
            swimming: x.swimming, alive: x.alive, weapon: x.weapons[x.slot]?.id })), perf: window.__capivara.perf() };
      });
      samples.push(sample);
      if (Date.now() >= next || sample.phase === 'results') {
        writeFileSync(`${out}/spectate.json`, JSON.stringify(samples) + '\n');
        await page.screenshot({ path: `${out}/spectate-${frame++}.jpg`, quality: 80 });
        console.log('spectate', sample.time.toFixed(1), sample.phase, sample.spectateId, sample.remaining);
        next = Date.now() + (b ?? 30) * 1000;
        if (sample.spectateId && sample.phase !== 'results') await page.evaluate(() => { window.__networkQA.key('Space', true); window.__networkQA.key('Space', false); });
      }
      if (sample.phase === 'results') break;
      await page.waitForTimeout(1000);
    }
    writeFileSync(`${out}/spectate.json`, JSON.stringify(samples) + '\n');
    if (samples.at(-1)?.phase !== 'results') throw new Error('Spectated match did not finish before its time limit');
  }
  // ["defend", seconds, shotEvery, ads?]: stand still, track the nearest living bot (head height), fire bursts when within 35 m.
  else if (kind === 'defend') {
    const end = Date.now() + a * 1000; let next = Date.now() + (b ?? 1e9) * 1000, frame = 0;
    if (step[3]) await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true })));
    while (Date.now() < end) {
      const r = await page.evaluate(() => {
        const i = window.__capivara.inspect(), me = i.snapshot.actors.find(x => !x.bot);
        if (!me?.alive) return { dead: true };
        let best = null, bd = 1e9;
        for (const o of i.remoteActors.length ? i.remoteActors : i.snapshot.actors) {
          const t = i.snapshot.actors.find(x => x.id === o.id);
          if (!t || !t.bot || !t.alive) continue;
          const d = Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z);
          if (d < bd) { bd = d; best = o; }
        }
        if (!best) return { none: true };
        const dx = best.pos.x - me.pos.x, dz = best.pos.z - me.pos.z, dy = best.pos.y + 1.2 - (me.pos.y + 1.62);
        window.__networkQA.look(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
        if (bd < 35) window.__networkQA.fire();
        return { d: Math.round(bd) };
      });
      if (Date.now() >= next) { await page.screenshot({ path: `${out}/defend-${frame++}.png` }); next += b * 1000; }
      await page.waitForTimeout(70);
      if (r.none || r.dead) await page.waitForTimeout(300);
    }
    if (step[3]) await page.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true })));
    console.log('defend', JSON.stringify(await me()));
  }
  // ["hunt", seconds, shotEvery]: aim at the nearest living bot, close in, fire; screenshot every shotEvery s.
  else if (kind === 'hunt') {
    const end = Date.now() + a * 1000; let next = Date.now() + (b ?? 1e9) * 1000, frame = 0;
    while (Date.now() < end) {
      const r = await page.evaluate(() => {
        const i = window.__capivara.inspect(), me = i.snapshot.actors.find(x => !x.bot);
        if (!me?.alive) { window.__networkQA.key('KeyW', false); return { dead: true }; }
        const eye = me.pos.y + 1.55;
        let best = null, bd = 1e9;
        for (const o of i.remoteActors.length ? i.remoteActors : i.snapshot.actors) {
          const t = i.snapshot.actors.find(x => x.id === o.id);
          if (!t || !t.bot || !t.alive) continue;
          const d = Math.hypot(o.pos.x - me.pos.x, o.pos.z - me.pos.z);
          if (d < bd) { bd = d; best = o; }
        }
        if (!best) return { none: true };
        const dx = best.pos.x - me.pos.x, dz = best.pos.z - me.pos.z, dy = best.pos.y + 1.0 - eye;
        const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
        window.__networkQA.look(yaw, pitch);
        window.__networkQA.key('KeyW', bd > 9);
        if (bd < 45) window.__networkQA.fire();
        return { d: Math.round(bd), hp: Math.round(me.hp), kills: me.kills, deaths: me.deaths };
      });
      if (Date.now() >= next) { await page.screenshot({ path: `${out}/hunt-${frame++}.png` }); next += b * 1000; }
      await page.waitForTimeout(80);
      if (r.none) await page.waitForTimeout(300);
    }
    await page.evaluate(() => window.__networkQA.key('KeyW', false));
    console.log('hunt', JSON.stringify(await me()));
  }
}
await page.close();
if (errors.length) process.exitCode = 1;
if (process.env.VIDEO) console.log('video', await page.video()?.path());
} finally { await browser.close(); }
