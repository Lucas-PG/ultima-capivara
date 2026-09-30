// Headless live-match driver for playtests and captures (needs a VITE_QA=1 dev server).
// node tools/qa/play.mjs <outDir> <mode> '<steps json>'
// Full rounds: ["match",timeoutSeconds,captureEverySeconds] ["rematch"]. Reports record natural results.
// Steps: ["wait",s] ["key","KeyW",s?] ["tap","Digit3"] ["look",yaw,pitch] ["fire",n] ["shot","name"] ["eval","js"] ["hunt",s,every] ["defend",s,every,ads?]
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const [out, mode = 'deathmatch', stepsJson = '[]'] = process.argv.slice(2);
const steps = JSON.parse(stepsJson);
if (!out) throw new Error('Give a worktree-local output directory.');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.BUNDLED ? {} : { channel: 'chrome', args: ['--use-gl=angle', '--use-angle=metal'] });
const size = { width: 1280, height: 720 };
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
  const number = ++matchNumber, started = Date.now(), samples = [], milestones = new Set();
  let nextLog = 0, nextCapture = 0, lastSample = 0, index = 0;
  await page.evaluate(async () => {
    const [{ createWorld }, nav, collision, weapons] = await Promise.all([
      import('/src/shared/world.ts'), import('/src/shared/navigation.ts'), import('/src/shared/collision.ts'), import('/src/shared/weapons.ts'),
    ]);
    window.__playDriver = { world: createWorld(), nav, collision, weapons, routeAt: 0, waypoint: null, lastJump: 0, lastAction: 0, switchedAt: 0, watchedAt: 0, drop: null, anchor: null, wanderUntil: 0, wanderYaw: 0 };
  });
  try {
  while ((Date.now() - started) / 1000 < timeout) {
    let watchdog;
    const state = await Promise.race([page.evaluate(() => {
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
    }), new Promise((_, reject) => { watchdog = setTimeout(() => reject(new Error('The live page stopped responding for 15 seconds')), 15000); })]).finally(() => clearTimeout(watchdog));
    if (Date.now() - lastSample > 2000 || state.phase === 'results') { samples.push(state); lastSample = Date.now(); }
    const elapsed = (Date.now() - started) / 1000;
    if (elapsed >= nextLog) { console.log(`match-${number}`, JSON.stringify({ elapsed: Math.round(elapsed), ...state, audio: undefined, camera: undefined, results: undefined })); nextLog += 30; }
    const milestone = state.phase === 'results' ? 'results' : !state.alive ? state.spectator ? 'spectating' : 'death' : state.deaths ? 'respawn' : state.supplies ? 'supply' : state.stage;
    const capture = process.env.CAPTURES !== 'none' && (process.env.CAPTURES !== 'results' || state.phase === 'results');
    if (capture && (!milestones.has(milestone) || elapsed >= nextCapture)) {
      milestones.add(milestone); nextCapture = elapsed + captureEvery;
      if (state.phase === 'results') {
        await page.locator('#vpanel.show').waitFor();
        await page.waitForFunction(() => [...document.querySelectorAll('#vpanel [data-count]')].every(el => el.textContent === el.getAttribute('data-count')));
      }
      await page.screenshot({ path: `${out}/match-${number}-${String(index++).padStart(2, '0')}-${milestone}.jpg`, type: 'jpeg', quality: 85 });
    }
    if (state.phase === 'results') {
      const report = { mode, number, duration: elapsed, errors, perf: await page.evaluate(() => window.__capivara.perf()), samples, results: state.results };
      writeFileSync(`${out}/match-${number}.json`, JSON.stringify(report, null, 2));
      console.log('completed', JSON.stringify({ mode, number, duration: Math.round(elapsed), results: state.results, perf: report.perf, errors }));
      return;
    }
    await page.waitForTimeout(100);
  }
  } catch (error) {
    writeFileSync(`${out}/match-${number}-incomplete.json`, JSON.stringify({ mode, samples, errors, failure: error.message }, null, 2));
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
} finally { await page.close(); await browser.close(); }
if (errors.length) process.exitCode = 1;
if (process.env.VIDEO) console.log('video', await page.video()?.path());
